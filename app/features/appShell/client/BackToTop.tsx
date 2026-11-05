'use client';

import { cn } from '@heroui/theme';
import {
	memo,
	type SVGProps,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

const SCROLL_THRESHOLD = 300;
const SCROLL_COOLDOWN_MS = 1200;

function ChevronDown(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			{...props}
		>
			<path d="M6 9l6 6 6-6" />
		</svg>
	);
}

function ChevronUp(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			{...props}
		>
			<path d="M18 15l-6-6-6 6" />
		</svg>
	);
}

export const BackToTop = memo(function BackToTop() {
	const [isVisible, setIsVisible] = useState(false);
	const [isAtTop, setIsAtTop] = useState(true);
	const [bottomChrome, setBottomChrome] = useState(0);
	const savedPositionRef = useRef<number | null>(null);
	const isProgrammaticRef = useRef(false);
	const isReducedMotion = useReducedMotion();

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const update = () => {
			const chrome =
				window.innerHeight - viewport.offsetTop - viewport.height;
			setBottomChrome(Math.max(0, Math.round(chrome)));
		};
		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
		};
	}, []);

	useEffect(() => {
		const handleScroll = () => {
			const position = window.scrollY;
			setIsVisible(position > SCROLL_THRESHOLD);
			setIsAtTop(position < 10);
			if (
				!isProgrammaticRef.current &&
				savedPositionRef.current !== null &&
				position > 10
			) {
				savedPositionRef.current = null;
			}
		};
		handleScroll();
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	const scrollTo = useCallback(
		(top: number) => {
			isProgrammaticRef.current = true;
			window.scrollTo({
				top,
				behavior: isReducedMotion ? 'auto' : 'smooth',
			});
			window.setTimeout(
				() => {
					isProgrammaticRef.current = false;
				},
				isReducedMotion ? 0 : SCROLL_COOLDOWN_MS
			);
		},
		[isReducedMotion]
	);

	const handlePress = useCallback(() => {
		if (savedPositionRef.current !== null && window.scrollY < 10) {
			const position = savedPositionRef.current;
			savedPositionRef.current = null;
			scrollTo(position);
			return;
		}
		savedPositionRef.current = window.scrollY;
		scrollTo(0);
	}, [scrollTo]);

	const hasSavedPosition = savedPositionRef.current !== null;
	const isReturnMode = hasSavedPosition && isAtTop;
	const isShown = isVisible || hasSavedPosition;
	const actionLabel = isReturnMode ? '返回之前位置' : '回到顶部';

	return (
		<div
			className={cn(
				'fixed right-6 z-50 transition-all duration-200 motion-reduce:transition-none',
				isShown
					? 'translate-y-0 opacity-100'
					: 'pointer-events-none translate-y-4 opacity-0'
			)}
			style={{ bottom: `calc(1.5rem + ${bottomChrome}px)` }}
		>
			<Tooltip content={actionLabel}>
				<Button
					isIconOnly
					aria-label={actionLabel}
					variant="solid"
					color="primary"
					radius="full"
					className="h-10 w-10 shadow-lg"
					tabIndex={isShown ? undefined : -1}
					onPress={handlePress}
				>
					{isReturnMode ? (
						<ChevronDown className="h-[22px] w-[22px]" />
					) : (
						<ChevronUp className="h-[22px] w-[22px]" />
					)}
				</Button>
			</Tooltip>
		</div>
	);
});
