export type TDayMapRotation = 'Down' | 'Up' | 'Left' | 'Right';
export interface IDayMapTile {
	key: string;
	image: string;
	rect: number[];
	pivot: number[];
	pixelsPerUnit: number;
}
export interface IDayMapCell {
	x: number;
	y: number;
	tile: string;
}
export interface IDayMapLayer {
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
export interface IDayMapObject {
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
export interface IDayMap {
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
}
