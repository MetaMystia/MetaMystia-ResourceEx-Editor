'use client';

import { cn } from '@heroui/theme';
import {
	type ReactNode,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import Tooltip from '@/design/ui/components/tooltip';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import {
	getDayMapAssetReferences,
	resolveDayMapAssetPath,
} from '@/domain/resourcePack/dayMapAssets';
import {
	DAY_MAP_FORMAT_VERSION,
	validateDayMap,
} from '@/domain/resourcePack/dayMapValidation';

import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { safeStorage } from '@/infrastructure/browser/storage/safeStorage';

import {
	DEFAULT_MAP_SNAP_STEP,
	DEFAULT_MAP_TOOL_BY_MODE,
	DEFAULT_MAP_VIEW_OPTIONS,
	type IMapPoint,
	type IMapRect,
	type IMapVertexSelection,
	type IMapViewOptions,
	isToolAvailable,
	MAP_BRUSH_SIZE_MAX,
	MAP_ENTITY_KIND_BY_MODE,
	MAP_MODES,
	MAP_SNAP_STEPS,
	MAP_TOOL_SHORTCUTS,
	MAP_ZOOM_REFERENCE_PX_PER_UNIT,
	type TColliderTarget,
	type TMapEntityKind,
	type TMapMode,
	type TMapTool,
} from './dayMapEditorModel';
import {
	deleteEntities,
	duplicateEntities,
	getEntityCount,
	getTargetWorldColliders,
	isTargetValid,
	removeVertex,
	replaceCollider,
} from './dayMapEdits';
import {
	getColliderRect,
	getLayerRect,
	getObjectRect,
	getPointsRect,
	getPrefabIndex,
} from './dayMapSpatial';
import DayMapViewport, { type IDayMapViewportHandle } from './DayMapViewport';
import {
	type IMapNotice,
	MapNoticeToast,
	MapStatusBar,
	MapToolOptions,
	MapToolRail,
	MapViewMenu,
	MapZoomControls,
} from './MapCanvasChrome';
import { canHandleMapShortcut } from './mapShortcuts';
import { MapTopBar } from './MapTopBar';
import { MapViewportStore } from './mapViewportStore';
import {
	ColliderInspector,
	ColliderTargetPanel,
	EntityListPanel,
	MultiSelectionPanel,
	ObjectInspector,
	SpawnInspector,
} from './panels/EntityPanels';
import { LayerPanel } from './panels/LayerPanel';
import { MapSettingsPanel } from './panels/MapSettingsPanel';
import { PrefabPanel } from './panels/PrefabPanel';
import { SlopePanel } from './panels/SlopePanel';
import { useDayMapHistory } from './useDayMapHistory';
import { type TMapAudioTarget, useMapAssetImport } from './useMapAssetImport';

const EMPTY_SET: ReadonlySet<number> = new Set();
const EMPTY_SELECTIONS: Record<TMapEntityKind, ReadonlySet<number>> = {
	collider: EMPTY_SET,
	object: EMPTY_SET,
	spawn: EMPTY_SET,
};
const MAP_TARGET: TColliderTarget = { kind: 'map' };
const VIEW_OPTIONS_STORAGE_KEY = 'dayMapEditor:viewOptions';
const VIEW_OPTION_KEYS = [
	'shouldDimInactiveLayers',
	'shouldShowCollisions',
	'shouldShowGrid',
	'shouldShowSlopes',
	'shouldShowViewportPreview',
] as const satisfies readonly (keyof IMapViewOptions)[];
const SNAP_STEP_STORAGE_KEY = 'dayMapEditor:snapStep';
const TOOLS = Object.keys(MAP_TOOL_SHORTCUTS).filter(
	(tool): tool is TMapTool => tool in MAP_TOOL_SHORTCUTS
);

function readStoredViewOptions(): IMapViewOptions {
	try {
		const parsed: unknown = JSON.parse(
			safeStorage.getItem(VIEW_OPTIONS_STORAGE_KEY) ?? '{}'
		);
		if (typeof parsed !== 'object' || parsed === null)
			return DEFAULT_MAP_VIEW_OPTIONS;
		const options: IMapViewOptions = { ...DEFAULT_MAP_VIEW_OPTIONS };
		for (const key of VIEW_OPTION_KEYS) {
			const value: unknown = Reflect.get(parsed, key);
			if (typeof value === 'boolean') options[key] = value;
		}
		return options;
	} catch {
		return DEFAULT_MAP_VIEW_OPTIONS;
	}
}

function readStoredSnapStep() {
	const stored = safeStorage.getItem(SNAP_STEP_STORAGE_KEY);
	const value = Number(stored);
	return stored !== null && MAP_SNAP_STEPS.some((step) => step === value)
		? value
		: DEFAULT_MAP_SNAP_STEP;
}

function unionRects(rects: readonly (IMapRect | null)[]): IMapRect | null {
	let result: IMapRect | null = null;
	for (const rect of rects) {
		if (!rect) continue;
		result = result
			? {
					maxX: Math.max(result.maxX, rect.maxX),
					maxY: Math.max(result.maxY, rect.maxY),
					minX: Math.min(result.minX, rect.minX),
					minY: Math.min(result.minY, rect.minY),
				}
			: rect;
	}
	return result;
}

function CanvasBadge({ children, tip }: { children: string; tip: string }) {
	return (
		<Tooltip content={tip}>
			<span className="shrink-0 cursor-default rounded-small bg-warning/25 px-1.5 py-0.5 text-[11px] font-medium text-warning-700 dark:text-warning">
				{children}
			</span>
		</Tooltip>
	);
}

interface IProps {
	index: number;
	map: IDayMap;
	mapControls: ReactNode;
}

export function DayMapEditor({ index, map, mapControls }: IProps) {
	const { assets, resourcePack } = useResourceEditor();
	const assetUrls = assets.urls;
	const packLabel = resourcePack.packInfo.label ?? '';
	const isReadOnly = map.formatVersion !== DAY_MAP_FORMAT_VERSION;
	const { canRedo, canUndo, commit, readLatestMap, redo, undo } =
		useDayMapHistory({ index, isReadOnly, map });
	const { importAudio, importLayer, importPrefab, isImporting } =
		useMapAssetImport({ commit, readLatestMap });
	const isReducedMotion = useReducedMotion();
	const rootRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<IDayMapViewportHandle>(null);
	const [store] = useState(() => new MapViewportStore());
	const [mode, setMode] = useState<TMapMode>('layer');
	const [toolByMode, setToolByMode] = useState<Record<TMapMode, TMapTool>>(
		() => ({ ...DEFAULT_MAP_TOOL_BY_MODE })
	);
	const [layerIndex, setLayerIndex] = useState(0);
	const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<number>>(
		() => new Set()
	);
	const [selections, setSelections] = useState(EMPTY_SELECTIONS);
	const [selectedVertex, setSelectedVertex] =
		useState<IMapVertexSelection | null>(null);
	const [colliderTarget, setColliderTarget] =
		useState<TColliderTarget>(MAP_TARGET);
	const [placePrefab, setPlacePrefab] = useState<string | null>(
		() => map.prefabs[0]?.key ?? null
	);
	const [brushSize, setBrushSize] = useState(1);
	const [slope, setSlope] = useState(0.5);
	const [viewOptions, setViewOptions] = useState<IMapViewOptions>(
		DEFAULT_MAP_VIEW_OPTIONS
	);
	const [snapStep, setSnapStep] = useState<number>(DEFAULT_MAP_SNAP_STEP);
	const [notice, setNotice] = useState<IMapNotice | null>(null);
	const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
	const noticeIdRef = useRef(0);

	useEffect(() => {
		setViewOptions(readStoredViewOptions());
		setSnapStep(readStoredSnapStep());
	}, []);

	// 锚点物件被删除或换了模板库时回到编辑地图碰撞。
	const target = isTargetValid(map, colliderTarget)
		? colliderTarget
		: MAP_TARGET;
	const tool = toolByMode[mode];
	const entityKind = MAP_ENTITY_KIND_BY_MODE[mode];
	const activeLayerIndex = Math.min(
		layerIndex,
		Math.max(0, map.layers.length - 1)
	);
	const activePrefab =
		placePrefab && map.prefabs.some((prefab) => prefab.key === placePrefab)
			? placePrefab
			: null;
	const selection = useMemo(() => {
		if (!entityKind) return EMPTY_SET;
		const indices = selections[entityKind];
		const count = getEntityCount(map, entityKind, target);
		return [...indices].every((value) => value < count)
			? indices
			: new Set([...indices].filter((value) => value < count));
	}, [entityKind, map, selections, target]);

	const showNotice = useCallback(
		(message: string, tone: 'error' | 'info' = 'info') => {
			noticeIdRef.current += 1;
			setNotice({ id: noticeIdRef.current, message, tone });
		},
		[]
	);
	const dismissNotice = useCallback(() => setNotice(null), []);

	const handleCommit = useCallback(
		(next: IDayMap) => {
			const result = commit(next);
			if (!result.isSuccess && result.error)
				showNotice(result.error, 'error');
			return result;
		},
		[commit, showNotice]
	);

	const clearSelections = useCallback(() => {
		setSelections(EMPTY_SELECTIONS);
		setSelectedVertex(null);
	}, []);

	const handleUndo = useCallback(() => {
		viewportRef.current?.cancelGesture();
		const result = undo();
		if (result.isSuccess) clearSelections();
		else if (result.error)
			showNotice(result.error, canUndo ? 'error' : 'info');
	}, [canUndo, clearSelections, showNotice, undo]);

	const handleRedo = useCallback(() => {
		viewportRef.current?.cancelGesture();
		const result = redo();
		if (result.isSuccess) clearSelections();
		else if (result.error)
			showNotice(result.error, canRedo ? 'error' : 'info');
	}, [canRedo, clearSelections, redo, showNotice]);

	const handleModeChange = useCallback((next: TMapMode) => {
		viewportRef.current?.cancelGesture();
		setSelectedVertex(null);
		setMode(next);
	}, []);

	const handleToolChange = useCallback(
		(next: TMapTool) => {
			if (!isToolAvailable(mode, next)) return;
			setToolByMode((current) =>
				current[mode] === next ? current : { ...current, [mode]: next }
			);
		},
		[mode]
	);

	const handleSelectionChange = useCallback(
		(kind: TMapEntityKind, indices: ReadonlySet<number>) => {
			setSelections((current) =>
				current[kind] === indices
					? current
					: { ...current, [kind]: indices }
			);
			setSelectedVertex(null);
		},
		[]
	);

	const handleViewOptionsChange = useCallback((next: IMapViewOptions) => {
		setViewOptions(next);
		safeStorage.setItem(VIEW_OPTIONS_STORAGE_KEY, JSON.stringify(next));
	}, []);

	const handleSnapStepChange = useCallback((next: number) => {
		setSnapStep(next);
		safeStorage.setItem(SNAP_STEP_STORAGE_KEY, String(next));
	}, []);

	const handleColliderTargetChange = useCallback(
		(next: TColliderTarget) => {
			viewportRef.current?.cancelGesture();
			setColliderTarget(next);
			setSelections((current) => ({ ...current, collider: EMPTY_SET }));
			setSelectedVertex(null);
			if (next.kind === 'prefab') {
				setMode('collision');
				const object = map.objects[next.objectIndex];
				const prefab =
					object &&
					map.prefabs.find((item) => item.key === object.prefab);
				if (object && prefab)
					viewportRef.current?.revealRect(
						getObjectRect(object, prefab)
					);
			}
		},
		[map]
	);

	const getEntityRect = useCallback(
		(kind: TMapEntityKind, entityIndex: number): IMapRect | null => {
			if (kind === 'spawn') {
				const marker = map.spawnMarkers[entityIndex];
				return marker
					? {
							maxX: marker.x + 1,
							maxY: marker.y + 1,
							minX: marker.x - 1,
							minY: marker.y - 1,
						}
					: null;
			}
			if (kind === 'object') {
				const object = map.objects[entityIndex];
				return object
					? getObjectRect(
							object,
							getPrefabIndex(map).get(object.prefab)
						)
					: null;
			}
			const collider = getTargetWorldColliders(map, target)[entityIndex];
			return collider ? getColliderRect(collider) : null;
		},
		[map, target]
	);

	const focusEntity = useCallback(
		(kind: TMapEntityKind, entityIndex: number) => {
			const rect = getEntityRect(kind, entityIndex);
			if (rect) viewportRef.current?.revealRect(rect);
		},
		[getEntityRect]
	);

	const focusSelectionOrFit = useCallback(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		if (entityKind && selection.size > 0) {
			const rect = unionRects(
				[...selection].map((value) => getEntityRect(entityKind, value))
			);
			if (rect) {
				viewport.fitRect(rect);
				return;
			}
		}
		const layer = map.layers[activeLayerIndex];
		if (mode === 'layer' && layer) {
			viewport.fitRect(getLayerRect(map, layer));
			return;
		}
		if (mode === 'map' && map.camera.bounds.length > 0) {
			viewport.fitRect(getPointsRect(map.camera.bounds));
			return;
		}
		viewport.fit();
	}, [activeLayerIndex, entityKind, getEntityRect, map, mode, selection]);

	const duplicateSelection = useCallback(() => {
		if (!entityKind || selection.size === 0 || isReadOnly) return;
		const offset = snapStep > 0 ? Math.max(snapStep, 0.5) : 0.5;
		const result = duplicateEntities(
			map,
			entityKind,
			selection,
			offset,
			-offset,
			target
		);
		if (typeof result === 'string') {
			showNotice(result, 'error');
			return;
		}
		if (handleCommit(result.map).isSuccess)
			handleSelectionChange(entityKind, new Set(result.indices));
	}, [
		entityKind,
		handleCommit,
		handleSelectionChange,
		isReadOnly,
		map,
		selection,
		showNotice,
		snapStep,
		target,
	]);

	/** Delete：选中顶点时删除顶点，否则删除选中的实体。 */
	const deleteSelection = useCallback(() => {
		if (isReadOnly) return;
		if (selectedVertex && mode === 'map') {
			if (map.camera.bounds.length <= 3) {
				showNotice('相机多边形至少需要 3 个顶点。', 'error');
				return;
			}
			const bounds = map.camera.bounds.filter(
				(_, i) => i !== selectedVertex.pointIndex
			);
			if (
				handleCommit({ ...map, camera: { ...map.camera, bounds } })
					.isSuccess
			)
				setSelectedVertex(null);
			return;
		}
		if (
			selectedVertex &&
			entityKind === 'collider' &&
			selection.size === 1
		) {
			const [colliderIndex = -1] = selection;
			const collider = getTargetWorldColliders(map, target)[
				colliderIndex
			];
			if (!collider) return;
			const next = removeVertex(collider, selectedVertex);
			const result = next
				? handleCommit(
						replaceCollider(map, target, colliderIndex, next)
					)
				: handleCommit(
						deleteEntities(map, 'collider', selection, target)
					);
			if (result.isSuccess) {
				setSelectedVertex(null);
				if (!next) handleSelectionChange('collider', EMPTY_SET);
			}
			return;
		}
		if (
			entityKind &&
			selection.size > 0 &&
			handleCommit(deleteEntities(map, entityKind, selection, target))
				.isSuccess
		)
			handleSelectionChange(entityKind, EMPTY_SET);
	}, [
		entityKind,
		handleCommit,
		handleSelectionChange,
		isReadOnly,
		map,
		mode,
		selectedVertex,
		selection,
		showNotice,
		target,
	]);

	const handleImportLayer = useCallback(
		async (file: File, replaceIndex: number | null, center?: IMapPoint) => {
			const ppu = readLatestMap().pixelsPerUnit;
			const anchor = center ?? viewportRef.current?.getViewCenter();
			const result = await importLayer(
				file,
				replaceIndex,
				anchor && {
					x: Math.round(anchor.x * ppu),
					y: Math.round(anchor.y * ppu),
				}
			);
			if (result.error) {
				showNotice(result.error, 'error');
				return;
			}
			if (result.result === undefined) return;
			setLayerIndex(result.result);
			setMode('layer');
			showNotice(
				replaceIndex === null
					? `已导入图层 ${file.name}。`
					: `已替换图层图片 ${file.name}。`,
				'info'
			);
		},
		[importLayer, readLatestMap, showNotice]
	);

	const handleImportPrefab = useCallback(
		async (file: File) => {
			const result = await importPrefab(file);
			if (result.error) {
				showNotice(result.error, 'error');
				return;
			}
			if (result.result === undefined) return;
			setPlacePrefab(result.result);
			setMode('object');
			setToolByMode((current) => ({ ...current, object: 'place' }));
			showNotice(
				`已导入物件模板 ${result.result}，在画布上点击放置。`,
				'info'
			);
		},
		[importPrefab, showNotice]
	);

	const handleUploadAudio = useCallback(
		async (file: File, audioTarget: TMapAudioTarget) => {
			const result = await importAudio(file, audioTarget);
			if (result.error) showNotice(result.error, 'error');
			else if (result.result)
				showNotice(`已导入音乐 ${file.name}。`, 'info');
		},
		[importAudio, showNotice]
	);

	const handleDropFiles = useCallback(
		(files: File[], world: IMapPoint) => {
			const image = files.find((file) => /\.png$/i.test(file.name));
			if (!image) {
				showNotice(
					'只能把 PNG 拖到画布上；音乐请在“地图”中上传。',
					'error'
				);
				return;
			}
			if (isReadOnly) return;
			if (mode === 'object') void handleImportPrefab(image);
			else void handleImportLayer(image, null, world);
		},
		[handleImportLayer, handleImportPrefab, isReadOnly, mode, showNotice]
	);

	/* ── 快捷键 ─────────────────────────────────────── */

	const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
	shortcutRef.current = (event) => {
		if (!canHandleMapShortcut(event, rootRef.current)) return;
		const { key } = event;
		const lower = key.toLowerCase();
		const viewport = viewportRef.current;
		if (event.ctrlKey || event.metaKey) {
			if (event.altKey) return;
			if (lower === 'z') {
				event.preventDefault();
				if (event.shiftKey) handleRedo();
				else handleUndo();
			} else if (lower === 'y') {
				event.preventDefault();
				handleRedo();
			} else if (lower === 'd' && entityKind && selection.size > 0) {
				event.preventDefault();
				duplicateSelection();
			} else if (lower === 'a' && entityKind) {
				event.preventDefault();
				handleSelectionChange(
					entityKind,
					new Set(
						Array.from(
							{ length: getEntityCount(map, entityKind, target) },
							(_, i) => i
						)
					)
				);
			}
			return;
		}
		if (event.altKey) return;
		if (key === '?') {
			event.preventDefault();
			setIsShortcutHelpOpen((value) => !value);
			return;
		}
		if (/^[1-6]$/.test(key)) {
			const next = MAP_MODES[Number(key) - 1];
			if (next) {
				event.preventDefault();
				handleModeChange(next.value);
			}
			return;
		}
		if (!event.shiftKey) {
			const nextTool = TOOLS.find(
				(item) => MAP_TOOL_SHORTCUTS[item].toLowerCase() === lower
			);
			if (nextTool) {
				if (
					isToolAvailable(mode, nextTool) &&
					!(isReadOnly && nextTool !== 'hand')
				) {
					event.preventDefault();
					handleToolChange(nextTool);
				}
				return;
			}
		}
		switch (key) {
			case '[':
				event.preventDefault();
				setBrushSize((value) => Math.max(1, value - 1));
				return;
			case ']':
				event.preventDefault();
				setBrushSize((value) =>
					Math.min(MAP_BRUSH_SIZE_MAX, value + 1)
				);
				return;
			case '+':
			case '=':
				event.preventDefault();
				viewport?.zoomBy(1.4);
				return;
			case '-':
			case '_':
				event.preventDefault();
				viewport?.zoomBy(1 / 1.4);
				return;
			case '0':
				event.preventDefault();
				viewport?.zoomTo(MAP_ZOOM_REFERENCE_PX_PER_UNIT);
				return;
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				deleteSelection();
				return;
			case 'Escape':
				if (selectedVertex) {
					event.preventDefault();
					setSelectedVertex(null);
				} else if (entityKind && selection.size > 0) {
					event.preventDefault();
					handleSelectionChange(entityKind, EMPTY_SET);
				}
				return;
		}
		if (lower === 'f') {
			event.preventDefault();
			focusSelectionOrFit();
		}
	};

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) =>
			shortcutRef.current(event);
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	/* ── 检查 ─────────────────────────────────────────── */

	const deferredMap = useDeferredValue(map);
	const issues = useMemo(() => {
		const missing = [
			...new Set(
				getDayMapAssetReferences(deferredMap).map(
					(reference) => reference.path
				)
			),
		]
			.filter((path) => {
				const local = resolveDayMapAssetPath(path, packLabel);
				return local !== null && !assetUrls[local];
			})
			.map((path) => `缺少包内资产：${path}`);
		return [...validateDayMap(deferredMap), ...missing];
	}, [assetUrls, deferredMap, packLabel]);

	const counts = useMemo(
		() => ({
			collision:
				map.colliders.length +
				map.prefabs.reduce(
					(count, prefab) => count + prefab.colliders.length,
					0
				),
			height: map.height?.cells.length ?? 0,
			layer: map.layers.length,
			object: map.objects.length,
			spawn: map.spawnMarkers.length,
		}),
		[map]
	);
	const disabledModes = useMemo(() => new Set<TMapMode>(), []);

	/* ── 侧栏 ─────────────────────────────────────────── */

	const [selectedIndex] = selection;
	const inspectorProps = {
		isReadOnly,
		map,
		onCommit: handleCommit,
		onDeleted: () => {
			if (entityKind) handleSelectionChange(entityKind, EMPTY_SET);
		},
	};
	const entityList = entityKind ? (
		<EntityListPanel
			colliderTarget={target}
			isReadOnly={isReadOnly}
			kind={entityKind}
			map={map}
			selection={selection}
			snapStep={snapStep}
			onCommit={handleCommit}
			onFocusEntity={(value) => focusEntity(entityKind, value)}
			onNotice={showNotice}
			onSelectionChange={handleSelectionChange}
		/>
	) : null;
	const multiSelection =
		entityKind && selection.size > 1 ? (
			<MultiSelectionPanel count={selection.size} kind={entityKind} />
		) : null;
	let sidePanels: ReactNode;
	switch (mode) {
		case 'layer':
			sidePanels = (
				<LayerPanel
					activeLayerIndex={activeLayerIndex}
					assetUrls={assetUrls}
					hiddenLayers={hiddenLayers}
					isImporting={isImporting}
					isReadOnly={isReadOnly}
					map={map}
					packLabel={packLabel}
					onActiveLayerChange={setLayerIndex}
					onCommit={handleCommit}
					onHiddenLayersChange={setHiddenLayers}
					onImport={(file, replaceIndex) =>
						void handleImportLayer(file, replaceIndex)
					}
					onNotice={showNotice}
				/>
			);
			break;
		case 'object':
			sidePanels = (
				<>
					{entityList}
					{selection.size === 1 && selectedIndex !== undefined ? (
						<ObjectInspector
							{...inspectorProps}
							index={selectedIndex}
							onEditColliders={() =>
								handleColliderTargetChange({
									kind: 'prefab',
									objectIndex: selectedIndex,
								})
							}
							onFocus={() => focusEntity('object', selectedIndex)}
							onPrefabSelect={setPlacePrefab}
						/>
					) : (
						multiSelection
					)}
					<PrefabPanel
						assetUrls={assetUrls}
						isImporting={isImporting}
						isReadOnly={isReadOnly}
						map={map}
						packLabel={packLabel}
						selectedKey={activePrefab}
						onCommit={handleCommit}
						onEditColliders={(objectIndex) =>
							handleColliderTargetChange({
								kind: 'prefab',
								objectIndex,
							})
						}
						onImport={(file) => void handleImportPrefab(file)}
						onSelectedKeyChange={(key) => {
							setPlacePrefab(key);
							if (key)
								setToolByMode((current) => ({
									...current,
									object: 'place',
								}));
						}}
					/>
				</>
			);
			break;
		case 'collision':
			sidePanels = (
				<>
					<ColliderTargetPanel
						colliderTarget={target}
						map={map}
						onExit={() => handleColliderTargetChange(MAP_TARGET)}
					/>
					{entityList}
					{selection.size === 1 && selectedIndex !== undefined ? (
						<ColliderInspector
							{...inspectorProps}
							colliderTarget={target}
							index={selectedIndex}
							onFocus={() =>
								focusEntity('collider', selectedIndex)
							}
						/>
					) : (
						multiSelection
					)}
				</>
			);
			break;
		case 'height':
			sidePanels = (
				<SlopePanel map={map} slope={slope} onSlopeChange={setSlope} />
			);
			break;
		case 'spawn':
			sidePanels = (
				<>
					{entityList}
					{selection.size === 1 && selectedIndex !== undefined ? (
						<SpawnInspector
							{...inspectorProps}
							index={selectedIndex}
							onFocus={() => focusEntity('spawn', selectedIndex)}
						/>
					) : (
						multiSelection
					)}
				</>
			);
			break;
		case 'map':
			sidePanels = (
				<MapSettingsPanel
					assetUrls={assetUrls}
					isImporting={isImporting}
					isReadOnly={isReadOnly}
					map={map}
					packLabel={packLabel}
					viewOptions={viewOptions}
					onCommit={handleCommit}
					onNotice={showNotice}
					onUploadAudio={(file, audioTarget) =>
						void handleUploadAudio(file, audioTarget)
					}
					onViewOptionsChange={handleViewOptionsChange}
				/>
			);
			break;
	}

	const badges = isReadOnly ? (
		<CanvasBadge
			tip={`当前编辑器只编辑画布地图（版本 ${DAY_MAP_FORMAT_VERSION}），原数据会原样保留。`}
		>
			只读
		</CanvasBadge>
	) : null;

	return (
		<div ref={rootRef} className="flex min-h-0 flex-1 flex-col gap-3">
			<MapTopBar
				badges={badges}
				canRedo={canRedo}
				canUndo={canUndo}
				counts={counts}
				disabledModes={disabledModes}
				isReadOnly={isReadOnly}
				isShortcutHelpOpen={isShortcutHelpOpen}
				issues={issues}
				mapControls={mapControls}
				mode={mode}
				onModeChange={handleModeChange}
				onRedo={handleRedo}
				onShortcutHelpOpenChange={setIsShortcutHelpOpen}
				onUndo={handleUndo}
			/>
			{isReadOnly && (
				<WarningNotice>
					地图格式版本为 {map.formatVersion}
					，当前编辑器只编辑画布地图（版本 {DAY_MAP_FORMAT_VERSION}
					），原数据会保留。可以平移和查看，不能修改。
				</WarningNotice>
			)}
			<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
				<section
					aria-label="地图画布"
					className="relative h-[64dvh] min-h-[360px] min-w-0 overflow-hidden rounded-large border border-divider bg-default-100/85 shadow-sm lg:h-auto lg:min-h-0 lg:flex-1 dark:bg-default-50/85"
				>
					<DayMapViewport
						ref={viewportRef}
						activeLayerIndex={activeLayerIndex}
						assetUrls={assetUrls}
						brushSize={brushSize}
						colliderTarget={target}
						hiddenLayers={hiddenLayers}
						isReadOnly={isReadOnly}
						isReducedMotion={isReducedMotion}
						map={map}
						mode={mode}
						options={viewOptions}
						packLabel={packLabel}
						placePrefab={activePrefab}
						selectedVertex={selectedVertex}
						selection={selection}
						slope={slope}
						snapStep={snapStep}
						store={store}
						tool={tool}
						onActiveLayerChange={setLayerIndex}
						onCommit={commit}
						onDropFiles={handleDropFiles}
						onNotice={showNotice}
						onSelectionChange={handleSelectionChange}
						onSlopePick={setSlope}
						onToolChange={handleToolChange}
						onVertexSelect={setSelectedVertex}
					/>
					<div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2 sm:p-3">
						<div className="flex min-w-0 items-start gap-2">
							<div className="pointer-events-auto shrink-0">
								<MapToolRail
									isReadOnly={isReadOnly}
									mode={mode}
									tool={tool}
									onToolChange={handleToolChange}
								/>
							</div>
							<div className="pointer-events-auto min-w-0 shrink">
								<MapToolOptions
									brushSize={brushSize}
									mode={mode}
									placePrefab={activePrefab}
									slope={slope}
									snapStep={snapStep}
									tool={tool}
									onBrushSizeChange={setBrushSize}
									onSnapStepChange={handleSnapStepChange}
								/>
							</div>
							<div className="flex-1" />
							<div className="pointer-events-auto shrink-0">
								<MapViewMenu
									mode={mode}
									options={viewOptions}
									onChange={handleViewOptionsChange}
								/>
							</div>
						</div>
						<div className="flex min-w-0 items-end justify-between gap-2">
							<div className="pointer-events-auto hidden min-w-0 shrink sm:block">
								<MapStatusBar store={store} />
							</div>
							<div className="pointer-events-auto ml-auto shrink-0">
								<MapZoomControls
									shouldShowGrid={viewOptions.shouldShowGrid}
									store={store}
									onFit={focusSelectionOrFit}
									onGridToggle={() =>
										handleViewOptionsChange({
											...viewOptions,
											shouldShowGrid:
												!viewOptions.shouldShowGrid,
										})
									}
									onZoomBy={(factor) =>
										viewportRef.current?.zoomBy(factor)
									}
									onZoomTo={(scale) =>
										viewportRef.current?.zoomTo(scale)
									}
								/>
							</div>
						</div>
					</div>
					<div className="pointer-events-none absolute inset-x-0 top-[3.75rem] flex justify-center px-3 sm:top-16">
						<MapNoticeToast
							notice={notice}
							onDismiss={dismissNotice}
						/>
					</div>
				</section>
				<aside
					aria-label="属性面板"
					className={cn(
						'flex w-full min-w-0 shrink-0 flex-col gap-3 lg:w-[340px] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 xl:w-[360px] [&>*]:shrink-0',
						'lg:[scrollbar-gutter:stable]'
					)}
				>
					{sidePanels}
				</aside>
			</div>
			<span className="sr-only" aria-live="polite">
				{MAP_MODES.find((item) => item.value === mode)?.label}模式
			</span>
		</div>
	);
}
