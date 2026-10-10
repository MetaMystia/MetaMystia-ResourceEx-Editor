'use client';

import { cn } from '@heroui/theme';
import { useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import {
	formatMapNumber,
	type IMapCellSelection,
	type ITileBrush,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	applyLayerCellChanges,
	checkTileKey,
	getCellKey,
	getTileUsage,
	patchTile,
	removeTiles,
	renameTileKey,
	replaceLayer,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	MapHint,
	MapNumber,
	MapPanel,
	MapProperty,
	MapTextField,
	MapVector,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	ChevronDownIcon,
	PickerIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { createBrushFromCell } from '@/features/resourceEditor/client/editors/dayMap/mapToolActions';
import {
	getTileIndex,
	resolveMapImageUrl,
} from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

import { TileThumb } from './TileThumb';

const PIVOT_PRESETS = [
	{ label: '左下', value: [0, 0] },
	{ label: '脚部', value: [0.5, 0] },
	{ label: '中心', value: [0.5, 0.5] },
] as const;

interface ITileInspectorProps {
	assetUrls: Readonly<Record<string, string>>;
	isReadOnly: boolean;
	map: IDayMap;
	onBrushChange(brush: ITileBrush | null): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	packLabel: string;
	tileKey: string;
}

export function TileInspector({
	assetUrls,
	isReadOnly,
	map,
	onBrushChange,
	onCommit,
	packLabel,
	tileKey,
}: ITileInspectorProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const tile = getTileIndex(map.tiles).get(tileKey);
	const usage = getTileUsage(map);
	if (!tile) return null;
	const count = usage.get(tile.key);
	const isUsed = Boolean(count && (count.cells > 0 || count.objects > 0));
	const unusedKeys = map.tiles
		.filter((item) => !usage.has(item.key))
		.map((item) => item.key);
	const url =
		resolveMapImageUrl(tile.image, packLabel, assetUrls) ?? undefined;
	const [, , width = 0, height = 0] = tile.rect;
	return (
		<MapPanel
			title="切片设置"
			meta={tile.key}
			actions={
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label={isExpanded ? '收起切片设置' : '展开切片设置'}
					aria-expanded={isExpanded}
					className="h-7 w-7 min-w-7"
					onPress={() => setIsExpanded(!isExpanded)}
				>
					<ChevronDownIcon
						className={cn(
							'transition-transform motion-reduce:transition-none',
							isExpanded && 'rotate-180'
						)}
					/>
				</Button>
			}
		>
			<div className="flex items-center gap-3">
				<span className="bg-checkerboard flex size-[72px] shrink-0 items-center justify-center rounded-medium border border-divider">
					<TileThumb tile={tile} url={url} size={64} />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<MapProperty
						label="尺寸"
						value={
							tile.mesh
								? `网格 ${tile.mesh.vertices.length} 顶点`
								: `${width}×${height} px`
						}
					/>
					<MapProperty
						label="占地"
						value={`${formatMapNumber(width / tile.pixelsPerUnit)}×${formatMapNumber(height / tile.pixelsPerUnit)} 格`}
					/>
					<MapProperty
						label="使用"
						value={
							isUsed
								? `${count?.cells ?? 0} 格 · ${count?.objects ?? 0} 装饰`
								: '未使用'
						}
					/>
				</div>
			</div>
			{isExpanded && (
				<div className="flex flex-col gap-3 border-t border-divider pt-3">
					<MapTextField
						label="切片键"
						value={tile.key}
						isDisabled={isReadOnly}
						description="重命名会同步更新所有格子和装饰的引用。"
						validate={(value) => checkTileKey(map, tile.key, value)}
						onChange={(key) => {
							const result = onCommit(
								renameTileKey(map, tile.key, key)
							);
							if (result.isSuccess)
								onBrushChange({
									cells: [{ dx: 0, dy: 0, tile: key }],
								});
						}}
					/>
					<MapProperty
						label="图片"
						value={<span title={tile.image}>{tile.image}</span>}
					/>
					{tile.mesh ? (
						<MapHint>
							原始网格按 UV
							定位图集，保留原锚点与裁切；修改每格像素只改变显示比例。
						</MapHint>
					) : (
						<>
							<MapVector
								labels={[
									'切片左',
									'切片下',
									'切片宽',
									'切片高',
								]}
								values={tile.rect}
								min={0}
								step={1}
								isDisabled={isReadOnly}
								onChange={(rect) =>
									onCommit(patchTile(map, tile.key, { rect }))
								}
							/>
							<div className="flex flex-col gap-2">
								<MapVector
									labels={['锚点 X', '锚点 Y']}
									values={tile.pivot}
									min={0}
									max={1}
									isDisabled={isReadOnly}
									onChange={(pivot) =>
										onCommit(
											patchTile(map, tile.key, { pivot })
										)
									}
								/>
								<div className="flex flex-wrap items-center gap-1">
									<span
										className={
											TYPOGRAPHY_STYLES.compactLabel
										}
									>
										预设
									</span>
									{PIVOT_PRESETS.map((preset) => {
										const isActive =
											tile.pivot[0] === preset.value[0] &&
											tile.pivot[1] === preset.value[1];
										return (
											<Button
												key={preset.label}
												size="sm"
												variant={
													isActive ? 'flat' : 'light'
												}
												color={
													isActive
														? 'primary'
														: 'default'
												}
												isDisabled={isReadOnly}
												className="h-6 min-w-0 px-2 text-xs"
												onPress={() =>
													onCommit(
														patchTile(
															map,
															tile.key,
															{
																pivot: [
																	...preset.value,
																],
															}
														)
													)
												}
											>
												{preset.label}
											</Button>
										);
									})}
								</div>
							</div>
						</>
					)}
					<MapNumber
						label="每格像素（PPU）"
						value={tile.pixelsPerUnit}
						min={0.01}
						step={0.1}
						isDisabled={isReadOnly}
						onChange={(pixelsPerUnit) =>
							onCommit(
								patchTile(map, tile.key, { pixelsPerUnit })
							)
						}
					/>
					<MapHint>
						修改会影响地图中所有使用该切片的位置。地面锚点通常为左下，树木等常用脚部。
					</MapHint>
					<div className="flex flex-wrap gap-2">
						<Tooltip
							content={
								isUsed
									? '仍有格子或装饰在使用，先擦除后才能删除。'
									: '删除这块切片'
							}
						>
							<span className="inline-flex">
								<SectionDeleteButton
									isDisabled={isReadOnly || isUsed}
									confirmTitle={`删除切片“${tile.key}”？`}
									onPress={() => {
										if (
											onCommit(
												removeTiles(
													map,
													new Set([tile.key])
												)
											).isSuccess
										)
											onBrushChange(null);
									}}
								>
									删除切片
								</SectionDeleteButton>
							</span>
						</Tooltip>
						{unusedKeys.length > 0 && (
							<SectionDeleteButton
								isDisabled={isReadOnly}
								confirmTitle={`清理 ${unusedKeys.length} 块未使用的切片？`}
								confirmDescription="图片文件仍保留在资产中，可撤销。"
								onPress={() => {
									const keys = new Set(unusedKeys);
									if (
										onCommit(removeTiles(map, keys))
											.isSuccess &&
										keys.has(tile.key)
									)
										onBrushChange(null);
								}}
							>
								清理未使用（{unusedKeys.length}）
							</SectionDeleteButton>
						)}
					</div>
				</div>
			)}
		</MapPanel>
	);
}

interface ICellInspectorProps {
	assetUrls: Readonly<Record<string, string>>;
	isReadOnly: boolean;
	map: IDayMap;
	onBrushChange(brush: ITileBrush): void;
	onClose(): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	packLabel: string;
	selection: IMapCellSelection;
}

export function CellInspector({
	assetUrls,
	isReadOnly,
	map,
	onBrushChange,
	onClose,
	onCommit,
	packLabel,
	selection,
}: ICellInspectorProps) {
	const layer = map.layers[selection.layerIndex];
	const key = getCellKey(selection.x, selection.y);
	const cell = layer?.cells.find(
		(item) => getCellKey(item.x, item.y) === key
	);
	if (!layer || !cell)
		return (
			<MapPanel title="格子">
				<MapHint>
					格子 ({selection.x}, {selection.y}) 已没有内容。
				</MapHint>
			</MapPanel>
		);
	const tile = getTileIndex(map.tiles).get(cell.tile);
	const url = tile
		? (resolveMapImageUrl(tile.image, packLabel, assetUrls) ?? undefined)
		: undefined;
	const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = cell.transform ?? [];
	const color = cell.color;
	return (
		<MapPanel title="格子" meta={`(${selection.x}, ${selection.y})`}>
			<div className="flex items-center gap-3">
				<span className="bg-checkerboard flex size-[60px] shrink-0 items-center justify-center rounded-medium border border-divider">
					{tile ? (
						<TileThumb tile={tile} url={url} size={52} />
					) : (
						<span className="text-[10px] text-danger">无效</span>
					)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<MapProperty label="瓦片" value={cell.tile} />
					<MapProperty
						label="图层"
						value={layer.name || `图层${selection.layerIndex + 1}`}
					/>
					{cell.shader && (
						<MapProperty label="材质" value={cell.shader} />
					)}
				</div>
			</div>
			{(cell.transform || color || cell.active === false) && (
				<div className="flex flex-col gap-1 rounded-medium bg-default/30 p-2">
					{cell.transform && (
						<MapProperty
							label="变换"
							value={`[${[a, b, c, d].map((value) => formatMapNumber(value, 3)).join(', ')}] + (${formatMapNumber(tx, 3)}, ${formatMapNumber(ty, 3)})`}
						/>
					)}
					{color && (
						<MapProperty
							label="颜色"
							value={
								<span className="inline-flex items-center gap-1.5">
									<span
										aria-hidden
										className="size-3 rounded-full border border-divider"
										style={{
											backgroundColor: `rgb(${color
												.slice(0, 3)
												.map((value) =>
													Math.round(
														Math.min(
															1,
															Math.max(0, value)
														) * 255
													)
												)
												.join(
													' '
												)} / ${Math.min(1, Math.max(0, color[3] ?? 1))})`,
										}}
									/>
									{color
										.map((value) =>
											formatMapNumber(value, 3)
										)
										.join(', ')}
								</span>
							}
						/>
					)}
					{cell.active === false && (
						<MapProperty label="状态" value="已停用" />
					)}
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="flat"
					startContent={<PickerIcon className="size-4" />}
					onPress={() =>
						onBrushChange(createBrushFromCell(map, cell))
					}
				>
					吸取为画笔
				</Button>
				<SectionDeleteButton
					isDisabled={isReadOnly}
					onPress={() => {
						const result = onCommit(
							replaceLayer(
								map,
								selection.layerIndex,
								applyLayerCellChanges(
									layer,
									new Map([[key, null]])
								)
							)
						);
						if (result.isSuccess) onClose();
					}}
				>
					删除此格
				</SectionDeleteButton>
			</div>
		</MapPanel>
	);
}
