export type TMapMode =
	'collision' | 'height' | 'layer' | 'map' | 'object' | 'spawn';
export type TMapTool =
	| 'brush'
	| 'circle'
	| 'edge'
	| 'eraser'
	| 'hand'
	| 'picker'
	| 'place'
	| 'polygon'
	| 'rectangle'
	| 'select';
export type TMapEntityKind = 'collider' | 'object' | 'spawn';

/** 碰撞编辑对象：地图碰撞，或以某个物件为锚点编辑其模板碰撞（所有实例共用）。 */
export type TColliderTarget =
	{ kind: 'map' } | { kind: 'prefab'; objectIndex: number };

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

/** 选中折线或多边形的一个顶点；pathIndex 只对多边形有意义。 */
export interface IMapVertexSelection {
	pathIndex: number;
	pointIndex: number;
}

export interface IMapViewOptions {
	shouldDimInactiveLayers: boolean;
	shouldShowCollisions: boolean;
	shouldShowGrid: boolean;
	shouldShowSlopes: boolean;
	shouldShowViewportPreview: boolean;
}

export const DEFAULT_MAP_VIEW_OPTIONS = {
	shouldDimInactiveLayers: false,
	shouldShowCollisions: true,
	shouldShowGrid: false,
	shouldShowSlopes: false,
	shouldShowViewportPreview: true,
} as const satisfies IMapViewOptions;

export const MAP_HISTORY_LIMIT = 100;
export const MAP_BRUSH_SIZE_MAX = 9;
/** 吸附步长（格）；0 为不吸附，1/48 为原版 48 像素每格下的 1 像素。 */
export const MAP_SNAP_STEPS = [0, 1 / 48, 0.125, 0.25, 0.5, 1] as const;
export const DEFAULT_MAP_SNAP_STEP = 1 / 48;
export const MAP_ZOOM_MIN_PX_PER_UNIT = 1;
export const MAP_ZOOM_MAX_PX_PER_UNIT = 320;
/** 编辑器把 48 像素每单位记作 100%。 */
export const MAP_ZOOM_REFERENCE_PX_PER_UNIT = 48;
export const DEFAULT_MAP_PIXELS_PER_UNIT = 48;

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
	{ value: 'layer', label: '图层', shortcut: '1' },
	{ value: 'object', label: '物件', shortcut: '2' },
	{ value: 'collision', label: '碰撞', shortcut: '3' },
	{ value: 'height', label: '坡面', shortcut: '4' },
	{ value: 'spawn', label: '出生点', shortcut: '5' },
	{ value: 'map', label: '地图', shortcut: '6' },
] as const satisfies readonly IMapModeDefinition[];

export const MAP_TOOL_SHORTCUTS = {
	brush: 'B',
	circle: 'O',
	edge: 'L',
	eraser: 'E',
	hand: 'H',
	picker: 'I',
	place: 'P',
	polygon: 'N',
	rectangle: 'R',
	select: 'V',
} as const satisfies Record<TMapTool, string>;

export function getToolLabel(mode: TMapMode, tool: TMapTool) {
	switch (tool) {
		case 'brush':
			return '画笔';
		case 'circle':
			return '圆形碰撞';
		case 'edge':
			return '折线碰撞';
		case 'eraser':
			return '橡皮';
		case 'hand':
			return '平移';
		case 'picker':
			return '吸管';
		case 'place':
			return mode === 'spawn' ? '放置出生点' : '放置物件';
		case 'polygon':
			return mode === 'map' ? '绘制相机多边形' : '多边形碰撞';
		case 'rectangle':
			return mode === 'collision'
				? '矩形碰撞'
				: mode === 'map'
					? '绘制相机矩形'
					: '矩形';
		case 'select':
			return mode === 'layer'
				? '移动图层'
				: mode === 'map'
					? '编辑相机范围'
					: '选择';
	}
}

export function getToolDescription(mode: TMapMode, tool: TMapTool) {
	switch (tool) {
		case 'brush':
			return '拖动绘制坡度；右键擦除，按住 Alt 吸取';
		case 'circle':
			return '从圆心拖出半径';
		case 'edge':
			return '逐点单击；双击或回车结束，单击起点闭合。只有线段阻挡，适合围出可走区域';
		case 'eraser':
			return '拖动清除坡度';
		case 'hand':
			return '拖动画布；任何工具下也可按住空格或中键';
		case 'picker':
			return '点击吸取坡度，随后回到画笔';
		case 'place':
			return mode === 'spawn'
				? '点击空白处添加出生点，拖动已有点移动'
				: '点击放置所选物件模板；按住 Alt 不吸附';
		case 'polygon':
			return mode === 'map'
				? '逐点单击；双击、回车或单击起点结束'
				: '逐点单击，双击、回车或单击起点结束。实心阻挡；选中多边形后按住 Shift 开始绘制，加为洞';
		case 'rectangle':
			return mode === 'collision'
				? '拖出矩形碰撞'
				: mode === 'map'
					? '拖出矩形相机中心范围'
					: '拖出矩形铺满坡度；右键拖动清除';
		case 'select':
			return mode === 'layer'
				? '拖动当前图层，按整像素移动'
				: mode === 'map'
					? '拖动顶点或整体；双击边插入顶点，选中顶点后 Delete 删除'
					: '点击选择，拖动移动；Shift 加选，空白处框选。选中多边形或折线后可拖动顶点';
	}
}

export const MAP_TOOLS_BY_MODE = {
	collision: ['select', 'polygon', 'edge', 'rectangle', 'circle', 'hand'],
	height: ['brush', 'rectangle', 'eraser', 'picker', 'hand'],
	layer: ['select', 'hand'],
	map: ['select', 'polygon', 'rectangle', 'hand'],
	object: ['select', 'place', 'hand'],
	spawn: ['select', 'place', 'hand'],
} as const satisfies Record<TMapMode, readonly TMapTool[]>;

export const DEFAULT_MAP_TOOL_BY_MODE = {
	collision: 'select',
	height: 'brush',
	layer: 'select',
	map: 'select',
	object: 'select',
	spawn: 'select',
} as const satisfies Record<TMapMode, TMapTool>;

export const MAP_ENTITY_KIND_BY_MODE = {
	collision: 'collider',
	height: null,
	layer: null,
	map: null,
	object: 'object',
	spawn: 'spawn',
} as const satisfies Record<TMapMode, TMapEntityKind | null>;

export const SLOPE_PRESETS = [
	{ value: 0.33, label: '缓坡' },
	{ value: 0.5, label: '常用' },
	{ value: 0.66, label: '陡坡' },
	{ value: 1, label: '45°' },
] as const;

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

/** 吸附步长的显示文字。 */
export function formatSnapStep(step: number) {
	if (step === 0) return '不吸附';
	if (Math.abs(step - 1 / 48) < 1e-9) return '1 像素';
	return `${formatMapNumber(step, 3)} 格`;
}
