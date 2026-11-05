import {
	type IComparisonDifferenceCounts,
	type IComparisonNode,
	type TComparisonDifferenceStatus,
} from './contracts';

const DIFFERENCE_STATUSES = [
	'added',
	'ambiguous',
	'modified',
	'removed',
	'unchanged',
] as const satisfies readonly TComparisonDifferenceStatus[];

export function createComparisonDifferenceCounts(
	status: TComparisonDifferenceStatus,
	children: readonly IComparisonNode[]
): IComparisonDifferenceCounts {
	const counts: IComparisonDifferenceCounts = {
		added: 0,
		ambiguous: 0,
		modified: 0,
		removed: 0,
		unchanged: 0,
	};

	if (children.length === 0) {
		counts[status] = 1;
		return counts;
	}

	for (const child of children) {
		for (const differenceStatus of DIFFERENCE_STATUSES) {
			counts[differenceStatus] += child.counts[differenceStatus];
		}
	}

	return counts;
}

export function deriveComparisonParentStatus(
	children: readonly IComparisonNode[]
): TComparisonDifferenceStatus {
	return children.some(({ status }) => status !== 'unchanged')
		? 'modified'
		: 'unchanged';
}

export function pruneUnchangedComparisonNode(
	node: IComparisonNode,
	isRoot = false
): IComparisonNode | null {
	if (!isRoot && node.status === 'unchanged') {
		return null;
	}

	const children = node.children.flatMap((child) => {
		const retainedChild = pruneUnchangedComparisonNode(child);
		return retainedChild ? [retainedChild] : [];
	});

	return Object.freeze({ ...node, children: Object.freeze(children) });
}

export function indexComparisonNodes(
	root: IComparisonNode
): ReadonlyMap<string, IComparisonNode> {
	const nodesById = new Map<string, IComparisonNode>();
	const pendingNodes = [root];

	while (pendingNodes.length > 0) {
		const node = pendingNodes.pop();
		if (!node) {
			continue;
		}

		nodesById.set(node.id, node);
		pendingNodes.push(...node.children.toReversed());
	}

	return nodesById;
}
