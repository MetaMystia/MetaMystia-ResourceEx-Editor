'use client';

import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import Button, { type IButtonProps } from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';

import { TrashIcon } from './TrashIcon';

interface IProps extends Omit<
	IButtonProps,
	'children' | 'color' | 'onPress' | 'size' | 'startContent' | 'variant'
> {
	children?: ReactNode;
	iconOnly?: boolean;
	confirmTitle?: ReactNode;
	confirmDescription?: ReactNode;
	onPress: () => void;
}

export const SectionDeleteButton = memo<IProps>(function SectionDeleteButton({
	children,
	className,
	confirmDescription,
	confirmTitle,
	iconOnly,
	onPress,
	...props
}) {
	const iconLabel =
		typeof props['aria-label'] === 'string'
			? props['aria-label']
			: typeof children === 'string'
				? children
				: '删除';
	const button = (
		<Button
			color="danger"
			variant="flat"
			size="sm"
			{...(iconOnly
				? { 'aria-label': iconLabel, isIconOnly: true }
				: { startContent: <TrashIcon className="h-4 w-4" /> })}
			className={cn(
				iconOnly
					? 'h-10 w-10 shrink-0 rounded-medium sm:h-8 sm:w-8'
					: 'h-10 rounded-medium px-3 text-sm sm:h-8 sm:text-xs',
				className
			)}
			{...(confirmTitle === undefined ? { onPress } : {})}
			{...props}
		>
			{iconOnly ? <TrashIcon className="h-4 w-4" /> : children}
		</Button>
	);

	const control =
		confirmTitle === undefined ? (
			button
		) : (
			<ConfirmPopover
				trigger={button}
				title={confirmTitle}
				description={
					<>
						{confirmDescription !== undefined && (
							<>
								{confirmDescription}
								<br />
							</>
						)}
						此操作不可撤销。
					</>
				}
				onConfirm={onPress}
			/>
		);

	return iconOnly ? (
		<Tooltip content={iconLabel}>
			<span className="inline-flex">{control}</span>
		</Tooltip>
	) : (
		control
	);
});
