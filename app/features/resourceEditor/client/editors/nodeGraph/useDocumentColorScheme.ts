'use client';

import { useSyncExternalStore } from 'react';

import { THEME_MAP } from '@/design/theme/runtime/constants';

type TDocumentColorScheme = typeof THEME_MAP.DARK | typeof THEME_MAP.LIGHT;

function subscribe(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributeFilter: ['class'],
		attributes: true,
	});
	return () => observer.disconnect();
}

function getSnapshot(): TDocumentColorScheme {
	return document.documentElement.classList.contains(THEME_MAP.DARK)
		? THEME_MAP.DARK
		: THEME_MAP.LIGHT;
}

function getServerSnapshot(): TDocumentColorScheme {
	return THEME_MAP.LIGHT;
}

/** 当前实际生效的明暗主题（跟随 html 上由主题脚本切换的类）。 */
export function useDocumentColorScheme() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
