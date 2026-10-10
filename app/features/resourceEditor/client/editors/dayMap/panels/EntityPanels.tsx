'use client';

import { cn } from '@heroui/theme';
import {
	memo,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';
import Tooltip from '@/design/ui/components/tooltip';

import type {
	IDayMap,
	TDayMapRotation,
} from '@/domain/resourcePack/contracts/dayMap';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import {
	formatMapNumber,
	MAP_LIMITS,
	type TMapEntityKind,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	checkSpawnName,
	deleteEntities,
	duplicateEntities,
	findSortingValue,
	getSortingLayerOptions,
	patchCollision,
	patchObject,
	patchSpawn,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	getCollisionRect,
	isPointInRect,
	snapToStep,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';
import {
	MapHint,
	MapNumber,
	MapPanel,
	MapProperty,
	MapTextField,
	MapVector,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	ArrowIcon,
	CollisionModeIcon,
	CopyIcon,
	LocateIcon,
	ObjectModeIcon,
	SearchIcon,
	SpawnModeIcon,
	StarIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import {
	getTileIndex,
	resolveMapImageUrl,
} from '@/features/resourceEditor/client/editors/dayMap/render/sceneGeometry';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

import { TileThumb } from './TileThumb';

const ROW_HEIGHT_PX = 40;
const EMPTY_SET: ReadonlySet<number> = new Set();

const ENTITY_LABELS = {
	collision: {
		icon: <CollisionModeIcon />,
		name: '碰撞框',
		limit: MAP_LIMITS.collisionCount,
	},
	object: {
		icon: <ObjectModeIcon />,
		name: '装饰',
		limit: MAP_LIMITS.objectCount,
	},
	spawn: {
		icon: <SpawnModeIcon />,
		name: '出生点',
		limit: MAP_LIMITS.spawnCount,
	},
} as const satisfies Record<
	TMapEntityKind,
	{ icon: ReactNode; limit: number; name: string }
>;

const ROTATION_OPTIONS = [
	{ label: '下', rotate: 180, value: 'Down' },
	{ label: '左', rotate: -90, value: 'Left' },
	{ label: '上', rotate: 0, value: 'Up' },
	{ label: '右', rotate: 90, value: 'Right' },
] as const satisfies readonly {
	label: string;
	rotate: number;
	value: TDayMapRotation;
}[];

interface IEntityItem {
	index: number;
	isDefault: boolean;
	meta: string;
	name: string;
}

function describeEntities(map: IDayMap, kind: TMapEntityKind): IEntityItem[] {
	if (kind === 'spawn')
		return map.spawnMarkers.map((marker, index) => ({
			index,
			isDefault: marker.name === map.defaultSpawnMarker,
			meta: `${formatMapNumber(marker.x)}, ${formatMapNumber(marker.y)} · ${ROTATION_OPTIONS.find((item) => item.value === marker.rotation)?.label ?? marker.rotation}`,
			name: marker.name,
		}));
	if (kind === 'collision')
		return map.collisions.map((box, index) => ({
			index,
			isDefault: false,
			meta: `${formatMapNumber(box.width)}×${formatMapNumber(box.height)} @ ${formatMapNumber(box.x)}, ${formatMapNumber(box.y)}`,
			name: box.name || `碰撞${index + 1}`,
		}));
	return map.objects.map((object, index) => ({
		index,
		isDefault: false,
		meta: `${object.tile} @ ${formatMapNumber(object.x)}, ${formatMapNumber(object.y)}`,
		name: object.name || `装饰${index + 1}`,
	}));
}

interface IEntityListProps {
	isReadOnly: boolean;
	kind: TMapEntityKind;
	map: IDayMap;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onFocusEntity(index: number): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
	onSelectionChange(kind: TMapEntityKind, indices: ReadonlySet<number>): void;
	selection: ReadonlySet<number>;
	snapStep: number;
}

export const EntityListPanel = memo(function EntityListPanel({
	isReadOnly,
	kind,
	map,
	onCommit,
	onFocusEntity,
	onNotice,
	onSelectionChange,
	selection,
	snapStep,
}: IEntityListProps) {
	const [query, setQuery] = useState('');
	const [scrollTop, setScrollTop] = useState(0);
	const [height, setHeight] = useState(240);
	const scrollRef = useRef<HTMLDivElement>(null);
	const anchorRef = useRef<number | null>(null);
	const items = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		const all = describeEntities(map, kind);
		return normalized
			? all.filter(
					(item) =>
						item.name.toLowerCase().includes(normalized) ||
						item.meta.toLowerCase().includes(normalized)
				)
			: all;
	}, [kind, map, query]);
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect.height;
			if (next) setHeight(next);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	// 画布上选中的项目滚动到可见位置。
	const [firstSelected] = selection;
	useEffect(() => {
		const element = scrollRef.current;
		if (!element || firstSelected === undefined) return;
		const position = items.findIndex(
			(item) => item.index === firstSelected
		);
		if (position < 0) return;
		const top = position * ROW_HEIGHT_PX;
		if (top < element.scrollTop) element.scrollTop = top;
		else if (top + ROW_HEIGHT_PX > element.scrollTop + element.clientHeight)
			element.scrollTop = top + ROW_HEIGHT_PX - element.clientHeight;
	}, [firstSelected, items]);
	const label = ENTITY_LABELS[kind];
	const count =
		kind === 'object'
			? map.objects.length
			: kind === 'collision'
				? map.collisions.length
				: map.spawnMarkers.length;
	const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - 6);
	const end = Math.min(
		items.length,
		Math.ceil((scrollTop + height) / ROW_HEIGHT_PX) + 6
	);

	function handlePress(
		index: number,
		modifiers: { ctrl: boolean; shift: boolean }
	) {
		if (modifiers.shift && anchorRef.current !== null) {
			const from = items.findIndex(
				(item) => item.index === anchorRef.current
			);
			const to = items.findIndex((item) => item.index === index);
			if (from >= 0 && to >= 0) {
				const range = items.slice(
					Math.min(from, to),
					Math.max(from, to) + 1
				);
				onSelectionChange(
					kind,
					new Set([
						...(modifiers.ctrl ? selection : []),
						...range.map((item) => item.index),
					])
				);
				return;
			}
		}
		anchorRef.current = index;
		if (modifiers.ctrl) {
			const next = new Set(selection);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			onSelectionChange(kind, next);
			return;
		}
		onSelectionChange(kind, new Set([index]));
		onFocusEntity(index);
	}

	return (
		<MapPanel
			title={`${label.name}列表`}
			meta={`${count}/${label.limit}`}
			icon={label.icon}
			actions={
				selection.size > 0 && !isReadOnly ? (
					<>
						<Tooltip content="复制所选（Ctrl+D）">
							<Button
								isIconOnly
								size="sm"
								variant="light"
								aria-label="复制所选"
								className="h-8 w-8 min-w-8 text-base"
								onPress={() => {
									const offset =
										snapStep > 0
											? Math.max(snapStep, 0.5)
											: 0.5;
									const result = duplicateEntities(
										map,
										kind,
										selection,
										offset,
										-offset
									);
									if (typeof result === 'string') {
										onNotice(result, 'error');
										return;
									}
									if (onCommit(result.map).isSuccess)
										onSelectionChange(
											kind,
											new Set(result.indices)
										);
								}}
							>
								<CopyIcon />
							</Button>
						</Tooltip>
						<SectionDeleteButton
							iconOnly
							aria-label={`删除所选${label.name}`}
							{...(selection.size > 1
								? {
										confirmTitle: `删除 ${selection.size} 个${label.name}？`,
									}
								: {})}
							onPress={() => {
								if (
									onCommit(
										deleteEntities(map, kind, selection)
									).isSuccess
								)
									onSelectionChange(kind, EMPTY_SET);
							}}
						>
							删除
						</SectionDeleteButton>
					</>
				) : undefined
			}
		>
			{count > 8 && (
				<Input
					size="sm"
					aria-label={`筛选${label.name}`}
					placeholder="按名称筛选"
					value={query}
					isClearable
					startContent={
						<SearchIcon className="size-4 text-foreground-400" />
					}
					onValueChange={setQuery}
				/>
			)}
			{count === 0 ? (
				<MapHint className="rounded-medium border border-dashed border-divider px-3 py-4 text-center">
					{kind === 'collision'
						? '用“绘制碰撞框”工具在画布上拖出矩形。图片透明度不会自动生成碰撞。'
						: kind === 'spawn'
							? '用“放置出生点”工具在画布上点击添加。'
							: '在瓦片库选择切片，再用“放置装饰”工具在画布上点击。'}
				</MapHint>
			) : (
				<div
					ref={scrollRef}
					role="group"
					aria-label={`${label.name}列表`}
					className="relative max-h-[clamp(10rem,28vh,18rem)] min-h-10 overflow-y-auto overscroll-contain"
					style={{
						height: Math.min(items.length, 8) * ROW_HEIGHT_PX,
					}}
					onScroll={(event) =>
						setScrollTop(event.currentTarget.scrollTop)
					}
				>
					<div
						className="relative"
						style={{ height: items.length * ROW_HEIGHT_PX }}
					>
						{items.slice(start, end).map((item, offset) => {
							const isSelected = selection.has(item.index);
							return (
								<button
									key={item.index}
									type="button"
									aria-pressed={isSelected}
									className={cn(
										'absolute inset-x-0 flex h-[38px] min-w-0 items-center gap-2 rounded-medium px-2 text-left transition-colors motion-reduce:transition-none',
										'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
										isSelected
											? 'bg-primary/15 text-primary-700 dark:text-primary'
											: 'hover:bg-default/30'
									)}
									style={{
										top: (start + offset) * ROW_HEIGHT_PX,
									}}
									onClick={(event) =>
										handlePress(item.index, {
											ctrl:
												event.ctrlKey || event.metaKey,
											shift: event.shiftKey,
										})
									}
									onDoubleClick={() =>
										onFocusEntity(item.index)
									}
								>
									<span className="flex min-w-0 flex-1 flex-col">
										<span
											className={cn(
												TYPOGRAPHY_STYLES.compactItemTitle,
												'flex min-w-0 items-center gap-1'
											)}
										>
											<span className="truncate">
												{item.name}
											</span>
											{item.isDefault && (
												<StarIcon
													className="size-3.5 shrink-0 fill-warning text-warning"
													aria-label="默认出生点"
												/>
											)}
										</span>
										<span className="truncate font-mono text-[10px] leading-4 text-foreground-500">
											{item.meta}
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
			{count > 0 && (
				<MapHint>
					Shift 连选，Ctrl/⌘ 加选；双击定位。画布上可框选，Delete
					删除，方向键微调。
				</MapHint>
			)}
		</MapPanel>
	);
});

interface IInspectorProps {
	index: number;
	isReadOnly: boolean;
	map: IDayMap;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onDeleted(): void;
	onFocus(): void;
}

function LocateButton({ onFocus }: { onFocus(): void }) {
	return (
		<Tooltip content="在画布中定位（F）">
			<Button
				isIconOnly
				size="sm"
				variant="light"
				aria-label="在画布中定位"
				className="h-8 w-8 min-w-8 text-base"
				onPress={onFocus}
			>
				<LocateIcon />
			</Button>
		</Tooltip>
	);
}

export function ObjectInspector({
	assetUrls,
	brushTile,
	index,
	isReadOnly,
	map,
	onCommit,
	onDeleted,
	onFocus,
	packLabel,
}: IInspectorProps & {
	assetUrls: Readonly<Record<string, string>>;
	brushTile: string | null;
	packLabel: string;
}) {
	const object = map.objects[index];
	if (!object) return null;
	const tile = getTileIndex(map.tiles).get(object.tile);
	const url = tile
		? (resolveMapImageUrl(tile.image, packLabel, assetUrls) ?? undefined)
		: undefined;
	const sortingOptions = getSortingLayerOptions(map).map((value) => ({
		label: value,
		value,
	}));
	const limit = object.sortByY
		? MAP_LIMITS.sortedObjectY
		: MAP_LIMITS.coordinate;
	return (
		<MapPanel
			title="装饰属性"
			meta={`#${index + 1}`}
			actions={<LocateButton onFocus={onFocus} />}
		>
			<MapTextField
				label="名称"
				value={object.name}
				isDisabled={isReadOnly}
				onChange={(name) => onCommit(patchObject(map, index, { name }))}
			/>
			<div className="flex items-center gap-3 rounded-medium bg-default/25 p-2">
				<span className="bg-checkerboard flex size-[52px] shrink-0 items-center justify-center rounded-medium border border-divider">
					{tile ? (
						<TileThumb tile={tile} url={url} size={44} />
					) : (
						<span className="text-[10px] text-danger">无效</span>
					)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<MapProperty label="切片" value={object.tile} />
					{brushTile && brushTile !== object.tile && (
						<Button
							size="sm"
							variant="flat"
							isDisabled={isReadOnly}
							className="h-7 self-start px-2 text-xs"
							onPress={() =>
								onCommit(
									patchObject(map, index, { tile: brushTile })
								)
							}
						>
							换成瓦片库所选
						</Button>
					)}
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<MapNumber
					label="X"
					value={object.x}
					min={-MAP_LIMITS.coordinate}
					max={MAP_LIMITS.coordinate}
					step={0.125}
					isDisabled={isReadOnly}
					onChange={(x) => onCommit(patchObject(map, index, { x }))}
				/>
				<MapNumber
					label="Y（脚点）"
					value={object.y}
					min={-limit}
					max={limit}
					step={0.125}
					isDisabled={isReadOnly}
					onChange={(y) => onCommit(patchObject(map, index, { y }))}
				/>
			</div>
			<MapVector
				labels={['缩放 X', '缩放 Y']}
				values={object.scale}
				min={0.01}
				isDisabled={isReadOnly}
				onChange={(scale) =>
					onCommit(patchObject(map, index, { scale }))
				}
			/>
			<Switch
				size="sm"
				isSelected={object.sortByY}
				isDisabled={
					isReadOnly ||
					(!object.sortByY &&
						Math.abs(object.y) > MAP_LIMITS.sortedObjectY)
				}
				onValueChange={(sortByY) =>
					onCommit(patchObject(map, index, { sortByY }))
				}
			>
				<span className="flex flex-col">
					<span className={TYPOGRAPHY_STYLES.controlLabel}>
						按脚部 Y 排序
					</span>
					<span className={TYPOGRAPHY_STYLES.caption}>
						与角色前后交错，顺序为 −32×Y
					</span>
				</span>
			</Switch>
			<div className="grid grid-cols-2 items-end gap-2">
				<div className="flex min-w-0 flex-col gap-1.5">
					<span className={TYPOGRAPHY_STYLES.compactLabel}>
						排序层
					</span>
					<Select<string>
						ariaLabel="装饰排序层"
						size="sm"
						value={object.sortingLayer}
						items={sortingOptions}
						isDisabled={isReadOnly}
						onChange={(sortingLayer) =>
							onCommit(
								patchObject(map, index, {
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
				{object.sortByY ? (
					<MapProperty
						label="排序顺序"
						value={Math.trunc(-32 * object.y)}
					/>
				) : (
					<MapNumber
						label="排序顺序"
						value={object.sortingOrder}
						min={-32768}
						max={32767}
						isDisabled={isReadOnly}
						onChange={(sortingOrder) =>
							onCommit(patchObject(map, index, { sortingOrder }))
						}
					/>
				)}
			</div>
			{(object.transform || object.color || object.shader) && (
				<div className="flex flex-col gap-1 rounded-medium bg-default/25 p-2">
					{object.shader && (
						<MapProperty label="材质" value={object.shader} />
					)}
					{object.transform && (
						<MapProperty
							label="变换"
							value={object.transform
								.map((value) => formatMapNumber(value, 3))
								.join(', ')}
						/>
					)}
					{object.color && (
						<MapProperty
							label="颜色"
							value={object.color
								.map((value) => formatMapNumber(value, 3))
								.join(', ')}
						/>
					)}
				</div>
			)}
			<SectionDeleteButton
				className="self-start"
				isDisabled={isReadOnly}
				onPress={() => {
					if (
						onCommit(
							deleteEntities(map, 'object', new Set([index]))
						).isSuccess
					)
						onDeleted();
				}}
			>
				删除装饰
			</SectionDeleteButton>
		</MapPanel>
	);
}

export function CollisionInspector({
	index,
	isReadOnly,
	map,
	onCommit,
	onDeleted,
	onFocus,
	snapStep,
}: IInspectorProps & { snapStep: number }) {
	const box = map.collisions[index];
	if (!box) return null;
	const rect = getCollisionRect(box);
	const step = snapStep > 0 ? snapStep : 0.25;
	const isAligned =
		snapToStep(rect.minX, step) === Number(rect.minX.toFixed(6)) &&
		snapToStep(rect.minY, step) === Number(rect.minY.toFixed(6)) &&
		snapToStep(rect.maxX, step) === Number(rect.maxX.toFixed(6)) &&
		snapToStep(rect.maxY, step) === Number(rect.maxY.toFixed(6));
	return (
		<MapPanel
			title="碰撞框属性"
			meta={`#${index + 1}`}
			actions={<LocateButton onFocus={onFocus} />}
		>
			<MapTextField
				label="名称"
				value={box.name}
				isDisabled={isReadOnly}
				onChange={(name) =>
					onCommit(patchCollision(map, index, { name }))
				}
			/>
			<MapVector
				labels={['中心 X', '中心 Y']}
				values={[box.x, box.y]}
				min={-MAP_LIMITS.coordinate}
				max={MAP_LIMITS.coordinate}
				isDisabled={isReadOnly}
				onChange={([x = 0, y = 0]) =>
					onCommit(patchCollision(map, index, { x, y }))
				}
			/>
			<MapVector
				labels={['宽', '高']}
				values={[box.width, box.height]}
				min={0.01}
				isDisabled={isReadOnly}
				onChange={([width = 1, height = 1]) =>
					onCommit(patchCollision(map, index, { height, width }))
				}
			/>
			<div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-medium bg-default/25 p-2">
				<MapProperty label="左" value={formatMapNumber(rect.minX, 4)} />
				<MapProperty label="右" value={formatMapNumber(rect.maxX, 4)} />
				<MapProperty label="下" value={formatMapNumber(rect.minY, 4)} />
				<MapProperty label="上" value={formatMapNumber(rect.maxY, 4)} />
			</div>
			<div className="flex flex-wrap gap-2">
				{!isAligned && (
					<Button
						size="sm"
						variant="flat"
						isDisabled={isReadOnly}
						onPress={() => {
							const minX = snapToStep(rect.minX, step);
							const minY = snapToStep(rect.minY, step);
							const maxX = Math.max(
								minX + step,
								snapToStep(rect.maxX, step)
							);
							const maxY = Math.max(
								minY + step,
								snapToStep(rect.maxY, step)
							);
							onCommit(
								patchCollision(map, index, {
									height: maxY - minY,
									width: maxX - minX,
									x: (minX + maxX) / 2,
									y: (minY + maxY) / 2,
								})
							);
						}}
					>
						对齐到 {formatMapNumber(step, 3)} 网格
					</Button>
				)}
				<SectionDeleteButton
					isDisabled={isReadOnly}
					onPress={() => {
						if (
							onCommit(
								deleteEntities(
									map,
									'collision',
									new Set([index])
								)
							).isSuccess
						)
							onDeleted();
					}}
				>
					删除碰撞框
				</SectionDeleteButton>
			</div>
			<MapHint>
				选择工具下拖动控制点调整大小，按住 Alt 不吸附。人物横向半宽约
				0.29 格，窄口至少留 1.2 格。
			</MapHint>
		</MapPanel>
	);
}

export function SpawnInspector({
	index,
	isReadOnly,
	map,
	onCommit,
	onDeleted,
	onFocus,
}: IInspectorProps) {
	const spawn = map.spawnMarkers[index];
	if (!spawn) return null;
	const isDefault = spawn.name === map.defaultSpawnMarker;
	const blocking = map.collisions.find((box) =>
		isPointInRect(spawn, getCollisionRect(box))
	);
	return (
		<MapPanel
			title="出生点属性"
			meta={isDefault ? '默认' : `#${index + 1}`}
			actions={<LocateButton onFocus={onFocus} />}
		>
			<MapTextField
				label="名称"
				value={spawn.name}
				isDisabled={isReadOnly}
				description={
					isDefault ? '重命名会同步更新默认出生点。' : undefined
				}
				validate={(value) => checkSpawnName(map, index, value)}
				onChange={(name) => onCommit(patchSpawn(map, index, { name }))}
			/>
			<MapVector
				labels={['X', 'Y']}
				values={[spawn.x, spawn.y]}
				min={-MAP_LIMITS.coordinate}
				max={MAP_LIMITS.coordinate}
				isDisabled={isReadOnly}
				onChange={([x = 0, y = 0]) =>
					onCommit(patchSpawn(map, index, { x, y }))
				}
			/>
			<div className="flex flex-col gap-1.5">
				<span className={TYPOGRAPHY_STYLES.compactLabel}>出生朝向</span>
				<div
					role="radiogroup"
					aria-label="出生朝向"
					className="grid grid-cols-4 gap-1"
				>
					{ROTATION_OPTIONS.map((option) => {
						const isActive = spawn.rotation === option.value;
						return (
							<Button
								key={option.value}
								role="radio"
								aria-checked={isActive}
								size="sm"
								variant={isActive ? 'flat' : 'light'}
								color={isActive ? 'primary' : 'default'}
								isDisabled={isReadOnly}
								className="h-9 min-w-0 gap-1 px-1 text-xs"
								startContent={
									<ArrowIcon
										className="size-4"
										style={{
											transform: `rotate(${option.rotate}deg)`,
										}}
									/>
								}
								onPress={() =>
									onCommit(
										patchSpawn(map, index, {
											rotation: option.value,
										})
									)
								}
							>
								{option.label}
							</Button>
						);
					})}
				</div>
			</div>
			<Button
				size="sm"
				variant={isDefault ? 'flat' : 'bordered'}
				color={isDefault ? 'warning' : 'default'}
				isDisabled={isReadOnly || isDefault}
				startContent={
					<StarIcon
						className={cn('size-4', isDefault && 'fill-current')}
					/>
				}
				className="self-start"
				onPress={() =>
					onCommit({ ...map, defaultSpawnMarker: spawn.name })
				}
			>
				{isDefault ? '默认出生点' : '设为默认出生点'}
			</Button>
			{blocking && (
				<WarningNotice>
					出生点中心位于碰撞框“{blocking.name || '未命名'}
					”内，导出检查会报错。建议离任何碰撞至少 0.3 格。
				</WarningNotice>
			)}
			<SectionDeleteButton
				className="self-start"
				isDisabled={isReadOnly}
				onPress={() => {
					if (
						onCommit(deleteEntities(map, 'spawn', new Set([index])))
							.isSuccess
					)
						onDeleted();
				}}
			>
				删除出生点
			</SectionDeleteButton>
			<MapHint>
				游戏中用 /resourceex map goto &lt;地图ID&gt; {spawn.name}{' '}
				进入该点。
			</MapHint>
		</MapPanel>
	);
}

export function MultiSelectionPanel({
	count,
	kind,
}: {
	count: number;
	kind: TMapEntityKind;
}) {
	return (
		<MapPanel title={`已选择 ${count} 个${ENTITY_LABELS[kind].name}`}>
			<MapHint>
				拖动任意一个可整体移动；方向键按吸附步长微调（Shift 为 1
				格）；Ctrl+D 复制，Delete 删除。
			</MapHint>
		</MapPanel>
	);
}
