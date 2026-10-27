'use client';

import { cn } from '@heroui/theme';
import {
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type Ref,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from 'react';

import type {
	IDayMap,
	TDayMapCollider,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	getDayMapAssetReferences,
	resolveDayMapAssetPath,
} from '@/domain/resourcePack/dayMapAssets';

import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

import {
	formatMapNumber,
	formatSlopeAngle,
	type IMapPoint,
	type IMapRect,
	type IMapVertexSelection,
	type IMapView,
	type IMapViewOptions,
	MAP_ENTITY_KIND_BY_MODE,
	MAP_ZOOM_MAX_PX_PER_UNIT,
	MAP_ZOOM_MIN_PX_PER_UNIT,
	type TColliderTarget,
	type TMapEntityKind,
	type TMapMode,
	type TMapTool,
} from './dayMapEditorModel';
import {
	addCollider,
	addObject,
	addSpawn,
	applyHeightChanges,
	createHeightIndex,
	getCellKey,
	getTargetWorldColliders,
	getVertexPaths,
	insertVertex,
	isVertexPathClosed,
	moveEntities,
	patchLayer,
	replaceCollider,
	setVertex,
} from './dayMapEdits';
import {
	clampMapCoordinate,
	clampPointToPolygon,
	doRectsIntersect,
	getBrushOffsets,
	getCellAt,
	getColliderRect,
	getDistanceToSegment,
	getLayerRect,
	getLineCells,
	getMapContentRect,
	getObjectRect,
	getPrefabIndex,
	getRectCells,
	hitTestPoint,
	hitTestRectHandle,
	isColliderHit,
	isPointInPolygon,
	isPointInRect,
	normalizeRect,
	projectToSegment,
	RECT_HANDLE_CURSORS,
	rectToPolygon,
	resizeRectWithHandle,
	roundMapValue,
	screenToWorld,
	snapPoint,
	type TRectHandle,
} from './dayMapSpatial';
import { isEditableTarget, isOverlayActive } from './mapShortcuts';
import { type MapViewportStore } from './mapViewportStore';
import {
	COLLIDER_LABELS,
	drawMapOverlay,
	type IMapOverlayState,
	type IOverlayBrushPreview,
	type TOverlayDraft,
} from './render/drawMapOverlay';
import {
	createSceneBuilder,
	getSceneDrawOrder,
	type TSceneBuilder,
} from './render/sceneGeometry';
import {
	createSceneRenderer,
	type ISceneDrawItem,
	type ISceneRendererHandle,
} from './render/sceneRenderer';

export interface IDayMapViewportHandle {
	cancelGesture(): void;
	fit(): void;
	/** 缩放到刚好容纳该范围。 */
	fitRect(rect: IMapRect): void;
	/** 当前视图中心（世界坐标），用于导入图层的默认位置。 */
	getViewCenter(): IMapPoint;
	/** 范围已可见时不动，否则平移到中心；放不下时再缩放。 */
	revealRect(rect: IMapRect): void;
	zoomBy(factor: number): void;
	zoomTo(scale: number): void;
}

interface IProps {
	activeLayerIndex: number;
	assetUrls: Readonly<Record<string, string>>;
	brushSize: number;
	colliderTarget: TColliderTarget;
	hiddenLayers: ReadonlySet<number>;
	isReadOnly: boolean;
	isReducedMotion: boolean;
	map: IDayMap;
	mode: TMapMode;
	options: IMapViewOptions;
	packLabel: string;
	placePrefab: string | null;
	ref?: Ref<IDayMapViewportHandle>;
	selectedVertex: IMapVertexSelection | null;
	selection: ReadonlySet<number>;
	slope: number;
	snapStep: number;
	store: MapViewportStore;
	tool: TMapTool;
	onActiveLayerChange(index: number): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onDropFiles(files: File[], world: IMapPoint): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
	onSelectionChange(kind: TMapEntityKind, indices: ReadonlySet<number>): void;
	onSlopePick(slope: number): void;
	onToolChange(tool: TMapTool): void;
	onVertexSelect(vertex: IMapVertexSelection | null): void;
}

type TPenPurpose = 'camera' | 'edge' | 'polygon';

interface IPenState {
	/** 选中多边形时按住 Shift 开始绘制，结果作为洞加入该多边形。 */
	holeOf: number | null;
	points: IMapPoint[];
	purpose: TPenPurpose;
}

type TGesture =
	| {
			kind: 'pan';
			pointerId: number;
			startClient: IMapPoint;
			startView: IMapView;
	  }
	| {
			kind: 'pinch';
			startCenter: IMapPoint;
			startDistance: number;
			startView: IMapView;
	  }
	| {
			base: IDayMap;
			changes: Map<string, number | null>;
			isErase: boolean;
			kind: 'stroke';
			lastCell: IMapPoint;
			pointerId: number;
	  }
	| {
			base: IDayMap;
			current: IMapPoint;
			isErase: boolean;
			kind: 'rect';
			pointerId: number;
			purpose: 'camera' | 'collider' | 'height';
			start: IMapPoint;
	  }
	| {
			base: IDayMap;
			center: IMapPoint;
			current: IMapPoint;
			kind: 'circle';
			pointerId: number;
	  }
	| {
			base: IDayMap;
			clickedIndex: number;
			entity: TMapEntityKind | 'camera' | 'layer';
			hasMoved: boolean;
			indices: ReadonlySet<number>;
			kind: 'move';
			pointerId: number;
			shouldCollapseSelection: boolean;
			startClient: IMapPoint;
			startWorld: IMapPoint;
	  }
	| {
			base: IDayMap;
			index: number;
			kind: 'vertex';
			owner: 'camera' | 'collider';
			pointerId: number;
			vertex: IMapVertexSelection;
	  }
	| {
			base: IDayMap;
			handle: TRectHandle;
			index: number;
			kind: 'resize';
			pointerId: number;
			startRect: IMapRect;
	  }
	| { base: IDayMap; index: number; kind: 'radius'; pointerId: number }
	| {
			base: IDayMap;
			current: IMapPoint;
			entity: TMapEntityKind;
			initial: ReadonlySet<number>;
			kind: 'marquee';
			pointerId: number;
			preview: ReadonlySet<number>;
			start: IMapPoint;
	  };

interface IHoverState {
	entity: number;
	handle: TRectHandle | null;
	isCameraBody: boolean;
	layer: number;
	vertex: IMapVertexSelection | null;
	world: IMapPoint | null;
}

const DRAG_THRESHOLD_PX = 3;
const HIT_TOLERANCE_PX = 6;
const PEN_CLOSE_RADIUS_PX = 9;
const EMPTY_SET: ReadonlySet<number> = new Set();
const EMPTY_HOVER: IHoverState = {
	entity: -1,
	handle: null,
	isCameraBody: false,
	layer: -1,
	vertex: null,
	world: null,
};

function clampScale(scale: number) {
	return Math.min(
		MAP_ZOOM_MAX_PX_PER_UNIT,
		Math.max(MAP_ZOOM_MIN_PX_PER_UNIT, scale)
	);
}

function easeOutCubic(value: number) {
	return 1 - (1 - value) ** 3;
}

/** 区分鼠标滚轮（缩放）和触控板双指滑动（平移）。 */
function classifyWheel(
	event: WheelEvent,
	previous: { kind: 'pan' | 'zoom'; time: number } | null
): 'pan' | 'zoom' {
	if (event.ctrlKey || event.metaKey) return 'zoom';
	if (previous && event.timeStamp - previous.time < 120) return previous.kind;
	if (event.deltaMode !== 0) return 'zoom';
	if (event.deltaX === 0 && Math.abs(event.deltaY) >= 50) return 'zoom';
	return 'pan';
}

const heightIndexCache = new WeakMap<object, Map<string, number>>();

function getHeightIndex(map: IDayMap) {
	const key = map.height ?? map;
	let index = heightIndexCache.get(key);
	if (!index) {
		index = createHeightIndex(map);
		heightIndexCache.set(key, index);
	}
	return index;
}

function toPoint([x = 0, y = 0]: readonly number[]): IMapPoint {
	return { x, y };
}

export default function DayMapViewport(props: IProps) {
	const { ref, store } = props;
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneHostRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<ISceneRendererHandle | null>(null);
	const builderRef = useRef<TSceneBuilder | null>(null);
	builderRef.current ??= createSceneBuilder();
	const propsRef = useRef(props);
	propsRef.current = props;
	const viewRef = useRef<IMapView>({ scale: 12, x: 0, y: 0 });
	const sizeRef = useRef({ height: 0, width: 0 });
	const hasFittedRef = useRef(false);
	const gestureRef = useRef<TGesture | null>(null);
	const penRef = useRef<IPenState | null>(null);
	const draftRef = useRef<IDayMap | null>(null);
	const pendingRef = useRef<IDayMap | null>(null);
	const hoverRef = useRef<IHoverState>({ ...EMPTY_HOVER });
	const isSpaceHeldRef = useRef(false);
	const isAltHeldRef = useRef(false);
	const touchesRef = useRef(new Map<number, IMapPoint>());
	const frameRef = useRef(0);
	const animationRef = useRef<{
		duration: number;
		from: IMapView;
		start: number;
		to: IMapView;
	} | null>(null);
	const wheelRef = useRef<{ kind: 'pan' | 'zoom'; time: number } | null>(
		null
	);
	const fontFamilyRef = useRef('sans-serif');
	const lastSceneRef = useRef<{
		height: number;
		items: readonly ISceneDrawItem[];
		pixelRatio: number;
		renderer: ISceneRendererHandle['renderer'];
		textureVersion: number;
		view: IMapView;
		width: number;
	} | null>(null);

	/* ── 渲染 ─────────────────────────────────────────── */

	function readShownMap() {
		return draftRef.current ?? pendingRef.current ?? propsRef.current.map;
	}

	function scheduleRender() {
		if (frameRef.current) return;
		frameRef.current = requestAnimationFrame(renderFrame);
	}

	function stepAnimation(now: number) {
		const animation = animationRef.current;
		if (!animation) return;
		const progress = Math.min(
			1,
			(now - animation.start) / animation.duration
		);
		const eased = easeOutCubic(progress);
		const fromLog = Math.log(animation.from.scale);
		const toLog = Math.log(animation.to.scale);
		viewRef.current = {
			scale: Math.exp(fromLog + (toLog - fromLog) * eased),
			x: animation.from.x + (animation.to.x - animation.from.x) * eased,
			y: animation.from.y + (animation.to.y - animation.from.y) * eased,
		};
		if (progress >= 1) animationRef.current = null;
	}

	function readSnap(isFree: boolean) {
		return isFree || isAltHeldRef.current ? 0 : propsRef.current.snapStep;
	}

	function getDraft(): TOverlayDraft | null {
		const pen = penRef.current;
		if (pen)
			return {
				cursor: hoverRef.current.world
					? snapPoint(hoverRef.current.world, readSnap(false))
					: null,
				isClosed: pen.purpose !== 'edge',
				kind: 'pen',
				points: pen.points,
			};
		const gesture = gestureRef.current;
		if (gesture?.kind === 'rect') {
			const rect =
				gesture.purpose === 'height'
					? getCellRect(gesture.start, gesture.current)
					: normalizeRect(gesture.start, gesture.current);
			return {
				kind: 'rect',
				rect,
				tone:
					gesture.purpose === 'camera'
						? 'camera'
						: gesture.purpose === 'collider'
							? 'collider'
							: gesture.isErase
								? 'erase'
								: 'slope',
			};
		}
		if (gesture?.kind === 'circle')
			return {
				center: gesture.center,
				kind: 'circle',
				radius: Math.hypot(
					gesture.current.x - gesture.center.x,
					gesture.current.y - gesture.center.y
				),
			};
		return null;
	}

	function getCellRect(a: IMapPoint, b: IMapPoint): IMapRect {
		const rect = normalizeRect(getCellAt(a), getCellAt(b));
		return { ...rect, maxX: rect.maxX + 1, maxY: rect.maxY + 1 };
	}

	function getBrushPreview(): IOverlayBrushPreview | null {
		const p = propsRef.current;
		const world = hoverRef.current.world;
		const gesture = gestureRef.current;
		if (
			p.mode !== 'height' ||
			!world ||
			gesture?.kind === 'rect' ||
			gesture?.kind === 'pan'
		)
			return null;
		const cell = getCellAt(world);
		if (p.tool === 'picker' || isAltHeldRef.current)
			return { cells: [cell], kind: 'picker', slope: 0 };
		if (p.tool !== 'brush' && p.tool !== 'eraser') return null;
		return {
			cells: getBrushOffsets(p.brushSize).map((offset) => ({
				x: cell.x + offset.x,
				y: cell.y + offset.y,
			})),
			kind:
				p.tool === 'eraser' ||
				(gesture?.kind === 'stroke' && gesture.isErase)
					? 'erase'
					: 'paint',
			slope: p.slope,
		};
	}

	function describeHover(map: IDayMap) {
		const p = propsRef.current;
		const hover = hoverRef.current;
		if (!hover.world) return '';
		if (p.mode === 'height') {
			const slope = getHeightIndex(map).get(
				getCellKey(Math.floor(hover.world.x), Math.floor(hover.world.y))
			);
			return slope === undefined
				? '平地'
				: `坡度 ${formatMapNumber(slope)} · ${formatSlopeAngle(slope)}`;
		}
		if (p.mode === 'layer' && hover.layer >= 0)
			return `图层 ${map.layers[hover.layer]?.name ?? ''}`;
		if (hover.entity < 0) return '';
		if (p.mode === 'spawn')
			return `出生点 ${map.spawnMarkers[hover.entity]?.name ?? ''}`;
		if (p.mode === 'object') {
			const object = map.objects[hover.entity];
			return object ? `${object.name ?? '物件'} · ${object.prefab}` : '';
		}
		if (p.mode === 'collision') {
			const collider = getTargetWorldColliders(map, p.colliderTarget)[
				hover.entity
			];
			return collider
				? `${collider.name ?? COLLIDER_LABELS[collider.shape]} · ${COLLIDER_LABELS[collider.shape]}`
				: '';
		}
		return '';
	}

	function updateCursor() {
		const container = containerRef.current;
		if (!container) return;
		const p = propsRef.current;
		const gesture = gestureRef.current;
		const hover = hoverRef.current;
		let cursor = 'crosshair';
		if (gesture?.kind === 'pan' || gesture?.kind === 'pinch')
			cursor = 'grabbing';
		else if (isSpaceHeldRef.current || p.tool === 'hand') cursor = 'grab';
		else if (gesture?.kind === 'move' || gesture?.kind === 'vertex')
			cursor = 'move';
		else if (gesture?.kind === 'resize')
			cursor = RECT_HANDLE_CURSORS[gesture.handle];
		else if (hover.handle) cursor = RECT_HANDLE_CURSORS[hover.handle];
		else if (p.isReadOnly) cursor = 'default';
		else if (hover.vertex) cursor = 'move';
		else if (
			p.tool === 'select' &&
			(hover.entity >= 0 ||
				hover.isCameraBody ||
				(p.mode === 'layer' && hover.layer >= 0))
		)
			cursor = 'move';
		else if (p.tool === 'select') cursor = 'default';
		else if (
			p.tool === 'picker' ||
			(p.mode === 'height' && isAltHeldRef.current)
		)
			cursor = 'copy';
		if (container.style.cursor !== cursor) container.style.cursor = cursor;
	}

	function renderFrame(now: number) {
		frameRef.current = 0;
		const handle = rendererRef.current;
		const overlay = overlayRef.current;
		const { height, width } = sizeRef.current;
		if (!handle || !overlay || width <= 0 || height <= 0) return;
		stepAnimation(now);
		const gesture = gestureRef.current;
		if (gesture?.kind === 'stroke')
			draftRef.current = applyHeightChanges(
				gesture.base,
				gesture.changes
			);
		const p = propsRef.current;
		const map = readShownMap();
		const view = viewRef.current;
		const pixelRatio = window.devicePixelRatio || 1;
		const builder = builderRef.current;
		if (builder) {
			const segments = builder({
				assetUrls: p.assetUrls,
				hiddenLayers: p.hiddenLayers,
				map,
				packLabel: p.packLabel,
			});
			const shouldDim =
				p.mode === 'layer' && p.options.shouldDimInactiveLayers;
			const items: ISceneDrawItem[] = segments.map((segment) => ({
				alpha:
					shouldDim && segment.layerIndex !== p.activeLayerIndex
						? 0.28
						: 1,
				geometry: segment.geometry,
			}));
			// 只有覆盖层变化（悬停、选择）时不重绘场景，画布保留上一帧。
			const last = lastSceneRef.current;
			const textureVersion = handle.renderer.textureStore.getVersion();
			const isSceneUnchanged =
				last !== null &&
				last.renderer === handle.renderer &&
				last.textureVersion === textureVersion &&
				last.width === width &&
				last.height === height &&
				last.pixelRatio === pixelRatio &&
				last.view.x === view.x &&
				last.view.y === view.y &&
				last.view.scale === view.scale &&
				last.items.length === items.length &&
				last.items.every(
					(item, index) =>
						item.geometry === items[index]?.geometry &&
						item.alpha === items[index]?.alpha
				);
			if (!isSceneUnchanged) {
				handle.renderer.render({
					height,
					items,
					pixelRatio,
					view,
					width,
				});
				lastSceneRef.current = {
					height,
					items,
					pixelRatio,
					renderer: handle.renderer,
					textureVersion,
					view,
					width,
				};
			}
		}
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		const hover = hoverRef.current;
		const overlayState: IMapOverlayState = {
			activeLayerIndex: p.activeLayerIndex,
			brushPreview: getBrushPreview(),
			cameraPreviewCenter:
				p.mode === 'map' && hover.world && !gesture
					? clampPointToPolygon(hover.world, map.camera.bounds)
					: null,
			colliderTarget: p.colliderTarget,
			draft: getDraft(),
			fontFamily: fontFamilyRef.current,
			hiddenLayers: p.hiddenLayers,
			hoveredHandle:
				gesture?.kind === 'resize' ? gesture.handle : hover.handle,
			hoveredIndex:
				kind && !gesture && hover.entity >= 0 ? hover.entity : null,
			map,
			marquee:
				gesture?.kind === 'marquee'
					? normalizeRect(gesture.start, gesture.current)
					: null,
			mode: p.mode,
			options: p.options,
			selectedVertex:
				gesture?.kind === 'vertex' ? gesture.vertex : p.selectedVertex,
			selection:
				gesture?.kind === 'marquee'
					? gesture.preview
					: kind
						? p.selection
						: EMPTY_SET,
			tool: p.tool,
		};
		drawMapOverlay(
			overlay,
			{ height, pixelRatio, view, width },
			overlayState
		);
		updateCursor();
		store.update({
			cursor: hover.world,
			detail: describeHover(map),
			renderer: handle.renderer.kind,
			scale: view.scale,
		});
		if (animationRef.current) scheduleRender();
	}

	/* ── 视图 ─────────────────────────────────────────── */

	function setView(next: IMapView, isAnimated = false) {
		const target = {
			scale: clampScale(next.scale),
			x: Math.max(-5000, Math.min(5000, next.x)),
			y: Math.max(-5000, Math.min(5000, next.y)),
		};
		if (isAnimated && !propsRef.current.isReducedMotion) {
			animationRef.current = {
				duration: 220,
				from: viewRef.current,
				start: performance.now(),
				to: target,
			};
		} else {
			animationRef.current = null;
			viewRef.current = target;
		}
		scheduleRender();
	}

	function zoomAround(factor: number, screenPoint: IMapPoint | null) {
		animationRef.current = null;
		const view = viewRef.current;
		const { height, width } = sizeRef.current;
		const anchor = screenPoint ?? { x: width / 2, y: height / 2 };
		const before = screenToWorld(view, width, height, anchor);
		const scale = clampScale(view.scale * factor);
		const after = screenToWorld({ ...view, scale }, width, height, anchor);
		setView({
			scale,
			x: view.x + before.x - after.x,
			y: view.y + before.y - after.y,
		});
	}

	function focusRect(rect: IMapRect, isAnimated = true, padding = 48) {
		const { height, width } = sizeRef.current;
		if (width <= 0 || height <= 0) return;
		const rectWidth = Math.max(1, rect.maxX - rect.minX);
		const rectHeight = Math.max(1, rect.maxY - rect.minY);
		setView(
			{
				scale: Math.min(
					96,
					(width - padding * 2) / rectWidth,
					(height - padding * 2) / rectHeight
				),
				x: (rect.minX + rect.maxX) / 2,
				y: (rect.minY + rect.maxY) / 2,
			},
			isAnimated
		);
	}

	/** 定位整张地图；内容很少时至少显示 16×10 格。 */
	function fit(isAnimated = true) {
		const rect = getMapContentRect(readShownMap());
		const centerX = (rect.minX + rect.maxX) / 2;
		const centerY = (rect.minY + rect.maxY) / 2;
		const halfWidth = Math.max(8, (rect.maxX - rect.minX) / 2);
		const halfHeight = Math.max(5, (rect.maxY - rect.minY) / 2);
		focusRect(
			{
				maxX: centerX + halfWidth,
				maxY: centerY + halfHeight,
				minX: centerX - halfWidth,
				minY: centerY - halfHeight,
			},
			isAnimated
		);
	}

	useImperativeHandle(ref, () => ({
		cancelGesture,
		fit: () => fit(),
		fitRect: (rect) => focusRect(rect),
		getViewCenter: () => ({ x: viewRef.current.x, y: viewRef.current.y }),
		revealRect: (rect) => {
			const view = viewRef.current;
			const { height, width } = sizeRef.current;
			const visibleWidth = width / view.scale;
			const visibleHeight = height / view.scale;
			const isVisible =
				rect.minX >= view.x - visibleWidth / 2 &&
				rect.maxX <= view.x + visibleWidth / 2 &&
				rect.minY >= view.y - visibleHeight / 2 &&
				rect.maxY <= view.y + visibleHeight / 2;
			if (isVisible) return;
			if (
				(rect.maxX - rect.minX) * 1.2 < visibleWidth &&
				(rect.maxY - rect.minY) * 1.2 < visibleHeight
			)
				setView(
					{
						scale: view.scale,
						x: (rect.minX + rect.maxX) / 2,
						y: (rect.minY + rect.maxY) / 2,
					},
					true
				);
			else focusRect(rect);
		},
		zoomBy: (factor) => {
			const view = viewRef.current;
			setView({ ...view, scale: view.scale * factor }, true);
		},
		zoomTo: (scale) => setView({ ...viewRef.current, scale }, true),
	}));

	/* ── 提交 ─────────────────────────────────────────── */

	function commit(next: IDayMap, base: IDayMap) {
		if (next === base) {
			draftRef.current = null;
			scheduleRender();
			return true;
		}
		const result = propsRef.current.onCommit(next);
		draftRef.current = null;
		if (result.isSuccess) pendingRef.current = next;
		else propsRef.current.onNotice(result.error ?? '保存失败。', 'error');
		scheduleRender();
		return result.isSuccess;
	}

	function commitInsert(
		result: { indices: number[]; map: IDayMap } | string,
		base: IDayMap,
		kind: TMapEntityKind
	) {
		if (typeof result === 'string') {
			propsRef.current.onNotice(result, 'error');
			return;
		}
		if (commit(result.map, base))
			propsRef.current.onSelectionChange(kind, new Set(result.indices));
	}

	function cancelGesture() {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		penRef.current = null;
		draftRef.current = null;
		if (gesture && 'pointerId' in gesture)
			releaseCapture(gesture.pointerId);
		scheduleRender();
	}

	/* ── 命中测试 ─────────────────────────────────────── */

	function readPointer(event: { clientX: number; clientY: number }) {
		const rect = containerRef.current?.getBoundingClientRect();
		const screen = {
			x: event.clientX - (rect?.left ?? 0),
			y: event.clientY - (rect?.top ?? 0),
		};
		const { height, width } = sizeRef.current;
		const world = screenToWorld(viewRef.current, width, height, screen);
		return {
			screen,
			world: {
				x: clampMapCoordinate(world.x),
				y: clampMapCoordinate(world.y),
			},
		};
	}

	function hitTestLayer(map: IDayMap, world: IMapPoint) {
		const p = propsRef.current;
		const order = getSceneDrawOrder(map).filter(
			(item) => item.kind === 'layer'
		);
		for (let i = order.length - 1; i >= 0; i--) {
			const index = order[i]?.index ?? -1;
			const layer = map.layers[index];
			if (
				layer &&
				!p.hiddenLayers.has(index) &&
				isPointInRect(world, getLayerRect(map, layer))
			)
				return index;
		}
		return -1;
	}

	function hitTestEntity(
		map: IDayMap,
		kind: TMapEntityKind,
		world: IMapPoint
	) {
		const p = propsRef.current;
		const scale = viewRef.current.scale;
		if (kind === 'spawn') {
			const radius = 10 / scale;
			for (let i = map.spawnMarkers.length - 1; i >= 0; i--) {
				const marker = map.spawnMarkers[i];
				if (
					marker &&
					Math.hypot(marker.x - world.x, marker.y - world.y) <= radius
				)
					return i;
			}
			return -1;
		}
		if (kind === 'object') {
			const prefabs = getPrefabIndex(map);
			const order = getSceneDrawOrder(map).filter(
				(item) => item.kind === 'object'
			);
			for (let i = order.length - 1; i >= 0; i--) {
				const index = order[i]?.index ?? -1;
				const object = map.objects[index];
				if (
					object &&
					isPointInRect(
						world,
						getObjectRect(object, prefabs.get(object.prefab))
					)
				)
					return index;
			}
			return -1;
		}
		const colliders = getTargetWorldColliders(map, p.colliderTarget);
		for (let i = colliders.length - 1; i >= 0; i--) {
			const collider = colliders[i];
			if (
				collider &&
				isColliderHit(collider, world, HIT_TOLERANCE_PX / scale)
			)
				return i;
		}
		return -1;
	}

	function collectEntitiesInRect(
		map: IDayMap,
		kind: TMapEntityKind,
		rect: IMapRect
	) {
		const hits: number[] = [];
		if (kind === 'spawn')
			map.spawnMarkers.forEach((marker, index) => {
				if (isPointInRect(marker, rect)) hits.push(index);
			});
		else if (kind === 'object') {
			const prefabs = getPrefabIndex(map);
			map.objects.forEach((object, index) => {
				if (
					doRectsIntersect(
						rect,
						getObjectRect(object, prefabs.get(object.prefab))
					)
				)
					hits.push(index);
			});
		} else
			getTargetWorldColliders(
				map,
				propsRef.current.colliderTarget
			).forEach((collider, index) => {
				if (doRectsIntersect(rect, getColliderRect(collider)))
					hits.push(index);
			});
		return hits;
	}

	/** 当前可逐点编辑的路径：选中的单个碰撞，或地图模式下的相机多边形。 */
	function getEditablePaths(
		map: IDayMap
	): {
		index: number;
		isClosed: boolean;
		owner: 'camera' | 'collider';
		paths: number[][][];
	} | null {
		const p = propsRef.current;
		if (p.tool !== 'select') return null;
		if (p.mode === 'map')
			return map.camera.shouldFollow
				? {
						index: 0,
						isClosed: true,
						owner: 'camera',
						paths: [map.camera.bounds],
					}
				: null;
		if (p.mode !== 'collision' || p.selection.size !== 1) return null;
		const [index = -1] = p.selection;
		const collider = getTargetWorldColliders(map, p.colliderTarget)[index];
		const paths = collider && getVertexPaths(collider);
		return paths && collider
			? {
					index,
					isClosed: isVertexPathClosed(collider),
					owner: 'collider',
					paths,
				}
			: null;
	}

	function hitTestVertex(
		map: IDayMap,
		world: IMapPoint
	): IMapVertexSelection | null {
		const editable = getEditablePaths(map);
		if (!editable) return null;
		const scale = viewRef.current.scale;
		for (
			let pathIndex = editable.paths.length - 1;
			pathIndex >= 0;
			pathIndex--
		) {
			const pointIndex = hitTestPoint(
				editable.paths[pathIndex] ?? [],
				world,
				scale
			);
			if (pointIndex >= 0) return { pathIndex, pointIndex };
		}
		return null;
	}

	function getSelectedCollider(
		map: IDayMap
	): { collider: TDayMapCollider; index: number } | null {
		const p = propsRef.current;
		if (
			p.mode !== 'collision' ||
			p.tool !== 'select' ||
			p.selection.size !== 1
		)
			return null;
		const [index = -1] = p.selection;
		const collider = getTargetWorldColliders(map, p.colliderTarget)[index];
		return collider ? { collider, index } : null;
	}

	function updateHover(world: IMapPoint | null) {
		const p = propsRef.current;
		const map = readShownMap();
		const hover: IHoverState = { ...EMPTY_HOVER, world };
		hoverRef.current = hover;
		if (!world || p.isReadOnly || p.tool === 'hand') return;
		const scale = viewRef.current.scale;
		hover.vertex = hitTestVertex(map, world);
		if (hover.vertex) return;
		const selected = getSelectedCollider(map);
		if (selected?.collider.shape === 'box' && !selected.collider.rotation)
			hover.handle = hitTestRectHandle(
				getColliderRect(selected.collider),
				world,
				scale
			);
		if (selected?.collider.shape === 'circle') {
			const { radius, x, y } = selected.collider;
			if (hitTestPoint([[x + radius, y]], world, scale) >= 0)
				hover.handle = 'e';
		}
		if (hover.handle) return;
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (kind && (p.tool === 'select' || p.tool === 'place'))
			hover.entity = hitTestEntity(map, kind, world);
		if (p.mode === 'layer') hover.layer = hitTestLayer(map, world);
		if (p.mode === 'map' && p.tool === 'select')
			hover.isCameraBody =
				map.camera.shouldFollow &&
				isPointInPolygon(world, map.camera.bounds);
	}

	/* ── 指针 ─────────────────────────────────────────── */

	function releaseCapture(pointerId: number) {
		const container = containerRef.current;
		if (container?.hasPointerCapture(pointerId))
			container.releasePointerCapture(pointerId);
	}

	function stampStroke(
		gesture: Extract<TGesture, { kind: 'stroke' }>,
		cell: IMapPoint
	) {
		const p = propsRef.current;
		for (const offset of getBrushOffsets(p.brushSize))
			gesture.changes.set(
				getCellKey(cell.x + offset.x, cell.y + offset.y),
				gesture.isErase ? null : p.slope
			);
	}

	function pickSlope(world: IMapPoint, shouldReturnToBrush: boolean) {
		const p = propsRef.current;
		const cell = getCellAt(world);
		p.onSlopePick(
			getHeightIndex(readShownMap()).get(getCellKey(cell.x, cell.y)) ?? 0
		);
		if (shouldReturnToBrush) p.onToolChange('brush');
	}

	function startMove(
		event: PointerEvent<HTMLDivElement>,
		world: IMapPoint,
		entity: TMapEntityKind | 'camera' | 'layer',
		clickedIndex: number,
		indices: ReadonlySet<number>,
		shouldCollapseSelection: boolean
	) {
		gestureRef.current = {
			base: readShownMap(),
			clickedIndex,
			entity,
			hasMoved: false,
			indices,
			kind: 'move',
			pointerId: event.pointerId,
			shouldCollapseSelection,
			startClient: { x: event.clientX, y: event.clientY },
			startWorld: world,
		};
	}

	function startEntityPointer(
		event: PointerEvent<HTMLDivElement>,
		world: IMapPoint,
		kind: TMapEntityKind
	) {
		const p = propsRef.current;
		const map = readShownMap();
		const hit = hitTestEntity(map, kind, world);
		if (p.tool === 'place') {
			if (hit >= 0) {
				p.onSelectionChange(kind, new Set([hit]));
				startMove(event, world, kind, hit, new Set([hit]), false);
				return;
			}
			const point = snapPoint(world, readSnap(event.altKey));
			if (kind === 'spawn')
				commitInsert(addSpawn(map, point.x, point.y), map, kind);
			else if (p.placePrefab)
				commitInsert(
					addObject(map, p.placePrefab, point.x, point.y),
					map,
					kind
				);
			else p.onNotice('请先在物件模板库中选择要放置的模板。', 'error');
			return;
		}
		if (p.tool !== 'select') return;
		const isToggle = event.ctrlKey || event.metaKey;
		if (hit >= 0) {
			if (event.shiftKey || isToggle) {
				const next = new Set(p.selection);
				if (isToggle && next.has(hit)) next.delete(hit);
				else next.add(hit);
				p.onSelectionChange(kind, next);
				if (next.has(hit))
					startMove(event, world, kind, hit, next, false);
				return;
			}
			const isSelected = p.selection.has(hit);
			const indices = isSelected ? p.selection : new Set([hit]);
			if (!isSelected) p.onSelectionChange(kind, indices);
			p.onVertexSelect(null);
			startMove(
				event,
				world,
				kind,
				hit,
				indices,
				isSelected && p.selection.size > 1
			);
			return;
		}
		const initial = event.shiftKey || isToggle ? p.selection : EMPTY_SET;
		if (initial.size === 0) p.onSelectionChange(kind, EMPTY_SET);
		p.onVertexSelect(null);
		gestureRef.current = {
			base: map,
			current: world,
			entity: kind,
			initial,
			kind: 'marquee',
			pointerId: event.pointerId,
			preview: initial,
			start: world,
		};
	}

	/** 逐点绘制：单击加点；单击起点闭合并结束。返回是否已结束。 */
	function addPenPoint(
		world: IMapPoint,
		purpose: TPenPurpose,
		shiftKey: boolean,
		altKey: boolean
	) {
		const p = propsRef.current;
		const point = snapPoint(world, readSnap(altKey));
		const pen = penRef.current;
		if (!pen || pen.purpose !== purpose) {
			const selected = getSelectedCollider(readShownMap());
			penRef.current = {
				holeOf:
					purpose === 'polygon' &&
					shiftKey &&
					selected?.collider.shape === 'polygon'
						? selected.index
						: null,
				points: [point],
				purpose,
			};
			if (penRef.current.holeOf !== null)
				p.onNotice('正在绘制洞：结束后加入选中的多边形。', 'info');
			return;
		}
		const [first] = pen.points;
		const closeRadius = PEN_CLOSE_RADIUS_PX / viewRef.current.scale;
		if (
			first &&
			pen.points.length >= 2 &&
			Math.hypot(first.x - world.x, first.y - world.y) <= closeRadius
		) {
			finishPen(true);
			return;
		}
		const last = pen.points.at(-1);
		if (last && last.x === point.x && last.y === point.y) return;
		pen.points.push(point);
	}

	function finishPen(isClosedByClick: boolean) {
		const pen = penRef.current;
		penRef.current = null;
		if (!pen) return;
		const p = propsRef.current;
		const map = readShownMap();
		const points = pen.points.map(({ x, y }) => [
			roundMapValue(x),
			roundMapValue(y),
		]);
		if (pen.purpose === 'edge') {
			if (points.length < 2) {
				p.onNotice('折线至少需要 2 个点。', 'error');
				scheduleRender();
				return;
			}
			commitInsert(
				addCollider(map, p.colliderTarget, {
					points,
					shape: 'edge',
					...(isClosedByClick ? { closed: true } : {}),
				}),
				map,
				'collider'
			);
			return;
		}
		if (points.length < 3) {
			p.onNotice('多边形至少需要 3 个点。', 'error');
			scheduleRender();
			return;
		}
		if (pen.purpose === 'camera') {
			commit({ ...map, camera: { ...map.camera, bounds: points } }, map);
			return;
		}
		const host =
			pen.holeOf === null
				? null
				: getTargetWorldColliders(map, p.colliderTarget)[pen.holeOf];
		if (host?.shape === 'polygon' && pen.holeOf !== null) {
			commit(
				replaceCollider(map, p.colliderTarget, pen.holeOf, {
					...host,
					paths: [...host.paths, points],
				}),
				map
			);
			return;
		}
		commitInsert(
			addCollider(map, p.colliderTarget, {
				paths: [points],
				shape: 'polygon',
			}),
			map,
			'collider'
		);
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		const container = containerRef.current;
		if (!container || event.target !== event.currentTarget) return;
		if (event.pointerType === 'touch') {
			touchesRef.current.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			});
			if (touchesRef.current.size === 2) {
				const pen = penRef.current;
				cancelGesture();
				penRef.current = pen;
				const [a, b] = [...touchesRef.current.values()];
				if (a && b) {
					const rect = container.getBoundingClientRect();
					gestureRef.current = {
						kind: 'pinch',
						startCenter: {
							x: (a.x + b.x) / 2 - rect.left,
							y: (a.y + b.y) / 2 - rect.top,
						},
						startDistance: Math.max(
							1,
							Math.hypot(a.x - b.x, a.y - b.y)
						),
						startView: viewRef.current,
					};
				}
				return;
			}
			if (touchesRef.current.size > 2) return;
		}
		if (gestureRef.current) return;
		if (event.button !== 0 && event.button !== 1 && event.button !== 2)
			return;
		event.preventDefault();
		container.focus({ preventScroll: true });
		const p = propsRef.current;
		const { world } = readPointer(event);
		updateHover(world);
		container.setPointerCapture(event.pointerId);
		if (event.button === 1 || isSpaceHeldRef.current || p.tool === 'hand') {
			gestureRef.current = {
				kind: 'pan',
				pointerId: event.pointerId,
				startClient: { x: event.clientX, y: event.clientY },
				startView: viewRef.current,
			};
			animationRef.current = null;
			scheduleRender();
			return;
		}
		if (p.isReadOnly) {
			releaseCapture(event.pointerId);
			return;
		}
		startToolPointer(event, world, event.button === 2);
		if (!gestureRef.current) releaseCapture(event.pointerId);
		scheduleRender();
	}

	function startToolPointer(
		event: PointerEvent<HTMLDivElement>,
		world: IMapPoint,
		isRight: boolean
	) {
		const p = propsRef.current;
		const map = readShownMap();
		const pointerId = event.pointerId;
		if (p.mode === 'height') {
			if (p.tool === 'picker' || (event.altKey && !isRight)) {
				if (!isRight) pickSlope(world, p.tool === 'picker');
				return;
			}
			if (p.tool === 'rectangle') {
				gestureRef.current = {
					base: map,
					current: world,
					isErase: isRight,
					kind: 'rect',
					pointerId,
					purpose: 'height',
					start: world,
				};
				return;
			}
			if (p.tool === 'brush' || p.tool === 'eraser') {
				if (!(Math.abs(p.slope) <= 1)) {
					p.onNotice('坡度必须在 -1 到 1 之间。', 'error');
					return;
				}
				const gesture: Extract<TGesture, { kind: 'stroke' }> = {
					base: map,
					changes: new Map(),
					isErase: isRight || p.tool === 'eraser',
					kind: 'stroke',
					lastCell: getCellAt(world),
					pointerId,
				};
				stampStroke(gesture, gesture.lastCell);
				gestureRef.current = gesture;
			}
			return;
		}
		if (isRight) return;
		const hover = hoverRef.current;
		if (hover.vertex) {
			const editable = getEditablePaths(map);
			if (editable) {
				p.onVertexSelect(hover.vertex);
				gestureRef.current = {
					base: map,
					index: editable.index,
					kind: 'vertex',
					owner: editable.owner,
					pointerId,
					vertex: hover.vertex,
				};
			}
			return;
		}
		if (p.mode === 'layer') {
			if (p.tool !== 'select') return;
			const hit = hitTestLayer(map, world);
			if (hit < 0) return;
			p.onActiveLayerChange(hit);
			startMove(event, world, 'layer', hit, new Set([hit]), false);
			return;
		}
		if (p.mode === 'map') {
			if (p.tool === 'polygon')
				addPenPoint(world, 'camera', false, event.altKey);
			else if (p.tool === 'rectangle')
				gestureRef.current = {
					base: map,
					current: world,
					isErase: false,
					kind: 'rect',
					pointerId,
					purpose: 'camera',
					start: world,
				};
			else if (p.tool === 'select' && hover.isCameraBody) {
				p.onVertexSelect(null);
				startMove(event, world, 'camera', 0, EMPTY_SET, false);
			} else p.onVertexSelect(null);
			return;
		}
		if (p.mode === 'collision') {
			const selected = getSelectedCollider(map);
			if (selected && hover.handle) {
				gestureRef.current =
					selected.collider.shape === 'circle'
						? {
								base: map,
								index: selected.index,
								kind: 'radius',
								pointerId,
							}
						: {
								base: map,
								handle: hover.handle,
								index: selected.index,
								kind: 'resize',
								pointerId,
								startRect: getColliderRect(selected.collider),
							};
				return;
			}
			if (p.tool === 'polygon' || p.tool === 'edge') {
				addPenPoint(world, p.tool, event.shiftKey, event.altKey);
				return;
			}
			const start = snapPoint(world, readSnap(event.altKey));
			if (p.tool === 'rectangle') {
				gestureRef.current = {
					base: map,
					current: start,
					isErase: false,
					kind: 'rect',
					pointerId,
					purpose: 'collider',
					start,
				};
				return;
			}
			if (p.tool === 'circle') {
				gestureRef.current = {
					base: map,
					center: start,
					current: start,
					kind: 'circle',
					pointerId,
				};
				return;
			}
		}
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (kind) startEntityPointer(event, world, kind);
	}

	function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
		const p = propsRef.current;
		if (
			event.pointerType === 'touch' &&
			touchesRef.current.has(event.pointerId)
		) {
			touchesRef.current.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			});
			const gesture = gestureRef.current;
			if (gesture?.kind === 'pinch') {
				const [a, b] = [...touchesRef.current.values()];
				const container = containerRef.current;
				if (a && b && container) {
					const rect = container.getBoundingClientRect();
					const center = {
						x: (a.x + b.x) / 2 - rect.left,
						y: (a.y + b.y) / 2 - rect.top,
					};
					const distance = Math.max(
						1,
						Math.hypot(a.x - b.x, a.y - b.y)
					);
					const { height, width } = sizeRef.current;
					const anchor = screenToWorld(
						gesture.startView,
						width,
						height,
						gesture.startCenter
					);
					const scale = clampScale(
						(gesture.startView.scale * distance) /
							gesture.startDistance
					);
					viewRef.current = {
						scale,
						x: anchor.x - (center.x - width / 2) / scale,
						y: anchor.y + (center.y - height / 2) / scale,
					};
					scheduleRender();
				}
				return;
			}
		}
		const gesture = gestureRef.current;
		if (
			gesture &&
			'pointerId' in gesture &&
			gesture.pointerId !== event.pointerId
		)
			return;
		const { world } = readPointer(event);
		if (!gesture) {
			updateHover(event.target === event.currentTarget ? world : null);
			scheduleRender();
			return;
		}
		hoverRef.current = { ...hoverRef.current, world };
		const snap = readSnap(event.altKey);
		switch (gesture.kind) {
			case 'pan': {
				const scale = gesture.startView.scale;
				viewRef.current = {
					scale,
					x:
						gesture.startView.x -
						(event.clientX - gesture.startClient.x) / scale,
					y:
						gesture.startView.y +
						(event.clientY - gesture.startClient.y) / scale,
				};
				break;
			}
			case 'stroke': {
				const cell = getCellAt(world);
				if (
					cell.x === gesture.lastCell.x &&
					cell.y === gesture.lastCell.y
				)
					break;
				for (const point of getLineCells(gesture.lastCell, cell).slice(
					1
				))
					stampStroke(gesture, point);
				gesture.lastCell = cell;
				break;
			}
			case 'rect':
				gesture.current =
					gesture.purpose === 'height'
						? world
						: snapPoint(world, snap);
				break;
			case 'circle':
				gesture.current = snapPoint(world, snap);
				break;
			case 'move': {
				if (
					!gesture.hasMoved &&
					Math.hypot(
						event.clientX - gesture.startClient.x,
						event.clientY - gesture.startClient.y
					) < DRAG_THRESHOLD_PX
				)
					break;
				gesture.hasMoved = true;
				draftRef.current = applyMove(gesture, world, snap);
				break;
			}
			case 'vertex': {
				const point = snapPoint(world, snap);
				const base = gesture.base;
				if (gesture.owner === 'camera') {
					const bounds = base.camera.bounds.map((item, i) =>
						i === gesture.vertex.pointIndex
							? [point.x, point.y]
							: item
					);
					draftRef.current = {
						...base,
						camera: { ...base.camera, bounds },
					};
				} else {
					const collider = getTargetWorldColliders(
						base,
						p.colliderTarget
					)[gesture.index];
					draftRef.current = collider
						? replaceCollider(
								base,
								p.colliderTarget,
								gesture.index,
								setVertex(collider, gesture.vertex, point)
							)
						: null;
				}
				break;
			}
			case 'resize': {
				const collider = getTargetWorldColliders(
					gesture.base,
					p.colliderTarget
				)[gesture.index];
				if (collider?.shape !== 'box') break;
				const rect = resizeRectWithHandle(
					gesture.startRect,
					gesture.handle,
					world,
					snap
				);
				draftRef.current = replaceCollider(
					gesture.base,
					p.colliderTarget,
					gesture.index,
					{
						...collider,
						height: rect.maxY - rect.minY,
						width: rect.maxX - rect.minX,
						x: (rect.minX + rect.maxX) / 2,
						y: (rect.minY + rect.maxY) / 2,
					}
				);
				break;
			}
			case 'radius': {
				const collider = getTargetWorldColliders(
					gesture.base,
					p.colliderTarget
				)[gesture.index];
				if (collider?.shape !== 'circle') break;
				const radius = Math.max(
					snap || 0.01,
					Math.hypot(world.x - collider.x, world.y - collider.y)
				);
				draftRef.current = replaceCollider(
					gesture.base,
					p.colliderTarget,
					gesture.index,
					{
						...collider,
						radius:
							snap > 0
								? Math.max(
										snap,
										Math.round(radius / snap) * snap
									)
								: radius,
					}
				);
				break;
			}
			case 'marquee': {
				gesture.current = world;
				const hits = collectEntitiesInRect(
					gesture.base,
					gesture.entity,
					normalizeRect(gesture.start, world)
				);
				gesture.preview = new Set([...gesture.initial, ...hits]);
				break;
			}
			case 'pinch':
				break;
		}
		scheduleRender();
	}

	/** 以拖动起点为基准移动；图层按整像素，其余按吸附步长。 */
	function applyMove(
		gesture: Extract<TGesture, { kind: 'move' }>,
		world: IMapPoint,
		snap: number
	): IDayMap {
		const p = propsRef.current;
		const base = gesture.base;
		const dx = world.x - gesture.startWorld.x;
		const dy = world.y - gesture.startWorld.y;
		if (gesture.entity === 'layer') {
			const layer = base.layers[gesture.clickedIndex];
			if (!layer) return base;
			return patchLayer(base, gesture.clickedIndex, {
				x: layer.x + Math.round(dx * base.pixelsPerUnit),
				y: layer.y + Math.round(dy * base.pixelsPerUnit),
			});
		}
		const step = snap > 0 ? snap : 0;
		const sdx = step ? Math.round(dx / step) * step : dx;
		const sdy = step ? Math.round(dy / step) * step : dy;
		if (gesture.entity === 'camera')
			return {
				...base,
				camera: {
					...base.camera,
					bounds: base.camera.bounds.map(([x = 0, y = 0]) => [
						roundMapValue(x + sdx),
						roundMapValue(y + sdy),
					]),
				},
			};
		// 单个物件或出生点拖动时让锚点本身落在吸附网格上。
		let fdx = sdx;
		let fdy = sdy;
		if (
			step &&
			gesture.indices.size === 1 &&
			gesture.entity !== 'collider'
		) {
			const anchor =
				gesture.entity === 'object'
					? base.objects[gesture.clickedIndex]
					: base.spawnMarkers[gesture.clickedIndex];
			if (anchor) {
				fdx = Math.round((anchor.x + dx) / step) * step - anchor.x;
				fdy = Math.round((anchor.y + dy) / step) * step - anchor.y;
			}
		}
		return moveEntities(
			base,
			gesture.entity,
			gesture.indices,
			roundMapValue(fdx),
			roundMapValue(fdy),
			p.colliderTarget
		);
	}

	function finishGesture(event: PointerEvent<HTMLDivElement>) {
		const gesture = gestureRef.current;
		if (!gesture) return;
		if ('pointerId' in gesture && gesture.pointerId !== event.pointerId)
			return;
		gestureRef.current = null;
		releaseCapture(event.pointerId);
		const p = propsRef.current;
		switch (gesture.kind) {
			case 'stroke':
				commit(
					applyHeightChanges(gesture.base, gesture.changes),
					gesture.base
				);
				break;
			case 'rect': {
				const base = gesture.base;
				if (gesture.purpose === 'height') {
					const changes = new Map<string, number | null>();
					for (const cell of getRectCells(
						normalizeRect(
							getCellAt(gesture.start),
							getCellAt(gesture.current)
						)
					))
						changes.set(
							getCellKey(cell.x, cell.y),
							gesture.isErase ? null : p.slope
						);
					commit(applyHeightChanges(base, changes), base);
					break;
				}
				const rect = normalizeRect(gesture.start, gesture.current);
				const minimum = Math.max(p.snapStep, 1 / base.pixelsPerUnit);
				if (
					rect.maxX - rect.minX < minimum ||
					rect.maxY - rect.minY < minimum
				) {
					draftRef.current = null;
					break;
				}
				if (gesture.purpose === 'camera')
					commit(
						{
							...base,
							camera: {
								...base.camera,
								bounds: rectToPolygon(rect),
							},
						},
						base
					);
				else
					commitInsert(
						addCollider(base, p.colliderTarget, {
							height: rect.maxY - rect.minY,
							shape: 'box',
							width: rect.maxX - rect.minX,
							x: (rect.minX + rect.maxX) / 2,
							y: (rect.minY + rect.maxY) / 2,
						}),
						base,
						'collider'
					);
				break;
			}
			case 'circle': {
				const radius = Math.hypot(
					gesture.current.x - gesture.center.x,
					gesture.current.y - gesture.center.y
				);
				if (
					radius <
					Math.max(p.snapStep, 1 / gesture.base.pixelsPerUnit)
				)
					break;
				commitInsert(
					addCollider(gesture.base, p.colliderTarget, {
						radius,
						shape: 'circle',
						x: gesture.center.x,
						y: gesture.center.y,
					}),
					gesture.base,
					'collider'
				);
				break;
			}
			case 'move': {
				const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
				if (!gesture.hasMoved) {
					draftRef.current = null;
					if (gesture.shouldCollapseSelection && kind)
						p.onSelectionChange(
							kind,
							new Set([gesture.clickedIndex])
						);
					break;
				}
				commit(draftRef.current ?? gesture.base, gesture.base);
				break;
			}
			case 'vertex':
			case 'resize':
			case 'radius':
				commit(draftRef.current ?? gesture.base, gesture.base);
				break;
			case 'marquee':
				p.onSelectionChange(gesture.entity, gesture.preview);
				break;
			case 'pan':
			case 'pinch':
				break;
		}
		scheduleRender();
	}

	function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
		touchesRef.current.delete(event.pointerId);
		if (gestureRef.current?.kind === 'pinch' && touchesRef.current.size < 2)
			gestureRef.current = null;
		finishGesture(event);
	}

	function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
		touchesRef.current.delete(event.pointerId);
		const gesture = gestureRef.current;
		if (
			gesture &&
			(!('pointerId' in gesture) || gesture.pointerId === event.pointerId)
		) {
			gestureRef.current = null;
			draftRef.current = null;
			releaseCapture(event.pointerId);
		}
		scheduleRender();
	}

	function handlePointerLeave() {
		if (!gestureRef.current) {
			updateHover(null);
			scheduleRender();
		}
	}

	/** 双击：结束逐点绘制，或在选中路径的边上插入顶点。 */
	function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
		const p = propsRef.current;
		if (p.isReadOnly) return;
		if (penRef.current) {
			finishPen(false);
			return;
		}
		const map = readShownMap();
		const editable = getEditablePaths(map);
		if (!editable) return;
		const { world } = readPointer(event);
		let found: {
			distance: number;
			pathIndex: number;
			segment: number;
		} | null = null;
		editable.paths.forEach((path, pathIndex) => {
			const count = editable.isClosed ? path.length : path.length - 1;
			for (let segment = 0; segment < count; segment++) {
				const distance = getDistanceToSegment(
					world,
					toPoint(path[segment] ?? []),
					toPoint(path[(segment + 1) % path.length] ?? [])
				);
				if (
					distance <= HIT_TOLERANCE_PX / viewRef.current.scale &&
					(!found || distance < found.distance)
				)
					found = { distance, pathIndex, segment };
			}
		});
		if (!found) return;
		const { pathIndex, segment } = found;
		const path = editable.paths[pathIndex] ?? [];
		const point = snapPoint(
			projectToSegment(
				world,
				toPoint(path[segment] ?? []),
				toPoint(path[(segment + 1) % path.length] ?? [])
			),
			readSnap(event.altKey)
		);
		const vertex = { pathIndex, pointIndex: segment + 1 };
		if (editable.owner === 'camera') {
			const bounds = [...map.camera.bounds];
			bounds.splice(segment + 1, 0, [point.x, point.y]);
			commit({ ...map, camera: { ...map.camera, bounds } }, map);
		} else {
			const collider = getTargetWorldColliders(map, p.colliderTarget)[
				editable.index
			];
			if (!collider) return;
			commit(
				replaceCollider(
					map,
					p.colliderTarget,
					editable.index,
					insertVertex(collider, pathIndex, segment, point)
				),
				map
			);
		}
		p.onVertexSelect(vertex);
	}

	function nudge(dx: number, dy: number) {
		const p = propsRef.current;
		const map = readShownMap();
		if (p.mode === 'layer') {
			const layer = map.layers[p.activeLayerIndex];
			if (layer)
				commit(
					patchLayer(map, p.activeLayerIndex, {
						x: layer.x + dx,
						y: layer.y + dy,
					}),
					map
				);
			return;
		}
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (!kind || p.selection.size === 0) return;
		const step = p.snapStep > 0 ? p.snapStep : 1 / map.pixelsPerUnit;
		commit(
			moveEntities(
				map,
				kind,
				p.selection,
				dx * step,
				dy * step,
				p.colliderTarget
			),
			map
		);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (
			event.nativeEvent.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return;
		const pen = penRef.current;
		if (pen) {
			if (event.key === 'Enter') {
				event.preventDefault();
				finishPen(false);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				penRef.current = null;
				scheduleRender();
			} else if (event.key === 'Backspace' || event.key === 'Delete') {
				event.preventDefault();
				event.stopPropagation();
				pen.points.pop();
				if (pen.points.length === 0) penRef.current = null;
				scheduleRender();
			}
			return;
		}
		if (event.key === 'Escape' && gestureRef.current) {
			event.preventDefault();
			cancelGesture();
			return;
		}
		const arrows: Record<string, readonly [number, number]> = {
			ArrowDown: [0, -1],
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, 1],
		};
		const arrow = arrows[event.key];
		if (arrow && !propsRef.current.isReadOnly) {
			event.preventDefault();
			const factor = event.shiftKey
				? propsRef.current.mode === 'layer'
					? 10
					: 4
				: 1;
			nudge(arrow[0] * factor, arrow[1] * factor);
		}
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		const files = [...event.dataTransfer.files];
		if (files.length === 0) return;
		event.preventDefault();
		propsRef.current.onDropFiles(files, readPointer(event).world);
	}

	/* ── 生命周期 ─────────────────────────────────────── */

	useLayoutEffect(() => {
		const host = sceneHostRef.current;
		if (!host) return;
		let cleanupRenderer = () => {};
		const install = () => {
			let handle: ISceneRendererHandle;
			try {
				handle = createSceneRenderer();
			} catch (error) {
				propsRef.current.onNotice(
					error instanceof Error
						? error.message
						: '无法创建地图画布。',
					'error'
				);
				return;
			}
			const { canvas, renderer } = handle;
			canvas.className = 'absolute inset-0 h-full w-full';
			canvas.setAttribute('aria-hidden', 'true');
			host.append(canvas);
			rendererRef.current = handle;
			const unsubscribe = renderer.textureStore.subscribe(scheduleRender);
			const handleContextLost = (event: Event) => event.preventDefault();
			// 上下文恢复后旧的显存对象全部失效，整体重建渲染器。
			const handleContextRestored = () => {
				cleanupRenderer();
				install();
				scheduleRender();
			};
			canvas.addEventListener('webglcontextlost', handleContextLost);
			canvas.addEventListener(
				'webglcontextrestored',
				handleContextRestored
			);
			cleanupRenderer = () => {
				unsubscribe();
				canvas.removeEventListener(
					'webglcontextlost',
					handleContextLost
				);
				canvas.removeEventListener(
					'webglcontextrestored',
					handleContextRestored
				);
				renderer.dispose();
				canvas.remove();
				if (rendererRef.current === handle) rendererRef.current = null;
			};
			propsRef.current.store.update({ renderer: renderer.kind });
		};
		install();
		fontFamilyRef.current =
			getComputedStyle(document.body).fontFamily || 'sans-serif';
		scheduleRender();
		return () => {
			cleanupRenderer();
			if (frameRef.current) cancelAnimationFrame(frameRef.current);
			frameRef.current = 0;
		};
		// 渲染器只随组件创建一次。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (!rect) return;
			sizeRef.current = {
				height: Math.max(0, rect.height),
				width: Math.max(0, rect.width),
			};
			if (!hasFittedRef.current && rect.width > 0 && rect.height > 0) {
				hasFittedRef.current = true;
				fit(false);
			}
			scheduleRender();
		});
		observer.observe(container);
		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			const kind = classifyWheel(event, wheelRef.current);
			wheelRef.current = { kind, time: event.timeStamp };
			const rect = container.getBoundingClientRect();
			const screen = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			const unit =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? rect.height
						: 1;
			if (kind === 'zoom') {
				const intensity =
					event.ctrlKey || event.metaKey ? 0.01 : 0.0022;
				zoomAround(Math.exp(-event.deltaY * unit * intensity), screen);
				return;
			}
			const view = viewRef.current;
			const dx = (event.shiftKey ? event.deltaY : event.deltaX) * unit;
			const dy = (event.shiftKey ? event.deltaX : event.deltaY) * unit;
			animationRef.current = null;
			setView({
				...view,
				x: view.x + dx / view.scale,
				y: view.y - dy / view.scale,
			});
			if (!gestureRef.current) updateHover(readPointer(event).world);
		};
		container.addEventListener('wheel', handleWheel, { passive: false });
		// 捕获阶段处理空格和 Alt：指针在画布上时，焦点停在按钮上也能按住空格平移。
		const handleKey = (event: globalThis.KeyboardEvent) => {
			const isOwned =
				!event.isComposing &&
				!isEditableTarget(event.target) &&
				!isOverlayActive() &&
				(hoverRef.current.world !== null ||
					(event.target instanceof Node &&
						container.contains(event.target)));
			if (event.key === 'Alt') {
				const isAlt = event.type === 'keydown';
				if (isAltHeldRef.current !== isAlt) {
					isAltHeldRef.current = isAlt;
					scheduleRender();
				}
				if (isAlt && isOwned) event.preventDefault();
				return;
			}
			if (event.code !== 'Space') return;
			if (event.type === 'keyup') {
				if (isSpaceHeldRef.current) {
					isSpaceHeldRef.current = false;
					event.preventDefault();
					event.stopPropagation();
					scheduleRender();
				}
				return;
			}
			if (!isOwned) return;
			event.preventDefault();
			event.stopPropagation();
			if (!isSpaceHeldRef.current) {
				isSpaceHeldRef.current = true;
				scheduleRender();
			}
		};
		const handleBlur = () => {
			isSpaceHeldRef.current = false;
			isAltHeldRef.current = false;
			scheduleRender();
		};
		window.addEventListener('keydown', handleKey, true);
		window.addEventListener('keyup', handleKey, true);
		window.addEventListener('blur', handleBlur);
		return () => {
			observer.disconnect();
			container.removeEventListener('wheel', handleWheel);
			window.removeEventListener('keydown', handleKey, true);
			window.removeEventListener('keyup', handleKey, true);
			window.removeEventListener('blur', handleBlur);
		};
		// 监听器通过 ref 读取最新状态，只需注册一次。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const { colliderTarget, map, mode, tool } = props;
	useEffect(() => {
		pendingRef.current = null;
		const gesture = gestureRef.current;
		if (gesture && 'base' in gesture && gesture.base !== map)
			cancelGesture();
		// 地图变化只需清理挂起的提交。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map]);

	useEffect(() => {
		const gesture = gestureRef.current;
		if (gesture && gesture.kind !== 'pan' && gesture.kind !== 'pinch')
			cancelGesture();
		penRef.current = null;
		// 工具、模式或碰撞编辑对象切换时放弃未完成的操作。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [colliderTarget, mode, tool]);

	const { assetUrls, packLabel } = props;
	useEffect(() => {
		const urls = new Set<string>();
		for (const reference of getDayMapAssetReferences(map)) {
			const local = resolveDayMapAssetPath(reference.path, packLabel);
			const url = local === null ? undefined : assetUrls[local];
			if (reference.kind === 'image' && url) urls.add(url);
		}
		rendererRef.current?.renderer.textureStore.retain(urls);
	}, [assetUrls, map, packLabel]);

	useEffect(() => {
		scheduleRender();
	});

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			role="application"
			aria-roledescription="地图画布"
			aria-label="地图画布。滚轮缩放，按住空格或中键拖动平移；方向键微调选中项，Delete 删除，回车结束逐点绘制。"
			className={cn(
				'relative h-full w-full touch-none select-none overflow-hidden outline-none',
				'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
			)}
			onContextMenu={(event) => event.preventDefault()}
			onDoubleClick={handleDoubleClick}
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes('Files'))
					event.preventDefault();
			}}
			onDrop={handleDrop}
			onKeyDown={handleKeyDown}
			onLostPointerCapture={(event) => {
				const gesture = gestureRef.current;
				if (
					gesture &&
					'pointerId' in gesture &&
					gesture.pointerId === event.pointerId
				)
					finishGesture(event);
			}}
			onPointerCancel={handlePointerCancel}
			onPointerDown={handlePointerDown}
			onPointerLeave={handlePointerLeave}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onBlur={() => scheduleRender()}
			onFocus={() => scheduleRender()}
		>
			<div
				ref={sceneHostRef}
				className="pointer-events-none absolute inset-0"
			/>
			<canvas
				ref={overlayRef}
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 h-full w-full"
			/>
		</div>
	);
}
