import { cn } from '@heroui/theme';
import { type PropsWithChildren, type ReactNode } from 'react';

import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import { type TComparisonReviewCommandKind } from '@/features/resourceComparison/client/useComparisonCommand';
import { type IAssetComparisonPreviewSource } from '@/features/resourceComparison/client/useAssetComparison';
import { type useFieldComparison } from '@/features/resourceComparison/client/useFieldComparison';
import {
	type IComparisonNode,
	type IComparisonSnapshot,
} from '@/features/resourceComparison/domain/contracts';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';

import { ComparisonFilters } from './ComparisonFilters';
import { DifferenceNavigation } from './DifferenceNavigation';
import { FieldDifferenceTable } from './FieldDifferenceTable';
import { ResolvedDifferences } from './ResolvedDifferences';

interface IProps {
	assetPreviewSource: IAssetComparisonPreviewSource;
	fieldComparison: ReturnType<typeof useFieldComparison>;
	fullEditorDisabledReason: string | null;
	isHidden: boolean;
	isReacquiringEditor: boolean;
	isRightObserving: boolean;
	left: IComparisonSnapshot;
	navigationHeader?: ReactNode;
	onOpenAsset: (path: string) => void;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	onRequestCommand: (
		node: IComparisonNode,
		commandKind: TComparisonReviewCommandKind
	) => void;
	right: IComparisonSnapshot;
}

interface IComparisonWorkspaceLayoutProps extends PropsWithChildren {
	isHidden?: boolean;
}

export function ComparisonWorkspaceLayout({
	children,
	isHidden = false,
}: IComparisonWorkspaceLayoutProps) {
	return (
		<div
			className={cn(
				'grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:col-span-2 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.8fr)] lg:gap-8',
				isHidden && 'hidden'
			)}
		>
			{children}
		</div>
	);
}

export function ComparisonLayout({
	assetPreviewSource,
	fieldComparison,
	fullEditorDisabledReason,
	isHidden,
	isReacquiringEditor,
	isRightObserving,
	left,
	navigationHeader,
	onOpenAsset,
	onOpenFullEditor,
	onReacquireRightEditor,
	onRequestCommand,
	right,
}: IProps) {
	const handleIncludeUnchangedChange = (isSelected: boolean) => {
		fieldComparison.setIncludeUnchanged(isSelected);
		const hasUnchanged = fieldComparison.statuses.includes('unchanged');
		if (isSelected !== hasUnchanged) {
			fieldComparison.toggleStatus('unchanged');
		}
	};

	return (
		<ComparisonWorkspaceLayout isHidden={isHidden}>
			{(fieldComparison.resolvedDifferences.length > 0 ||
				fieldComparison.isUndoAvailable) && (
				<EditorPanel className="lg:col-span-2">
					<ResolvedDifferences
						isUndoAvailable={fieldComparison.isUndoAvailable}
						resolvedDifferences={
							fieldComparison.resolvedDifferences
						}
						onUndo={fieldComparison.undoLastChange}
					/>
				</EditorPanel>
			)}
			<EditorPanel
				as="aside"
				className="flex h-min min-h-0 flex-col gap-4 lg:sticky lg:top-24"
			>
				{navigationHeader}
				<ComparisonFilters
					hasIssuesOnly={fieldComparison.hasIssuesOnly}
					includeUnchanged={fieldComparison.includeUnchanged}
					query={fieldComparison.query}
					resourceType={fieldComparison.resourceType}
					statuses={fieldComparison.statuses}
					onHasIssuesOnlyChange={fieldComparison.setHasIssuesOnly}
					onIncludeUnchangedChange={handleIncludeUnchangedChange}
					onQueryChange={fieldComparison.setQuery}
					onResourceTypeChange={fieldComparison.setResourceType}
					onToggleStatus={fieldComparison.toggleStatus}
				/>
				<DifferenceNavigation
					comparison={fieldComparison.comparison}
					nodes={fieldComparison.visibleNodes}
					selectedIndex={fieldComparison.selectedIndex}
					selectedNodeId={fieldComparison.selectedNode?.id ?? null}
					onSelect={fieldComparison.selectNode}
					onSelectNext={() => fieldComparison.selectRelativeNode(1)}
					onSelectPrevious={() =>
						fieldComparison.selectRelativeNode(-1)
					}
				/>
			</EditorPanel>
			<EditorPanel>
				<FieldDifferenceTable
					actionError={fieldComparison.actionError}
					assetPreviewSource={assetPreviewSource}
					comparison={fieldComparison.comparison}
					fullEditorDisabledReason={fullEditorDisabledReason}
					isEditable={fieldComparison.isEditable}
					isReacquiringEditor={isReacquiringEditor}
					isRightObserving={isRightObserving}
					isValidating={fieldComparison.isValidating}
					left={left}
					nodes={fieldComparison.visibleNodes}
					selectionRequestVersion={
						fieldComparison.selectionRequestVersion
					}
					selectedIndex={fieldComparison.selectedIndex}
					selectedNode={fieldComparison.selectedNode}
					selectionRequestNodeId={
						fieldComparison.selectionRequestNodeId
					}
					total={fieldComparison.visibleNodes.length}
					onAdoptOld={fieldComparison.adoptOldValue}
					onActivate={fieldComparison.activateNode}
					onCommit={fieldComparison.commitNodeValue}
					onOpenAsset={onOpenAsset}
					onOpenFullEditor={onOpenFullEditor}
					onReacquireRightEditor={onReacquireRightEditor}
					onRemove={fieldComparison.removeNodeValue}
					onRequestCommand={onRequestCommand}
					right={right}
				/>
			</EditorPanel>
		</ComparisonWorkspaceLayout>
	);
}
