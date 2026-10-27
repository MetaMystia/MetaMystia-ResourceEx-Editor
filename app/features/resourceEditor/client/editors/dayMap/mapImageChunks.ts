import type { IDayMapImage } from '@/domain/resourcePack/contracts/dayMap';
import {
	DAY_MAP_CHUNK_SIZE_PX,
	getDayMapChunkPath,
	getDayMapChunkSize,
} from '@/domain/resourcePack/dayMapAssets';
import { DAY_MAP_LIMITS } from '@/domain/resourcePack/dayMapValidation';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface IChunkedImage {
	files: Map<string, Blob>;
	image: IDayMapImage;
	/** 裁掉透明边缘时，新图片左上角在原图中的像素位置。 */
	offset: { x: number; y: number };
	/** 原图尺寸。 */
	source: { height: number; width: number };
}

interface IBox {
	bottom: number;
	left: number;
	right: number;
	top: number;
}

function createCanvas(width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('浏览器无法创建画布。');
	context.imageSmoothingEnabled = false;
	return { canvas, context };
}

function toPngBlob(canvas: HTMLCanvasElement) {
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error('图块编码失败。')),
			'image/png'
		)
	);
}

export async function isPngBlob(blob: Blob) {
	const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
	return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

/** 区域内不透明像素的范围（像素坐标，右下不含），全透明返回 null。 */
function findOpaqueBox(data: Uint8ClampedArray, width: number): IBox | null {
	let left = Infinity;
	let top = Infinity;
	let right = -1;
	let bottom = -1;
	const height = data.length / 4 / width;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			if (data[(y * width + x) * 4 + 3] !== 0) {
				if (x < left) left = x;
				if (x > right) right = x;
				if (y < top) top = y;
				if (y > bottom) bottom = y;
			}
	return right < 0
		? null
		: { bottom: bottom + 1, left, right: right + 1, top };
}

/**
 * 把 PNG 切成 1024 像素的图块，全透明的块不输出。小于一块且不需要裁剪时原样保留文件字节；
 * 其余通过画布重新编码，半透明像素可能有 1/255 的取整差异。
 */
export async function chunkImage(
	source: Blob,
	dir: string,
	shouldTrim: boolean
): Promise<IChunkedImage> {
	if (!(await isPngBlob(source))) throw new Error('请导入 PNG 图片。');
	const bitmap = await createImageBitmap(source, {
		colorSpaceConversion: 'none',
		premultiplyAlpha: 'none',
	});
	try {
		const { height, width } = bitmap;
		if (
			width > DAY_MAP_LIMITS.imageSizePx ||
			height > DAY_MAP_LIMITS.imageSizePx
		)
			throw new Error(
				`图片超过 ${DAY_MAP_LIMITS.imageSizePx} 像素，请拆成多张导入。`
			);
		const scratch = createCanvas(
			Math.min(width, DAY_MAP_CHUNK_SIZE_PX),
			Math.min(height, DAY_MAP_CHUNK_SIZE_PX)
		);
		const readRegion = (x: number, y: number, w: number, h: number) => {
			scratch.canvas.width = w;
			scratch.canvas.height = h;
			scratch.context.clearRect(0, 0, w, h);
			scratch.context.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
			return scratch.context.getImageData(0, 0, w, h).data;
		};
		// 先找出整张图的不透明范围，裁剪与空块判断都基于它。
		const box: IBox = {
			bottom: 0,
			left: Infinity,
			right: 0,
			top: Infinity,
		};
		for (let y = 0; y < height; y += DAY_MAP_CHUNK_SIZE_PX)
			for (let x = 0; x < width; x += DAY_MAP_CHUNK_SIZE_PX) {
				const w = Math.min(DAY_MAP_CHUNK_SIZE_PX, width - x);
				const h = Math.min(DAY_MAP_CHUNK_SIZE_PX, height - y);
				const found = findOpaqueBox(readRegion(x, y, w, h), w);
				if (!found) continue;
				box.bottom = Math.max(box.bottom, y + found.bottom);
				box.left = Math.min(box.left, x + found.left);
				box.right = Math.max(box.right, x + found.right);
				box.top = Math.min(box.top, y + found.top);
			}
		if (box.right === 0) throw new Error('图片完全透明。');
		const area = shouldTrim
			? box
			: { bottom: height, left: 0, right: width, top: 0 };
		const image: IDayMapImage = {
			chunks: [],
			dir,
			height: area.bottom - area.top,
			width: area.right - area.left,
		};
		const files = new Map<string, Blob>();
		const isWhole =
			area.left === 0 &&
			area.top === 0 &&
			image.width === width &&
			image.height === height;
		if (
			isWhole &&
			width <= DAY_MAP_CHUNK_SIZE_PX &&
			height <= DAY_MAP_CHUNK_SIZE_PX
		) {
			image.chunks.push([0, 0]);
			files.set(getDayMapChunkPath(image, [0, 0]), source);
		} else {
			const columns = Math.ceil(image.width / DAY_MAP_CHUNK_SIZE_PX);
			const rows = Math.ceil(image.height / DAY_MAP_CHUNK_SIZE_PX);
			for (let row = 0; row < rows; row++)
				for (let column = 0; column < columns; column++) {
					const size = getDayMapChunkSize(image, [column, row]);
					const data = readRegion(
						area.left + column * DAY_MAP_CHUNK_SIZE_PX,
						area.top + row * DAY_MAP_CHUNK_SIZE_PX,
						size.width,
						size.height
					);
					if (!findOpaqueBox(data, size.width)) continue;
					image.chunks.push([column, row]);
					files.set(
						getDayMapChunkPath(image, [column, row]),
						await toPngBlob(scratch.canvas)
					);
				}
		}
		return {
			files,
			image,
			offset: { x: area.left, y: area.top },
			source: { height, width },
		};
	} finally {
		bitmap.close();
	}
}

/** 把图块拼回整张 PNG，用于导出到外部工具修改。 */
export async function composeImage(
	image: IDayMapImage,
	readUrl: (path: string) => string | undefined
): Promise<Blob> {
	const { canvas, context } = createCanvas(image.width, image.height);
	for (const chunk of image.chunks) {
		const url = readUrl(getDayMapChunkPath(image, chunk));
		if (!url)
			throw new Error(`缺少图块 ${getDayMapChunkPath(image, chunk)}。`);
		const response = await fetch(url);
		const bitmap = await createImageBitmap(await response.blob(), {
			colorSpaceConversion: 'none',
			premultiplyAlpha: 'none',
		});
		context.drawImage(
			bitmap,
			(chunk[0] ?? 0) * DAY_MAP_CHUNK_SIZE_PX,
			(chunk[1] ?? 0) * DAY_MAP_CHUNK_SIZE_PX
		);
		bitmap.close();
	}
	return toPngBlob(canvas);
}
