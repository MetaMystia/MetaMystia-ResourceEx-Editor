'use client';

import { useEffect, useState } from 'react';

import type { IDayMapTile } from '@/domain/resourcePack/contracts/dayMap';

export interface IImageSize {
	height: number;
	width: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const sizeCache = new Map<string, IImageSize | null>();

/** 同一 blob URL 只解码一次；缩略图与图集视图共用。 */
export function loadMapImage(url: string): Promise<HTMLImageElement> {
	let promise = imageCache.get(url);
	if (!promise) {
		promise = new Promise((resolve, reject) => {
			const image = new Image();
			image.decoding = 'async';
			image.onload = () => {
				sizeCache.set(url, {
					height: image.naturalHeight,
					width: image.naturalWidth,
				});
				resolve(image);
			};
			image.onerror = () => {
				sizeCache.set(url, null);
				imageCache.delete(url);
				reject(new Error('图片无法解码'));
			};
			image.src = url;
		});
		imageCache.set(url, promise);
		if (imageCache.size > 64) {
			const oldest = imageCache.keys().next().value;
			if (oldest !== undefined && oldest !== url)
				imageCache.delete(oldest);
		}
	}
	return promise;
}

/** `undefined` 表示加载中，`null` 表示无法读取。 */
export function useImageSize(url: string | undefined) {
	const [size, setSize] = useState<IImageSize | null | undefined>(() =>
		url ? sizeCache.get(url) : null
	);
	useEffect(() => {
		if (!url) {
			setSize(null);
			return;
		}
		const cached = sizeCache.get(url);
		if (cached !== undefined) {
			setSize(cached);
			return;
		}
		setSize(undefined);
		let isActive = true;
		loadMapImage(url).then(
			(image) => {
				if (isActive)
					setSize({
						height: image.naturalHeight,
						width: image.naturalWidth,
					});
			},
			() => {
				if (isActive) setSize(null);
			}
		);
		return () => {
			isActive = false;
		};
	}, [url]);
	return size;
}

export interface ITileSourceRect {
	height: number;
	left: number;
	top: number;
	width: number;
}

/** 切片在图片中的像素范围（左上角原点）；网格按 UV 外框计算。 */
export function getTileSourceRect(
	tile: IDayMapTile,
	image: IImageSize
): ITileSourceRect | null {
	if (tile.mesh) {
		let minU = Infinity;
		let minV = Infinity;
		let maxU = -Infinity;
		let maxV = -Infinity;
		for (const [u = 0, v = 0] of tile.mesh.uvs) {
			minU = Math.min(minU, u);
			minV = Math.min(minV, v);
			maxU = Math.max(maxU, u);
			maxV = Math.max(maxV, v);
		}
		if (!Number.isFinite(minU) || maxU <= minU || maxV <= minV) return null;
		return {
			height: (maxV - minV) * image.height,
			left: minU * image.width,
			top: (1 - maxV) * image.height,
			width: (maxU - minU) * image.width,
		};
	}
	const [left = 0, bottom = 0, width = 0, height = 0] = tile.rect;
	if (
		!(width > 0) ||
		!(height > 0) ||
		left < 0 ||
		bottom < 0 ||
		left + width > image.width ||
		bottom + height > image.height
	)
		return null;
	return { height, left, top: image.height - bottom - height, width };
}

/** 四顶点网格与矩形切片可以直接用 CSS 背景裁切；复杂网格需要画布。 */
export function isSimpleTile(tile: IDayMapTile) {
	return !tile.mesh || tile.mesh.vertices.length <= 4;
}
