'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

const APPENDED_ITEM_SELECTOR = '[data-editor-appended-item]';
const EDITABLE_CONTROL_SELECTOR = [
	'input:not([disabled])',
	'textarea:not([disabled])',
	'[role="combobox"]:not([aria-disabled="true"])',
	'[data-slot="trigger"]:not([aria-disabled="true"])',
].join(', ');

export function useFocusOnItemInsert(
	itemCount: number,
	focusSelector = EDITABLE_CONTROL_SELECTOR
) {
	const isReducedMotion = useReducedMotion();
	const containerRef = useRef<HTMLDivElement>(null);
	const pendingItemIndexRef = useRef<number | null>(null);
	const previousItemCountRef = useRef(itemCount);
	const prepareFocusOnInsert = useCallback((itemIndex: number) => {
		pendingItemIndexRef.current = itemIndex;
	}, []);

	useEffect(() => {
		const previousItemCount = previousItemCountRef.current;
		previousItemCountRef.current = itemCount;
		if (itemCount <= previousItemCount) return;
		const pendingItemIndex = pendingItemIndexRef.current;
		pendingItemIndexRef.current = null;

		const frame = requestAnimationFrame(() => {
			const container = containerRef.current;
			if (!container) return;

			const items = Array.from(container.children).filter(
				(child): child is HTMLElement =>
					child instanceof HTMLElement &&
					child.matches(APPENDED_ITEM_SELECTOR)
			);
			const lastElement = container.lastElementChild;
			const targetItemIndex = Math.min(
				Math.max(pendingItemIndex ?? itemCount - 1, 0),
				items.length - 1
			);
			const appendedItem =
				items[targetItemIndex] ??
				(lastElement instanceof HTMLElement ? lastElement : null);
			if (!appendedItem) return;

			appendedItem
				.querySelector<HTMLElement>(focusSelector)
				?.focus({ preventScroll: true });
			appendedItem.scrollIntoView({
				behavior: isReducedMotion ? 'auto' : 'smooth',
				block: 'nearest',
				inline: 'nearest',
			});
		});

		return () => cancelAnimationFrame(frame);
	}, [focusSelector, isReducedMotion, itemCount]);

	return { containerRef, prepareFocusOnInsert };
}

export function useFocusOnItemAppend(itemCount: number) {
	return useFocusOnItemInsert(itemCount).containerRef;
}
