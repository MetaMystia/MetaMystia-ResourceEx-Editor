'use client';

import { memo, type ReactNode } from 'react';

import { Button, type IButtonProps } from '@/design/ui/components';
import { cn } from '@/design/ui/utils';

import { TrashIcon } from '@/components/icons/Trash';

interface IProps extends Omit<
	IButtonProps,
	'children' | 'color' | 'variant' | 'size' | 'startContent'
> {
	children?: ReactNode;
	/** 仅显示图标（紧凑场景） */
	iconOnly?: boolean;
}

/**
 * 统一的"删除 X"按钮，danger flat 风格。
 */
export const SectionDeleteButton = memo<IProps>(function SectionDeleteButton({
	children,
	className,
	iconOnly,
	...props
}) {
	if (iconOnly) {
		return (
			<Button
				color="danger"
				variant="flat"
				size="sm"
				isIconOnly
				className={cn('h-8 w-8 rounded-md', className)}
				aria-label={typeof children === 'string' ? children : '删除'}
				{...props}
			>
				<TrashIcon className="h-3.5 w-3.5" />
			</Button>
		);
	}

	return (
		<Button
			color="danger"
			variant="flat"
			size="sm"
			startContent={<TrashIcon className="h-3.5 w-3.5" />}
			className={cn('h-8 rounded-md px-3 text-xs font-medium', className)}
			{...props}
		>
			{children}
		</Button>
	);
});
