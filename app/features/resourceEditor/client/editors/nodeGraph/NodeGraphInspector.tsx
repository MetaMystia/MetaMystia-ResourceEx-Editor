'use client';

import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import type { EventNode } from '@/domain/resourcePack/contracts/event';
import type { MissionNode } from '@/domain/resourcePack/contracts/mission';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import {
	type ISchedulerGraph,
	type ISchedulerGraphEdge,
	type ISchedulerGraphEntry,
	type ISchedulerGraphNode,
} from '@/domain/resourcePack/schedulerGraph';

import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import EventEditor from '@/features/resourceEditor/client/editors/event/EventEditor';
import MissionEditor from '@/features/resourceEditor/client/editors/mission/MissionEditor';

import { isNodeGraphEdgeRemovable } from './nodeGraphConnections';
import {
	NODE_GRAPH_EDGE_KINDS,
	NODE_GRAPH_EDGE_STYLES,
} from './nodeGraphFlowModel';

export type TNodeGraphListTarget =
	| { entityKind: 'character'; stableKey: number }
	| { entityKind: 'event' | 'mission'; stableKey: string };

interface IProps {
	graph: ISchedulerGraph;
	resourcePack: ResourceEx;
	selectedEdge: ISchedulerGraphEdge | null;
	selectedEntry: ISchedulerGraphEntry | null;
	selectedNode: ISchedulerGraphNode | null;
	onOpenInList(target: TNodeGraphListTarget): void;
	onRemoveEdge(edgeId: string): void;
	onRemoveEvent(index: number): void;
	onRemoveMission(index: number): void;
	onSelect(id: string): void;
	onUpdateEvent(index: number, updates: Partial<EventNode>): void;
	onUpdateMission(index: number, updates: Partial<MissionNode>): void;
}

function EdgeSample({ edgeKind }: { edgeKind: ISchedulerGraphEdge['kind'] }) {
	const style: { color: string; dashArray?: string } =
		NODE_GRAPH_EDGE_STYLES[edgeKind];
	return (
		<svg aria-hidden viewBox="0 0 28 8" className="h-2 w-7 shrink-0">
			<line
				x1="1"
				x2="27"
				y1="4"
				y2="4"
				stroke={style.color}
				strokeDasharray={style.dashArray}
				strokeLinecap="round"
				strokeWidth="2"
			/>
		</svg>
	);
}

function InspectorSection({
	action,
	children,
	title,
}: {
	action?: ReactNode;
	children: ReactNode;
	title: string;
}) {
	return (
		<EditorPanel className="flex flex-col gap-3">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<h2 className={TYPOGRAPHY_STYLES.subsectionTitle}>{title}</h2>
				{action}
			</div>
			{children}
		</EditorPanel>
	);
}

function describeNode(
	graph: ISchedulerGraph,
	resourcePack: ResourceEx,
	id: string
) {
	const entry = graph.entries.find((candidate) => candidate.id === id);
	if (entry) return `羁绊入口 · ${entry.characterName}`;
	const node = graph.nodes.find((candidate) => candidate.id === id);
	if (!node) return id;
	if (node.origin !== 'local') return node.label;
	if (node.kind === 'mission') {
		const mission = resourcePack.missionNodes[node.index ?? -1];
		return mission?.title || mission?.debugLabel || node.label;
	}
	return resourcePack.eventNodes[node.index ?? -1]?.debugLabel || node.label;
}

function ConnectionList({
	action,
	graph,
	id,
	resourcePack,
	onSelect,
}: {
	action?: ReactNode;
	graph: ISchedulerGraph;
	id: string;
	resourcePack: ResourceEx;
	onSelect(id: string): void;
}) {
	const incomingEdges = graph.edges.filter((edge) => edge.target === id);
	const outgoingEdges = graph.edges.filter((edge) => edge.source === id);
	const renderEdges = (
		edges: readonly ISchedulerGraphEdge[],
		direction: 'incoming' | 'outgoing'
	) =>
		edges.length === 0 ? (
			<p className={TYPOGRAPHY_STYLES.emptyDescription}>无</p>
		) : (
			<ul className="flex flex-col gap-1">
				{edges.map((edge) => {
					const otherId =
						direction === 'incoming' ? edge.source : edge.target;
					return (
						<li key={edge.id}>
							<button
								type="button"
								className="flex w-full min-w-0 items-center gap-2 rounded-medium px-2 py-1 text-left text-xs text-foreground-700 outline-none transition-colors hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
								onClick={() => onSelect(otherId)}
							>
								<EdgeSample edgeKind={edge.kind} />
								<span className="min-w-0 flex-1 truncate">
									{describeNode(graph, resourcePack, otherId)}
								</span>
								<span className="shrink-0 text-foreground-400">
									{NODE_GRAPH_EDGE_STYLES[edge.kind].label}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		);
	return (
		<InspectorSection action={action} title="连接">
			<div className="flex flex-col gap-1">
				<span className={TYPOGRAPHY_STYLES.compactLabel}>来自</span>
				{renderEdges(incomingEdges, 'incoming')}
			</div>
			<div className="flex flex-col gap-1">
				<span className={TYPOGRAPHY_STYLES.compactLabel}>去往</span>
				{renderEdges(outgoingEdges, 'outgoing')}
			</div>
		</InspectorSection>
	);
}

function NodeGraphGuide() {
	return (
		<InspectorSection title="节点图">
			<p className={TYPOGRAPHY_STYLES.compactDescription}>
				选择节点后可在这里编辑，与“任务节点”“事件节点”页面使用同一份数据。
			</p>
			<p className={TYPOGRAPHY_STYLES.compactDescription}>
				节点完成时先“结算”：发放奖励、安排后续事件；对话或 Timeline
				演出结束后再发放后置奖励、开始后续任务。卡片右侧的两个出口对应这两个阶段。
			</p>
			<p className={TYPOGRAPHY_STYLES.compactDescription}>
				从出口拖到卡片即可连接：“结算时”连事件，“演出后”连任务；事件的“结算时”也可以拖到任务的“完成指定数量的事件”条件，羁绊入口的各等级可以拖到前置事件。拖到空白处会新建节点并连好。点击连线可以删除。
			</p>
			<ul className="flex flex-col gap-1.5">
				{NODE_GRAPH_EDGE_KINDS.map((edgeKind) => (
					<li
						key={edgeKind}
						className="flex items-center gap-2 text-xs text-foreground-600"
					>
						<EdgeSample edgeKind={edgeKind} />
						{NODE_GRAPH_EDGE_STYLES[edgeKind].label}
					</li>
				))}
			</ul>
			<p className={TYPOGRAPHY_STYLES.compactDescription}>
				“未找到入口”表示没有羁绊前置事件或其他节点能安排到它；它仍可能由原版或其他资源包的节点安排。节点位置只保存在本机浏览器中，不会写入资源包。
			</p>
		</InspectorSection>
	);
}

export const NodeGraphInspector = memo<IProps>(function NodeGraphInspector({
	graph,
	resourcePack,
	selectedEdge,
	selectedEntry,
	selectedNode,
	onOpenInList,
	onRemoveEdge,
	onRemoveEvent,
	onRemoveMission,
	onSelect,
	onUpdateEvent,
	onUpdateMission,
}) {
	if (selectedEdge) {
		const isRemovable = isNodeGraphEdgeRemovable(selectedEdge);
		return (
			<InspectorSection
				action={
					isRemovable ? (
						<Button
							size="sm"
							color="danger"
							variant="flat"
							onPress={() => onRemoveEdge(selectedEdge.id)}
						>
							删除连线
						</Button>
					) : undefined
				}
				title="连线"
			>
				<p className="flex items-center gap-2 text-xs text-foreground-600">
					<EdgeSample edgeKind={selectedEdge.kind} />
					{NODE_GRAPH_EDGE_STYLES[selectedEdge.kind].label}
				</p>
				<div className="flex flex-col gap-1">
					{(
						[
							['来自', selectedEdge.source],
							['去往', selectedEdge.target],
						] as const
					).map(([title, id]) => (
						<button
							key={title}
							type="button"
							className="flex w-full min-w-0 items-center gap-2 rounded-medium px-2 py-1 text-left text-xs text-foreground-700 outline-none transition-colors hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
							onClick={() => onSelect(id)}
						>
							<span className="shrink-0 text-foreground-400">
								{title}
							</span>
							<span className="min-w-0 flex-1 truncate">
								{describeNode(graph, resourcePack, id)}
							</span>
						</button>
					))}
				</div>
				{!isRemovable && (
					<p className={TYPOGRAPHY_STYLES.compactDescription}>
						外部信号由来源节点的“发送任务完成信号”奖励产生，请在该节点的奖励里修改。
					</p>
				)}
			</InspectorSection>
		);
	}

	if (selectedEntry) {
		const kizunaEdges = graph.edges.filter(
			(edge) => edge.source === selectedEntry.id
		);
		const character = resourcePack.characters[selectedEntry.characterIndex];
		return (
			<>
				<InspectorSection title="羁绊入口">
					<p className={TYPOGRAPHY_STYLES.compactDescription}>
						{selectedEntry.characterName}（
						{selectedEntry.characterLabel}
						）的羁绊等级到达对应等级时，ResourceEx
						会安排这里连接的前置事件。
					</p>
					{character && (
						<Button
							size="sm"
							variant="flat"
							className="self-start"
							onPress={() =>
								onOpenInList({
									entityKind: 'character',
									stableKey: character.id,
								})
							}
						>
							在角色页编辑
						</Button>
					)}
				</InspectorSection>
				{kizunaEdges.length > 0 && (
					<ConnectionList
						graph={graph}
						id={selectedEntry.id}
						resourcePack={resourcePack}
						onSelect={onSelect}
					/>
				)}
			</>
		);
	}

	if (!selectedNode) return <NodeGraphGuide />;

	if (selectedNode.origin !== 'local') {
		const isMissing = selectedNode.origin === 'missing';
		const kindLabel = selectedNode.kind === 'mission' ? '任务' : '事件';
		return (
			<>
				<InspectorSection
					title={
						isMissing ? `缺失的${kindLabel}` : `外部${kindLabel}`
					}
				>
					<p className={TYPOGRAPHY_STYLES.metadata}>
						{selectedNode.label}
					</p>
					<p
						className={cn(
							TYPOGRAPHY_STYLES.compactDescription,
							isMissing && 'text-danger'
						)}
					>
						{isMissing
							? '标签带有本资源包前缀，但资源包里没有这个节点，导出校验会报错。请新建同名节点或修改引用。'
							: '这个节点不在本资源包里，可能来自原版游戏或其他资源包，编辑器无法查看它的内容。'}
					</p>
				</InspectorSection>
				<ConnectionList
					graph={graph}
					id={selectedNode.id}
					resourcePack={resourcePack}
					onSelect={onSelect}
				/>
			</>
		);
	}

	const index = selectedNode.index ?? -1;
	const listAction = (
		<Button
			size="sm"
			variant="flat"
			isDisabled={!selectedNode.label}
			onPress={() =>
				onOpenInList({
					entityKind: selectedNode.kind,
					stableKey: selectedNode.label,
				})
			}
		>
			{selectedNode.kind === 'mission'
				? '在任务节点页打开'
				: '在事件节点页打开'}
		</Button>
	);
	const connections = (
		<ConnectionList
			action={listAction}
			graph={graph}
			id={selectedNode.id}
			resourcePack={resourcePack}
			onSelect={onSelect}
		/>
	);

	if (selectedNode.kind === 'mission') {
		const mission = resourcePack.missionNodes[index];
		if (!mission) return <NodeGraphGuide />;
		return (
			<>
				{connections}
				<MissionEditor
					mission={mission}
					characters={resourcePack.characters}
					foods={resourcePack.foods}
					ingredients={resourcePack.ingredients}
					beverages={resourcePack.beverages}
					recipes={resourcePack.recipes}
					allMissions={resourcePack.missionNodes}
					allEvents={resourcePack.eventNodes}
					allDialogPackages={resourcePack.dialogPackages}
					onRemove={() => onRemoveMission(index)}
					onUpdate={(updates) => onUpdateMission(index, updates)}
				/>
			</>
		);
	}

	const eventNode = resourcePack.eventNodes[index];
	if (!eventNode) return <NodeGraphGuide />;
	return (
		<>
			{connections}
			<EventEditor
				eventNode={eventNode}
				allMissions={resourcePack.missionNodes}
				allEvents={resourcePack.eventNodes}
				allCharacters={resourcePack.characters}
				allDialogPackages={resourcePack.dialogPackages}
				beverages={resourcePack.beverages}
				foods={resourcePack.foods}
				ingredients={resourcePack.ingredients}
				recipes={resourcePack.recipes}
				onRemove={() => onRemoveEvent(index)}
				onUpdate={(updates) => onUpdateEvent(index, updates)}
			/>
		</>
	);
});
