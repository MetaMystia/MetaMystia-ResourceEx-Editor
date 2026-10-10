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
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';
import { validateDayMap } from '@/domain/resourcePack/dayMapValidation';

import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { safeStorage } from '@/infrastructure/browser/storage/safeStorage';

import {
	DEFAULT_MAP_SNAP_STEP,
	DEFAULT_MAP_TOOL_BY_MODE,
	DEFAULT_MAP_VIEW_OPTIONS,
	hasSpecialShader,
	type IMapCellSelection,
	type IMapRect,
	type IMapViewOptions,
	isToolAvailable,
	type ITileBrush,
	MAP_BRUSH_SIZE_MAX,
	MAP_ENTITY_KIND_BY_MODE,
	MAP_MODES,
	MAP_SNAP_STEPS,
	MAP_TOOL_SHORTCUTS,
	MAP_ZOOM_REFERENCE_PX_PER_UNIT,
	type TMapEntityKind,
	type TMapMode,
	type TMapTool,
} from './dayMapEditorModel';
import {
	deleteEntities,
	duplicateEntities,
	getEntityCount,
	type ITileImportSettings,
} from './dayMapEdits';
import { getCameraRect } from './dayMapSpatial';
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
import { MapHint, MapPanel } from './MapFields';
import { CollisionModeIcon } from './MapIcons';
import { canHandleMapShortcut } from './mapShortcuts';
import { getEntityRect } from './mapToolActions';
import { MapTopBar } from './MapTopBar';
import { MapViewportStore } from './mapViewportStore';
import {
	CollisionInspector,
	EntityListPanel,
	MultiSelectionPanel,
	ObjectInspector,
	SpawnInspector,
} from './panels/EntityPanels';
import { LayerPanel } from './panels/LayerPanel';
import { MapSettingsPanel } from './panels/MapSettingsPanel';
import { SlopePanel } from './panels/SlopePanel';
import { TileImportCard } from './panels/TileImportCard';
import { CellInspector, TileInspector } from './panels/TileInspectors';
import { TilePalette } from './panels/TilePalette';
import { getTileIndex } from './render/sceneGeometry';
import { useDayMapHistory } from './useDayMapHistory';
import { type TMapAudioTarget, useMapAssetImport } from './useMapAssetImport';

const EMPTY_SET: ReadonlySet<number> = new Set();
const EMPTY_SELECTIONS: Record<TMapEntityKind, ReadonlySet<number>> = {
	collision: EMPTY_SET,
	object: EMPTY_SET,
	spawn: EMPTY_SET,
};
const VIEW_OPTIONS_STORAGE_KEY = 'dayMapEditor:viewOptions';
const VIEW_OPTION_KEYS = [
	'shouldDimInactiveLayers',
	'shouldShowCollisions',
	'shouldShowGrid',
	'shouldShowMaterialSources',
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

/** 默认选中预览中可见、格子最多的图层；原始素材地图常把特殊材质层排在最前。 */
function getInitialLayerIndex(map: IDayMap) {
	let best = -1;
	map.layers.forEach((layer, index) => {
		if (layer.isHeight || layer.active === false || hasSpecialShader(layer))
			return;
		if (
			best < 0 ||
			layer.cells.length > (map.layers[best]?.cells.length ?? 0)
		)
			best = index;
	});
	if (best >= 0) return best;
	const fallback = map.layers.findIndex((layer) => !layer.isHeight);
	return fallback >= 0 ? fallback : 0;
}

function getInitialBrush(map: IDayMap): ITileBrush | null {
	const tile = map.tiles[0];
	return tile ? { cells: [{ dx: 0, dy: 0, tile: tile.key }] } : null;
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
	const isReadOnly = ![1, 2].includes(map.formatVersion);
	const { canRedo, canUndo, commit, readLatestMap, redo, undo } =
		useDayMapHistory({ index, isReadOnly, map });
	const { importAudio, importTiles, isImporting } = useMapAssetImport({
		commit,
		readLatestMap,
	});
	const isReducedMotion = useReducedMotion();
	const rootRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<IDayMapViewportHandle>(null);
	const [store] = useState(() => new MapViewportStore());
	const [mode, setMode] = useState<TMapMode>('tile');
	const [toolByMode, setToolByMode] = useState<Record<TMapMode, TMapTool>>(
		() => ({ ...DEFAULT_MAP_TOOL_BY_MODE })
	);
	const [layerIndex, setLayerIndex] = useState(() =>
		getInitialLayerIndex(map)
	);
	const [brush, setBrush] = useState(() => getInitialBrush(map));
	const [brushSize, setBrushSize] = useState(1);
	const [slope, setSlope] = useState(0.5);
	const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<number>>(
		() => new Set()
	);
	const [selections, setSelections] = useState(EMPTY_SELECTIONS);
	const [cellSelection, setCellSelection] =
		useState<IMapCellSelection | null>(null);
	const [isCameraSelected, setIsCameraSelected] = useState(false);
	const [viewOptions, setViewOptions] = useState<IMapViewOptions>(
		DEFAULT_MAP_VIEW_OPTIONS
	);
	const [snapStep, setSnapStep] = useState<number>(DEFAULT_MAP_SNAP_STEP);
	const [notice, setNotice] = useState<IMapNotice | null>(null);
	const [importRequest, setImportRequest] = useState<{
		file: File | null;
		id: number;
	} | null>(null);
	const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
	const noticeIdRef = useRef(0);

	useEffect(() => {
		setViewOptions(readStoredViewOptions());
		setSnapStep(readStoredSnapStep());
	}, []);

	const tool = toolByMode[mode];
	const entityKind = MAP_ENTITY_KIND_BY_MODE[mode];
	const activeLayerIndex = Math.min(
		layerIndex,
		Math.max(0, map.layers.length - 1)
	);
	const hasNativeHeight = map.layers.some((layer) => layer.isHeight);
	const tileIndex = getTileIndex(map.tiles);
	const activeBrush =
		brush && brush.cells.every((cell) => tileIndex.has(cell.tile))
			? brush
			: null;
	const selection = useMemo(() => {
		if (!entityKind) return EMPTY_SET;
		const indices = selections[entityKind];
		const count = getEntityCount(map, entityKind);
		return [...indices].every((value) => value < count)
			? indices
			: new Set([...indices].filter((value) => value < count));
	}, [entityKind, map, selections]);

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
		setCellSelection(null);
		setIsCameraSelected(false);
	}, []);

	const handleUndo = useCallback(() => {
		viewportRef.current?.cancelGesture();
		const result = undo();
		if (result.isSuccess) {
			clearSelections();
			setHiddenLayers(new Set());
		} else if (result.error)
			showNotice(result.error, canUndo ? 'error' : 'info');
	}, [canUndo, clearSelections, showNotice, undo]);

	const handleRedo = useCallback(() => {
		viewportRef.current?.cancelGesture();
		const result = redo();
		if (result.isSuccess) {
			clearSelections();
			setHiddenLayers(new Set());
		} else if (result.error)
			showNotice(result.error, canRedo ? 'error' : 'info');
	}, [canRedo, clearSelections, redo, showNotice]);

	const handleModeChange = useCallback(
		(next: TMapMode) => {
			if (next === 'height' && hasNativeHeight) {
				showNotice('这张地图使用原始高度层，坡度画笔已停用。', 'error');
				return;
			}
			viewportRef.current?.cancelGesture();
			setMode(next);
		},
		[hasNativeHeight, showNotice]
	);

	const handleToolChange = useCallback(
		(next: TMapTool) => {
			if (!isToolAvailable(mode, next)) return;
			setToolByMode((current) =>
				current[mode] === next ? current : { ...current, [mode]: next }
			);
			if (next !== 'select') setCellSelection(null);
		},
		[mode]
	);

	const handleBrushChange = useCallback(
		(next: ITileBrush | null) => {
			setBrush(next);
			if (!next) return;
			setToolByMode((current) => {
				if (
					mode === 'tile' &&
					['eraser', 'picker', 'select', 'hand'].includes(
						current.tile
					)
				)
					return { ...current, tile: 'brush' };
				if (mode === 'object' && current.object !== 'place')
					return { ...current, object: 'place' };
				return current;
			});
		},
		[mode]
	);

	const handleSelectionChange = useCallback(
		(kind: TMapEntityKind, indices: ReadonlySet<number>) =>
			setSelections((current) =>
				current[kind] === indices
					? current
					: { ...current, [kind]: indices }
			),
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

	const focusEntity = useCallback(
		(kind: TMapEntityKind, entityIndex: number) => {
			const rect = getEntityRect(map, kind, entityIndex);
			if (rect) viewportRef.current?.revealRect(rect);
		},
		[map]
	);

	const focusSelectionOrFit = useCallback(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		if (entityKind && selection.size > 0) {
			const rect = unionRects(
				[...selection].map((value) =>
					getEntityRect(map, entityKind, value)
				)
			);
			if (rect) {
				viewport.fitRect(rect);
				return;
			}
		}
		if (mode === 'map' && isCameraSelected) {
			const rect = getCameraRect(map.camera.bounds);
			if (rect) {
				viewport.fitRect(rect);
				return;
			}
		}
		if (cellSelection) {
			viewport.revealRect({
				maxX: cellSelection.x + 1,
				maxY: cellSelection.y + 1,
				minX: cellSelection.x,
				minY: cellSelection.y,
			});
			return;
		}
		viewport.fit();
	}, [cellSelection, entityKind, isCameraSelected, map, mode, selection]);

	const duplicateSelection = useCallback(() => {
		if (!entityKind || selection.size === 0 || isReadOnly) return;
		const offset = snapStep > 0 ? Math.max(snapStep, 0.5) : 0.5;
		const result = duplicateEntities(
			map,
			entityKind,
			selection,
			offset,
			-offset
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
	]);

	const handleImportTiles = useCallback(
		async (source: File | string, settings: ITileImportSettings) => {
			const result = await importTiles(source, settings);
			if (result.error) {
				showNotice(result.error, 'error');
				return;
			}
			const first = result.tiles?.[0];
			if (!first) return;
			setImportRequest(null);
			setBrush({ cells: [{ dx: 0, dy: 0, tile: first.key }] });
			showNotice(`已导入 ${result.tiles?.length ?? 0} 块切片。`, 'info');
		},
		[importTiles, showNotice]
	);

	const handleUploadAudio = useCallback(
		async (file: File, target: TMapAudioTarget) => {
			const result = await importAudio(file, target);
			if (result.error) showNotice(result.error, 'error');
			else if (result.path)
				showNotice(`已导入音乐 ${file.name}。`, 'info');
		},
		[importAudio, showNotice]
	);

	const handleDropFiles = useCallback(
		(files: File[]) => {
			const image = files.find((file) => /\.png$/i.test(file.name));
			if (!image) {
				showNotice(
					'只能把 PNG 拖到画布上导入瓦片；音乐请在“地图”中上传。',
					'error'
				);
				return;
			}
			if (isReadOnly) return;
			if (mode !== 'tile' && mode !== 'object') setMode('tile');
			setImportRequest({ file: image, id: Date.now() });
		},
		[isReadOnly, mode, showNotice]
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
							{ length: getEntityCount(map, entityKind) },
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
			const target = MAP_MODES[Number(key) - 1];
			if (target) {
				event.preventDefault();
				handleModeChange(target.value);
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
				if (entityKind && selection.size > 0 && !isReadOnly) {
					event.preventDefault();
					if (
						handleCommit(deleteEntities(map, entityKind, selection))
							.isSuccess
					)
						handleSelectionChange(entityKind, EMPTY_SET);
				}
				return;
			case 'Escape':
				if (entityKind && selection.size > 0) {
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
		const missing = Array.from(
			new Set([
				...deferredMap.tiles.map((tile) => tile.image),
				deferredMap.mapBGM.intro,
				deferredMap.mapBGM.loop,
			])
		)
			.filter(Boolean)
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
				map.collisions.length + (map.nativeColliders?.length ?? 0),
			height: map.height?.cells.length ?? 0,
			object: map.objects.length,
			spawn: map.spawnMarkers.length,
			tile: map.layers.reduce(
				(count, layer) => count + layer.cells.length,
				0
			),
		}),
		[map]
	);
	const disabledModes = useMemo(
		() => new Set<TMapMode>(hasNativeHeight ? ['height'] : []),
		[hasNativeHeight]
	);

	/* ── 侧栏 ─────────────────────────────────────────── */

	const singleTileKey =
		activeBrush && activeBrush.cells.length === 1
			? activeBrush.cells[0]?.tile
			: undefined;
	const palette = (paletteMode: 'object' | 'tile') => (
		<TilePalette
			assetUrls={assetUrls}
			brush={activeBrush}
			isReadOnly={isReadOnly}
			map={map}
			mode={paletteMode}
			packLabel={packLabel}
			onBrushChange={handleBrushChange}
			onImportOpen={() =>
				setImportRequest({ file: null, id: Date.now() })
			}
			importCard={
				importRequest ? (
					<TileImportCard
						key={importRequest.id}
						assetUrls={assetUrls}
						existingTileCount={map.tiles.length}
						initialFile={importRequest.file}
						isImporting={isImporting}
						onCancel={() => setImportRequest(null)}
						onImport={(source, settings) =>
							void handleImportTiles(source, settings)
						}
					/>
				) : undefined
			}
		/>
	);
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
	let sidePanels: ReactNode;
	switch (mode) {
		case 'tile':
			sidePanels = (
				<>
					{tool === 'select' && cellSelection && (
						<CellInspector
							assetUrls={assetUrls}
							isReadOnly={isReadOnly}
							map={map}
							packLabel={packLabel}
							selection={cellSelection}
							onBrushChange={(next) => {
								handleBrushChange(next);
								handleToolChange('brush');
							}}
							onClose={() => setCellSelection(null)}
							onCommit={handleCommit}
						/>
					)}
					<LayerPanel
						activeLayerIndex={activeLayerIndex}
						hiddenLayers={hiddenLayers}
						isReadOnly={isReadOnly}
						map={map}
						onActiveLayerChange={setLayerIndex}
						onCommit={handleCommit}
						onHiddenLayersChange={setHiddenLayers}
						onNotice={showNotice}
					/>
					{palette('tile')}
					{singleTileKey && (
						<TileInspector
							assetUrls={assetUrls}
							isReadOnly={isReadOnly}
							map={map}
							packLabel={packLabel}
							tileKey={singleTileKey}
							onBrushChange={setBrush}
							onCommit={handleCommit}
						/>
					)}
				</>
			);
			break;
		case 'object':
			sidePanels = (
				<>
					{entityList}
					{selection.size === 1 && selectedIndex !== undefined ? (
						<ObjectInspector
							{...inspectorProps}
							assetUrls={assetUrls}
							brushTile={singleTileKey ?? null}
							index={selectedIndex}
							packLabel={packLabel}
							onFocus={() => focusEntity('object', selectedIndex)}
						/>
					) : selection.size > 1 ? (
						<MultiSelectionPanel
							count={selection.size}
							kind="object"
						/>
					) : null}
					{palette('object')}
				</>
			);
			break;
		case 'height':
			sidePanels = (
				<SlopePanel map={map} slope={slope} onSlopeChange={setSlope} />
			);
			break;
		case 'collision':
			sidePanels = (
				<>
					{entityList}
					{selection.size === 1 && selectedIndex !== undefined ? (
						<CollisionInspector
							{...inspectorProps}
							index={selectedIndex}
							snapStep={snapStep}
							onFocus={() =>
								focusEntity('collision', selectedIndex)
							}
						/>
					) : selection.size > 1 ? (
						<MultiSelectionPanel
							count={selection.size}
							kind="collision"
						/>
					) : null}
					{(map.nativeColliders?.length ?? 0) > 0 && (
						<MapPanel
							title="原生碰撞"
							meta={map.nativeColliders?.length}
							icon={<CollisionModeIcon />}
						>
							<div className="flex flex-wrap gap-3 text-xs text-foreground-600">
								<span className="inline-flex items-center gap-1.5">
									<span className="h-0.5 w-4 rounded-full bg-[#f87171]" />
									实体
								</span>
								<span className="inline-flex items-center gap-1.5">
									<span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-[#facc15]" />
									触发器
								</span>
								<span className="inline-flex items-center gap-1.5">
									<span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-[#22d3ee]" />
									相机
								</span>
							</div>
							<MapHint>
								原生碰撞保留游戏原始形状，画布显示精确轮廓，暂不支持顶点编辑。新的碰撞请用矩形碰撞框补充。
							</MapHint>
						</MapPanel>
					)}
				</>
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
					) : selection.size > 1 ? (
						<MultiSelectionPanel
							count={selection.size}
							kind="spawn"
						/>
					) : null}
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
					onUploadAudio={(file, target) =>
						void handleUploadAudio(file, target)
					}
					onViewOptionsChange={handleViewOptionsChange}
				/>
			);
			break;
	}

	const badges = (
		<>
			{isReadOnly && (
				<CanvasBadge tip="当前编辑器只编辑格式版本 1 和 2，原数据会原样保留。">
					只读
				</CanvasBadge>
			)}
			{map.formatVersion === 2 && (
				<CanvasBadge tip="原始素材模式：图片、UV、PPU 和逐格变换独立保存，不合并或烘焙图片。特殊材质默认隐藏，互动脚本与动态材质仍需模组支持。">
					原始素材
				</CanvasBadge>
			)}
			{map.artOnly && (
				<CanvasBadge tip="静态美术参考包：不含音乐、互动与动态效果，供查看和编辑素材结构，不能直接作为完整游戏地图安装。">
					美术参考
				</CanvasBadge>
			)}
		</>
	);

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
					地图格式版本为 {map.formatVersion}，当前编辑器只编辑版本 1
					和 2，原数据会保留。可以平移和查看，不能修改。
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
						brush={activeBrush}
						brushSize={brushSize}
						cellSelection={cellSelection}
						hiddenLayers={hiddenLayers}
						isCameraSelected={isCameraSelected}
						isReadOnly={isReadOnly}
						isReducedMotion={isReducedMotion}
						map={map}
						mode={mode}
						options={viewOptions}
						packLabel={packLabel}
						selection={selection}
						slope={slope}
						snapStep={snapStep}
						store={store}
						tool={tool}
						onBrushPick={setBrush}
						onCameraSelect={setIsCameraSelected}
						onCellSelect={setCellSelection}
						onCommit={commit}
						onDropFiles={handleDropFiles}
						onNotice={showNotice}
						onSelectionChange={handleSelectionChange}
						onSlopePick={setSlope}
						onToolChange={handleToolChange}
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
									brush={activeBrush}
									brushSize={brushSize}
									mode={mode}
									slope={slope}
									snapStep={snapStep}
									tool={tool}
									onBrushPlacementClear={() => {
										if (activeBrush)
											setBrush({
												cells: activeBrush.cells,
											});
									}}
									onBrushSizeChange={setBrushSize}
									onSnapStepChange={handleSnapStepChange}
								/>
							</div>
							<div className="flex-1" />
							<div className="pointer-events-auto shrink-0">
								<MapViewMenu
									canShowMaterialSources={
										map.formatVersion === 2
									}
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
