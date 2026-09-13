import {
	type IResourcePackReferenceLocation,
	type TResourcePackReferenceKind,
	type TResourcePackReferenceOwnerKind,
} from '@/domain/resourcePack/referenceLocations';
import { type IResourcePackValidationIssue } from '@/domain/resourcePack/validation';

import { buildComparisonSearchIndex } from './comparisonSearch';
import { createComparisonStableKeyPathSegment } from './compareResourcePacks';
import {
	type IComparisonIssueAttachment,
	type IComparisonNode,
	type IComparisonReferenceImpact,
	type IResourcePackComparison,
	type TComparisonPathSegment,
	type TComparisonReferenceKind,
} from './contracts';
import { indexComparisonNodes } from './differenceTree';

export interface IAttachComparisonIssuesOptions {
	includeUnchanged?: boolean;
}

interface IReferenceOwnerDescriptor {
	collection: string;
	stableKey?: string;
}

const VALIDATION_CATEGORY_COLLECTIONS = {
	事件节点: 'eventNodes',
	任务节点: 'missionNodes',
	商人: 'merchants',
	对话动作: 'dialogPackages',
	对话包: 'dialogPackages',
	白天地图: 'dayMaps',
	礼物: 'gifts',
	礼物邮箱: 'gifts',
	衣服: 'clothes',
	衣服小人: 'clothes',
	角色: 'characters',
	角色小人: 'characters',
	角色立绘: 'characters',
	角色顾客配置: 'characters',
	酒水: 'beverages',
	料理: 'foods',
	食材: 'ingredients',
	食谱: 'recipes',
} as const satisfies Readonly<Record<string, string>>;

const validationCategoryCollectionsByName: Readonly<Record<string, string>> =
	VALIDATION_CATEGORY_COLLECTIONS;

const REFERENCE_OWNER_DESCRIPTORS = {
	beverage: { collection: 'beverages', stableKey: 'id' },
	character: { collection: 'characters', stableKey: 'id' },
	clothes: { collection: 'clothes', stableKey: 'id' },
	dialogPackage: { collection: 'dialogPackages', stableKey: 'name' },
	event: { collection: 'eventNodes', stableKey: 'label' },
	food: { collection: 'foods', stableKey: 'id' },
	dayMap: { collection: 'dayMaps', stableKey: 'id' },
	gift: { collection: 'gifts' },
	ingredient: { collection: 'ingredients', stableKey: 'id' },
	merchant: { collection: 'merchants', stableKey: 'key' },
	mission: { collection: 'missionNodes', stableKey: 'label' },
	recipe: { collection: 'recipes', stableKey: 'id' },
} as const satisfies Record<
	TResourcePackReferenceOwnerKind,
	IReferenceOwnerDescriptor
>;

const COMPARISON_REFERENCE_KINDS = {
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

function createFieldPathToken(
	fieldPath: readonly TComparisonPathSegment[]
): string {
	return JSON.stringify(fieldPath);
}

function indexNodesByFieldPath(
	root: IComparisonNode
): ReadonlyMap<string, IComparisonNode> {
	const nodesByFieldPath = new Map<string, IComparisonNode>();
	const pendingNodes = [root];

	while (pendingNodes.length > 0) {
		const node = pendingNodes.pop();
		if (!node) continue;
		nodesByFieldPath.set(createFieldPathToken(node.fieldPath), node);
		pendingNodes.push(...node.children.toReversed());
	}

	return nodesByFieldPath;
}

function findDeepestNode(
	nodesByFieldPath: ReadonlyMap<string, IComparisonNode>,
	fieldPath: readonly TComparisonPathSegment[]
): IComparisonNode {
	for (let length = fieldPath.length; length >= 0; length -= 1) {
		const node = nodesByFieldPath.get(
			createFieldPathToken(fieldPath.slice(0, length))
		);
		if (node) return node;
	}

	throw new Error('Comparison root is missing from the field-path index.');
}

function appendMapValue<T>(
	valuesByNodeId: Map<string, T[]>,
	nodeId: string,
	value: T
): void {
	const existingValues = valuesByNodeId.get(nodeId);
	if (existingValues) {
		existingValues.push(value);
	} else {
		valuesByNodeId.set(nodeId, [value]);
	}
}

function attachNodeMetadata(
	node: IComparisonNode,
	issuesByNodeId: ReadonlyMap<string, readonly IComparisonIssueAttachment[]>,
	referenceImpactsByNodeId: ReadonlyMap<
		string,
		readonly IComparisonReferenceImpact[]
	>
): IComparisonNode {
	const children = Object.freeze(
		node.children.map((child) =>
			attachNodeMetadata(child, issuesByNodeId, referenceImpactsByNodeId)
		)
	);

	return Object.freeze({
		...node,
		children,
		issues: Object.freeze([...(issuesByNodeId.get(node.id) ?? [])]),
		referenceImpacts: Object.freeze([
			...(referenceImpactsByNodeId.get(node.id) ?? []),
		]),
	});
}

function pruneUnchangedNodesWithoutIssues(
	node: IComparisonNode,
	isRoot = false
): IComparisonNode | null {
	const children = Object.freeze(
		node.children.flatMap((child) => {
			const retainedChild = pruneUnchangedNodesWithoutIssues(child);
			return retainedChild ? [retainedChild] : [];
		})
	);
	const shouldRetain =
		isRoot ||
		node.status !== 'unchanged' ||
		node.issues.length > 0 ||
		children.length > 0;

	return shouldRetain ? Object.freeze({ ...node, children }) : null;
}

function getValidationIssueFieldPath(
	issue: IResourcePackValidationIssue
): readonly TComparisonPathSegment[] {
	if (issue.category === '基础信息') return Object.freeze(['packInfo']);
	const collection = validationCategoryCollectionsByName[issue.category];
	return collection ? Object.freeze([collection]) : Object.freeze([]);
}

function getReferenceOwnerFieldPath(
	location: IResourcePackReferenceLocation
): readonly TComparisonPathSegment[] {
	const descriptor = REFERENCE_OWNER_DESCRIPTORS[location.ownerKind];
	return Object.freeze([
		descriptor.collection,
		'stableKey' in descriptor
			? createComparisonStableKeyPathSegment(
					descriptor.stableKey,
					location.ownerKey
				)
			: location.ownerKey,
		...location.fieldPath,
	]);
}

export function attachComparisonIssues(
	comparison: IResourcePackComparison,
	issues: readonly IResourcePackValidationIssue[],
	referenceLocations: readonly IResourcePackReferenceLocation[],
	options: IAttachComparisonIssuesOptions = {}
): IResourcePackComparison {
	const nodesByFieldPath = indexNodesByFieldPath(comparison.root);
	const issuesByNodeId = new Map<string, IComparisonIssueAttachment[]>();
	const referenceImpactsByNodeId = new Map<
		string,
		IComparisonReferenceImpact[]
	>();

	for (const issue of issues) {
		const targetNode = findDeepestNode(
			nodesByFieldPath,
			getValidationIssueFieldPath(issue)
		);
		appendMapValue(
			issuesByNodeId,
			targetNode.id,
			Object.freeze({
				category: issue.category,
				fieldPath: targetNode.fieldPath,
				message: issue.message,
				severity: issue.severity,
			})
		);
	}

	for (const location of referenceLocations) {
		const targetNode = findDeepestNode(
			nodesByFieldPath,
			getReferenceOwnerFieldPath(location)
		);
		appendMapValue(
			referenceImpactsByNodeId,
			targetNode.id,
			Object.freeze({
				fieldPath: Object.freeze([...location.fieldPath]),
				ownerKey: location.ownerKey,
				ownerKind: location.ownerKind,
				referencedKind:
					COMPARISON_REFERENCE_KINDS[location.referencedKind],
				referencedValue: location.referencedValue,
			})
		);
	}

	const attachedRoot = attachNodeMetadata(
		comparison.root,
		issuesByNodeId,
		referenceImpactsByNodeId
	);
	const root = options.includeUnchanged
		? attachedRoot
		: pruneUnchangedNodesWithoutIssues(attachedRoot, true);
	if (!root) {
		throw new Error('Comparison root must always be retained.');
	}

	return Object.freeze({
		nodesById: indexComparisonNodes(root),
		root,
		searchIndex: buildComparisonSearchIndex(root),
	});
}
