import { cn } from '@heroui/theme';
import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import { InfoTip } from './InfoTip';

interface IProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
	tip?: React.ReactNode;
	wrapperClassName?: string;
	size?: 'sm' | 'md';
}

export const Label = memo<IProps>(function Label({
	children,
	className,
	size = 'md',
	tip,
	wrapperClassName,
	...props
}) {
	return (
		<div
			className={cn('flex min-h-6 items-center gap-1', wrapperClassName)}
		>
			<label
				className={cn(
					size === 'sm'
						? TYPOGRAPHY_STYLES.compactLabel
						: TYPOGRAPHY_STYLES.fieldLabel,
					className
				)}
				{...props}
			>
				{children}
			</label>
			{tip !== undefined && <InfoTip>{tip}</InfoTip>}
		</div>
	);
});
