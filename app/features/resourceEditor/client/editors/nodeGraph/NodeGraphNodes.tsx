'use client';

import { cn } from '@heroui/theme';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import {
	type TKizunaPrerequisiteLevel,
	type TSchedulerGraphNodeKind,
	type TSchedulerGraphNodeOrigin,
	type TSchedulerGraphPhase,
} from '@/domain/resourcePack/schedulerGraph';

import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';

import { type INodeGraphSize } from './nodeGraphLayout';

export type TNodeGraphCardKind = 'entry' | 'event' | 'external' | 'mission';

export type TNodeGraphBadge = 'duplicateLabel' | 'emptyLabel' | 'noEntry';

/** connectable：可拖入事件（完成指定数量的事件）；display：只显示已有连线（外部信号）。 */
export type TNodeGraphConditionInput = 'connectable' | 'display' | 'none';

export interface INodeGraphCondition {
	index: number;
	input: TNodeGraphConditionInput;
	text: string;
}

export interface IMissionCardData extends Record<string, unknown> {
	badges: readonly TNodeGraphBadge[];
	conditions: readonly INodeGraphCondition[];
	isTimed: boolean;
	label: string;
	missionTypeLabel: string;
	participants: string;
	performance: string;
	title: string;
}

export interface IEventCardData extends Record<string, unknown> {
	badges: readonly TNodeGraphBadge[];
	isTriggerUnsupported: boolean;
	label: string;
	performance: string;
	title: string;
	trigger: string;
}

export interface INodeGraphKizunaLevel {
	hasEvent: boolean;
	level: TKizunaPrerequisiteLevel;
}

export interface IEntryCardData extends Record<string, unknown> {
	characterLabel: string;
	characterName: string;
	levels: readonly INodeGraphKizunaLevel[];
}

export interface IExternalCardData extends Record<string, unknown> {
	label: string;
	nodeKind: TSchedulerGraphNodeKind;
	origin: Exclude<TSchedulerGraphNodeOrigin, 'local'>;
}

export type TMissionFlowNode = Node<IMissionCardData, 'mission'>;
export type TEventFlowNode = Node<IEventCardData, 'event'>;
export type TEntryFlowNode = Node<IEntryCardData, 'entry'>;
export type TExternalFlowNode = Node<IExternalCardData, 'external'>;
export type TNodeGraphFlowNode =
	TEntryFlowNode | TEventFlowNode | TExternalFlowNode | TMissionFlowNode;

export const NODE_GRAPH_INPUT_HANDLE_ID = 'in';

const CONDITION_HANDLE_PREFIX = 'condition-';
const KIZUNA_HANDLE_PREFIX = 'kizuna-lv';

export function getNodeGraphConditionHandleId(conditionIndex: number) {
	return `${CONDITION_HANDLE_PREFIX}${conditionIndex}`;
}

export function readNodeGraphConditionHandleIndex(
	handleId: string | null | undefined
): number | null {
	if (!handleId?.startsWith(CONDITION_HANDLE_PREFIX)) return null;
	const index = Number(handleId.slice(CONDITION_HANDLE_PREFIX.length));
	return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

export function getNodeGraphKizunaHandleId(level: TKizunaPrerequisiteLevel) {
	return `${KIZUNA_HANDLE_PREFIX}${level}`;
}

export function readNodeGraphKizunaHandleLevel(
	handleId: string | null | undefined
): TKizunaPrerequisiteLevel | null {
	switch (handleId) {
		case getNodeGraphKizunaHandleId(1):
			return 1;
		case getNodeGraphKizunaHandleId(2):
			return 2;
		case getNodeGraphKizunaHandleId(3):
			return 3;
		case getNodeGraphKizunaHandleId(4):
			return 4;
		default:
			return null;
	}
}

export const NODE_GRAPH_CARD_WIDTH_PX = {
	entry: 184,
	event: 256,
	external: 224,
	mission: 280,
} as const satisfies Record<TNodeGraphCardKind, number>;

const PHASE_OUTPUTS = [
	{ id: 'settle', label: '结算时' },
	{ id: 'afterPerformance', label: '演出后' },
] as const satisfies readonly { id: TSchedulerGraphPhase; label: string }[];

const BADGE_LABELS = {
	duplicateLabel: '标签重复',
	emptyLabel: '标签为空',
	noEntry: '未找到入口',
} as const satisfies Record<TNodeGraphBadge, string>;

// 估算高度只用于自动排列的间距；与下方固定行高保持一致。
const CARD_HEADER_HEIGHT_PX = 82;
const CARD_ROW_HEIGHT_PX = 20;
const CARD_SECTION_PADDING_PX = 17;
const CARD_OUTPUTS_HEIGHT_PX = 57;
const ENTRY_HEADER_HEIGHT_PX = 44;
const ENTRY_ROW_HEIGHT_PX = 22;

/** 估算卡片尺寸，供自动排列计算间距；React Flow 渲染后仍以实际尺寸为准。 */
export function estimateNodeGraphCardSize(
	node: TNodeGraphFlowNode
): INodeGraphSize {
	switch (node.type) {
		case 'entry':
			return {
				height:
					ENTRY_HEADER_HEIGHT_PX +
					CARD_SECTION_PADDING_PX / 2 +
					ENTRY_ROW_HEIGHT_PX * node.data.levels.length,
				width: NODE_GRAPH_CARD_WIDTH_PX.entry,
			};
		case 'event':
			return {
				height:
					CARD_HEADER_HEIGHT_PX +
					CARD_SECTION_PADDING_PX +
					CARD_ROW_HEIGHT_PX * 2 +
					CARD_OUTPUTS_HEIGHT_PX,
				width: NODE_GRAPH_CARD_WIDTH_PX.event,
			};
		case 'mission':
			return {
				height:
					CARD_HEADER_HEIGHT_PX +
					CARD_SECTION_PADDING_PX +
					CARD_ROW_HEIGHT_PX * (2 + node.data.conditions.length) +
					CARD_OUTPUTS_HEIGHT_PX,
				width: NODE_GRAPH_CARD_WIDTH_PX.mission,
			};
		default:
			return { height: 72, width: NODE_GRAPH_CARD_WIDTH_PX.external };
	}
}

const HANDLE_CLASS_NAME =
	'node-graph-handle !h-2.5 !w-2.5 !min-h-0 !min-w-0 !border-2 !border-content1 !bg-default-400';

const CARD_CLASS_NAME =
	'overflow-visible rounded-large border bg-content1 text-left shadow-sm transition-shadow motion-reduce:transition-none';

function getCardStateClassName(isSelected: boolean) {
	return isSelected
		? 'border-primary shadow-md ring-2 ring-primary/40'
		: 'border-divider';
}

function KindChip({
	children,
	className,
}: {
	children: ReactNode;
	className: string;
}) {
	return (
		<span
			className={cn(
				TYPOGRAPHY_STYLES.microLabel,
				'shrink-0 rounded-small px-1.5 py-0.5 font-semibold',
				className
			)}
		>
			{children}
		</span>
	);
}

function CardBadges({ badges }: { badges: readonly TNodeGraphBadge[] }) {
	return badges.map((badge) =>
		badge === 'noEntry' ? (
			<WarningBadge key={badge}>{BADGE_LABELS[badge]}</WarningBadge>
		) : (
			<ErrorBadge key={badge}>{BADGE_LABELS[badge]}</ErrorBadge>
		)
	);
}

function CardHeader({
	badges,
	chip,
	label,
	title,
}: {
	badges: ReactNode;
	chip: ReactNode;
	label: string;
	title: string;
}) {
	return (
		<div className="flex h-[82px] flex-col justify-center gap-0.5 px-3">
			<div className="flex h-5 min-w-0 items-center gap-1 overflow-hidden">
				{chip}
				{badges}
			</div>
			<p
				className="truncate text-sm font-semibold leading-5 text-foreground"
				title={title}
			>
				{title}
			</p>
			<p
				className={cn(
					'truncate font-mono text-[11px] leading-4',
					label ? 'text-foreground-500' : 'text-danger'
				)}
				title={label}
			>
				{label || '（无标签）'}
			</p>
		</div>
	);
}

const INFO_ICON_PATHS = {
	condition: 'M3.5 3.5h9v9h-9z M6 8l1.5 1.5L10.5 6.5',
	participants: 'M2.5 8h9 M8.5 5l3 3-3 3',
	performance: 'M5 3.5v9l7-4.5z',
	trigger: 'M9 2 4 9h4l-1 5 5-7H8z',
} as const;

function InfoIcon({ name }: { name: keyof typeof INFO_ICON_PATHS }) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 16 16"
			className="size-3.5 shrink-0 fill-none stroke-current stroke-[1.4] text-foreground-400 [stroke-linecap:round] [stroke-linejoin:round]"
		>
			<path d={INFO_ICON_PATHS[name]} />
		</svg>
	);
}

function InfoRow({
	children,
	icon,
	isMuted,
}: {
	children: ReactNode;
	icon: keyof typeof INFO_ICON_PATHS;
	isMuted?: boolean;
}) {
	return (
		<p
			className={cn(
				'flex h-5 min-w-0 items-center gap-1.5 text-xs leading-5',
				isMuted ? 'text-foreground-400' : 'text-foreground-600'
			)}
		>
			<InfoIcon name={icon} />
			<span className="min-w-0 truncate">{children}</span>
		</p>
	);
}

function PhaseOutputs() {
	return (
		<div className="flex flex-col border-t border-divider py-1">
			{PHASE_OUTPUTS.map(({ id, label }) => (
				<div
					key={id}
					className="relative flex h-6 items-center justify-end pr-3.5 text-[11px] leading-4 text-foreground-500"
				>
					{label}
					<Handle
						type="source"
						id={id}
						position={Position.Right}
						className={cn(
							HANDLE_CLASS_NAME,
							id === 'settle' ? '!bg-warning' : '!bg-focus'
						)}
					/>
				</div>
			))}
		</div>
	);
}

/** 卡片的“被安排/开始”入口，默认对齐标题行。 */
function InputHandle({ topPx = 41 }: { topPx?: number }) {
	return (
		<Handle
			type="target"
			id={NODE_GRAPH_INPUT_HANDLE_ID}
			position={Position.Left}
			className={HANDLE_CLASS_NAME}
			style={{ top: topPx }}
		/>
	);
}

const EventGraphNode = memo(function EventGraphNode({
	data,
	selected,
}: NodeProps<TEventFlowNode>) {
	return (
		<div
			className={cn(CARD_CLASS_NAME, getCardStateClassName(selected))}
			style={{ width: NODE_GRAPH_CARD_WIDTH_PX.event }}
		>
			<InputHandle />
			<CardHeader
				badges={<CardBadges badges={data.badges} />}
				chip={
					<KindChip className="bg-warning/20 text-warning-700 dark:text-warning">
						事件
					</KindChip>
				}
				label={data.label}
				title={data.title}
			/>
			<div className="flex flex-col border-t border-divider px-3 py-2">
				<InfoRow icon="trigger" isMuted={data.isTriggerUnsupported}>
					{data.trigger}
				</InfoRow>
				<InfoRow icon="performance">{data.performance}</InfoRow>
			</div>
			<PhaseOutputs />
		</div>
	);
});

const MissionGraphNode = memo(function MissionGraphNode({
	data,
	selected,
}: NodeProps<TMissionFlowNode>) {
	return (
		<div
			className={cn(CARD_CLASS_NAME, getCardStateClassName(selected))}
			style={{ width: NODE_GRAPH_CARD_WIDTH_PX.mission }}
		>
			<InputHandle />
			<CardHeader
				badges={
					<>
						{data.isTimed && (
							<KindChip className="bg-default-200 text-foreground-600">
								限时
							</KindChip>
						)}
						<CardBadges badges={data.badges} />
					</>
				}
				chip={
					<KindChip className="bg-focus/15 text-focus-700 dark:text-focus">
						任务·{data.missionTypeLabel}
					</KindChip>
				}
				label={data.label}
				title={data.title}
			/>
			<div className="flex flex-col border-t border-divider px-3 py-2">
				<InfoRow icon="participants">{data.participants}</InfoRow>
				{data.conditions.map((condition) => (
					<div key={condition.index} className="relative">
						<InfoRow icon="condition">{condition.text}</InfoRow>
						{condition.input !== 'none' && (
							<Handle
								type="target"
								id={getNodeGraphConditionHandleId(
									condition.index
								)}
								position={Position.Left}
								isConnectable={
									condition.input === 'connectable'
								}
								className={cn(
									HANDLE_CLASS_NAME,
									'!bg-default-500'
								)}
							/>
						)}
					</div>
				))}
				<InfoRow icon="performance">{data.performance}</InfoRow>
			</div>
			<PhaseOutputs />
		</div>
	);
});

const EntryGraphNode = memo(function EntryGraphNode({
	data,
	selected,
}: NodeProps<TEntryFlowNode>) {
	return (
		<div
			className={cn(CARD_CLASS_NAME, getCardStateClassName(selected))}
			style={{ width: NODE_GRAPH_CARD_WIDTH_PX.entry }}
		>
			<div className="flex h-11 flex-col justify-center px-3">
				<span className="text-[11px] font-medium leading-4 text-success-700 dark:text-success">
					羁绊入口
				</span>
				<span
					className="truncate text-sm font-semibold leading-5 text-foreground"
					title={data.characterLabel}
				>
					{data.characterName || data.characterLabel || '未命名角色'}
				</span>
			</div>
			<div className="flex flex-col border-t border-divider py-1">
				{data.levels.map(({ hasEvent, level }) => (
					<div
						key={level}
						className={cn(
							'relative flex h-[22px] items-center justify-end pr-3.5 text-[11px] leading-4',
							hasEvent
								? 'text-foreground-600'
								: 'text-foreground-400'
						)}
					>
						Lv{level}→{level + 1} 前置事件
						<Handle
							type="source"
							id={getNodeGraphKizunaHandleId(level)}
							position={Position.Right}
							className={cn(HANDLE_CLASS_NAME, '!bg-success')}
						/>
					</div>
				))}
			</div>
		</div>
	);
});

const ExternalGraphNode = memo(function ExternalGraphNode({
	data,
	selected,
}: NodeProps<TExternalFlowNode>) {
	const isMissing = data.origin === 'missing';
	const kindLabel = data.nodeKind === 'mission' ? '任务' : '事件';
	return (
		<div
			className={cn(
				CARD_CLASS_NAME,
				'flex h-[72px] flex-col justify-center gap-0.5 border-dashed bg-content1/70 px-3',
				selected
					? getCardStateClassName(true)
					: isMissing
						? 'border-danger/60'
						: 'border-default-400'
			)}
			style={{ width: NODE_GRAPH_CARD_WIDTH_PX.external }}
		>
			<InputHandle topPx={36} />
			<span
				className={cn(
					'text-[11px] font-medium leading-4',
					isMissing ? 'text-danger' : 'text-foreground-500'
				)}
			>
				{isMissing ? `缺失的${kindLabel}` : `外部${kindLabel}`}
			</span>
			<span
				className="truncate font-mono text-xs leading-5 text-foreground-600"
				title={data.label}
			>
				{data.label}
			</span>
			{/* 外部节点不能编辑，这个出口只用来显示“等待事件”连线。 */}
			<Handle
				type="source"
				id="settle"
				position={Position.Right}
				isConnectable={false}
				className={cn(HANDLE_CLASS_NAME, '!bg-warning')}
			/>
		</div>
	);
});

export const NODE_GRAPH_NODE_TYPES = {
	entry: EntryGraphNode,
	event: EventGraphNode,
	external: ExternalGraphNode,
	mission: MissionGraphNode,
};
