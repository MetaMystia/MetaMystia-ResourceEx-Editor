'use client';

import { cn } from '@heroui/theme';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
	type CSSProperties,
	type ComponentProps,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Heading from '@/design/ui/components/heading';

import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import { type TComparisonReviewCommandKind } from '@/features/resourceComparison/client/useComparisonCommand';
import { type IAssetComparisonPreviewSource } from '@/features/resourceComparison/client/useAssetComparison';
import { useComparisonDesktopLayout } from '@/features/resourceComparison/client/useComparisonDesktopLayout';
import {
	type IComparisonNode,
	type IComparisonSnapshot,
	type IResourcePackComparison,
} from '@/features/resourceComparison/domain/contracts';
import { getComparisonNodeDisplayLabel } from '@/features/resourceComparison/domain/fieldComparison';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';

import { FieldDifferenceRow } from './FieldDifferenceRow';

interface IProps {
	actionError: string | null;
	assetPreviewSource: IAssetComparisonPreviewSource;
	comparison: IResourcePackComparison;
	fullEditorDisabledReason: string | null;
	isEditable: boolean;
	isReacquiringEditor: boolean;
	isRightObserving: boolean;
	isValidating: boolean;
	left: IComparisonSnapshot;
	nodes: readonly IComparisonNode[];
	selectionRequestNodeId: string | null;
	selectionRequestVersion: number;
	selectedIndex: number;
	selectedNode: IComparisonNode | undefined;
	total: number;
	onActivate: (nodeId: string) => boolean;
	onAdoptOld: (node: IComparisonNode) => void;
	onCommit: (node: IComparisonNode, value: unknown) => void;
	onOpenAsset: (path: string) => void;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	onRemove: (node: IComparisonNode) => boolean;
	onRequestCommand: (
		node: IComparisonNode,
		commandKind: TComparisonReviewCommandKind
	) => void;
	right: IComparisonSnapshot;
}

type TDesktopFieldDifferenceRowProps = ComponentProps<
	typeof FieldDifferenceRow
> & {
	dataIndex: number;
	isSelected: boolean;
	onActivate: (nodeId: string) => boolean;
	onMeasureElement: (element: HTMLDivElement | null) => void;
	style: CSSProperties;
};

const DesktopFieldDifferenceRow = memo(function DesktopFieldDifferenceRow({
	dataIndex,
	isSelected,
	node,
	onActivate,
	onMeasureElement,
	style,
	...rowProps
}: TDesktopFieldDifferenceRowProps) {
	return (
		<div
			ref={onMeasureElement}
			aria-current={isSelected ? 'true' : undefined}
			className="scroll-mt-[7.5rem]"
			data-comparison-field-row=""
			data-index={dataIndex}
			style={style}
			onFocusCapture={() => {
				if (isSelected) return;
				onActivate(node.id);
			}}
		>
			<EditorSection
				className={cn(isSelected && 'border-primary bg-primary/15')}
			>
				<FieldDifferenceRow node={node} {...rowProps} />
			</EditorSection>
		</div>
	);
});

export const FieldDifferenceTable = memo(function FieldDifferenceTable({
	actionError,
	assetPreviewSource,
	comparison,
	fullEditorDisabledReason,
	isEditable,
	isReacquiringEditor,
	isRightObserving,
	isValidating,
	left,
	nodes,
	onActivate,
	onAdoptOld,
	onCommit,
	onOpenAsset,
	onOpenFullEditor,
	onReacquireRightEditor,
	onRemove,
	onRequestCommand,
	right,
	selectedIndex,
	selectedNode,
	selectionRequestNodeId,
	selectionRequestVersion,
	total,
}: IProps) {
	const isDesktop = useComparisonDesktopLayout();
	const desktopListRef = useRef<HTMLDivElement>(null);
	const handledSelectionRequestVersionRef = useRef(selectionRequestVersion);
	const [expandedAssetPreviewNodeId, setExpandedAssetPreviewNodeId] =
		useState<string | null>(null);
	const expandedAssetPreviewNodeIdRef = useRef<string | null>(null);
	const mobileDetailRef = useRef<HTMLDivElement>(null);
	const [desktopListOffset, setDesktopListOffset] = useState(0);
	const selectedNodeId = selectedNode?.id ?? null;
	const fieldVirtualizer = useWindowVirtualizer<HTMLDivElement>({
		count: isDesktop ? nodes.length : 0,
		enabled: isDesktop,
		estimateSize: () => 320,
		gap: 16,
		getItemKey: (index) => nodes[index]?.id ?? index,
		overscan: 4,
		scrollMargin: desktopListOffset,
		scrollPaddingStart: 120,
	});
	const handleToggleAssetPreview = useCallback(
		(nodeId: string) => {
			const isCollapsing =
				expandedAssetPreviewNodeIdRef.current === nodeId;
			const nextNodeId = isCollapsing ? null : nodeId;
			expandedAssetPreviewNodeIdRef.current = nextNodeId;
			setExpandedAssetPreviewNodeId(nextNodeId);
			if (!isCollapsing) onActivate(nodeId);
		},
		[onActivate]
	);

	useLayoutEffect(() => {
		if (!isDesktop) {
			setDesktopListOffset(0);
			return;
		}

		const updateDesktopListOffset = () => {
			const listElement = desktopListRef.current;
			if (!listElement) return;
			const nextOffset =
				listElement.getBoundingClientRect().top + window.scrollY;
			setDesktopListOffset((currentOffset) =>
				Math.abs(currentOffset - nextOffset) < 0.5
					? currentOffset
					: nextOffset
			);
		};

		updateDesktopListOffset();
		window.addEventListener('resize', updateDesktopListOffset);
		return () => {
			window.removeEventListener('resize', updateDesktopListOffset);
		};
	}, [actionError, isDesktop, isValidating, nodes]);

	useEffect(() => {
		if (
			handledSelectionRequestVersionRef.current ===
			selectionRequestVersion
		)
			return;
		handledSelectionRequestVersionRef.current = selectionRequestVersion;
		if (!selectionRequestNodeId) return;

		if (isDesktop) {
			const selectedNodeIndex = nodes.findIndex(
				({ id }) => id === selectionRequestNodeId
			);
			if (selectedNodeIndex < 0) return;
			fieldVirtualizer.scrollToIndex(selectedNodeIndex, {
				align: 'start',
				behavior: 'auto',
			});
			return;
		}

		const frame = requestAnimationFrame(() => {
			const rowElement = mobileDetailRef.current;
			if (!rowElement || rowElement.getClientRects().length === 0) return;
			rowElement.scrollIntoView({ behavior: 'auto', block: 'start' });
		});
		return () => cancelAnimationFrame(frame);
	}, [
		fieldVirtualizer,
		isDesktop,
		nodes,
		selectionRequestNodeId,
		selectionRequestVersion,
	]);

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Heading as="h2" variant="panel">
					差异详情
				</Heading>
				<p
					aria-live="polite"
					className={TYPOGRAPHY_STYLES.subtleDescription}
				>
					{selectedNode
						? `共${total}项，当前第${selectedIndex + 1}项`
						: '没有可显示的差异'}
					{isValidating ? ' · 正在校验新版' : ''}
				</p>
			</div>
			{actionError && (
				<p className={`${TYPOGRAPHY_STYLES.compactBody} text-danger`}>
					{actionError}
				</p>
			)}
			{selectedNode ? (
				<>
					{!isDesktop && (
						<div ref={mobileDetailRef} className="scroll-mt-24">
							<FieldDifferenceRow
								assetPreviewSource={assetPreviewSource}
								comparison={comparison}
								displayLabel={getComparisonNodeDisplayLabel(
									comparison,
									selectedNode
								)}
								fullEditorDisabledReason={
									fullEditorDisabledReason
								}
								isEditable={isEditable}
								isReacquiringEditor={isReacquiringEditor}
								isRightObserving={isRightObserving}
								isAssetPreviewExpanded={
									expandedAssetPreviewNodeId ===
									selectedNode.id
								}
								left={left}
								node={selectedNode}
								onAdoptOld={onAdoptOld}
								onCommit={onCommit}
								onOpenAsset={onOpenAsset}
								onOpenFullEditor={onOpenFullEditor}
								onReacquireRightEditor={onReacquireRightEditor}
								onRemove={onRemove}
								onRequestCommand={onRequestCommand}
								onToggleAssetPreview={handleToggleAssetPreview}
								right={right}
							/>
						</div>
					)}
					{isDesktop && (
						<div
							ref={desktopListRef}
							className="relative w-full"
							style={{
								height: `${fieldVirtualizer.getTotalSize()}px`,
							}}
						>
							{fieldVirtualizer
								.getVirtualItems()
								.map((virtualRow) => {
									const node = nodes[virtualRow.index];
									if (!node) return null;
									return (
										<DesktopFieldDifferenceRow
											key={node.id}
											assetPreviewSource={
												assetPreviewSource
											}
											comparison={comparison}
											dataIndex={virtualRow.index}
											displayLabel={getComparisonNodeDisplayLabel(
												comparison,
												node
											)}
											fullEditorDisabledReason={
												fullEditorDisabledReason
											}
											isEditable={isEditable}
											isReacquiringEditor={
												isReacquiringEditor
											}
											isRightObserving={isRightObserving}
											isAssetPreviewExpanded={
												expandedAssetPreviewNodeId ===
												node.id
											}
											isSelected={
												node.id === selectedNodeId
											}
											left={left}
											node={node}
											onAdoptOld={onAdoptOld}
											onActivate={onActivate}
											onCommit={onCommit}
											onOpenAsset={onOpenAsset}
											onOpenFullEditor={onOpenFullEditor}
											onReacquireRightEditor={
												onReacquireRightEditor
											}
											onRemove={onRemove}
											onMeasureElement={
												fieldVirtualizer.measureElement
											}
											onRequestCommand={onRequestCommand}
											onToggleAssetPreview={
												handleToggleAssetPreview
											}
											right={right}
											style={{
												position: 'absolute',
												top: 0,
												transform: `translateY(${virtualRow.start - desktopListOffset}px)`,
												width: '100%',
											}}
										/>
									);
								})}
						</div>
					)}
				</>
			) : (
				<p className={TYPOGRAPHY_STYLES.subtleDescription}>
					请调整搜索或筛选条件，再选择差异项。
				</p>
			)}
		</div>
	);
});
