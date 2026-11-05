'use client';

import {
	memo,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';
import ScrollShadow from '@/design/ui/components/scrollShadow';
import Switch from '@/design/ui/components/switch';

import {
	type IAssetComparisonNode,
	type TAssetComparisonStatus,
} from '@/features/resourceComparison/client/files/assetComparisonTree';
import { type useAssetComparison } from '@/features/resourceComparison/client/useAssetComparison';
import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';

interface IProps {
	comparison: ReturnType<typeof useAssetComparison>;
	navigationHeader?: ReactNode;
}

const WINDOW_SIZE = 160;

function AssetStatusBadge({ status }: { status: TAssetComparisonStatus }) {
	if (status === 'added' || status === 'unchanged') {
		return (
			<SuccessBadge>{status === 'added' ? '新增' : '相同'}</SuccessBadge>
		);
	}
	if (status === 'modified' || status === 'unknown') {
		return (
			<WarningBadge>
				{status === 'modified' ? '修改' : '待校验'}
			</WarningBadge>
		);
	}
	return <ErrorBadge>移除</ErrorBadge>;
}

function describeNode(node: IAssetComparisonNode) {
	if (node.kind !== 'folder') return node.path;
	const counts = node.counts;
	const details = [
		counts.added > 0 ? `新增 ${counts.added}` : '',
		counts.modified > 0 ? `修改 ${counts.modified}` : '',
		counts.removed > 0 ? `移除 ${counts.removed}` : '',
		counts.unknown > 0 ? `待校验 ${counts.unknown}` : '',
		counts.unchanged > 0 ? `相同 ${counts.unchanged}` : '',
	].filter(Boolean);
	return details.length > 0 ? details.join(' · ') : node.path;
}

interface IAssetDifferenceTreeItemProps {
	description: string;
	isExpanded: boolean;
	isFolder: boolean;
	isSelected: boolean;
	name: string;
	path: string;
	status: TAssetComparisonStatus;
	onSelect: (path: string) => void;
	onToggleFolder: (path: string) => void;
}

const AssetDifferenceTreeItem = memo(function AssetDifferenceTreeItem({
	description,
	isExpanded,
	isFolder,
	isSelected,
	name,
	onSelect,
	onToggleFolder,
	path,
	status,
}: IAssetDifferenceTreeItemProps) {
	return (
		<EditorCollectionItem
			isSelected={isSelected}
			onSelect={() => onSelect(path)}
			actions={
				isFolder ? (
					<Button
						size="sm"
						variant="light"
						aria-label={`${isExpanded ? '收起' : '展开'}${path}`}
						aria-expanded={isExpanded}
						onPress={() => onToggleFolder(path)}
					>
						{isExpanded ? '收起' : '展开'}
					</Button>
				) : undefined
			}
		>
			<div aria-current={isSelected ? 'true' : undefined}>
				<EditorCollectionItemTitle>
					<AssetStatusBadge status={status} />
					<span className="min-w-0 break-all">{name}</span>
				</EditorCollectionItemTitle>
				<EditorCollectionItemMeta>
					{description}
				</EditorCollectionItemMeta>
			</div>
		</EditorCollectionItem>
	);
});

export function AssetDifferenceTree({ comparison, navigationHeader }: IProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const selectedPath = comparison.selectedNode?.path;
	const windowStart = Math.max(
		0,
		Math.min(
			Math.max(comparison.selectedIndex, 0) - Math.floor(WINDOW_SIZE / 2),
			Math.max(comparison.visibleNodes.length - WINDOW_SIZE, 0)
		)
	);
	const windowedNodes = useMemo(
		() =>
			comparison.visibleNodes.slice(
				windowStart,
				windowStart + WINDOW_SIZE
			),
		[comparison.visibleNodes, windowStart]
	);
	const visibleFilePaths = useMemo(
		() =>
			windowedNodes
				.filter((node) => node.kind !== 'folder')
				.map((node) => node.path),
		[windowedNodes]
	);

	useEffect(() => {
		comparison.setVisibleFilePaths(visibleFilePaths);
	}, [comparison.setVisibleFilePaths, visibleFilePaths]);
	useEffect(
		() => () => comparison.setVisibleFilePaths([]),
		[comparison.setVisibleFilePaths]
	);
	useLayoutEffect(() => {
		if (!selectedPath) return;
		const scrollContainer = scrollContainerRef.current;
		const selectedElement = scrollContainer?.querySelector<HTMLElement>(
			'[aria-current="true"]'
		);
		if (!scrollContainer || !selectedElement) return;

		const containerRect = scrollContainer.getBoundingClientRect();
		const selectedRect = selectedElement.getBoundingClientRect();
		const nextScrollTop =
			scrollContainer.scrollTop +
			selectedRect.top -
			containerRect.top -
			(containerRect.height - selectedRect.height) / 2;
		scrollContainer.scrollTo({ behavior: 'auto', top: nextScrollTop });
	}, [comparison.selectionRequestVersion, selectedPath, windowStart]);

	return (
		<EditorPanel as="aside" className="flex min-h-0 flex-col gap-4">
			{navigationHeader}
			<div className="flex items-center justify-between gap-3">
				<Heading as="h2" variant="panel">
					资产差异
				</Heading>
				<span
					className={TYPOGRAPHY_STYLES.subtleDescription}
					aria-live="polite"
				>
					{comparison.visibleNodes.length}项
					{comparison.isAnalyzing ? ' · 正在分析' : ''}
				</span>
			</div>
			{comparison.tree.root.counts.unknown > 0 && (
				<p className={TYPOGRAPHY_STYLES.subtleDescription}>
					同路径且大小一致的文件会在展开或选中时校验内容
				</p>
			)}
			<Input
				aria-label="搜索资产差异"
				placeholder="搜索文件或目录路径"
				value={comparison.query}
				onChange={(event) => comparison.setQuery(event.target.value)}
			/>
			<Switch
				isSelected={comparison.includeUnchanged}
				onValueChange={comparison.setIncludeUnchanged}
			>
				<span className={TYPOGRAPHY_STYLES.compactBody}>
					显示相同项
				</span>
			</Switch>
			<div className="grid grid-cols-2 gap-2">
				<Button
					fullWidth
					isDisabled={comparison.selectedIndex <= 0}
					variant="flat"
					onPress={() => comparison.selectRelativeNode(-1)}
				>
					上一项
				</Button>
				<Button
					fullWidth
					isDisabled={
						comparison.selectedIndex < 0 ||
						comparison.selectedIndex >=
							comparison.visibleNodes.length - 1
					}
					variant="flat"
					onPress={() => comparison.selectRelativeNode(1)}
				>
					下一项
				</Button>
			</div>
			<ScrollShadow
				ref={scrollContainerRef}
				className="max-h-[32rem]"
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						comparison.selectRelativeNode(-1);
					}
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						comparison.selectRelativeNode(1);
					}
				}}
			>
				<div className="flex flex-col gap-2">
					{comparison.visibleNodes.length > windowedNodes.length && (
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							显示第{windowStart + 1}–
							{windowStart + windowedNodes.length}项
						</p>
					)}
					{windowedNodes.map((node) => {
						const isSelected =
							node.path === comparison.selectedNode?.path;
						return (
							<AssetDifferenceTreeItem
								key={node.path}
								description={describeNode(node)}
								isExpanded={comparison.expandedFolders.has(
									node.path
								)}
								isFolder={node.kind === 'folder'}
								isSelected={isSelected}
								name={node.name}
								path={node.path}
								status={node.status}
								onSelect={comparison.selectPath}
								onToggleFolder={comparison.toggleFolder}
							/>
						);
					})}
					{comparison.visibleNodes.length === 0 && (
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							没有符合当前筛选条件的资产差异。
						</p>
					)}
				</div>
			</ScrollShadow>
			{comparison.analysisError && (
				<p
					className={`${TYPOGRAPHY_STYLES.compactDescription} text-danger`}
					role="alert"
				>
					{comparison.analysisError}
				</p>
			)}
		</EditorPanel>
	);
}
