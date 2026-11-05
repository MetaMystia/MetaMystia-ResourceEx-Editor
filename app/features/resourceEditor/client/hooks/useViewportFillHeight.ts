'use client';

import { type RefObject, useLayoutEffect } from 'react';

const WIDE_SCREEN_QUERY = '(min-width: 1024px)';

/**
 * 宽屏时让编辑器占满导航以下的窗口；导航下方的状态栏高度随屏宽和存储状态变化，按实际位置计算。
 * 窄屏时恢复自然高度。
 */
export function useViewportFillHeight(
	elementRef: RefObject<HTMLElement | null>,
	minHeightPx: number
) {
	useLayoutEffect(() => {
		const element = elementRef.current;
		if (!element) return;
		const query = window.matchMedia(WIDE_SCREEN_QUERY);
		const update = () => {
			if (!query.matches) {
				element.style.height = '';
				return;
			}
			const top = element.getBoundingClientRect().top + window.scrollY;
			element.style.height = `${Math.max(minHeightPx, Math.floor(window.innerHeight - top))}px`;
		};
		update();
		const observer = new ResizeObserver(update);
		for (
			let node = element.closest('main')?.previousElementSibling;
			node;
			node = node.previousElementSibling
		)
			observer.observe(node);
		window.addEventListener('resize', update);
		query.addEventListener('change', update);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', update);
			query.removeEventListener('change', update);
		};
	}, [elementRef, minHeightPx]);
}
