import { cn } from '@heroui/theme';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Heading from '@/design/ui/components/heading';

import type { IComparisonSnapshot } from '@/features/resourceComparison/domain/contracts';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import type { IWorkspaceSummary } from '@/features/resourceEditor/client/workspaces/contracts';

interface IProps {
	error?: string;
	isStale?: boolean;
	snapshot?: IComparisonSnapshot;
	status:
		| 'editable'
		| 'empty'
		| 'error'
		| 'invalid'
		| 'loading'
		| 'observing'
		| 'preset'
		| 'preparing'
		| 'ready';
	title: string;
	workspace?: IWorkspaceSummary;
}

function getSourceName(
	snapshot: IComparisonSnapshot | undefined,
	workspace: IWorkspaceSummary | undefined
) {
	if (workspace) return workspace.displayName;
	if (snapshot?.source.kind === 'archive') return snapshot.source.fileName;
	return '尚未选择';
}

export function ComparisonSourceSummary({
	error,
	isStale = false,
	snapshot,
	status,
	title,
	workspace,
}: IProps) {
	const packInfo = snapshot?.resourcePack.packInfo;
	const label =
		packInfo?.label?.trim() || workspace?.label?.trim() || 'Label未设置';
	const version =
		packInfo?.version?.trim() || workspace?.version?.trim() || '版本未设置';
	const StatusBadge =
		status === 'error' || status === 'invalid'
			? ErrorBadge
			: status === 'empty' ||
				  status === 'observing' ||
				  status === 'preset' ||
				  status === 'loading' ||
				  status === 'preparing' ||
				  isStale
				? WarningBadge
				: SuccessBadge;
	const statusLabel =
		status === 'editable'
			? '可编辑'
			: status === 'preset'
				? '已预填'
				: status === 'observing'
					? '观察中'
					: status === 'invalid'
						? '来源失效'
						: status === 'error'
							? '读取失败'
							: status === 'loading' || status === 'preparing'
								? '正在读取'
								: status === 'ready'
									? isStale
										? '来源有更新'
										: '只读'
									: '待选择';

	return (
		<div className="min-w-0">
			<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className={TYPOGRAPHY_STYLES.compactLabel}>{title}</p>
					<Heading
						as="h2"
						variant="card"
						title={getSourceName(snapshot, workspace)}
						className="truncate"
					>
						{getSourceName(snapshot, workspace)}
					</Heading>
				</div>
				<div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-nowrap sm:justify-end">
					<StatusBadge className="whitespace-nowrap">
						{statusLabel}
					</StatusBadge>
				</div>
			</div>
			{(snapshot || workspace) && (
				<div className="mt-4 grid grid-cols-2 gap-3 rounded-medium bg-content2/45 p-3">
					<p className={TYPOGRAPHY_STYLES.metadata}>Label：{label}</p>
					<p className={TYPOGRAPHY_STYLES.metadata}>
						版本：{version}
					</p>
				</div>
			)}
			{error && (
				<p
					role="alert"
					className={cn(TYPOGRAPHY_STYLES.body, 'mt-4 text-danger')}
				>
					{error}
				</p>
			)}
			{isStale && (
				<p
					className={cn(
						TYPOGRAPHY_STYLES.body,
						'mt-4 text-warning-700 dark:text-warning'
					)}
				>
					旧版工作区已有更新。当前对比仍使用原内容，可重新读取。
				</p>
			)}
		</div>
	);
}
