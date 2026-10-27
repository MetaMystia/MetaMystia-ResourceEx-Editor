import type { TDayMapCollider } from './contracts/dayMap';

export interface IDayMapOutline {
	isClosed: boolean;
	isSolid: boolean;
	points: number[][];
}

export interface IDayMapPlacement {
	scaleX: number;
	scaleY: number;
	x: number;
	y: number;
}

const CIRCLE_SEGMENTS = 32;

function rotatePoint(x: number, y: number, degrees: number) {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return [x * cos - y * sin, x * sin + y * cos] as const;
}

export function getBoxCorners(
	box: Extract<TDayMapCollider, { shape: 'box' }>
): number[][] {
	const halfWidth = box.width / 2;
	const halfHeight = box.height / 2;
	return [
		[-halfWidth, -halfHeight],
		[halfWidth, -halfHeight],
		[halfWidth, halfHeight],
		[-halfWidth, halfHeight],
	].map(([dx = 0, dy = 0]) => {
		const [rx, ry] = rotatePoint(dx, dy, box.rotation ?? 0);
		return [box.x + rx, box.y + ry];
	});
}

/** 碰撞的轮廓线；圆按 32 段近似，折线只有线段阻挡。 */
export function getColliderOutlines(
	collider: TDayMapCollider
): IDayMapOutline[] {
	switch (collider.shape) {
		case 'polygon':
			return collider.paths.map((points) => ({
				isClosed: true,
				isSolid: true,
				points,
			}));
		case 'edge':
			return [
				{
					isClosed: collider.closed === true,
					isSolid: false,
					points: collider.points,
				},
			];
		case 'box':
			return [
				{
					isClosed: true,
					isSolid: true,
					points: getBoxCorners(collider),
				},
			];
		case 'circle':
			return [
				{
					isClosed: true,
					isSolid: true,
					points: Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
						const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
						return [
							collider.x + Math.cos(angle) * collider.radius,
							collider.y + Math.sin(angle) * collider.radius,
						];
					}),
				},
			];
	}
}

/** 偶奇规则，与 PolygonCollider2D 的洞一致。 */
export function isPointInPath(path: readonly number[][], x: number, y: number) {
	let isInside = false;
	for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
		const [xi = 0, yi = 0] = path[i] ?? [];
		const [xj = 0, yj = 0] = path[j] ?? [];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
			isInside = !isInside;
	}
	return isInside;
}

/** 点是否落在实心碰撞内；折线没有内部。 */
export function isPointInCollider(
	collider: TDayMapCollider,
	x: number,
	y: number
) {
	switch (collider.shape) {
		case 'polygon':
			return (
				collider.paths.filter((path) => isPointInPath(path, x, y))
					.length %
					2 ===
				1
			);
		case 'box': {
			const [dx, dy] = rotatePoint(
				x - collider.x,
				y - collider.y,
				-(collider.rotation ?? 0)
			);
			return (
				Math.abs(dx) <= collider.width / 2 &&
				Math.abs(dy) <= collider.height / 2
			);
		}
		case 'circle':
			return (
				(x - collider.x) ** 2 + (y - collider.y) ** 2 <=
				collider.radius ** 2
			);
		case 'edge':
			return false;
	}
}

/** 模板局部坐标 → 世界坐标：先缩放（负值翻转）再平移，与 Mod 中物件的 localScale 一致。 */
export function placeCollider(
	collider: TDayMapCollider,
	{ scaleX, scaleY, x, y }: IDayMapPlacement
): TDayMapCollider {
	const point = ([px = 0, py = 0]: readonly number[]) => [
		x + px * scaleX,
		y + py * scaleY,
	];
	switch (collider.shape) {
		case 'polygon':
			return {
				...collider,
				paths: collider.paths.map((path) => path.map(point)),
			};
		case 'edge':
			return { ...collider, points: collider.points.map(point) };
		case 'box': {
			const [cx = 0, cy = 0] = point([collider.x, collider.y]);
			const rotation = collider.rotation ?? 0;
			return {
				...collider,
				height: collider.height * Math.abs(scaleY),
				width: collider.width * Math.abs(scaleX),
				x: cx,
				y: cy,
				...(rotation === 0
					? {}
					: { rotation: scaleX * scaleY < 0 ? -rotation : rotation }),
			};
		}
		case 'circle': {
			const [cx = 0, cy = 0] = point([collider.x, collider.y]);
			return {
				...collider,
				radius:
					collider.radius *
					Math.max(Math.abs(scaleX), Math.abs(scaleY)),
				x: cx,
				y: cy,
			};
		}
	}
}
