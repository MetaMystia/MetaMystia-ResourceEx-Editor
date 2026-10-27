/** 画布地图（formatVersion 3）。美术坐标为整数像素，世界坐标 = 像素 / pixelsPerUnit，Y 轴向上。 */
export type TDayMapRotation = 'Down' | 'Up' | 'Left' | 'Right';

/** 切块存放的大图：按 1024 像素切块，块 [列,行] 自图片左上角起算，文件为 `<dir>/<列>_<行>.png`，只列出非空块。 */
export interface IDayMapImage {
	width: number;
	height: number;
	dir: string;
	chunks: number[][];
}

/** 一张大图，对应原版的一层 Tilemap。 */
export interface IDayMapLayer {
	name: string;
	sortingLayer: string;
	sortingOrder: number;
	color?: number[];
	/** 图片左下角的像素坐标。 */
	x: number;
	y: number;
	image: IDayMapImage;
}

interface IDayMapColliderBase {
	name?: string;
}

/** 实心多边形；多条路径时内层路径为洞。 */
export interface IDayMapPolygonCollider extends IDayMapColliderBase {
	shape: 'polygon';
	paths: number[][][];
}

/** 折线，只有线段阻挡；closed 时首尾相连。 */
export interface IDayMapEdgeCollider extends IDayMapColliderBase {
	shape: 'edge';
	points: number[][];
	closed?: boolean;
}

/** 中心、尺寸与角度（度）。 */
export interface IDayMapBoxCollider extends IDayMapColliderBase {
	shape: 'box';
	x: number;
	y: number;
	width: number;
	height: number;
	rotation?: number;
}

export interface IDayMapCircleCollider extends IDayMapColliderBase {
	shape: 'circle';
	x: number;
	y: number;
	radius: number;
}

export type TDayMapCollider =
	| IDayMapBoxCollider
	| IDayMapCircleCollider
	| IDayMapEdgeCollider
	| IDayMapPolygonCollider;

export type TDayMapColliderShape = TDayMapCollider['shape'];

/** 物件模板，对应原版带 SpriteRenderer 或 SortingGroup 的预制体；碰撞使用模板局部坐标。 */
export interface IDayMapPrefab {
	key: string;
	image: IDayMapImage;
	/** 左下原点的归一化锚点。 */
	pivot: number[];
	pixelsPerUnit: number;
	sortingLayer: string;
	sortingOrder: number;
	sortByY: boolean;
	colliders: TDayMapCollider[];
}

export interface IDayMapObject {
	name?: string;
	prefab: string;
	x: number;
	y: number;
	/** 负值表示翻转。 */
	scale: number[];
}

export interface IDayMapHeightCell {
	x: number;
	y: number;
	slope: number;
}

export interface IDayMapHeight {
	cells: IDayMapHeightCell[];
}

export interface IDayMapSpawn {
	name: string;
	x: number;
	y: number;
	rotation: TDayMapRotation;
}

export interface IDayMapCamera {
	shouldFollow: boolean;
	/** 相机中心可移动范围的多边形顶点。 */
	bounds: number[][];
	position: number[];
}

/** 包内音频 intro/loop，或原版 LoopedBGMPackage 地址 native，二选一。 */
export interface IDayMapBgm {
	intro?: string;
	loop?: string;
	native?: string;
}

export interface IDayMap {
	id: number;
	formatVersion: number;
	name: string;
	description: string;
	pixelsPerUnit: number;
	hideClock?: boolean;
	layers: IDayMapLayer[];
	prefabs: IDayMapPrefab[];
	objects: IDayMapObject[];
	colliders: TDayMapCollider[];
	height?: IDayMapHeight | null;
	spawnMarkers: IDayMapSpawn[];
	defaultSpawnMarker: string;
	camera: IDayMapCamera;
	mapBGM: IDayMapBgm;
}
