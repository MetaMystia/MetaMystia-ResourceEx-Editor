'use client';

import {
	extendVariants,
	type InternalForwardRefRenderFunction,
} from '@heroui/system';
import { cn } from '@heroui/theme';
import { Tooltip as HeroUITooltip } from '@heroui/tooltip';
import { type ComponentProps, memo, useMemo } from 'react';

import { useDesignPreferences } from '@/design/preferences/DesignPreferencesContext';
import { createRatingVariants } from '@/design/theme/styles/rating/createRatingVariants';
import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import { useMotionProps } from '@/design/ui/hooks/useMotionProps';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { getStyleBlur } from './popover';

const CustomHeroUITooltip = extendVariants(
	HeroUITooltip,
	createRatingVariants('content')
);

interface IProps extends ComponentProps<typeof CustomHeroUITooltip> {
	disableBlur?: boolean;
}

export default memo<IProps>(function Tooltip({
	classNames,
	color,
	disableAnimation,
	disableBlur,
	radius,
	showArrow,
	...props
}) {
	const motionProps = useMotionProps('tooltip');
	const isReducedMotion = useReducedMotion();
	const { isHighAppearance } = useDesignPreferences();

	const styleBlur = useMemo(
		() => getStyleBlur(color, disableBlur, isHighAppearance),
		[color, disableBlur, isHighAppearance]
	);

	return (
		<CustomHeroUITooltip
			color={color}
			disableAnimation={disableAnimation ?? isReducedMotion}
			motionProps={motionProps}
			// The same radius as `Popover`.
			radius={radius ?? 'lg'}
			showArrow={isHighAppearance ? false : Boolean(showArrow)}
			classNames={{
				...classNames,
				content: cn(
					TYPOGRAPHY_STYLES.overlayBody,
					'max-w-xs whitespace-pre-line',
					styleBlur,
					classNames?.content
				),
			}}
			{...props}
		/>
	);
}) as InternalForwardRefRenderFunction<'div', IProps>;

export type { IProps as ITooltipProps };
