import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Placeholder from '@/design/ui/components/placeholder';

interface IProps {
	title: ReactNode;
	description?: ReactNode;
	className?: string;
	variant?: 'box' | 'text';
}

export function EmptyState({
	className,
	description,
	title,
	variant = 'box',
}: IProps) {
	return (
		<Placeholder
			className={cn(
				variant === 'box' &&
					'min-h-32 rounded-medium border border-dashed border-divider bg-content1/15 p-6 sm:p-8',
				className
			)}
		>
			<p className={TYPOGRAPHY_STYLES.emptyTitle}>{title}</p>
			{description !== undefined && (
				<p
					className={cn(
						TYPOGRAPHY_STYLES.emptyDescription,
						'max-w-prose'
					)}
				>
					{description}
				</p>
			)}
		</Placeholder>
	);
}
