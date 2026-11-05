'use client';

import { useSyncExternalStore } from 'react';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

function getDesktopSnapshot() {
	return (
		typeof globalThis.matchMedia === 'function' &&
		globalThis.matchMedia(DESKTOP_MEDIA_QUERY).matches
	);
}

function getServerSnapshot() {
	return false;
}

function subscribeToDesktopLayout(onStoreChange: () => void) {
	if (typeof globalThis.matchMedia !== 'function') {
		return () => undefined;
	}

	const mediaQueryList = globalThis.matchMedia(DESKTOP_MEDIA_QUERY);
	mediaQueryList.addEventListener('change', onStoreChange);

	return () => {
		mediaQueryList.removeEventListener('change', onStoreChange);
	};
}

export function useComparisonDesktopLayout() {
	return useSyncExternalStore(
		subscribeToDesktopLayout,
		getDesktopSnapshot,
		getServerSnapshot
	);
}
