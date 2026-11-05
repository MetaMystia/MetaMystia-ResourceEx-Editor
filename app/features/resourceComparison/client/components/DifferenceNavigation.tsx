'use client';

import { cn } from '@heroui/theme';
import { memo, useLayoutEffect, useRef } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import ScrollShadow from '@/design/ui/components/scrollShadow';

import {
	type IComparisonNode,
	type IResourcePackComparison,
	type TComparisonDifferenceStatus,
} from '@/features/resourceComparison/domain/contracts';
import { getComparisonNodeDisplayLabel } from '@/features/resourceComparison/domain/fieldComparison';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';

interface IProps {
	comparison: IResourcePackComparison;
	nodes: readonly IComparisonNode[];
	selectedIndex: number;
	selectedNodeId: string | null;
	onSelect: (nodeId: string) => void;
	onSelectNext: () => void;
	onSelectPrevious: () => void;
}

interface IDifferenceNavigationItemProps {
	displayLabel: string;
	isSelected: boolean;
	nodeId: string;
	status: TComparisonDifferenceStatus;
	onSelect: (nodeId: string) => void;
}

function ComparisonStatusBadge({
	status,
}: {
	status: TComparisonDifferenceStatus;
}) {
	if (status === 'added' || status === 'unchanged') {
		return (
			<SuccessBadge className="shrink-0 whitespace-nowrap">
				{status === 'added' ? '新增' : '相同'}
			</SuccessBadge>
		);
	}
	if (status === 'modified') {
		return (
			<WarningBadge className="shrink-0 whitespace-nowrap">
				修改
			</WarningBadge>
		);
	}
	return (
		<ErrorBadge className="shrink-0 whitespace-nowrap">
			{status === 'removed' ? '移除' : '无法匹配'}
		</ErrorBadge>
	);
}

const DifferenceNavigationItem = memo(function DifferenceNavigationItem({
	displayLabel,
	isSelected,
	nodeId,
	onSelect,
	status,
}: IDifferenceNavigationItemProps) {
	return (
		<Button
			fullWidth
			aria-current={isSelected ? 'true' : undefined}
			className="h-auto min-h-10 justify-start whitespace-normal text-left"
			color={isSelected ? 'primary' : 'default'}
			variant={isSelected ? 'flat' : 'light'}
			onPress={() => onSelect(nodeId)}
		>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<ComparisonStatusBadge status={status} />
				<span className={cn(TYPOGRAPHY_STYLES.compactBody, 'truncate')}>
					{displayLabel}
				</span>
			</span>
		</Button>
	);
});

export function DifferenceNavigation({
	comparison,
	nodes,
	onSelect,
	onSelectNext,
	onSelectPrevious,
	selectedIndex,
	selectedNodeId,
}: IProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const previousSelectedNodeIdRef = useRef(selectedNodeId);
	const windowAnchorNodeIdRef = useRef<string | null>(selectedNodeId);
	if (previousSelectedNodeIdRef.current !== selectedNodeId) {
		previousSelectedNodeIdRef.current = selectedNodeId;
		windowAnchorNodeIdRef.current = selectedNodeId;
	}
	let windowAnchorIndex = windowAnchorNodeIdRef.current
		? nodes.findIndex(({ id }) => id === windowAnchorNodeIdRef.current)
		: -1;
	if (windowAnchorIndex < 0) {
		windowAnchorNodeIdRef.current = selectedNodeId;
		windowAnchorIndex = selectedIndex;
	}
	const windowSize = 160;
	const windowStart = Math.max(
		0,
		Math.min(
			Math.max(windowAnchorIndex, 0) - Math.floor(windowSize / 2),
			Math.max(nodes.length - windowSize, 0)
		)
	);
	const windowedNodes = nodes.slice(windowStart, windowStart + windowSize);

	useLayoutEffect(() => {
		if (!selectedNodeId) return;
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
	}, [selectedNodeId, windowStart]);

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<Heading as="h2" variant="panel">
					字段差异
				</Heading>
				<span className={TYPOGRAPHY_STYLES.subtleDescription}>
					{nodes.length}项
				</span>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button
					fullWidth
					isDisabled={selectedIndex <= 0}
					variant="flat"
					onPress={onSelectPrevious}
				>
					上一项
				</Button>
				<Button
					fullWidth
					isDisabled={
						selectedIndex < 0 || selectedIndex >= nodes.length - 1
					}
					variant="flat"
					onPress={onSelectNext}
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
						onSelectPrevious();
					}
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						onSelectNext();
					}
				}}
			>
				<div className="flex flex-col gap-2">
					{nodes.length > windowedNodes.length && (
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							显示第{windowStart + 1}–
							{windowStart + windowedNodes.length}项
						</p>
					)}
					{windowedNodes.map((node) => {
						const isSelected = node.id === selectedNodeId;
						return (
							<DifferenceNavigationItem
								key={node.id}
								displayLabel={getComparisonNodeDisplayLabel(
									comparison,
									node
								)}
								isSelected={isSelected}
								nodeId={node.id}
								status={node.status}
								onSelect={onSelect}
							/>
						);
					})}
					{nodes.length === 0 && (
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							没有符合当前筛选条件的差异
						</p>
					)}
				</div>
			</ScrollShadow>
		</div>
	);
}
