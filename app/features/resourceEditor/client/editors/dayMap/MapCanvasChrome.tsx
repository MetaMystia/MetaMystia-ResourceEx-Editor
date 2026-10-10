'use client';

import { cn } from '@heroui/theme';
import { type ReactNode, useEffect } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Popover, {
	PopoverContent,
	PopoverTrigger,
} from '@/design/ui/components/popover';
import Switch from '@/design/ui/components/switch';
import Tooltip from '@/design/ui/components/tooltip';

import {
	formatMapNumber,
	formatSlopeAngle,
	getToolDescription,
	getToolLabel,
	type IMapViewOptions,
	type ITileBrush,
	MAP_BRUSH_SIZE_MAX,
	MAP_SNAP_STEPS,
	MAP_TOOL_SHORTCUTS,
	MAP_TOOLS_BY_MODE,
	MAP_ZOOM_REFERENCE_PX_PER_UNIT,
	type TMapMode,
	type TMapTool,
} from './dayMapEditorModel';
import {
	AlertIcon,
	CheckIcon,
	CloseIcon,
	FitIcon,
	GridIcon,
	MagnetIcon,
	MAP_TOOL_ICONS,
	MinusIcon,
	PlusIcon,
	SlidersIcon,
} from './MapIcons';
import { getStampSize } from './mapToolActions';
import {
	type MapViewportStore,
	useMapViewportStatus,
} from './mapViewportStore';

const MAP_FLOATING_SURFACE =
	'select-none rounded-large border border-divider bg-content1/85 shadow-md backdrop-blur-lg dark:bg-content1/75';

export function ShortcutKey({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex min-w-5 items-center justify-center rounded-small border border-divider bg-default/40 px-1 font-mono text-[10px] font-medium leading-4 text-foreground-600">
			{children}
		</kbd>
	);
}

function TooltipBody({
	description,
	shortcut,
	title,
}: {
	description?: ReactNode;
	shortcut?: string;
	title: ReactNode;
}) {
	return (
		<span className="flex max-w-60 flex-col gap-1 py-0.5">
			<span className="flex items-center justify-between gap-3 font-semibold">
				{title}
				{shortcut !== undefined && (
					<ShortcutKey>{shortcut}</ShortcutKey>
				)}
			</span>
			{description !== undefined && (
				<span className="text-foreground-500">{description}</span>
			)}
		</span>
	);
}

interface IToolRailProps {
	isReadOnly: boolean;
	mode: TMapMode;
	onToolChange(tool: TMapTool): void;
	tool: TMapTool;
}

export function MapToolRail({
	isReadOnly,
	mode,
	onToolChange,
	tool,
}: IToolRailProps) {
	return (
		<div
			role="toolbar"
			aria-label="绘制工具"
			aria-orientation="vertical"
			className={cn(MAP_FLOATING_SURFACE, 'flex flex-col gap-1 p-1')}
		>
			{MAP_TOOLS_BY_MODE[mode].map((item) => {
				const ToolIcon = MAP_TOOL_ICONS[item];
				const isActive = item === tool;
				const label = getToolLabel(mode, item);
				return (
					<Tooltip
						key={item}
						placement="right"
						delay={300}
						content={
							<TooltipBody
								title={label}
								shortcut={MAP_TOOL_SHORTCUTS[item]}
								description={getToolDescription(mode, item)}
							/>
						}
					>
						<Button
							isIconOnly
							size="sm"
							radius="md"
							variant={isActive ? 'flat' : 'light'}
							color={isActive ? 'primary' : 'default'}
							aria-label={`${label}（${MAP_TOOL_SHORTCUTS[item]}）`}
							aria-pressed={isActive}
							isDisabled={isReadOnly && item !== 'hand'}
							className="h-9 w-9 min-w-9 text-lg"
							onPress={() => onToolChange(item)}
						>
							<ToolIcon />
						</Button>
					</Tooltip>
				);
			})}
		</div>
	);
}

function Stepper({
	label,
	max,
	min,
	onChange,
	value,
}: {
	label: string;
	max: number;
	min: number;
	onChange(value: number): void;
	value: number;
}) {
	return (
		<div
			className="flex items-center gap-0.5"
			role="group"
			aria-label={label}
		>
			<span className={cn(TYPOGRAPHY_STYLES.compactLabel, 'mr-1')}>
				{label}
			</span>
			<Button
				isIconOnly
				size="sm"
				variant="light"
				aria-label={`减小${label}`}
				isDisabled={value <= min}
				className="h-7 w-7 min-w-7"
				onPress={() => onChange(Math.max(min, value - 1))}
			>
				<MinusIcon />
			</Button>
			<span className="min-w-8 text-center font-mono text-xs tabular-nums text-foreground">
				{value}×{value}
			</span>
			<Button
				isIconOnly
				size="sm"
				variant="light"
				aria-label={`增大${label}`}
				isDisabled={value >= max}
				className="h-7 w-7 min-w-7"
				onPress={() => onChange(Math.min(max, value + 1))}
			>
				<PlusIcon />
			</Button>
		</div>
	);
}

function Divider() {
	return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-divider" />;
}

interface IToolOptionsProps {
	brush: ITileBrush | null;
	brushSize: number;
	mode: TMapMode;
	onBrushPlacementClear(): void;
	onBrushSizeChange(size: number): void;
	onSnapStepChange(step: number): void;
	slope: number;
	snapStep: number;
	tool: TMapTool;
}

/** 当前工具的参数条：画笔尺寸、当前画笔、吸附步长等。 */
export function MapToolOptions({
	brush,
	brushSize,
	mode,
	onBrushPlacementClear,
	onBrushSizeChange,
	onSnapStepChange,
	slope,
	snapStep,
	tool,
}: IToolOptionsProps) {
	const parts: ReactNode[] = [];
	const isPaintMode = mode === 'tile' || mode === 'height';
	if (tool === 'hand') return null;
	parts.push(
		<span
			key="label"
			className={cn(
				TYPOGRAPHY_STYLES.compactTitle,
				'whitespace-nowrap px-1.5'
			)}
		>
			{getToolLabel(mode, tool)}
		</span>
	);
	const isMultiTile = (brush?.cells.length ?? 0) > 1;
	if (
		isPaintMode &&
		(tool === 'brush' || tool === 'eraser') &&
		!(mode === 'tile' && tool === 'brush' && isMultiTile)
	)
		parts.push(
			<Stepper
				key="size"
				label="笔刷"
				min={1}
				max={MAP_BRUSH_SIZE_MAX}
				value={brushSize}
				onChange={onBrushSizeChange}
			/>
		);
	if (mode === 'tile' && ['brush', 'rectangle', 'fill'].includes(tool)) {
		const label = !brush
			? '未选择瓦片'
			: isMultiTile
				? (() => {
						const size = getStampSize(brush.cells);
						return `图章 ${size.width}×${size.height}`;
					})()
				: (brush.cells[0]?.tile ?? '');
		parts.push(
			<span
				key="brush"
				title={label}
				className={cn(
					TYPOGRAPHY_STYLES.metadata,
					'max-w-36 truncate rounded-small bg-default/40 px-1.5 py-0.5 text-foreground-600'
				)}
			>
				{label}
			</span>
		);
		if (brush?.placement)
			parts.push(
				<Tooltip
					key="placement"
					content="画笔带有吸取的原始变换或颜色，点击改用默认属性"
				>
					<Button
						size="sm"
						variant="flat"
						color="warning"
						className="h-6 min-w-0 gap-1 px-1.5 text-[11px]"
						endContent={<CloseIcon className="size-3" />}
						onPress={onBrushPlacementClear}
					>
						原始属性
					</Button>
				</Tooltip>
			);
	}
	if (mode === 'height' && tool !== 'eraser' && tool !== 'picker')
		parts.push(
			<span
				key="slope"
				className="inline-flex items-center gap-1.5 rounded-small bg-default/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground-700"
			>
				<span
					aria-hidden
					className={cn(
						'size-2.5 rounded-full',
						slope > 0
							? 'bg-[#0ea5e9]'
							: slope < 0
								? 'bg-[#f97316]'
								: 'bg-default-400'
					)}
				/>
				{formatMapNumber(slope)} · {formatSlopeAngle(slope)}
			</span>
		);
	if (!isPaintMode) {
		parts.push(<Divider key="divider" />);
		parts.push(
			<Popover key="snap" placement="bottom" offset={8}>
				<PopoverTrigger>
					<Button
						size="sm"
						variant="light"
						className="h-7 min-w-0 gap-1 px-1.5 text-xs"
						startContent={<MagnetIcon className="size-4" />}
						aria-label="吸附步长"
					>
						{snapStep > 0 ? formatMapNumber(snapStep, 3) : '关'}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-1">
					<div
						role="menu"
						aria-label="吸附步长"
						className="flex flex-col gap-0.5"
					>
						{MAP_SNAP_STEPS.map((step) => (
							<Button
								key={step}
								role="menuitemradio"
								aria-checked={snapStep === step}
								size="sm"
								variant="light"
								className="h-8 justify-between gap-6 px-2 text-xs"
								endContent={
									snapStep === step ? (
										<CheckIcon className="size-4" />
									) : (
										<span className="size-4" />
									)
								}
								onPress={() => onSnapStepChange(step)}
							>
								{step === 0
									? '不吸附'
									: `${formatMapNumber(step, 3)} 格`}
							</Button>
						))}
						<p
							className={cn(
								TYPOGRAPHY_STYLES.caption,
								'max-w-44 px-2 pb-1 pt-1'
							)}
						>
							拖动时按住 Alt 临时取消吸附。
						</p>
					</div>
				</PopoverContent>
			</Popover>
		);
	}
	return (
		<div
			className={cn(
				MAP_FLOATING_SURFACE,
				'flex h-10 min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1.5'
			)}
		>
			{parts}
		</div>
	);
}

interface IViewMenuProps {
	canShowMaterialSources: boolean;
	mode: TMapMode;
	onChange(options: IMapViewOptions): void;
	options: IMapViewOptions;
}

export function MapViewMenu({
	canShowMaterialSources,
	mode,
	onChange,
	options,
}: IViewMenuProps) {
	const items: {
		description: string;
		isVisible: boolean;
		key: keyof IMapViewOptions;
		label: string;
	}[] = [
		{
			key: 'shouldShowGrid',
			label: '网格',
			description: '每格一个世界单位，缩小时自动合并。',
			isVisible: true,
		},
		{
			key: 'shouldShowCollisions',
			label: '碰撞轮廓',
			description: '在其他模式中淡显碰撞框和原生碰撞。',
			isVisible: mode !== 'collision',
		},
		{
			key: 'shouldShowSlopes',
			label: '坡面',
			description: '在其他模式中淡显坡度格。',
			isVisible: mode !== 'height',
		},
		{
			key: 'shouldDimInactiveLayers',
			label: '淡化其他图层',
			description: '瓦片模式下突出当前图层。',
			isVisible: mode === 'tile',
		},
		{
			key: 'shouldShowViewportPreview',
			label: '游戏画面预览',
			description: '地图模式下，光标处显示 16:9 游戏视口范围。',
			isVisible: mode === 'map',
		},
		{
			key: 'shouldShowMaterialSources',
			label: '特殊材质源图',
			description: '显示使用特殊 Shader 的原始贴图，不复刻材质效果。',
			isVisible: canShowMaterialSources,
		},
	];
	return (
		<Popover placement="bottom-end" offset={8}>
			<PopoverTrigger>
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="显示选项"
					className={cn(
						MAP_FLOATING_SURFACE,
						'h-10 w-10 min-w-10 text-lg'
					)}
				>
					<SlidersIcon />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-3">
				<div className="flex w-full flex-col gap-3">
					<p className={TYPOGRAPHY_STYLES.subsectionTitle}>
						显示选项
					</p>
					{items
						.filter((item) => item.isVisible)
						.map((item) => (
							<Switch
								key={item.key}
								size="sm"
								isSelected={options[item.key]}
								onValueChange={(value) =>
									onChange({ ...options, [item.key]: value })
								}
								classNames={{
									base: 'max-w-full flex-row-reverse justify-between gap-3',
									label: 'ms-0 min-w-0',
								}}
							>
								<span className="flex flex-col">
									<span
										className={
											TYPOGRAPHY_STYLES.compactItemTitle
										}
									>
										{item.label}
									</span>
									<span className={TYPOGRAPHY_STYLES.caption}>
										{item.description}
									</span>
								</span>
							</Switch>
						))}
					<p
						className={cn(
							TYPOGRAPHY_STYLES.caption,
							'border-t border-divider pt-2'
						)}
					>
						显示选项只影响编辑器预览，不写入资源包。
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}

interface IZoomControlsProps {
	onFit(): void;
	onGridToggle(): void;
	onZoomBy(factor: number): void;
	onZoomTo(scale: number): void;
	shouldShowGrid: boolean;
	store: MapViewportStore;
}

export function MapZoomControls({
	onFit,
	onGridToggle,
	onZoomBy,
	onZoomTo,
	shouldShowGrid,
	store,
}: IZoomControlsProps) {
	const { scale } = useMapViewportStatus(store);
	const percent = Math.round((scale / MAP_ZOOM_REFERENCE_PX_PER_UNIT) * 100);
	return (
		<div
			role="group"
			aria-label="缩放"
			className={cn(
				MAP_FLOATING_SURFACE,
				'flex items-center gap-0.5 p-1'
			)}
		>
			<Tooltip content={<TooltipBody title="网格" />}>
				<Button
					isIconOnly
					size="sm"
					variant={shouldShowGrid ? 'flat' : 'light'}
					color={shouldShowGrid ? 'primary' : 'default'}
					aria-label="显示网格"
					aria-pressed={shouldShowGrid}
					className="h-8 w-8 min-w-8 text-base"
					onPress={onGridToggle}
				>
					<GridIcon />
				</Button>
			</Tooltip>
			<Divider />
			<Tooltip content={<TooltipBody title="缩小" shortcut="-" />}>
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="缩小"
					className="h-8 w-8 min-w-8 text-base"
					onPress={() => onZoomBy(1 / 1.4)}
				>
					<MinusIcon />
				</Button>
			</Tooltip>
			<Tooltip
				content={
					<TooltipBody
						title="恢复 100%"
						description="48 像素对应一格"
					/>
				}
			>
				<Button
					size="sm"
					variant="light"
					aria-label={`当前缩放 ${percent}%，点击恢复 100%`}
					className="h-8 min-w-14 px-1 font-mono text-xs tabular-nums"
					onPress={() => onZoomTo(MAP_ZOOM_REFERENCE_PX_PER_UNIT)}
				>
					{percent}%
				</Button>
			</Tooltip>
			<Tooltip content={<TooltipBody title="放大" shortcut="+" />}>
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="放大"
					className="h-8 w-8 min-w-8 text-base"
					onPress={() => onZoomBy(1.4)}
				>
					<PlusIcon />
				</Button>
			</Tooltip>
			<Tooltip
				content={
					<TooltipBody
						title="定位"
						shortcut="F"
						description="有选中项时定位到选中项，否则显示整张地图"
					/>
				}
			>
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="定位地图"
					className="h-8 w-8 min-w-8 text-base"
					onPress={onFit}
				>
					<FitIcon />
				</Button>
			</Tooltip>
		</div>
	);
}

export function MapStatusBar({ store }: { store: MapViewportStore }) {
	const { cursor, detail, renderer } = useMapViewportStatus(store);
	return (
		<div
			aria-live="off"
			className={cn(
				MAP_FLOATING_SURFACE,
				'flex h-9 min-w-0 max-w-full items-center gap-2 px-3 text-xs text-foreground-600'
			)}
		>
			{cursor ? (
				<>
					<span className="whitespace-nowrap font-mono tabular-nums">
						X {cursor.x.toFixed(2)} · Y {cursor.y.toFixed(2)}
					</span>
					<span className="hidden whitespace-nowrap font-mono tabular-nums text-foreground-500 sm:inline">
						格 ({Math.floor(cursor.x)}, {Math.floor(cursor.y)})
					</span>
					{detail && (
						<span className="min-w-0 truncate text-foreground-700">
							{detail}
						</span>
					)}
				</>
			) : (
				<span className="whitespace-nowrap text-foreground-500">
					右为 +X，上为 +Y · 滚轮缩放 · 空格拖动平移
				</span>
			)}
			{renderer === 'canvas' && (
				<Tooltip content="浏览器未启用 WebGL，正在使用兼容渲染，大地图会较慢。">
					<span className="shrink-0 rounded-small bg-warning/30 px-1.5 text-[10px] text-warning-700 dark:text-warning">
						兼容渲染
					</span>
				</Tooltip>
			)}
		</div>
	);
}

export interface IMapNotice {
	id: number;
	message: string;
	tone: 'error' | 'info';
}

export function MapNoticeToast({
	notice,
	onDismiss,
}: {
	notice: IMapNotice | null;
	onDismiss(): void;
}) {
	useEffect(() => {
		if (!notice) return;
		const timeout = window.setTimeout(
			onDismiss,
			notice.tone === 'error' ? 4500 : 2400
		);
		return () => window.clearTimeout(timeout);
	}, [notice, onDismiss]);
	if (!notice) return null;
	return (
		<div
			key={notice.id}
			role={notice.tone === 'error' ? 'alert' : 'status'}
			className={cn(
				MAP_FLOATING_SURFACE,
				'pointer-events-none flex max-w-[min(32rem,calc(100%-2rem))] items-start gap-2 px-3 py-2 text-sm motion-safe:animate-appearance-in',
				notice.tone === 'error'
					? 'border-danger/40 text-danger-700 dark:text-danger-500'
					: 'text-foreground-700'
			)}
		>
			{notice.tone === 'error' ? (
				<AlertIcon className="mt-0.5 size-4 shrink-0" />
			) : (
				<CheckIcon className="mt-0.5 size-4 shrink-0 text-success-600" />
			)}
			<span className="min-w-0 break-normal">{notice.message}</span>
			<button
				type="button"
				aria-label="关闭提示"
				className="pointer-events-auto -mr-1 ml-1 shrink-0 rounded-small p-0.5 text-foreground-500 hover:text-foreground"
				onClick={onDismiss}
			>
				<CloseIcon className="size-3.5" />
			</button>
		</div>
	);
}
