import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import {
	isResourceEditorCollection,
	RESOURCE_EDITOR_TARGET_BY_COLLECTION,
	type IResourceEditorNavigationTarget,
} from '@/domain/resourcePack/editorNavigation';

import { buildComparisonSearchIndex } from './comparisonSearch';
import type {
	IComparisonNavigationTarget,
	IComparisonNode,
	IResourcePackComparison,
	IResourcePackComparisonOptions,
	TComparisonEditCapability,
	TComparisonNodeKind,
	TComparisonPathSegment,
	TComparisonValue,
} from './contracts';
import {
	createComparisonDifferenceCounts,
	deriveComparisonParentStatus,
	indexComparisonNodes,
	pruneUnchangedComparisonNode,
} from './differenceTree';
import {
	getNestedEntityDescriptor,
	getResourceEntityDescriptor,
	type IComparisonEntityDescriptor,
	type IComparisonNestedEntityDescriptor,
} from './entityDescriptors';
import {
	getComparisonArraySemantics,
	type TComparisonArraySemantics,
} from './valueSemantics';

interface ICompareValueInput {
	fieldPath: readonly TComparisonPathSegment[];
	kind: TComparisonNodeKind;
	label: string;
	leftValue: TComparisonValue;
	navigationTarget?: IComparisonNavigationTarget;
	parentId: string | null;
	rawFieldName: string | null;
	rightValue: TComparisonValue;
	semanticPath: string;
}

interface IKeyedItemGroup {
	isValid: boolean;
	items: readonly unknown[];
	key: number | string;
}

const MISSING_COMPARISON_VALUE = Object.freeze({
	isPresent: false,
}) satisfies TComparisonValue;

function createPresentComparisonValue(value: unknown): TComparisonValue {
	return Object.freeze({ isPresent: true, value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	);
}

function createComparisonNodeId(
	kind: TComparisonNodeKind,
	fieldPath: readonly TComparisonPathSegment[]
): string {
	if (fieldPath.length === 0) {
		return `${kind}:root`;
	}

	const encodedPath = fieldPath
		.map((segment) =>
			typeof segment === 'number'
				? `n:${segment}`
				: `s:${encodeURIComponent(segment)}`
		)
		.join('/');
	return `${kind}:${encodedPath}`;
}

function isPackLabelPath(
	fieldPath: readonly TComparisonPathSegment[]
): boolean {
	return (
		fieldPath.length === 2 &&
		fieldPath[0] === 'packInfo' &&
		fieldPath[1] === 'label'
	);
}

function getEditCapabilities(
	input: ICompareValueInput,
	status: IComparisonNode['status'],
	children: readonly IComparisonNode[]
): readonly TComparisonEditCapability[] {
	if (
		status === 'ambiguous' ||
		status === 'unchanged' ||
		input.kind === 'collection' ||
		input.kind === 'root' ||
		isPackLabelPath(input.fieldPath)
	) {
		return Object.freeze([]);
	}

	if (status === 'added') {
		return Object.freeze(['delete-added']);
	}

	if (status === 'removed') {
		return Object.freeze(['restore-removed']);
	}

	const isScalarChange =
		children.length === 0 &&
		input.leftValue.isPresent &&
		input.rightValue.isPresent &&
		isScalar(input.leftValue.value) &&
		isScalar(input.rightValue.value);

	return isScalarChange ? Object.freeze(['adopt-old']) : Object.freeze([]);
}

function createComparisonNode(
	input: ICompareValueInput,
	status: IComparisonNode['status'],
	children: readonly IComparisonNode[]
): IComparisonNode {
	const frozenChildren = Object.freeze([...children]);
	return Object.freeze({
		children: frozenChildren,
		counts: Object.freeze(
			createComparisonDifferenceCounts(status, frozenChildren)
		),
		editCapabilities: getEditCapabilities(input, status, frozenChildren),
		fieldPath: Object.freeze([...input.fieldPath]),
		id: createComparisonNodeId(input.kind, input.fieldPath),
		issues: Object.freeze([]),
		kind: input.kind,
		label: input.label,
		leftValue: input.leftValue,
		...(input.navigationTarget
			? { navigationTarget: Object.freeze(input.navigationTarget) }
			: {}),
		parentId: input.parentId,
		rawFieldName: input.rawFieldName,
		referenceImpacts: Object.freeze([]),
		rightValue: input.rightValue,
		status,
	});
}

function getObjectProperty(
	value: TComparisonValue,
	property: string
): TComparisonValue {
	if (
		!value.isPresent ||
		!isRecord(value.value) ||
		!Object.prototype.hasOwnProperty.call(value.value, property)
	) {
		return MISSING_COMPARISON_VALUE;
	}

	return createPresentComparisonValue(value.value[property]);
}

function getArrayValue(value: TComparisonValue): readonly unknown[] {
	return value.isPresent && Array.isArray(value.value) ? value.value : [];
}

function getRecordValue(value: TComparisonValue): Record<string, unknown> {
	return value.isPresent && isRecord(value.value) ? value.value : {};
}

function getPresenceStatus(
	leftValue: TComparisonValue,
	rightValue: TComparisonValue,
	children: readonly IComparisonNode[]
): IComparisonNode['status'] {
	if (!leftValue.isPresent && rightValue.isPresent) {
		return 'added';
	}

	if (leftValue.isPresent && !rightValue.isPresent) {
		return 'removed';
	}

	return deriveComparisonParentStatus(children);
}

function getArrayItemSemanticPath(semanticPath: string): string {
	return `${semanticPath}[]`;
}

function getChildSemanticPath(semanticPath: string, property: string): string {
	return semanticPath ? `${semanticPath}.${property}` : property;
}

function getEntityDescriptor(
	semanticPath: string
): IComparisonEntityDescriptor | IComparisonNestedEntityDescriptor | undefined {
	return (
		getResourceEntityDescriptor(semanticPath) ??
		getNestedEntityDescriptor(semanticPath)
	);
}

function getKeyedItemLabel(
	descriptor:
		| IComparisonEntityDescriptor
		| IComparisonNestedEntityDescriptor
		| undefined,
	group: IKeyedItemGroup,
	fallbackValue: unknown
): string {
	const candidate = isRecord(fallbackValue) ? fallbackValue : undefined;
	const displayValue =
		descriptor?.displayField && candidate
			? candidate[descriptor.displayField]
			: undefined;
	const displayText =
		displayValue !== undefined &&
		displayValue !== null &&
		isScalar(displayValue)
			? String(displayValue)
			: String(group.key);
	return descriptor ? `${descriptor.label} · ${displayText}` : displayText;
}

function createKeyToken(value: number | string): string {
	return `${typeof value}:${JSON.stringify(value)}`;
}

function createNavigationTarget(
	input: ICompareValueInput,
	fieldPath: readonly TComparisonPathSegment[],
	stableKey?: number | string
): IResourceEditorNavigationTarget | undefined {
	if (fieldPath[0] === 'gifts') {
		// 礼物只有顺序，没有稳定标识；旧快照的索引不能用于选择当前条目。
		return {
			entityKind: 'gift',
			fieldPath: Object.freeze(['gifts']),
			route: '/gift',
			stableKey: 'gifts',
		};
	}
	if (
		stableKey !== undefined &&
		isResourceEditorCollection(input.semanticPath)
	) {
		const definition =
			RESOURCE_EDITOR_TARGET_BY_COLLECTION[input.semanticPath];
		return {
			...definition,
			fieldPath: Object.freeze([...fieldPath]),
			stableKey,
		};
	}
	if (!input.navigationTarget) return undefined;
	return {
		...input.navigationTarget,
		fieldPath: Object.freeze([...fieldPath]),
	};
}

function createNavigationTargetProperty(
	input: ICompareValueInput,
	fieldPath: readonly TComparisonPathSegment[],
	stableKey?: number | string
): Pick<ICompareValueInput, 'navigationTarget'> | object {
	const navigationTarget = createNavigationTarget(
		input,
		fieldPath,
		stableKey
	);
	return navigationTarget ? { navigationTarget } : {};
}

function groupKeyedItems(
	items: readonly unknown[],
	stableKey: string,
	side: 'left' | 'right'
): ReadonlyMap<string, IKeyedItemGroup> {
	const groups = new Map<string, IKeyedItemGroup>();

	items.forEach((item, index) => {
		const candidateKey = isRecord(item) ? item[stableKey] : undefined;
		const isValid =
			typeof candidateKey === 'number' ||
			typeof candidateKey === 'string';
		const key = isValid ? candidateKey : `[${index}]`;
		const token = isValid
			? createKeyToken(key)
			: `invalid:${side}:${String(index).padStart(8, '0')}`;
		const existingGroup = groups.get(token);
		groups.set(token, {
			isValid,
			items: Object.freeze([...(existingGroup?.items ?? []), item]),
			key,
		});
	});

	return groups;
}

export function createComparisonStableKeyPathSegment(
	stableKey: string,
	key: number | string
): string {
	return `${stableKey}=${typeof key}:${String(key)}`;
}

function createAmbiguousNode(
	input: ICompareValueInput,
	groupToken: string,
	leftGroup: IKeyedItemGroup | undefined,
	rightGroup: IKeyedItemGroup | undefined,
	descriptor:
		| IComparisonEntityDescriptor
		| IComparisonNestedEntityDescriptor
		| undefined
): IComparisonNode {
	const group = leftGroup ?? rightGroup;
	if (!group) {
		throw new Error(
			'Ambiguous comparison node requires at least one item group.'
		);
	}

	const fieldPath = [...input.fieldPath, `ambiguous=${groupToken}`];
	return createComparisonNode(
		{
			...input,
			fieldPath,
			kind: 'entity',
			label: getKeyedItemLabel(
				descriptor,
				group,
				leftGroup?.items[0] ?? rightGroup?.items[0]
			),
			leftValue: leftGroup
				? createPresentComparisonValue(leftGroup.items)
				: MISSING_COMPARISON_VALUE,
			...createNavigationTargetProperty(input, fieldPath),
			parentId: createComparisonNodeId(input.kind, input.fieldPath),
			rawFieldName: null,
			rightValue: rightGroup
				? createPresentComparisonValue(rightGroup.items)
				: MISSING_COMPARISON_VALUE,
			semanticPath: getArrayItemSemanticPath(input.semanticPath),
		},
		'ambiguous',
		[]
	);
}

function compareKeyedArray(
	input: ICompareValueInput,
	semantics: Extract<TComparisonArraySemantics, { kind: 'keyed' }>
): IComparisonNode {
	const leftGroups = groupKeyedItems(
		getArrayValue(input.leftValue),
		semantics.stableKey,
		'left'
	);
	const rightGroups = groupKeyedItems(
		getArrayValue(input.rightValue),
		semantics.stableKey,
		'right'
	);
	const groupTokens = [
		...new Set([...leftGroups.keys(), ...rightGroups.keys()]),
	].sort();
	const descriptor = getEntityDescriptor(input.semanticPath);
	const parentId = createComparisonNodeId(input.kind, input.fieldPath);
	const children = groupTokens.map((token) => {
		const leftGroup = leftGroups.get(token);
		const rightGroup = rightGroups.get(token);
		const group = leftGroup ?? rightGroup;
		if (!group) {
			throw new Error('Keyed comparison group unexpectedly missing.');
		}

		if (
			!group.isValid ||
			(leftGroup?.items.length ?? 0) > 1 ||
			(rightGroup?.items.length ?? 0) > 1
		) {
			return createAmbiguousNode(
				input,
				token,
				leftGroup,
				rightGroup,
				descriptor
			);
		}

		const leftItem = leftGroup?.items[0];
		const rightItem = rightGroup?.items[0];
		const fieldPath = [
			...input.fieldPath,
			createComparisonStableKeyPathSegment(
				semantics.stableKey,
				group.key
			),
		];
		return compareValue({
			fieldPath,
			kind: 'entity',
			label: getKeyedItemLabel(descriptor, group, rightItem ?? leftItem),
			leftValue: leftGroup
				? createPresentComparisonValue(leftItem)
				: MISSING_COMPARISON_VALUE,
			...createNavigationTargetProperty(input, fieldPath, group.key),
			parentId,
			rawFieldName: semantics.stableKey,
			rightValue: rightGroup
				? createPresentComparisonValue(rightItem)
				: MISSING_COMPARISON_VALUE,
			semanticPath: getArrayItemSemanticPath(input.semanticPath),
		});
	});

	return createComparisonNode(
		input,
		getPresenceStatus(input.leftValue, input.rightValue, children),
		children
	);
}

function createSetValueToken(value: unknown): string {
	if (value === null) {
		return 'null';
	}

	return `${typeof value}:${JSON.stringify(value)}`;
}

function compareSetArray(input: ICompareValueInput): IComparisonNode {
	const leftValuesByToken = new Map(
		getArrayValue(input.leftValue).map((value) => [
			createSetValueToken(value),
			value,
		])
	);
	const rightValuesByToken = new Map(
		getArrayValue(input.rightValue).map((value) => [
			createSetValueToken(value),
			value,
		])
	);
	const valueTokens = [
		...new Set([...leftValuesByToken.keys(), ...rightValuesByToken.keys()]),
	].sort();
	const parentId = createComparisonNodeId(input.kind, input.fieldPath);
	const children = valueTokens.map((token) => {
		const hasLeftValue = leftValuesByToken.has(token);
		const hasRightValue = rightValuesByToken.has(token);
		const value = hasRightValue
			? rightValuesByToken.get(token)
			: leftValuesByToken.get(token);
		return compareValue({
			fieldPath: [...input.fieldPath, `value=${token}`],
			kind: 'member',
			label: String(value),
			leftValue: hasLeftValue
				? createPresentComparisonValue(value)
				: MISSING_COMPARISON_VALUE,
			...createNavigationTargetProperty(input, [
				...input.fieldPath,
				`value=${token}`,
			]),
			parentId,
			rawFieldName: null,
			rightValue: hasRightValue
				? createPresentComparisonValue(value)
				: MISSING_COMPARISON_VALUE,
			semanticPath: getArrayItemSemanticPath(input.semanticPath),
		});
	});

	return createComparisonNode(
		input,
		getPresenceStatus(input.leftValue, input.rightValue, children),
		children
	);
}

function compareOrderedArray(input: ICompareValueInput): IComparisonNode {
	const leftItems = getArrayValue(input.leftValue);
	const rightItems = getArrayValue(input.rightValue);
	const parentId = createComparisonNodeId(input.kind, input.fieldPath);
	const children = Array.from(
		{ length: Math.max(leftItems.length, rightItems.length) },
		(_, index) =>
			compareValue({
				fieldPath: [...input.fieldPath, index],
				kind: 'member',
				label: `第${index + 1}项`,
				leftValue:
					index < leftItems.length
						? createPresentComparisonValue(leftItems[index])
						: MISSING_COMPARISON_VALUE,
				...createNavigationTargetProperty(input, [
					...input.fieldPath,
					index,
				]),
				parentId,
				rawFieldName: String(index),
				rightValue:
					index < rightItems.length
						? createPresentComparisonValue(rightItems[index])
						: MISSING_COMPARISON_VALUE,
				semanticPath: getArrayItemSemanticPath(input.semanticPath),
			})
	);

	return createComparisonNode(
		input,
		getPresenceStatus(input.leftValue, input.rightValue, children),
		children
	);
}

function compareArray(input: ICompareValueInput): IComparisonNode {
	const semantics = getComparisonArraySemantics(input.semanticPath) ?? {
		kind: 'ordered',
	};

	if (semantics.kind === 'keyed') {
		return compareKeyedArray(input, semantics);
	}

	if (semantics.kind === 'set') {
		return compareSetArray(input);
	}

	return compareOrderedArray(input);
}

function compareObject(input: ICompareValueInput): IComparisonNode {
	const leftObject = getRecordValue(input.leftValue);
	const rightObject = getRecordValue(input.rightValue);
	const properties = [
		...new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]),
	].sort();
	const parentId = createComparisonNodeId(input.kind, input.fieldPath);
	const children = properties.map((property) => {
		const leftValue = getObjectProperty(input.leftValue, property);
		const rightValue = getObjectProperty(input.rightValue, property);
		const fieldPath = [...input.fieldPath, property];
		const isTopLevelCollection =
			input.semanticPath === '' &&
			(Array.isArray(leftValue.isPresent ? leftValue.value : undefined) ||
				Array.isArray(
					rightValue.isPresent ? rightValue.value : undefined
				));
		return compareValue({
			fieldPath,
			kind: isTopLevelCollection ? 'collection' : 'field',
			label:
				getResourceEntityDescriptor(property)?.label ??
				(property === 'packInfo' ? '基础信息' : property),
			leftValue,
			...(input.semanticPath === '' && property === 'packInfo'
				? {
						navigationTarget: {
							entityKind: 'pack-info',
							fieldPath: Object.freeze(fieldPath),
							route: '/info',
							stableKey: 'packInfo',
						},
					}
				: createNavigationTargetProperty(input, fieldPath)),
			parentId,
			rawFieldName: property,
			rightValue,
			semanticPath: getChildSemanticPath(input.semanticPath, property),
		});
	});

	return createComparisonNode(
		input,
		getPresenceStatus(input.leftValue, input.rightValue, children),
		children
	);
}

function compareScalar(input: ICompareValueInput): IComparisonNode {
	let status: IComparisonNode['status'];
	if (!input.leftValue.isPresent && input.rightValue.isPresent) {
		status = 'added';
	} else if (input.leftValue.isPresent && !input.rightValue.isPresent) {
		status = 'removed';
	} else if (!input.leftValue.isPresent || !input.rightValue.isPresent) {
		status = 'unchanged';
	} else {
		status = Object.is(input.leftValue.value, input.rightValue.value)
			? 'unchanged'
			: 'modified';
	}

	return createComparisonNode(input, status, []);
}

function compareValue(input: ICompareValueInput): IComparisonNode {
	const leftRawValue = input.leftValue.isPresent
		? input.leftValue.value
		: undefined;
	const rightRawValue = input.rightValue.isPresent
		? input.rightValue.value
		: undefined;
	const hasArray =
		Array.isArray(leftRawValue) || Array.isArray(rightRawValue);
	const hasRecord = isRecord(leftRawValue) || isRecord(rightRawValue);

	if (
		hasArray &&
		(input.leftValue.isPresent ? Array.isArray(leftRawValue) : true) &&
		(input.rightValue.isPresent ? Array.isArray(rightRawValue) : true)
	) {
		return compareArray(input);
	}

	if (
		hasRecord &&
		(input.leftValue.isPresent ? isRecord(leftRawValue) : true) &&
		(input.rightValue.isPresent ? isRecord(rightRawValue) : true)
	) {
		return compareObject(input);
	}

	return compareScalar(input);
}

export function compareResourcePacks(
	leftResourcePack: ResourceEx,
	rightResourcePack: ResourceEx,
	options: IResourcePackComparisonOptions = {}
): IResourcePackComparison {
	const fullRoot = compareValue({
		fieldPath: [],
		kind: 'root',
		label: '资源包',
		leftValue: createPresentComparisonValue({
			...leftResourcePack,
			gifts: leftResourcePack.gifts ?? [],
		}),
		parentId: null,
		rawFieldName: null,
		rightValue: createPresentComparisonValue({
			...rightResourcePack,
			gifts: rightResourcePack.gifts ?? [],
		}),
		semanticPath: '',
	});
	const root = options.includeUnchanged
		? fullRoot
		: pruneUnchangedComparisonNode(fullRoot, true);
	if (!root) {
		throw new Error('Comparison root must always be retained.');
	}

	return Object.freeze({
		nodesById: indexComparisonNodes(root),
		root,
		searchIndex: buildComparisonSearchIndex(root),
	});
}
