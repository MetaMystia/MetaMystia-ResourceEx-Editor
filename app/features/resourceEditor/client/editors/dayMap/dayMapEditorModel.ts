import type { IDayMapPlacement } from '@/domain/resourcePack/contracts/dayMap';

export type TMapMode =
	'tile' | 'object' | 'height' | 'collision' | 'spawn' | 'map';
export type TMapTool =
	| 'select'
	| 'brush'
	| 'rectangle'
	| 'fill'
	| 'eraser'
	| 'picker'
	| 'place'
	| 'hand';
export type TMapEntityKind = 'object' | 'collision' | 'spawn';

export interface IMapPoint {
	x: number;
	y: number;
}

/** `scale` 为每个世界单位对应的 CSS 像素。 */
export interface IMapView extends IMapPoint {
	scale: number;
}

export interface IMapRect {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface ITileBrushCell {
	dx: number;
	dy: number;
	tile: string;
}

/** 单格画笔为一项；从图集框选得到多格图章。`placement` 来自吸取的原始格子。 */
export interface ITileBrush {
	cells: readonly ITileBrushCell[];
	placement?: IDayMapPlacement;
}

export interface IMapCellSelection {
	layerIndex: number;
	x: number;
	y: number;
}

export interface IMapViewOptions {
	shouldDimInactiveLayers: boolean;
	shouldShowCollisions: boolean;
	shouldShowGrid: boolean;
	shouldShowMaterialSources: boolean;
	shouldShowSlopes: boolean;
	shouldShowViewportPreview: boolean;
}

export const DEFAULT_MAP_VIEW_OPTIONS = {
	shouldDimInactiveLayers: false,
	shouldShowCollisions: true,
	shouldShowGrid: true,
	shouldShowMaterialSources: false,
	shouldShowSlopes: false,
	shouldShowViewportPreview: true,
} as const satisfies IMapViewOptions;

export const MAP_LIMITS = {
	cellCount: 100000,
	collisionCount: 4096,
	coordinate: 4096,
	heightCellCount: 100000,
	layerCount: 32,
	objectCount: 4096,
	sortedObjectY: 1023,
	spawnCount: 256,
} as const;

export const MAP_HISTORY_LIMIT = 100;
export const MAP_BRUSH_SIZE_MAX = 9;
export const MAP_SNAP_STEPS = [0, 0.125, 0.25, 0.5, 1] as const;
export const DEFAULT_MAP_SNAP_STEP = 0.25;
export const MAP_ZOOM_MIN_PX_PER_UNIT = 2;
export const MAP_ZOOM_MAX_PX_PER_UNIT = 320;
/** 编辑器把 48 像素每单位记作 100%。 */
export const MAP_ZOOM_REFERENCE_PX_PER_UNIT = 48;

/** 16:9 画幅、正交半高 7.5、相机 Y 偏移 +0.5 时，相机中心看到的范围。 */
export const GAME_VIEWPORT = {
	bottom: 7,
	halfWidth: 40 / 3,
	pixelMargin: 1 / 32,
	top: 8,
} as const;

interface IMapModeDefinition {
	label: string;
	shortcut: string;
	value: TMapMode;
}

export const MAP_MODES = [
	{ value: 'tile', label: '瓦片', shortcut: '1' },
	{ value: 'object', label: '装饰', shortcut: '2' },
	{ value: 'height', label: '坡面', shortcut: '3' },
	{ value: 'collision', label: '碰撞', shortcut: '4' },
	{ value: 'spawn', label: '出生点', shortcut: '5' },
	{ value: 'map', label: '地图', shortcut: '6' },
] as const satisfies readonly IMapModeDefinition[];

export const MAP_TOOL_SHORTCUTS = {
	brush: 'B',
	eraser: 'E',
	fill: 'G',
	hand: 'H',
	picker: 'I',
	place: 'P',
	rectangle: 'R',
	select: 'V',
} as const satisfies Record<TMapTool, string>;

export function getToolLabel(mode: TMapMode, tool: TMapTool) {
	switch (tool) {
		case 'brush':
			return '画笔';
		case 'eraser':
			return '橡皮';
		case 'fill':
			return '填充';
		case 'hand':
			return '平移';
		case 'picker':
			return '吸管';
		case 'place':
			return mode === 'spawn' ? '放置出生点' : '放置装饰';
		case 'rectangle':
			return mode === 'collision'
				? '绘制碰撞框'
				: mode === 'map'
					? '绘制相机范围'
					: '矩形';
		case 'select':
			return mode === 'tile'
				? '查看格子'
				: mode === 'map'
					? '调整相机范围'
					: '选择';
	}
}

export function getToolDescription(mode: TMapMode, tool: TMapTool) {
	const target = mode === 'height' ? '坡度' : '瓦片';
	switch (tool) {
		case 'brush':
			return `拖动绘制${target}；右键擦除，按住 Alt 吸取，Shift 点击连成直线`;
		case 'eraser':
			return mode === 'height' ? '拖动清除坡度' : '拖动擦除当前图层';
		case 'fill':
			return '填充相连的同类格子；右键清除该区域';
		case 'hand':
			return '拖动画布；任何工具下也可按住空格或中键';
		case 'picker':
			return `点击吸取${target}，随后回到画笔`;
		case 'place':
			return mode === 'spawn'
				? '点击空白处添加出生点，拖动已有点移动'
				: '点击放置所选瓦片；拖动脚点移动，按住 Alt 不吸附';
		case 'rectangle':
			return mode === 'collision'
				? '拖出新的碰撞框；单击选中已有碰撞框'
				: mode === 'map'
					? '拖出新的相机中心范围'
					: `拖出矩形铺满${target}；右键拖动清除`;
		case 'select':
			return mode === 'tile'
				? '点击格子查看属性'
				: mode === 'map'
					? '拖动相机范围或控制点；方向键微调'
					: '点击选择，拖动移动；Shift 加选，空白处框选';
	}
}

export const MAP_TOOLS_BY_MODE = {
	tile: ['select', 'brush', 'rectangle', 'fill', 'eraser', 'picker', 'hand'],
	object: ['select', 'place', 'hand'],
	height: ['brush', 'rectangle', 'fill', 'eraser', 'picker', 'hand'],
	collision: ['select', 'rectangle', 'hand'],
	spawn: ['select', 'place', 'hand'],
	map: ['select', 'rectangle', 'hand'],
} as const satisfies Record<TMapMode, readonly TMapTool[]>;

export const DEFAULT_MAP_TOOL_BY_MODE = {
	tile: 'brush',
	object: 'select',
	height: 'brush',
	collision: 'select',
	spawn: 'select',
	map: 'select',
} as const satisfies Record<TMapMode, TMapTool>;

export const MAP_ENTITY_KIND_BY_MODE = {
	collision: 'collision',
	height: null,
	map: null,
	object: 'object',
	spawn: 'spawn',
	tile: null,
} as const satisfies Record<TMapMode, TMapEntityKind | null>;

export const SLOPE_PRESETS = [
	{ value: 0.33, label: '缓坡' },
	{ value: 0.5, label: '常用' },
	{ value: 0.66, label: '陡坡' },
	{ value: 1, label: '45°' },
] as const;

const DEFAULT_MAP_SHADERS = new Set([
	'Sprites/Default',
	'Custom/DefaultSprite',
]);

/** 使用特殊材质的图层或格子默认不参与预览。 */
export function hasSpecialShader(placement: IDayMapPlacement) {
	return (
		placement.shader !== undefined &&
		!DEFAULT_MAP_SHADERS.has(placement.shader)
	);
}

export function isToolAvailable(mode: TMapMode, tool: TMapTool) {
	return (MAP_TOOLS_BY_MODE[mode] as readonly TMapTool[]).includes(tool);
}

export function formatSlopeAngle(slope: number): string {
	return `${((Math.atan(slope) * 180) / Math.PI).toFixed(1)}°`;
}

export function formatMapNumber(value: number, fractionDigits = 2) {
	if (!Number.isFinite(value)) return String(value);
	const rounded = Number(value.toFixed(fractionDigits));
	return Object.is(rounded, -0) ? '0' : String(rounded);
}
