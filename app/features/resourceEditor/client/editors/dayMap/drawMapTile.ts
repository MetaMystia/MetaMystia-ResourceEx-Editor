import type {
	IDayMapPlacement,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	getDayMapVertices,
	transformDayMapPoint,
} from '@/domain/resourcePack/dayMapGeometry';

const tintedImages = new WeakMap<
	HTMLImageElement,
	Map<string, HTMLCanvasElement>
>();

function tintImage(image: HTMLImageElement, color: number[]) {
	const [r = 1, g = 1, b = 1] = color;
	if (r === 1 && g === 1 && b === 1) return image;
	let cache = tintedImages.get(image);
	if (!cache) {
		cache = new Map();
		tintedImages.set(image, cache);
	}
	const key = `${r},${g},${b}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext('2d');
	if (!context) return image;
	context.drawImage(image, 0, 0);
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
	for (let i = 0; i < pixels.data.length; i += 4) {
		pixels.data[i] = (pixels.data[i] ?? 0) * r;
		pixels.data[i + 1] = (pixels.data[i + 1] ?? 0) * g;
		pixels.data[i + 2] = (pixels.data[i + 2] ?? 0) * b;
	}
	context.putImageData(pixels, 0, 0);
	cache.set(key, canvas);
	return canvas;
}

/** 只改变画布绘制，不裁切、合并、重采样或写回包内图片。 */
export function drawMapTile(
	context: CanvasRenderingContext2D,
	image: HTMLImageElement,
	tile: IDayMapTile,
	x: number,
	y: number,
	scale: number,
	placement: IDayMapPlacement = {},
	sx = 1,
	sy = 1
) {
	const vertices = getDayMapVertices(tile).map(([vx = 0, vy = 0]) => {
		const [tx = 0, ty = 0] = transformDayMapPoint(
			vx * sx,
			vy * sy,
			placement
		);
		return [x + tx * scale, y - ty * scale];
	});
	const [left = 0, bottom = 0, width = 0, height = 0] = tile.rect;
	const uvs = tile.mesh?.uvs ?? [
		[left / image.width, bottom / image.height],
		[(left + width) / image.width, bottom / image.height],
		[(left + width) / image.width, (bottom + height) / image.height],
		[left / image.width, (bottom + height) / image.height],
	];
	const triangles = tile.mesh?.triangles ?? [0, 1, 2, 0, 2, 3];
	const color = placement.color ?? [1, 1, 1, 1];
	const source = tintImage(image, color);
	context.save();
	context.globalAlpha *= color[3] ?? 1;
	for (let i = 0; i < triangles.length; i += 3) {
		const indices = triangles.slice(i, i + 3);
		const uv = indices.map((index) => [
			(uvs[index]?.[0] ?? 0) * image.width,
			(1 - (uvs[index]?.[1] ?? 0)) * image.height,
		]);
		const points = indices.map((index) => vertices[index] ?? [0, 0]);
		const [u0 = 0, v0 = 0] = uv[0] ?? [];
		const [u1 = 0, v1 = 0] = uv[1] ?? [];
		const [u2 = 0, v2 = 0] = uv[2] ?? [];
		const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
		if (Math.abs(det) < 1e-10) continue;
		const coefficients = [0, 1].map((axis) => {
			const p0 = points[0]?.[axis] ?? 0,
				p1 = points[1]?.[axis] ?? 0,
				p2 = points[2]?.[axis] ?? 0;
			const a = ((p1 - p0) * (v2 - v0) - (p2 - p0) * (v1 - v0)) / det;
			const b = ((u1 - u0) * (p2 - p0) - (u2 - u0) * (p1 - p0)) / det;
			return [a, b, p0 - a * u0 - b * v0];
		});
		context.save();
		context.beginPath();
		points.forEach(([px = 0, py = 0], index) =>
			index ? context.lineTo(px, py) : context.moveTo(px, py)
		);
		context.closePath();
		context.clip();
		context.transform(
			coefficients[0]?.[0] ?? 0,
			coefficients[1]?.[0] ?? 0,
			coefficients[0]?.[1] ?? 0,
			coefficients[1]?.[1] ?? 0,
			coefficients[0]?.[2] ?? 0,
			coefficients[1]?.[2] ?? 0
		);
		context.drawImage(source, 0, 0);
		context.restore();
	}
	context.restore();
}
