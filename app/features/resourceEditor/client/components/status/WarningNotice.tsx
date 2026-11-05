import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

interface IProps {
	children: ReactNode;
	className?: string;
}

export function WarningNotice({ children, className }: IProps) {
	return (
		<div
			className={cn(
				TYPOGRAPHY_STYLES.compactBody,
				'rounded-medium border border-warning/30 bg-warning/10 px-3 py-2',
				className
			)}
		>
			{children}
		</div>
	);
}
