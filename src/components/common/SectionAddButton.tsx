'use client';

import { memo, type ReactNode } from 'react';

import { Button, type IButtonProps } from '@/design/ui/components';
import { cn } from '@/design/ui/utils';

import { PlusIcon } from '@/components/icons/Plus';

interface IProps extends Omit<
	IButtonProps,
	'children' | 'color' | 'variant' | 'size' | 'startContent'
> {
	children: ReactNode;
}

/**
 * 统一的"添加 X"按钮，用于 EditorField.actions 槽 / section 头右侧。
 * 视觉权重低于页面级 primary CTA：flat 浅底 + 主色文字。
 */
export const SectionAddButton = memo<IProps>(function SectionAddButton({
	children,
	className,
	...props
}) {
	return (
		<Button
			color="primary"
			variant="flat"
			size="sm"
			startContent={<PlusIcon className="h-3.5 w-3.5" />}
			className={cn('h-8 rounded-md px-3 text-xs font-medium', className)}
			{...props}
		>
			{children}
		</Button>
	);
});
