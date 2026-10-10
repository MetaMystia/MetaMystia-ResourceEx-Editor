import type {
	IDayMap,
	IDayMapCell,
	IDayMapObject,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';

import {
	type IMapPoint,
	type IMapRect,
	type ITileBrush,
	type ITileBrushCell,
	MAP_LIMITS,
	type TMapEntityKind,
} from './dayMapEditorModel';
import {
	applyHeightChanges,
	applyLayerCellChanges,
	countLayerCells,
	createCellIndex,
	createHeightIndex,
	createPaintedCell,
	floodFillCells,
	getCellKey,
	getRectCells,
	hasPlacement,
	readPlacement,
	replaceLayer,
} from './dayMapEdits';
import {
	doRectsIntersect,
	getBrushOffsets,
	getCollisionRect,
	getObjectRect,
	getPaintedCellRect,
	isPointInRect,
} from './dayMapSpatial';
import { getSceneDrawOrder, getTileIndex } from './render/sceneGeometry';

export interface IStampCell {
	tile: string;
	x: number;
	y: number;
}

/** 画笔落在格子上的范围：多格图章按原样，单格画笔按笔刷尺寸铺开。 */
export function getStampCells(
	brush: ITileBrush | null,
	brushSize: number
): ITileBrushCell[] {
	if (!brush || brush.cells.length === 0) return [];
	if (brush.cells.length > 1) return [...brush.cells];
	const tile = brush.cells[0]?.tile ?? '';
	return getBrushOffsets(brushSize).map(({ x, y }) => ({
		dx: x,
		dy: y,
		tile,
	}));
}

export function getStampSize(cells: readonly ITileBrushCell[]) {
	let maxX = 0;
	let maxY = 0;
	let minX = 0;
	let minY = 0;
	for (const cell of cells) {
		minX = Math.min(minX, cell.dx);
		minY = Math.min(minY, cell.dy);
		maxX = Math.max(maxX, cell.dx);
		maxY = Math.max(maxY, cell.dy);
	}
	return { height: maxY - minY + 1, minX, minY, width: maxX - minX + 1 };
}

/** 多格图章以中心对齐光标；单格画笔的偏移已经居中。 */
export function placeStamp(
	cells: readonly ITileBrushCell[],
	center: IMapPoint,
	isMultiTile: boolean
): IStampCell[] {
	if (!isMultiTile)
		return cells.map((cell) => ({
			tile: cell.tile,
			x: center.x + cell.dx,
			y: center.y + cell.dy,
		}));
	const size = getStampSize(cells);
	const offsetX = center.x - size.minX - Math.floor((size.width - 1) / 2);
	const offsetY = center.y - size.minY - Math.floor((size.height - 1) / 2);
	return cells.map((cell) => ({
		tile: cell.tile,
		x: offsetX + cell.dx,
		y: offsetY + cell.dy,
	}));
}

/** 填充和矩形按图章重复铺设，锚定在区域左下角。 */
export function getPatternTile(
	cells: readonly ITileBrushCell[],
	origin: IMapPoint,
	x: number,
	y: number
): string | null {
	if (cells.length === 0) return null;
	if (cells.length === 1) return cells[0]?.tile ?? null;
	const size = getStampSize(cells);
	const dx = (((x - origin.x) % size.width) + size.width) % size.width;
	const dy = (((y - origin.y) % size.height) + size.height) % size.height;
	return (
		cells.find(
			(cell) => cell.dx - size.minX === dx && cell.dy - size.minY === dy
		)?.tile ?? null
	);
}

export interface IStrokeState {
	addedCount: number;
	baseCount: number;
	baseKeys: readonly string[];
	cellIndex: Map<string, IDayMapCell>;
	changes: Map<string, IDayMapCell | null>;
	heightChanges: Map<string, number | null>;
	heightIndex: Map<string, number>;
	isLimitReached: boolean;
}

export function createStrokeState(
	map: IDayMap,
	target: 'height' | 'tile',
	layerIndex: number
): IStrokeState {
	const layer = map.layers[layerIndex];
	return {
		addedCount: 0,
		baseCount:
			target === 'height'
				? (map.height?.cells.length ?? 0)
				: countLayerCells(map),
		baseKeys:
			target === 'tile' && layer
				? layer.cells.map((cell) => getCellKey(cell.x, cell.y))
				: [],
		cellIndex:
			target === 'tile' && layer
				? createCellIndex(layer.cells)
				: new Map(),
		changes: new Map(),
		heightChanges: new Map(),
		heightIndex: target === 'height' ? createHeightIndex(map) : new Map(),
		isLimitReached: false,
	};
}

function getLimit(target: 'height' | 'tile') {
	return target === 'height'
		? MAP_LIMITS.heightCellCount
		: MAP_LIMITS.cellCount;
}

/** 记录一个格子的修改并计算新增数量，超过上限时停止新增。 */
export function writeTileCell(
	state: IStrokeState,
	brush: ITileBrush | null,
	x: number,
	y: number,
	tile: string | null
) {
	const key = getCellKey(x, y);
	const existing = state.cellIndex.get(key);
	const previous = state.changes.get(key);
	const wasPresent =
		previous === undefined ? existing !== undefined : previous !== null;
	if (tile === null) {
		if (!wasPresent) return;
		state.changes.set(key, null);
		if (!existing) state.addedCount -= 1;
		return;
	}
	if (!wasPresent) {
		if (state.baseCount + state.addedCount >= getLimit('tile')) {
			state.isLimitReached = true;
			return;
		}
		if (!existing) state.addedCount += 1;
	}
	state.changes.set(
		key,
		createPaintedCell(existing, x, y, tile, brush?.placement)
	);
}

export function writeHeightCell(
	state: IStrokeState,
	x: number,
	y: number,
	slope: number | null
) {
	const key = getCellKey(x, y);
	const existing = state.heightIndex.get(key);
	const previous = state.heightChanges.get(key);
	const wasPresent =
		previous === undefined
			? existing !== undefined
			: previous !== null && previous !== 0;
	const isRemoval = slope === null || slope === 0;
	if (isRemoval) {
		if (!wasPresent) return;
		state.heightChanges.set(key, null);
		if (existing === undefined) state.addedCount -= 1;
		return;
	}
	if (!wasPresent) {
		if (state.baseCount + state.addedCount >= getLimit('height')) {
			state.isLimitReached = true;
			return;
		}
		if (existing === undefined) state.addedCount += 1;
	}
	state.heightChanges.set(key, slope);
}

export function applyStroke(
	base: IDayMap,
	state: IStrokeState,
	target: 'height' | 'tile',
	layerIndex: number
): IDayMap {
	if (target === 'height')
		return applyHeightChanges(base, state.heightChanges);
	const layer = base.layers[layerIndex];
	if (!layer) return base;
	return replaceLayer(
		base,
		layerIndex,
		applyLayerCellChanges(layer, state.changes, state.baseKeys)
	);
}

export interface IAreaResult {
	error?: string;
	map: IDayMap;
	notice?: string;
}

/** 填充以所有已绘制格子的外框为边界，避免在空地上无限扩散。 */
export function fillArea(
	map: IDayMap,
	start: IMapPoint,
	target: 'height' | 'tile',
	layerIndex: number,
	brush: ITileBrush | null,
	slope: number,
	isErase: boolean
): IAreaResult {
	const bounds = getPaintedCellRect(map);
	if (
		!bounds ||
		!isPointInRect(start, bounds) ||
		bounds.maxX - bounds.minX > 8192 ||
		bounds.maxY - bounds.minY > 8192
	)
		return {
			error: '填充起点在已绘制范围之外。先画出边界，或使用矩形工具。',
			map,
		};
	const state = createStrokeState(map, target, layerIndex);
	const layer = map.layers[layerIndex];
	if (target === 'tile' && !layer) return { error: '请先选择图层。', map };
	const readValue =
		target === 'tile'
			? (x: number, y: number) =>
					state.cellIndex.get(getCellKey(x, y))?.tile ?? null
			: (x: number, y: number) =>
					state.heightIndex.get(getCellKey(x, y)) ?? null;
	const startValue = readValue(start.x, start.y);
	if (isErase && startValue === null) return { map };
	const result = floodFillCells(start, bounds, readValue, getLimit(target));
	const stamp = target === 'tile' ? getStampCells(brush, 1) : [];
	if (target === 'tile' && !isErase && stamp.length === 0)
		return { error: '请先在瓦片库中选择画笔。', map };
	for (const cell of result.cells) {
		if (target === 'height')
			writeHeightCell(state, cell.x, cell.y, isErase ? null : slope);
		else
			writeTileCell(
				state,
				brush,
				cell.x,
				cell.y,
				isErase ? null : getPatternTile(stamp, start, cell.x, cell.y)
			);
	}
	const next = applyStroke(map, state, target, layerIndex);
	return {
		map: next,
		...(result.isTruncated || state.isLimitReached
			? { notice: '填充区域过大，已在容量上限处停止。' }
			: {}),
	};
}

export function fillRect(
	map: IDayMap,
	rect: IMapRect,
	target: 'height' | 'tile',
	layerIndex: number,
	brush: ITileBrush | null,
	slope: number,
	isErase: boolean
): IAreaResult {
	const area = (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
	if (area > getLimit(target))
		return { error: `单次矩形不能超过 ${getLimit(target)} 格。`, map };
	const state = createStrokeState(map, target, layerIndex);
	const stamp = target === 'tile' ? getStampCells(brush, 1) : [];
	if (target === 'tile' && !isErase && stamp.length === 0)
		return { error: '请先在瓦片库中选择画笔。', map };
	const origin = { x: rect.minX, y: rect.minY };
	for (const cell of getRectCells(rect)) {
		if (target === 'height')
			writeHeightCell(state, cell.x, cell.y, isErase ? null : slope);
		else
			writeTileCell(
				state,
				brush,
				cell.x,
				cell.y,
				isErase ? null : getPatternTile(stamp, origin, cell.x, cell.y)
			);
	}
	return {
		map: applyStroke(map, state, target, layerIndex),
		...(state.isLimitReached
			? { notice: '已达到格子上限，部分格子没有绘制。' }
			: {}),
	};
}

export interface IPickedCell {
	cell: IDayMapCell;
	layerIndex: number;
}

/** 先取当前图层；为空时取最上方可见图层。 */
export function pickCell(
	map: IDayMap,
	cell: IMapPoint,
	activeLayerIndex: number,
	hiddenLayers: ReadonlySet<number>
): IPickedCell | null {
	const key = getCellKey(cell.x, cell.y);
	const find = (layerIndex: number) =>
		map.layers[layerIndex]?.cells.find(
			(item) => getCellKey(item.x, item.y) === key
		);
	const active = find(activeLayerIndex);
	if (active) return { cell: active, layerIndex: activeLayerIndex };
	const order = getSceneDrawOrder(map)
		.filter((entry) => entry.kind === 'layer')
		.reverse();
	for (const entry of order) {
		if (hiddenLayers.has(entry.index)) continue;
		if (map.layers[entry.index]?.active === false) continue;
		const found = find(entry.index);
		if (found) return { cell: found, layerIndex: entry.index };
	}
	return null;
}

export function createBrushFromCell(
	map: IDayMap,
	cell: IDayMapCell
): ITileBrush {
	const placement =
		map.formatVersion === 2 && hasPlacement(cell)
			? readPlacement(cell)
			: undefined;
	return {
		cells: [{ dx: 0, dy: 0, tile: cell.tile }],
		...(placement ? { placement } : {}),
	};
}

/* ── 实体命中 ─────────────────────────────────────────── */

interface IObjectHitCache {
	order: number[];
	rects: IMapRect[];
	tiles: readonly IDayMapTile[];
}

const objectHitCache = new WeakMap<readonly IDayMapObject[], IObjectHitCache>();

function getObjectHitCache(map: IDayMap): IObjectHitCache {
	let cache = objectHitCache.get(map.objects);
	if (cache?.tiles === map.tiles) return cache;
	const tiles: ReadonlyMap<string, IDayMapTile> = getTileIndex(map.tiles);
	const rects = map.objects.map((object) =>
		getObjectRect(map, object, tiles)
	);
	const order = getSceneDrawOrder(map)
		.filter((entry) => entry.kind === 'object')
		.map((entry) => entry.index)
		.reverse();
	cache = { order, rects, tiles: map.tiles };
	objectHitCache.set(map.objects, cache);
	return cache;
}

function getObjectRects(map: IDayMap) {
	return getObjectHitCache(map).rects;
}

/**
 * `anchor` 只认脚点附近，便于在放置模式下密集摆放；
 * `area` 按切片外框命中，最上层优先。
 */
export function hitTestEntity(
	map: IDayMap,
	kind: TMapEntityKind,
	point: IMapPoint,
	scale: number,
	precision: 'anchor' | 'area' = 'area'
): number {
	const anchorRadius = Math.max(0.2, 9 / scale);
	if (kind === 'spawn') {
		let best = -1;
		let distance = Math.max(0.35, 12 / scale);
		map.spawnMarkers.forEach((marker, index) => {
			const current = Math.hypot(marker.x - point.x, marker.y - point.y);
			if (current <= distance) {
				best = index;
				distance = current;
			}
		});
		return best;
	}
	if (kind === 'collision') {
		for (let index = map.collisions.length - 1; index >= 0; index--) {
			const box = map.collisions[index];
			if (box && isPointInRect(point, getCollisionRect(box), 2 / scale))
				return index;
		}
		return -1;
	}
	const cache = getObjectHitCache(map);
	for (const index of cache.order) {
		const object = map.objects[index];
		if (!object) continue;
		if (
			Math.abs(object.x - point.x) <= anchorRadius &&
			Math.abs(object.y - point.y) <= anchorRadius
		)
			return index;
	}
	if (precision === 'anchor') return -1;
	for (const index of cache.order) {
		const rect = cache.rects[index];
		if (rect && isPointInRect(point, rect)) return index;
	}
	return -1;
}

export function collectEntitiesInRect(
	map: IDayMap,
	kind: TMapEntityKind,
	rect: IMapRect
): number[] {
	if (kind === 'spawn')
		return map.spawnMarkers.flatMap((marker, index) =>
			isPointInRect(marker, rect) ? [index] : []
		);
	if (kind === 'collision')
		return map.collisions.flatMap((box, index) =>
			doRectsIntersect(getCollisionRect(box), rect) ? [index] : []
		);
	const rects = getObjectRects(map);
	return map.objects.flatMap((_, index) => {
		const objectRect = rects[index];
		return objectRect && doRectsIntersect(objectRect, rect) ? [index] : [];
	});
}

export function getEntityRect(
	map: IDayMap,
	kind: TMapEntityKind,
	index: number
): IMapRect | null {
	if (kind === 'spawn') {
		const marker = map.spawnMarkers[index];
		return marker
			? {
					minX: marker.x - 1,
					minY: marker.y - 1,
					maxX: marker.x + 1,
					maxY: marker.y + 1,
				}
			: null;
	}
	if (kind === 'collision') {
		const box = map.collisions[index];
		return box ? getCollisionRect(box) : null;
	}
	return getObjectRects(map)[index] ?? null;
}
