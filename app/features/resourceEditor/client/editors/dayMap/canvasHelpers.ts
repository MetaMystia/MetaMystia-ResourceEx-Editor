import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

export interface IMapPoint {
	x: number;
	y: number;
}
export interface IMapView extends IMapPoint {
	scale: number;
}
export type TMapCanvasMode =
	| 'tile'
	| 'height'
	| 'collision'
	| 'spawn'
	| 'object'
	| 'pan';
export type TMapCanvasTool = 'paint' | 'erase' | 'rectangle';

export function formatSlopeAngle(slope: number): string {
	return `${((Math.atan(slope) * 180) / Math.PI).toFixed(1)}°`;
}

export function getMapBounds(map: IDayMap) {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	const include = (x: number, y: number) => {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	};
	const tiles = new Map(map.tiles.map((tile) => [tile.key, tile]));
	const includeTile = (key: string, x: number, y: number, sx = 1, sy = 1) => {
		const tile = tiles.get(key);
		const w = ((tile?.rect[2] ?? 48) / (tile?.pixelsPerUnit || 48)) * sx;
		const h = ((tile?.rect[3] ?? 48) / (tile?.pixelsPerUnit || 48)) * sy;
		const left = x - w * (tile?.pivot[0] ?? 0),
			bottom = y - h * (tile?.pivot[1] ?? 0);
		include(left, bottom);
		include(left + w, bottom + h);
	};
	map.layers.forEach((layer) =>
		layer.cells.forEach((cell) => includeTile(cell.tile, cell.x, cell.y))
	);
	map.objects.forEach((obj) =>
		includeTile(obj.tile, obj.x, obj.y, obj.scale[0], obj.scale[1])
	);
	map.collisions.forEach((box) => {
		include(box.x - box.width / 2, box.y - box.height / 2);
		include(box.x + box.width / 2, box.y + box.height / 2);
	});
	map.spawnMarkers.forEach((point) => include(point.x, point.y));
	map.height?.cells.forEach((cell) => {
		include(cell.x, cell.y);
		include(cell.x + 1, cell.y + 1);
	});
	return Number.isFinite(minX)
		? { minX, minY, maxX, maxY }
		: { minX: -8, minY: -5, maxX: 8, maxY: 5 };
}

export function getLineCells(start: IMapPoint, end: IMapPoint): IMapPoint[] {
	const result: IMapPoint[] = [];
	let x = Math.floor(start.x),
		y = Math.floor(start.y);
	const endX = Math.floor(end.x),
		endY = Math.floor(end.y);
	const dx = Math.abs(endX - x),
		dy = Math.abs(endY - y);
	const sx = x < endX ? 1 : -1,
		sy = y < endY ? 1 : -1;
	let error = dx - dy;
	for (;;) {
		result.push({ x, y });
		if (x === endX && y === endY) break;
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

export function paintMapCells(
	map: IDayMap,
	cells: ReadonlyMap<string, IMapPoint>,
	mode: TMapCanvasMode,
	layerIndex: number,
	tileKey: string,
	slope: number,
	isErase: boolean
): IDayMap {
	if (mode === 'height') {
		const existingCells = new Map(
			(map.height?.cells ?? []).map((cell) => [
				`${cell.x},${cell.y}`,
				cell,
			])
		);
		const remaining = (map.height?.cells ?? []).filter(
			(cell) => !cells.has(`${cell.x},${cell.y}`)
		);
		return {
			...map,
			height: {
				...map.height,
				cells:
					isErase || slope === 0
						? remaining
						: [
								...remaining,
								...Array.from(cells.values(), (cell) => ({
									...existingCells.get(`${cell.x},${cell.y}`),
									...cell,
									slope,
								})),
							],
			},
		};
	}
	const layer = map.layers[layerIndex];
	if (!layer) return map;
	const existingCells = new Map(
		layer.cells.map((cell) => [`${cell.x},${cell.y}`, cell])
	);
	const remaining = layer.cells.filter(
		(cell) => !cells.has(`${cell.x},${cell.y}`)
	);
	return {
		...map,
		layers: map.layers.map((value, index) =>
			index !== layerIndex
				? value
				: {
						...value,
						cells: isErase
							? remaining
							: [
									...remaining,
									...Array.from(cells.values(), (cell) => ({
										...existingCells.get(
											`${cell.x},${cell.y}`
										),
										...cell,
										tile: tileKey,
									})),
								],
					}
		),
	};
}
