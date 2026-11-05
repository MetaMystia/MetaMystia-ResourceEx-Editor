import { cn } from '@heroui/theme';
import { type HTMLAttributes, memo, type PropsWithChildren } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

export type THeadingVariant =
	| 'card'
	| 'detail'
	| 'dialog'
	| 'empty'
	| 'navigation'
	| 'panel'
	| 'screen'
	| 'section'
	| 'subsection';

const HEADING_VARIANT_STYLES = {
	card: TYPOGRAPHY_STYLES.cardTitle,
	detail: TYPOGRAPHY_STYLES.detailTitle,
	dialog: TYPOGRAPHY_STYLES.dialogTitle,
	empty: TYPOGRAPHY_STYLES.emptyTitle,
	navigation: TYPOGRAPHY_STYLES.navigationTitle,
	panel: TYPOGRAPHY_STYLES.panelTitle,
	screen: TYPOGRAPHY_STYLES.screenTitle,
	section: TYPOGRAPHY_STYLES.sectionTitle,
	subsection: TYPOGRAPHY_STYLES.subsectionTitle,
} as const satisfies Record<THeadingVariant, string>;

interface IProps extends HTMLAttributes<HTMLHeadingElement> {
	as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
	variant: THeadingVariant;
}

export default memo<PropsWithChildren<IProps>>(function Heading({
	as: Component = 'h1',
	children,
	className,
	variant,
	...props
}) {
	return (
		<Component
			{...props}
			className={cn(
				HEADING_VARIANT_STYLES[variant],
				'break-words',
				className
			)}
		>
			{children}
		</Component>
	);
});
