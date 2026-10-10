'use client';

import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Popover, {
	PopoverContent,
	PopoverTrigger,
} from '@/design/ui/components/popover';
import ScrollShadow from '@/design/ui/components/scrollShadow';
import Tooltip from '@/design/ui/components/tooltip';

import {
	MAP_MODES,
	MAP_TOOL_SHORTCUTS,
	type TMapMode,
} from './dayMapEditorModel';
import { ShortcutKey } from './MapCanvasChrome';
import {
	AlertIcon,
	CheckIcon,
	KeyboardIcon,
	MAP_MODE_ICONS,
	RedoIcon,
	UndoIcon,
} from './MapIcons';

interface IModeTabsProps {
	counts: Partial<Record<TMapMode, number>>;
	disabledModes: ReadonlySet<TMapMode>;
	mode: TMapMode;
	onModeChange(mode: TMapMode): void;
}

const MapModeTabs = memo(function MapModeTabs({
	counts,
	disabledModes,
	mode,
	onModeChange,
}: IModeTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="编辑内容"
			className="flex min-w-max items-center gap-0.5 rounded-large bg-default/40 p-1"
		>
			{MAP_MODES.map((item) => {
				const ModeIcon = MAP_MODE_ICONS[item.value];
				const isActive = item.value === mode;
				const count = counts[item.value];
				return (
					<Tooltip
						key={item.value}
						delay={400}
						content={
							<span className="flex items-center gap-2">
								{item.label}
								<ShortcutKey>{item.shortcut}</ShortcutKey>
							</span>
						}
					>
						<button
							type="button"
							role="tab"
							aria-selected={isActive}
							disabled={disabledModes.has(item.value)}
							className={cn(
								'flex h-8 items-center gap-1.5 rounded-medium px-2.5 text-sm font-medium transition-[background-color,color,box-shadow] motion-reduce:transition-none',
								'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
								'disabled:cursor-not-allowed disabled:opacity-40',
								isActive
									? 'bg-content1 text-foreground shadow-sm dark:bg-default-200'
									: 'text-foreground-600 hover:bg-default/40 hover:text-foreground'
							)}
							onClick={() => onModeChange(item.value)}
						>
							<ModeIcon
								className={cn(
									'size-4 shrink-0',
									isActive &&
										'text-primary-600 dark:text-primary'
								)}
							/>
							<span className="hidden whitespace-nowrap md:inline">
								{item.label}
							</span>
							{count !== undefined && count > 0 && (
								<span className="hidden font-mono text-[10px] tabular-nums text-foreground-500 xl:inline">
									{count > 9999
										? `${Math.floor(count / 1000)}k`
										: count}
								</span>
							)}
						</button>
					</Tooltip>
				);
			})}
		</div>
	);
});

const SHORTCUT_GROUPS = [
	{
		title: '画布',
		items: [
			['滚轮 / 双指捏合', '以光标为中心缩放'],
			['空格 + 拖动 / 中键拖动', '平移'],
			['F', '定位选中项或整张地图'],
			['+ / − / 0', '放大、缩小、恢复 100%'],
			['方向键 / 回车', '移动格子光标、使用工具'],
		],
	},
	{
		title: '绘制',
		items: [
			['右键拖动', '擦除'],
			['按住 Alt 点击', '吸取瓦片或坡度'],
			['Shift + 点击', '从上一笔连成直线'],
			['[ / ]', '缩小、放大笔刷'],
		],
	},
	{
		title: '选择',
		items: [
			['Shift / Ctrl + 点击', '加选、减选'],
			['空白处拖动', '框选'],
			['方向键（Shift）', '按吸附步长（1 格）微调'],
			['Ctrl + D / Delete', '复制、删除'],
			['Alt + 拖动', '临时取消吸附'],
		],
	},
	{
		title: '通用',
		items: [
			['1 – 6', '切换编辑内容'],
			[
				Object.entries(MAP_TOOL_SHORTCUTS)
					.map(([, key]) => key)
					.join(' '),
				'切换工具',
			],
			['Ctrl + Z / Ctrl + Shift + Z', '撤销、重做'],
			['Esc', '取消操作或清除选择'],
		],
	},
] as const;

function ShortcutHelp({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange(isOpen: boolean): void;
}) {
	return (
		<Popover
			placement="bottom-end"
			offset={8}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<Tooltip content="快捷键（?）">
				<span className="inline-flex">
					<PopoverTrigger>
						<Button
							isIconOnly
							size="sm"
							variant="light"
							aria-label="快捷键"
							className="h-9 w-9 min-w-9 text-lg"
						>
							<KeyboardIcon />
						</Button>
					</PopoverTrigger>
				</span>
			</Tooltip>
			<PopoverContent className="w-[min(36rem,calc(100vw-2rem))] p-4">
				<div className="grid w-full gap-4 sm:grid-cols-2">
					{SHORTCUT_GROUPS.map((group) => (
						<section
							key={group.title}
							className="flex flex-col gap-1.5"
						>
							<h4 className={TYPOGRAPHY_STYLES.compactTitle}>
								{group.title}
							</h4>
							<dl className="flex flex-col gap-1">
								{group.items.map(([keys, action]) => (
									<div
										key={action}
										className="flex items-baseline justify-between gap-3"
									>
										<dt className="font-mono text-[11px] text-foreground-700">
											{keys}
										</dt>
										<dd
											className={cn(
												TYPOGRAPHY_STYLES.caption,
												'text-right'
											)}
										>
											{action}
										</dd>
									</div>
								))}
							</dl>
						</section>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function IssuesButton({ issues }: { issues: readonly string[] }) {
	const count = issues.length;
	return (
		<Popover placement="bottom-end" offset={8}>
			<PopoverTrigger>
				<Button
					size="sm"
					variant="flat"
					color={count > 0 ? 'warning' : 'success'}
					startContent={
						count > 0 ? (
							<AlertIcon className="size-4" />
						) : (
							<CheckIcon className="size-4" />
						)
					}
					className="h-9 min-w-0 gap-1.5 px-2.5 text-xs font-medium"
				>
					{count > 0 ? (
						<>
							<span className="hidden sm:inline">待处理</span>
							<span className="font-mono tabular-nums">
								{count}
							</span>
						</>
					) : (
						<span className="hidden sm:inline">检查通过</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-0">
				<div className="flex w-full flex-col">
					<div className="border-b border-divider px-4 py-3">
						<p className={TYPOGRAPHY_STYLES.subsectionTitle}>
							地图检查{' '}
							{count > 0 ? `· ${count} 项待处理` : '· 未发现问题'}
						</p>
						<p className={cn(TYPOGRAPHY_STYLES.caption, 'mt-0.5')}>
							导出时还会读取图片尺寸和 WAV 结构，检查完整资源包。
						</p>
					</div>
					{count > 0 && (
						<ScrollShadow className="max-h-80 px-4 py-3">
							<ul className="flex flex-col gap-1.5">
								{issues.slice(0, 200).map((issue, index) => (
									<li
										key={index}
										className={cn(
											TYPOGRAPHY_STYLES.compactBody,
											'flex gap-2'
										)}
									>
										<span
											aria-hidden
											className="mt-2 size-1.5 shrink-0 rounded-full bg-warning"
										/>
										<span className="min-w-0 break-normal">
											{issue}
										</span>
									</li>
								))}
							</ul>
							{count > 200 && (
								<p
									className={cn(
										TYPOGRAPHY_STYLES.caption,
										'mt-2'
									)}
								>
									另有 {count - 200} 项未显示。
								</p>
							)}
						</ScrollShadow>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

interface IProps {
	badges?: ReactNode;
	canRedo: boolean;
	canUndo: boolean;
	counts: Partial<Record<TMapMode, number>>;
	disabledModes: ReadonlySet<TMapMode>;
	isReadOnly: boolean;
	isShortcutHelpOpen: boolean;
	issues: readonly string[];
	mapControls: ReactNode;
	mode: TMapMode;
	onModeChange(mode: TMapMode): void;
	onRedo(): void;
	onShortcutHelpOpenChange(isOpen: boolean): void;
	onUndo(): void;
}

export const MapTopBar = memo(function MapTopBar({
	badges,
	canRedo,
	canUndo,
	counts,
	disabledModes,
	isReadOnly,
	isShortcutHelpOpen,
	issues,
	mapControls,
	mode,
	onModeChange,
	onRedo,
	onShortcutHelpOpenChange,
	onUndo,
}: IProps) {
	return (
		<header className="flex flex-wrap items-center gap-2 rounded-large border border-divider bg-content1/40 p-2 shadow-sm backdrop-blur">
			<div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
				{mapControls}
				{badges}
			</div>
			<ScrollShadow
				orientation="horizontal"
				className="order-last -mx-1 w-[calc(100%+0.5rem)] px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0"
			>
				<MapModeTabs
					counts={counts}
					disabledModes={disabledModes}
					mode={mode}
					onModeChange={onModeChange}
				/>
			</ScrollShadow>
			<div className="flex flex-1 basis-auto items-center justify-end gap-1">
				<IssuesButton issues={issues} />
				<ShortcutHelp
					isOpen={isShortcutHelpOpen}
					onOpenChange={onShortcutHelpOpenChange}
				/>
				<span aria-hidden className="mx-0.5 h-6 w-px bg-divider" />
				<Tooltip
					content={
						<span className="flex items-center gap-2">
							撤销 <ShortcutKey>Ctrl Z</ShortcutKey>
						</span>
					}
				>
					<span className="inline-flex">
						<Button
							isIconOnly
							size="sm"
							variant="light"
							aria-label="撤销"
							isDisabled={isReadOnly || !canUndo}
							className="h-9 w-9 min-w-9 text-lg"
							onPress={onUndo}
						>
							<UndoIcon />
						</Button>
					</span>
				</Tooltip>
				<Tooltip
					content={
						<span className="flex items-center gap-2">
							重做 <ShortcutKey>Ctrl ⇧ Z</ShortcutKey>
						</span>
					}
				>
					<span className="inline-flex">
						<Button
							isIconOnly
							size="sm"
							variant="light"
							aria-label="重做"
							isDisabled={isReadOnly || !canRedo}
							className="h-9 w-9 min-w-9 text-lg"
							onPress={onRedo}
						>
							<RedoIcon />
						</Button>
					</span>
				</Tooltip>
			</div>
		</header>
	);
});
