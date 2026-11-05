import { type IComparisonSnapshot } from '@/features/resourceComparison/domain/contracts';

export function getComparisonSnapshotId(snapshot: IComparisonSnapshot) {
	return snapshot.source.kind === 'workspace'
		? JSON.stringify([
				'workspace',
				snapshot.source.workspaceId,
				snapshot.revision,
			])
		: JSON.stringify(['archive', snapshot.source.sourceId]);
}

export function createComparisonSourceKey(
	left: IComparisonSnapshot,
	right: IComparisonSnapshot
) {
	return JSON.stringify([
		left.source.kind === 'workspace'
			? ['workspace', left.source.workspaceId]
			: ['archive', left.source.sourceId],
		right.source.kind === 'workspace'
			? ['workspace', right.source.workspaceId]
			: ['archive', right.source.sourceId],
	]);
}
