import { cn } from '@heroui/theme';
import {
	Fragment,
	memo,
	type PropsWithChildren,
	useEffect,
	useRef,
} from 'react';

import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { EditorPanel } from './EditorPanel';
import { useEditorDetailKey } from './EditorWorkspace';

interface IProps {
	className?: string;
}

export const EditorDetailPanel = memo<PropsWithChildren<IProps>>(
	function EditorDetailPanel({ children, className }) {
		const detailKey = useEditorDetailKey();
		const detailTopRef = useRef<HTMLDivElement>(null);
		const isReducedMotion = useReducedMotion();

		useEffect(() => {
			if (detailKey === null || detailKey === undefined) return;
			const frame = requestAnimationFrame(() => {
				const detailTopElement = detailTopRef.current;
				if (!detailTopElement) return;

				const detailTop = detailTopElement.getBoundingClientRect().top;
				const scrollMarginTop =
					Number.parseFloat(
						window.getComputedStyle(detailTopElement)
							.scrollMarginTop
					) || 0;
				if (detailTop >= scrollMarginTop) return;

				window.scrollBy({
					behavior: isReducedMotion ? 'auto' : 'smooth',
					top: detailTop - scrollMarginTop,
				});
			});
			return () => cancelAnimationFrame(frame);
		}, [detailKey, isReducedMotion]);

		return (
			<EditorPanel className="min-w-0 lg:col-span-2">
				<div
					ref={detailTopRef}
					className={cn(
						'flex min-w-0 scroll-mt-24 flex-col gap-6 lg:scroll-mt-[7.5rem]',
						className
					)}
				>
					<Fragment key={detailKey}>{children}</Fragment>
				</div>
			</EditorPanel>
		);
	}
);
