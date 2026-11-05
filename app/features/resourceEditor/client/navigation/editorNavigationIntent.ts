'use client';

import { useEffect, useRef } from 'react';

import {
	isResourceEditorEntityKind,
	RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND,
	type IResourceEditorNavigationTarget,
	type TResourceEditorEntityKind,
} from '@/domain/resourcePack/editorNavigation';

import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

const NAVIGATION_QUERY_KEYS = {
	continueCurrent: 'editorContinueCurrent',
	entityKind: 'editorEntity',
	fieldPath: 'editorField',
	stableKey: 'editorKey',
	stableKeyType: 'editorKeyType',
	workspaceId: 'workspace',
} as const;

const NAVIGATION_NOTICE_EVENT = 'resource-editor:navigation-notice';

export interface IEditorNavigationIntent {
	continueCurrent?: boolean;
	target: IResourceEditorNavigationTarget;
	workspaceId: string;
}

export interface IEditorNavigationNotice {
	description: string;
	title: string;
}

interface IUseEditorEntityNavigationIntentInput<TItem> {
	entityKind: TResourceEditorEntityKind;
	getStableKey: (item: TItem) => number | string;
	items: readonly TItem[];
	onSelect: (index: number) => void;
}

interface IUseEditorPageNavigationIntentInput {
	entityKinds: readonly TResourceEditorEntityKind[];
	onTarget?: (target: IResourceEditorNavigationTarget) => boolean | void;
}

function isEditorFieldPathSegment(value: unknown): value is number | string {
	return typeof value === 'number' || typeof value === 'string';
}

function parseFieldPath(
	value: string | null
): readonly (number | string)[] | null {
	if (value === null) return Object.freeze([]);
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed) || !parsed.every(isEditorFieldPathSegment)) {
			return null;
		}
		return Object.freeze([...parsed]);
	} catch {
		return null;
	}
}

function parseStableKey(params: URLSearchParams): number | string | undefined {
	const keyType = params.get(NAVIGATION_QUERY_KEYS.stableKeyType);
	if (!params.has(NAVIGATION_QUERY_KEYS.stableKey)) return undefined;
	const value = params.get(NAVIGATION_QUERY_KEYS.stableKey) ?? '';
	if (keyType === 'string') return value;
	if (keyType !== 'number') return undefined;
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function createEditorNavigationUrl(
	baseUrl: string,
	intent: IEditorNavigationIntent
): string {
	const url = new URL(intent.target.route, baseUrl);
	url.searchParams.set(
		NAVIGATION_QUERY_KEYS.entityKind,
		intent.target.entityKind
	);
	url.searchParams.set(
		NAVIGATION_QUERY_KEYS.stableKey,
		String(intent.target.stableKey)
	);
	url.searchParams.set(
		NAVIGATION_QUERY_KEYS.stableKeyType,
		typeof intent.target.stableKey
	);
	url.searchParams.set(NAVIGATION_QUERY_KEYS.workspaceId, intent.workspaceId);
	if (intent.continueCurrent) {
		url.searchParams.set(NAVIGATION_QUERY_KEYS.continueCurrent, '1');
	}
	if (intent.target.fieldPath) {
		url.searchParams.set(
			NAVIGATION_QUERY_KEYS.fieldPath,
			JSON.stringify(intent.target.fieldPath)
		);
	}
	return url.toString();
}

export function readEditorNavigationIntent(
	location: Pick<Location, 'pathname' | 'search'> = window.location
): IEditorNavigationIntent | null {
	const params = new URLSearchParams(location.search);
	const entityKind = params.get(NAVIGATION_QUERY_KEYS.entityKind);
	const workspaceId = params.get(NAVIGATION_QUERY_KEYS.workspaceId)?.trim();
	if (
		!entityKind ||
		!isResourceEditorEntityKind(entityKind) ||
		!workspaceId
	) {
		return null;
	}
	const route = RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND[entityKind];
	if (location.pathname !== route) return null;
	const stableKey = parseStableKey(params);
	if (stableKey === undefined) return null;
	const fieldPath = parseFieldPath(
		params.get(NAVIGATION_QUERY_KEYS.fieldPath)
	);
	if (fieldPath === null) return null;
	return {
		...(params.get(NAVIGATION_QUERY_KEYS.continueCurrent) === '1'
			? { continueCurrent: true }
			: {}),
		target: {
			entityKind,
			...(fieldPath.length > 0 ? { fieldPath } : {}),
			route,
			stableKey,
		},
		workspaceId,
	};
}

export function clearEditorNavigationIntent(
	location: Pick<Location, 'href'> = window.location,
	history: Pick<History, 'replaceState' | 'state'> = window.history
) {
	const url = new URL(location.href);
	Object.values(NAVIGATION_QUERY_KEYS).forEach((key) =>
		url.searchParams.delete(key)
	);
	history.replaceState(history.state, '', url);
}

export function dispatchEditorNavigationNotice(
	notice: IEditorNavigationNotice
) {
	window.dispatchEvent(
		new CustomEvent<IEditorNavigationNotice>(NAVIGATION_NOTICE_EVENT, {
			detail: notice,
		})
	);
}

export function subscribeEditorNavigationNotice(
	listener: (notice: IEditorNavigationNotice) => void
) {
	const handleNotice = (event: Event) => {
		if (event instanceof CustomEvent) {
			listener(event.detail as IEditorNavigationNotice);
		}
	};
	window.addEventListener(NAVIGATION_NOTICE_EVENT, handleNotice);
	return () =>
		window.removeEventListener(NAVIGATION_NOTICE_EVENT, handleNotice);
}

function dispatchMissingTargetNotice(stableKey: number | string) {
	dispatchEditorNavigationNotice({
		description: `资源包内容已变化，找不到原对比项“${String(stableKey)}”。`,
		title: '无法定位对比项',
	});
}

export function useEditorEntityNavigationIntent<TItem>({
	entityKind,
	getStableKey,
	items,
	onSelect,
}: IUseEditorEntityNavigationIntentInput<TItem>) {
	const { activeWorkspaceId } = useResourceEditor();
	const hasConsumedRef = useRef(false);

	useEffect(() => {
		if (hasConsumedRef.current || !activeWorkspaceId) return;
		const intent = readEditorNavigationIntent();
		if (
			!intent ||
			intent.workspaceId !== activeWorkspaceId ||
			intent.target.entityKind !== entityKind
		) {
			return;
		}
		hasConsumedRef.current = true;
		clearEditorNavigationIntent();
		const index = items.findIndex(
			(item) => getStableKey(item) === intent.target.stableKey
		);
		if (index < 0) {
			dispatchMissingTargetNotice(intent.target.stableKey);
			return;
		}
		onSelect(index);
	}, [activeWorkspaceId, entityKind, getStableKey, items, onSelect]);
}

export function useEditorPageNavigationIntent({
	entityKinds,
	onTarget,
}: IUseEditorPageNavigationIntentInput) {
	const { activeWorkspaceId } = useResourceEditor();
	const hasConsumedRef = useRef(false);

	useEffect(() => {
		if (hasConsumedRef.current || !activeWorkspaceId) return;
		const intent = readEditorNavigationIntent();
		if (
			!intent ||
			intent.workspaceId !== activeWorkspaceId ||
			!entityKinds.includes(intent.target.entityKind)
		) {
			return;
		}
		hasConsumedRef.current = true;
		clearEditorNavigationIntent();
		if (onTarget?.(intent.target) === false) {
			dispatchMissingTargetNotice(intent.target.stableKey);
		}
	}, [activeWorkspaceId, entityKinds, onTarget]);
}
