'use client';

import { useEffect, useRef, useState } from 'react';

import type {
	IDayMap,
	IDayMapLayer,
} from '@/domain/resourcePack/contracts/dayMap';
import { validateDayMapWav } from '@/domain/resourcePack/dayMapWav';
import { DAY_MAP_LIMITS } from '@/domain/resourcePack/dayMapValidation';

import { joinAssetPath } from '@/features/resourceEditor/client/assets/assetPaths';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import {
	addLayer,
	addPrefab,
	createPrefabKey,
	patchLayer,
} from './dayMapEdits';
import { chunkImage } from './mapImageChunks';
import { type IDayMapCommitOptions } from './useDayMapHistory';

export type TMapAudioTarget = 'both' | 'intro' | 'loop';

interface IUseMapAssetImportInput {
	commit(
		next: IDayMap,
		options?: IDayMapCommitOptions
	): IResourceEditorOperationResult;
	readLatestMap(): IDayMap;
}

function describeError(reason: unknown, fallback: string) {
	return reason instanceof Error ? reason.message : fallback;
}

function getFileStem(name: string) {
	return name.replace(/\.[^./]+$/, '') || 'image';
}

/** 读取文件期间工作区变化会拒绝过期操作；图块与图层、音频与引用一起提交。 */
export function useMapAssetImport({
	commit,
	readLatestMap,
}: IUseMapAssetImportInput) {
	const { activeWorkspaceId, readCurrentWorkspaceSnapshot } =
		useResourceEditor();
	const [isImporting, setIsImporting] = useState(false);
	const isImportingRef = useRef(false);
	const isMountedRef = useRef(true);
	const workspaceIdRef = useRef(activeWorkspaceId);
	workspaceIdRef.current = activeWorkspaceId;

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	function getUniquePath(
		folder: string,
		name: string,
		files: ReadonlyMap<string, Blob>,
		isDirectory: boolean
	) {
		const original = joinAssetPath(folder, name);
		const isUsed = (path: string) =>
			isDirectory
				? [...files.keys()].some((file) => file.startsWith(`${path}/`))
				: files.has(path);
		let path = original;
		let suffix = 2;
		while (isUsed(path)) {
			path = isDirectory
				? `${original}_${suffix}`
				: original.replace(/(\.[^./]+)?$/, `_${suffix}$1`);
			suffix += 1;
		}
		return path;
	}

	/** 执行一次导入：读取期间禁止并发，完成后确认工作区未变化再提交。 */
	async function runImport<T>(
		fallback: string,
		read: (
			snapshot: NonNullable<
				ReturnType<typeof readCurrentWorkspaceSnapshot>
			>
		) => Promise<{
			files?: ReadonlyMap<string, Blob>;
			next: (map: IDayMap) => IDayMap;
			result: T;
		}>
	): Promise<{ error?: string; result?: T }> {
		const snapshot = readCurrentWorkspaceSnapshot();
		const workspaceId = workspaceIdRef.current;
		if (!snapshot) return { error: '当前没有可编辑的资源包。' };
		if (isImportingRef.current)
			return { error: '正在读取其他文件，请稍候。' };
		isImportingRef.current = true;
		setIsImporting(true);
		try {
			const { files, next, result } = await read(snapshot);
			if (!isMountedRef.current || workspaceIdRef.current !== workspaceId)
				return {};
			if (readCurrentWorkspaceSnapshot()?.revision !== snapshot.revision)
				throw new Error('读取文件期间资源发生变化，请重新导入。');
			const outcome = commit(
				next(readLatestMap()),
				files ? { files } : undefined
			);
			if (!outcome.isSuccess)
				throw new Error(outcome.error ?? '导入失败。');
			return { result };
		} catch (reason) {
			return { error: describeError(reason, fallback) };
		} finally {
			isImportingRef.current = false;
			if (isMountedRef.current) setIsImporting(false);
		}
	}

	/**
	 * 导入整张图作为新图层，或替换已有图层的图片。图层不裁透明边，便于外部修改后重新导入；
	 * 替换时保持左上角不动。center 为新图层中心的像素坐标，缺省时放在原点。
	 */
	function importLayer(
		file: File,
		replaceIndex: number | null,
		center?: { x: number; y: number }
	) {
		return runImport('图片导入失败。', async (snapshot) => {
			const map = readLatestMap();
			if (
				replaceIndex === null &&
				map.layers.length >= DAY_MAP_LIMITS.layerCount
			)
				throw new Error(
					`一张地图最多${DAY_MAP_LIMITS.layerCount}个图层。`
				);
			const dir = getUniquePath(
				`assets/maps/${map.id}/layers/`,
				getFileStem(file.name),
				snapshot.files,
				true
			);
			const { files, image } = await chunkImage(file, dir, false);
			return {
				files,
				result: replaceIndex ?? map.layers.length,
				next: (latest: IDayMap) => {
					const old =
						replaceIndex === null
							? null
							: latest.layers[replaceIndex];
					if (old)
						return patchLayer(latest, replaceIndex ?? 0, {
							image,
							y: old.y + old.image.height - image.height,
						});
					const last = latest.layers.at(-1);
					const layer: IDayMapLayer = {
						name: getFileStem(file.name),
						sortingLayer: 'Background',
						sortingOrder: last ? last.sortingOrder + 100 : -2000,
						x: (center?.x ?? 0) - Math.floor(image.width / 2),
						y: (center?.y ?? 0) - Math.floor(image.height / 2),
						image,
					};
					return addLayer(latest, layer);
				},
			};
		});
	}

	/** 导入 PNG 作为物件模板：裁掉透明边，锚点放在底部中央。 */
	function importPrefab(file: File) {
		return runImport('图片导入失败。', async (snapshot) => {
			const map = readLatestMap();
			if (map.prefabs.length >= DAY_MAP_LIMITS.prefabCount)
				throw new Error(
					`一张地图最多${DAY_MAP_LIMITS.prefabCount}个物件模板。`
				);
			const key = createPrefabKey(map, file.name);
			const dir = getUniquePath(
				`assets/maps/${map.id}/prefabs/`,
				key,
				snapshot.files,
				true
			);
			const { files, image } = await chunkImage(file, dir, true);
			return {
				files,
				result: key,
				next: (latest: IDayMap) =>
					addPrefab(latest, {
						key,
						image,
						pivot: [0.5, 0],
						pixelsPerUnit: latest.pixelsPerUnit,
						sortingLayer: 'Character',
						sortingOrder: 0,
						sortByY: true,
						colliders: [],
					}),
			};
		});
	}

	function importAudio(file: File, target: TMapAudioTarget) {
		return runImport('音频导入失败。', async (snapshot) => {
			if (!/\.wav$/i.test(file.name))
				throw new Error('请导入 WAV 音频。');
			const audioError = validateDayMapWav(await file.arrayBuffer());
			if (audioError) throw new Error(audioError);
			const path = getUniquePath(
				`assets/maps/${readLatestMap().id}/`,
				file.name,
				snapshot.files,
				false
			);
			return {
				files: new Map([[path, file]]),
				result: path,
				next: (latest: IDayMap) => {
					// 上传包内音频即改用包内音乐，原版音乐地址失效。
					const mapBGM = {
						...latest.mapBGM,
						...(target === 'loop' ? {} : { intro: path }),
						...(target === 'intro' ? {} : { loop: path }),
					};
					delete mapBGM.native;
					return { ...latest, mapBGM };
				},
			};
		});
	}

	return { importAudio, importLayer, importPrefab, isImporting };
}
