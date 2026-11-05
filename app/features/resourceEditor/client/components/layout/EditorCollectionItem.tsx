'use client';

import { cn } from '@heroui/theme';
import { memo, type PropsWithChildren, type ReactNode, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

interface IProps {
	actions?: ReactNode;
	className?: string;
	isInvalid?: boolean;
	isSelected?: boolean;
	onSelect: () => void;
}

export const EditorCollectionItem = memo<PropsWithChildren<IProps>>(
	function EditorCollectionItem({
		actions,
		children,
		className,
		isInvalid,
		isSelected,
		onSelect,
	}) {
		const [isPressed, setIsPressed] = useState(false);

		return (
			<div
				className={cn(
					'group flex min-w-0 transform-gpu items-stretch overflow-hidden rounded-medium border transition-[background-color,border-color,filter,transform] motion-reduce:transition-colors',
					isPressed &&
						'scale-[0.98] brightness-90 motion-reduce:scale-100 motion-reduce:brightness-100',
					isInvalid
						? isSelected
							? 'border-danger bg-danger/15'
							: 'border-danger/40 bg-danger/10'
						: isSelected
							? 'border-primary bg-primary/15'
							: 'border-divider bg-content1/20',
					className
				)}
				data-editor-collection-item=""
				data-selected={isSelected || undefined}
			>
				<Button
					variant="light"
					onPress={onSelect}
					onPressChange={setIsPressed}
					className={cn(
						'h-auto min-h-20 min-w-0 flex-1 justify-start rounded-none px-4 py-3 text-left text-foreground data-[pressed=true]:!scale-100 data-[hover=true]:!backdrop-blur-none data-[pressed=true]:!backdrop-blur-none',
						isSelected
							? 'data-[hover=true]:!bg-transparent data-[pressed=true]:!bg-transparent'
							: isInvalid
								? 'data-[hover=true]:!bg-danger/15 data-[pressed=true]:!bg-danger/20'
								: 'data-[hover=true]:!bg-default/30 data-[pressed=true]:!bg-default/40'
					)}
				>
					<div className="w-full min-w-0">{children}</div>
				</Button>
				{actions !== undefined && (
					<div className="flex shrink-0 items-center justify-center gap-1 border-l border-divider p-2">
						{actions}
					</div>
				)}
			</div>
		);
	}
);

export function EditorCollectionItemTitle({
	children,
	className,
}: PropsWithChildren<{ className?: string }>) {
	return (
		<div
			className={cn(
				TYPOGRAPHY_STYLES.itemTitle,
				'flex min-w-0 flex-wrap items-start gap-2 text-clip whitespace-normal break-all',
				className
			)}
		>
			{children}
		</div>
	);
}

export function EditorCollectionItemMeta({
	children,
	className,
}: PropsWithChildren<{ className?: string }>) {
	return (
		<div
			className={cn(
				TYPOGRAPHY_STYLES.metadata,
				'mt-1 min-w-0 whitespace-normal',
				className
			)}
		>
			{children}
		</div>
	);
}
