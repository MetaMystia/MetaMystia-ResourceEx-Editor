import { cn } from '@heroui/theme';
import { memo, type PropsWithChildren } from 'react';

import Card from '@/design/ui/components/card';

interface IProps {
	className?: string;
	as?: 'aside' | 'section';
}

export const EditorPanel = memo<PropsWithChildren<IProps>>(
	function EditorPanel({ as = 'section', children, className }) {
		return (
			<Card
				as={as}
				fullWidth
				shadow="none"
				className={cn(
					'rounded-large border border-divider bg-content1/40 p-4 shadow-sm backdrop-blur',
					className
				)}
			>
				{children}
			</Card>
		);
	}
);
