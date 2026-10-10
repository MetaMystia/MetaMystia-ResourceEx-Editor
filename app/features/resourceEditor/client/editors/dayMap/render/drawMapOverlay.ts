import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import {
	formatMapNumber,
	formatSlopeAngle,
	type IMapCellSelection,
	type IMapPoint,
	type IMapRect,
	type IMapView,
	type IMapViewOptions,
	type TMapMode,
	type TMapTool,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	getCameraRect,
	getCollisionRect,
	getGameViewportRect,
	getObjectRect,
	getRectHandlePoint,
	getVisibleWorldRect,
	RECT_HANDLES,
	type TRectHandle,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';

import { drawNativeColliders } from './drawNativeColliders';
import { getTileIndex } from './sceneGeometry';
import { snapViewToDevicePixels } from './sceneRenderer';

export interface IOverlayBrushPreview {
	cells: readonly IMapPoint[];
	kind: 'erase' | 'paint' | 'picker' | 'slope';
	slope: number;
}

export interface IOverlayRectPreview {
	kind: 'camera' | 'collision' | 'erase' | 'paint' | 'slope';
	rect: IMapRect;
}

export interface IMapOverlayState {
	activeLayerIndex: number;
	brushPreview: IOverlayBrushPreview | null;
	cameraPreviewCenter: IMapPoint | null;
	cellSelection: IMapCellSelection | null;
	fontFamily: string;
	hoveredHandle: TRectHandle | null;
	hoveredIndex: number | null;
	isCameraSelected: boolean;
	map: IDayMap;
	marquee: IMapRect | null;
	mode: TMapMode;
	options: IMapViewOptions;
	rectPreview: IOverlayRectPreview | null;
	selection: ReadonlySet<number>;
	tool: TMapTool;
}

export interface IMapOverlayFrame {
	height: number;
	pixelRatio: number;
	view: IMapView;
	width: number;
}

const OVERLAY_COLORS = {
	camera: '#22d3ee',
	collision: '#ef4444',
	erase: '#f43f5e',
	handleFill: '#ffffff',
	halo: 'rgba(15, 23, 42, 0.72)',
	hover: '#ffffff',
	marquee: '#60a5fa',
	object: '#c084fc',
	selection: '#fbbf24',
	slopeDown: '#f97316',
	slopeUp: '#0ea5e9',
	spawn: '#22c55e',
} as const;

interface IScreen {
	context: CanvasRenderingContext2D;
	height: number;
	pixelRatio: number;
	px: (x: number) => number;
	py: (y: number) => number;
	scale: number;
	visible: IMapRect;
	width: number;
}

function strokeWithHalo(
	screen: IScreen,
	color: string,
	width: number,
	draw: () => void
) {
	const { context } = screen;
	context.lineJoin = 'round';
	context.lineCap = 'round';
	context.strokeStyle = OVERLAY_COLORS.halo;
	context.lineWidth = width + 2;
	draw();
	context.stroke();
	context.strokeStyle = color;
	context.lineWidth = width;
	draw();
	context.stroke();
}

function screenRect(screen: IScreen, rect: IMapRect) {
	const left = screen.px(rect.minX);
	const top = screen.py(rect.maxY);
	return {
		height: screen.py(rect.minY) - top,
		left,
		top,
		width: screen.px(rect.maxX) - left,
	};
}

function traceRect(screen: IScreen, rect: IMapRect) {
	const box = screenRect(screen, rect);
	screen.context.beginPath();
	screen.context.rect(box.left, box.top, box.width, box.height);
}

function drawLabel(
	screen: IScreen,
	text: string,
	x: number,
	y: number,
	fontFamily: string,
	options: {
		align?: CanvasTextAlign;
		baseline?: CanvasTextBaseline;
		color?: string;
		size?: number;
	} = {}
) {
	const { context } = screen;
	context.font = `600 ${options.size ?? 11}px ${fontFamily}`;
	context.textAlign = options.align ?? 'left';
	context.textBaseline = options.baseline ?? 'alphabetic';
	context.lineJoin = 'round';
	context.strokeStyle = OVERLAY_COLORS.halo;
	context.lineWidth = 3.5;
	context.strokeText(text, x, y);
	context.fillStyle = options.color ?? '#ffffff';
	context.fillText(text, x, y);
}

function drawHandles(
	screen: IScreen,
	rect: IMapRect,
	hovered: TRectHandle | null
) {
	const { context } = screen;
	for (const handle of RECT_HANDLES) {
		const point = getRectHandlePoint(rect, handle);
		const size = handle === hovered ? 10 : 8;
		const x = Math.round(screen.px(point.x)) - size / 2;
		const y = Math.round(screen.py(point.y)) - size / 2;
		context.fillStyle = OVERLAY_COLORS.handleFill;
		context.strokeStyle = OVERLAY_COLORS.halo;
		context.lineWidth = 1.5;
		context.beginPath();
		context.roundRect(x, y, size, size, 2);
		context.fill();
		context.stroke();
	}
}

function drawGrid(screen: IScreen) {
	const { context, pixelRatio, scale, visible } = screen;
	let step = 1;
	while (step * scale < 10) step *= 2;
	const major = step * 8;
	const hairline = 1 / pixelRatio;
	const align = (value: number) =>
		Math.round(value * pixelRatio) / pixelRatio + hairline / 2;
	const drawLines = (interval: number, skip: number) => {
		context.beginPath();
		for (
			let x = Math.ceil(visible.minX / interval) * interval;
			x <= visible.maxX;
			x += interval
		) {
			if (skip && x % skip === 0) continue;
			const sx = align(screen.px(x));
			context.moveTo(sx, 0);
			context.lineTo(sx, screen.height);
		}
		for (
			let y = Math.ceil(visible.minY / interval) * interval;
			y <= visible.maxY;
			y += interval
		) {
			if (skip && y % skip === 0) continue;
			const sy = align(screen.py(y));
			context.moveTo(0, sy);
			context.lineTo(screen.width, sy);
		}
		context.stroke();
	};
	context.lineWidth = hairline;
	if (step * scale >= 10) {
		context.strokeStyle = 'rgba(148, 163, 184, 0.2)';
		drawLines(step, major);
	}
	context.strokeStyle = 'rgba(148, 163, 184, 0.38)';
	drawLines(major, 0);
	context.strokeStyle = 'rgba(148, 163, 184, 0.75)';
	context.lineWidth = Math.max(hairline, 1);
	context.beginPath();
	const axisX = align(screen.px(0));
	const axisY = align(screen.py(0));
	context.moveTo(axisX, 0);
	context.lineTo(axisX, screen.height);
	context.moveTo(0, axisY);
	context.lineTo(screen.width, axisY);
	context.stroke();
}

function drawSlopes(
	screen: IScreen,
	map: IDayMap,
	isEmphasized: boolean,
	fontFamily: string
) {
	const cells = map.height?.cells ?? [];
	if (cells.length === 0) return;
	const { context, scale, visible } = screen;
	const up = new Path2D();
	const down = new Path2D();
	const strong = new Path2D();
	const lines = new Path2D();
	const labels: { slope: number; x: number; y: number }[] = [];
	const size = scale;
	for (const cell of cells) {
		if (
			cell.x + 1 < visible.minX ||
			cell.x > visible.maxX ||
			cell.y + 1 < visible.minY ||
			cell.y > visible.maxY
		)
			continue;
		const left = screen.px(cell.x);
		const top = screen.py(cell.y + 1);
		const path = cell.slope > 0 ? up : down;
		path.rect(left, top, size, size);
		if (Math.abs(cell.slope) >= 0.6) strong.rect(left, top, size, size);
		if (scale >= 14) {
			const centerY = screen.py(cell.y + 0.5);
			const rise = (cell.slope * size) / 2;
			lines.moveTo(left + size * 0.08, centerY + rise * 0.84);
			lines.lineTo(left + size * 0.92, centerY - rise * 0.84);
		}
		if (scale >= 44 && labels.length < 400)
			labels.push({ slope: cell.slope, x: left, y: top });
	}
	context.save();
	context.globalAlpha = isEmphasized ? 1 : 0.55;
	context.fillStyle = 'rgba(14, 165, 233, 0.34)';
	context.fill(up);
	context.fillStyle = 'rgba(249, 115, 22, 0.34)';
	context.fill(down);
	context.fillStyle = 'rgba(255, 255, 255, 0.08)';
	context.fill(strong);
	if (scale >= 14) {
		context.lineCap = 'round';
		context.strokeStyle = OVERLAY_COLORS.halo;
		context.lineWidth = 3.5;
		context.stroke(lines);
		context.strokeStyle = '#ffffff';
		context.lineWidth = 1.6;
		context.stroke(lines);
	}
	if (isEmphasized && scale >= 22) {
		context.lineWidth = 1;
		context.strokeStyle = 'rgba(14, 165, 233, 0.75)';
		context.stroke(up);
		context.strokeStyle = 'rgba(249, 115, 22, 0.75)';
		context.stroke(down);
	}
	for (const label of labels)
		drawLabel(
			screen,
			`${formatMapNumber(label.slope)} · ${formatSlopeAngle(label.slope)}`,
			label.x + size / 2,
			label.y + size - 5,
			fontFamily,
			{ align: 'center', size: 10 }
		);
	context.restore();
}

function drawCollisions(screen: IScreen, state: IMapOverlayState) {
	const { context } = screen;
	const isActive = state.mode === 'collision';
	if (!isActive && !state.options.shouldShowCollisions) return;
	drawNativeColliders(
		context,
		state.map.nativeColliders ?? [],
		screen.px,
		screen.py,
		screen.scale,
		isActive
	);
	const fill = new Path2D();
	const stroke = new Path2D();
	state.map.collisions.forEach((box) => {
		const rect = getCollisionRect(box);
		if (
			rect.maxX < screen.visible.minX ||
			rect.minX > screen.visible.maxX ||
			rect.maxY < screen.visible.minY ||
			rect.minY > screen.visible.maxY
		)
			return;
		const { height, left, top, width } = screenRect(screen, rect);
		fill.rect(left, top, width, height);
		stroke.rect(
			Math.round(left) + 0.5,
			Math.round(top) + 0.5,
			Math.round(width),
			Math.round(height)
		);
	});
	context.save();
	context.globalAlpha = isActive ? 1 : 0.6;
	context.fillStyle = isActive
		? 'rgba(239, 68, 68, 0.2)'
		: 'rgba(239, 68, 68, 0.1)';
	context.fill(fill);
	context.strokeStyle = isActive
		? 'rgba(248, 113, 113, 0.95)'
		: 'rgba(248, 113, 113, 0.6)';
	context.lineWidth = 1;
	context.stroke(stroke);
	context.restore();
	if (!isActive) return;
	const highlight = (index: number, color: string, width: number) => {
		const box = state.map.collisions[index];
		if (!box) return;
		const rect = getCollisionRect(box);
		strokeWithHalo(screen, color, width, () => traceRect(screen, rect));
		if (screen.scale >= 16)
			drawLabel(
				screen,
				box.name || `碰撞${index + 1}`,
				screen.px(rect.minX) + 10,
				screen.py(rect.maxY) - 8,
				state.fontFamily
			);
	};
	if (state.hoveredIndex !== null && !state.selection.has(state.hoveredIndex))
		highlight(state.hoveredIndex, OVERLAY_COLORS.hover, 1.5);
	state.selection.forEach((index) =>
		highlight(index, OVERLAY_COLORS.selection, 2)
	);
	if (state.selection.size === 1 && state.tool === 'select') {
		const [index = -1] = state.selection;
		const box = state.map.collisions[index];
		if (box)
			drawHandles(screen, getCollisionRect(box), state.hoveredHandle);
	}
}

function drawObjects(screen: IScreen, state: IMapOverlayState) {
	if (state.mode !== 'object') return;
	const { context } = screen;
	const tiles = getTileIndex(state.map.tiles);
	const anchors = new Path2D();
	const radius = screen.scale >= 24 ? 4 : 3;
	state.map.objects.forEach((object) => {
		if (
			object.x < screen.visible.minX - 1 ||
			object.x > screen.visible.maxX + 1 ||
			object.y < screen.visible.minY - 1 ||
			object.y > screen.visible.maxY + 1
		)
			return;
		const x = screen.px(object.x);
		const y = screen.py(object.y);
		anchors.moveTo(x, y - radius);
		anchors.lineTo(x + radius, y);
		anchors.lineTo(x, y + radius);
		anchors.lineTo(x - radius, y);
		anchors.closePath();
	});
	context.save();
	context.fillStyle = OVERLAY_COLORS.object;
	context.strokeStyle = OVERLAY_COLORS.halo;
	context.lineWidth = 1.5;
	context.stroke(anchors);
	context.fill(anchors);
	context.restore();
	const highlight = (index: number, color: string, width: number) => {
		const object = state.map.objects[index];
		if (!object) return;
		const rect = getObjectRect(state.map, object, tiles);
		strokeWithHalo(screen, color, width, () => traceRect(screen, rect));
		if (screen.scale >= 16)
			drawLabel(
				screen,
				object.name || `装饰${index + 1}`,
				screen.px(rect.minX) + 2,
				screen.py(rect.maxY) - 6,
				state.fontFamily
			);
	};
	if (state.hoveredIndex !== null && !state.selection.has(state.hoveredIndex))
		highlight(state.hoveredIndex, OVERLAY_COLORS.hover, 1.25);
	state.selection.forEach((index) =>
		highlight(index, OVERLAY_COLORS.selection, 2)
	);
}

const SPAWN_DIRECTIONS = {
	Down: [0, 1],
	Left: [-1, 0],
	Right: [1, 0],
	Up: [0, -1],
} as const;

function drawSpawns(screen: IScreen, state: IMapOverlayState) {
	const { context } = screen;
	const isActive = state.mode === 'spawn';
	state.map.spawnMarkers.forEach((marker, index) => {
		if (
			marker.x < screen.visible.minX - 2 ||
			marker.x > screen.visible.maxX + 2 ||
			marker.y < screen.visible.minY - 2 ||
			marker.y > screen.visible.maxY + 2
		)
			return;
		const x = screen.px(marker.x);
		const y = screen.py(marker.y);
		const isSelected = isActive && state.selection.has(index);
		const isHovered = isActive && state.hoveredIndex === index;
		const isDefault = marker.name === state.map.defaultSpawnMarker;
		const radius = isActive ? 7 : 5;
		const [dx, dy] = SPAWN_DIRECTIONS[marker.rotation] ?? [0, 1];
		context.save();
		context.globalAlpha = isActive ? 1 : 0.85;
		context.beginPath();
		context.moveTo(x + dx * (radius + 7), y + dy * (radius + 7));
		context.lineTo(x + dx * radius - dy * 5, y + dy * radius + dx * 5);
		context.lineTo(x + dx * radius + dy * 5, y + dy * radius - dx * 5);
		context.closePath();
		context.fillStyle = isSelected ? OVERLAY_COLORS.selection : '#ffffff';
		context.strokeStyle = OVERLAY_COLORS.halo;
		context.lineWidth = 1.5;
		context.stroke();
		context.fill();
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fillStyle = isSelected
			? OVERLAY_COLORS.selection
			: OVERLAY_COLORS.spawn;
		context.lineWidth = 2;
		context.stroke();
		context.fill();
		if (isDefault) {
			context.beginPath();
			context.arc(x, y, radius * 0.4, 0, Math.PI * 2);
			context.fillStyle = '#ffffff';
			context.fill();
		}
		if (isHovered || isSelected) {
			context.beginPath();
			context.arc(x, y, radius + 4, 0, Math.PI * 2);
			context.strokeStyle = isSelected
				? OVERLAY_COLORS.selection
				: OVERLAY_COLORS.hover;
			context.lineWidth = 1.5;
			context.stroke();
		}
		context.restore();
		if (isActive || screen.scale >= 20)
			drawLabel(
				screen,
				isDefault ? `${marker.name}（默认）` : marker.name,
				x + radius + 6,
				y - radius - 2,
				state.fontFamily,
				{ color: isSelected ? OVERLAY_COLORS.selection : '#ffffff' }
			);
	});
}

function drawCamera(screen: IScreen, state: IMapOverlayState) {
	const rect = getCameraRect(state.map.camera.bounds);
	const isActive = state.mode === 'map';
	const { context } = screen;
	if (rect) {
		context.save();
		if (isActive) {
			const outer = {
				minX: rect.minX - 40 / 3,
				minY: rect.minY - 7,
				maxX: rect.maxX + 40 / 3,
				maxY: rect.maxY + 8,
			};
			context.setLineDash([2, 4]);
			context.strokeStyle = 'rgba(34, 211, 238, 0.55)';
			context.lineWidth = 1;
			traceRect(screen, outer);
			context.stroke();
			drawLabel(
				screen,
				'玩家可见范围',
				screen.px(outer.minX) + 4,
				screen.py(outer.maxY) + 14,
				state.fontFamily,
				{ color: '#a5f3fc', size: 10 }
			);
		}
		context.setLineDash([7, 5]);
		strokeWithHalo(
			screen,
			state.isCameraSelected
				? OVERLAY_COLORS.selection
				: OVERLAY_COLORS.camera,
			isActive ? 2 : 1.25,
			() => traceRect(screen, rect)
		);
		context.setLineDash([]);
		if (isActive) {
			context.fillStyle = 'rgba(34, 211, 238, 0.06)';
			const box = screenRect(screen, rect);
			context.fillRect(box.left, box.top, box.width, box.height);
			drawLabel(
				screen,
				'相机中心范围',
				screen.px(rect.minX) + 4,
				screen.py(rect.maxY) - 6,
				state.fontFamily,
				{ color: '#a5f3fc' }
			);
			if (state.tool === 'select')
				drawHandles(screen, rect, state.hoveredHandle);
		}
		context.restore();
	}
	if (
		isActive &&
		state.options.shouldShowViewportPreview &&
		state.cameraPreviewCenter
	) {
		const viewport = getGameViewportRect(state.cameraPreviewCenter);
		context.save();
		context.fillStyle = 'rgba(255, 255, 255, 0.05)';
		const box = screenRect(screen, viewport);
		context.fillRect(box.left, box.top, box.width, box.height);
		context.setLineDash([10, 6]);
		strokeWithHalo(screen, '#f8fafc', 1.5, () =>
			traceRect(screen, viewport)
		);
		context.setLineDash([]);
		drawLabel(
			screen,
			'游戏画面 26.7×15',
			box.left + 6,
			box.top + 16,
			state.fontFamily
		);
		const x = screen.px(state.cameraPreviewCenter.x);
		const y = screen.py(state.cameraPreviewCenter.y);
		strokeWithHalo(screen, '#f8fafc', 1.5, () => {
			context.beginPath();
			context.moveTo(x - 6, y);
			context.lineTo(x + 6, y);
			context.moveTo(x, y - 6);
			context.lineTo(x, y + 6);
		});
		context.restore();
	}
}

function drawCellPreview(screen: IScreen, state: IMapOverlayState) {
	const { context } = screen;
	const preview = state.brushPreview;
	if (preview && preview.cells.length > 0) {
		const path = new Path2D();
		for (const cell of preview.cells)
			path.rect(
				screen.px(cell.x),
				screen.py(cell.y + 1),
				screen.scale,
				screen.scale
			);
		context.save();
		if (preview.kind === 'erase') {
			context.fillStyle = 'rgba(244, 63, 94, 0.22)';
			context.fill(path);
		}
		if (preview.kind === 'slope') {
			context.fillStyle =
				preview.slope > 0
					? 'rgba(14, 165, 233, 0.35)'
					: preview.slope < 0
						? 'rgba(249, 115, 22, 0.35)'
						: 'rgba(244, 63, 94, 0.2)';
			context.fill(path);
		}
		context.lineWidth = 3;
		context.strokeStyle = OVERLAY_COLORS.halo;
		context.stroke(path);
		context.lineWidth = 1.25;
		context.strokeStyle =
			preview.kind === 'erase' ? OVERLAY_COLORS.erase : '#ffffff';
		context.stroke(path);
		context.restore();
	}
	const rectPreview = state.rectPreview;
	if (rectPreview) {
		const color =
			rectPreview.kind === 'erase'
				? OVERLAY_COLORS.erase
				: rectPreview.kind === 'collision'
					? OVERLAY_COLORS.collision
					: rectPreview.kind === 'camera'
						? OVERLAY_COLORS.camera
						: '#ffffff';
		const box = screenRect(screen, rectPreview.rect);
		context.save();
		context.fillStyle =
			rectPreview.kind === 'erase'
				? 'rgba(244, 63, 94, 0.18)'
				: rectPreview.kind === 'collision'
					? 'rgba(239, 68, 68, 0.22)'
					: rectPreview.kind === 'camera'
						? 'rgba(34, 211, 238, 0.12)'
						: 'rgba(255, 255, 255, 0.1)';
		context.fillRect(box.left, box.top, box.width, box.height);
		context.setLineDash([6, 4]);
		strokeWithHalo(screen, color, 1.5, () =>
			traceRect(screen, rectPreview.rect)
		);
		context.setLineDash([]);
		const width = rectPreview.rect.maxX - rectPreview.rect.minX;
		const height = rectPreview.rect.maxY - rectPreview.rect.minY;
		drawLabel(
			screen,
			`${formatMapNumber(width)} × ${formatMapNumber(height)}`,
			box.left + box.width / 2,
			box.top + box.height + 16,
			state.fontFamily,
			{ align: 'center' }
		);
		context.restore();
	}
	const selection = state.cellSelection;
	if (selection && state.mode === 'tile') {
		const rect = {
			minX: selection.x,
			minY: selection.y,
			maxX: selection.x + 1,
			maxY: selection.y + 1,
		};
		strokeWithHalo(screen, OVERLAY_COLORS.selection, 2, () =>
			traceRect(screen, rect)
		);
	}
	if (state.marquee) {
		const box = screenRect(screen, state.marquee);
		context.save();
		context.fillStyle = 'rgba(96, 165, 250, 0.12)';
		context.fillRect(box.left, box.top, box.width, box.height);
		context.strokeStyle = OVERLAY_COLORS.marquee;
		context.setLineDash([5, 4]);
		context.lineWidth = 1;
		context.strokeRect(
			Math.round(box.left) + 0.5,
			Math.round(box.top) + 0.5,
			Math.round(box.width),
			Math.round(box.height)
		);
		context.restore();
	}
}

export function drawMapOverlay(
	canvas: HTMLCanvasElement,
	frame: IMapOverlayFrame,
	state: IMapOverlayState
) {
	const context = canvas.getContext('2d');
	if (!context) return;
	const width = Math.max(1, Math.round(frame.width * frame.pixelRatio));
	const height = Math.max(1, Math.round(frame.height * frame.pixelRatio));
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, width, height);
	context.setTransform(frame.pixelRatio, 0, 0, frame.pixelRatio, 0, 0);
	const view = snapViewToDevicePixels(frame.view, frame.pixelRatio);
	const screen: IScreen = {
		context,
		height: frame.height,
		pixelRatio: frame.pixelRatio,
		px: (x) => frame.width / 2 + (x - view.x) * view.scale,
		py: (y) => frame.height / 2 - (y - view.y) * view.scale,
		scale: view.scale,
		visible: getVisibleWorldRect(view, frame.width, frame.height),
		width: frame.width,
	};
	if (state.options.shouldShowGrid) drawGrid(screen);
	if (state.mode === 'height' || state.options.shouldShowSlopes)
		drawSlopes(
			screen,
			state.map,
			state.mode === 'height',
			state.fontFamily
		);
	drawCollisions(screen, state);
	drawCamera(screen, state);
	drawObjects(screen, state);
	drawSpawns(screen, state);
	drawCellPreview(screen, state);
}
