'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Button from '@/design/ui/components/button';
import Switch from '@/design/ui/components/switch';
import Tooltip from '@/design/ui/components/tooltip';

import {
	UNMANAGED_ID_MAX,
	UNMANAGED_ID_MIN,
} from '@/domain/resourcePack/constants';
import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';
import { validateDayMap } from '@/domain/resourcePack/dayMapValidation';
import { validateDayMapWav } from '@/domain/resourcePack/dayMapWav';

import { joinAssetPath } from '@/features/resourceEditor/client/assets/assetPaths';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import {
	findNextAvailableInteger,
	findNextAvailableSuffixedValue,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { formatSlopeAngle } from './canvasHelpers';
import DayMapCanvas from './DayMapCanvas';
import { DayMapInspector } from './DayMapInspector';
import { MapNumber, MapSection } from './MapFields';
import {
	sliceMapImage,
	TilePalette,
	type ITileImportSettings,
} from './TilePalette';

type TMode = 'tile' | 'height' | 'collision' | 'spawn' | 'object' | 'pan';
type TTool = 'paint' | 'erase' | 'rectangle';
const MODES: { value: TMode; label: string }[] = [
	{ value: 'tile', label: '瓦片' },
	{ value: 'object', label: '装饰' },
	{ value: 'height', label: '坡面' },
	{ value: 'collision', label: '碰撞' },
	{ value: 'spawn', label: '出生点' },
	{ value: 'pan', label: '平移 / 设置' },
];
const TOOLS: { value: TTool; label: string; path: string }[] = [
	{
		value: 'paint',
		label: '画笔',
		path: 'M14 6l4 4M4 20c4 0 6-1 6-4a3 3 0 0 0-6 0c0 2-1 3-2 3zM9 13L18 3a2 2 0 0 1 3 3L12 16',
	},
	{ value: 'rectangle', label: '矩形', path: 'M4 4h16v16H4z' },
	{
		value: 'erase',
		label: '橡皮',
		path: 'M14 3l7 7-11 11H6l-5-5zM8 9l7 7M10 21h12',
	},
];

export function DayMapEditorScreen() {
	const {
		activeWorkspaceId,
		resourcePack,
		readCurrentWorkspaceSnapshot,
		applyWorkspaceMutation,
	} = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectionRevision, setSelectionRevision] = useState(0);
	const [error, setError] = useState('');
	const index = Math.min(
		selectedIndex,
		Math.max(0, resourcePack.dayMaps.length - 1)
	);
	const map = resourcePack.dayMaps[index];
	useEditorEntityNavigationIntent({
		entityKind: 'dayMap',
		getStableKey: (item) => item.id,
		items: resourcePack.dayMaps,
		onSelect: setSelectedIndex,
	});
	function addMap() {
		const snapshot = readCurrentWorkspaceSnapshot();
		if (!snapshot) return;
		const pack = snapshot.resourcePack;
		const id = findNextAvailableInteger(
			pack.dayMaps.map((item) => item.id),
			getEntityIdAllocationStart(
				pack.packInfo.idRangeStart,
				UNMANAGED_ID_MIN
			)
		);
		if (id > (pack.packInfo.idRangeEnd ?? UNMANAGED_ID_MAX)) {
			setError('当前资源包声明的 ID 范围已用完。');
			return;
		}
		const next: IDayMap = {
			id,
			formatVersion: 1,
			name: '新地图',
			description: '',
			tiles: [],
			layers: [
				{
					name: '地面',
					sortingLayer: 'Background',
					sortingOrder: -2000,
					cells: [],
				},
			],
			height: { cells: [] },
			objects: [],
			collisions: [],
			spawnMarkers: [{ name: 'Entry', x: 0, y: 0, rotation: 'Down' }],
			defaultSpawnMarker: 'Entry',
			camera: {
				shouldFollow: true,
				bounds: [-4, -3, 4, 3],
				position: [0, 0, -10],
			},
			mapBGM: { intro: '', loop: '' },
		};
		const result = applyWorkspaceMutation({
			expectedRevision: snapshot.revision,
			mutate: (current) => ({
				...current,
				resourcePack: {
					...current.resourcePack,
					dayMaps: [...current.resourcePack.dayMaps, next],
				},
			}),
		});
		if (result.isSuccess) {
			setSelectedIndex(pack.dayMaps.length);
			setSelectionRevision((value) => value + 1);
			setError('');
		} else setError(result.error ?? '创建失败');
	}
	function deleteMap() {
		const snapshot = readCurrentWorkspaceSnapshot();
		if (!snapshot || snapshot.resourcePack.dayMaps[index] !== map) {
			setError('地图已变化，请重新选择。');
			return;
		}
		const result = applyWorkspaceMutation({
			expectedRevision: snapshot.revision,
			mutate: (current) => ({
				...current,
				resourcePack: {
					...current.resourcePack,
					dayMaps: current.resourcePack.dayMaps.filter(
						(_, i) => i !== index
					),
				},
			}),
		});
		if (result.isSuccess) {
			setSelectedIndex(Math.max(0, index - 1));
			setSelectionRevision((value) => value + 1);
		} else setError(result.error ?? '删除失败');
	}
	return (
		<div className="mx-auto w-full max-w-[1800px] space-y-4 px-3 py-4 sm:px-6">
			<p className="rounded-medium border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-800">
				测试阶段：地图编辑器目前为预览测试版本，UI
				界面尚未完善，后续会继续调整。
			</p>
			<header className="flex flex-wrap items-center gap-3">
				<div className="mr-auto">
					<h1 className="text-xl font-bold">白天地图</h1>
					<p className="mt-1 text-xs text-foreground-500">
						用瓦片绘制场景，独立设置坡面、碰撞和出生点。
					</p>
				</div>
				<Select
					baseClassName="w-64 max-w-full"
					ariaLabel="当前地图"
					value={map ? index : undefined}
					items={resourcePack.dayMaps.map((item, i) => ({
						value: i,
						label: `${item.name} · ${item.id}`,
					}))}
					onChange={setSelectedIndex}
				/>
				<Button size="sm" color="primary" onPress={addMap}>
					新建地图
				</Button>
				{map && (
					<SectionDeleteButton
						confirmTitle={`删除地图“${map.name}”？`}
						onPress={deleteMap}
					>
						删除地图
					</SectionDeleteButton>
				)}
			</header>
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			{map ? (
				<DayMapEditor
					key={`${activeWorkspaceId}:${index}:${selectionRevision}`}
					map={map}
					index={index}
				/>
			) : (
				<div className="rounded-large border border-dashed border-divider p-12 text-center text-foreground-500">
					暂无白天地图。点击“新建地图”，再导入你的 PNG 瓦片图。
				</div>
			)}
		</div>
	);
}

function DayMapEditor({ map, index }: { map: IDayMap; index: number }) {
	const {
		activeWorkspaceId,
		assets,
		resourcePack,
		readCurrentWorkspaceSnapshot,
		applyWorkspaceMutation,
	} = useResourceEditor();
	const [mode, setMode] = useState<TMode>('tile');
	const [tool, setTool] = useState<TTool>('paint');
	const [layerIndex, setLayerIndex] = useState(0);
	const [tileKey, setTileKey] = useState(map.tiles[0]?.key ?? '');
	const [slope, setSlope] = useState(0.5);
	const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<number>>(
		new Set()
	);
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [error, setError] = useState('');
	const [isImporting, setIsImporting] = useState(false);
	const [historyRevision, setHistoryRevision] = useState(0);
	const historyRef = useRef({
		current: map,
		past: [] as IDayMap[],
		future: [] as IDayMap[],
	});
	const isMountedRef = useRef(true);
	const workspaceIdRef = useRef(activeWorkspaceId);
	workspaceIdRef.current = activeWorkspaceId;
	const issues = useMemo(() => validateDayMap(map), [map]);
	const isReadOnly = map.formatVersion !== 1;
	const effectiveLayerIndex = Math.min(
		layerIndex,
		Math.max(0, map.layers.length - 1)
	);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);
	useEffect(() => {
		if (historyRef.current.current !== map) {
			historyRef.current = { current: map, past: [], future: [] };
			setHistoryRevision((value) => value + 1);
			setHiddenLayers(new Set());
		}
	}, [map]);
	function commit(
		next: IDayMap,
		files?: ReadonlyMap<string, Blob>,
		historyMode: 'edit' | 'undo' | 'redo' = 'edit'
	) {
		if (isReadOnly || !isMountedRef.current) return false;
		const snapshot = readCurrentWorkspaceSnapshot();
		if (!snapshot || snapshot.resourcePack.dayMaps[index] !== map) {
			setError('地图已变化，本次操作没有覆盖新内容，请重新操作。');
			return false;
		}
		if (next === map && !files) return true;
		const result = applyWorkspaceMutation({
			expectedRevision: snapshot.revision,
			mutate: (current) => ({
				...current,
				files: files
					? new Map([...current.files, ...files])
					: current.files,
				resourcePack: {
					...current.resourcePack,
					dayMaps: current.resourcePack.dayMaps.map((item, i) =>
						i === index ? next : item
					),
				},
			}),
		});
		if (!result.isSuccess) {
			setError(result.error ?? '保存地图失败');
			return false;
		}
		const history = historyRef.current;
		if (historyMode === 'edit') {
			history.past = [...history.past.slice(-39), map];
			history.future = [];
		}
		if (historyMode === 'undo') {
			history.past.pop();
			history.future.push(map);
		}
		if (historyMode === 'redo') {
			history.future.pop();
			history.past.push(map);
		}
		history.current = next;
		setHistoryRevision((value) => value + 1);
		setError('');
		return true;
	}
	function undo() {
		const next = historyRef.current.past.at(-1);
		if (next) {
			commit(next, undefined, 'undo');
			setSelectedIndex(null);
			setHiddenLayers(new Set());
		}
	}
	function redo() {
		const next = historyRef.current.future.at(-1);
		if (next) {
			commit(next, undefined, 'redo');
			setSelectedIndex(null);
			setHiddenLayers(new Set());
		}
	}
	function uniqueAssetPath(file: File, paths: ReadonlyMap<string, Blob>) {
		const original = joinAssetPath(`assets/maps/${map.id}/`, file.name);
		let path = original;
		let suffix = 1;
		while (paths.has(path)) {
			path = original.replace(/(\.[^.]+)?$/, `_${suffix}$1`);
			suffix += 1;
		}
		return path;
	}
	async function importTiles(
		source: File | string,
		settings: ITileImportSettings
	) {
		const snapshot = readCurrentWorkspaceSnapshot();
		const workspaceId = activeWorkspaceId;
		if (!snapshot || isImporting) return;
		setIsImporting(true);
		setError('');
		try {
			const blob =
				typeof source === 'string'
					? snapshot.files.get(source)
					: source;
			if (!blob) throw new Error('找不到图片文件。');
			const signature = new Uint8Array(
				await blob.slice(0, 8).arrayBuffer()
			);
			if (
				![137, 80, 78, 71, 13, 10, 26, 10].every(
					(value, i) => signature[i] === value
				)
			)
				throw new Error('请导入 PNG 图片。');
			const bitmap = await createImageBitmap(blob);
			const { width, height } = bitmap;
			bitmap.close();
			if (!isMountedRef.current || workspaceIdRef.current !== workspaceId)
				return;
			if (readCurrentWorkspaceSnapshot()?.revision !== snapshot.revision)
				throw new Error('读取图片期间资源发生变化，请重新导入。');
			const path =
				typeof source === 'string'
					? source
					: uniqueAssetPath(source, snapshot.files);
			const tiles = sliceMapImage(map, path, width, height, settings);
			if (
				commit(
					{ ...map, tiles: [...map.tiles, ...tiles] },
					typeof source === 'string'
						? undefined
						: new Map([[path, blob]])
				)
			)
				setTileKey(tiles[0]?.key ?? '');
		} catch (reason) {
			if (isMountedRef.current)
				setError(
					reason instanceof Error ? reason.message : '图片导入失败'
				);
		} finally {
			if (isMountedRef.current) setIsImporting(false);
		}
	}
	async function importAudio(file: File) {
		const snapshot = readCurrentWorkspaceSnapshot();
		const workspaceId = activeWorkspaceId;
		if (!snapshot || isImporting) return;
		setIsImporting(true);
		setError('');
		try {
			if (!/\.wav$/i.test(file.name))
				throw new Error('请导入 WAV 音频。');
			const audioError = validateDayMapWav(await file.arrayBuffer());
			if (audioError) throw new Error(audioError);
			if (!isMountedRef.current || workspaceIdRef.current !== workspaceId)
				return;
			if (readCurrentWorkspaceSnapshot()?.revision !== snapshot.revision)
				throw new Error('读取音频期间资源发生变化，请重新导入。');
			const path = uniqueAssetPath(file, snapshot.files);
			commit(
				{ ...map, mapBGM: { ...map.mapBGM, intro: path, loop: path } },
				new Map([[path, file]])
			);
		} catch (reason) {
			if (isMountedRef.current)
				setError(
					reason instanceof Error ? reason.message : '音频导入失败'
				);
		} finally {
			if (isMountedRef.current) setIsImporting(false);
		}
	}
	function addLayer() {
		if (map.layers.length >= 32) return;
		const name = findNextAvailableSuffixedValue(
			map.layers.map((layer) => layer.name),
			'图层 '
		);
		if (
			commit({
				...map,
				layers: [
					...map.layers,
					{
						name,
						sortingLayer: 'Background',
						sortingOrder: -2000 + map.layers.length * 10,
						cells: [],
					},
				],
			})
		)
			setLayerIndex(map.layers.length);
	}
	const missingAssets = Array.from(
		new Set([
			...map.tiles.map((tile) => tile.image),
			map.mapBGM.intro,
			map.mapBGM.loop,
		])
	)
		.filter(Boolean)
		.filter((path) => {
			const local = resolveDayMapAssetPath(
				path,
				resourcePack.packInfo.label
			);
			return local !== null && !assets.urls[local];
		});
	return (
		<div className="space-y-3">
			{isReadOnly && (
				<p
					role="alert"
					className="rounded-medium bg-warning/20 p-3 text-sm"
				>
					地图格式版本为 {map.formatVersion}，当前编辑器只编辑版本
					1。原数据会保留。
				</p>
			)}
			{(error || isImporting) && (
				<p
					role="status"
					className="rounded-medium bg-warning/10 p-3 text-sm"
				>
					{isImporting ? '正在读取资源…' : error}
				</p>
			)}
			<fieldset disabled={isReadOnly} className="min-w-0 space-y-3">
				<div
					className="flex flex-wrap items-center gap-2"
					aria-label="地图工具栏"
				>
					{MODES.map((item) => (
						<Button
							key={item.value}
							size="sm"
							variant={mode === item.value ? 'flat' : 'light'}
							color={mode === item.value ? 'primary' : 'default'}
							aria-pressed={mode === item.value}
							onPress={() => {
								setMode(item.value);
								setSelectedIndex(null);
								setTool('paint');
							}}
						>
							{item.label}
						</Button>
					))}
					<span className="grow" />
					<Button
						size="sm"
						variant="flat"
						isDisabled={historyRef.current.past.length === 0}
						onPress={undo}
					>
						撤销
					</Button>
					<Button
						size="sm"
						variant="flat"
						isDisabled={historyRef.current.future.length === 0}
						onPress={redo}
					>
						重做
					</Button>
					<span className="sr-only">历史版本 {historyRevision}</span>
				</div>
				<div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_250px]">
					<div className="order-2 min-w-0 space-y-3 lg:order-1">
						<MapSection title="显示图层">
							<div className="space-y-1">
								{map.layers.map((layer, i) => (
									<div
										key={i}
										className="flex items-center gap-1"
									>
										<Button
											className="min-w-0 flex-1 justify-start truncate"
											size="sm"
											variant={
												effectiveLayerIndex === i
													? 'flat'
													: 'light'
											}
											color={
												effectiveLayerIndex === i
													? 'primary'
													: 'default'
											}
											aria-pressed={
												effectiveLayerIndex === i
											}
											onPress={() => {
												setLayerIndex(i);
												setMode('tile');
											}}
										>
											{layer.name} · {layer.cells.length}
										</Button>
										<Switch
											aria-label={`显示图层 ${layer.name}`}
											size="sm"
											isSelected={!hiddenLayers.has(i)}
											onValueChange={(visible) => {
												const next = new Set(
													hiddenLayers
												);
												if (visible) next.delete(i);
												else next.add(i);
												setHiddenLayers(next);
											}}
										/>
									</div>
								))}
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									isDisabled={map.layers.length >= 32}
									onPress={addLayer}
								>
									添加图层
								</Button>
								{map.layers[effectiveLayerIndex] && (
									<SectionDeleteButton
										onPress={() => {
											commit({
												...map,
												layers: map.layers.filter(
													(_, i) =>
														i !==
														effectiveLayerIndex
												),
											});
											setLayerIndex(0);
											setHiddenLayers(new Set());
										}}
									>
										删除所选层
									</SectionDeleteButton>
								)}
							</div>
						</MapSection>
						{(mode === 'tile' || mode === 'object') && (
							<TilePalette
								map={map}
								tileKey={tileKey}
								assetUrls={assets.urls}
								packLabel={resourcePack.packInfo.label ?? ''}
								isImporting={isImporting}
								onSelect={setTileKey}
								onChange={commit}
								onImport={(source, settings) =>
									void importTiles(source, settings)
								}
							/>
						)}
						{mode === 'height' && (
							<MapSection
								title={`坡面画笔 · ${map.height?.cells.length ?? 0} 格`}
							>
								<div className="flex flex-wrap gap-1">
									<Button
										size="sm"
										onPress={() => setSlope(0.5)}
									>
										右上坡
									</Button>
									<Button
										size="sm"
										onPress={() => setSlope(-0.5)}
									>
										右下坡
									</Button>
									<Button
										size="sm"
										onPress={() => setSlope(0)}
									>
										平地
									</Button>
								</div>
								<MapNumber
									label="坡度比例（-1 至 1）"
									value={slope}
									min={-1}
									max={1}
									step={0.1}
									onChange={setSlope}
								/>
								<p className="text-xs text-foreground-500">
									画笔角度约 {formatSlopeAngle(slope)}
									。横向每走 1 格，纵向修正 {slope}{' '}
									格。正值向右上坡，向左反向下降。这里只改变移动，不改变图片或遮挡。
								</p>
							</MapSection>
						)}
					</div>
					<div className="order-1 min-w-0 space-y-2 lg:order-2">
						<div>
							{' '}
							<span className="text-xs text-foreground-500">
								{mode === 'tile'
									? `当前瓦片：${tileKey || '未选择'}`
									: mode === 'height'
										? `当前画笔：坡度 ${slope}（约 ${formatSlopeAngle(slope)}）`
										: '坐标右正、上正'}
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{mode === 'tile' ||
							mode === 'height' ||
							mode === 'collision' ? (
								TOOLS.map((item) => (
									<Tooltip
										key={item.value}
										content={item.label}
									>
										<Button
											isIconOnly
											size="sm"
											aria-label={item.label}
											aria-pressed={tool === item.value}
											color={
												tool === item.value
													? 'primary'
													: 'default'
											}
											variant="flat"
											onPress={() => setTool(item.value)}
										>
											<svg
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.8"
												strokeLinecap="round"
												strokeLinejoin="round"
												aria-hidden="true"
												focusable="false"
											>
												<path d={item.path} />
											</svg>
										</Button>
									</Tooltip>
								))
							) : mode !== 'pan' ? (
								<Button
									size="sm"
									variant="flat"
									onPress={() => {
										setSelectedIndex(null);
										setTool('paint');
									}}
								>
									放置新的
									{mode === 'spawn'
										? '出生点'
										: mode === 'object'
											? '装饰'
											: '项目'}
								</Button>
							) : null}
						</div>
						<DayMapCanvas
							map={map}
							assetUrls={assets.urls}
							packLabel={resourcePack.packInfo.label ?? ''}
							mode={mode}
							tool={
								mode === 'tile' ||
								mode === 'height' ||
								mode === 'collision'
									? tool
									: 'paint'
							}
							layerIndex={effectiveLayerIndex}
							tileKey={tileKey}
							slope={slope}
							hiddenLayers={hiddenLayers}
							selectedIndex={selectedIndex}
							onSelect={setSelectedIndex}
							onChange={commit}
							onError={setError}
							onUndo={undo}
							onRedo={redo}
							isReadOnly={isReadOnly}
						/>
						<p className="text-xs text-foreground-500">
							一次拖动为一个撤销步骤；画布聚焦后可用方向键移动光标、空格绘制。地图内容自动保存，图层显隐只影响预览。
						</p>
					</div>
					<div className="order-3 min-w-0 lg:col-span-2 xl:col-span-1">
						<DayMapInspector
							map={map}
							mode={mode}
							layerIndex={effectiveLayerIndex}
							selectedIndex={selectedIndex}
							assetUrls={assets.urls}
							onChange={commit}
							onSelect={setSelectedIndex}
							onUploadAudio={(file) => void importAudio(file)}
						/>
					</div>
				</div>
			</fieldset>
			{(issues.length > 0 || missingAssets.length > 0) && (
				<details className="rounded-medium border border-warning/40 bg-warning/10 p-3">
					<summary className="cursor-pointer text-sm">
						地图检查 · {issues.length + missingAssets.length}{' '}
						项待处理
					</summary>
					<ul className="mt-2 list-inside list-disc space-y-1 text-xs">
						{[
							...issues,
							...missingAssets.map(
								(path) => `缺少包内资产：${path}`
							),
						]
							.slice(0, 30)
							.map((issue, i) => (
								<li key={i}>{issue}</li>
							))}
					</ul>
					<p className="mt-2 text-xs">
						导出时会检查完整资源包及图片切片边界。
					</p>
				</details>
			)}
		</div>
	);
}
