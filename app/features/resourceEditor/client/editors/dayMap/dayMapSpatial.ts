import type {
	IDayMap,
	IDayMapLayer,
	IDayMapObject,
	IDayMapPrefab,
	TDayMapCollider,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	getColliderOutlines,
	type IDayMapPlacement,
	isPointInCollider,
	placeCollider,
} from '@/domain/resourcePack/dayMapGeometry';

import {
	GAME_VIEWPORT,
	type IMapPoint,
	type IMapRect,
	type IMapView,
} from './dayMapEditorModel';

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

function includeRect(rect: IMapRect, other: IMapRect) {
	includePoint(rect, other.minX, other.minY);
	includePoint(rect, other.maxX, other.maxY);
}

export function getPointsRect(points: readonly number[][]): IMapRect {
	const rect = createEmptyRect();
	for (const [x = NaN, y = NaN] of points) includePoint(rect, x, y);
	return rect;
}

export function getLayerRect(map: IDayMap, layer: IDayMapLayer): IMapRect {
	const ppu = map.pixelsPerUnit;
	return {
		minX: layer.x / ppu,
		minY: layer.y / ppu,
		maxX: (layer.x + layer.image.width) / ppu,
		maxY: (layer.y + layer.image.height) / ppu,
	};
}

/** 模板图片在锚点坐标系下的范围（未缩放）。 */
export function getPrefabLocalRect(prefab: IDayMapPrefab): IMapRect {
	const { height, width } = prefab.image;
	const [pivotX = 0.5, pivotY = 0] = prefab.pivot;
	const ppu = prefab.pixelsPerUnit;
	return {
		minX: (-pivotX * width) / ppu,
		minY: (-pivotY * height) / ppu,
		maxX: ((1 - pivotX) * width) / ppu,
		maxY: ((1 - pivotY) * height) / ppu,
	};
}

export function getObjectPlacement(object: IDayMapObject): IDayMapPlacement {
	return {
		scaleX: object.scale[0] ?? 1,
		scaleY: object.scale[1] ?? 1,
		x: object.x,
		y: object.y,
	};
}

export function getObjectRect(
	object: IDayMapObject,
	prefab: IDayMapPrefab | undefined
): IMapRect {
	if (!prefab)
		return {
			minX: object.x - 0.5,
			minY: object.y,
			maxX: object.x + 0.5,
			maxY: object.y + 1,
		};
	const local = getPrefabLocalRect(prefab);
	const { scaleX, scaleY } = getObjectPlacement(object);
	const xs = [local.minX * scaleX, local.maxX * scaleX];
	const ys = [local.minY * scaleY, local.maxY * scaleY];
	return {
		minX: object.x + Math.min(...xs),
		minY: object.y + Math.min(...ys),
		maxX: object.x + Math.max(...xs),
		maxY: object.y + Math.max(...ys),
	};
}

export function getColliderRect(collider: TDayMapCollider): IMapRect {
	const rect = createEmptyRect();
	for (const outline of getColliderOutlines(collider))
		includeRect(rect, getPointsRect(outline.points));
	return rect;
}

export function getPrefabIndex(map: IDayMap) {
	return new Map(map.prefabs.map((prefab) => [prefab.key, prefab]));
}

/** 物件模板碰撞在世界坐标中的位置。 */
export function getPlacedPrefabColliders(
	object: IDayMapObject,
	prefab: IDayMapPrefab | undefined
): TDayMapCollider[] {
	const placement = getObjectPlacement(object);
	return (prefab?.colliders ?? []).map((collider) =>
		placeCollider(collider, placement)
	);
}

/** 美术范围：图层与物件，不含碰撞和标记。 */
export function getMapArtRect(map: IDayMap): IMapRect {
	const rect = createEmptyRect();
	for (const layer of map.layers) includeRect(rect, getLayerRect(map, layer));
	const prefabs = getPrefabIndex(map);
	for (const object of map.objects)
		includeRect(rect, getObjectRect(object, prefabs.get(object.prefab)));
	return rect;
}

/** 定位地图时使用的完整范围，空地图返回默认视野。 */
export function getMapContentRect(map: IDayMap): IMapRect {
	const rect = getMapArtRect(map);
	for (const collider of map.colliders)
		includeRect(rect, getColliderRect(collider));
	for (const marker of map.spawnMarkers)
		includePoint(rect, marker.x, marker.y);
	for (const cell of map.height?.cells ?? []) {
		includePoint(rect, cell.x, cell.y);
		includePoint(rect, cell.x + 1, cell.y + 1);
	}
	return isRectFinite(rect) ? rect : { minX: -8, minY: -5, maxX: 8, maxY: 5 };
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

export function rectToPolygon(rect: IMapRect): number[][] {
	return [
		[rect.minX, rect.minY],
		[rect.maxX, rect.minY],
		[rect.maxX, rect.maxY],
		[rect.minX, rect.maxY],
	];
}

export function snapToStep(value: number, step: number) {
	if (!(step > 0)) return roundMapValue(value);
	return roundMapValue(Math.round(value / step) * step);
}

export function snapPoint(point: IMapPoint, step: number): IMapPoint {
	return { x: snapToStep(point.x, step), y: snapToStep(point.y, step) };
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

export function getRectCells(rect: IMapRect): IMapPoint[] {
	const cells: IMapPoint[] = [];
	for (let y = Math.floor(rect.minY); y <= Math.floor(rect.maxY); y++)
		for (let x = Math.floor(rect.minX); x <= Math.floor(rect.maxX); x++)
			cells.push({ x, y });
	return cells;
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
	bounds: number[][];
	isSmallerThanViewport: boolean;
}

/** 按美术范围与游戏视口推算矩形相机中心范围，地图小于视口时收拢到中心。 */
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
		bounds: rectToPolygon({
			minX: ceil(minX),
			minY: ceil(minY),
			maxX: floor(maxX),
			maxY: floor(maxY),
		}),
		isSmallerThanViewport,
	};
}

/** 把点限制在相机多边形内：在内部时不变，否则取最近的边上一点。 */
export function clampPointToPolygon(
	point: IMapPoint,
	polygon: readonly number[][]
): IMapPoint {
	if (polygon.length < 3 || isPointInPolygon(point, polygon)) return point;
	let best = point;
	let bestDistance = Infinity;
	forEachSegment(polygon, true, (a, b) => {
		const candidate = projectToSegment(point, a, b);
		const distance =
			(candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	});
	return best;
}

export function isPointInPolygon(
	point: IMapPoint,
	polygon: readonly number[][]
) {
	return isPointInCollider(
		{ paths: [polygon as number[][]], shape: 'polygon' },
		point.x,
		point.y
	);
}

export function forEachSegment(
	points: readonly number[][],
	isClosed: boolean,
	visit: (a: IMapPoint, b: IMapPoint, index: number) => void
) {
	const count = isClosed ? points.length : points.length - 1;
	for (let i = 0; i < count; i++) {
		const [ax = 0, ay = 0] = points[i] ?? [];
		const [bx = 0, by = 0] = points[(i + 1) % points.length] ?? [];
		visit({ x: ax, y: ay }, { x: bx, y: by }, i);
	}
}

export function projectToSegment(
	point: IMapPoint,
	a: IMapPoint,
	b: IMapPoint
): IMapPoint {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = dx * dx + dy * dy;
	const t =
		length === 0
			? 0
			: Math.max(
					0,
					Math.min(
						1,
						((point.x - a.x) * dx + (point.y - a.y) * dy) / length
					)
				);
	return { x: a.x + dx * t, y: a.y + dy * t };
}

export function getDistanceToSegment(
	point: IMapPoint,
	a: IMapPoint,
	b: IMapPoint
) {
	const projected = projectToSegment(point, a, b);
	return Math.hypot(projected.x - point.x, projected.y - point.y);
}

/** 点到碰撞的命中：实心内部或离任一轮廓线足够近。 */
export function isColliderHit(
	collider: TDayMapCollider,
	point: IMapPoint,
	tolerance: number
) {
	if (isPointInCollider(collider, point.x, point.y)) return true;
	return getColliderOutlines(collider).some((outline) => {
		let isHit = false;
		forEachSegment(outline.points, outline.isClosed, (a, b) => {
			if (!isHit && getDistanceToSegment(point, a, b) <= tolerance)
				isHit = true;
		});
		return isHit;
	});
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

/** 顶点列表中与点最近且在半径内的顶点。 */
export function hitTestPoint(
	points: readonly number[][],
	point: IMapPoint,
	scale: number,
	radiusPx = 8
): number {
	const radius = radiusPx / scale;
	let best = -1;
	let bestDistance = Infinity;
	points.forEach(([x = NaN, y = NaN], index) => {
		const distance = Math.hypot(x - point.x, y - point.y);
		if (distance <= radius && distance < bestDistance) {
			best = index;
			bestDistance = distance;
		}
	});
	return best;
}
