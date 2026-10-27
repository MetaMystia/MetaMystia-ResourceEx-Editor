import type {
	IDayMap,
	TDayMapCollider,
} from '@/domain/resourcePack/contracts/dayMap';
import { getColliderOutlines } from '@/domain/resourcePack/dayMapGeometry';

import {
	formatMapNumber,
	formatSlopeAngle,
	GAME_VIEWPORT,
	type IMapPoint,
	type IMapRect,
	type IMapVertexSelection,
	type IMapView,
	type IMapViewOptions,
	type TColliderTarget,
	type TMapMode,
	type TMapTool,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	getTargetWorldColliders,
	getVertexPaths,
	isVertexPathClosed,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	getColliderRect,
	getGameViewportRect,
	getLayerRect,
	getObjectRect,
	getPlacedPrefabColliders,
	getPointsRect,
	getPrefabIndex,
	getRectHandlePoint,
	getVisibleWorldRect,
	RECT_HANDLES,
	type TRectHandle,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';

import { snapViewToDevicePixels } from './sceneRenderer';

/** 进行中的绘制：逐点折线/多边形、拖出的矩形或圆。 */
export type TOverlayDraft =
	| {
			cursor: IMapPoint | null;
			isClosed: boolean;
			kind: 'pen';
			points: readonly IMapPoint[];
	  }
	| {
			kind: 'rect';
			rect: IMapRect;
			tone: 'camera' | 'collider' | 'erase' | 'slope';
	  }
	| { center: IMapPoint; kind: 'circle'; radius: number };

export interface IOverlayBrushPreview {
	cells: readonly IMapPoint[];
	kind: 'erase' | 'paint' | 'picker';
	slope: number;
}

export interface IMapOverlayState {
	activeLayerIndex: number;
	brushPreview: IOverlayBrushPreview | null;
	cameraPreviewCenter: IMapPoint | null;
	colliderTarget: TColliderTarget;
	draft: TOverlayDraft | null;
	fontFamily: string;
	hiddenLayers: ReadonlySet<number>;
	hoveredHandle: TRectHandle | null;
	hoveredIndex: number | null;
	map: IDayMap;
	marquee: IMapRect | null;
	mode: TMapMode;
	options: IMapViewOptions;
	selectedVertex: IMapVertexSelection | null;
	selection: ReadonlySet<number>;
	tool: TMapTool;
}

export interface IMapOverlayFrame {
	height: number;
	pixelRatio: number;
	view: IMapView;
	width: number;
}

export const COLLIDER_LABELS = {
	box: '矩形',
	circle: '圆',
	edge: '折线',
	polygon: '多边形',
} as const satisfies Record<TDayMapCollider['shape'], string>;

const OVERLAY_COLORS = {
	camera: '#22d3ee',
	edge: '#fb923c',
	erase: '#f43f5e',
	handleFill: '#ffffff',
	halo: 'rgba(15, 23, 42, 0.72)',
	hover: '#ffffff',
	layer: '#a3e635',
	marquee: '#60a5fa',
	object: '#c084fc',
	selection: '#fbbf24',
	solid: '#ef4444',
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

function isRectVisible(screen: IScreen, rect: IMapRect) {
	return (
		rect.maxX >= screen.visible.minX &&
		rect.minX <= screen.visible.maxX &&
		rect.maxY >= screen.visible.minY &&
		rect.minY <= screen.visible.maxY
	);
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

function tracePath(
	screen: IScreen,
	points: readonly (readonly number[])[],
	isClosed: boolean,
	path: CanvasPath = screen.context
) {
	points.forEach(([x = 0, y = 0], index) => {
		if (index) path.lineTo(screen.px(x), screen.py(y));
		else path.moveTo(screen.px(x), screen.py(y));
	});
	if (isClosed) path.closePath();
}

function drawLabel(
	screen: IScreen,
	text: string,
	x: number,
	y: number,
	fontFamily: string,
	options: { align?: CanvasTextAlign; color?: string; size?: number } = {}
) {
	const { context } = screen;
	context.font = `600 ${options.size ?? 11}px ${fontFamily}`;
	context.textAlign = options.align ?? 'left';
	context.textBaseline = 'alphabetic';
	context.lineJoin = 'round';
	context.strokeStyle = OVERLAY_COLORS.halo;
	context.lineWidth = 3.5;
	context.strokeText(text, x, y);
	context.fillStyle = options.color ?? '#ffffff';
	context.fillText(text, x, y);
}

function drawHandle(
	screen: IScreen,
	point: IMapPoint,
	isActive: boolean,
	isRound = false
) {
	const { context } = screen;
	const size = isActive ? 10 : 8;
	const x = Math.round(screen.px(point.x));
	const y = Math.round(screen.py(point.y));
	context.fillStyle = isActive
		? OVERLAY_COLORS.selection
		: OVERLAY_COLORS.handleFill;
	context.strokeStyle = OVERLAY_COLORS.halo;
	context.lineWidth = 1.5;
	context.beginPath();
	if (isRound) context.arc(x, y, size / 2, 0, Math.PI * 2);
	else context.roundRect(x - size / 2, y - size / 2, size, size, 2);
	context.fill();
	context.stroke();
}

function drawRectHandles(
	screen: IScreen,
	rect: IMapRect,
	hovered: TRectHandle | null
) {
	for (const handle of RECT_HANDLES)
		drawHandle(
			screen,
			getRectHandlePoint(rect, handle),
			handle === hovered
		);
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
	const lines = new Path2D();
	const labels: { slope: number; x: number; y: number }[] = [];
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
		(cell.slope > 0 ? up : down).rect(left, top, scale, scale);
		if (scale >= 14) {
			const centerY = screen.py(cell.y + 0.5);
			const rise = (cell.slope * scale) / 2;
			lines.moveTo(left + scale * 0.08, centerY + rise * 0.84);
			lines.lineTo(left + scale * 0.92, centerY - rise * 0.84);
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
	if (scale >= 14) {
		context.lineCap = 'round';
		context.strokeStyle = OVERLAY_COLORS.halo;
		context.lineWidth = 3.5;
		context.stroke(lines);
		context.strokeStyle = '#ffffff';
		context.lineWidth = 1.6;
		context.stroke(lines);
	}
	for (const label of labels)
		drawLabel(
			screen,
			`${formatMapNumber(label.slope)} · ${formatSlopeAngle(label.slope)}`,
			label.x + scale / 2,
			label.y + scale - 5,
			fontFamily,
			{ align: 'center', size: 10 }
		);
	context.restore();
}

function drawLayers(screen: IScreen, state: IMapOverlayState) {
	if (state.mode !== 'layer') return;
	const { context } = screen;
	state.map.layers.forEach((layer, index) => {
		if (state.hiddenLayers.has(index)) return;
		const rect = getLayerRect(state.map, layer);
		if (!isRectVisible(screen, rect)) return;
		const isActive = index === state.activeLayerIndex;
		context.save();
		context.setLineDash(isActive ? [] : [6, 5]);
		strokeWithHalo(
			screen,
			isActive ? OVERLAY_COLORS.selection : OVERLAY_COLORS.layer,
			isActive ? 2 : 1,
			() => traceRect(screen, rect)
		);
		context.restore();
		if (isActive)
			drawLabel(
				screen,
				`${layer.name} · ${layer.image.width}×${layer.image.height}`,
				screen.px(rect.minX) + 4,
				screen.py(rect.maxY) - 6,
				state.fontFamily,
				{ color: OVERLAY_COLORS.selection }
			);
	});
}

function drawObjects(screen: IScreen, state: IMapOverlayState) {
	if (
		state.mode !== 'object' &&
		!(state.mode === 'collision' && state.colliderTarget.kind === 'prefab')
	)
		return;
	const { context } = screen;
	const prefabs = getPrefabIndex(state.map);
	const anchors = new Path2D();
	const radius = screen.scale >= 24 ? 4 : 3;
	if (state.mode === 'object')
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
		const rect = getObjectRect(object, prefabs.get(object.prefab));
		strokeWithHalo(screen, color, width, () => traceRect(screen, rect));
		if (screen.scale >= 16)
			drawLabel(
				screen,
				object.name ?? object.prefab,
				screen.px(rect.minX) + 2,
				screen.py(rect.maxY) - 6,
				state.fontFamily
			);
	};
	if (state.mode === 'collision' && state.colliderTarget.kind === 'prefab') {
		highlight(state.colliderTarget.objectIndex, OVERLAY_COLORS.object, 1.5);
		return;
	}
	if (state.hoveredIndex !== null && !state.selection.has(state.hoveredIndex))
		highlight(state.hoveredIndex, OVERLAY_COLORS.hover, 1.25);
	state.selection.forEach((index) =>
		highlight(index, OVERLAY_COLORS.selection, 2)
	);
}

function addColliderPaths(
	screen: IScreen,
	collider: TDayMapCollider,
	solid: Path2D,
	edge: Path2D
) {
	if (!isRectVisible(screen, getColliderRect(collider))) return;
	for (const outline of getColliderOutlines(collider))
		tracePath(
			screen,
			outline.points,
			outline.isClosed,
			outline.isSolid ? solid : edge
		);
}

function drawColliders(screen: IScreen, state: IMapOverlayState) {
	const { context } = screen;
	const isActive = state.mode === 'collision';
	if (!isActive && !state.options.shouldShowCollisions) return;
	const { colliderTarget, map } = state;
	const prefabs = getPrefabIndex(map);
	const solid = new Path2D();
	const edge = new Path2D();
	const faintSolid = new Path2D();
	const faintEdge = new Path2D();
	// 只有当前编辑对象的碰撞高亮，其余（含同模板的其他实例）淡显。
	const isMapTarget = colliderTarget.kind === 'map';
	const isMapBright = isActive && isMapTarget;
	for (const collider of map.colliders)
		addColliderPaths(
			screen,
			collider,
			isMapBright ? solid : faintSolid,
			isMapBright ? edge : faintEdge
		);
	map.objects.forEach((object, index) => {
		if (
			colliderTarget.kind === 'prefab' &&
			colliderTarget.objectIndex === index
		)
			return;
		for (const collider of getPlacedPrefabColliders(
			object,
			prefabs.get(object.prefab)
		))
			addColliderPaths(screen, collider, faintSolid, faintEdge);
	});
	const targetColliders = isMapTarget
		? []
		: getTargetWorldColliders(map, colliderTarget);
	for (const collider of targetColliders)
		addColliderPaths(screen, collider, solid, edge);
	context.save();
	context.globalAlpha = isActive ? 1 : 0.6;
	context.fillStyle = 'rgba(239, 68, 68, 0.08)';
	context.fill(faintSolid);
	context.strokeStyle = 'rgba(248, 113, 113, 0.45)';
	context.lineWidth = 1;
	context.stroke(faintSolid);
	context.strokeStyle = 'rgba(251, 146, 60, 0.45)';
	context.stroke(faintEdge);
	context.fillStyle = isActive
		? 'rgba(239, 68, 68, 0.2)'
		: 'rgba(239, 68, 68, 0.1)';
	context.fill(solid, 'evenodd');
	context.strokeStyle = 'rgba(248, 113, 113, 0.95)';
	context.lineWidth = isActive ? 1.5 : 1;
	context.stroke(solid);
	context.strokeStyle = 'rgba(251, 146, 60, 0.95)';
	context.lineWidth = isActive ? 2 : 1.25;
	context.stroke(edge);
	context.restore();
	if (!isActive) return;
	const world = isMapTarget ? map.colliders : targetColliders;
	const highlight = (index: number, color: string, width: number) => {
		const collider = world[index];
		if (!collider) return;
		for (const outline of getColliderOutlines(collider))
			strokeWithHalo(screen, color, width, () => {
				context.beginPath();
				tracePath(screen, outline.points, outline.isClosed);
			});
		const rect = getColliderRect(collider);
		if (screen.scale >= 16)
			drawLabel(
				screen,
				collider.name ??
					`${COLLIDER_LABELS[collider.shape]}${index + 1}`,
				screen.px(rect.minX) + 6,
				screen.py(rect.maxY) - 8,
				state.fontFamily
			);
	};
	if (state.hoveredIndex !== null && !state.selection.has(state.hoveredIndex))
		highlight(state.hoveredIndex, OVERLAY_COLORS.hover, 1.5);
	state.selection.forEach((index) =>
		highlight(index, OVERLAY_COLORS.selection, 2)
	);
	if (state.selection.size !== 1 || state.tool !== 'select') return;
	const [selected = -1] = state.selection;
	const collider = world[selected];
	if (!collider) return;
	const paths = getVertexPaths(collider);
	if (paths)
		drawVertexHandles(
			screen,
			paths,
			isVertexPathClosed(collider),
			state.selectedVertex
		);
	else if (collider.shape === 'box' && !collider.rotation)
		drawRectHandles(screen, getColliderRect(collider), state.hoveredHandle);
	else if (collider.shape === 'circle')
		drawHandle(
			screen,
			{ x: collider.x + collider.radius, y: collider.y },
			state.hoveredHandle !== null,
			true
		);
}

function drawVertexHandles(
	screen: IScreen,
	paths: readonly number[][][],
	isClosed: boolean,
	selected: IMapVertexSelection | null
) {
	const { context } = screen;
	paths.forEach((path, pathIndex) => {
		// 边的中点画成小圆点，双击即可在此插入顶点。
		context.save();
		context.fillStyle = 'rgba(255, 255, 255, 0.7)';
		const count = isClosed ? path.length : path.length - 1;
		for (let i = 0; i < count; i++) {
			const [ax = 0, ay = 0] = path[i] ?? [];
			const [bx = 0, by = 0] = path[(i + 1) % path.length] ?? [];
			context.beginPath();
			context.arc(
				screen.px((ax + bx) / 2),
				screen.py((ay + by) / 2),
				2.5,
				0,
				Math.PI * 2
			);
			context.fill();
		}
		context.restore();
		path.forEach(([x = 0, y = 0], pointIndex) =>
			drawHandle(
				screen,
				{ x, y },
				selected?.pathIndex === pathIndex &&
					selected.pointIndex === pointIndex
			)
		);
	});
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
	const { bounds, shouldFollow } = state.map.camera;
	const isActive = state.mode === 'map';
	const { context } = screen;
	if (shouldFollow && bounds.length >= 2) {
		context.save();
		if (isActive) {
			const rect = getPointsRect(bounds);
			const outer = {
				minX: rect.minX - GAME_VIEWPORT.halfWidth,
				minY: rect.minY - GAME_VIEWPORT.bottom,
				maxX: rect.maxX + GAME_VIEWPORT.halfWidth,
				maxY: rect.maxY + GAME_VIEWPORT.top,
			};
			context.setLineDash([2, 4]);
			context.strokeStyle = 'rgba(34, 211, 238, 0.55)';
			context.lineWidth = 1;
			traceRect(screen, outer);
			context.stroke();
			drawLabel(
				screen,
				'玩家最大可见范围',
				screen.px(outer.minX) + 4,
				screen.py(outer.maxY) + 14,
				state.fontFamily,
				{ color: '#a5f3fc', size: 10 }
			);
			context.fillStyle = 'rgba(34, 211, 238, 0.06)';
			context.beginPath();
			tracePath(screen, bounds, true);
			context.fill();
		}
		context.setLineDash([7, 5]);
		strokeWithHalo(
			screen,
			OVERLAY_COLORS.camera,
			isActive ? 2 : 1.25,
			() => {
				context.beginPath();
				tracePath(screen, bounds, true);
			}
		);
		context.setLineDash([]);
		if (isActive) {
			const [x = 0, y = 0] = bounds[0] ?? [];
			drawLabel(
				screen,
				'相机中心范围',
				screen.px(x) + 6,
				screen.py(y) - 6,
				state.fontFamily,
				{ color: '#a5f3fc' }
			);
			if (state.tool === 'select')
				drawVertexHandles(screen, [bounds], true, state.selectedVertex);
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
		context.restore();
	}
}

function drawDraft(screen: IScreen, state: IMapOverlayState) {
	const { draft } = state;
	if (!draft) return;
	const { context } = screen;
	context.save();
	if (draft.kind === 'pen') {
		const points = [
			...draft.points,
			...(draft.cursor ? [draft.cursor] : []),
		].map(({ x, y }) => [x, y]);
		const color =
			state.mode === 'map'
				? OVERLAY_COLORS.camera
				: draft.isClosed
					? OVERLAY_COLORS.solid
					: OVERLAY_COLORS.edge;
		if (draft.isClosed && points.length >= 3) {
			context.fillStyle = 'rgba(239, 68, 68, 0.15)';
			context.beginPath();
			tracePath(screen, points, true);
			context.fill();
		}
		strokeWithHalo(screen, color, 2, () => {
			context.beginPath();
			tracePath(screen, points, false);
		});
		draft.points.forEach((point, index) =>
			drawHandle(screen, point, index === 0 && draft.points.length >= 2)
		);
	} else if (draft.kind === 'rect') {
		const color =
			draft.tone === 'camera'
				? OVERLAY_COLORS.camera
				: draft.tone === 'erase'
					? OVERLAY_COLORS.erase
					: draft.tone === 'slope'
						? OVERLAY_COLORS.slopeUp
						: OVERLAY_COLORS.solid;
		context.setLineDash([6, 4]);
		strokeWithHalo(screen, color, 2, () => traceRect(screen, draft.rect));
		const box = screenRect(screen, draft.rect);
		drawLabel(
			screen,
			`${formatMapNumber(draft.rect.maxX - draft.rect.minX)}×${formatMapNumber(draft.rect.maxY - draft.rect.minY)}`,
			box.left + 4,
			box.top - 6,
			state.fontFamily
		);
	} else {
		strokeWithHalo(screen, OVERLAY_COLORS.solid, 2, () => {
			context.beginPath();
			context.arc(
				screen.px(draft.center.x),
				screen.py(draft.center.y),
				draft.radius * screen.scale,
				0,
				Math.PI * 2
			);
		});
		drawLabel(
			screen,
			`r ${formatMapNumber(draft.radius)}`,
			screen.px(draft.center.x) + 6,
			screen.py(draft.center.y) - 6,
			state.fontFamily
		);
	}
	context.restore();
}

function drawBrush(screen: IScreen, state: IMapOverlayState) {
	const preview = state.brushPreview;
	if (!preview) return;
	const { context, scale } = screen;
	const path = new Path2D();
	for (const cell of preview.cells)
		path.rect(screen.px(cell.x), screen.py(cell.y + 1), scale, scale);
	context.save();
	context.fillStyle =
		preview.kind === 'erase'
			? 'rgba(244, 63, 94, 0.25)'
			: preview.kind === 'picker'
				? 'rgba(255, 255, 255, 0.2)'
				: preview.slope >= 0
					? 'rgba(14, 165, 233, 0.3)'
					: 'rgba(249, 115, 22, 0.3)';
	context.fill(path);
	context.strokeStyle =
		preview.kind === 'erase' ? OVERLAY_COLORS.erase : '#ffffff';
	context.lineWidth = 1.5;
	context.stroke(path);
	context.restore();
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
	drawLayers(screen, state);
	drawColliders(screen, state);
	drawCamera(screen, state);
	drawObjects(screen, state);
	drawSpawns(screen, state);
	drawBrush(screen, state);
	drawDraft(screen, state);
	const { marquee } = state;
	if (marquee) {
		context.save();
		context.fillStyle = 'rgba(96, 165, 250, 0.12)';
		const box = screenRect(screen, marquee);
		context.fillRect(box.left, box.top, box.width, box.height);
		context.setLineDash([5, 4]);
		strokeWithHalo(screen, OVERLAY_COLORS.marquee, 1.25, () =>
			traceRect(screen, marquee)
		);
		context.restore();
	}
}
