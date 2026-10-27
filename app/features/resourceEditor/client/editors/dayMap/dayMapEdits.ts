import type {
	IDayMap,
	IDayMapHeightCell,
	IDayMapLayer,
	IDayMapObject,
	IDayMapPrefab,
	IDayMapSpawn,
	TDayMapCollider,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	type IDayMapPlacement,
	placeCollider,
} from '@/domain/resourcePack/dayMapGeometry';
import { DAY_MAP_LIMITS } from '@/domain/resourcePack/dayMapValidation';

import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

import {
	type IMapPoint,
	type IMapVertexSelection,
	type TColliderTarget,
	type TMapEntityKind,
} from './dayMapEditorModel';
import {
	clampMapCoordinate,
	getObjectPlacement,
	roundMapValue,
} from './dayMapSpatial';

export function getCellKey(x: number, y: number) {
	return `${x},${y}`;
}

const roundPoint = ([x = 0, y = 0]: readonly number[]) => [
	roundMapValue(clampMapCoordinate(x)),
	roundMapValue(clampMapCoordinate(y)),
];

/** 去掉浮点误差并限制在地图坐标范围内。 */
export function roundCollider(collider: TDayMapCollider): TDayMapCollider {
	switch (collider.shape) {
		case 'polygon':
			return {
				...collider,
				paths: collider.paths.map((path) => path.map(roundPoint)),
			};
		case 'edge':
			return { ...collider, points: collider.points.map(roundPoint) };
		case 'box':
			return {
				...collider,
				height: roundMapValue(collider.height),
				width: roundMapValue(collider.width),
				x: roundMapValue(clampMapCoordinate(collider.x)),
				y: roundMapValue(clampMapCoordinate(collider.y)),
			};
		case 'circle':
			return {
				...collider,
				radius: roundMapValue(collider.radius),
				x: roundMapValue(clampMapCoordinate(collider.x)),
				y: roundMapValue(clampMapCoordinate(collider.y)),
			};
	}
}

export function translateCollider(
	collider: TDayMapCollider,
	dx: number,
	dy: number
): TDayMapCollider {
	return roundCollider(
		placeCollider(collider, { scaleX: 1, scaleY: 1, x: dx, y: dy })
	);
}

/* ── 碰撞编辑对象 ──────────────────────────────────────── */

export function getTargetObject(
	map: IDayMap,
	target: TColliderTarget
): IDayMapObject | null {
	return target.kind === 'prefab'
		? (map.objects[target.objectIndex] ?? null)
		: null;
}

export function getTargetPrefab(
	map: IDayMap,
	target: TColliderTarget
): IDayMapPrefab | null {
	const object = getTargetObject(map, target);
	return object
		? (map.prefabs.find((prefab) => prefab.key === object.prefab) ?? null)
		: null;
}

/** 物件模板碰撞以锚点物件的位置与缩放显示在画布上。 */
function getTargetPlacement(
	map: IDayMap,
	target: TColliderTarget
): IDayMapPlacement | null {
	const object = getTargetObject(map, target);
	return object ? getObjectPlacement(object) : null;
}

export function isTargetValid(map: IDayMap, target: TColliderTarget) {
	return target.kind === 'map' || getTargetPrefab(map, target) !== null;
}

/** 编辑对象中保存的碰撞（地图为世界坐标，模板为局部坐标）。 */
export function getTargetColliders(
	map: IDayMap,
	target: TColliderTarget
): readonly TDayMapCollider[] {
	return target.kind === 'map'
		? map.colliders
		: (getTargetPrefab(map, target)?.colliders ?? []);
}

/** 编辑对象的碰撞换算到世界坐标。 */
export function getTargetWorldColliders(
	map: IDayMap,
	target: TColliderTarget
): TDayMapCollider[] {
	const placement = getTargetPlacement(map, target);
	const colliders = getTargetColliders(map, target);
	return placement
		? colliders.map((collider) => placeCollider(collider, placement))
		: [...colliders];
}

/** 世界坐标的碰撞换算回编辑对象的保存坐标。 */
function toTargetCollider(
	map: IDayMap,
	target: TColliderTarget,
	collider: TDayMapCollider
): TDayMapCollider {
	const placement = getTargetPlacement(map, target);
	if (!placement) return roundCollider(collider);
	const { scaleX, scaleY, x, y } = placement;
	return roundCollider(
		placeCollider(collider, {
			scaleX: 1 / scaleX,
			scaleY: 1 / scaleY,
			x: -x / scaleX,
			y: -y / scaleY,
		})
	);
}

function replaceTargetColliders(
	map: IDayMap,
	target: TColliderTarget,
	colliders: TDayMapCollider[]
): IDayMap {
	if (target.kind === 'map') return { ...map, colliders };
	const prefab = getTargetPrefab(map, target);
	return prefab ? patchPrefab(map, prefab.key, { colliders }) : map;
}

/** 用世界坐标的新形状替换编辑对象中的一个碰撞。 */
export function replaceCollider(
	map: IDayMap,
	target: TColliderTarget,
	index: number,
	worldCollider: TDayMapCollider
): IDayMap {
	const colliders = getTargetColliders(map, target);
	if (!colliders[index]) return map;
	return replaceTargetColliders(
		map,
		target,
		colliders.map((item, i) =>
			i === index ? toTargetCollider(map, target, worldCollider) : item
		)
	);
}

/** 替换保存坐标下的一个碰撞（属性面板使用，可删除可选字段）。 */
export function setCollider(
	map: IDayMap,
	target: TColliderTarget,
	index: number,
	collider: TDayMapCollider
): IDayMap {
	const colliders = getTargetColliders(map, target);
	if (!colliders[index]) return map;
	return replaceTargetColliders(
		map,
		target,
		colliders.map((item, i) =>
			i === index ? roundCollider(collider) : item
		)
	);
}

/** 修改保存坐标下的字段。 */
export function patchCollider(
	map: IDayMap,
	target: TColliderTarget,
	index: number,
	patch: Partial<TDayMapCollider>
): IDayMap {
	const collider = getTargetColliders(map, target)[index];
	return collider
		? setCollider(map, target, index, {
				...collider,
				...patch,
			} as TDayMapCollider)
		: map;
}

export function addCollider(
	map: IDayMap,
	target: TColliderTarget,
	worldCollider: TDayMapCollider
): IEntityInsertResult | string {
	const colliders = getTargetColliders(map, target);
	if (!isTargetValid(map, target)) return '碰撞编辑对象已不存在。';
	if (colliders.length >= DAY_MAP_LIMITS.colliderCount)
		return `碰撞最多${DAY_MAP_LIMITS.colliderCount}个。`;
	return {
		indices: [colliders.length],
		map: replaceTargetColliders(map, target, [
			...colliders,
			toTargetCollider(map, target, worldCollider),
		]),
	};
}

/* ── 顶点 ─────────────────────────────────────────────── */

/** 可逐点编辑的路径：多边形的全部路径，或折线的一条路径。 */
export function getVertexPaths(collider: TDayMapCollider): number[][][] | null {
	return collider.shape === 'polygon'
		? collider.paths
		: collider.shape === 'edge'
			? [collider.points]
			: null;
}

/** 逐点路径是否首尾相连（多边形或闭合折线）。 */
export function isVertexPathClosed(collider: TDayMapCollider) {
	return (
		collider.shape === 'polygon' ||
		(collider.shape === 'edge' && collider.closed === true)
	);
}

function withVertexPaths(
	collider: TDayMapCollider,
	paths: number[][][]
): TDayMapCollider {
	if (collider.shape === 'polygon') return { ...collider, paths };
	if (collider.shape === 'edge')
		return { ...collider, points: paths[0] ?? [] };
	return collider;
}

export function setVertex(
	collider: TDayMapCollider,
	{ pathIndex, pointIndex }: IMapVertexSelection,
	point: IMapPoint
): TDayMapCollider {
	const paths = getVertexPaths(collider);
	if (!paths) return collider;
	return withVertexPaths(
		collider,
		paths.map((path, i) =>
			i === pathIndex
				? path.map((item, j) =>
						j === pointIndex ? roundPoint([point.x, point.y]) : item
					)
				: path
		)
	);
}

export function insertVertex(
	collider: TDayMapCollider,
	pathIndex: number,
	afterIndex: number,
	point: IMapPoint
): TDayMapCollider {
	const paths = getVertexPaths(collider);
	const path = paths?.[pathIndex];
	if (!paths || !path || path.length >= DAY_MAP_LIMITS.pointCount)
		return collider;
	return withVertexPaths(
		collider,
		paths.map((item, i) =>
			i === pathIndex
				? [
						...item.slice(0, afterIndex + 1),
						roundPoint([point.x, point.y]),
						...item.slice(afterIndex + 1),
					]
				: item
		)
	);
}

/** 删除顶点；路径少于最少顶点数时整条删除（多边形仍保留其他路径），全部删光返回 null。 */
export function removeVertex(
	collider: TDayMapCollider,
	{ pathIndex, pointIndex }: IMapVertexSelection
): TDayMapCollider | null {
	const paths = getVertexPaths(collider);
	if (!paths) return collider;
	const minimum = collider.shape === 'polygon' ? 3 : 2;
	const next = paths
		.map((path, i) =>
			i === pathIndex ? path.filter((_, j) => j !== pointIndex) : path
		)
		.filter((path) => path.length >= minimum);
	return next.length > 0 ? withVertexPaths(collider, next) : null;
}

/* ── 实体 ─────────────────────────────────────────────── */

export interface IEntityInsertResult {
	indices: number[];
	map: IDayMap;
}

export function getEntityCount(
	map: IDayMap,
	kind: TMapEntityKind,
	target: TColliderTarget
) {
	return kind === 'object'
		? map.objects.length
		: kind === 'collider'
			? getTargetColliders(map, target).length
			: map.spawnMarkers.length;
}

function isSortedByY(map: IDayMap, object: IDayMapObject) {
	return (
		map.prefabs.find((prefab) => prefab.key === object.prefab)?.sortByY ??
		true
	);
}

function clampObjectY(map: IDayMap, object: IDayMapObject, y: number) {
	return isSortedByY(map, object)
		? Math.max(
				-DAY_MAP_LIMITS.sortedObjectY,
				Math.min(DAY_MAP_LIMITS.sortedObjectY, y)
			)
		: clampMapCoordinate(y);
}

function offsetPoint<T extends { x: number; y: number }>(
	item: T,
	dx: number,
	dy: number
): T {
	return {
		...item,
		x: roundMapValue(clampMapCoordinate(item.x + dx)),
		y: roundMapValue(clampMapCoordinate(item.y + dy)),
	};
}

/** 以原始位置为基准整体平移（世界坐标），拖动过程中反复调用不会累积误差。 */
export function moveEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>,
	dx: number,
	dy: number,
	target: TColliderTarget
): IDayMap {
	if (indices.size === 0 || (dx === 0 && dy === 0)) return map;
	if (kind === 'object')
		return {
			...map,
			objects: map.objects.map((item, i) =>
				indices.has(i)
					? {
							...offsetPoint(item, dx, 0),
							y: roundMapValue(
								clampObjectY(map, item, item.y + dy)
							),
						}
					: item
			),
		};
	if (kind === 'collider') {
		const placement = getTargetPlacement(map, target);
		const ldx = placement ? dx / placement.scaleX : dx;
		const ldy = placement ? dy / placement.scaleY : dy;
		return replaceTargetColliders(
			map,
			target,
			getTargetColliders(map, target).map((item, i) =>
				indices.has(i) ? translateCollider(item, ldx, ldy) : item
			)
		);
	}
	return {
		...map,
		spawnMarkers: map.spawnMarkers.map((item, i) =>
			indices.has(i) ? offsetPoint(item, dx, dy) : item
		),
	};
}

export function deleteEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>,
	target: TColliderTarget
): IDayMap {
	if (indices.size === 0) return map;
	if (kind === 'object')
		return {
			...map,
			objects: map.objects.filter((_, i) => !indices.has(i)),
		};
	if (kind === 'collider')
		return replaceTargetColliders(
			map,
			target,
			getTargetColliders(map, target).filter((_, i) => !indices.has(i))
		);
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

export function duplicateEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	indices: ReadonlySet<number>,
	dx: number,
	dy: number,
	target: TColliderTarget
): IEntityInsertResult | string {
	const sorted = [...indices].sort((a, b) => a - b);
	const count = getEntityCount(map, kind, target);
	const limit =
		kind === 'object'
			? DAY_MAP_LIMITS.objectCount
			: kind === 'collider'
				? DAY_MAP_LIMITS.colliderCount
				: DAY_MAP_LIMITS.spawnCount;
	if (count + sorted.length > limit) return `复制后会超过上限（${limit}）。`;
	const nextIndices = sorted.map((_, i) => count + i);
	if (kind === 'object') {
		const copies = sorted.flatMap((index) => {
			const item = map.objects[index];
			return item
				? [
						{
							...offsetPoint(item, dx, 0),
							y: roundMapValue(
								clampObjectY(map, item, item.y + dy)
							),
						},
					]
				: [];
		});
		return {
			indices: nextIndices,
			map: { ...map, objects: [...map.objects, ...copies] },
		};
	}
	if (kind === 'collider') {
		const world = getTargetWorldColliders(map, target);
		const copies = sorted.flatMap((index) => {
			const item = world[index];
			return item
				? [
						toTargetCollider(
							map,
							target,
							translateCollider(item, dx, dy)
						),
					]
				: [];
		});
		return {
			indices: nextIndices,
			map: replaceTargetColliders(map, target, [
				...getTargetColliders(map, target),
				...copies,
			]),
		};
	}
	const names = new Set(map.spawnMarkers.map((marker) => marker.name));
	const copies = sorted.flatMap((index) => {
		const item = map.spawnMarkers[index];
		if (!item) return [];
		const name = findNextAvailableSuffixedValue(names, `${item.name}_`);
		names.add(name);
		return [{ ...offsetPoint(item, dx, dy), name }];
	});
	return {
		indices: nextIndices,
		map: { ...map, spawnMarkers: [...map.spawnMarkers, ...copies] },
	};
}

export function addObject(
	map: IDayMap,
	prefabKey: string,
	x: number,
	y: number
): IEntityInsertResult | string {
	const prefab = map.prefabs.find((item) => item.key === prefabKey);
	if (!prefab) return '请先在物件模板库中选择模板。';
	if (map.objects.length >= DAY_MAP_LIMITS.objectCount)
		return `一张地图最多${DAY_MAP_LIMITS.objectCount}个物件。`;
	if (prefab.sortByY && Math.abs(y) > DAY_MAP_LIMITS.sortedObjectY)
		return `按 Y 排序的物件，Y 坐标需在 ±${DAY_MAP_LIMITS.sortedObjectY} 之间。`;
	const object: IDayMapObject = {
		prefab: prefabKey,
		x: roundMapValue(clampMapCoordinate(x)),
		y: roundMapValue(clampMapCoordinate(y)),
		scale: [1, 1],
	};
	return {
		indices: [map.objects.length],
		map: { ...map, objects: [...map.objects, object] },
	};
}

export function patchObject(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapObject>
): IDayMap {
	if (!map.objects[index]) return map;
	return {
		...map,
		objects: map.objects.map((item, i) =>
			i === index ? { ...item, ...patch } : item
		),
	};
}

export function addSpawn(
	map: IDayMap,
	x: number,
	y: number
): IEntityInsertResult | string {
	if (map.spawnMarkers.length >= DAY_MAP_LIMITS.spawnCount)
		return `一张地图最多${DAY_MAP_LIMITS.spawnCount}个出生点。`;
	const name = findNextAvailableSuffixedValue(
		map.spawnMarkers.map((marker) => marker.name),
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

export function addLayer(map: IDayMap, layer: IDayMapLayer): IDayMap {
	return { ...map, layers: [...map.layers, layer] };
}

export function patchLayer(
	map: IDayMap,
	index: number,
	patch: Partial<IDayMapLayer>
): IDayMap {
	if (!map.layers[index]) return map;
	return {
		...map,
		layers: map.layers.map((layer, i) =>
			i === index ? { ...layer, ...patch } : layer
		),
	};
}

export function removeLayer(map: IDayMap, index: number): IDayMap {
	return { ...map, layers: map.layers.filter((_, i) => i !== index) };
}

/** 调整列表顺序；排序层与排序值相同时，列表靠后的图层在上。 */
export function moveLayer(map: IDayMap, from: number, to: number): IDayMap {
	const layer = map.layers[from];
	if (!layer || to < 0 || to >= map.layers.length || from === to) return map;
	const layers = map.layers.filter((_, i) => i !== from);
	layers.splice(to, 0, layer);
	return { ...map, layers };
}

/* ── 物件模板 ──────────────────────────────────────────── */

export function getPrefabUsage(map: IDayMap): ReadonlyMap<string, number> {
	const usage = new Map<string, number>();
	for (const object of map.objects)
		usage.set(object.prefab, (usage.get(object.prefab) ?? 0) + 1);
	return usage;
}

/** 由文件名生成不重复的模板键。 */
export function createPrefabKey(map: IDayMap, name: string) {
	const base =
		name
			.replace(/\.[^.]+$/, '')
			.replace(/[^0-9A-Za-z_\-一-鿿]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'prefab';
	const keys = new Set(map.prefabs.map((prefab) => prefab.key));
	return keys.has(base)
		? findNextAvailableSuffixedValue(keys, `${base}_`)
		: base;
}

export function checkPrefabKey(
	map: IDayMap,
	current: string,
	key: string
): string | null {
	if (!key.trim()) return '键不能为空';
	if (key !== key.trim()) return '键首尾不能有空格';
	if (key !== current && map.prefabs.some((prefab) => prefab.key === key))
		return '键已被其他模板使用';
	return null;
}

export function addPrefab(map: IDayMap, prefab: IDayMapPrefab): IDayMap {
	return { ...map, prefabs: [...map.prefabs, prefab] };
}

export function patchPrefab(
	map: IDayMap,
	key: string,
	patch: Partial<IDayMapPrefab>
): IDayMap {
	if (!map.prefabs.some((prefab) => prefab.key === key)) return map;
	return {
		...map,
		prefabs: map.prefabs.map((prefab) =>
			prefab.key === key ? { ...prefab, ...patch } : prefab
		),
	};
}

/** 重命名模板键，并同步更新引用它的物件。 */
export function renamePrefab(map: IDayMap, from: string, to: string): IDayMap {
	if (from === to) return map;
	return {
		...patchPrefab(map, from, { key: to }),
		objects: map.objects.map((object) =>
			object.prefab === from ? { ...object, prefab: to } : object
		),
	};
}

/** 删除模板及使用它的物件。 */
export function removePrefabs(
	map: IDayMap,
	keys: ReadonlySet<string>
): IDayMap {
	if (keys.size === 0) return map;
	return {
		...map,
		objects: map.objects.filter((object) => !keys.has(object.prefab)),
		prefabs: map.prefabs.filter((prefab) => !keys.has(prefab.key)),
	};
}

/* ── 坡度 ─────────────────────────────────────────────── */

export function createHeightIndex(map: IDayMap) {
	const index = new Map<string, number>();
	for (const cell of map.height?.cells ?? []) {
		const key = getCellKey(cell.x, cell.y);
		if (!index.has(key)) index.set(key, cell.slope);
	}
	return index;
}

/** 按格写入坡度；null 或 0 表示清除。 */
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
