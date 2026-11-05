import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Heading from '@/design/ui/components/heading';

interface IProps {
	actions?: ReactNode;
	className?: string;
	description?: ReactNode;
	meta?: ReactNode;
	title: ReactNode;
}

export const EditorDetailHeader = memo<IProps>(function EditorDetailHeader({
	actions,
	className,
	description,
	meta,
	title,
}) {
	return (
		<header
			className={cn(
				'flex min-w-0 flex-col gap-3 border-b border-divider pb-4 sm:flex-row sm:items-center sm:justify-between',
				className
			)}
		>
			<div className="min-w-0 space-y-1">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Heading as="h2" variant="detail" className="min-w-0">
						{title}
					</Heading>
					{meta}
				</div>
				{description !== undefined && (
					<p className={TYPOGRAPHY_STYLES.description}>
						{description}
					</p>
				)}
			</div>
			{actions !== undefined && (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			)}
		</header>
	);
});
