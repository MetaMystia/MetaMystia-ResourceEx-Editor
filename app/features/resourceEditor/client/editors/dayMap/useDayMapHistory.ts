'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { MAP_HISTORY_LIMIT } from './dayMapEditorModel';

type THistoryMode = 'edit' | 'redo' | 'undo';

interface IHistoryState {
	current: IDayMap;
	future: IDayMap[];
	past: IDayMap[];
}

export interface IDayMapCommitOptions {
	files?: ReadonlyMap<string, Blob>;
}

interface IUseDayMapHistoryInput {
	index: number;
	isReadOnly: boolean;
	map: IDayMap;
}

/**
 * 每次提交写入一次工作区修改并记录一步撤销。地图被其他操作替换后历史清空，
 * 不会把旧快照覆盖到新内容上。
 */
export function useDayMapHistory({
	index,
	isReadOnly,
	map,
}: IUseDayMapHistoryInput) {
	const { applyWorkspaceMutation, readCurrentWorkspaceSnapshot } =
		useResourceEditor();
	const historyRef = useRef<IHistoryState>({
		current: map,
		future: [],
		past: [],
	});
	// 同一事件内连续提交时，后一次以前一次的结果为基准。
	const latestMapRef = useRef(map);
	latestMapRef.current =
		historyRef.current.current === map ? map : latestMapRef.current;
	const isMountedRef = useRef(true);
	const [historyVersion, setHistoryVersion] = useState(0);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (historyRef.current.current === map) return;
		historyRef.current = { current: map, future: [], past: [] };
		latestMapRef.current = map;
		setHistoryVersion((value) => value + 1);
	}, [map]);

	const apply = useCallback(
		(
			next: IDayMap,
			options: IDayMapCommitOptions | undefined,
			mode: THistoryMode
		): IResourceEditorOperationResult => {
			if (isReadOnly)
				return { error: '当前地图为只读。', isSuccess: false };
			if (!isMountedRef.current)
				return { error: '编辑器已关闭。', isSuccess: false };
			const base = latestMapRef.current;
			const snapshot = readCurrentWorkspaceSnapshot();
			if (!snapshot || snapshot.resourcePack.dayMaps[index] !== base)
				return {
					error: '地图已变化，本次操作没有覆盖新内容，请重新操作。',
					isSuccess: false,
				};
			if (next === base && !options?.files) return { isSuccess: true };
			const files = options?.files;
			const result = applyWorkspaceMutation({
				expectedRevision: snapshot.revision,
				mutate: (current) => ({
					...current,
					files: files
						? new Map([...current.files, ...files])
						: current.files,
					resourcePack: {
						...current.resourcePack,
						dayMaps: current.resourcePack.dayMaps.map((item, i) =>
							i === index ? next : item
						),
					},
				}),
			});
			if (!result.isSuccess)
				return {
					error: result.error ?? '保存地图失败。',
					isSuccess: false,
				};
			const history = historyRef.current;
			if (mode === 'edit') {
				history.past = [
					...history.past.slice(-(MAP_HISTORY_LIMIT - 1)),
					base,
				];
				history.future = [];
			} else if (mode === 'undo') {
				history.past = history.past.slice(0, -1);
				history.future = [...history.future, base];
			} else {
				history.future = history.future.slice(0, -1);
				history.past = [...history.past, base];
			}
			history.current = next;
			latestMapRef.current = next;
			setHistoryVersion((value) => value + 1);
			return { isSuccess: true };
		},
		[
			applyWorkspaceMutation,
			index,
			isReadOnly,
			readCurrentWorkspaceSnapshot,
		]
	);

	const commit = useCallback(
		(next: IDayMap, options?: IDayMapCommitOptions) =>
			apply(next, options, 'edit'),
		[apply]
	);

	const undo = useCallback(() => {
		const target = historyRef.current.past.at(-1);
		return target
			? apply(target, undefined, 'undo')
			: { error: '没有可撤销的操作。', isSuccess: false };
	}, [apply]);

	const redo = useCallback(() => {
		const target = historyRef.current.future.at(-1);
		return target
			? apply(target, undefined, 'redo')
			: { error: '没有可重做的操作。', isSuccess: false };
	}, [apply]);

	/** 读取最新地图（含同一事件中尚未渲染的提交）。 */
	const readLatestMap = useCallback(() => latestMapRef.current, []);

	return {
		canRedo: historyRef.current.future.length > 0,
		canUndo: historyRef.current.past.length > 0,
		commit,
		historyVersion,
		readLatestMap,
		redo,
		undo,
	};
}
