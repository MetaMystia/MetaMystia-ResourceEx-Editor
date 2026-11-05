import { type IComparisonNode, type IComparisonSearchEntry } from './contracts';

function normalizeComparisonSearchText(value: string): string {
	return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function getSearchableValue(value: unknown): string | null {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return String(value);
	}
	if (Array.isArray(value)) {
		const scalarValues = value.filter(
			(item): item is boolean | number | string =>
				typeof item === 'string' ||
				typeof item === 'number' ||
				typeof item === 'boolean'
		);
		if (scalarValues.length === value.length) {
			return scalarValues.map(String).join(' ');
		}
	}

	return null;
}

export function buildComparisonSearchIndex(
	root: IComparisonNode
): readonly IComparisonSearchEntry[] {
	const entries: IComparisonSearchEntry[] = [];
	const pendingNodes = [
		{ ancestorLabels: [] as readonly string[], node: root },
	];

	while (pendingNodes.length > 0) {
		const pending = pendingNodes.pop();
		if (!pending) {
			continue;
		}
		const { ancestorLabels, node } = pending;

		const values = [
			...ancestorLabels,
			node.label,
			node.rawFieldName,
			...node.fieldPath.map(String),
			node.navigationTarget?.stableKey,
			node.leftValue.isPresent
				? getSearchableValue(node.leftValue.value)
				: null,
			node.rightValue.isPresent
				? getSearchableValue(node.rightValue.value)
				: null,
		].filter(
			(value): value is number | string =>
				value !== null && value !== undefined
		);

		entries.push(
			Object.freeze({
				nodeId: node.id,
				searchText: normalizeComparisonSearchText(values.join(' ')),
			})
		);
		const childAncestorLabels =
			node.kind === 'entity' || node.kind === 'member'
				? [...ancestorLabels, node.label]
				: ancestorLabels;
		pendingNodes.push(
			...node.children
				.toReversed()
				.map((child) => ({
					ancestorLabels: childAncestorLabels,
					node: child,
				}))
		);
	}

	return Object.freeze(entries);
}

export function searchComparisonNodes(
	index: readonly IComparisonSearchEntry[],
	query: string
): readonly string[] {
	const normalizedQuery = normalizeComparisonSearchText(query);
	if (!normalizedQuery) {
		return Object.freeze(index.map(({ nodeId }) => nodeId));
	}

	const queryTerms = normalizedQuery.split(/\s+/u);
	return Object.freeze(
		index
			.filter(({ searchText }) =>
				queryTerms.every((term) => searchText.includes(term))
			)
			.map(({ nodeId }) => nodeId)
	);
}
