import {
	collectResourcePackReferenceLocations,
	type IResourcePackReferenceLocation,
	type TResourcePackReferenceKind,
	type TResourcePackReferenceOwnerKind,
} from '@/domain/resourcePack/referenceLocations';

import {
	applyComparisonNodeChange,
	cloneComparisonContentSnapshot,
} from './applyComparisonCommand';
import { planComparisonAssetChanges } from './assetConflictPlanning';
import type {
	IBuildComparisonCommandInput,
	IComparisonCommandBuildResult,
	IComparisonCommandConflict,
	IComparisonCommandPlan,
	IComparisonContentSnapshot,
	IComparisonReferenceImpact,
	TComparisonReferenceKind,
} from './contracts';
import type { TResourceEntityCollection } from './entityDescriptors';

interface IEntityReferenceDescriptor {
	collection: TResourceEntityCollection;
	ownerKind: TResourcePackReferenceOwnerKind;
	referencedKind?: TResourcePackReferenceKind;
	stableKey: string;
}

const ENTITY_REFERENCE_DESCRIPTORS: readonly IEntityReferenceDescriptor[] = [
	{
		collection: 'beverages',
		ownerKind: 'beverage',
		referencedKind: 'beverage',
		stableKey: 'id',
	},
	{
		collection: 'characters',
		ownerKind: 'character',
		referencedKind: 'character',
		stableKey: 'id',
	},
	{
		collection: 'clothes',
		ownerKind: 'clothes',
		referencedKind: 'item',
		stableKey: 'id',
	},
	{
		collection: 'dialogPackages',
		ownerKind: 'dialogPackage',
		referencedKind: 'dialogPackage',
		stableKey: 'name',
	},
	{
		collection: 'eventNodes',
		ownerKind: 'event',
		referencedKind: 'event',
		stableKey: 'label',
	},
	{
		collection: 'foods',
		ownerKind: 'food',
		referencedKind: 'food',
		stableKey: 'id',
	},
	{
		collection: 'ingredients',
		ownerKind: 'ingredient',
		referencedKind: 'ingredient',
		stableKey: 'id',
	},
	{ collection: 'dayMaps', ownerKind: 'dayMap', stableKey: 'id' },
	{ collection: 'merchants', ownerKind: 'merchant', stableKey: 'key' },
	{
		collection: 'missionNodes',
		ownerKind: 'mission',
		referencedKind: 'mission',
		stableKey: 'label',
	},
	{
		collection: 'recipes',
		ownerKind: 'recipe',
		referencedKind: 'recipe',
		stableKey: 'id',
	},
] as const satisfies readonly IEntityReferenceDescriptor[];

const REFERENCE_KIND_MAP = {
	asset: 'asset',
	beverage: 'beverage',
	character: 'character',
	characterPortrait: 'character-portrait',
	dialogPackage: 'dialog-package',
	event: 'event',
	food: 'food',
	ingredient: 'ingredient',
	item: 'item',
	mission: 'mission',
	recipe: 'recipe',
} as const satisfies Record<
	TResourcePackReferenceKind,
	TComparisonReferenceKind
>;

function readExpectedWorkspaceId(input: IBuildComparisonCommandInput) {
	return input.right.source.kind === 'workspace'
		? input.right.source.workspaceId
		: '';
}

function toContentSnapshot(
	snapshot: IBuildComparisonCommandInput['right']
): IComparisonContentSnapshot {
	return cloneComparisonContentSnapshot(snapshot);
}

function createBlockingConflict(
	kind: IComparisonCommandConflict['kind'],
	message: string,
	fieldPath?: IComparisonCommandConflict['fieldPath']
): IComparisonCommandConflict {
	return {
		...(fieldPath ? { fieldPath } : {}),
		isBlocking: true,
		kind,
		message,
	};
}

function parseStableKeySegment(
	segment: string,
	stableKey: string
): number | string | null {
	const prefix = `${stableKey}=`;
	if (!segment.startsWith(prefix)) return null;
	const token = segment.slice(prefix.length);
	const separatorIndex = token.indexOf(':');
	if (separatorIndex < 0) return null;
	const type = token.slice(0, separatorIndex);
	const rawValue = token.slice(separatorIndex + 1);
	if (type === 'string') return rawValue;
	if (type !== 'number') return null;
	const value = Number(rawValue);
	return Number.isFinite(value) ? value : null;
}

function readEntityTarget(input: IBuildComparisonCommandInput) {
	if (input.targetNode.fieldPath.length < 2) return null;
	const [collection, keySegment] = input.targetNode.fieldPath;
	if (typeof collection !== 'string' || typeof keySegment !== 'string') {
		return null;
	}
	const descriptor = ENTITY_REFERENCE_DESCRIPTORS.find(
		(candidate) => candidate.collection === collection
	);
	if (!descriptor) return null;
	const key = parseStableKeySegment(keySegment, descriptor.stableKey);
	return key === null ? null : { descriptor, key };
}

function hasDuplicateEntityKey(input: IBuildComparisonCommandInput): boolean {
	if (
		input.commandKind !== 'restore-removed' ||
		input.targetNode.kind !== 'entity' ||
		input.targetNode.status !== 'removed'
	) {
		return false;
	}
	const target = readEntityTarget(input);
	if (!target) return false;
	const items: readonly unknown[] =
		input.right.resourcePack[target.descriptor.collection];
	return items.some(
		(item) =>
			typeof item === 'object' &&
			item !== null &&
			Object.is(
				Reflect.get(item, target.descriptor.stableKey),
				target.key
			)
	);
}

function collectDirectReferencedAssetPaths(
	input: IBuildComparisonCommandInput
): readonly string[] {
	if (
		!input.includeReferencedAssets ||
		input.targetNode.kind !== 'entity' ||
		input.targetNode.fieldPath.length !== 2
	) {
		return [];
	}
	const target = readEntityTarget(input);
	if (!target) return [];
	return [
		...new Set(
			collectResourcePackReferenceLocations(
				input.left.resourcePack
			).flatMap((location) =>
				location.ownerKind === target.descriptor.ownerKind &&
				Object.is(location.ownerKey, target.key) &&
				location.referencedKind === 'asset' &&
				typeof location.referencedValue === 'string' &&
				!(
					location.ownerKind === 'dayMap' &&
					location.referencedValue.startsWith('rex://')
				)
					? [location.referencedValue]
					: []
			)
		),
	].sort();
}

function toReferenceImpact(
	location: IResourcePackReferenceLocation
): IComparisonReferenceImpact {
	return {
		fieldPath: location.fieldPath,
		ownerKey: location.ownerKey,
		ownerKind: location.ownerKind,
		referencedKind: REFERENCE_KIND_MAP[location.referencedKind],
		referencedValue: location.referencedValue,
	};
}

function collectDeleteReferenceImpacts(
	input: IBuildComparisonCommandInput
): readonly IComparisonReferenceImpact[] {
	if (input.commandKind !== 'delete-added') return [];
	const locations = collectResourcePackReferenceLocations(
		input.right.resourcePack
	);
	if (input.targetNode.kind === 'asset' && input.targetAssetPath) {
		return locations
			.filter(
				(location) =>
					location.referencedKind === 'asset' &&
					location.referencedValue === input.targetAssetPath
			)
			.map(toReferenceImpact);
	}
	if (input.targetNode.kind === 'folder' && input.targetAssetPath) {
		const folder = input.targetAssetPath.endsWith('/')
			? input.targetAssetPath
			: `${input.targetAssetPath}/`;
		return locations
			.filter(
				(location) =>
					location.referencedKind === 'asset' &&
					typeof location.referencedValue === 'string' &&
					location.referencedValue.startsWith(folder)
			)
			.map(toReferenceImpact);
	}
	const target = readEntityTarget(input);
	if (!target?.descriptor.referencedKind) return [];
	if (target.descriptor.collection === 'characters') {
		const character = input.right.resourcePack.characters.find(
			(candidate) => Object.is(candidate.id, target.key)
		);
		if (!character) return [];
		const characterReference = `${character.type}:${character.id}`;
		return locations
			.filter(
				(location) =>
					(location.referencedKind === 'character' &&
						(Object.is(location.referencedValue, character.id) ||
							location.referencedValue === characterReference ||
							location.referencedValue === character.label)) ||
					(location.referencedKind === 'characterPortrait' &&
						typeof location.referencedValue === 'string' &&
						location.referencedValue.startsWith(
							`${characterReference}:`
						))
			)
			.map(toReferenceImpact);
	}
	return locations
		.filter(
			(location) =>
				location.referencedKind === target.descriptor.referencedKind &&
				Object.is(location.referencedValue, target.key)
		)
		.map(toReferenceImpact);
}

function createPlan(
	input: IBuildComparisonCommandInput,
	values: Pick<
		IComparisonCommandPlan,
		| 'addedBytes'
		| 'addedFileCount'
		| 'changes'
		| 'conflicts'
		| 'isApplicable'
		| 'referenceImpacts'
		| 'skippedFiles'
	>
): IComparisonCommandPlan {
	const expectedLabel = input.right.resourcePack.packInfo.label?.trim() ?? '';
	const expectedRevision = input.right.revision ?? -1;
	const expectedWorkspaceId = readExpectedWorkspaceId(input);
	return Object.freeze({
		...values,
		commandKind: input.commandKind,
		expectedAssetGeneration: input.expectedAssetGeneration,
		expectedLabel,
		expectedRevision,
		expectedWorkspaceId,
		id: [
			'comparison-command',
			input.commandKind,
			encodeURIComponent(input.targetNode.id),
			encodeURIComponent(expectedWorkspaceId),
			expectedRevision,
			input.expectedAssetGeneration,
		].join(':'),
		targetNodeId: input.targetNode.id,
	});
}

export function buildComparisonCommand(
	input: IBuildComparisonCommandInput
): IComparisonCommandBuildResult {
	const conflicts: IComparisonCommandConflict[] = [];
	const expectedWorkspaceId = readExpectedWorkspaceId(input);
	const leftLabel = input.left.resourcePack.packInfo.label?.trim() ?? '';
	const rightLabel = input.right.resourcePack.packInfo.label?.trim() ?? '';
	if (!expectedWorkspaceId || input.right.revision === null) {
		conflicts.push(
			createBlockingConflict(
				'workspace-mismatch',
				'新版必须是可编辑的工作区。'
			)
		);
	}
	if (!leftLabel || !rightLabel || leftLabel !== rightLabel) {
		conflicts.push(
			createBlockingConflict(
				'label-mismatch',
				'两侧资源包标识符（Label）必须非空且完全相同。'
			)
		);
	}
	if (!input.targetNode.editCapabilities.includes(input.commandKind)) {
		conflicts.push(
			createBlockingConflict(
				'unsupported-target',
				'当前差异不支持此操作。',
				input.targetNode.fieldPath
			)
		);
	}
	if (hasDuplicateEntityKey(input)) {
		conflicts.push(
			createBlockingConflict(
				'duplicate-key',
				'新版已存在标识相同的实体。',
				input.targetNode.fieldPath
			)
		);
	}

	const nodeChange = applyComparisonNodeChange(
		toContentSnapshot(input.right),
		input.targetNode,
		input.commandKind
	);
	if (nodeChange.error) conflicts.push(nodeChange.error);
	const targetAssetPath = input.targetAssetPath;
	if (
		(input.targetNode.kind === 'asset' ||
			input.targetNode.kind === 'folder') &&
		!targetAssetPath
	) {
		conflicts.push(
			createBlockingConflict('missing-source', '资产操作缺少目标路径。')
		);
	}

	const directReferencedAssetPaths = collectDirectReferencedAssetPaths(input);
	const assetPlan = planComparisonAssetChanges({
		...(input.assetConflictResolutions
			? { conflictResolutions: input.assetConflictResolutions }
			: {}),
		copyFilePaths: [
			...directReferencedAssetPaths,
			...(input.commandKind === 'restore-removed' &&
			input.targetNode.kind === 'asset' &&
			targetAssetPath
				? [targetAssetPath]
				: []),
		],
		currentFiles: input.right.files,
		currentFolders: input.right.folders,
		deleteFilePaths:
			input.commandKind === 'delete-added' &&
			input.targetNode.kind === 'asset' &&
			targetAssetPath
				? [targetAssetPath]
				: [],
		deleteFolderPaths:
			input.commandKind === 'delete-added' &&
			input.targetNode.kind === 'folder' &&
			targetAssetPath
				? [targetAssetPath]
				: [],
		...(input.assetHashes ? { hashes: input.assetHashes } : {}),
		nodeId: input.targetNode.id,
		restoreFolderPaths:
			input.commandKind === 'restore-removed' &&
			input.targetNode.kind === 'folder' &&
			targetAssetPath
				? [targetAssetPath]
				: [],
		sourceFiles: input.left.files,
		sourceFolders: input.left.folders,
	});
	conflicts.push(...assetPlan.conflicts);
	const referenceImpacts = collectDeleteReferenceImpacts(input);
	if (referenceImpacts.length > 0) {
		conflicts.push({
			...(targetAssetPath ? { assetPath: targetAssetPath } : {}),
			fieldPath: input.targetNode.fieldPath,
			isBlocking: false,
			kind: 'referenced-delete',
			message: `删除后仍有${referenceImpacts.length}处现有引用。`,
		});
	}

	const changes = [
		...(nodeChange.change ? [nodeChange.change] : []),
		...assetPlan.changes,
	];
	const isApplicable =
		changes.length > 0 &&
		!conflicts.some((conflict) => conflict.isBlocking);
	const plan = createPlan(input, {
		addedBytes: assetPlan.addedBytes,
		addedFileCount: assetPlan.addedFileCount,
		changes: Object.freeze(changes),
		conflicts: Object.freeze(conflicts),
		isApplicable,
		referenceImpacts: Object.freeze(referenceImpacts),
		skippedFiles: assetPlan.skippedFiles,
	});
	if (!isApplicable) return { plan };

	const next: IComparisonContentSnapshot = {
		...nodeChange.next,
		files: assetPlan.files,
		folders: assetPlan.folders,
	};
	return { command: Object.freeze({ next, plan }), plan };
}
