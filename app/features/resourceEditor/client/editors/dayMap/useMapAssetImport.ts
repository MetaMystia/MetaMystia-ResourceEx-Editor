'use client';

import { useEffect, useRef, useState } from 'react';

import type {
	IDayMap,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import { validateDayMapWav } from '@/domain/resourcePack/dayMapWav';

import { joinAssetPath } from '@/features/resourceEditor/client/assets/assetPaths';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { type ITileImportSettings, sliceMapImage } from './dayMapEdits';
import { type IDayMapCommitOptions } from './useDayMapHistory';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

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

/** 读取文件期间工作区变化会拒绝过期操作；图片与切片、音频与引用一起提交。 */
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
		name: string,
		mapId: number,
		files: ReadonlyMap<string, Blob>
	) {
		const original = joinAssetPath(`assets/maps/${mapId}/`, name);
		let path = original;
		let suffix = 1;
		while (files.has(path)) {
			path = original.replace(/(\.[^./]+)?$/, `_${suffix}$1`);
			suffix += 1;
		}
		return path;
	}

	function begin() {
		if (isImportingRef.current) return false;
		isImportingRef.current = true;
		setIsImporting(true);
		return true;
	}

	function end() {
		isImportingRef.current = false;
		if (isMountedRef.current) setIsImporting(false);
	}

	async function importTiles(
		source: File | string,
		settings: ITileImportSettings
	): Promise<{ error?: string; tiles?: IDayMapTile[] }> {
		const snapshot = readCurrentWorkspaceSnapshot();
		const workspaceId = workspaceIdRef.current;
		if (!snapshot) return { error: '当前没有可编辑的资源包。' };
		if (!begin()) return { error: '正在读取其他文件，请稍候。' };
		try {
			const blob =
				typeof source === 'string'
					? snapshot.files.get(source)
					: source;
			if (!blob) throw new Error('找不到图片文件。');
			const signature = new Uint8Array(
				await blob.slice(0, 8).arrayBuffer()
			);
			if (!PNG_SIGNATURE.every((value, i) => signature[i] === value))
				throw new Error('请导入 PNG 图片。');
			const bitmap = await createImageBitmap(blob);
			const { height, width } = bitmap;
			bitmap.close();
			if (!isMountedRef.current || workspaceIdRef.current !== workspaceId)
				return {};
			if (readCurrentWorkspaceSnapshot()?.revision !== snapshot.revision)
				throw new Error('读取图片期间资源发生变化，请重新导入。');
			const map = readLatestMap();
			const path =
				typeof source === 'string'
					? source
					: getUniquePath(source.name, map.id, snapshot.files);
			const tiles = sliceMapImage(map, path, width, height, settings);
			const result = commit(
				{ ...map, tiles: [...map.tiles, ...tiles] },
				typeof source === 'string'
					? undefined
					: { files: new Map([[path, blob]]) }
			);
			if (!result.isSuccess)
				throw new Error(result.error ?? '导入失败。');
			return { tiles };
		} catch (reason) {
			return { error: describeError(reason, '图片导入失败。') };
		} finally {
			end();
		}
	}

	async function importAudio(
		file: File,
		target: TMapAudioTarget
	): Promise<{ error?: string; path?: string }> {
		const snapshot = readCurrentWorkspaceSnapshot();
		const workspaceId = workspaceIdRef.current;
		if (!snapshot) return { error: '当前没有可编辑的资源包。' };
		if (!begin()) return { error: '正在读取其他文件，请稍候。' };
		try {
			if (!/\.wav$/i.test(file.name))
				throw new Error('请导入 WAV 音频。');
			const audioError = validateDayMapWav(await file.arrayBuffer());
			if (audioError) throw new Error(audioError);
			if (!isMountedRef.current || workspaceIdRef.current !== workspaceId)
				return {};
			if (readCurrentWorkspaceSnapshot()?.revision !== snapshot.revision)
				throw new Error('读取音频期间资源发生变化，请重新导入。');
			const map = readLatestMap();
			const path = getUniquePath(file.name, map.id, snapshot.files);
			const result = commit(
				{
					...map,
					mapBGM: {
						...map.mapBGM,
						...(target === 'loop' ? {} : { intro: path }),
						...(target === 'intro' ? {} : { loop: path }),
					},
				},
				{ files: new Map([[path, file]]) }
			);
			if (!result.isSuccess)
				throw new Error(result.error ?? '导入失败。');
			return { path };
		} catch (reason) {
			return { error: describeError(reason, '音频导入失败。') };
		} finally {
			end();
		}
	}

	return { importAudio, importTiles, isImporting };
}
