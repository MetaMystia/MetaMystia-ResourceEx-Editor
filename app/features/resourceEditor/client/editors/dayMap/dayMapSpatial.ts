import type {
	IDayMap,
	IDayMapCollision,
	IDayMapObject,
	IDayMapPlacement,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	getDayMapVertices,
	transformDayMapPoint,
} from '@/domain/resourcePack/dayMapGeometry';

import {
	GAME_VIEWPORT,
	type IMapPoint,
	type IMapRect,
	type IMapView,
} from './dayMapEditorModel';

const tileVerticesCache = new WeakMap<IDayMapTile, number[][]>();

/** 切片在自身锚点坐标系下的顶点，按切片对象缓存。 */
export function getCachedTileVertices(tile: IDayMapTile): number[][] {
	let vertices = tileVerticesCache.get(tile);
	if (!vertices) {
		vertices = getDayMapVertices(tile);
		tileVerticesCache.set(tile, vertices);
	}
	return vertices;
}

function createEmptyRect(): IMapRect {
	return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isRectFinite(rect: IMapRect) {
	return (
		Number.isFinite(rect.minX) &&
		Number.isFinite(rect.minY) &&
		Number.isFinite(rect.maxX) &&
		Number.isFinite(rect.maxY)
	);
}

function includePoint(rect: IMapRect, x: number, y: number) {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return;
	if (x < rect.minX) rect.minX = x;
	if (y < rect.minY) rect.minY = y;
	if (x > rect.maxX) rect.maxX = x;
	if (y > rect.maxY) rect.maxY = y;
}

/** 摆放后的切片外框；无效切片按一格处理，便于选中和定位。 */
function includePlacedTile(
	rect: IMapRect,
	tile: IDayMapTile | undefined,
	x: number,
	y: number,
	scaleX = 1,
	scaleY = 1,
	placement?: IDayMapPlacement
) {
	const vertices = tile ? getCachedTileVertices(tile) : [];
	let hasVertex = false;
	for (const [vx = 0, vy = 0] of vertices) {
		const [tx = 0, ty = 0] = transformDayMapPoint(
			vx * scaleX,
			vy * scaleY,
			placement
		);
		if (Number.isFinite(tx) && Number.isFinite(ty)) hasVertex = true;
		includePoint(rect, x + tx, y + ty);
	}
	if (!hasVertex) {
		includePoint(rect, x, y);
		includePoint(rect, x + 1, y + 1);
	}
}

function getPlacedTileRect(
	tile: IDayMapTile | undefined,
	x: number,
	y: number,
	scaleX = 1,
	scaleY = 1,
	placement?: IDayMapPlacement
): IMapRect {
	const rect = createEmptyRect();
	includePlacedTile(rect, tile, x, y, scaleX, scaleY, placement);
	return rect;
}

export function getObjectRect(
	map: IDayMap,
	object: IDayMapObject,
	tiles?: ReadonlyMap<string, IDayMapTile>
): IMapRect {
	const tile =
		tiles?.get(object.tile) ??
		map.tiles.find((item) => item.key === object.tile);
	return getPlacedTileRect(
		tile,
		object.x,
		object.y,
		object.scale[0] ?? 1,
		object.scale[1] ?? 1,
		object
	);
}

export function getCollisionRect(box: IDayMapCollision): IMapRect {
	return {
		minX: box.x - box.width / 2,
		minY: box.y - box.height / 2,
		maxX: box.x + box.width / 2,
		maxY: box.y + box.height / 2,
	};
}

export function getCameraRect(bounds: readonly number[]): IMapRect | null {
	const [minX, minY, maxX, maxY] = bounds;
	if (
		minX === undefined ||
		minY === undefined ||
		maxX === undefined ||
		maxY === undefined ||
		![minX, minY, maxX, maxY].every(Number.isFinite)
	)
		return null;
	return { minX, minY, maxX, maxY };
}

/** 美术范围：显示图层与装饰，不含碰撞和标记。 */
export function getMapArtRect(map: IDayMap): IMapRect {
	const rect = createEmptyRect();
	const tiles = new Map(map.tiles.map((tile) => [tile.key, tile]));
	for (const layer of map.layers)
		for (const cell of layer.cells)
			includePlacedTile(
				rect,
				tiles.get(cell.tile),
				cell.x,
				cell.y,
				1,
				1,
				cell
			);
	for (const object of map.objects)
		includePlacedTile(
			rect,
			tiles.get(object.tile),
			object.x,
			object.y,
			object.scale[0] ?? 1,
			object.scale[1] ?? 1,
			object
		);
	return rect;
}

/** 定位地图时使用的完整范围，空地图返回默认视野。 */
export function getMapContentRect(map: IDayMap): IMapRect {
	const rect = getMapArtRect(map);
	for (const box of map.collisions) {
		const boxRect = getCollisionRect(box);
		includePoint(rect, boxRect.minX, boxRect.minY);
		includePoint(rect, boxRect.maxX, boxRect.maxY);
	}
	for (const marker of map.spawnMarkers)
		includePoint(rect, marker.x, marker.y);
	for (const cell of map.height?.cells ?? []) {
		includePoint(rect, cell.x, cell.y);
		includePoint(rect, cell.x + 1, cell.y + 1);
	}
	return isRectFinite(rect) ? rect : { minX: -8, minY: -5, maxX: 8, maxY: 5 };
}

/** 所有已绘制格子的整数范围，用于限定填充区域。 */
export function getPaintedCellRect(map: IDayMap): IMapRect | null {
	const rect = createEmptyRect();
	for (const layer of map.layers)
		for (const cell of layer.cells) includePoint(rect, cell.x, cell.y);
	for (const cell of map.height?.cells ?? [])
		includePoint(rect, cell.x, cell.y);
	return isRectFinite(rect)
		? {
				minX: Math.floor(rect.minX),
				minY: Math.floor(rect.minY),
				maxX: Math.floor(rect.maxX),
				maxY: Math.floor(rect.maxY),
			}
		: null;
}

export function isPointInRect(point: IMapPoint, rect: IMapRect, margin = 0) {
	return (
		point.x >= rect.minX - margin &&
		point.x <= rect.maxX + margin &&
		point.y >= rect.minY - margin &&
		point.y <= rect.maxY + margin
	);
}

export function doRectsIntersect(a: IMapRect, b: IMapRect) {
	return (
		a.minX <= b.maxX &&
		a.maxX >= b.minX &&
		a.minY <= b.maxY &&
		a.maxY >= b.minY
	);
}

export function normalizeRect(a: IMapPoint, b: IMapPoint): IMapRect {
	return {
		minX: Math.min(a.x, b.x),
		minY: Math.min(a.y, b.y),
		maxX: Math.max(a.x, b.x),
		maxY: Math.max(a.y, b.y),
	};
}

export function snapToStep(value: number, step: number) {
	if (!(step > 0)) return roundMapValue(value);
	return roundMapValue(Math.round(value / step) * step);
}

/** 去掉浮点误差，避免 JSON 中出现 0.30000000000000004。 */
export function roundMapValue(value: number) {
	return Number.isFinite(value) ? Number(value.toFixed(6)) + 0 : value;
}

export function clampMapCoordinate(value: number, limit = 4096) {
	return Math.max(-limit, Math.min(limit, value));
}

export function getCellAt(point: IMapPoint): IMapPoint {
	return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

/** 两个格子之间的连续格子（Bresenham），保证快速拖动不留空隙。 */
export function getLineCells(start: IMapPoint, end: IMapPoint): IMapPoint[] {
	const result: IMapPoint[] = [];
	let { x, y } = start;
	const dx = Math.abs(end.x - x);
	const dy = Math.abs(end.y - y);
	const sx = x < end.x ? 1 : -1;
	const sy = y < end.y ? 1 : -1;
	let error = dx - dy;
	for (;;) {
		result.push({ x, y });
		if (x === end.x && y === end.y) break;
		const twice = error * 2;
		if (twice > -dy) {
			error -= dy;
			x += sx;
		}
		if (twice < dx) {
			error += dx;
			y += sy;
		}
	}
	return result;
}

export function getBrushOffsets(size: number): IMapPoint[] {
	const start = -Math.floor((size - 1) / 2);
	const offsets: IMapPoint[] = [];
	for (let dy = 0; dy < size; dy++)
		for (let dx = 0; dx < size; dx++)
			offsets.push({ x: start + dx, y: start + dy });
	return offsets;
}

/** 游戏视口在相机中心处覆盖的世界范围。 */
export function getGameViewportRect(center: IMapPoint): IMapRect {
	return {
		minX: center.x - GAME_VIEWPORT.halfWidth,
		minY: center.y - GAME_VIEWPORT.bottom,
		maxX: center.x + GAME_VIEWPORT.halfWidth,
		maxY: center.y + GAME_VIEWPORT.top,
	};
}

export interface ICameraFitResult {
	bounds: number[];
	isSmallerThanViewport: boolean;
}

/** 按美术范围与游戏视口推算相机中心范围，地图小于视口时收拢到中心。 */
export function fitCameraBoundsToArt(art: IMapRect): ICameraFitResult {
	const margin = GAME_VIEWPORT.pixelMargin;
	let minX = art.minX + GAME_VIEWPORT.halfWidth + margin;
	let maxX = art.maxX - GAME_VIEWPORT.halfWidth - margin;
	let minY = art.minY + GAME_VIEWPORT.bottom + margin;
	let maxY = art.maxY - GAME_VIEWPORT.top - margin;
	let isSmallerThanViewport = false;
	if (minX >= maxX) {
		const center = (art.minX + art.maxX) / 2;
		minX = center - margin;
		maxX = center + margin;
		isSmallerThanViewport = true;
	}
	if (minY >= maxY) {
		const center =
			(art.minY + art.maxY) / 2 +
			(GAME_VIEWPORT.bottom - GAME_VIEWPORT.top) / 2;
		minY = center - margin;
		maxY = center + margin;
		isSmallerThanViewport = true;
	}
	// 下界向上、上界向下取整，四舍五入后范围不会超出推算值。
	const ceil = (value: number) => Math.ceil(value * 1e5 - 1e-6) / 1e5;
	const floor = (value: number) => Math.floor(value * 1e5 + 1e-6) / 1e5;
	return {
		bounds: [ceil(minX), ceil(minY), floor(maxX), floor(maxY)],
		isSmallerThanViewport,
	};
}

export function clampPointToRect(point: IMapPoint, rect: IMapRect): IMapPoint {
	return {
		x: Math.min(rect.maxX, Math.max(rect.minX, point.x)),
		y: Math.min(rect.maxY, Math.max(rect.minY, point.y)),
	};
}

export function screenToWorld(
	view: IMapView,
	width: number,
	height: number,
	point: IMapPoint
): IMapPoint {
	return {
		x: view.x + (point.x - width / 2) / view.scale,
		y: view.y - (point.y - height / 2) / view.scale,
	};
}

export function getVisibleWorldRect(
	view: IMapView,
	width: number,
	height: number
): IMapRect {
	return {
		minX: view.x - width / 2 / view.scale,
		minY: view.y - height / 2 / view.scale,
		maxX: view.x + width / 2 / view.scale,
		maxY: view.y + height / 2 / view.scale,
	};
}

export type TRectHandle = 'e' | 'n' | 'ne' | 'nw' | 's' | 'se' | 'sw' | 'w';

export const RECT_HANDLES = [
	'nw',
	'n',
	'ne',
	'e',
	'se',
	's',
	'sw',
	'w',
] as const satisfies readonly TRectHandle[];

export const RECT_HANDLE_CURSORS = {
	e: 'ew-resize',
	n: 'ns-resize',
	ne: 'nesw-resize',
	nw: 'nwse-resize',
	s: 'ns-resize',
	se: 'nwse-resize',
	sw: 'nesw-resize',
	w: 'ew-resize',
} as const satisfies Record<TRectHandle, string>;

export function getRectHandlePoint(
	rect: IMapRect,
	handle: TRectHandle
): IMapPoint {
	const x = handle.includes('w')
		? rect.minX
		: handle.includes('e')
			? rect.maxX
			: (rect.minX + rect.maxX) / 2;
	const y = handle.includes('s')
		? rect.minY
		: handle.includes('n')
			? rect.maxY
			: (rect.minY + rect.maxY) / 2;
	return { x, y };
}

/** 拖动控制点时固定对边；越过对边时翻转，最小尺寸为一个吸附步长。 */
export function resizeRectWithHandle(
	rect: IMapRect,
	handle: TRectHandle,
	point: IMapPoint,
	snapStep: number
): IMapRect {
	const minSize = snapStep > 0 ? snapStep : 0.01;
	let { maxX, maxY, minX, minY } = rect;
	const x = snapToStep(point.x, snapStep);
	const y = snapToStep(point.y, snapStep);
	if (handle.includes('w')) minX = x;
	if (handle.includes('e')) maxX = x;
	if (handle.includes('s')) minY = y;
	if (handle.includes('n')) maxY = y;
	if (minX > maxX) [minX, maxX] = [maxX, minX];
	if (minY > maxY) [minY, maxY] = [maxY, minY];
	if (maxX - minX < minSize) {
		if (handle.includes('w')) minX = maxX - minSize;
		else maxX = minX + minSize;
	}
	if (maxY - minY < minSize) {
		if (handle.includes('s')) minY = maxY - minSize;
		else maxY = minY + minSize;
	}
	return {
		minX: roundMapValue(minX),
		minY: roundMapValue(minY),
		maxX: roundMapValue(maxX),
		maxY: roundMapValue(maxY),
	};
}

export function hitTestRectHandle(
	rect: IMapRect,
	point: IMapPoint,
	scale: number,
	radiusPx = 8
): TRectHandle | null {
	const radius = radiusPx / scale;
	for (const handle of RECT_HANDLES) {
		const target = getRectHandlePoint(rect, handle);
		if (
			Math.abs(target.x - point.x) <= radius &&
			Math.abs(target.y - point.y) <= radius
		)
			return handle;
	}
	return null;
}
