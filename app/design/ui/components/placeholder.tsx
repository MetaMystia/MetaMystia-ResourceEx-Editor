import { cn } from '@heroui/theme';
import { memo, type PropsWithChildren } from 'react';

interface IProps extends Pick<HTMLDivElementAttributes, 'className'> {}

export default memo<PropsWithChildren<IProps>>(function Placeholder({
	children,
	className,
}) {
	return (
		<div
			className={cn(
				'my-auto flex select-none flex-col items-center justify-center gap-1 text-center',
				className
			)}
		>
			{children}
		</div>
	);
});
