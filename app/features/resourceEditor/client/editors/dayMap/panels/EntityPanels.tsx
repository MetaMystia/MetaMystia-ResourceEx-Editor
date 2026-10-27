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
	IDayMapBoxCollider,
	IDayMapEdgeCollider,
	IDayMapObject,
	TDayMapCollider,
	TDayMapRotation,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	isPointInCollider,
	placeCollider,
} from '@/domain/resourcePack/dayMapGeometry';
import { DAY_MAP_LIMITS } from '@/domain/resourcePack/dayMapValidation';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import {
	formatMapNumber,
	type TColliderTarget,
	type TMapEntityKind,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	checkSpawnName,
	deleteEntities,
	duplicateEntities,
	getTargetColliders,
	getTargetObject,
	getTargetPrefab,
	patchCollider,
	patchObject,
	patchSpawn,
	setCollider,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import { getObjectPlacement } from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';
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
import { COLLIDER_LABELS } from '@/features/resourceEditor/client/editors/dayMap/render/drawMapOverlay';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

const ROW_HEIGHT_PX = 40;
const EMPTY_SET: ReadonlySet<number> = new Set();

const ENTITY_LABELS = {
	collider: {
		icon: <CollisionModeIcon />,
		limit: DAY_MAP_LIMITS.colliderCount,
		name: '碰撞',
	},
	object: {
		icon: <ObjectModeIcon />,
		limit: DAY_MAP_LIMITS.objectCount,
		name: '物件',
	},
	spawn: {
		icon: <SpawnModeIcon />,
		limit: DAY_MAP_LIMITS.spawnCount,
		name: '出生点',
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

function describeCollider(collider: TDayMapCollider) {
	switch (collider.shape) {
		case 'polygon':
			return `${collider.paths.reduce((count, path) => count + path.length, 0)} 顶点${collider.paths.length > 1 ? ` · ${collider.paths.length - 1} 个洞` : ''}`;
		case 'edge':
			return `${collider.points.length} 顶点${collider.closed ? ' · 闭合' : ''}`;
		case 'box':
			return `${formatMapNumber(collider.width)}×${formatMapNumber(collider.height)} @ ${formatMapNumber(collider.x)}, ${formatMapNumber(collider.y)}`;
		case 'circle':
			return `r ${formatMapNumber(collider.radius)} @ ${formatMapNumber(collider.x)}, ${formatMapNumber(collider.y)}`;
	}
}

function describeEntities(
	map: IDayMap,
	kind: TMapEntityKind,
	target: TColliderTarget
): IEntityItem[] {
	if (kind === 'spawn')
		return map.spawnMarkers.map((marker, index) => ({
			index,
			isDefault: marker.name === map.defaultSpawnMarker,
			meta: `${formatMapNumber(marker.x)}, ${formatMapNumber(marker.y)} · ${ROTATION_OPTIONS.find((item) => item.value === marker.rotation)?.label ?? marker.rotation}`,
			name: marker.name,
		}));
	if (kind === 'collider')
		return getTargetColliders(map, target).map((collider, index) => ({
			index,
			isDefault: false,
			meta: `${COLLIDER_LABELS[collider.shape]} · ${describeCollider(collider)}`,
			name:
				collider.name ??
				`${COLLIDER_LABELS[collider.shape]}${index + 1}`,
		}));
	return map.objects.map((object, index) => ({
		index,
		isDefault: false,
		meta: `${object.prefab} @ ${formatMapNumber(object.x)}, ${formatMapNumber(object.y)}`,
		name: object.name ?? `${object.prefab}`,
	}));
}

interface IEntityListProps {
	colliderTarget: TColliderTarget;
	isReadOnly: boolean;
	kind: TMapEntityKind;
	map: IDayMap;
	selection: ReadonlySet<number>;
	snapStep: number;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onFocusEntity(index: number): void;
	onNotice(message: string, tone?: 'error' | 'info'): void;
	onSelectionChange(kind: TMapEntityKind, indices: ReadonlySet<number>): void;
}

export const EntityListPanel = memo(function EntityListPanel({
	colliderTarget,
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
	const all = useMemo(
		() => describeEntities(map, kind, colliderTarget),
		[colliderTarget, kind, map]
	);
	const items = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return normalized
			? all.filter(
					(item) =>
						item.name.toLowerCase().includes(normalized) ||
						item.meta.toLowerCase().includes(normalized)
				)
			: all;
	}, [all, query]);
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
	const count = all.length;
	const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - 6);
	const end = Math.min(
		items.length,
		Math.ceil((scrollTop + height) / ROW_HEIGHT_PX) + 6
	);
	const targetPrefab =
		kind === 'collider' ? getTargetPrefab(map, colliderTarget) : null;

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
			title={
				targetPrefab
					? `模板“${targetPrefab.key}”的碰撞`
					: `${label.name}列表`
			}
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
										-offset,
										colliderTarget
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
										deleteEntities(
											map,
											kind,
											selection,
											colliderTarget
										)
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
					{kind === 'collider'
						? '用多边形、折线、矩形或圆形工具在画布上绘制。实心形状挡住内部；折线只有线段阻挡，适合围出可走区域。'
						: kind === 'spawn'
							? '用“放置出生点”工具在画布上点击添加。'
							: '在物件模板库中选择模板，再用“放置物件”工具在画布上点击。'}
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
	index,
	isReadOnly,
	map,
	onCommit,
	onDeleted,
	onEditColliders,
	onFocus,
	onPrefabSelect,
}: IInspectorProps & {
	onEditColliders(): void;
	onPrefabSelect(key: string): void;
}) {
	const object = map.objects[index];
	if (!object) return null;
	const prefab = map.prefabs.find((item) => item.key === object.prefab);
	const [scaleX = 1, scaleY = 1] = object.scale;
	return (
		<MapPanel
			title="物件属性"
			meta={`#${index + 1}`}
			actions={<LocateButton onFocus={onFocus} />}
		>
			<MapTextField
				label="名称"
				value={object.name ?? ''}
				placeholder={object.prefab}
				isDisabled={isReadOnly}
				onChange={(name) => {
					const next: IDayMapObject = { ...object, name };
					if (!name.trim()) delete next.name;
					onCommit({
						...map,
						objects: map.objects.map((item, i) =>
							i === index ? next : item
						),
					});
				}}
			/>
			<div className="flex min-w-0 flex-col gap-1.5">
				<span className={TYPOGRAPHY_STYLES.compactLabel}>物件模板</span>
				<Select<string>
					ariaLabel="物件模板"
					size="sm"
					value={object.prefab}
					items={map.prefabs.map((item) => ({
						label: item.key,
						value: item.key,
					}))}
					isDisabled={isReadOnly}
					onChange={(key) =>
						onCommit(patchObject(map, index, { prefab: key }))
					}
				/>
			</div>
			<MapVector
				labels={['X', 'Y']}
				values={[object.x, object.y]}
				min={-DAY_MAP_LIMITS.coordinate}
				max={DAY_MAP_LIMITS.coordinate}
				isDisabled={isReadOnly}
				onChange={([x = 0, y = 0]) =>
					onCommit(patchObject(map, index, { x, y }))
				}
			/>
			<div className="flex flex-wrap gap-3">
				<Switch
					size="sm"
					isSelected={scaleX < 0}
					isDisabled={isReadOnly}
					onValueChange={(isFlipped) =>
						onCommit(
							patchObject(map, index, {
								scale: [
									Math.abs(scaleX) * (isFlipped ? -1 : 1),
									scaleY,
								],
							})
						)
					}
				>
					<span className={TYPOGRAPHY_STYLES.controlLabel}>
						水平翻转
					</span>
				</Switch>
				<Switch
					size="sm"
					isSelected={scaleY < 0}
					isDisabled={isReadOnly}
					onValueChange={(isFlipped) =>
						onCommit(
							patchObject(map, index, {
								scale: [
									scaleX,
									Math.abs(scaleY) * (isFlipped ? -1 : 1),
								],
							})
						)
					}
				>
					<span className={TYPOGRAPHY_STYLES.controlLabel}>
						垂直翻转
					</span>
				</Switch>
			</div>
			{prefab && (
				<div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-medium bg-default/25 p-2">
					<MapProperty
						label="排序"
						value={
							prefab.sortByY
								? `按 Y（${Math.trunc(object.y * -32)}）`
								: `${prefab.sortingLayer} ${prefab.sortingOrder}`
						}
					/>
					<MapProperty label="碰撞" value={prefab.colliders.length} />
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="flat"
					onPress={() => onPrefabSelect(object.prefab)}
				>
					查看模板
				</Button>
				<Button
					size="sm"
					variant="flat"
					isDisabled={isReadOnly || !prefab}
					startContent={<CollisionModeIcon className="size-4" />}
					onPress={onEditColliders}
				>
					编辑模板碰撞
				</Button>
			</div>
			<SectionDeleteButton
				className="self-start"
				isDisabled={isReadOnly}
				onPress={() => {
					if (
						onCommit(
							deleteEntities(map, 'object', new Set([index]), {
								kind: 'map',
							})
						).isSuccess
					)
						onDeleted();
				}}
			>
				删除物件
			</SectionDeleteButton>
			<MapHint>
				选择工具下拖动移动，按住 Alt
				不吸附。模板的图片、锚点、排序和碰撞由所有实例共用。
			</MapHint>
		</MapPanel>
	);
}

export function ColliderInspector({
	colliderTarget,
	index,
	isReadOnly,
	map,
	onCommit,
	onDeleted,
	onFocus,
}: IInspectorProps & { colliderTarget: TColliderTarget }) {
	const collider = getTargetColliders(map, colliderTarget)[index];
	if (!collider) return null;
	const patch = (value: Partial<TDayMapCollider>) =>
		onCommit(patchCollider(map, colliderTarget, index, value));
	const replace = (value: TDayMapCollider) =>
		onCommit(setCollider(map, colliderTarget, index, value));
	const isPrefab = colliderTarget.kind === 'prefab';
	return (
		<MapPanel
			title={`${COLLIDER_LABELS[collider.shape]}碰撞`}
			meta={`#${index + 1}`}
			actions={<LocateButton onFocus={onFocus} />}
		>
			<MapTextField
				label="名称"
				value={collider.name ?? ''}
				isDisabled={isReadOnly}
				onChange={(name) => {
					const next: TDayMapCollider = { ...collider, name };
					if (!name.trim()) delete next.name;
					replace(next);
				}}
			/>
			{isPrefab && (
				<MapHint>
					坐标相对于模板锚点（未翻转），所有使用该模板的物件共用。
				</MapHint>
			)}
			{(collider.shape === 'box' || collider.shape === 'circle') && (
				<MapVector
					labels={['中心 X', '中心 Y']}
					values={[collider.x, collider.y]}
					min={-DAY_MAP_LIMITS.coordinate}
					max={DAY_MAP_LIMITS.coordinate}
					isDisabled={isReadOnly}
					onChange={([x = 0, y = 0]) => patch({ x, y })}
				/>
			)}
			{collider.shape === 'box' && (
				<>
					<MapVector
						labels={['宽', '高']}
						values={[collider.width, collider.height]}
						min={0.01}
						isDisabled={isReadOnly}
						onChange={([width = 1, height = 1]) =>
							patch({ height, width })
						}
					/>
					<MapNumber
						label="角度（度）"
						value={collider.rotation ?? 0}
						min={-360}
						max={360}
						isDisabled={isReadOnly}
						onChange={(rotation) => {
							const next: IDayMapBoxCollider = {
								...collider,
								rotation,
							};
							if (rotation === 0) delete next.rotation;
							replace(next);
						}}
					/>
				</>
			)}
			{collider.shape === 'circle' && (
				<MapNumber
					label="半径"
					value={collider.radius}
					min={0.01}
					max={4096}
					isDisabled={isReadOnly}
					onChange={(radius) => patch({ radius })}
				/>
			)}
			{collider.shape === 'edge' && (
				<Switch
					size="sm"
					isSelected={collider.closed === true}
					isDisabled={isReadOnly}
					onValueChange={(closed) => {
						const next: IDayMapEdgeCollider = {
							...collider,
							closed,
						};
						if (!closed) delete next.closed;
						replace(next);
					}}
				>
					<span className="flex flex-col">
						<span className={TYPOGRAPHY_STYLES.controlLabel}>
							首尾相连
						</span>
						<span className={TYPOGRAPHY_STYLES.caption}>
							闭合后仍只有线段阻挡，内部可走。
						</span>
					</span>
				</Switch>
			)}
			{collider.shape === 'polygon' && collider.paths.length > 1 && (
				<Button
					size="sm"
					variant="light"
					className="self-start"
					isDisabled={isReadOnly}
					onPress={() =>
						patch({ paths: collider.paths.slice(0, -1) })
					}
				>
					删除最后一个洞
				</Button>
			)}
			{(collider.shape === 'polygon' || collider.shape === 'edge') && (
				<MapHint>
					拖动顶点调整形状，双击边插入顶点，选中顶点后按 Delete
					删除。多边形选中时按住 Shift 再用多边形工具绘制，可加洞。
				</MapHint>
			)}
			{collider.shape === 'box' && !collider.rotation && (
				<MapHint>拖动控制点调整大小，按住 Alt 不吸附。</MapHint>
			)}
			<SectionDeleteButton
				className="self-start"
				isDisabled={isReadOnly}
				onPress={() => {
					if (
						onCommit(
							deleteEntities(
								map,
								'collider',
								new Set([index]),
								colliderTarget
							)
						).isSuccess
					)
						onDeleted();
				}}
			>
				删除碰撞
			</SectionDeleteButton>
		</MapPanel>
	);
}

/** 出生点是否落在任何实心碰撞内（地图碰撞与物件模板碰撞）。 */
function findBlockingCollider(map: IDayMap, x: number, y: number) {
	const placed = map.objects.flatMap((object) =>
		(
			map.prefabs.find((prefab) => prefab.key === object.prefab)
				?.colliders ?? []
		).map((collider) => placeCollider(collider, getObjectPlacement(object)))
	);
	return [...map.colliders, ...placed].find((collider) =>
		isPointInCollider(collider, x, y)
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
	const blocking = findBlockingCollider(map, spawn.x, spawn.y);
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
				min={-DAY_MAP_LIMITS.coordinate}
				max={DAY_MAP_LIMITS.coordinate}
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
					出生点中心位于{COLLIDER_LABELS[blocking.shape]}碰撞“
					{blocking.name ?? '未命名'}
					”内，导出检查会报错。建议离任何碰撞至少 0.3 格。
				</WarningNotice>
			)}
			<SectionDeleteButton
				className="self-start"
				isDisabled={isReadOnly}
				onPress={() => {
					if (
						onCommit(
							deleteEntities(map, 'spawn', new Set([index]), {
								kind: 'map',
							})
						).isSuccess
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

/** 正在编辑模板碰撞时的提示与返回入口。 */
export function ColliderTargetPanel({
	colliderTarget,
	map,
	onExit,
}: {
	colliderTarget: TColliderTarget;
	map: IDayMap;
	onExit(): void;
}) {
	const object = getTargetObject(map, colliderTarget);
	const prefab = getTargetPrefab(map, colliderTarget);
	if (!object || !prefab) return null;
	const instances = map.objects.filter(
		(item) => item.prefab === prefab.key
	).length;
	return (
		<MapPanel
			title={`正在编辑模板“${prefab.key}”的碰撞`}
			icon={<ObjectModeIcon />}
		>
			<MapHint>
				以物件“{object.name ?? prefab.key}”为锚点绘制，修改会作用于全部{' '}
				{instances} 个实例。地图碰撞淡显，不能选中。
			</MapHint>
			<Button
				size="sm"
				variant="flat"
				color="primary"
				className="self-start"
				onPress={onExit}
			>
				返回编辑地图碰撞
			</Button>
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
				拖动任意一个可整体移动；方向键按吸附步长微调（Shift 为 4
				倍）；Ctrl+D 复制，Delete 删除。
			</MapHint>
		</MapPanel>
	);
}
