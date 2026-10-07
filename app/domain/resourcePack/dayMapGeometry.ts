import type { IDayMapPlacement, IDayMapTile } from './contracts/dayMap';

export const DAY_MAP_TILE_LIMIT = 100000;

/** 顶点保留原始局部坐标，PPU 编辑只影响显示比例。 */
export function getDayMapVertices(tile: IDayMapTile): number[][] {
	if (tile.mesh) {
		const ratio = tile.mesh.pixelsPerUnit / tile.pixelsPerUnit;
		return tile.mesh.vertices.map(([x = 0, y = 0]) => [
			x * ratio,
			y * ratio,
		]);
	}
	const width = (tile.rect[2] ?? 0) / tile.pixelsPerUnit;
	const height = (tile.rect[3] ?? 0) / tile.pixelsPerUnit;
	const x = -width * (tile.pivot[0] ?? 0);
	const y = -height * (tile.pivot[1] ?? 0);
	return [
		[x, y],
		[x + width, y],
		[x + width, y + height],
		[x, y + height],
	];
}

export function transformDayMapPoint(
	x: number,
	y: number,
	placement?: IDayMapPlacement
): number[] {
	const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] =
		placement?.transform ?? [];
	return [a * x + c * y + tx, b * x + d * y + ty];
}
