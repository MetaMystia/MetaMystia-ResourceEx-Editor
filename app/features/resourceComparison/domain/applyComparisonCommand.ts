import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

import type {
	IComparisonCommand,
	IComparisonCommandApplicationContext,
	IComparisonCommandApplicationResult,
	IComparisonCommandChange,
	IComparisonCommandConflict,
	IComparisonContentSnapshot,
	IComparisonInverseCommand,
	IComparisonNode,
	TComparisonExecutableCommandKind,
	TComparisonPathSegment,
} from './contracts';

export interface IComparisonNodeChangeResult {
	change?: IComparisonCommandChange;
	error?: IComparisonCommandConflict;
	next: IComparisonContentSnapshot;
}

export interface IComparisonFieldValueResult {
	error?: string;
	resourcePack: ResourceEx;
}

interface IParsedArraySelector {
	property: string;
	value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => cloneValue(item)) as T;
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
		) as T;
	}
	return value;
}

export function cloneComparisonContentSnapshot(
	snapshot: IComparisonContentSnapshot
): IComparisonContentSnapshot {
	return {
		files: new Map(snapshot.files),
		folders: [...snapshot.folders],
		hasLicenseFile: snapshot.hasLicenseFile,
		license: snapshot.license,
		resourcePack: {
			...cloneValue(snapshot.resourcePack),
			gifts: cloneValue(snapshot.resourcePack.gifts ?? []),
		},
	};
}

function parseStableKeySelector(segment: string): IParsedArraySelector | null {
	const match = /^([^=]+)=(number|string):(.*)$/s.exec(segment);
	if (!match) return null;
	const [, property, type, rawValue] = match;
	if (!property || rawValue === undefined) return null;
	if (type === 'number') {
		const value = Number(rawValue);
		return Number.isFinite(value) ? { property, value } : null;
	}
	return { property, value: rawValue };
}

function parseSetValueSelector(segment: string): unknown {
	if (!segment.startsWith('value=')) return undefined;
	const token = segment.slice('value='.length);
	if (token === 'null') return null;
	const separatorIndex = token.indexOf(':');
	if (separatorIndex < 0) return undefined;
	try {
		return JSON.parse(token.slice(separatorIndex + 1));
	} catch {
		return undefined;
	}
}

function findArrayIndex(
	items: readonly unknown[],
	segment: TComparisonPathSegment
): number {
	if (typeof segment === 'number') return segment;
	const stableKey = parseStableKeySelector(segment);
	if (stableKey) {
		return items.findIndex(
			(item) =>
				isRecord(item) &&
				Object.is(item[stableKey.property], stableKey.value)
		);
	}
	if (segment.startsWith('ambiguous=')) return -2;
	if (!segment.startsWith('value=')) return -2;
	const selectedValue = parseSetValueSelector(segment);
	return items.findIndex((item) => Object.is(item, selectedValue));
}

function mutateValueAtPath(
	current: unknown,
	path: readonly TComparisonPathSegment[],
	commandKind: TComparisonExecutableCommandKind,
	desiredValue: unknown
): { error?: string; value: unknown } {
	const [segment, ...remaining] = path;
	if (segment === undefined) {
		return commandKind === 'delete-added'
			? { error: '不能删除资源包根节点。', value: current }
			: { value: cloneValue(desiredValue) };
	}

	if (Array.isArray(current)) {
		const next = current.map((item) => cloneValue(item));
		const index = findArrayIndex(current, segment);
		if (index === -2) {
			return {
				error: `不支持的数组路径段：${String(segment)}`,
				value: current,
			};
		}
		if (remaining.length === 0) {
			if (commandKind === 'delete-added') {
				if (index < 0 || index >= next.length) {
					return { error: '新版目标成员不存在。', value: current };
				}
				next.splice(index, 1);
				return { value: next };
			}
			if (index >= 0 && index < next.length) {
				next[index] = cloneValue(desiredValue);
			} else if (typeof segment === 'number' && segment <= next.length) {
				next.splice(segment, 0, cloneValue(desiredValue));
			} else {
				next.push(cloneValue(desiredValue));
			}
			return { value: next };
		}
		if (index < 0 || index >= current.length) {
			return { error: '路径中的数组成员不存在。', value: current };
		}
		const child = mutateValueAtPath(
			current[index],
			remaining,
			commandKind,
			desiredValue
		);
		if (child.error) return { error: child.error, value: current };
		next[index] = child.value;
		return { value: next };
	}

	if (!isRecord(current) || typeof segment !== 'string') {
		return { error: `路径${String(segment)}无法定位。`, value: current };
	}
	if (segment.startsWith('ambiguous=')) {
		return { error: '无法匹配的项目不能执行此操作。', value: current };
	}
	const next: Record<string, unknown> = Object.fromEntries(
		Object.entries(current).map(([key, value]) => [key, cloneValue(value)])
	);
	if (remaining.length === 0) {
		if (commandKind === 'delete-added') {
			if (!Object.prototype.hasOwnProperty.call(current, segment)) {
				return { error: '新版目标字段不存在。', value: current };
			}
			Reflect.deleteProperty(next, segment);
		} else {
			next[segment] = cloneValue(desiredValue);
		}
		return { value: next };
	}
	if (!Object.prototype.hasOwnProperty.call(current, segment)) {
		return { error: `路径中的字段${segment}不存在。`, value: current };
	}
	const child = mutateValueAtPath(
		current[segment],
		remaining,
		commandKind,
		desiredValue
	);
	if (child.error) return { error: child.error, value: current };
	next[segment] = child.value;
	return { value: next };
}

function getChangeKind(
	node: IComparisonNode,
	commandKind: TComparisonExecutableCommandKind
): IComparisonCommandChange['kind'] {
	if (commandKind === 'adopt-old') return 'set-field';
	if (commandKind === 'delete-added') {
		return node.kind === 'entity' || node.kind === 'member'
			? 'delete-member'
			: 'delete-field';
	}
	return node.kind === 'entity' || node.kind === 'member'
		? 'restore-member'
		: 'restore-field';
}

function unsupportedConflict(
	node: IComparisonNode,
	message: string
): IComparisonCommandConflict {
	return {
		fieldPath: node.fieldPath,
		isBlocking: true,
		kind: 'unsupported-target',
		message,
	};
}

export function applyComparisonNodeChange(
	current: IComparisonContentSnapshot,
	node: IComparisonNode,
	commandKind: TComparisonExecutableCommandKind
): IComparisonNodeChangeResult {
	const next = cloneComparisonContentSnapshot(current);
	if (node.kind === 'asset' || node.kind === 'folder') return { next };
	if (node.kind === 'license') {
		if (commandKind === 'delete-added') {
			next.hasLicenseFile = false;
			next.license = '';
		} else {
			next.hasLicenseFile = node.leftValue.isPresent;
			next.license = node.leftValue.isPresent
				? String(node.leftValue.value ?? '')
				: '';
		}
		return {
			change: {
				fieldPath: node.fieldPath,
				kind: getChangeKind(node, commandKind),
				nodeId: node.id,
			},
			next,
		};
	}
	if (node.kind === 'root' || node.kind === 'collection') {
		return {
			error: unsupportedConflict(node, '该结构不能执行此操作。'),
			next,
		};
	}
	const desiredValue = node.leftValue.isPresent
		? node.leftValue.value
		: undefined;
	const mutation = mutateValueAtPath(
		next.resourcePack,
		node.fieldPath,
		commandKind,
		desiredValue
	);
	if (mutation.error) {
		return { error: unsupportedConflict(node, mutation.error), next };
	}
	next.resourcePack = mutation.value as ResourceEx;
	return {
		change: {
			fieldPath: node.fieldPath,
			kind: getChangeKind(node, commandKind),
			nodeId: node.id,
		},
		next,
	};
}

export function applyComparisonFieldValue(
	resourcePack: ResourceEx,
	fieldPath: readonly TComparisonPathSegment[],
	value: unknown
): IComparisonFieldValueResult {
	if (fieldPath.length === 0) {
		return { error: '不能替换资源包根节点。', resourcePack };
	}
	if (
		fieldPath.length === 2 &&
		fieldPath[0] === 'packInfo' &&
		fieldPath[1] === 'label'
	) {
		return {
			error: '资源包标识符（Label）不能在对比页中修改。',
			resourcePack,
		};
	}
	const mutation = mutateValueAtPath(
		resourcePack,
		fieldPath,
		'adopt-old',
		value
	);
	return mutation.error
		? { error: mutation.error, resourcePack }
		: { resourcePack: mutation.value as ResourceEx };
}

export function removeComparisonFieldValue(
	resourcePack: ResourceEx,
	fieldPath: readonly TComparisonPathSegment[]
): IComparisonFieldValueResult {
	if (fieldPath.length === 0) {
		return { error: '不能删除资源包根节点。', resourcePack };
	}
	if (
		fieldPath.length === 2 &&
		fieldPath[0] === 'packInfo' &&
		fieldPath[1] === 'label'
	) {
		return {
			error: '资源包标识符（Label）不能在对比页中删除。',
			resourcePack,
		};
	}
	const mutation = mutateValueAtPath(
		resourcePack,
		fieldPath,
		'delete-added',
		undefined
	);
	return mutation.error
		? { error: mutation.error, resourcePack }
		: { resourcePack: mutation.value as ResourceEx };
}

function readWorkspaceId(context: IComparisonCommandApplicationContext) {
	return context.current.source.kind === 'workspace'
		? context.current.source.workspaceId
		: null;
}

function createApplicationConflict(
	kind: IComparisonCommandConflict['kind'],
	message: string
): IComparisonCommandConflict {
	return { isBlocking: true, kind, message };
}

function validateApplicationContext(
	expectedWorkspaceId: string,
	expectedLabel: string,
	expectedRevision: number,
	expectedAssetGeneration: number,
	context: IComparisonCommandApplicationContext
): IComparisonCommandConflict | null {
	if (readWorkspaceId(context) !== expectedWorkspaceId) {
		return createApplicationConflict(
			'workspace-mismatch',
			'新版工作区已变化。'
		);
	}
	const currentLabel =
		context.current.resourcePack.packInfo.label?.trim() ?? '';
	if (!currentLabel || currentLabel !== expectedLabel) {
		return createApplicationConflict(
			'label-mismatch',
			'新版资源包标识符已变化。'
		);
	}
	if (context.current.revision !== expectedRevision) {
		return createApplicationConflict('stale-revision', '新版内容已变化。');
	}
	if (context.assetGeneration !== expectedAssetGeneration) {
		return createApplicationConflict('stale-assets', '新版资产已变化。');
	}
	return null;
}

function areAssetsEquivalent(
	left: IComparisonContentSnapshot,
	right: IComparisonContentSnapshot
): boolean {
	if (left.files.size !== right.files.size) return false;
	for (const [path, blob] of left.files) {
		if (right.files.get(path) !== blob) return false;
	}
	if (left.folders.length !== right.folders.length) return false;
	return left.folders.every(
		(folder, index) => folder === right.folders[index]
	);
}

export function applyComparisonCommand(
	command: IComparisonCommand,
	context: IComparisonCommandApplicationContext
): IComparisonCommandApplicationResult {
	const { plan } = command;
	const conflict = validateApplicationContext(
		plan.expectedWorkspaceId,
		plan.expectedLabel,
		plan.expectedRevision,
		plan.expectedAssetGeneration,
		context
	);
	if (conflict) return { conflict, isSuccess: false };

	const before = cloneComparisonContentSnapshot(context.current);
	const next = cloneComparisonContentSnapshot(command.next);
	const hasAssetChanges = !areAssetsEquivalent(before, next);
	const inverse: IComparisonInverseCommand = {
		before,
		expectedAssetGeneration:
			context.assetGeneration + (hasAssetChanges ? 1 : 0),
		expectedLabel: plan.expectedLabel,
		expectedRevision: plan.expectedRevision + 1,
		expectedWorkspaceId: plan.expectedWorkspaceId,
		id: `${plan.id}:inverse`,
		targetNodeId: plan.targetNodeId,
	};
	return { inverse, isSuccess: true, next };
}

export function applyComparisonInverseCommand(
	inverse: IComparisonInverseCommand,
	context: IComparisonCommandApplicationContext
): IComparisonCommandApplicationResult {
	const conflict = validateApplicationContext(
		inverse.expectedWorkspaceId,
		inverse.expectedLabel,
		inverse.expectedRevision,
		inverse.expectedAssetGeneration,
		context
	);
	return conflict
		? { conflict, isSuccess: false }
		: {
				isSuccess: true,
				next: cloneComparisonContentSnapshot(inverse.before),
			};
}
