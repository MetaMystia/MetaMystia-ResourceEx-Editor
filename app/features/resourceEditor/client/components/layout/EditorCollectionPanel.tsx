'use client';

import { memo, type ReactNode, useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';

import { EditorCollapsiblePanel } from './EditorCollapsiblePanel';
import { EmptyState } from './EmptyState';

interface IProps {
	addLabel: string;
	allowsStickyContent?: boolean;
	children: ReactNode;
	className?: string;
	emptyDescription?: ReactNode;
	emptyTitle: ReactNode;
	hasItems: boolean;
	onAdd: () => void;
	title: ReactNode;
}

export const EditorCollectionPanel = memo<IProps>(
	function EditorCollectionPanel({
		addLabel,
		allowsStickyContent,
		children,
		className,
		emptyDescription,
		emptyTitle,
		hasItems,
		onAdd,
		title,
	}) {
		const isReducedMotion = useReducedMotion();
		const scrollContainerRef = useRef<HTMLDivElement>(null);
		const pendingItemCountRef = useRef<number | null>(null);
		const [isCollapsed, setIsCollapsed] = useState(false);

		useEffect(() => {
			const pendingItemCount = pendingItemCountRef.current;
			const scrollContainer = scrollContainerRef.current;
			if (pendingItemCount === null || !scrollContainer) return;

			const itemCount = scrollContainer.querySelectorAll(
				'[data-editor-collection-item]'
			).length;
			const selectedItem = scrollContainer.querySelector<HTMLElement>(
				'[data-editor-collection-item][data-selected="true"]'
			);
			if (itemCount <= pendingItemCount || !selectedItem) return;

			pendingItemCountRef.current = null;
			const frame = requestAnimationFrame(() => {
				const currentScrollContainer = scrollContainerRef.current;
				if (!currentScrollContainer) return;

				const containerRect =
					currentScrollContainer.getBoundingClientRect();
				const selectedItemRect = selectedItem.getBoundingClientRect();
				let nextScrollTop = currentScrollContainer.scrollTop;

				if (selectedItemRect.top < containerRect.top) {
					nextScrollTop += selectedItemRect.top - containerRect.top;
				} else if (selectedItemRect.bottom > containerRect.bottom) {
					nextScrollTop +=
						selectedItemRect.bottom - containerRect.bottom;
				} else {
					return;
				}

				currentScrollContainer.scrollTo({
					behavior: isReducedMotion ? 'auto' : 'smooth',
					top: nextScrollTop,
				});
			});

			return () => cancelAnimationFrame(frame);
		});

		return (
			<EditorCollapsiblePanel
				{...(allowsStickyContent === undefined
					? {}
					: { allowsStickyContent })}
				actions={
					<SectionAddButton
						onPress={() => {
							pendingItemCountRef.current =
								scrollContainerRef.current?.querySelectorAll(
									'[data-editor-collection-item]'
								).length ?? 0;
							setIsCollapsed(false);
							onAdd();
						}}
					>
						{addLabel}
					</SectionAddButton>
				}
				{...(className === undefined ? {} : { className })}
				isCollapsed={isCollapsed}
				onCollapsedChange={setIsCollapsed}
				scrollContainerRef={scrollContainerRef}
				title={title}
			>
				{hasItems ? (
					<div className="flex flex-col gap-2">{children}</div>
				) : (
					<EmptyState
						title={emptyTitle}
						description={
							emptyDescription ?? `使用“${addLabel}”添加第一项`
						}
					/>
				)}
			</EditorCollapsiblePanel>
		);
	}
);
