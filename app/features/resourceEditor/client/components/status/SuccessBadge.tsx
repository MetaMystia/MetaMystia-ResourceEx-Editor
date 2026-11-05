import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

interface IProps {
	children: ReactNode;
	className?: string;
}

export function SuccessBadge({ children, className }: IProps) {
	return (
		<span
			className={cn(
				TYPOGRAPHY_STYLES.microLabel,
				'rounded-small bg-success px-1.5 py-0.5 text-success-foreground',
				className
			)}
		>
			{children}
		</span>
	);
}
