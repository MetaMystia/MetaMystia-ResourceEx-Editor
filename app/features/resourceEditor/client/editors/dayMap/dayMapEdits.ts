import type {
	IDayMap,
	IDayMapCell,
	IDayMapCollision,
	IDayMapHeightCell,
	IDayMapLayer,
	IDayMapObject,
	IDayMapPlacement,
	IDayMapSpawn,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import { DAY_MAP_TILE_LIMIT } from '@/domain/resourcePack/dayMapGeometry';

import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

import {
	type IMapPoint,
	type IMapRect,
	MAP_LIMITS,
	type TMapEntityKind,
} from './dayMapEditorModel';
import {
	clampMapCoordinate,
	getCollisionRect,
	roundMapValue,
} from './dayMapSpatial';

const PLACEMENT_KEYS = [
	'transform',
	'color',
	'active',
	'shader',
	'sortingValue',
] as const satisfies readonly (keyof IDayMapPlacement)[];

export function getCellKey(x: number, y: number) {
	return `${x},${y}`;
}

export function readPlacement(source: IDayMapPlacement): IDayMapPlacement {
	const placement: IDayMapPlacement = {};
	if (source.transform !== undefined)
		placement.transform = [...source.transform];
	if (source.color !== undefined) placement.color = [...source.color];
	if (source.active !== undefined) placement.active = source.active;
	if (source.shader !== undefined) placement.shader = source.shader;
	if (source.sortingValue !== undefined)
		placement.sortingValue = source.sortingValue;
	return placement;
}

export function hasPlacement(source: IDayMapPlacement) {
	return PLACEMENT_KEYS.some((key) => source[key] !== undefined);
}

function isSamePlacement(a: IDayMapPlacement, b: IDayMapPlacement) {
	return PLACEMENT_KEYS.every(
		(key) => JSON.stringify(a[key]) === JSON.stringify(b[key])
	);
}

/**
 * 画到已有格子时保留未知扩展字段；换成别的切片或带吸取属性时，
 * 变换、颜色等原始属性改用画笔的值，避免沿用另一切片的偏移。
 */
export function createPaintedCell(
	existing: IDayMapCell | undefined,
	x: number,
	y: number,
	tile: string,
	placement?: IDayMapPlacement
): IDayMapCell {
	if (existing && existing.tile === tile) {
		if (!placement || isSamePlacement(existing, placement)) return existing;
	}
	const base: IDayMapCell = existing ? { ...existing } : { x, y, tile };
	for (const key of PLACEMENT_KEYS) delete base[key];
	return { ...base, x, y, tile, ...placement };
}

/**
 * `null` 表示删除该格；保留未改动格子的原有顺序，新格子追加到末尾。
 * 笔划中会反复调用，可传入与 `layer.cells` 一一对应的预算键。
 */
export function applyLayerCellChanges(
	layer: IDayMapLayer,
	changes: ReadonlyMap<string, IDayMapCell | null>,
	keys?: readonly string[]
): IDayMapLayer {
	if (changes.size === 0) return layer;
	const consumed = new Set<string>();
	const cells: IDayMapCell[] = [];
	let hasChanged = false;
	for (let index = 0; index < layer.cells.length; index++) {
		const cell = layer.cells[index];
		if (!cell) continue;
		const key = keys?.[index] ?? getCellKey(cell.x, cell.y);
		const replacement = changes.get(key);
		if (replacement === undefined) {
			cells.push(cell);
			continue;
		}
		if (consumed.has(key) || replacement === null) {
			hasChanged = true;
			continue;
		}
		consumed.add(key);
		if (replacement !== cell) hasChanged = true;
		cells.push(replacement);
	}
	for (const [key, cell] of changes) {
		if (cell === null || consumed.has(key)) continue;
		hasChanged = true;
		cells.push(cell);
	}
	return hasChanged ? { ...layer, cells } : layer;
}

export function applyHeightChanges(
	map: IDayMap,
	changes: ReadonlyMap<string, number | null>
): IDayMap {
	if (changes.size === 0) return map;
	const current = map.height?.cells ?? [];
	const consumed = new Set<string>();
	const cells: IDayMapHeightCell[] = [];
	let hasChanged = false;
	for (const cell of current) {
		const key = getCellKey(cell.x, cell.y);
		const slope = changes.get(key);
		if (slope === undefined) {
			cells.push(cell);
			continue;
		}
		if (consumed.has(key) || slope === null || slope === 0) {
			hasChanged = true;
			continue;
		}
		consumed.add(key);
		if (slope !== cell.slope) hasChanged = true;
		cells.push(slope === cell.slope ? cell : { ...cell, slope });
	}
	for (const [key, slope] of changes) {
		if (slope === null || slope === 0 || consumed.has(key)) continue;
		const [x = 0, y = 0] = key.split(',').map(Number);
		hasChanged = true;
		cells.push({ x, y, slope });
	}
	return hasChanged ? { ...map, height: { ...map.height, cells } } : map;
}

export function replaceLayer(
	map: IDayMap,
	index: number,
	layer: IDayMapLayer
): IDayMap {
	if (map.layers[index] === layer) return map;
	return {
		...map,
		layers: map.layers.map((item, i) => (i === index ? layer : item)),
	};
}

export function countLayerCells(map: IDayMap) {
	let count = 0;
	for (const layer of map.layers) count += layer.cells.length;
	return count;
}

export function createCellIndex(cells: readonly IDayMapCell[]) {
	const index = new Map<string, IDayMapCell>();
	for (const cell of cells) {
		const key = getCellKey(cell.x, cell.y);
		if (!index.has(key)) index.set(key, cell);
	}
	return index;
}

export function createHeightIndex(map: IDayMap) {
	const index = new Map<string, number>();
	for (const cell of map.height?.cells ?? []) {
		const key = getCellKey(cell.x, cell.y);
		if (!index.has(key)) index.set(key, cell.slope);
	}
	return index;
}

export interface IFloodFillResult {
	cells: IMapPoint[];
	isTruncated: boolean;
}

/** 在限定范围内查找四向相连且值相同的格子。 */
export function floodFillCells(
	start: IMapPoint,
	bounds: IMapRect,
	readValue: (x: number, y: number) => string | number | null,
	limit: number
): IFloodFillResult {
	const target = readValue(start.x, start.y);
	const width = bounds.maxX - bounds.minX + 1;
	const visited = new Set<number>();
	const cells: IMapPoint[] = [];
	const stack: IMapPoint[] = [start];
	const toId = (x: number, y: number) =>
		(y - bounds.minY) * width + (x - bounds.minX);
	visited.add(toId(start.x, start.y));
	while (stack.length > 0) {
		const cell = stack.pop();
		if (!cell) break;
		cells.push(cell);
		if (cells.length >= limit) return { cells, isTruncated: true };
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		] as const) {
			const x = cell.x + dx;
			const y = cell.y + dy;
			if (
				x < bounds.minX ||
				x > bounds.maxX ||
				y < bounds.minY ||
				y > bounds.maxY
			)
				continue;
			const id = toId(x, y);
			if (visited.has(id)) continue;
			visited.add(id);
			if (readValue(x, y) === target) stack.push({ x, y });
		}
	}
	return { cells, isTruncated: false };
}

export function getRectCells(rect: IMapRect): IMapPoint[] {
	const cells: IMapPoint[] = [];
	for (let y = rect.minY; y <= rect.maxY; y++)
		for (let x = rect.minX; x <= rect.maxX; x++) cells.push({ x, y });
	return cells;
}

/* ── 实体 ─────────────────────────────────────────────── */

export function getEntityCount(map: IDayMap, kind: TMapEntityKind) {
	return kind === 'object'
		? map.objects.length
		: kind === 'collision'
			? map.collisions.length
			: map.spawnMarkers.length;
}

function clampObjectY(object: IDayMapObject, y: number) {
	return object.sortByY
		? Math.max(
				-MAP_LIMITS.sortedObjectY,
				Math.min(MAP_LIMITS.sortedObjectY, y)
			)
		: clampMapCoordinate(y);
}

/** 以原始位置为基准整体平移，拖动过程中反复调用不会累积误差。 */
export function moveEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>,
	dx: number,
	dy: number
): IDayMap {
	if (indices.size === 0 || (dx === 0 && dy === 0)) return map;
	const move = <T extends { x: number; y: number }>(item: T): T => ({
		...item,
		x: roundMapValue(clampMapCoordinate(item.x + dx)),
		y: roundMapValue(clampMapCoordinate(item.y + dy)),
	});
	if (kind === 'object')
		return {
			...map,
			objects: map.objects.map((item, i) =>
				indices.has(i)
					? {
							...move(item),
							y: roundMapValue(clampObjectY(item, item.y + dy)),
						}
					: item
			),
		};
	if (kind === 'collision')
		return {
			...map,
			collisions: map.collisions.map((item, i) =>
				indices.has(i) ? move(item) : item
			),
		};
	return {
		...map,
		spawnMarkers: map.spawnMarkers.map((item, i) =>
			indices.has(i) ? move(item) : item
		),
	};
}

export function deleteEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>
): IDayMap {
	if (indices.size === 0) return map;
	if (kind === 'object')
		return {
			...map,
			objects: map.objects.filter((_, i) => !indices.has(i)),
		};
	if (kind === 'collision')
		return {
			...map,
			collisions: map.collisions.filter((_, i) => !indices.has(i)),
		};
	const spawnMarkers = map.spawnMarkers.filter((_, i) => !indices.has(i));
	const hasDefault = spawnMarkers.some(
		(marker) => marker.name === map.defaultSpawnMarker
	);
	return {
		...map,
		spawnMarkers,
		defaultSpawnMarker: hasDefault
			? map.defaultSpawnMarker
			: (spawnMarkers[0]?.name ?? ''),
	};
}

export interface IEntityInsertResult {
	indices: number[];
	map: IDayMap;
}

function getSpawnNames(markers: readonly IDayMapSpawn[]) {
	return markers.map((marker) => marker.name);
}

export function duplicateEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>,
	dx: number,
	dy: number
): IEntityInsertResult | string {
	const sorted = [...indices].sort((a, b) => a - b);
	const count = getEntityCount(map, kind);
	const limit =
		kind === 'object'
			? MAP_LIMITS.objectCount
			: kind === 'collision'
				? MAP_LIMITS.collisionCount
				: MAP_LIMITS.spawnCount;
	if (count + sorted.length > limit) return `复制后会超过上限（${limit}）。`;
	const nextIndices = sorted.map((_, i) => count + i);
	const offset = <T extends { x: number; y: number }>(item: T): T => ({
		...item,
		x: roundMapValue(clampMapCoordinate(item.x + dx)),
		y: roundMapValue(clampMapCoordinate(item.y + dy)),
	});
	if (kind === 'object') {
		const names = new Set(map.objects.map((item) => item.name));
		const copies = sorted.flatMap((index) => {
			const item = map.objects[index];
			if (!item) return [];
			const name = findNextAvailableSuffixedValue(
				names,
				`${item.name.replace(/\d+$/, '') || '装饰'}`
			);
			names.add(name);
			return [
				{
					...offset(item),
					y: roundMapValue(clampObjectY(item, item.y + dy)),
					name,
				},
			];
		});
		return {
			indices: nextIndices,
			map: { ...map, objects: [...map.objects, ...copies] },
		};
	}
	if (kind === 'collision') {
		const names = new Set(map.collisions.map((item) => item.name));
		const copies = sorted.flatMap((index) => {
			const item = map.collisions[index];
			if (!item) return [];
			const name = findNextAvailableSuffixedValue(names, '碰撞');
			names.add(name);
			return [{ ...offset(item), name }];
		});
		return {
			indices: nextIndices,
			map: { ...map, collisions: [...map.collisions, ...copies] },
		};
	}
	const names = new Set(getSpawnNames(map.spawnMarkers));
	const copies = sorted.flatMap((index) => {
		const item = map.spawnMarkers[index];
		if (!item) return [];
		const name = findNextAvailableSuffixedValue(names, `${item.name}_`);
		names.add(name);
		return [{ ...offset(item), name }];
	});
	return {
		indices: nextIndices,
		map: { ...map, spawnMarkers: [...map.spawnMarkers, ...copies] },
	};
}

export function addObject(
	map: IDayMap,
	tile: string,
	x: number,
	y: number
): IEntityInsertResult | string {
	if (!map.tiles.some((item) => item.key === tile))
		return '请先在瓦片库中选择装饰使用的切片。';
	if (map.objects.length >= MAP_LIMITS.objectCount)
		return `一张地图最多${MAP_LIMITS.objectCount}个装饰。`;
	if (Math.abs(y) > MAP_LIMITS.sortedObjectY)
		return `按脚部 Y 排序的装饰，Y 坐标需在 ±${MAP_LIMITS.sortedObjectY} 之间。`;
	const name = findNextAvailableSuffixedValue(
		map.objects.map((item) => item.name),
		'装饰'
	);
	const object: IDayMapObject = {
		name,
		tile,
		x: roundMapValue(clampMapCoordinate(x)),
		y: roundMapValue(y),
		scale: [1, 1],
		sortByY: true,
		sortingLayer: 'Character',
		sortingOrder: 0,
	};
	return {
		indices: [map.objects.length],
		map: { ...map, objects: [...map.objects, object] },
	};
}

export function addSpawn(
	map: IDayMap,
	x: number,
	y: number
): IEntityInsertResult | string {
	if (map.spawnMarkers.length >= MAP_LIMITS.spawnCount)
		return `一张地图最多${MAP_LIMITS.spawnCount}个出生点。`;
	const name = findNextAvailableSuffixedValue(
		getSpawnNames(map.spawnMarkers),
		'Spawn'
	);
	const spawn: IDayMapSpawn = {
		name,
		x: roundMapValue(clampMapCoordinate(x)),
		y: roundMapValue(clampMapCoordinate(y)),
		rotation: 'Down',
	};
	return {
		indices: [map.spawnMarkers.length],
		map: {
			...map,
			spawnMarkers: [...map.spawnMarkers, spawn],
			defaultSpawnMarker: map.defaultSpawnMarker || name,
		},
	};
}

function createCollisionFromRect(
	rect: IMapRect,
	name: string
): IDayMapCollision {
	const width = rect.maxX - rect.minX;
	const height = rect.maxY - rect.minY;
	return {
		name,
		x: roundMapValue(rect.minX + width / 2),
		y: roundMapValue(rect.minY + height / 2),
		width: roundMapValue(width),
		height: roundMapValue(height),
	};
}

export function addCollision(
	map: IDayMap,
	rect: IMapRect
): IEntityInsertResult | string {
	if (map.collisions.length >= MAP_LIMITS.collisionCount)
		return `一张地图最多${MAP_LIMITS.collisionCount}个碰撞箱。`;
	if (!(rect.maxX - rect.minX > 0) || !(rect.maxY - rect.minY > 0))
		return '碰撞箱的宽高必须大于零。';
	const name = findNextAvailableSuffixedValue(
		map.collisions.map((item) => item.name),
		'碰撞'
	);
	return {
		indices: [map.collisions.length],
		map: {
			...map,
			collisions: [
				...map.collisions,
				createCollisionFromRect(rect, name),
			],
		},
	};
}

export function replaceCollisionRect(
	map: IDayMap,
	index: number,
	rect: IMapRect
): IDayMap {
	const box = map.collisions[index];
	if (!box) return map;
	const next = createCollisionFromRect(rect, box.name);
	const current = getCollisionRect(box);
	if (
		current.minX === rect.minX &&
		current.minY === rect.minY &&
		current.maxX === rect.maxX &&
		current.maxY === rect.maxY
	)
		return map;
	return {
		...map,
		collisions: map.collisions.map((item, i) =>
			i === index
				? {
						...item,
						x: next.x,
						y: next.y,
						width: next.width,
						height: next.height,
					}
				: item
		),
	};
}

export function patchObject(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapObject>
): IDayMap {
	return {
		...map,
		objects: map.objects.map((item, i) =>
			i === index ? { ...item, ...patch } : item
		),
	};
}

export function patchCollision(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapCollision>
): IDayMap {
	return {
		...map,
		collisions: map.collisions.map((item, i) =>
			i === index ? { ...item, ...patch } : item
		),
	};
}

/** 重命名默认出生点时同步更新默认引用。 */
export function patchSpawn(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapSpawn>
): IDayMap {
	const spawn = map.spawnMarkers[index];
	if (!spawn) return map;
	return {
		...map,
		defaultSpawnMarker:
			patch.name !== undefined && spawn.name === map.defaultSpawnMarker
				? patch.name
				: map.defaultSpawnMarker,
		spawnMarkers: map.spawnMarkers.map((item, i) =>
			i === index ? { ...item, ...patch } : item
		),
	};
}

export function checkSpawnName(
	map: IDayMap,
	index: number,
	name: string
): string | null {
	if (!name.trim()) return '名称不能为空';
	if (name !== name.trim()) return '名称首尾不能有空格';
	if (map.spawnMarkers.some((item, i) => i !== index && item.name === name))
		return '名称已被其他出生点使用';
	return null;
}

/* ── 图层 ─────────────────────────────────────────────── */

export function addLayer(
	map: IDayMap
): { index: number; map: IDayMap } | string {
	if (map.layers.length >= MAP_LIMITS.layerCount)
		return `一张地图最多${MAP_LIMITS.layerCount}个图层。`;
	const name = findNextAvailableSuffixedValue(
		map.layers.map((layer) => layer.name),
		'图层'
	);
	const highestOrder = map.layers
		.filter((layer) => layer.sortingLayer === 'Background')
		.reduce((value, layer) => Math.max(value, layer.sortingOrder), -2010);
	return {
		index: map.layers.length,
		map: {
			...map,
			layers: [
				...map.layers,
				{
					name,
					sortingLayer: 'Background',
					sortingOrder: Math.min(32767, highestOrder + 10),
					cells: [],
				},
			],
		},
	};
}

export function removeLayer(map: IDayMap, index: number): IDayMap {
	return { ...map, layers: map.layers.filter((_, i) => i !== index) };
}

export function patchLayer(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapLayer>
): IDayMap {
	const layer = map.layers[index];
	if (!layer) return map;
	return replaceLayer(map, index, { ...layer, ...patch });
}

/** 排序层名称对应的原始排序值，保持同名排序层一致。 */
export function findSortingValue(map: IDayMap, sortingLayer: string) {
	return [...map.layers, ...map.objects].find(
		(item) =>
			item.sortingLayer === sortingLayer &&
			item.sortingValue !== undefined
	)?.sortingValue;
}

export function getSortingLayerOptions(map: IDayMap) {
	return [
		...new Set([
			'Background',
			'Character',
			'Overlay',
			...map.layers.map((layer) => layer.sortingLayer),
			...map.objects.map((object) => object.sortingLayer),
		]),
	].filter(Boolean);
}

/* ── 切片 ─────────────────────────────────────────────── */

export interface ITileUsage {
	cells: number;
	objects: number;
}

const tileUsageCache = new WeakMap<IDayMap, ReadonlyMap<string, ITileUsage>>();

export function getTileUsage(map: IDayMap): ReadonlyMap<string, ITileUsage> {
	let usage = tileUsageCache.get(map);
	if (usage) return usage;
	const next = new Map<string, ITileUsage>();
	const read = (key: string) => {
		let value = next.get(key);
		if (!value) {
			value = { cells: 0, objects: 0 };
			next.set(key, value);
		}
		return value;
	};
	for (const layer of map.layers)
		for (const cell of layer.cells) read(cell.tile).cells += 1;
	for (const object of map.objects) read(object.tile).objects += 1;
	usage = next;
	tileUsageCache.set(map, usage);
	return usage;
}

export function checkTileKey(
	map: IDayMap,
	currentKey: string,
	key: string
): string | null {
	if (!key.trim()) return '切片键不能为空';
	if (key !== key.trim()) return '切片键首尾不能有空格';
	if (key !== currentKey && map.tiles.some((tile) => tile.key === key))
		return '切片键已存在';
	return null;
}

export function renameTileKey(map: IDayMap, from: string, to: string): IDayMap {
	if (from === to) return map;
	return {
		...map,
		tiles: map.tiles.map((tile) =>
			tile.key === from ? { ...tile, key: to } : tile
		),
		layers: map.layers.map((layer) =>
			layer.cells.some((cell) => cell.tile === from)
				? {
						...layer,
						cells: layer.cells.map((cell) =>
							cell.tile === from ? { ...cell, tile: to } : cell
						),
					}
				: layer
		),
		objects: map.objects.map((object) =>
			object.tile === from ? { ...object, tile: to } : object
		),
	};
}

export function patchTile(
	map: IDayMap,
	key: string,
	patch: Partial<IDayMapTile>
): IDayMap {
	return {
		...map,
		tiles: map.tiles.map((tile) =>
			tile.key === key ? { ...tile, ...patch } : tile
		),
	};
}

export function removeTiles(map: IDayMap, keys: ReadonlySet<string>): IDayMap {
	if (keys.size === 0) return map;
	return { ...map, tiles: map.tiles.filter((tile) => !keys.has(tile.key)) };
}

export interface ITileImportSettings {
	height: number;
	isWholeImage: boolean;
	pixelsPerUnit: number;
	width: number;
}

export interface ITileSlicePlan {
	columns: number;
	error: string | null;
	rows: number;
	tileHeight: number;
	tileWidth: number;
}

export function planTileSlices(
	imageWidth: number,
	imageHeight: number,
	settings: ITileImportSettings,
	existingTileCount: number
): ITileSlicePlan {
	const tileWidth = settings.isWholeImage ? imageWidth : settings.width;
	const tileHeight = settings.isWholeImage ? imageHeight : settings.height;
	const base = { columns: 0, rows: 0, tileHeight, tileWidth };
	if (
		![tileWidth, tileHeight].every(
			(value) => Number.isInteger(value) && value > 0
		) ||
		!Number.isFinite(settings.pixelsPerUnit) ||
		settings.pixelsPerUnit <= 0
	)
		return {
			...base,
			error: '切片尺寸必须为正整数，每单位像素数必须大于 0。',
		};
	if (imageWidth % tileWidth || imageHeight % tileHeight)
		return {
			...base,
			error: `图片为 ${imageWidth}×${imageHeight}，无法按 ${tileWidth}×${tileHeight} 整齐切分。请调整尺寸，或改为整图导入。`,
		};
	const columns = imageWidth / tileWidth;
	const rows = imageHeight / tileHeight;
	if (existingTileCount + columns * rows > DAY_MAP_TILE_LIMIT)
		return {
			...base,
			columns,
			rows,
			error: `切片总数不能超过 ${DAY_MAP_TILE_LIMIT}。请拆分地图，保留原切片。`,
		};
	return { ...base, columns, rows, error: null };
}

/** 从图片左上角开始逐行切分；`rect` 换算为游戏使用的左下角原点。 */
export function sliceMapImage(
	map: IDayMap,
	path: string,
	imageWidth: number,
	imageHeight: number,
	settings: ITileImportSettings
): IDayMapTile[] {
	const plan = planTileSlices(
		imageWidth,
		imageHeight,
		settings,
		map.tiles.length
	);
	if (plan.error) throw new Error(plan.error);
	const keys = new Set(map.tiles.map((tile) => tile.key));
	const tiles: IDayMapTile[] = [];
	let suffix = 1;
	for (let top = 0; top < imageHeight; top += plan.tileHeight) {
		for (let left = 0; left < imageWidth; left += plan.tileWidth) {
			while (keys.has(`tile_${suffix}`)) suffix += 1;
			const key = `tile_${suffix}`;
			keys.add(key);
			tiles.push({
				key,
				image: path,
				rect: [
					left,
					imageHeight - top - plan.tileHeight,
					plan.tileWidth,
					plan.tileHeight,
				],
				pivot: [0, 0],
				pixelsPerUnit: settings.pixelsPerUnit,
			});
		}
	}
	return tiles;
}
