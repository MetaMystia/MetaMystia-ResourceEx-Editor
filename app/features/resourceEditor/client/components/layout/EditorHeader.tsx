import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Card from '@/design/ui/components/card';
import Heading from '@/design/ui/components/heading';

interface IProps {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}

export const EditorHeader = memo<IProps>(function EditorHeader({
	actions,
	className,
	description,
	title,
}) {
	return (
		<Card
			as="header"
			fullWidth
			shadow="none"
			className={cn(
				'flex flex-col gap-3 rounded-large border border-divider bg-content1/40 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between',
				className
			)}
		>
			<div className="min-w-0 space-y-1">
				<Heading variant="screen">{title}</Heading>
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
		</Card>
	);
});
