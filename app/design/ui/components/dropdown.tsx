'use client';

import {
	type DropdownProps,
	type DropdownTriggerProps,
	Dropdown as HeroUIDropdown,
	DropdownTrigger as HeroUIDropdownTrigger,
} from '@heroui/dropdown';
import { ChevronDownIcon } from '@heroui/shared-icons';
import { cn } from '@heroui/theme';
import {
	cloneElement,
	isValidElement,
	type JSX,
	memo,
	type ReactNode,
} from 'react';

import { useDesignPreferences } from '@/design/preferences/DesignPreferencesContext';
import { useMotionProps } from '@/design/ui/hooks/useMotionProps';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

interface IProps extends DropdownProps {}

interface IDropdownTriggerProps extends DropdownTriggerProps {
	showArrow?: boolean;
}

interface IDropdownTriggerChildProps {
	className?: string;
	endContent?: ReactNode;
}

export default memo<IProps>(function Dropdown({
	classNames,
	disableAnimation,
	shouldBlockScroll,
	shouldCloseOnScroll,
	showArrow,
	...props
}) {
	const motionProps = useMotionProps('popover');
	const isReducedMotion = useReducedMotion();
	const { isHighAppearance } = useDesignPreferences();

	return (
		<HeroUIDropdown
			disableAnimation={disableAnimation ?? isReducedMotion}
			motionProps={motionProps}
			shouldBlockScroll={Boolean(shouldBlockScroll)}
			shouldCloseOnScroll={Boolean(shouldCloseOnScroll)}
			showArrow={isHighAppearance ? false : Boolean(showArrow)}
			classNames={{
				...classNames,
				content: cn(
					'min-w-min',
					{
						'bg-content1/40 backdrop-blur-lg dark:bg-content1/70':
							isHighAppearance,
					},
					classNames?.content
				),
			}}
			{...props}
		/>
	);
}) as { (props: IProps): JSX.Element; displayName: string };

function DropdownTrigger({
	children,
	showArrow,
	...props
}: IDropdownTriggerProps) {
	const child = isValidElement<IDropdownTriggerChildProps>(children)
		? children
		: null;
	const triggerChild =
		showArrow && child
			? cloneElement(child, {
					className: cn(child.props.className, 'group'),
					endContent: (
						<span className="inline-flex items-center gap-1">
							{child.props.endContent}
							<ChevronDownIcon
								aria-hidden="true"
								className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
							/>
						</span>
					),
				})
			: children;

	return (
		<HeroUIDropdownTrigger {...props}>{triggerChild}</HeroUIDropdownTrigger>
	);
}

export type { IProps as IDropdownProps };
export type { IDropdownTriggerProps };

export { DropdownItem, DropdownMenu, DropdownSection } from '@heroui/dropdown';
export type {
	DropdownItemProps,
	DropdownMenuProps,
	DropdownSectionProps,
} from '@heroui/dropdown';

export { DropdownTrigger };
