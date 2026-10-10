'use client';

import { cn } from '@heroui/theme';
import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import {
	hasSpecialShader,
	MAP_LIMITS,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	addLayer,
	findSortingValue,
	getSortingLayerOptions,
	patchLayer,
	removeLayer,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	MapHint,
	MapNumber,
	MapPanel,
	MapTextField,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	EyeIcon,
	EyeOffIcon,
	LayersIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { getSceneDrawOrder } from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

interface IProps {
	activeLayerIndex: number;
	hiddenLayers: ReadonlySet<number>;
	isReadOnly: boolean;
	map: IDayMap;
	onActiveLayerChange(index: number): void;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onHiddenLayersChange(hidden: ReadonlySet<number>): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
}

function LayerBadge({
	children,
	tone = 'default',
}: {
	children: string;
	tone?: 'default' | 'warning';
}) {
	return (
		<span
			className={cn(
				'shrink-0 rounded-small px-1 text-[10px] font-medium leading-4',
				tone === 'warning'
					? 'bg-warning/25 text-warning-700 dark:text-warning'
					: 'bg-default/50 text-foreground-600'
			)}
		>
			{children}
		</span>
	);
}

export const LayerPanel = memo(function LayerPanel({
	activeLayerIndex,
	hiddenLayers,
	isReadOnly,
	map,
	onActiveLayerChange,
	onCommit,
	onHiddenLayersChange,
	onNotice,
}: IProps) {
	const order = getSceneDrawOrder(map)
		.filter((entry) => entry.kind === 'layer')
		.map((entry) => entry.index)
		.reverse();
	const active = map.layers[activeLayerIndex];
	const sortingOptions = getSortingLayerOptions(map).map((value) => ({
		label: value,
		value,
	}));

	function toggleVisibility(index: number) {
		const next = new Set(hiddenLayers);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		onHiddenLayersChange(next);
	}

	return (
		<MapPanel
			title="图层"
			meta={`${map.layers.length}/${MAP_LIMITS.layerCount}`}
			icon={<LayersIcon />}
			tip="列表按游戏绘制顺序排列，越靠上越靠前。图层显隐只影响编辑器预览，不导出。"
			actions={
				<SectionAddButton
					isDisabled={
						isReadOnly || map.layers.length >= MAP_LIMITS.layerCount
					}
					onPress={() => {
						const result = addLayer(map);
						if (typeof result === 'string') {
							onNotice(result, 'error');
							return;
						}
						if (onCommit(result.map).isSuccess)
							onActiveLayerChange(result.index);
					}}
				>
					添加
				</SectionAddButton>
			}
		>
			{map.layers.length === 0 ? (
				<MapHint className="rounded-medium border border-dashed border-divider px-3 py-4 text-center">
					还没有图层，添加一个后即可绘制瓦片。
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
						const isSpecialMaterial = hasSpecialShader(layer);
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
									<span className="flex min-w-0 items-center gap-1">
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
										{layer.isHeight && (
											<LayerBadge>原始高度</LayerBadge>
										)}
										{layer.active === false && (
											<LayerBadge tone="warning">
												停用
											</LayerBadge>
										)}
										{isSpecialMaterial && (
											<LayerBadge>特殊材质</LayerBadge>
										)}
									</span>
									<span className="truncate font-mono text-[10px] leading-4 text-foreground-500">
										{layer.sortingLayer} ·{' '}
										{layer.sortingOrder} ·{' '}
										{layer.cells.length} 格
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
								items={sortingOptions}
								isDisabled={isReadOnly}
								onChange={(sortingLayer) =>
									onCommit(
										patchLayer(map, activeLayerIndex, {
											sortingLayer,
											sortingValue: findSortingValue(
												map,
												sortingLayer
											),
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
					<MapHint>
						同一排序层中顺序大的绘制在前。需要与角色前后交错的树木等请放在装饰中。
					</MapHint>
					<SectionDeleteButton
						className="self-start"
						isDisabled={isReadOnly}
						confirmTitle={`删除图层“${active.name || `图层${activeLayerIndex + 1}`}”？`}
						confirmDescription={
							active.cells.length > 0
								? `其中 ${active.cells.length} 格会一并删除，可以撤销。`
								: undefined
						}
						onPress={() => {
							if (
								!onCommit(removeLayer(map, activeLayerIndex))
									.isSuccess
							)
								return;
							const next = new Set<number>();
							hiddenLayers.forEach((index) => {
								if (index < activeLayerIndex) next.add(index);
								else if (index > activeLayerIndex)
									next.add(index - 1);
							});
							onHiddenLayersChange(next);
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
