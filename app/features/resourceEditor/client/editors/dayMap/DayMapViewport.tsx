'use client';

import { cn } from '@heroui/theme';
import {
	type DragEvent,
	type KeyboardEvent,
	type PointerEvent,
	type Ref,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from 'react';

import type {
	IDayMap,
	IDayMapCell,
	IDayMapLayer,
} from '@/domain/resourcePack/contracts/dayMap';

import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

import {
	formatMapNumber,
	formatSlopeAngle,
	hasSpecialShader,
	type IMapCellSelection,
	type IMapPoint,
	type IMapRect,
	type IMapView,
	type IMapViewOptions,
	type ITileBrush,
	MAP_ENTITY_KIND_BY_MODE,
	MAP_ZOOM_MAX_PX_PER_UNIT,
	MAP_ZOOM_MIN_PX_PER_UNIT,
	type TMapEntityKind,
	type TMapMode,
	type TMapTool,
} from './dayMapEditorModel';
import {
	addCollision,
	addObject,
	addSpawn,
	createCellIndex,
	createHeightIndex,
	deleteEntities,
	getCellKey,
	moveEntities,
	replaceCollisionRect,
} from './dayMapEdits';
import {
	clampMapCoordinate,
	clampPointToRect,
	getBrushOffsets,
	getCameraRect,
	getCellAt,
	getCollisionRect,
	getLineCells,
	getMapContentRect,
	hitTestRectHandle,
	isPointInRect,
	normalizeRect,
	RECT_HANDLE_CURSORS,
	resizeRectWithHandle,
	roundMapValue,
	screenToWorld,
	snapToStep,
	type TRectHandle,
} from './dayMapSpatial';
import { isEditableTarget, isOverlayActive } from './mapShortcuts';
import {
	applyStroke,
	collectEntitiesInRect,
	createBrushFromCell,
	createStrokeState,
	fillArea,
	fillRect,
	getPatternTile,
	getStampCells,
	hitTestEntity,
	type IStrokeState,
	pickCell,
	placeStamp,
	writeHeightCell,
	writeTileCell,
} from './mapToolActions';
import { type MapViewportStore } from './mapViewportStore';
import {
	drawMapOverlay,
	type IMapOverlayState,
	type IOverlayBrushPreview,
	type IOverlayRectPreview,
} from './render/drawMapOverlay';
import {
	createSceneBuilder,
	getTileIndex,
	type ISceneGeometry,
	type ISceneItem,
	resolveMapImageUrl,
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
	/** 范围已可见时不动，否则平移到中心；放不下时再缩放。 */
	revealRect(rect: IMapRect): void;
	zoomBy(factor: number): void;
	zoomTo(scale: number): void;
}

interface IProps {
	activeLayerIndex: number;
	assetUrls: Readonly<Record<string, string>>;
	brush: ITileBrush | null;
	brushSize: number;
	cellSelection: IMapCellSelection | null;
	hiddenLayers: ReadonlySet<number>;
	isCameraSelected: boolean;
	isReadOnly: boolean;
	isReducedMotion: boolean;
	map: IDayMap;
	mode: TMapMode;
	options: IMapViewOptions;
	packLabel: string;
	ref?: Ref<IDayMapViewportHandle>;
	selection: ReadonlySet<number>;
	slope: number;
	snapStep: number;
	store: MapViewportStore;
	tool: TMapTool;
	onBrushPick(brush: ITileBrush): void;
	onCameraSelect(isSelected: boolean): void;
	onCellSelect(selection: IMapCellSelection | null): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onDropFiles(files: File[]): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
	onSelectionChange(kind: TMapEntityKind, indices: ReadonlySet<number>): void;
	onSlopePick(slope: number): void;
	onToolChange(tool: TMapTool): void;
}

type TStrokeTarget = 'height' | 'tile';
type TRectPurpose = 'camera' | 'collision' | 'height' | 'tile';

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
			isDraftDirty: boolean;
			isErase: boolean;
			kind: 'stroke';
			lastCell: IMapPoint;
			layerIndex: number;
			pointerId: number;
			state: IStrokeState;
			target: TStrokeTarget;
	  }
	| {
			base: IDayMap;
			current: IMapPoint;
			isErase: boolean;
			kind: 'rect';
			pointerId: number;
			purpose: TRectPurpose;
			start: IMapPoint;
			startClient: IMapPoint;
	  }
	| {
			anchor: IMapPoint;
			base: IDayMap;
			clickedIndex: number;
			entity: TMapEntityKind | 'camera';
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
			entity: 'camera' | 'collision';
			handle: TRectHandle;
			index: number;
			kind: 'resize';
			pointerId: number;
			startRect: IMapRect;
	  }
	| {
			base: IDayMap;
			current: IMapPoint;
			entity: TMapEntityKind;
			initial: ReadonlySet<number>;
			isAdditive: boolean;
			kind: 'marquee';
			pointerId: number;
			preview: ReadonlySet<number>;
			start: IMapPoint;
			startClient: IMapPoint;
	  };

interface IHoverState {
	cell: IMapPoint | null;
	entity: number;
	handle: TRectHandle | null;
	isCameraBody: boolean;
	world: IMapPoint | null;
}

const DRAG_THRESHOLD_PX = 3;
const GHOST_ALPHA = 0.6;
const EMPTY_SET: ReadonlySet<number> = new Set();
const layerCellIndexCache = new WeakMap<
	IDayMapLayer,
	Map<string, IDayMapCell>
>();

function getLayerCellIndex(layer: IDayMapLayer) {
	let index = layerCellIndexCache.get(layer);
	if (!index) {
		index = createCellIndex(layer.cells);
		layerCellIndexCache.set(layer, index);
	}
	return index;
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
	const viewRef = useRef<IMapView>({ scale: 48, x: 0, y: 0 });
	const sizeRef = useRef({ height: 0, width: 0 });
	const hasFittedRef = useRef(false);
	const gestureRef = useRef<TGesture | null>(null);
	const draftRef = useRef<IDayMap | null>(null);
	const pendingRef = useRef<IDayMap | null>(null);
	const hoverRef = useRef<IHoverState>({
		cell: null,
		entity: -1,
		handle: null,
		isCameraBody: false,
		world: null,
	});
	const keyboardCellRef = useRef<IMapPoint | null>(null);
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
	const lastStrokeRef = useRef<{
		cell: IMapPoint;
		layerIndex: number;
		target: TStrokeTarget;
	} | null>(null);
	const wheelRef = useRef<{ kind: 'pan' | 'zoom'; time: number } | null>(
		null
	);
	const fontFamilyRef = useRef('sans-serif');
	const ghostRef = useRef<{
		assetUrls: Readonly<Record<string, string>>;
		geometry: ISceneGeometry;
		key: string;
		textureVersion: number;
		tiles: IDayMap['tiles'];
	} | null>(null);
	const brushIdsRef = useRef(new WeakMap<ITileBrush, number>());
	const nextBrushIdRef = useRef(1);
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

	function getBrushId(brush: ITileBrush | null) {
		if (!brush) return 0;
		let id = brushIdsRef.current.get(brush);
		if (id === undefined) {
			id = nextBrushIdRef.current;
			nextBrushIdRef.current += 1;
			brushIdsRef.current.set(brush, id);
		}
		return id;
	}

	/** 画笔、矩形和放置装饰的半透明预览；按输入生成键，未变化时复用顶点。 */
	function getGhostSpec(
		map: IDayMap
	): { build: () => ISceneItem[]; key: string } | null {
		const p = propsRef.current;
		const gesture = gestureRef.current;
		const hover = hoverRef.current;
		if (p.isReadOnly || isSpaceHeldRef.current) return null;
		const placement = p.brush?.placement;
		const withPlacement = (item: ISceneItem): ISceneItem =>
			placement ? { ...item, placement } : item;
		if (p.mode === 'tile') {
			const stamp = getStampCells(p.brush, p.brushSize);
			if (stamp.length === 0) return null;
			const brushKey = `${getBrushId(p.brush)}:${p.brushSize}`;
			if (gesture?.kind === 'rect') {
				if (gesture.isErase) return null;
				const pattern = getStampCells(p.brush, 1);
				const rect = normalizeRect(gesture.start, gesture.current);
				const area =
					(rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
				if (area > 2500) return null;
				return {
					build: () => {
						const items: ISceneItem[] = [];
						const origin = { x: rect.minX, y: rect.minY };
						for (let y = rect.minY; y <= rect.maxY; y++)
							for (let x = rect.minX; x <= rect.maxX; x++) {
								const tile = getPatternTile(
									pattern,
									origin,
									x,
									y
								);
								if (tile)
									items.push(withPlacement({ tile, x, y }));
							}
						return items;
					},
					key: `rect:${rect.minX},${rect.minY},${rect.maxX},${rect.maxY}|${brushKey}`,
				};
			}
			const cell = hover.cell;
			if (gesture || p.tool !== 'brush' || !cell || isAltHeldRef.current)
				return null;
			return {
				build: () =>
					placeStamp(
						stamp,
						cell,
						(p.brush?.cells.length ?? 0) > 1
					).map((item) =>
						withPlacement({ tile: item.tile, x: item.x, y: item.y })
					),
				key: `stamp:${cell.x},${cell.y}|${brushKey}`,
			};
		}
		if (
			p.mode === 'object' &&
			p.tool === 'place' &&
			!gesture &&
			hover.world &&
			hover.entity < 0
		) {
			const tile = p.brush?.cells[0]?.tile;
			if (!tile || !getTileIndex(map.tiles).has(tile)) return null;
			const x = snapToStep(hover.world.x, p.snapStep);
			const y = snapToStep(hover.world.y, p.snapStep);
			return {
				build: () => [{ tile, x, y }],
				key: `object:${x},${y}|${tile}`,
			};
		}
		return null;
	}

	function getGhostGeometry(
		map: IDayMap,
		renderer: ISceneRendererHandle
	): ISceneGeometry | null {
		const spec = getGhostSpec(map);
		if (!spec) {
			ghostRef.current = null;
			return null;
		}
		const p = propsRef.current;
		const textureStore = renderer.renderer.textureStore;
		const textureVersion = textureStore.getVersion();
		const cached = ghostRef.current;
		if (
			cached?.key === spec.key &&
			cached.tiles === map.tiles &&
			cached.assetUrls === p.assetUrls &&
			cached.textureVersion === textureVersion
		)
			return cached.geometry;
		const builder = builderRef.current;
		if (!builder) return null;
		const geometry = builder.buildItems(
			{
				assetUrls: p.assetUrls,
				hiddenLayers: p.hiddenLayers,
				map,
				packLabel: p.packLabel,
				shouldShowMaterialSources: true,
				textureStore,
			},
			spec.build(),
			GHOST_ALPHA
		);
		ghostRef.current = {
			assetUrls: p.assetUrls,
			geometry,
			key: spec.key,
			textureVersion,
			tiles: map.tiles,
		};
		return geometry;
	}

	function getBrushPreview(map: IDayMap): IOverlayBrushPreview | null {
		const p = propsRef.current;
		const gesture = gestureRef.current;
		const cell =
			hoverRef.current.cell ??
			(document.activeElement === containerRef.current
				? keyboardCellRef.current
				: null);
		if (!cell || p.isReadOnly || isSpaceHeldRef.current) return null;
		if (p.mode !== 'tile' && p.mode !== 'height') return null;
		if (gesture && gesture.kind !== 'stroke') return null;
		const isErase =
			gesture?.kind === 'stroke' ? gesture.isErase : p.tool === 'eraser';
		if (isAltHeldRef.current || p.tool === 'picker')
			return { cells: [cell], kind: 'picker', slope: 0 };
		if (p.tool === 'select' || p.tool === 'fill' || p.tool === 'rectangle')
			return { cells: [cell], kind: 'picker', slope: 0 };
		if (p.tool !== 'brush' && p.tool !== 'eraser') return null;
		if (p.mode === 'height')
			return {
				cells: getBrushOffsets(p.brushSize).map((offset) => ({
					x: cell.x + offset.x,
					y: cell.y + offset.y,
				})),
				kind: isErase ? 'erase' : 'slope',
				slope: p.slope,
			};
		if (isErase)
			return {
				cells: getBrushOffsets(p.brushSize).map((offset) => ({
					x: cell.x + offset.x,
					y: cell.y + offset.y,
				})),
				kind: 'erase',
				slope: 0,
			};
		const stamp = getStampCells(p.brush, p.brushSize);
		if (stamp.length === 0 || !map.layers[p.activeLayerIndex])
			return { cells: [cell], kind: 'picker', slope: 0 };
		return {
			cells: placeStamp(stamp, cell, (p.brush?.cells.length ?? 0) > 1),
			kind: 'paint',
			slope: 0,
		};
	}

	function getRectPreview(): IOverlayRectPreview | null {
		const gesture = gestureRef.current;
		if (gesture?.kind !== 'rect') return null;
		const rect = normalizeRect(gesture.start, gesture.current);
		if (gesture.purpose === 'tile' || gesture.purpose === 'height')
			return {
				kind: gesture.isErase
					? 'erase'
					: gesture.purpose === 'height'
						? 'slope'
						: 'paint',
				rect: {
					maxX: rect.maxX + 1,
					maxY: rect.maxY + 1,
					minX: rect.minX,
					minY: rect.minY,
				},
			};
		return { kind: gesture.purpose, rect };
	}

	function describeHover(map: IDayMap) {
		const p = propsRef.current;
		const hover = hoverRef.current;
		if (!hover.world || gestureRef.current) return '';
		if (p.mode === 'tile' && hover.cell) {
			const layer = map.layers[p.activeLayerIndex];
			const cell = layer
				? getLayerCellIndex(layer).get(
						getCellKey(hover.cell.x, hover.cell.y)
					)
				: undefined;
			return cell ? `瓦片 ${cell.tile}` : '空格';
		}
		if (p.mode === 'height' && hover.cell) {
			const slope = getHeightIndex(map).get(
				getCellKey(hover.cell.x, hover.cell.y)
			);
			if (slope === undefined) return '平地';
			return `坡度 ${formatMapNumber(slope)}（${formatSlopeAngle(slope)}，${slope > 0 ? '向右上坡' : '向右下坡'}）`;
		}
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (kind && hover.entity >= 0) {
			if (kind === 'spawn') {
				const marker = map.spawnMarkers[hover.entity];
				return marker
					? `出生点 ${marker.name}${marker.name === map.defaultSpawnMarker ? '（默认）' : ''}`
					: '';
			}
			if (kind === 'collision') {
				const box = map.collisions[hover.entity];
				return box
					? `${box.name || '碰撞'} · ${formatMapNumber(box.width)}×${formatMapNumber(box.height)}`
					: '';
			}
			const object = map.objects[hover.entity];
			return object ? `${object.name || '装饰'} · ${object.tile}` : '';
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
		else if (gesture?.kind === 'move') cursor = 'move';
		else if (gesture?.kind === 'resize')
			cursor = RECT_HANDLE_CURSORS[gesture.handle];
		else if (hover.handle) cursor = RECT_HANDLE_CURSORS[hover.handle];
		else if (p.isReadOnly) cursor = 'default';
		else if (
			(p.tool === 'select' &&
				MAP_ENTITY_KIND_BY_MODE[p.mode] &&
				hover.entity >= 0) ||
			(p.mode === 'map' && p.tool === 'select' && hover.isCameraBody)
		)
			cursor = 'move';
		else if (
			p.tool === 'select' &&
			p.mode !== 'tile' &&
			p.mode !== 'height'
		)
			cursor = 'default';
		else if (
			(p.tool === 'place' && hover.entity >= 0) ||
			isAltHeldRef.current ||
			p.tool === 'picker'
		)
			cursor = p.tool === 'place' ? 'pointer' : 'copy';
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
		if (gesture?.kind === 'stroke' && gesture.isDraftDirty) {
			gesture.isDraftDirty = false;
			draftRef.current = applyStroke(
				gesture.base,
				gesture.state,
				gesture.target,
				gesture.layerIndex
			);
		}
		const p = propsRef.current;
		const map = readShownMap();
		const view = viewRef.current;
		const pixelRatio = window.devicePixelRatio || 1;
		const builder = builderRef.current;
		if (builder) {
			const segments = builder.build({
				assetUrls: p.assetUrls,
				hiddenLayers: p.hiddenLayers,
				map,
				packLabel: p.packLabel,
				shouldShowMaterialSources: p.options.shouldShowMaterialSources,
				textureStore: handle.renderer.textureStore,
			});
			const shouldDim =
				p.mode === 'tile' && p.options.shouldDimInactiveLayers;
			const items: ISceneDrawItem[] = segments.map((segment) => ({
				alpha:
					shouldDim && segment.layerIndex !== p.activeLayerIndex
						? 0.28
						: 1,
				geometry: segment.geometry,
			}));
			const ghost = getGhostGeometry(map, handle);
			if (ghost) items.push({ alpha: 1, geometry: ghost });
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
		const cameraRect = getCameraRect(map.camera.bounds);
		const overlayState: IMapOverlayState = {
			activeLayerIndex: p.activeLayerIndex,
			brushPreview: getBrushPreview(map),
			cameraPreviewCenter:
				p.mode === 'map' && hover.world && !gesture
					? cameraRect
						? clampPointToRect(hover.world, cameraRect)
						: hover.world
					: null,
			cellSelection: p.cellSelection,
			fontFamily: fontFamilyRef.current,
			hoveredHandle:
				gesture?.kind === 'resize' ? gesture.handle : hover.handle,
			hoveredIndex:
				kind && !gesture && hover.entity >= 0 ? hover.entity : null,
			isCameraSelected: p.isCameraSelected,
			map,
			marquee:
				gesture?.kind === 'marquee'
					? normalizeRect(gesture.start, gesture.current)
					: null,
			mode: p.mode,
			options: p.options,
			rectPreview: getRectPreview(),
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

	/** 定位整张地图；内容很少时至少显示 16×10 格，避免放大到单个点上。 */
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
		revealRect: (rect) => {
			const view = viewRef.current;
			const { height, width } = sizeRef.current;
			const visibleWidth = width / view.scale;
			const visibleHeight = height / view.scale;
			const rectWidth = rect.maxX - rect.minX;
			const rectHeight = rect.maxY - rect.minY;
			// 已经完整可见时不移动，否则居中；放不下时再缩小。
			const isVisible =
				rect.minX >= view.x - visibleWidth / 2 &&
				rect.maxX <= view.x + visibleWidth / 2 &&
				rect.minY >= view.y - visibleHeight / 2 &&
				rect.maxY <= view.y + visibleHeight / 2;
			if (isVisible) return;
			if (
				rectWidth * 1.2 < visibleWidth &&
				rectHeight * 1.2 < visibleHeight
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

	function cancelGesture() {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		draftRef.current = null;
		if (gesture && 'pointerId' in gesture) {
			const container = containerRef.current;
			if (container?.hasPointerCapture(gesture.pointerId))
				container.releasePointerCapture(gesture.pointerId);
		}
		scheduleRender();
	}

	/* ── 指针 ─────────────────────────────────────────── */

	function readPointer(event: { clientX: number; clientY: number }) {
		const container = containerRef.current;
		const rect = container?.getBoundingClientRect();
		const screen = {
			x: event.clientX - (rect?.left ?? 0),
			y: event.clientY - (rect?.top ?? 0),
		};
		const { height, width } = sizeRef.current;
		const world = screenToWorld(viewRef.current, width, height, screen);
		return {
			screen,
			world: {
				x: clampMapCoordinate(world.x, 4096),
				y: clampMapCoordinate(world.y, 4096),
			},
		};
	}

	function updateHover(world: IMapPoint | null) {
		const p = propsRef.current;
		const map = readShownMap();
		const hover = hoverRef.current;
		hover.world = world;
		hover.cell = world ? getCellAt(world) : null;
		hover.entity = -1;
		hover.handle = null;
		hover.isCameraBody = false;
		if (!world || p.isReadOnly) return;
		const scale = viewRef.current.scale;
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (
			kind &&
			(p.tool === 'select' ||
				p.tool === 'place' ||
				p.tool === 'rectangle')
		) {
			if (
				kind === 'collision' &&
				p.tool === 'select' &&
				p.selection.size === 1
			) {
				const [index = -1] = p.selection;
				const box = map.collisions[index];
				if (box)
					hover.handle = hitTestRectHandle(
						getCollisionRect(box),
						world,
						scale
					);
			}
			if (!hover.handle && p.tool !== 'rectangle')
				hover.entity = hitTestEntity(
					map,
					kind,
					world,
					scale,
					p.tool === 'place' ? 'anchor' : 'area'
				);
		}
		if (p.mode === 'map' && p.tool === 'select') {
			const rect = getCameraRect(map.camera.bounds);
			if (rect) {
				hover.handle = hitTestRectHandle(rect, world, scale);
				hover.isCameraBody =
					!hover.handle && isPointInRect(world, rect);
			}
		}
	}

	function startPan(event: PointerEvent<HTMLDivElement>) {
		gestureRef.current = {
			kind: 'pan',
			pointerId: event.pointerId,
			startClient: { x: event.clientX, y: event.clientY },
			startView: viewRef.current,
		};
		animationRef.current = null;
	}

	function checkPaintable(
		target: TStrokeTarget,
		isErase: boolean
	): string | null {
		const p = propsRef.current;
		const map = readShownMap();
		if (target === 'height') {
			if (map.layers.some((layer) => layer.isHeight))
				return '这张地图使用原始高度层，坡度画笔已停用。';
			if (!Number.isFinite(p.slope) || Math.abs(p.slope) > 1)
				return '坡度必须在 -1 到 1 之间。';
			return null;
		}
		if (!map.layers[p.activeLayerIndex]) return '请先添加一个图层。';
		if (p.hiddenLayers.has(p.activeLayerIndex))
			return '当前图层已隐藏，显示后才能绘制。';
		if (!isErase && getStampCells(p.brush, 1).length === 0)
			return '请先在瓦片库中选择画笔瓦片。';
		if (
			!isErase &&
			p.brush?.cells.some(
				(cell) => !map.tiles.some((tile) => tile.key === cell.tile)
			)
		)
			return '画笔中的瓦片已不存在，请重新选择。';
		return null;
	}

	/** 特殊材质图层在预览中默认隐藏，绘制时提示，避免看不到结果。 */
	function noticeHiddenMaterial(target: TStrokeTarget, isErase: boolean) {
		const p = propsRef.current;
		if (target !== 'tile' || isErase || p.options.shouldShowMaterialSources)
			return;
		const layer = readShownMap().layers[p.activeLayerIndex];
		if (layer && hasSpecialShader(layer))
			p.onNotice(
				'当前图层使用特殊材质，预览中默认隐藏；可在显示选项中打开“特殊材质源图”查看。',
				'info'
			);
	}

	function stampStroke(
		gesture: Extract<TGesture, { kind: 'stroke' }>,
		cell: IMapPoint
	) {
		const p = propsRef.current;
		if (gesture.target === 'height') {
			for (const offset of getBrushOffsets(p.brushSize))
				writeHeightCell(
					gesture.state,
					cell.x + offset.x,
					cell.y + offset.y,
					gesture.isErase ? null : p.slope
				);
		} else if (gesture.isErase) {
			for (const offset of getBrushOffsets(p.brushSize))
				writeTileCell(
					gesture.state,
					p.brush,
					cell.x + offset.x,
					cell.y + offset.y,
					null
				);
		} else {
			const stamp = getStampCells(p.brush, p.brushSize);
			for (const item of placeStamp(
				stamp,
				cell,
				(p.brush?.cells.length ?? 0) > 1
			))
				writeTileCell(
					gesture.state,
					p.brush,
					item.x,
					item.y,
					item.tile
				);
		}
		gesture.isDraftDirty = true;
	}

	function startStroke(
		event: PointerEvent<HTMLDivElement>,
		cell: IMapPoint,
		target: TStrokeTarget,
		isErase: boolean
	) {
		const p = propsRef.current;
		const error = checkPaintable(target, isErase);
		if (error) {
			p.onNotice(error, 'error');
			return;
		}
		noticeHiddenMaterial(target, isErase);
		const base = readShownMap();
		const gesture: Extract<TGesture, { kind: 'stroke' }> = {
			base,
			isDraftDirty: false,
			isErase,
			kind: 'stroke',
			lastCell: cell,
			layerIndex: p.activeLayerIndex,
			pointerId: event.pointerId,
			state: createStrokeState(base, target, p.activeLayerIndex),
			target,
		};
		const last = lastStrokeRef.current;
		if (
			event.shiftKey &&
			last &&
			last.target === target &&
			(target === 'height' || last.layerIndex === p.activeLayerIndex)
		)
			for (const point of getLineCells(last.cell, cell))
				stampStroke(gesture, point);
		else stampStroke(gesture, cell);
		gestureRef.current = gesture;
	}

	function finishStroke(gesture: Extract<TGesture, { kind: 'stroke' }>) {
		const next = applyStroke(
			gesture.base,
			gesture.state,
			gesture.target,
			gesture.layerIndex
		);
		lastStrokeRef.current = {
			cell: gesture.lastCell,
			layerIndex: gesture.layerIndex,
			target: gesture.target,
		};
		if (gesture.state.isLimitReached)
			propsRef.current.onNotice(
				gesture.target === 'height'
					? '坡度格已达到 100000 格上限，部分格子没有绘制。'
					: '显示图层总格子数已达到 100000 上限，部分格子没有绘制。',
				'error'
			);
		commit(next, gesture.base);
	}

	function applyPicker(cell: IMapPoint, shouldReturnToBrush: boolean) {
		const p = propsRef.current;
		const map = readShownMap();
		if (p.mode === 'height') {
			const slope =
				getHeightIndex(map).get(getCellKey(cell.x, cell.y)) ?? 0;
			p.onSlopePick(slope);
			p.onNotice(`已吸取坡度 ${formatMapNumber(slope)}`, 'info');
		} else {
			const picked = pickCell(
				map,
				cell,
				p.activeLayerIndex,
				p.hiddenLayers
			);
			if (!picked) {
				p.onNotice('这里没有可吸取的瓦片。', 'info');
				return;
			}
			p.onBrushPick(createBrushFromCell(map, picked.cell));
			p.onNotice(`已吸取瓦片 ${picked.cell.tile}`, 'info');
		}
		if (shouldReturnToBrush) p.onToolChange('brush');
	}

	function startEntityPointer(
		event: PointerEvent<HTMLDivElement>,
		world: IMapPoint,
		kind: TMapEntityKind
	) {
		const p = propsRef.current;
		const map = readShownMap();
		const scale = viewRef.current.scale;
		const isToggle = event.shiftKey || event.ctrlKey || event.metaKey;
		if (
			p.tool === 'select' &&
			kind === 'collision' &&
			p.selection.size === 1
		) {
			const [index = -1] = p.selection;
			const box = map.collisions[index];
			const handle = box
				? hitTestRectHandle(getCollisionRect(box), world, scale)
				: null;
			if (box && handle) {
				gestureRef.current = {
					base: map,
					entity: 'collision',
					handle,
					index,
					kind: 'resize',
					pointerId: event.pointerId,
					startRect: getCollisionRect(box),
				};
				return;
			}
		}
		if (p.tool === 'rectangle' && kind === 'collision') {
			const start = event.altKey
				? world
				: {
						x: snapToStep(world.x, p.snapStep),
						y: snapToStep(world.y, p.snapStep),
					};
			gestureRef.current = {
				base: map,
				current: start,
				isErase: false,
				kind: 'rect',
				pointerId: event.pointerId,
				purpose: 'collision',
				start,
				startClient: { x: event.clientX, y: event.clientY },
			};
			return;
		}
		const hit = hitTestEntity(
			map,
			kind,
			world,
			scale,
			p.tool === 'place' ? 'anchor' : 'area'
		);
		if (hit >= 0) {
			let indices: ReadonlySet<number>;
			if (isToggle && p.tool === 'select') {
				const next = new Set(p.selection);
				if (next.has(hit)) next.delete(hit);
				else next.add(hit);
				indices = next;
				p.onSelectionChange(kind, next);
				if (!next.has(hit)) return;
			} else if (p.selection.has(hit) && p.tool === 'select') {
				indices = p.selection;
			} else {
				indices = new Set([hit]);
				p.onSelectionChange(kind, indices);
			}
			const anchor =
				kind === 'collision'
					? (() => {
							const box = map.collisions[hit];
							return box
								? {
										x: box.x - box.width / 2,
										y: box.y - box.height / 2,
									}
								: world;
						})()
					: kind === 'object'
						? {
								x: map.objects[hit]?.x ?? world.x,
								y: map.objects[hit]?.y ?? world.y,
							}
						: {
								x: map.spawnMarkers[hit]?.x ?? world.x,
								y: map.spawnMarkers[hit]?.y ?? world.y,
							};
			gestureRef.current = {
				anchor,
				base: map,
				clickedIndex: hit,
				entity: kind,
				hasMoved: false,
				indices,
				kind: 'move',
				pointerId: event.pointerId,
				shouldCollapseSelection:
					!isToggle && p.selection.has(hit) && p.selection.size > 1,
				startClient: { x: event.clientX, y: event.clientY },
				startWorld: world,
			};
			return;
		}
		if (p.tool === 'place') {
			const x = event.altKey ? world.x : snapToStep(world.x, p.snapStep);
			const y = event.altKey ? world.y : snapToStep(world.y, p.snapStep);
			const result =
				kind === 'object'
					? addObject(map, p.brush?.cells[0]?.tile ?? '', x, y)
					: addSpawn(map, x, y);
			if (typeof result === 'string') {
				p.onNotice(result, 'error');
				return;
			}
			if (commit(result.map, map))
				p.onSelectionChange(kind, new Set(result.indices));
			return;
		}
		gestureRef.current = {
			base: map,
			current: world,
			entity: kind,
			initial: isToggle ? p.selection : EMPTY_SET,
			isAdditive: isToggle,
			kind: 'marquee',
			pointerId: event.pointerId,
			preview: isToggle ? p.selection : EMPTY_SET,
			start: world,
			startClient: { x: event.clientX, y: event.clientY },
		};
	}

	function startCameraPointer(
		event: PointerEvent<HTMLDivElement>,
		world: IMapPoint
	) {
		const p = propsRef.current;
		const map = readShownMap();
		const rect = getCameraRect(map.camera.bounds);
		if (p.tool === 'rectangle' || !rect) {
			if (p.tool !== 'rectangle') {
				p.onNotice(
					'还没有相机范围，使用矩形工具在画布上拖出。',
					'info'
				);
				return;
			}
			const start = event.altKey
				? world
				: {
						x: snapToStep(world.x, p.snapStep),
						y: snapToStep(world.y, p.snapStep),
					};
			gestureRef.current = {
				base: map,
				current: start,
				isErase: false,
				kind: 'rect',
				pointerId: event.pointerId,
				purpose: 'camera',
				start,
				startClient: { x: event.clientX, y: event.clientY },
			};
			return;
		}
		const handle = hitTestRectHandle(rect, world, viewRef.current.scale);
		if (handle) {
			p.onCameraSelect(true);
			gestureRef.current = {
				base: map,
				entity: 'camera',
				handle,
				index: 0,
				kind: 'resize',
				pointerId: event.pointerId,
				startRect: rect,
			};
			return;
		}
		if (isPointInRect(world, rect)) {
			p.onCameraSelect(true);
			gestureRef.current = {
				anchor: { x: rect.minX, y: rect.minY },
				base: map,
				clickedIndex: 0,
				entity: 'camera',
				hasMoved: false,
				indices: EMPTY_SET,
				kind: 'move',
				pointerId: event.pointerId,
				shouldCollapseSelection: false,
				startClient: { x: event.clientX, y: event.clientY },
				startWorld: world,
			};
			return;
		}
		p.onCameraSelect(false);
	}

	function withCameraRect(map: IDayMap, rect: IMapRect): IDayMap {
		return {
			...map,
			camera: {
				...map.camera,
				bounds: [rect.minX, rect.minY, rect.maxX, rect.maxY].map(
					roundMapValue
				),
			},
		};
	}

	/** 画布上的浮动控件自己处理指针，不触发绘制。 */
	function isCanvasEvent(event: PointerEvent<HTMLDivElement>) {
		return event.target === event.currentTarget;
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		const container = containerRef.current;
		if (!container || !isCanvasEvent(event)) return;
		if (event.pointerType === 'touch') {
			touchesRef.current.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			});
			if (touchesRef.current.size === 2) {
				cancelGesture();
				const points = [...touchesRef.current.values()];
				const [a, b] = points;
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
		const cell = getCellAt(world);
		const isPan =
			event.button === 1 || isSpaceHeldRef.current || p.tool === 'hand';
		container.setPointerCapture(event.pointerId);
		if (isPan) {
			startPan(event);
			scheduleRender();
			return;
		}
		if (p.isReadOnly) {
			releaseCapture(event.pointerId);
			return;
		}
		const isRight = event.button === 2;
		if (p.mode === 'tile' || p.mode === 'height') {
			const target: TStrokeTarget = p.mode === 'tile' ? 'tile' : 'height';
			if (event.altKey && !isRight) {
				applyPicker(cell, false);
				releaseCapture(event.pointerId);
				return;
			}
			if (p.tool === 'picker') {
				if (!isRight) applyPicker(cell, true);
				releaseCapture(event.pointerId);
				return;
			}
			if (p.tool === 'select') {
				if (!isRight) {
					const picked =
						p.mode === 'tile'
							? pickCell(
									readShownMap(),
									cell,
									p.activeLayerIndex,
									p.hiddenLayers
								)
							: null;
					p.onCellSelect(
						picked
							? { layerIndex: picked.layerIndex, ...cell }
							: null
					);
				}
				releaseCapture(event.pointerId);
				return;
			}
			if (p.tool === 'fill') {
				const error = checkPaintable(target, isRight);
				if (error) p.onNotice(error, 'error');
				else {
					const base = readShownMap();
					const result = fillArea(
						base,
						cell,
						target,
						p.activeLayerIndex,
						p.brush,
						p.slope,
						isRight
					);
					if (result.error) p.onNotice(result.error, 'error');
					else {
						commit(result.map, base);
						if (result.notice) p.onNotice(result.notice, 'info');
						else noticeHiddenMaterial(target, isRight);
					}
				}
				releaseCapture(event.pointerId);
				return;
			}
			if (p.tool === 'rectangle') {
				const error = checkPaintable(target, isRight);
				if (error) {
					p.onNotice(error, 'error');
					releaseCapture(event.pointerId);
					return;
				}
				noticeHiddenMaterial(target, isRight);
				gestureRef.current = {
					base: readShownMap(),
					current: cell,
					isErase: isRight,
					kind: 'rect',
					pointerId: event.pointerId,
					purpose: target,
					start: cell,
					startClient: { x: event.clientX, y: event.clientY },
				};
				scheduleRender();
				return;
			}
			if (p.tool === 'brush' || p.tool === 'eraser') {
				startStroke(
					event,
					cell,
					target,
					isRight || p.tool === 'eraser'
				);
				if (!gestureRef.current) releaseCapture(event.pointerId);
				scheduleRender();
				return;
			}
			releaseCapture(event.pointerId);
			return;
		}
		if (isRight) {
			releaseCapture(event.pointerId);
			return;
		}
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (kind) startEntityPointer(event, world, kind);
		else if (p.mode === 'map') startCameraPointer(event, world);
		if (!gestureRef.current) releaseCapture(event.pointerId);
		scheduleRender();
	}

	function releaseCapture(pointerId: number) {
		const container = containerRef.current;
		if (container?.hasPointerCapture(pointerId))
			container.releasePointerCapture(pointerId);
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
			updateHover(isCanvasEvent(event) ? world : null);
			scheduleRender();
			return;
		}
		hoverRef.current.world = world;
		hoverRef.current.cell = getCellAt(world);
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
				const line = getLineCells(gesture.lastCell, cell);
				for (const point of line.slice(1)) stampStroke(gesture, point);
				gesture.lastCell = cell;
				break;
			}
			case 'rect': {
				gesture.current =
					gesture.purpose === 'tile' || gesture.purpose === 'height'
						? getCellAt(world)
						: event.altKey
							? world
							: {
									x: snapToStep(world.x, p.snapStep),
									y: snapToStep(world.y, p.snapStep),
								};
				break;
			}
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
				const target = {
					x: gesture.anchor.x + world.x - gesture.startWorld.x,
					y: gesture.anchor.y + world.y - gesture.startWorld.y,
				};
				const snapped = event.altKey
					? target
					: {
							x: snapToStep(target.x, p.snapStep),
							y: snapToStep(target.y, p.snapStep),
						};
				const dx = roundMapValue(snapped.x - gesture.anchor.x);
				const dy = roundMapValue(snapped.y - gesture.anchor.y);
				if (gesture.entity === 'camera') {
					const rect = getCameraRect(gesture.base.camera.bounds);
					draftRef.current = rect
						? withCameraRect(gesture.base, {
								maxX: rect.maxX + dx,
								maxY: rect.maxY + dy,
								minX: rect.minX + dx,
								minY: rect.minY + dy,
							})
						: null;
				} else
					draftRef.current = moveEntities(
						gesture.base,
						gesture.entity,
						gesture.indices,
						dx,
						dy
					);
				break;
			}
			case 'resize': {
				const rect = resizeRectWithHandle(
					gesture.startRect,
					gesture.handle,
					world,
					event.altKey ? 0 : p.snapStep
				);
				draftRef.current =
					gesture.entity === 'camera'
						? withCameraRect(gesture.base, rect)
						: replaceCollisionRect(
								gesture.base,
								gesture.index,
								rect
							);
				break;
			}
			case 'marquee': {
				gesture.current = world;
				const rect = normalizeRect(gesture.start, world);
				const hits = collectEntitiesInRect(
					gesture.base,
					gesture.entity,
					rect
				);
				gesture.preview = new Set([...gesture.initial, ...hits]);
				break;
			}
			case 'pinch':
				break;
		}
		scheduleRender();
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
				finishStroke(gesture);
				break;
			case 'rect': {
				const rect = normalizeRect(gesture.start, gesture.current);
				if (
					gesture.purpose === 'tile' ||
					gesture.purpose === 'height'
				) {
					const result = fillRect(
						gesture.base,
						rect,
						gesture.purpose,
						p.activeLayerIndex,
						p.brush,
						p.slope,
						gesture.isErase
					);
					if (result.error) p.onNotice(result.error, 'error');
					else {
						commit(result.map, gesture.base);
						if (result.notice) p.onNotice(result.notice, 'info');
					}
					break;
				}
				const isClick =
					Math.hypot(
						event.clientX - gesture.startClient.x,
						event.clientY - gesture.startClient.y
					) < DRAG_THRESHOLD_PX ||
					!(rect.maxX - rect.minX > 0) ||
					!(rect.maxY - rect.minY > 0);
				if (gesture.purpose === 'camera') {
					if (isClick) break;
					if (
						commit(withCameraRect(gesture.base, rect), gesture.base)
					)
						p.onCameraSelect(true);
					break;
				}
				if (isClick) {
					const hit = hitTestEntity(
						gesture.base,
						'collision',
						gesture.start,
						viewRef.current.scale
					);
					p.onSelectionChange(
						'collision',
						hit >= 0 ? new Set([hit]) : EMPTY_SET
					);
					break;
				}
				const result = addCollision(gesture.base, rect);
				if (typeof result === 'string') p.onNotice(result, 'error');
				else if (commit(result.map, gesture.base))
					p.onSelectionChange('collision', new Set(result.indices));
				break;
			}
			case 'move': {
				const draft = draftRef.current;
				if (gesture.hasMoved && draft) commit(draft, gesture.base);
				else {
					draftRef.current = null;
					if (
						gesture.shouldCollapseSelection &&
						gesture.entity !== 'camera'
					)
						p.onSelectionChange(
							gesture.entity,
							new Set([gesture.clickedIndex])
						);
				}
				break;
			}
			case 'resize': {
				const draft = draftRef.current;
				if (draft) commit(draft, gesture.base);
				break;
			}
			case 'marquee': {
				const isClick =
					Math.hypot(
						event.clientX - gesture.startClient.x,
						event.clientY - gesture.startClient.y
					) < DRAG_THRESHOLD_PX;
				p.onSelectionChange(
					gesture.entity,
					isClick ? gesture.initial : gesture.preview
				);
				break;
			}
			case 'pan':
			case 'pinch':
				break;
		}
		const { world } = readPointer(event);
		updateHover(event.pointerType === 'touch' ? null : world);
		scheduleRender();
	}

	function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === 'touch') {
			touchesRef.current.delete(event.pointerId);
			if (gestureRef.current?.kind === 'pinch') {
				if (touchesRef.current.size < 2) gestureRef.current = null;
				scheduleRender();
				return;
			}
		}
		finishGesture(event);
	}

	function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
		touchesRef.current.delete(event.pointerId);
		const gesture = gestureRef.current;
		if (!gesture) return;
		if (gesture.kind === 'pinch') {
			if (touchesRef.current.size < 2) gestureRef.current = null;
			return;
		}
		if (gesture.pointerId === event.pointerId) cancelGesture();
	}

	function handlePointerLeave(event: PointerEvent<HTMLDivElement>) {
		if (gestureRef.current) return;
		if (event.pointerType === 'touch') return;
		updateHover(null);
		scheduleRender();
	}

	/* ── 键盘 ─────────────────────────────────────────── */

	function nudgeSelection(dx: number, dy: number) {
		const p = propsRef.current;
		const map = readShownMap();
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (p.mode === 'map' && p.isCameraSelected) {
			const rect = getCameraRect(map.camera.bounds);
			if (rect)
				commit(
					withCameraRect(map, {
						maxX: rect.maxX + dx,
						maxY: rect.maxY + dy,
						minX: rect.minX + dx,
						minY: rect.minY + dy,
					}),
					map
				);
			return true;
		}
		if (!kind || p.selection.size === 0) return false;
		commit(moveEntities(map, kind, p.selection, dx, dy), map);
		return true;
	}

	function applyKeyboardTool(cell: IMapPoint, isDelete: boolean) {
		const p = propsRef.current;
		const target: TStrokeTarget = p.mode === 'tile' ? 'tile' : 'height';
		if (p.tool === 'picker') {
			applyPicker(cell, true);
			return;
		}
		if (p.tool === 'select' && p.mode === 'tile') {
			const picked = pickCell(
				readShownMap(),
				cell,
				p.activeLayerIndex,
				p.hiddenLayers
			);
			p.onCellSelect(
				picked ? { layerIndex: picked.layerIndex, ...cell } : null
			);
			return;
		}
		const isErase = isDelete || p.tool === 'eraser';
		const error = checkPaintable(target, isErase);
		if (error) {
			p.onNotice(error, 'error');
			return;
		}
		const base = readShownMap();
		if (p.tool === 'fill' && !isDelete) {
			const result = fillArea(
				base,
				cell,
				target,
				p.activeLayerIndex,
				p.brush,
				p.slope,
				false
			);
			if (result.error) p.onNotice(result.error, 'error');
			else commit(result.map, base);
			return;
		}
		const gesture: Extract<TGesture, { kind: 'stroke' }> = {
			base,
			isDraftDirty: false,
			isErase,
			kind: 'stroke',
			lastCell: cell,
			layerIndex: p.activeLayerIndex,
			pointerId: -1,
			state: createStrokeState(base, target, p.activeLayerIndex),
			target,
		};
		stampStroke(gesture, cell);
		finishStroke(gesture);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.target !== event.currentTarget) return;
		const p = propsRef.current;
		if (event.key === 'Escape') {
			if (gestureRef.current) {
				event.preventDefault();
				event.stopPropagation();
				cancelGesture();
				return;
			}
			const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
			if (kind && p.selection.size > 0) {
				event.preventDefault();
				p.onSelectionChange(kind, EMPTY_SET);
			} else if (p.cellSelection) {
				event.preventDefault();
				p.onCellSelect(null);
			} else if (p.isCameraSelected) {
				event.preventDefault();
				p.onCameraSelect(false);
			}
			return;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const steps: Record<string, IMapPoint> = {
			ArrowDown: { x: 0, y: -1 },
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: 1 },
		};
		const step = steps[event.key];
		if (step) {
			event.preventDefault();
			if (!p.isReadOnly) {
				const distance = event.shiftKey
					? 1
					: p.snapStep > 0
						? p.snapStep
						: 0.125;
				if (nudgeSelection(step.x * distance, step.y * distance))
					return;
			}
			const view = viewRef.current;
			const current = keyboardCellRef.current ?? getCellAt(view);
			const next = {
				x: Math.max(-4096, Math.min(4095, current.x + step.x)),
				y: Math.max(-4096, Math.min(4095, current.y + step.y)),
			};
			keyboardCellRef.current = next;
			hoverRef.current.cell = next;
			hoverRef.current.world = { x: next.x + 0.5, y: next.y + 0.5 };
			const { height, width } = sizeRef.current;
			const margin = 2;
			const halfWidth = width / 2 / view.scale - margin;
			const halfHeight = height / 2 / view.scale - margin;
			if (
				Math.abs(next.x + 0.5 - view.x) > halfWidth ||
				Math.abs(next.y + 0.5 - view.y) > halfHeight
			)
				setView({ ...view, x: next.x + 0.5, y: next.y + 0.5 }, true);
			scheduleRender();
			return;
		}
		if (p.isReadOnly) return;
		const kind = MAP_ENTITY_KIND_BY_MODE[p.mode];
		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (kind && p.selection.size > 0) {
				event.preventDefault();
				const map = readShownMap();
				if (commit(deleteEntities(map, kind, p.selection), map))
					p.onSelectionChange(kind, EMPTY_SET);
				return;
			}
			if (
				(p.mode === 'tile' || p.mode === 'height') &&
				keyboardCellRef.current
			) {
				event.preventDefault();
				applyKeyboardTool(keyboardCellRef.current, true);
			}
			return;
		}
		if (event.key === 'Enter') {
			const cell = keyboardCellRef.current ?? hoverRef.current.cell;
			if ((p.mode === 'tile' || p.mode === 'height') && cell) {
				event.preventDefault();
				applyKeyboardTool(cell, false);
			}
		}
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		const files = [...event.dataTransfer.files];
		if (files.length === 0) return;
		event.preventDefault();
		propsRef.current.onDropFiles(files);
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
				const delta = event.deltaY * unit;
				const intensity =
					event.ctrlKey || event.metaKey ? 0.01 : 0.0022;
				zoomAround(Math.exp(-delta * intensity), screen);
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
			if (!gestureRef.current) {
				updateHover(readPointer(event).world);
			}
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

	const { activeLayerIndex, map, mode, tool } = props;
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
		// 工具、模式或图层切换时放弃未完成的操作。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeLayerIndex, mode, tool]);

	const { assetUrls, packLabel } = props;
	useEffect(() => {
		const urls = new Set<string>();
		for (const tile of map.tiles) {
			const url = resolveMapImageUrl(tile.image, packLabel, assetUrls);
			if (url) urls.add(url);
		}
		rendererRef.current?.renderer.textureStore.retain(urls);
	}, [assetUrls, map.tiles, packLabel]);

	useEffect(() => {
		scheduleRender();
	});

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			role="application"
			aria-roledescription="地图画布"
			aria-label="地图画布。方向键移动格子光标，回车使用当前工具，Delete 删除；滚轮缩放，按住空格或中键拖动平移。"
			className={cn(
				'relative h-full w-full touch-none select-none overflow-hidden outline-none',
				'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
			)}
			onContextMenu={(event) => event.preventDefault()}
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
