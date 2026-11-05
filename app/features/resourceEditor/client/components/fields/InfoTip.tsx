'use client';

import { InfoIcon } from '@heroui/shared-icons';
import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Popover, {
	PopoverContent,
	PopoverTrigger,
} from '@/design/ui/components/popover';
import Tooltip from '@/design/ui/components/tooltip';

interface IProps {
	children: ReactNode;
	className?: string;
}

export const InfoTip = memo<IProps>(function InfoTip({ children, className }) {
	return (
		<Popover showArrow offset={10} size="sm">
			<Tooltip content={children} showArrow size="sm">
				<span className="inline-flex">
					<PopoverTrigger>
						<Button
							isIconOnly
							size="sm"
							variant="light"
							aria-label="查看说明"
							className={cn(
								'h-6 min-h-6 w-6 min-w-6 shrink-0 rounded-medium text-foreground-500 data-[hover=true]:bg-default/40 data-[hover=true]:text-foreground',
								className
							)}
						>
							<InfoIcon className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
				</span>
			</Tooltip>
			<PopoverContent
				className={cn(
					TYPOGRAPHY_STYLES.overlayBody,
					'max-w-xs whitespace-pre-line'
				)}
			>
				{children}
			</PopoverContent>
		</Popover>
	);
});
