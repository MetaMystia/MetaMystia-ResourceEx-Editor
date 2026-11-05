import type { IComparisonSnapshot } from '@/features/resourceComparison/domain/contracts';
import type { IWorkspaceSummary } from '@/features/resourceEditor/client/workspaces/contracts';

export interface IComparisonStartupIntent {
	left: { snapshot: IComparisonSnapshot; workspace?: IWorkspaceSummary };
	rightWorkspace: IWorkspaceSummary;
}

let pendingComparisonStartupIntent: IComparisonStartupIntent | null = null;

export function publishComparisonStartupIntent(
	intent: IComparisonStartupIntent
) {
	pendingComparisonStartupIntent = intent;
}

export function consumeComparisonStartupIntent() {
	const intent = pendingComparisonStartupIntent;
	pendingComparisonStartupIntent = null;
	return intent;
}
