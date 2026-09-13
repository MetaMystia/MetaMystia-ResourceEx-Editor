'use client';

import { useEffect, useRef, useState } from 'react';

import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import type {
	IDayMap,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

import { MapNumber, MapSection, MapVector } from './MapFields';

export interface ITileImportSettings {
	width: number;
	height: number;
	pixelsPerUnit: number;
	isWholeImage: boolean;
}

export function sliceMapImage(
	map: IDayMap,
	path: string,
	width: number,
	height: number,
	settings: ITileImportSettings
): IDayMapTile[] {
	const w = settings.isWholeImage ? width : settings.width;
	const h = settings.isWholeImage ? height : settings.height;
	if (
		![w, h].every((value) => Number.isInteger(value) && value > 0) ||
		!Number.isFinite(settings.pixelsPerUnit) ||
		settings.pixelsPerUnit <= 0
	)
		throw new Error('切片尺寸必须为正整数，每单位像素数必须大于零。');
	if (width % w || height % h)
		throw new Error(
			`图片为 ${width}×${height}，无法按 ${w}×${h} 整齐切分。请调整尺寸，或启用整图导入。`
		);
	if (map.tiles.length + (width / w) * (height / h) > 4096)
		throw new Error('切片总数不能超过 4096。请增大切片尺寸。');
	const keys = new Set(map.tiles.map((tile) => tile.key));
	const tiles: IDayMapTile[] = [];
	for (let top = 0; top < height; top += h) {
		for (let left = 0; left < width; left += w) {
			const key = findNextAvailableSuffixedValue(keys, 'tile_');
			keys.add(key);
			tiles.push({
				key,
				image: path,
				rect: [left, height - top - h, w, h],
				pivot: [0, 0],
				pixelsPerUnit: settings.pixelsPerUnit,
			});
		}
	}
	return tiles;
}

function TilePreview({
	tile,
	url,
}: {
	tile: IDayMapTile;
	url: string | undefined;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;
		context.clearRect(0, 0, 64, 64);
		if (!url) return;
		let isCancelled = false;
		const image = new Image();
		image.onload = () => {
			if (isCancelled) return;
			const [x = 0, y = 0, width = 0, height = 0] = tile.rect;
			if (
				width <= 0 ||
				height <= 0 ||
				x < 0 ||
				y < 0 ||
				x + width > image.naturalWidth ||
				y + height > image.naturalHeight
			)
				return;
			const scale = Math.min(60 / width, 60 / height);
			context.imageSmoothingEnabled = false;
			context.drawImage(
				image,
				x,
				image.naturalHeight - y - height,
				width,
				height,
				(64 - width * scale) / 2,
				(64 - height * scale) / 2,
				width * scale,
				height * scale
			);
		};
		image.src = url;
		return () => {
			isCancelled = true;
			image.onload = null;
		};
	}, [tile.rect, url]);
	return (
		<canvas
			ref={canvasRef}
			width={64}
			height={64}
			aria-hidden
			className="h-12 w-12"
		/>
	);
}

interface IProps {
	map: IDayMap;
	tileKey: string;
	assetUrls: Readonly<Record<string, string>>;
	packLabel: string;
	isImporting: boolean;
	onSelect(key: string): void;
	onChange(map: IDayMap): void;
	onImport(source: File | string, settings: ITileImportSettings): void;
}

export function TilePalette({
	map,
	tileKey,
	assetUrls,
	packLabel,
	isImporting,
	onSelect,
	onChange,
	onImport,
}: IProps) {
	const [settings, setSettings] = useState<ITileImportSettings>({
		width: 48,
		height: 48,
		pixelsPerUnit: 48,
		isWholeImage: false,
	});
	const [imagePath, setImagePath] = useState('');
	const [filter, setFilter] = useState('');
	const [page, setPage] = useState(0);
	const tile = map.tiles.find((item) => item.key === tileKey);
	const tiles = map.tiles.filter((item) =>
		item.key.toLowerCase().includes(filter.toLowerCase())
	);
	const pageCount = Math.max(1, Math.ceil(tiles.length / 64));
	const currentPage = Math.min(page, pageCount - 1);
	function patchTile(updates: Partial<IDayMapTile>) {
		onChange({
			...map,
			tiles: map.tiles.map((item) =>
				item.key === tileKey ? { ...item, ...updates } : item
			),
		});
	}
	function resolveUrl(path: string) {
		const localPath = resolveDayMapAssetPath(path, packLabel);
		return localPath === null ? undefined : assetUrls[localPath];
	}
	const hasReferences =
		tile &&
		(map.layers.some((layer) =>
			layer.cells.some((cell) => cell.tile === tile.key)
		) ||
			map.objects.some((object) => object.tile === tile.key));
	return (
		<div className="min-w-0 space-y-3">
			<MapSection title={`瓦片 · ${map.tiles.length}`}>
				<Input
					labelPlacement="outside"
					size="sm"
					aria-label="筛选瓦片"
					placeholder="按切片名称筛选"
					value={filter}
					onValueChange={(value) => {
						setFilter(value);
						setPage(0);
					}}
				/>
				<div
					className="grid max-h-72 grid-cols-3 gap-1 overflow-y-auto"
					aria-label="瓦片画笔"
				>
					{tiles
						.slice(currentPage * 64, (currentPage + 1) * 64)
						.map((item) => (
							<Button
								key={item.key}
								aria-label={`瓦片 ${item.key}`}
								title={item.key}
								aria-pressed={item.key === tileKey}
								variant={
									item.key === tileKey ? 'flat' : 'light'
								}
								color={
									item.key === tileKey ? 'primary' : 'default'
								}
								className="h-auto min-w-0 flex-col gap-0 px-1 py-1"
								onPress={() => onSelect(item.key)}
							>
								<TilePreview
									tile={item}
									url={resolveUrl(item.image)}
								/>
								<span className="w-full truncate text-[10px]">
									{item.key}
								</span>
							</Button>
						))}
				</div>
				{pageCount > 1 && (
					<div className="flex items-center justify-between gap-1 text-xs">
						<Button
							size="sm"
							isDisabled={currentPage === 0}
							onPress={() => setPage(currentPage - 1)}
						>
							上一页
						</Button>
						{currentPage + 1}/{pageCount}
						<Button
							size="sm"
							isDisabled={currentPage === pageCount - 1}
							onPress={() => setPage(currentPage + 1)}
						>
							下一页
						</Button>
					</div>
				)}
				{map.tiles.length === 0 && (
					<p className="text-xs text-foreground-500">
						先导入 PNG 切片，再选择画笔绘制地图。
					</p>
				)}
			</MapSection>
			<details
				className="rounded-medium border border-divider bg-content1 p-3"
				open={map.tiles.length === 0}
			>
				<summary className="cursor-pointer text-sm font-semibold">
					导入图片到瓦片库
				</summary>
				<div className="mt-3 space-y-3">
					<p className="text-xs text-foreground-500">
						把 PNG
						图片切成可反复绘制的小块，或整张加入瓦片库。导入后选择一个瓦片，再到画布绘制。
					</p>
					<Switch
						size="sm"
						isSelected={settings.isWholeImage}
						onValueChange={(isWholeImage) =>
							setSettings({ ...settings, isWholeImage })
						}
					>
						整张图片作为一个切片
					</Switch>
					{!settings.isWholeImage && (
						<MapVector
							labels={['切片宽（像素）', '切片高（像素）']}
							values={[settings.width, settings.height]}
							min={1}
							step={1}
							onChange={([width = 48, height = 48]) =>
								setSettings({ ...settings, width, height })
							}
						/>
					)}
					<MapNumber
						label="每单位像素数"
						value={settings.pixelsPerUnit}
						min={0.01}
						step={0.1}
						onChange={(pixelsPerUnit) =>
							setSettings({ ...settings, pixelsPerUnit })
						}
					/>
					<p className="text-xs text-foreground-500">
						默认 48×48
						像素对应一格。切片按图片从左到右、从上到下排列；导出自动转换为游戏的左下角坐标。
					</p>
					<label className="block text-xs">
						按上述设置导入 PNG
						<input
							aria-label="导入地图 PNG"
							className="mt-2 block w-full text-xs"
							disabled={isImporting}
							type="file"
							accept=".png,image/png"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = '';
								if (file) onImport(file, settings);
							}}
						/>
					</label>
					<Select
						ariaLabel="已有地图图片"
						value={imagePath}
						items={Object.keys(assetUrls)
							.filter((path) => /\.png$/i.test(path))
							.map((value) => ({ value, label: value }))}
						onChange={setImagePath}
					/>
					<Button
						size="sm"
						fullWidth
						isDisabled={!imagePath || isImporting}
						onPress={() => onImport(imagePath, settings)}
					>
						从已有图片加入瓦片
					</Button>
				</div>
			</details>
			{tile && (
				<details className="rounded-medium border border-divider bg-content1 p-3">
					<summary className="cursor-pointer truncate text-sm font-semibold">
						瓦片图片设置 · {tile.key}
					</summary>
					<div className="mt-3 space-y-3">
						<p className="text-xs text-foreground-500">
							调整选中瓦片取自图片的哪一块、对齐位置和显示大小。修改会影响地图中所有使用它的位置；普通绘制无需调整。
						</p>
						<Input
							labelPlacement="outside"
							size="sm"
							label="切片键"
							value={tile.key}
							onValueChange={(key) => {
								if (
									!key ||
									map.tiles.some(
										(item) =>
											item !== tile && item.key === key
									)
								)
									return;
								onChange({
									...map,
									tiles: map.tiles.map((item) =>
										item === tile ? { ...item, key } : item
									),
									layers: map.layers.map((layer) => ({
										...layer,
										cells: layer.cells.map((cell) =>
											cell.tile === tile.key
												? { ...cell, tile: key }
												: cell
										),
									})),
									objects: map.objects.map((object) =>
										object.tile === tile.key
											? { ...object, tile: key }
											: object
									),
								});
								onSelect(key);
							}}
						/>
						<p className="break-all text-xs text-foreground-500">
							{tile.image}
						</p>
						<MapVector
							labels={['切片左', '切片下', '切片宽', '切片高']}
							values={tile.rect}
							min={0}
							step={1}
							onChange={(rect) => patchTile({ rect })}
						/>
						<MapVector
							labels={['锚点 X', '锚点 Y']}
							values={tile.pivot}
							min={0}
							max={1}
							onChange={(pivot) => patchTile({ pivot })}
						/>
						<MapNumber
							label="切片每单位像素数"
							value={tile.pixelsPerUnit}
							min={0.01}
							step={0.1}
							onChange={(pixelsPerUnit) =>
								patchTile({ pixelsPerUnit })
							}
						/>
						<p className="text-xs text-foreground-500">
							地面锚点通常为 (0,0)，树木常用
							(0.5,0)。调整会影响所有引用。
						</p>
						<SectionDeleteButton
							isDisabled={!!hasReferences}
							onPress={() => {
								onChange({
									...map,
									tiles: map.tiles.filter(
										(item) => item !== tile
									),
								});
								onSelect('');
							}}
						>
							删除未使用切片
						</SectionDeleteButton>
					</div>
				</details>
			)}
		</div>
	);
}
