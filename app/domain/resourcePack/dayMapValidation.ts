import type {
	IDayMap,
	IDayMapImage,
	TDayMapCollider,
} from './contracts/dayMap';

import { DAY_MAP_CHUNK_SIZE_PX } from './dayMapAssets';
import { isPointInCollider, placeCollider } from './dayMapGeometry';

export const DAY_MAP_FORMAT_VERSION = 3;
/** 与 Mod 的 DayMapRegistry 一致的单图上限。 */
export const DAY_MAP_LIMITS = {
	colliderCount: 4096,
	coordinate: 4096,
	heightCellCount: 100000,
	imageSizePx: 16384,
	layerCount: 32,
	objectCount: 8192,
	pathCount: 64,
	pointCount: 4096,
	prefabCount: 4096,
	sortedObjectY: 1023,
	spawnCount: 256,
} as const;

/** 原游戏的排序层，自下而上。 */
export const DAY_MAP_SORTING_LAYERS = [
	'Default',
	'Background',
	'BelowCharacter',
	'Character',
	'Overlay',
	'OnTop',
	'EffectOverlay',
	'UI',
] as const;

const isCoordinate = (value: number) =>
	Number.isFinite(value) && Math.abs(value) <= DAY_MAP_LIMITS.coordinate;
const isVector = (values: readonly number[] | undefined, size: number) =>
	values !== undefined &&
	values.length === size &&
	values.every(Number.isFinite);
const isPoint = (point: readonly number[]) =>
	isVector(point, 2) && point.every(isCoordinate);
const isPoints = (points: readonly number[][], min: number) =>
	points.length >= min &&
	points.length <= DAY_MAP_LIMITS.pointCount &&
	points.every(isPoint);
const isOrder = (value: number) =>
	Number.isInteger(value) && value >= -32768 && value <= 32767;
const isSortingLayer = (value: string) =>
	(DAY_MAP_SORTING_LAYERS as readonly string[]).includes(value);

function checkImage(image: IDayMapImage): string | null {
	const { chunks, dir, height, width } = image;
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width > DAY_MAP_LIMITS.imageSizePx ||
		height > DAY_MAP_LIMITS.imageSizePx
	)
		return `图片尺寸应为 1 到 ${DAY_MAP_LIMITS.imageSizePx} 像素的整数`;
	if (!dir.trim()) return '缺少图块目录';
	const columns = Math.ceil(width / DAY_MAP_CHUNK_SIZE_PX);
	const rows = Math.ceil(height / DAY_MAP_CHUNK_SIZE_PX);
	const seen = new Set<string>();
	for (const chunk of chunks) {
		const [column = -1, row = -1] = chunk;
		const key = `${column},${row}`;
		if (
			chunk.length !== 2 ||
			!Number.isInteger(column) ||
			!Number.isInteger(row) ||
			column < 0 ||
			row < 0 ||
			column >= columns ||
			row >= rows ||
			seen.has(key)
		)
			return `图块编号无效：${key}`;
		seen.add(key);
	}
	return null;
}

export function checkCollider(collider: TDayMapCollider): string | null {
	switch (collider.shape) {
		case 'polygon':
			return collider.paths.length > 0 &&
				collider.paths.length <= DAY_MAP_LIMITS.pathCount &&
				collider.paths.every((path) => isPoints(path, 3))
				? null
				: '多边形每条路径至少 3 个有效顶点';
		case 'edge':
			return isPoints(collider.points, 2)
				? null
				: '折线至少 2 个有效顶点';
		case 'box':
			return isCoordinate(collider.x) &&
				isCoordinate(collider.y) &&
				Number.isFinite(collider.rotation ?? 0) &&
				collider.width > 0 &&
				collider.height > 0 &&
				Number.isFinite(collider.width) &&
				Number.isFinite(collider.height)
				? null
				: '矩形的位置、尺寸或角度无效';
		case 'circle':
			return isCoordinate(collider.x) &&
				isCoordinate(collider.y) &&
				collider.radius > 0 &&
				Number.isFinite(collider.radius)
				? null
				: '圆的位置或半径无效';
	}
}

/** 静态配置检查，与 Mod 的加载校验一致；图块尺寸、音频解码和原版音乐地址由资产检查及游戏核验。 */
export function validateDayMap(map: IDayMap): string[] {
	const errors: string[] = [];
	if (map.formatVersion !== DAY_MAP_FORMAT_VERSION)
		return [
			`不支持地图格式版本${map.formatVersion}，当前只支持画布地图（版本${DAY_MAP_FORMAT_VERSION}）。`,
		];
	if (!map.name.trim()) errors.push('地图名称不能为空。');
	if (!Number.isInteger(map.pixelsPerUnit) || map.pixelsPerUnit <= 0)
		errors.push('每单位像素必须是正整数。');
	if (
		map.layers.length > DAY_MAP_LIMITS.layerCount ||
		map.prefabs.length > DAY_MAP_LIMITS.prefabCount ||
		map.objects.length > DAY_MAP_LIMITS.objectCount ||
		map.colliders.length > DAY_MAP_LIMITS.colliderCount ||
		map.spawnMarkers.length > DAY_MAP_LIMITS.spawnCount
	)
		errors.push(
			`超过地图容量限制（${DAY_MAP_LIMITS.layerCount}图层、${DAY_MAP_LIMITS.prefabCount}物件模板、${DAY_MAP_LIMITS.objectCount}物件、${DAY_MAP_LIMITS.colliderCount}碰撞、${DAY_MAP_LIMITS.spawnCount}出生点）。`
		);
	for (const layer of map.layers) {
		if (!isSortingLayer(layer.sortingLayer) || !isOrder(layer.sortingOrder))
			errors.push(`图层${layer.name}的排序设置无效。`);
		if (layer.color && !isVector(layer.color, 4))
			errors.push(`图层${layer.name}的颜色无效。`);
		if (
			!Number.isInteger(layer.x) ||
			!Number.isInteger(layer.y) ||
			!isCoordinate(layer.x / map.pixelsPerUnit) ||
			!isCoordinate(layer.y / map.pixelsPerUnit)
		)
			errors.push(`图层${layer.name}的位置应为范围内的整数像素。`);
		const imageError = checkImage(layer.image);
		if (imageError) errors.push(`图层${layer.name}：${imageError}。`);
	}
	const prefabs = new Map<string, IDayMap['prefabs'][number]>();
	for (const prefab of map.prefabs) {
		if (!prefab.key.trim() || prefabs.has(prefab.key))
			errors.push(`物件模板键为空或重复：${prefab.key}`);
		prefabs.set(prefab.key, prefab);
		const imageError = checkImage(prefab.image);
		if (imageError) errors.push(`物件模板${prefab.key}：${imageError}。`);
		if (
			!isVector(prefab.pivot, 2) ||
			!(prefab.pixelsPerUnit > 0) ||
			!Number.isFinite(prefab.pixelsPerUnit) ||
			!isSortingLayer(prefab.sortingLayer) ||
			!isOrder(prefab.sortingOrder)
		)
			errors.push(`物件模板${prefab.key}的锚点、像素密度或排序无效。`);
		prefab.colliders.forEach((collider, index) => {
			const error = checkCollider(collider);
			if (error)
				errors.push(
					`物件模板${prefab.key}的碰撞${collider.name ?? index + 1}：${error}。`
				);
		});
	}
	for (const object of map.objects) {
		const prefab = prefabs.get(object.prefab);
		const name = object.name ?? object.prefab;
		if (!prefab) {
			errors.push(`物件${name}引用了不存在的模板${object.prefab}。`);
			continue;
		}
		if (
			!isCoordinate(object.x) ||
			!isCoordinate(object.y) ||
			!isVector(object.scale, 2) ||
			object.scale.includes(0)
		)
			errors.push(`物件${name}的位置或缩放无效。`);
		if (prefab.sortByY && Math.abs(object.y) > DAY_MAP_LIMITS.sortedObjectY)
			errors.push(
				`按 Y 排序的物件${name}的 Y 坐标超出 ±${DAY_MAP_LIMITS.sortedObjectY}。`
			);
	}
	map.colliders.forEach((collider, index) => {
		const error = checkCollider(collider);
		if (error) errors.push(`碰撞${collider.name ?? index + 1}：${error}。`);
	});
	const heightCells = map.height?.cells ?? [];
	const heightPositions = new Set<string>();
	if (heightCells.length > DAY_MAP_LIMITS.heightCellCount)
		errors.push(`坡度格超过 ${DAY_MAP_LIMITS.heightCellCount}。`);
	for (const cell of heightCells) {
		const key = `${cell.x},${cell.y}`;
		if (
			!Number.isInteger(cell.x) ||
			!Number.isInteger(cell.y) ||
			!isCoordinate(cell.x) ||
			!isCoordinate(cell.y) ||
			!Number.isFinite(cell.slope) ||
			Math.abs(cell.slope) > 1 ||
			heightPositions.has(key)
		) {
			errors.push(`坡度格${key}无效或重复。`);
			break;
		}
		heightPositions.add(key);
	}
	const names = new Set<string>();
	for (const marker of map.spawnMarkers) {
		if (!marker.name.trim() || names.has(marker.name))
			errors.push(`出生点名称为空或重复：${marker.name}`);
		names.add(marker.name);
		if (!isCoordinate(marker.x) || !isCoordinate(marker.y))
			errors.push(`出生点${marker.name}坐标无效。`);
		const isBlocked =
			map.colliders.some((collider) =>
				isPointInCollider(collider, marker.x, marker.y)
			) ||
			map.objects.some((object) =>
				(prefabs.get(object.prefab)?.colliders ?? []).some((collider) =>
					isPointInCollider(
						placeCollider(collider, {
							scaleX: object.scale[0] ?? 1,
							scaleY: object.scale[1] ?? 1,
							x: object.x,
							y: object.y,
						}),
						marker.x,
						marker.y
					)
				)
			);
		if (isBlocked) errors.push(`出生点${marker.name}位于碰撞内。`);
	}
	if (!names.has(map.defaultSpawnMarker)) errors.push('默认出生点不存在。');
	if (!isVector(map.camera.position, 3)) errors.push('固定相机位置无效。');
	if (map.camera.shouldFollow && !isPoints(map.camera.bounds, 3))
		errors.push('相机中心范围至少需要 3 个有效顶点。');
	const { intro, loop, native } = map.mapBGM;
	if (native !== undefined) {
		if (!native.trim()) errors.push('原版音乐地址不能为空。');
		if (intro !== undefined || loop !== undefined)
			errors.push('原版音乐与包内音乐只能选一种。');
	} else if (!intro || !loop) errors.push('缺少背景音乐前奏或循环音频。');
	return errors;
}
