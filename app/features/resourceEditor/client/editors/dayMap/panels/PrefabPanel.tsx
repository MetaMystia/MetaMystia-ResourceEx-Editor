'use client';

import { cn } from '@heroui/theme';
import { memo, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import {
	DAY_MAP_LIMITS,
	DAY_MAP_SORTING_LAYERS,
} from '@/domain/resourcePack/dayMapValidation';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import {
	checkPrefabKey,
	getPrefabUsage,
	patchPrefab,
	removePrefabs,
	renamePrefab,
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
	CollisionModeIcon,
	ObjectModeIcon,
	SearchIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { getImagePreviewUrl } from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

interface IProps {
	assetUrls: Readonly<Record<string, string>>;
	isImporting: boolean;
	isReadOnly: boolean;
	map: IDayMap;
	packLabel: string;
	selectedKey: string | null;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onEditColliders(objectIndex: number): void;
	onImport(file: File): void;
	onSelectedKeyChange(key: string | null): void;
}

const SORTING_OPTIONS = DAY_MAP_SORTING_LAYERS.map((value) => ({
	label: value,
	value,
}));

export const PrefabPanel = memo(function PrefabPanel({
	assetUrls,
	isImporting,
	isReadOnly,
	map,
	onCommit,
	onEditColliders,
	onImport,
	onSelectedKeyChange,
	packLabel,
	selectedKey,
}: IProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const usage = useMemo(() => getPrefabUsage(map), [map]);
	const normalized = query.trim().toLowerCase();
	const prefabs = normalized
		? map.prefabs.filter((prefab) =>
				prefab.key.toLowerCase().includes(normalized)
			)
		: map.prefabs;
	const selected = map.prefabs.find((prefab) => prefab.key === selectedKey);
	const unused = map.prefabs.filter((prefab) => !usage.has(prefab.key));
	const firstInstance = selected
		? map.objects.findIndex((object) => object.prefab === selected.key)
		: -1;

	return (
		<>
			<MapPanel
				title="物件模板"
				meta={`${map.prefabs.length}/${DAY_MAP_LIMITS.prefabCount}`}
				icon={<ObjectModeIcon />}
				tip="物件模板对应原版带 SpriteRenderer 的预制体：一张图、锚点、排序与碰撞。同一模板的所有物件共用图片和碰撞。"
				actions={
					<SectionAddButton
						isDisabled={isReadOnly || isImporting}
						onPress={() => inputRef.current?.click()}
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
					aria-label="导入 PNG 物件模板"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) onImport(file);
					}}
				/>
				{map.prefabs.length > 8 && (
					<Input
						size="sm"
						aria-label="筛选物件模板"
						placeholder="按键筛选"
						value={query}
						isClearable
						startContent={
							<SearchIcon className="size-4 text-foreground-400" />
						}
						onValueChange={setQuery}
					/>
				)}
				{map.prefabs.length === 0 ? (
					<MapHint className="rounded-medium border border-dashed border-divider px-3 py-4 text-center">
						导入树木、房屋等
						PNG，透明边会自动裁掉，锚点默认放在底部中央（脚点）。
					</MapHint>
				) : (
					<div
						role="listbox"
						aria-label="物件模板"
						className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain p-0.5"
					>
						{prefabs.map((prefab) => {
							const url = getImagePreviewUrl(
								prefab.image,
								assetUrls,
								packLabel
							);
							const isSelected = prefab.key === selectedKey;
							return (
								<button
									key={prefab.key}
									type="button"
									role="option"
									aria-selected={isSelected}
									title={prefab.key}
									className={cn(
										'flex min-w-0 flex-col items-center gap-1 rounded-medium border p-1 text-left outline-none transition-colors motion-reduce:transition-none',
										'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
										isSelected
											? 'border-primary/60 bg-primary/10'
											: 'border-divider hover:bg-default/30'
									)}
									onClick={() =>
										onSelectedKeyChange(
											isSelected ? null : prefab.key
										)
									}
								>
									<span className="flex h-14 w-full items-center justify-center overflow-hidden rounded-small bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
										{url ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={url}
												alt=""
												className="image-rendering-pixelated max-h-full max-w-full object-contain"
											/>
										) : (
											<span className="text-[10px] text-danger">
												缺图
											</span>
										)}
									</span>
									<span className="w-full truncate text-center font-mono text-[10px] leading-4 text-foreground-600">
										{prefab.key}
									</span>
									<span className="text-[10px] leading-3 text-foreground-400">
										×{usage.get(prefab.key) ?? 0}
									</span>
								</button>
							);
						})}
					</div>
				)}
				{unused.length > 0 && !isReadOnly && (
					<SectionDeleteButton
						className="self-start"
						confirmTitle={`删除 ${unused.length} 个未使用的物件模板？`}
						confirmDescription="图片文件仍保留在资产中，可以撤销。"
						onPress={() =>
							onCommit(
								removePrefabs(
									map,
									new Set(unused.map((prefab) => prefab.key))
								)
							)
						}
					>
						清理未使用（{unused.length}）
					</SectionDeleteButton>
				)}
				<MapHint>
					选中模板后用“放置物件”工具在画布上点击。也可以把 PNG
					直接拖到画布上。
				</MapHint>
			</MapPanel>
			{selected && (
				<MapPanel
					title="模板属性"
					meta={`×${usage.get(selected.key) ?? 0}`}
				>
					<MapTextField
						key={`key:${selected.key}`}
						label="键"
						value={selected.key}
						isDisabled={isReadOnly}
						description="重命名会同步更新使用它的物件。"
						validate={(value) =>
							checkPrefabKey(map, selected.key, value)
						}
						onChange={(key) => {
							if (
								onCommit(renamePrefab(map, selected.key, key))
									.isSuccess
							)
								onSelectedKeyChange(key);
						}}
					/>
					<MapVector
						key={`pivot:${selected.key}`}
						labels={['锚点 X', '锚点 Y']}
						values={selected.pivot}
						step={0.01}
						isDisabled={isReadOnly}
						onChange={(pivot) =>
							onCommit(patchPrefab(map, selected.key, { pivot }))
						}
					/>
					<div className="flex flex-wrap gap-1.5">
						<Button
							size="sm"
							variant="light"
							isDisabled={isReadOnly}
							onPress={() =>
								onCommit(
									patchPrefab(map, selected.key, {
										pivot: [0.5, 0],
									})
								)
							}
						>
							底部中央
						</Button>
						<Button
							size="sm"
							variant="light"
							isDisabled={isReadOnly}
							onPress={() =>
								onCommit(
									patchPrefab(map, selected.key, {
										pivot: [0.5, 0.5],
									})
								)
							}
						>
							中心
						</Button>
					</div>
					<MapNumber
						key={`ppu:${selected.key}`}
						label="每单位像素"
						value={selected.pixelsPerUnit}
						min={1}
						max={1024}
						isDisabled={isReadOnly}
						description="原版多数为 48，部分特效与光照为 100。"
						onChange={(pixelsPerUnit) =>
							onCommit(
								patchPrefab(map, selected.key, {
									pixelsPerUnit,
								})
							)
						}
					/>
					<Switch
						size="sm"
						isSelected={selected.sortByY}
						isDisabled={isReadOnly}
						onValueChange={(sortByY) =>
							onCommit(
								patchPrefab(map, selected.key, { sortByY })
							)
						}
					>
						<span className="flex flex-col">
							<span className={TYPOGRAPHY_STYLES.controlLabel}>
								按脚点 Y 排序
							</span>
							<span className={TYPOGRAPHY_STYLES.caption}>
								与原版 LayerSortingController 一致：排序值为
								(int)(-32×Y)。
							</span>
						</span>
					</Switch>
					<div className="grid grid-cols-2 items-end gap-2">
						<div className="flex min-w-0 flex-col gap-1.5">
							<span className={TYPOGRAPHY_STYLES.compactLabel}>
								排序层
							</span>
							<Select<string>
								ariaLabel="模板排序层"
								size="sm"
								value={selected.sortingLayer}
								items={SORTING_OPTIONS}
								isDisabled={isReadOnly}
								onChange={(sortingLayer) =>
									onCommit(
										patchPrefab(map, selected.key, {
											sortingLayer,
										})
									)
								}
							/>
						</div>
						<MapNumber
							key={`order:${selected.key}`}
							label="排序顺序"
							value={selected.sortingOrder}
							min={-32768}
							max={32767}
							isDisabled={isReadOnly || selected.sortByY}
							onChange={(sortingOrder) =>
								onCommit(
									patchPrefab(map, selected.key, {
										sortingOrder,
									})
								)
							}
						/>
					</div>
					<div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-medium bg-default/25 p-2">
						<MapProperty
							label="尺寸"
							value={`${selected.image.width}×${selected.image.height}`}
						/>
						<MapProperty
							label="图块"
							value={selected.image.chunks.length}
						/>
						<MapProperty
							label="碰撞"
							value={selected.colliders.length}
						/>
					</div>
					<Button
						size="sm"
						variant="flat"
						className="self-start"
						isDisabled={isReadOnly || firstInstance < 0}
						startContent={<CollisionModeIcon className="size-4" />}
						onPress={() => onEditColliders(firstInstance)}
					>
						编辑模板碰撞
					</Button>
					{firstInstance < 0 && (
						<MapHint>
							先放置一个物件，才能在画布上编辑模板碰撞。
						</MapHint>
					)}
					<SectionDeleteButton
						className="self-start"
						isDisabled={isReadOnly}
						confirmTitle={`删除物件模板“${selected.key}”？`}
						confirmDescription={
							usage.get(selected.key)
								? `使用它的 ${usage.get(selected.key)} 个物件会一并删除，可以撤销。`
								: undefined
						}
						onPress={() => {
							if (
								onCommit(
									removePrefabs(map, new Set([selected.key]))
								).isSuccess
							)
								onSelectedKeyChange(null);
						}}
					>
						删除模板
					</SectionDeleteButton>
				</MapPanel>
			)}
		</>
	);
});
