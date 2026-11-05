import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

interface IProps {
	label?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	labelClassName?: string;
}

export function EditorField({
	actions,
	children,
	className,
	label,
	labelClassName,
}: IProps) {
	return (
		<div className={cn('flex flex-col gap-2', className)}>
			{(label || actions) && (
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					{label && (
						<label
							className={cn(
								TYPOGRAPHY_STYLES.fieldLabel,
								'min-w-0',
								labelClassName
							)}
						>
							{label}
						</label>
					)}
					{actions}
				</div>
			)}
			{children}
		</div>
	);
}
