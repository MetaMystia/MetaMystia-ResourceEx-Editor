export type TDayMapRotation = 'Down' | 'Up' | 'Left' | 'Right';
export interface IDayMapMesh {
	vertices: number[][];
	uvs: number[][];
	triangles: number[];
	pixelsPerUnit: number;
}
export interface IDayMapPlacement {
	transform?: number[];
	color?: number[];
	active?: boolean;
	shader?: string;
	sortingValue?: number | undefined;
}
export interface IDayMapTile {
	key: string;
	image: string;
	rect: number[];
	pivot: number[];
	pixelsPerUnit: number;
	mesh?: IDayMapMesh;
}
export interface IDayMapCell extends IDayMapPlacement {
	x: number;
	y: number;
	tile: string;
}
export interface IDayMapLayer extends IDayMapPlacement {
	isHeight?: boolean;
	name: string;
	sortingLayer: string;
	sortingOrder: number;
	cells: IDayMapCell[];
}
export interface IDayMapHeightCell {
	x: number;
	y: number;
	slope: number;
}
export interface IDayMapHeight {
	cells: IDayMapHeightCell[];
}
export interface IDayMapObject extends IDayMapPlacement {
	name: string;
	tile: string;
	x: number;
	y: number;
	scale: number[];
	sortByY: boolean;
	sortingLayer: string;
	sortingOrder: number;
}
export interface IDayMapCollision {
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface IDayMapSpawn {
	name: string;
	x: number;
	y: number;
	rotation: TDayMapRotation;
}
export interface IDayMapCamera {
	shouldFollow: boolean;
	bounds: number[];
	position: number[];
}
export interface IDayMapBgm {
	intro: string;
	loop: string;
}
export interface IDayMapNativeCollider {
	name: string;
	type: string;
	matrix: number[];
	offset: number[];
	paths: number[][][];
	size: number[] | null;
	radius: number | null;
	edgeRadius: number | null;
	geometry: string | null;
	isTrigger: boolean;
	enabled: boolean;
	active: boolean;
	usedByComposite: boolean;
	camera: boolean;
	layer: string;
}
export interface IDayMap {
	artOnly?: boolean;
	id: number;
	formatVersion: number;
	name: string;
	description: string;
	tiles: IDayMapTile[];
	layers: IDayMapLayer[];
	height?: IDayMapHeight | null;
	objects: IDayMapObject[];
	collisions: IDayMapCollision[];
	spawnMarkers: IDayMapSpawn[];
	defaultSpawnMarker: string;
	camera: IDayMapCamera;
	mapBGM: IDayMapBgm;
	nativeColliders?: IDayMapNativeCollider[];
}
