'use client';

import { cn } from '@heroui/theme';
import {
	memo,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Tooltip from '@/design/ui/components/tooltip';

import type {
	IDayMap,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';

import { type ITileBrush } from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import { getTileUsage } from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	MapHint,
	MapPanel,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	ChevronDownIcon,
	GridIcon,
	ImageIcon,
	MinusIcon,
	PlusIcon,
	SearchIcon,
	UploadIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { resolveMapImageUrl } from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import {
	getTileSourceRect,
	useImageSize,
} from '@/features/resourceEditor/client/editors/dayMap/tileImages';

import { TileThumb } from './TileThumb';

const CELL_SIZE_PX = 52;
const CELL_GAP_PX = 6;
const HEADER_HEIGHT_PX = 34;
const ROW_HEIGHT_PX = CELL_SIZE_PX + CELL_GAP_PX;
/** 图集视图固定高度：工具条 24 + 间距 6 + 图片区 320 + 间距 6 + 说明 20 + 底距 10。 */
const ATLAS_HEIGHT_PX = 386;
const OVERSCAN_PX = 240;

interface ITileGroup {
	image: string;
	label: string;
	tiles: IDayMapTile[];
	url: string | undefined;
}

type TRow =
	| { group: ITileGroup; kind: 'header' }
	| { group: ITileGroup; kind: 'atlas' }
	| { group: ITileGroup; kind: 'tiles'; tiles: IDayMapTile[] };

function getFileName(path: string) {
	const clean = path.replace(/^rex:\/\/[^/]+\//, '');
	return clean.slice(clean.lastIndexOf('/') + 1) || path;
}

/** 按像素位置把多块矩形切片组成图章；原始网格不参与。 */
function createStampBrush(tiles: readonly IDayMapTile[]): ITileBrush | null {
	const usable = tiles.filter((tile) => !tile.mesh && tile.rect.length >= 4);
	if (usable.length === 0) return null;
	const minLeft = Math.min(...usable.map((tile) => tile.rect[0] ?? 0));
	const minBottom = Math.min(...usable.map((tile) => tile.rect[1] ?? 0));
	const seen = new Set<string>();
	const cells = usable.flatMap((tile) => {
		const dx = Math.round(
			((tile.rect[0] ?? 0) - minLeft) / tile.pixelsPerUnit
		);
		const dy = Math.round(
			((tile.rect[1] ?? 0) - minBottom) / tile.pixelsPerUnit
		);
		const key = `${dx},${dy}`;
		if (seen.has(key)) return [];
		seen.add(key);
		return [{ dx, dy, tile: tile.key }];
	});
	return { cells };
}

interface IAtlasProps {
	group: ITileGroup;
	selectedKeys: ReadonlySet<string>;
	onSelect(tiles: IDayMapTile[]): void;
}

/** 整张图片视图：点击选一块，拖出矩形选多块组成图章。 */
const TileAtlasView = memo(function TileAtlasView({
	group,
	onSelect,
	selectedKeys,
}: IAtlasProps) {
	const imageSize = useImageSize(group.url);
	const frameRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [frameWidth, setFrameWidth] = useState(280);
	const [zoom, setZoom] = useState(0);
	const [hovered, setHovered] = useState<IDayMapTile | null>(null);
	const [drag, setDrag] = useState<{
		current: { x: number; y: number };
		pointerId: number;
		start: { x: number; y: number };
	} | null>(null);
	useEffect(() => {
		const frame = frameRef.current;
		if (!frame) return;
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width) setFrameWidth(width);
		});
		observer.observe(frame);
		return () => observer.disconnect();
	}, []);
	const fitScale = imageSize ? Math.min(4, frameWidth / imageSize.width) : 1;
	const scale = zoom > 0 ? zoom : fitScale;
	const rects = useMemo(
		() =>
			imageSize
				? group.tiles.flatMap((tile) => {
						const rect = getTileSourceRect(tile, imageSize);
						return rect ? [{ rect, tile }] : [];
					})
				: [],
		[group.tiles, imageSize]
	);
	const width = imageSize ? imageSize.width * scale : 0;
	const height = imageSize ? imageSize.height * scale : 0;
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !imageSize) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		const shouldOutlineAll = rects.length <= 4000 && scale * 16 >= 6;
		if (shouldOutlineAll) {
			context.strokeStyle = 'rgba(148, 163, 184, 0.45)';
			context.lineWidth = 1;
			context.beginPath();
			for (const { rect } of rects)
				context.rect(
					Math.round(rect.left * scale) + 0.5,
					Math.round(rect.top * scale) + 0.5,
					Math.max(1, Math.round(rect.width * scale) - 1),
					Math.max(1, Math.round(rect.height * scale) - 1)
				);
			context.stroke();
		}
		context.fillStyle = 'rgba(251, 191, 36, 0.28)';
		context.strokeStyle = '#fbbf24';
		context.lineWidth = 2;
		for (const { rect, tile } of rects) {
			if (!selectedKeys.has(tile.key)) continue;
			context.fillRect(
				rect.left * scale,
				rect.top * scale,
				rect.width * scale,
				rect.height * scale
			);
			context.strokeRect(
				rect.left * scale + 1,
				rect.top * scale + 1,
				Math.max(1, rect.width * scale - 2),
				Math.max(1, rect.height * scale - 2)
			);
		}
		const hover = hovered && rects.find((item) => item.tile === hovered);
		if (hover && !drag) {
			context.strokeStyle = '#ffffff';
			context.lineWidth = 1.5;
			context.strokeRect(
				hover.rect.left * scale,
				hover.rect.top * scale,
				hover.rect.width * scale,
				hover.rect.height * scale
			);
		}
		if (drag) {
			const left = Math.min(drag.start.x, drag.current.x);
			const top = Math.min(drag.start.y, drag.current.y);
			context.fillStyle = 'rgba(96, 165, 250, 0.18)';
			context.strokeStyle = '#60a5fa';
			context.setLineDash([4, 3]);
			context.lineWidth = 1;
			context.fillRect(
				left,
				top,
				Math.abs(drag.current.x - drag.start.x),
				Math.abs(drag.current.y - drag.start.y)
			);
			context.strokeRect(
				left + 0.5,
				top + 0.5,
				Math.abs(drag.current.x - drag.start.x),
				Math.abs(drag.current.y - drag.start.y)
			);
		}
	}, [drag, height, hovered, imageSize, rects, scale, selectedKeys, width]);

	function readPoint(event: PointerEvent<HTMLCanvasElement>) {
		const box = event.currentTarget.getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	}
	function findTile(point: { x: number; y: number }) {
		const x = point.x / scale;
		const y = point.y / scale;
		for (let i = rects.length - 1; i >= 0; i--) {
			const item = rects[i];
			if (
				item &&
				x >= item.rect.left &&
				x <= item.rect.left + item.rect.width &&
				y >= item.rect.top &&
				y <= item.rect.top + item.rect.height
			)
				return item.tile;
		}
		return null;
	}
	if (!group.url || imageSize === null)
		return (
			<div style={{ height: ATLAS_HEIGHT_PX }}>
				<MapHint className="px-1 py-2">
					图片缺失，无法显示图集。
				</MapHint>
			</div>
		);
	if (!imageSize)
		return (
			<div style={{ height: ATLAS_HEIGHT_PX }} className="pb-2.5">
				<div className="h-full animate-pulse rounded-medium bg-default/30 motion-reduce:animate-none" />
			</div>
		);
	return (
		<div
			className="flex flex-col gap-1.5 pb-2.5"
			style={{ height: ATLAS_HEIGHT_PX }}
		>
			<div className="flex h-6 shrink-0 items-center justify-between gap-2">
				<span className={TYPOGRAPHY_STYLES.caption}>
					{imageSize.width}×{imageSize.height} · 拖动框选组成图章
				</span>
				<div className="flex items-center gap-0.5">
					<Button
						isIconOnly
						size="sm"
						variant="light"
						aria-label="缩小图集"
						className="h-6 w-6 min-w-6 text-sm"
						isDisabled={scale <= fitScale}
						onPress={() =>
							setZoom(scale / 2 <= fitScale ? 0 : scale / 2)
						}
					>
						<MinusIcon />
					</Button>
					<span className="min-w-10 text-center font-mono text-[10px] tabular-nums text-foreground-500">
						{Math.round(scale * 100)}%
					</span>
					<Button
						isIconOnly
						size="sm"
						variant="light"
						aria-label="放大图集"
						className="h-6 w-6 min-w-6 text-sm"
						isDisabled={scale >= 8}
						onPress={() => setZoom(Math.min(8, scale * 2))}
					>
						<PlusIcon />
					</Button>
				</div>
			</div>
			<div
				ref={frameRef}
				className="bg-checkerboard h-80 shrink-0 overflow-auto rounded-medium border border-divider"
			>
				<div className="relative" style={{ height, width }}>
					<img
						src={group.url}
						alt=""
						draggable={false}
						className="absolute inset-0 max-w-none select-none"
						style={{
							height,
							imageRendering: scale >= 1 ? 'pixelated' : 'auto',
							width,
						}}
					/>
					<canvas
						ref={canvasRef}
						aria-label={`${group.label} 图集`}
						className="absolute inset-0 cursor-crosshair touch-none"
						style={{ height, width }}
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							event.currentTarget.setPointerCapture(
								event.pointerId
							);
							const point = readPoint(event);
							setDrag({
								current: point,
								pointerId: event.pointerId,
								start: point,
							});
						}}
						onPointerMove={(event) => {
							const point = readPoint(event);
							if (drag?.pointerId === event.pointerId)
								setDrag({ ...drag, current: point });
							else setHovered(findTile(point));
						}}
						onPointerLeave={() => setHovered(null)}
						onPointerUp={(event) => {
							if (drag?.pointerId !== event.pointerId) return;
							const point = readPoint(event);
							setDrag(null);
							if (
								Math.hypot(
									point.x - drag.start.x,
									point.y - drag.start.y
								) < 4
							) {
								const tile = findTile(point);
								if (tile) onSelect([tile]);
								return;
							}
							const left =
								Math.min(drag.start.x, point.x) / scale;
							const right =
								Math.max(drag.start.x, point.x) / scale;
							const top = Math.min(drag.start.y, point.y) / scale;
							const bottom =
								Math.max(drag.start.y, point.y) / scale;
							const selected = rects
								.filter(
									({ rect }) =>
										rect.left < right &&
										rect.left + rect.width > left &&
										rect.top < bottom &&
										rect.top + rect.height > top
								)
								.map(({ tile }) => tile);
							if (selected.length > 0) onSelect(selected);
						}}
						onPointerCancel={() => setDrag(null)}
					/>
				</div>
			</div>
			<span
				className={cn(
					TYPOGRAPHY_STYLES.metadata,
					'h-5 shrink-0 truncate'
				)}
			>
				{hovered?.key ?? ''}
			</span>
		</div>
	);
});

interface IProps {
	assetUrls: Readonly<Record<string, string>>;
	brush: ITileBrush | null;
	importCard?: ReactNode;
	isReadOnly: boolean;
	map: IDayMap;
	mode: 'object' | 'tile';
	onBrushChange(brush: ITileBrush): void;
	onImportOpen(): void;
	packLabel: string;
}

export const TilePalette = memo(function TilePalette({
	assetUrls,
	brush,
	importCard,
	isReadOnly,
	map,
	mode,
	onBrushChange,
	onImportOpen,
	packLabel,
}: IProps) {
	const [query, setQuery] = useState('');
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [atlasGroups, setAtlasGroups] = useState<ReadonlySet<string>>(
		new Set()
	);
	const [anchorKey, setAnchorKey] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [viewport, setViewport] = useState({
		height: 320,
		top: 0,
		width: 300,
	});
	const frameRef = useRef(0);
	const selectedKeys = useMemo(
		() => new Set(brush?.cells.map((cell) => cell.tile) ?? []),
		[brush]
	);
	const usage = getTileUsage(map);
	const groups = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		const byImage = new Map<string, ITileGroup>();
		for (const tile of map.tiles) {
			if (
				normalized &&
				!tile.key.toLowerCase().includes(normalized) &&
				!tile.image.toLowerCase().includes(normalized)
			)
				continue;
			let group = byImage.get(tile.image);
			if (!group) {
				group = {
					image: tile.image,
					label: getFileName(tile.image),
					tiles: [],
					url:
						resolveMapImageUrl(tile.image, packLabel, assetUrls) ??
						undefined,
				};
				byImage.set(tile.image, group);
			}
			group.tiles.push(tile);
		}
		return [...byImage.values()];
	}, [assetUrls, map.tiles, packLabel, query]);
	const columns = Math.max(
		3,
		Math.floor(
			(viewport.width + CELL_GAP_PX) / (CELL_SIZE_PX + CELL_GAP_PX)
		)
	);
	const layout = useMemo(() => {
		const rows: { height: number; row: TRow; top: number }[] = [];
		let top = 0;
		const push = (row: TRow, height: number) => {
			rows.push({ height, row, top });
			top += height;
		};
		for (const group of groups) {
			if (groups.length > 1)
				push({ group, kind: 'header' }, HEADER_HEIGHT_PX);
			if (collapsed.has(group.image)) continue;
			if (atlasGroups.has(group.image)) {
				push({ group, kind: 'atlas' }, ATLAS_HEIGHT_PX);
				continue;
			}
			for (let start = 0; start < group.tiles.length; start += columns)
				push(
					{
						group,
						kind: 'tiles',
						tiles: group.tiles.slice(start, start + columns),
					},
					ROW_HEIGHT_PX
				);
		}
		return { height: top, rows };
	}, [atlasGroups, collapsed, columns, groups]);
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect)
				setViewport((value) => ({
					...value,
					height: rect.height,
					width: rect.width,
				}));
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (frameRef.current) cancelAnimationFrame(frameRef.current);
		};
	}, []);
	const visibleRows = layout.rows.filter(
		(item) =>
			item.top + item.height >= viewport.top - OVERSCAN_PX &&
			item.top <= viewport.top + viewport.height + OVERSCAN_PX
	);

	function selectTiles(tiles: IDayMapTile[]) {
		const first = tiles[0];
		if (!first) return;
		if (tiles.length === 1 || mode === 'object') {
			onBrushChange({ cells: [{ dx: 0, dy: 0, tile: first.key }] });
			setAnchorKey(first.key);
			return;
		}
		const stamp = createStampBrush(tiles);
		if (stamp && stamp.cells.length > 1) onBrushChange(stamp);
		else onBrushChange({ cells: [{ dx: 0, dy: 0, tile: first.key }] });
	}

	function handleTilePress(
		tile: IDayMapTile,
		group: ITileGroup,
		modifiers: { ctrl: boolean; shift: boolean }
	) {
		if (
			mode === 'tile' &&
			!tile.mesh &&
			(modifiers.ctrl || modifiers.shift)
		) {
			if (modifiers.shift && anchorKey) {
				const anchor = group.tiles.find(
					(item) => item.key === anchorKey
				);
				if (anchor && !anchor.mesh) {
					const [ax = 0, ay = 0] = anchor.rect;
					const [bx = 0, by = 0] = tile.rect;
					const minX = Math.min(ax, bx);
					const maxX = Math.max(ax, bx);
					const minY = Math.min(ay, by);
					const maxY = Math.max(ay, by);
					selectTiles(
						group.tiles.filter(
							(item) =>
								!item.mesh &&
								(item.rect[0] ?? 0) >= minX &&
								(item.rect[0] ?? 0) <= maxX &&
								(item.rect[1] ?? 0) >= minY &&
								(item.rect[1] ?? 0) <= maxY
						)
					);
					return;
				}
			}
			const keys = new Set(selectedKeys);
			if (keys.has(tile.key)) keys.delete(tile.key);
			else keys.add(tile.key);
			const tiles = map.tiles.filter((item) => keys.has(item.key));
			if (tiles.length > 0) selectTiles(tiles);
			return;
		}
		selectTiles([tile]);
	}

	const total = map.tiles.length;
	return (
		<MapPanel
			title="瓦片库"
			meta={total}
			icon={<GridIcon />}
			tip={
				mode === 'tile'
					? '单击选择画笔。Ctrl/⌘ 单击或 Shift 单击可把多块切片组成图章；也可切换到图集视图框选。'
					: '选择放置装饰使用的切片，再到画布点击放置。'
			}
			actions={
				<Tooltip content="导入 PNG 到瓦片库">
					<Button
						size="sm"
						variant="flat"
						color="primary"
						isDisabled={isReadOnly}
						startContent={<UploadIcon className="size-4" />}
						className="h-8 min-w-0 px-2.5 text-xs"
						onPress={onImportOpen}
					>
						导入
					</Button>
				</Tooltip>
			}
		>
			{importCard}
			{total > 0 && (
				<Input
					size="sm"
					aria-label="筛选瓦片"
					placeholder="按切片键或图片筛选"
					value={query}
					startContent={
						<SearchIcon className="size-4 text-foreground-400" />
					}
					isClearable
					onValueChange={(value) => {
						setQuery(value);
						scrollRef.current?.scrollTo({ top: 0 });
					}}
				/>
			)}
			{total === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-medium border border-dashed border-divider bg-content1/20 px-4 py-6 text-center">
					<ImageIcon className="size-8 text-foreground-400" />
					<p className={TYPOGRAPHY_STYLES.emptyTitle}>瓦片库为空</p>
					<p className={TYPOGRAPHY_STYLES.emptyDescription}>
						导入 PNG 并切成小块，或把 PNG 直接拖到画布上。
					</p>
				</div>
			) : (
				<div
					ref={scrollRef}
					role="group"
					aria-label="瓦片"
					className="relative h-[clamp(14rem,42vh,30rem)] overflow-y-auto overscroll-contain"
					onScroll={(event) => {
						const top = event.currentTarget.scrollTop;
						if (frameRef.current) return;
						frameRef.current = requestAnimationFrame(() => {
							frameRef.current = 0;
							setViewport((value) => ({ ...value, top }));
						});
					}}
				>
					{groups.length === 0 && (
						<MapHint className="py-6 text-center">
							没有匹配的切片。
						</MapHint>
					)}
					<div
						className="relative w-full"
						style={{ height: layout.height }}
					>
						{visibleRows.map(({ row, top }) => {
							const style = {
								left: 0,
								position: 'absolute' as const,
								right: 0,
								top,
							};
							if (row.kind === 'header') {
								const isCollapsed = collapsed.has(
									row.group.image
								);
								const isAtlas = atlasGroups.has(
									row.group.image
								);
								return (
									<div
										key={`header:${row.group.image}`}
										style={style}
										className="flex h-[34px] items-center gap-1 pr-1"
									>
										<button
											type="button"
											aria-expanded={!isCollapsed}
											className="flex min-w-0 flex-1 items-center gap-1 rounded-small px-1 py-1 text-left hover:bg-default/30"
											onClick={() => {
												const next = new Set(collapsed);
												if (isCollapsed)
													next.delete(
														row.group.image
													);
												else next.add(row.group.image);
												setCollapsed(next);
											}}
										>
											<ChevronDownIcon
												className={cn(
													'size-3.5 shrink-0 text-foreground-500 transition-transform motion-reduce:transition-none',
													isCollapsed && '-rotate-90'
												)}
											/>
											<span
												title={row.group.image}
												className={cn(
													TYPOGRAPHY_STYLES.compactLabel,
													'min-w-0 truncate'
												)}
											>
												{row.group.label}
											</span>
											<span className="shrink-0 font-mono text-[10px] text-foreground-400">
												{row.group.tiles.length}
											</span>
										</button>
										<Tooltip
											content={
												isAtlas
													? '切回缩略图'
													: '图集视图'
											}
										>
											<Button
												isIconOnly
												size="sm"
												variant={
													isAtlas ? 'flat' : 'light'
												}
												color={
													isAtlas
														? 'primary'
														: 'default'
												}
												aria-label={
													isAtlas
														? '切回缩略图'
														: '图集视图'
												}
												aria-pressed={isAtlas}
												className="h-6 w-6 min-w-6 text-sm"
												onPress={() => {
													const next = new Set(
														atlasGroups
													);
													if (isAtlas)
														next.delete(
															row.group.image
														);
													else
														next.add(
															row.group.image
														);
													setAtlasGroups(next);
												}}
											>
												<ImageIcon />
											</Button>
										</Tooltip>
									</div>
								);
							}
							if (row.kind === 'atlas')
								return (
									<div
										key={`atlas:${row.group.image}`}
										style={style}
									>
										<TileAtlasView
											group={row.group}
											selectedKeys={selectedKeys}
											onSelect={selectTiles}
										/>
									</div>
								);
							return (
								<div
									key={`tiles:${row.group.image}:${row.tiles[0]?.key ?? top}`}
									style={style}
									className="flex gap-[6px]"
								>
									{row.tiles.map((tile) => {
										const isSelected = selectedKeys.has(
											tile.key
										);
										const count = usage.get(tile.key);
										return (
											<button
												key={tile.key}
												type="button"
												aria-pressed={isSelected}
												aria-label={`瓦片 ${tile.key}`}
												title={`${tile.key}${count ? ` · ${count.cells} 格${count.objects ? `、${count.objects} 装饰` : ''}` : ' · 未使用'}`}
												className={cn(
													'bg-checkerboard relative flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-medium border transition-[border-color,box-shadow] motion-reduce:transition-none',
													'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
													isSelected
														? 'border-primary shadow-[0_0_0_2px] shadow-primary/60'
														: 'border-divider hover:border-foreground-400'
												)}
												onClick={(event) =>
													handleTilePress(
														tile,
														row.group,
														{
															ctrl:
																event.ctrlKey ||
																event.metaKey,
															shift: event.shiftKey,
														}
													)
												}
											>
												<TileThumb
													tile={tile}
													url={row.group.url}
													size={44}
												/>
												{!count && (
													<span
														aria-hidden
														className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-foreground-300"
													/>
												)}
											</button>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			)}
			{total > 0 && (
				<MapHint>
					{mode === 'tile'
						? '小圆点表示尚未使用的切片。按住 Alt 在画布上点击可直接吸取瓦片。'
						: '选中切片后在画布点击放置，装饰默认按脚部 Y 排序。'}
				</MapHint>
			)}
		</MapPanel>
	);
});
