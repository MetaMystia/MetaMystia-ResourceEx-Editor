import { cn } from '@heroui/theme';
import { memo, type PropsWithChildren, type ReactNode } from 'react';

import Heading from '@/design/ui/components/heading';

interface IProps {
	actions?: ReactNode;
	className?: string;
	title?: ReactNode;
}

export const EditorSection = memo<PropsWithChildren<IProps>>(
	function EditorSection({ actions, children, className, title }) {
		return (
			<section
				className={cn(
					'flex min-w-0 flex-col gap-4 rounded-medium border border-divider bg-content1/20 p-4',
					className
				)}
			>
				{(title !== undefined || actions !== undefined) && (
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
						{title !== undefined && (
							<Heading
								as="h3"
								variant="section"
								className="min-w-0"
							>
								{title}
							</Heading>
						)}
						{actions !== undefined && (
							<div className="flex shrink-0 flex-wrap items-center gap-2">
								{actions}
							</div>
						)}
					</div>
				)}
				{children}
			</section>
		);
	}
);
