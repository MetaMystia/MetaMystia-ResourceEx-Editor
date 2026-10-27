'use client';

import { cn } from '@heroui/theme';
import { saveAs } from 'file-saver';
import { memo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';
import {
	DAY_MAP_LIMITS,
	DAY_MAP_SORTING_LAYERS,
} from '@/domain/resourcePack/dayMapValidation';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { formatMapNumber } from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	moveLayer,
	patchLayer,
	removeLayer,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import { composeImage } from '@/features/resourceEditor/client/editors/dayMap/mapImageChunks';
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
	EyeIcon,
	EyeOffIcon,
	ImageIcon,
	LayersIcon,
	UploadIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { getSceneDrawOrder } from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

interface IProps {
	activeLayerIndex: number;
	assetUrls: Readonly<Record<string, string>>;
	hiddenLayers: ReadonlySet<number>;
	isImporting: boolean;
	isReadOnly: boolean;
	map: IDayMap;
	packLabel: string;
	onActiveLayerChange(index: number): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onHiddenLayersChange(hidden: ReadonlySet<number>): void;
	onImport(file: File, replaceIndex: number | null): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
}

const SORTING_OPTIONS = DAY_MAP_SORTING_LAYERS.map((value) => ({
	label: value,
	value,
}));

/** 删除或移动列表项后，隐藏标记跟着原图层走。 */
function remapHidden(
	hidden: ReadonlySet<number>,
	remap: (index: number) => number | null
) {
	const next = new Set<number>();
	hidden.forEach((index) => {
		const mapped = remap(index);
		if (mapped !== null) next.add(mapped);
	});
	return next;
}

export const LayerPanel = memo(function LayerPanel({
	activeLayerIndex,
	assetUrls,
	hiddenLayers,
	isImporting,
	isReadOnly,
	map,
	onActiveLayerChange,
	onCommit,
	onHiddenLayersChange,
	onImport,
	onNotice,
	packLabel,
}: IProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const order = getSceneDrawOrder(map)
		.filter((entry) => entry.kind === 'layer')
		.map((entry) => entry.index)
		.reverse();
	const active = map.layers[activeLayerIndex];
	const ppu = map.pixelsPerUnit;

	function toggleVisibility(index: number) {
		const next = new Set(hiddenLayers);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		onHiddenLayersChange(next);
	}

	function openImport(index: number | null) {
		setReplaceIndex(index);
		inputRef.current?.click();
	}

	function reorder(from: number, to: number) {
		if (!onCommit(moveLayer(map, from, to)).isSuccess) return;
		onHiddenLayersChange(
			remapHidden(hiddenLayers, (index) =>
				index === from
					? to
					: from < to && index > from && index <= to
						? index - 1
						: from > to && index >= to && index < from
							? index + 1
							: index
			)
		);
		onActiveLayerChange(to);
	}

	async function exportImage() {
		if (!active) return;
		setIsExporting(true);
		try {
			const blob = await composeImage(active.image, (path) => {
				const local = resolveDayMapAssetPath(path, packLabel);
				return local === null ? undefined : assetUrls[local];
			});
			saveAs(blob, `${active.name || 'layer'}.png`);
		} catch (reason) {
			onNotice(
				reason instanceof Error ? reason.message : '导出图片失败。',
				'error'
			);
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<MapPanel
			title="图层"
			meta={`${map.layers.length}/${DAY_MAP_LIMITS.layerCount}`}
			icon={<LayersIcon />}
			tip="每个图层是一张整图，对应原版的一层 Tilemap。列表按游戏绘制顺序排列，越靠上越靠前；显隐只影响编辑器预览。"
			actions={
				<SectionAddButton
					isDisabled={
						isReadOnly ||
						isImporting ||
						map.layers.length >= DAY_MAP_LIMITS.layerCount
					}
					onPress={() => openImport(null)}
				>
					导入
				</SectionAddButton>
			}
		>
			<input
				ref={inputRef}
				hidden
				type="file"
				accept=".png,image/png"
				aria-label="导入 PNG 图层"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = '';
					if (file) onImport(file, replaceIndex);
				}}
			/>
			{map.layers.length === 0 ? (
				<MapHint className="rounded-medium border border-dashed border-divider px-3 py-4 text-center">
					导入一张 PNG 作为地面，或直接拖到画布上。图片按 1024
					像素自动切块保存，空白区域不占空间。
				</MapHint>
			) : (
				<ul
					aria-label="图层列表"
					className="flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain"
				>
					{order.map((index) => {
						const layer = map.layers[index];
						if (!layer) return null;
						const isActive = index === activeLayerIndex;
						const isHidden = hiddenLayers.has(index);
						return (
							<li
								key={index}
								className={cn(
									'flex min-w-0 items-center gap-1 rounded-medium border px-1 py-0.5 transition-colors motion-reduce:transition-none',
									isActive
										? 'border-primary/50 bg-primary/10'
										: 'border-transparent hover:bg-default/30'
								)}
							>
								<Tooltip
									content={isHidden ? '显示图层' : '隐藏图层'}
								>
									<Button
										isIconOnly
										size="sm"
										variant="light"
										aria-label={`${isHidden ? '显示' : '隐藏'}图层 ${layer.name}`}
										aria-pressed={!isHidden}
										className={cn(
											'h-7 w-7 min-w-7 text-base',
											isHidden && 'text-foreground-400'
										)}
										onPress={() => toggleVisibility(index)}
									>
										{isHidden ? (
											<EyeOffIcon />
										) : (
											<EyeIcon />
										)}
									</Button>
								</Tooltip>
								<button
									type="button"
									aria-current={isActive ? 'true' : undefined}
									className={cn(
										'flex min-w-0 flex-1 flex-col rounded-small px-1 py-1 text-left outline-none',
										'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
										isHidden && 'opacity-60'
									)}
									onClick={() => onActiveLayerChange(index)}
								>
									<span
										className={cn(
											TYPOGRAPHY_STYLES.compactItemTitle,
											'min-w-0 truncate',
											isActive &&
												'text-primary-700 dark:text-primary'
										)}
									>
										{layer.name || `图层${index + 1}`}
									</span>
									<span className="truncate font-mono text-[10px] leading-4 text-foreground-500">
										{layer.sortingLayer} ·{' '}
										{layer.sortingOrder} ·{' '}
										{layer.image.width}×{layer.image.height}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{active && (
				<div className="flex flex-col gap-3 border-t border-divider pt-3">
					<MapTextField
						key={`name:${activeLayerIndex}`}
						label="图层名称"
						value={active.name}
						isDisabled={isReadOnly}
						onChange={(name) =>
							onCommit(
								patchLayer(map, activeLayerIndex, { name })
							)
						}
					/>
					<div className="grid grid-cols-2 items-end gap-2">
						<div className="flex min-w-0 flex-col gap-1.5">
							<span className={TYPOGRAPHY_STYLES.compactLabel}>
								排序层
							</span>
							<Select<string>
								ariaLabel="图层排序层"
								size="sm"
								value={active.sortingLayer}
								items={SORTING_OPTIONS}
								isDisabled={isReadOnly}
								onChange={(sortingLayer) =>
									onCommit(
										patchLayer(map, activeLayerIndex, {
											sortingLayer,
										})
									)
								}
							/>
						</div>
						<MapNumber
							key={`order:${activeLayerIndex}`}
							label="排序顺序"
							value={active.sortingOrder}
							min={-32768}
							max={32767}
							isDisabled={isReadOnly}
							onChange={(sortingOrder) =>
								onCommit(
									patchLayer(map, activeLayerIndex, {
										sortingOrder,
									})
								)
							}
						/>
					</div>
					<MapVector
						key={`position:${activeLayerIndex}`}
						labels={['左 (像素)', '下 (像素)']}
						values={[active.x, active.y]}
						step={1}
						isDisabled={isReadOnly}
						onChange={([x = 0, y = 0]) =>
							onCommit(
								patchLayer(map, activeLayerIndex, {
									x: Math.round(x),
									y: Math.round(y),
								})
							)
						}
					/>
					<div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-medium bg-default/25 p-2">
						<MapProperty
							label="尺寸"
							value={`${active.image.width}×${active.image.height}`}
						/>
						<MapProperty
							label="图块"
							value={active.image.chunks.length}
						/>
						<MapProperty
							label="世界宽"
							value={formatMapNumber(active.image.width / ppu)}
						/>
						<MapProperty
							label="世界高"
							value={formatMapNumber(active.image.height / ppu)}
						/>
					</div>
					{active.color ? (
						<div className="flex flex-col gap-2">
							<MapVector
								key={`color:${activeLayerIndex}`}
								labels={['R', 'G', 'B', 'A']}
								values={active.color}
								min={0}
								max={1}
								step={0.05}
								isDisabled={isReadOnly}
								onChange={(color) =>
									onCommit(
										patchLayer(map, activeLayerIndex, {
											color,
										})
									)
								}
							/>
							<Button
								size="sm"
								variant="light"
								className="self-start"
								isDisabled={isReadOnly}
								onPress={() => {
									const next = { ...active };
									delete next.color;
									onCommit({
										...map,
										layers: map.layers.map((layer, i) =>
											i === activeLayerIndex
												? next
												: layer
										),
									});
								}}
							>
								清除着色
							</Button>
						</div>
					) : (
						<Button
							size="sm"
							variant="light"
							className="self-start"
							isDisabled={isReadOnly}
							onPress={() =>
								onCommit(
									patchLayer(map, activeLayerIndex, {
										color: [1, 1, 1, 1],
									})
								)
							}
						>
							添加着色（对应原版图层颜色）
						</Button>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="flat"
							isDisabled={isReadOnly || isImporting}
							startContent={<UploadIcon className="size-4" />}
							onPress={() => openImport(activeLayerIndex)}
						>
							替换图片
						</Button>
						<Button
							size="sm"
							variant="flat"
							isLoading={isExporting}
							startContent={<ImageIcon className="size-4" />}
							onPress={() => void exportImage()}
						>
							导出 PNG
						</Button>
						<Tooltip content="在同排序时上移一层">
							<Button
								isIconOnly
								size="sm"
								variant="light"
								aria-label="在列表中后移"
								isDisabled={
									isReadOnly ||
									activeLayerIndex >= map.layers.length - 1
								}
								className="h-8 w-8 min-w-8 rotate-180"
								onPress={() =>
									reorder(
										activeLayerIndex,
										activeLayerIndex + 1
									)
								}
							>
								<ChevronDownIcon />
							</Button>
						</Tooltip>
						<Tooltip content="在同排序时下移一层">
							<Button
								isIconOnly
								size="sm"
								variant="light"
								aria-label="在列表中前移"
								isDisabled={isReadOnly || activeLayerIndex <= 0}
								className="h-8 w-8 min-w-8"
								onPress={() =>
									reorder(
										activeLayerIndex,
										activeLayerIndex - 1
									)
								}
							>
								<ChevronDownIcon />
							</Button>
						</Tooltip>
					</div>
					<MapHint>
						在外部工具修改后用“替换图片”，图层左上角保持不动。选择工具下可在画布上拖动图层，方向键按
						1 像素微调（Shift 为 10
						像素）。需要与角色前后交错的树木、房屋请导入为物件。
					</MapHint>
					<SectionDeleteButton
						className="self-start"
						isDisabled={isReadOnly}
						confirmTitle={`删除图层“${active.name || `图层${activeLayerIndex + 1}`}”？`}
						confirmDescription="图块文件仍保留在资产中，可以撤销。"
						onPress={() => {
							if (
								!onCommit(removeLayer(map, activeLayerIndex))
									.isSuccess
							)
								return;
							onHiddenLayersChange(
								remapHidden(hiddenLayers, (index) =>
									index === activeLayerIndex
										? null
										: index > activeLayerIndex
											? index - 1
											: index
								)
							);
							onActiveLayerChange(
								Math.max(0, activeLayerIndex - 1)
							);
						}}
					>
						删除图层
					</SectionDeleteButton>
				</div>
			)}
		</MapPanel>
	);
});
