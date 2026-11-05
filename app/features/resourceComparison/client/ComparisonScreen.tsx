'use client';

import { cn } from '@heroui/theme';
import Link from 'next/link';
import { memo, type ReactNode, useCallback, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import { EditorHeader } from '@/features/resourceEditor/client/components/layout/EditorHeader';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { WorkspaceRecoveryDialog } from '@/features/resourceEditor/client/workspaces/components/WorkspaceRecoveryDialog';

import { consumeComparisonStartupIntent } from './comparisonStartupIntent';
import { AssetDifferenceDetail } from './components/AssetDifferenceDetail';
import { AssetDifferenceTree } from './components/AssetDifferenceTree';
import { ComparisonCommandDialog } from './components/ComparisonCommandDialog';
import {
	ComparisonLayout,
	ComparisonWorkspaceLayout,
} from './components/ComparisonLayout';
import { ComparisonSourceSelector } from './components/ComparisonSourceSelector';
import { ComparisonSourceSummary } from './components/ComparisonSourceSummary';
import { ResolvedDifferences } from './components/ResolvedDifferences';
import {
	type IAssetComparisonPreviewSource,
	useAssetComparison,
} from './useAssetComparison';
import { useComparisonCommand } from './useComparisonCommand';
import {
	type IComparisonRightCopyCandidate,
	type TComparisonLeftState,
	type TComparisonRightState,
	useComparisonSession,
} from './useComparisonSession';
import { useFieldComparison } from './useFieldComparison';

type TComparisonView = 'assets' | 'fields';

interface IComparisonWorkspaceProps {
	commandController: ReturnType<typeof useComparisonCommand>;
	fullEditorDisabledReason: string | null;
	isReacquiringEditor: boolean;
	isYieldingEditor: boolean;
	left: Extract<TComparisonLeftState, { status: 'ready' }>;
	navigationHeader: ReactNode;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	right: Extract<TComparisonRightState, { status: 'editable' | 'observing' }>;
}

interface IComparisonFieldWorkspaceProps extends IComparisonWorkspaceProps {
	assetPreviewSource: IAssetComparisonPreviewSource;
	isHidden: boolean;
	onOpenAsset: (path: string) => void;
}

const ComparisonFieldWorkspace = memo(function ComparisonFieldWorkspace({
	assetPreviewSource,
	commandController,
	fullEditorDisabledReason,
	isHidden,
	isReacquiringEditor,
	isYieldingEditor,
	left,
	navigationHeader,
	onOpenAsset,
	onOpenFullEditor,
	onReacquireRightEditor,
	right,
}: IComparisonFieldWorkspaceProps) {
	const fieldComparison = useFieldComparison({
		isEditable: right.status === 'editable' && !isYieldingEditor,
		left: left.snapshot,
		right: right.snapshot,
	});
	return (
		<ComparisonLayout
			assetPreviewSource={assetPreviewSource}
			fieldComparison={fieldComparison}
			fullEditorDisabledReason={fullEditorDisabledReason}
			isHidden={isHidden}
			isReacquiringEditor={isReacquiringEditor}
			isRightObserving={right.status === 'observing'}
			left={left.snapshot}
			navigationHeader={navigationHeader}
			onOpenAsset={onOpenAsset}
			onOpenFullEditor={onOpenFullEditor}
			onReacquireRightEditor={onReacquireRightEditor}
			onRequestCommand={commandController.requestFieldCommand}
			right={right.snapshot}
		/>
	);
});

function ComparisonAssetWorkspace({
	assetComparison,
	commandController,
	fullEditorDisabledReason,
	isReacquiringEditor,
	isYieldingEditor,
	navigationHeader,
	onOpenFullEditor,
	onReacquireRightEditor,
	right,
}: IComparisonWorkspaceProps & {
	assetComparison: ReturnType<typeof useAssetComparison>;
}) {
	return (
		<ComparisonWorkspaceLayout>
			<AssetDifferenceTree
				comparison={assetComparison}
				navigationHeader={navigationHeader}
			/>
			<AssetDifferenceDetail
				comparison={assetComparison}
				fullEditorDisabledReason={fullEditorDisabledReason}
				isEditable={right.status === 'editable' && !isYieldingEditor}
				isReacquiringEditor={isReacquiringEditor}
				isRightObserving={right.status === 'observing'}
				onOpenFullEditor={onOpenFullEditor}
				onReacquireRightEditor={onReacquireRightEditor}
				onRequestCommand={(kind, path) => {
					const node = assetComparison.tree.nodesByPath.get(path);
					if (node) commandController.requestAssetCommand(kind, node);
				}}
			/>
		</ComparisonWorkspaceLayout>
	);
}

function ComparisonViewSwitch({
	onChange,
	view,
}: {
	onChange: (view: TComparisonView) => void;
	view: TComparisonView;
}) {
	return (
		<div className="grid grid-cols-2 gap-2" aria-label="对比视图">
			<Button
				aria-pressed={view === 'fields'}
				color={view === 'fields' ? 'primary' : 'default'}
				variant={view === 'fields' ? 'flat' : 'light'}
				onPress={() => onChange('fields')}
			>
				字段差异
			</Button>
			<Button
				aria-pressed={view === 'assets'}
				color={view === 'assets' ? 'primary' : 'default'}
				variant={view === 'assets' ? 'flat' : 'light'}
				onPress={() => onChange('assets')}
			>
				资产差异
			</Button>
		</div>
	);
}

interface IComparisonReadyWorkspaceProps {
	fullEditorDisabledReason: string | null;
	isReacquiringEditor: boolean;
	isYieldingEditor: boolean;
	left: Extract<TComparisonLeftState, { status: 'ready' }>;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	onSelectRightCopyCandidate: () => void;
	right: Extract<TComparisonRightState, { status: 'editable' | 'observing' }>;
	rightCopyCandidate: IComparisonRightCopyCandidate | null;
	sessionActionError: string | null;
}

function ComparisonReadyWorkspace({
	fullEditorDisabledReason,
	isReacquiringEditor,
	isYieldingEditor,
	left,
	onOpenFullEditor,
	onReacquireRightEditor,
	onSelectRightCopyCandidate,
	right,
	rightCopyCandidate,
	sessionActionError,
}: IComparisonReadyWorkspaceProps) {
	const [view, setView] = useState<TComparisonView>('fields');
	const assetComparison = useAssetComparison({
		left: left.snapshot,
		right: right.snapshot,
	});
	const commandController = useComparisonCommand({
		isEditable: right.status === 'editable' && !isYieldingEditor,
		left: left.snapshot,
		right: right.snapshot,
	});
	const navigationHeader = useMemo(
		() => <ComparisonViewSwitch onChange={setView} view={view} />,
		[view]
	);
	const handleOpenAsset = useCallback(
		(path: string) => {
			assetComparison.revealPath(path);
			setView('assets');
		},
		[assetComparison.revealPath]
	);
	const hasCommandStatus =
		commandController.actionError !== null ||
		commandController.isPlanning ||
		commandController.isUndoAvailable;
	return (
		<>
			<EditorPanel className="flex flex-col gap-3 lg:col-span-2">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<Heading as="h2" variant="panel">
							新版编辑权
						</Heading>
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							{isYieldingEditor
								? '正在保存新版并让出编辑权…'
								: right.status === 'observing'
									? '正在同步其他标签页保存的新版内容'
									: (fullEditorDisabledReason ??
										'从差异项打开完整编辑器后，对比页会继续同步保存结果。')}
						</p>
						{rightCopyCandidate && (
							<p className={TYPOGRAPHY_STYLES.metadata}>
								可用副本：
								{rightCopyCandidate.workspace.displayName}
							</p>
						)}
					</div>
					{(right.status === 'observing' || rightCopyCandidate) && (
						<div className="flex flex-wrap gap-2 sm:justify-end">
							{right.status === 'observing' && (
								<Button
									isDisabled={isReacquiringEditor}
									isLoading={isReacquiringEditor}
									variant="flat"
									onPress={onReacquireRightEditor}
								>
									{isReacquiringEditor
										? '正在获取编辑权'
										: '重新获取编辑权'}
								</Button>
							)}
							{rightCopyCandidate && (
								<Button
									color="primary"
									variant="flat"
									onPress={onSelectRightCopyCandidate}
								>
									将副本设为新版
								</Button>
							)}
						</div>
					)}
				</div>
				{sessionActionError && (
					<WarningNotice>{sessionActionError}</WarningNotice>
				)}
			</EditorPanel>
			{hasCommandStatus && (
				<EditorPanel className="lg:col-span-2">
					<div className="flex flex-col gap-3">
						{commandController.isPlanning && (
							<p
								aria-live="polite"
								className={TYPOGRAPHY_STYLES.description}
							>
								正在准备操作…
							</p>
						)}
						{commandController.actionError && (
							<WarningNotice>
								{commandController.actionError}
							</WarningNotice>
						)}
						<ResolvedDifferences
							isUndoAvailable={commandController.isUndoAvailable}
							resolvedDifferences={[]}
							onUndo={commandController.undoLastCommand}
						/>
					</div>
				</EditorPanel>
			)}
			<ComparisonFieldWorkspace
				assetPreviewSource={assetComparison.previewSource}
				commandController={commandController}
				fullEditorDisabledReason={fullEditorDisabledReason}
				isHidden={view !== 'fields'}
				isReacquiringEditor={isReacquiringEditor}
				isYieldingEditor={isYieldingEditor}
				left={left}
				navigationHeader={navigationHeader}
				onOpenAsset={handleOpenAsset}
				onOpenFullEditor={onOpenFullEditor}
				onReacquireRightEditor={onReacquireRightEditor}
				right={right}
			/>
			{view === 'assets' && (
				<ComparisonAssetWorkspace
					assetComparison={assetComparison}
					commandController={commandController}
					fullEditorDisabledReason={fullEditorDisabledReason}
					isReacquiringEditor={isReacquiringEditor}
					isYieldingEditor={isYieldingEditor}
					left={left}
					navigationHeader={navigationHeader}
					onOpenFullEditor={onOpenFullEditor}
					onReacquireRightEditor={onReacquireRightEditor}
					right={right}
				/>
			)}
			<ComparisonCommandDialog controller={commandController} />
		</>
	);
}

function getLeftSummaryProps(left: TComparisonLeftState) {
	if (left.status === 'ready') {
		return {
			isStale: left.isStale,
			snapshot: left.snapshot,
			status: left.status,
			...(left.workspace === undefined
				? {}
				: { workspace: left.workspace }),
		} as const;
	}
	if (left.status === 'error') {
		return { error: left.error, status: left.status } as const;
	}
	return { status: left.status } as const;
}

function getRightSummaryProps(right: TComparisonRightState) {
	if (right.status === 'preset') {
		return { status: right.status, workspace: right.workspace } as const;
	}
	if (right.status === 'editable' || right.status === 'observing') {
		return {
			snapshot: right.snapshot,
			status: right.status,
			workspace: right.workspace,
		} as const;
	}
	if (right.status === 'invalid') {
		return {
			error: right.error,
			status: right.status,
			...(right.snapshot === undefined
				? {}
				: { snapshot: right.snapshot }),
			...(right.workspace === undefined
				? {}
				: { workspace: right.workspace }),
		} as const;
	}
	if (right.status === 'error') {
		return { error: right.error, status: right.status } as const;
	}
	return { status: right.status } as const;
}

export function ComparisonScreen() {
	const [startupIntent] = useState(consumeComparisonStartupIntent);
	const session = useComparisonSession(startupIntent);
	const isLeftBusy = session.left.status === 'loading';
	const isRightBusy = session.right.status === 'preparing';
	const isLeftReady = session.left.status === 'ready';
	const isReady =
		isLeftReady &&
		(session.right.status === 'editable' ||
			session.right.status === 'observing');

	return (
		<>
			<EditorWorkspace columns={2}>
				<EditorHeader
					className="lg:col-span-2"
					title="资源包版本对比"
					description="先选择只读旧版，再选择或导入新版工作区。两侧Label必须完全一致。"
					actions={
						<Button as={Link} href="/" variant="flat">
							返回资源包管理
						</Button>
					}
				/>

				<ComparisonSourceSelector
					candidates={session.workspaces}
					description="选择工作区中的当前版本，或上传仅在本页读取的旧版资源包。旧版不会创建工作区或获取编辑权。"
					isBusy={isLeftBusy}
					isDisabled={isRightBusy}
					isSelected={session.left.status === 'ready'}
					overlayId="comparison.left-source"
					selectLabel="旧版"
					title="选择旧版"
					onSelectArchive={session.selectLeftArchive}
					onSelectWorkspace={session.selectLeftWorkspace}
					secondaryAction={
						session.left.status === 'ready' &&
						session.left.isStale &&
						session.left.snapshot.source.kind === 'workspace' ? (
							<Button
								fullWidth
								isDisabled={isRightBusy}
								variant="flat"
								onPress={() =>
									void session.reloadLeftWorkspace()
								}
							>
								重新读取旧版
							</Button>
						) : undefined
					}
				>
					<ComparisonSourceSummary
						title="旧版（只读）"
						{...getLeftSummaryProps(session.left)}
					/>
				</ComparisonSourceSelector>

				<ComparisonSourceSelector
					candidates={session.rightWorkspaceCandidates}
					description="选择Label相同且不是旧版来源的工作区，或上传新版资源包。上传内容会按现有流程导入并保存。"
					disabledReason={session.rightDisabledReason}
					isBusy={isRightBusy}
					isSelected={
						session.right.status === 'preset' ||
						session.right.status === 'editable' ||
						session.right.status === 'observing' ||
						session.right.status === 'invalid'
					}
					overlayId="comparison.right-source"
					selectLabel="新版"
					title="选择新版"
					onSelectArchive={session.importRightArchive}
					onSelectWorkspace={session.selectRightWorkspace}
				>
					<ComparisonSourceSummary
						title="新版工作区"
						{...getRightSummaryProps(session.right)}
					/>
				</ComparisonSourceSelector>

				{isReady &&
				session.left.status === 'ready' &&
				(session.right.status === 'editable' ||
					session.right.status === 'observing') ? (
					<ComparisonReadyWorkspace
						fullEditorDisabledReason={
							session.fullEditorDisabledReason
						}
						isYieldingEditor={session.isYieldingEditor}
						isReacquiringEditor={session.isReacquiringEditor}
						left={session.left}
						onOpenFullEditor={session.openRightInFullEditor}
						onReacquireRightEditor={session.reacquireRightEditor}
						onSelectRightCopyCandidate={
							session.selectRightCopyCandidate
						}
						right={session.right}
						rightCopyCandidate={session.rightCopyCandidate}
						sessionActionError={session.sessionActionError}
					/>
				) : (
					<EditorPanel className={cn('border-dashed lg:col-span-2')}>
						<Heading as="h2" variant="panel">
							{isLeftReady ? '请选择新版' : '请先选择有效的旧版'}
						</Heading>
						<p
							className={cn(
								TYPOGRAPHY_STYLES.subtleDescription,
								'mt-2'
							)}
						>
							{isLeftReady
								? '请选择或上传Label相同的新版资源包。'
								: '旧版读取成功且Label不为空后，才能选择新版。'}
						</p>
					</EditorPanel>
				)}
			</EditorWorkspace>

			<WorkspaceRecoveryDialog
				onContinue={() => undefined}
				onReturn={session.returnFromRecovery}
			/>
		</>
	);
}
