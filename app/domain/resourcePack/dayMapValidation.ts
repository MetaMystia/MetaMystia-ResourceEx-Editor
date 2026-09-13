import type { IDayMap } from './contracts/dayMap';

const isCoordinate = (value: number) =>
	Number.isFinite(value) && Math.abs(value) <= 4096;
const isPositive = (value: number) => Number.isFinite(value) && value > 0;
const isVector = (values: number[], size: number) =>
	values.length === size && values.every(Number.isFinite);
const isOrder = (value: number) =>
	Number.isInteger(value) && value >= -32768 && value <= 32767;

/** 静态配置检查；图片边界、音频解码和实际排序层由资产检查及游戏核验。 */
export function validateDayMap(map: IDayMap): string[] {
	const errors: string[] = [];
	if (map.formatVersion !== 1)
		errors.push(
			`不支持地图格式版本 ${map.formatVersion}，请保留原数据并使用支持该版本的编辑器。`
		);
	if (!map.name.trim()) errors.push('地图名称不能为空。');
	if (
		map.tiles.length > 4096 ||
		map.layers.length > 32 ||
		map.objects.length > 4096 ||
		map.collisions.length > 4096 ||
		map.spawnMarkers.length > 256
	)
		errors.push(
			'超过地图容量限制（4096 切片、32 层、4096 装饰、4096 碰撞、256 出生点）。'
		);
	const keys = new Set<string>();
	for (const tile of map.tiles) {
		if (!tile.key.trim() || keys.has(tile.key))
			errors.push(`瓦片键为空或重复：${tile.key}`);
		keys.add(tile.key);
		if (!tile.image.trim()) errors.push(`瓦片 ${tile.key} 缺少图片。`);
		const [x = -1, y = -1, w = 0, h = 0] = tile.rect;
		if (
			!isVector(tile.rect, 4) ||
			!tile.rect.every(Number.isInteger) ||
			x < 0 ||
			y < 0 ||
			w <= 0 ||
			h <= 0
		)
			errors.push(
				`瓦片 ${tile.key} 的切片应为 [左,下,宽,高] 像素整数，宽高大于零。`
			);
		if (
			!isVector(tile.pivot, 2) ||
			tile.pivot.some((value) => value < 0 || value > 1) ||
			!isPositive(tile.pixelsPerUnit)
		)
			errors.push(`瓦片 ${tile.key} 的锚点或每单位像素无效。`);
	}
	let cellCount = 0;
	for (const layer of map.layers) {
		if (!layer.sortingLayer.trim() || !isOrder(layer.sortingOrder))
			errors.push(`图层 ${layer.name} 的排序设置无效。`);
		cellCount += layer.cells.length;
		const positions = new Set<string>();
		for (const cell of layer.cells) {
			const key = `${cell.x},${cell.y}`;
			if (
				!isCoordinate(cell.x) ||
				!isCoordinate(cell.y) ||
				!Number.isInteger(cell.x) ||
				!Number.isInteger(cell.y) ||
				positions.has(key) ||
				!keys.has(cell.tile)
			)
				errors.push(
					`图层 ${layer.name} 的格子 (${key}) 坐标重复、越界或引用了无效瓦片。`
				);
			positions.add(key);
		}
	}
	if (cellCount > 100000) errors.push('显示图层总格子数超过 100000。');
	for (const object of map.objects) {
		if (
			!keys.has(object.tile) ||
			!isCoordinate(object.x) ||
			!isCoordinate(object.y) ||
			!isVector(object.scale, 2) ||
			!object.scale.every(isPositive) ||
			!object.sortingLayer.trim() ||
			!isOrder(object.sortingOrder) ||
			(object.sortByY && Math.abs(object.y) > 1023)
		)
			errors.push(
				`装饰 ${object.name} 的瓦片、坐标、缩放或排序设置无效。`
			);
	}
	const heights = map.height?.cells ?? [];
	if (heights.length > 100000) errors.push('坡度格子数超过 100000。');
	const positions = new Set<string>();
	for (const cell of heights) {
		const key = `${cell.x},${cell.y}`;
		if (
			!isCoordinate(cell.x) ||
			!isCoordinate(cell.y) ||
			!Number.isInteger(cell.x) ||
			!Number.isInteger(cell.y) ||
			positions.has(key) ||
			!Number.isFinite(cell.slope) ||
			Math.abs(cell.slope) > 1
		)
			errors.push(
				`坡度格子 (${key}) 坐标或坡度无效；坡度范围为 [-1,1]。`
			);
		positions.add(key);
	}
	for (const box of map.collisions)
		if (
			!isCoordinate(box.x) ||
			!isCoordinate(box.y) ||
			!isPositive(box.width) ||
			!isPositive(box.height)
		)
			errors.push(`碰撞箱 ${box.name} 的中心坐标或尺寸无效。`);
	const names = new Set<string>();
	for (const marker of map.spawnMarkers) {
		if (
			!marker.name.trim() ||
			names.has(marker.name) ||
			!isCoordinate(marker.x) ||
			!isCoordinate(marker.y) ||
			!['Down', 'Up', 'Left', 'Right'].includes(marker.rotation)
		)
			errors.push(`出生点 ${marker.name} 的名称、坐标或朝向无效。`);
		names.add(marker.name);
		if (
			map.collisions.some(
				(box) =>
					Math.abs(marker.x - box.x) <= box.width / 2 &&
					Math.abs(marker.y - box.y) <= box.height / 2
			)
		)
			errors.push(`出生点 ${marker.name} 的中心位于碰撞箱内或边界上。`);
	}
	if (!names.has(map.defaultSpawnMarker)) errors.push('默认出生点不存在。');
	const [minX = 0, minY = 0, maxX = 0, maxY = 0] = map.camera.bounds;
	if (!isVector(map.camera.position, 3))
		errors.push('固定相机位置需要三个有限数值。');
	if (
		map.camera.shouldFollow &&
		(!isVector(map.camera.bounds, 4) || minX >= maxX || minY >= maxY)
	)
		errors.push(
			'跟随相机中心边界需要 [最小X,最小Y,最大X,最大Y]，下界须小于上界。'
		);
	for (const path of [map.mapBGM.intro, map.mapBGM.loop])
		if (!path.trim() || !path.toLowerCase().endsWith('.wav'))
			errors.push('背景音乐的前奏与循环都必须指定 WAV 文件。');
	return [...new Set(errors)];
}
