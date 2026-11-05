'use client';

import { cn } from '@heroui/theme';
import { memo, type ReactNode, type RefObject, useId } from 'react';

import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import ScrollShadow from '@/design/ui/components/scrollShadow';
import Tooltip from '@/design/ui/components/tooltip';

import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';

import { EditorPanel } from './EditorPanel';

interface IProps {
	actions?: ReactNode;
	allowsStickyContent?: boolean;
	children: ReactNode;
	className?: string;
	isCollapsed: boolean;
	onCollapsedChange: (isCollapsed: boolean) => void;
	scrollContainerRef?: RefObject<HTMLDivElement | null>;
	title: ReactNode;
}

export const EditorCollapsiblePanel = memo<IProps>(
	function EditorCollapsiblePanel({
		actions,
		allowsStickyContent = false,
		children,
		className,
		isCollapsed,
		onCollapsedChange,
		scrollContainerRef,
		title,
	}) {
		const contentId = useId();
		const titleId = useId();

		return (
			<EditorPanel
				as="aside"
				className={cn(
					'flex h-min min-w-0 flex-col gap-0 lg:sticky lg:top-24 lg:max-h-[calc(var(--safe-h-dvh)_-_7rem)] lg:gap-4 lg:overflow-hidden',
					className
				)}
			>
				<div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2">
					<Heading
						as="h2"
						id={titleId}
						variant="panel"
						className="min-w-0"
					>
						{title}
					</Heading>
					<div className="flex shrink-0 items-center gap-1.5">
						<Tooltip
							content={isCollapsed ? '展开列表' : '折叠列表'}
						>
							<Button
								isIconOnly
								variant="light"
								size="sm"
								className="h-10 w-10 lg:hidden"
								onPress={() => onCollapsedChange(!isCollapsed)}
								aria-controls={contentId}
								aria-expanded={!isCollapsed}
								aria-label={
									isCollapsed ? '展开列表' : '折叠列表'
								}
							>
								<ChevronRight
									className={cn(
										'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
										isCollapsed ? '-rotate-90' : 'rotate-90'
									)}
								/>
							</Button>
						</Tooltip>
						{actions}
					</div>
				</div>

				<ScrollShadow
					isEnabled={!allowsStickyContent}
					{...(scrollContainerRef === undefined
						? {}
						: { ref: scrollContainerRef })}
					aria-labelledby={titleId}
					className={cn(
						'min-h-0 lg:flex-1',
						allowsStickyContent &&
							'overflow-visible lg:overflow-y-auto'
					)}
				>
					<div
						id={contentId}
						className={cn(
							'grid transition-[grid-template-rows] motion-reduce:transition-none',
							allowsStickyContent
								? isCollapsed
									? 'overflow-hidden lg:overflow-visible'
									: 'overflow-visible'
								: 'overflow-hidden lg:overflow-x-auto',
							isCollapsed
								? 'grid-rows-[0fr] lg:grid-rows-[1fr]'
								: 'grid-rows-[1fr]'
						)}
					>
						<div className="min-h-0 min-w-0">
							<div className="pt-4 lg:pt-0">{children}</div>
						</div>
					</div>
				</ScrollShadow>
			</EditorPanel>
		);
	}
);
