import { type Edge, MarkerType } from '@xyflow/react';

import { SPECIAL_GUESTS } from '@/domain/data/specialGuest';
import type { EventData } from '@/domain/resourcePack/contracts/event';
import type { MissionNode } from '@/domain/resourcePack/contracts/mission';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import {
	type ISchedulerGraph,
	type ISchedulerGraphNode,
	KIZUNA_PREREQUISITE_FIELD_BY_LEVEL,
	KIZUNA_PREREQUISITE_LEVELS,
	type TSchedulerGraphEdgeKind,
} from '@/domain/resourcePack/schedulerGraph';

import { TRIGGER_TYPES } from '@/features/resourceEditor/client/editors/event/ScheduledEvent/TriggerEditor';
import { CONDITION_TYPES } from '@/features/resourceEditor/client/editors/mission/MissionConditionList';

import { isNodeGraphEdgeRemovable } from './nodeGraphConnections';
import { type INodeGraphSize } from './nodeGraphLayout';
import {
	estimateNodeGraphCardSize,
	getNodeGraphConditionHandleId,
	getNodeGraphKizunaHandleId,
	type INodeGraphCondition,
	NODE_GRAPH_INPUT_HANDLE_ID,
	type TNodeGraphBadge,
	type TNodeGraphFlowNode,
} from './NodeGraphNodes';

export interface INodeGraphEdgeStyle {
	color: string;
	dashArray?: string;
	label: string;
}

export const NODE_GRAPH_EDGE_STYLES = {
	kizunaEntry: {
		color: 'hsl(var(--heroui-success))',
		dashArray: '5 4',
		label: '羁绊前置事件',
	},
	scheduleEvent: {
		color: 'hsl(var(--heroui-warning))',
		label: '安排事件（结算时）',
	},
	startMission: {
		color: 'hsl(var(--heroui-focus))',
		label: '开始任务（演出后）',
	},
	waitEvent: {
		color: 'hsl(var(--heroui-default-500))',
		dashArray: '6 4',
		label: '任务条件等待事件完成',
	},
	fakeMissionSignal: {
		color: 'hsl(var(--heroui-secondary))',
		dashArray: '2 4',
		label: '发送外部信号',
	},
} as const satisfies Record<TSchedulerGraphEdgeKind, INodeGraphEdgeStyle>;

/** 图例顺序：先是两个阶段的主线连接，再是条件、信号和入口。 */
export const NODE_GRAPH_EDGE_KINDS = [
	'scheduleEvent',
	'startMission',
	'waitEvent',
	'fakeMissionSignal',
	'kizunaEntry',
] as const satisfies readonly TSchedulerGraphEdgeKind[];

export interface INodeGraphEdgeData extends Record<string, unknown> {
	isRemovable: boolean;
	isSelected: boolean;
	kind: TSchedulerGraphEdgeKind;
	label?: string;
}

export const NODE_GRAPH_EDGE_TYPE = 'nodeGraph';

export type TNodeGraphFlowEdge = Edge<INodeGraphEdgeData>;

export interface INodeGraphFlowModel {
	edges: TNodeGraphFlowEdge[];
	nodes: TNodeGraphFlowNode[];
	sizes: Map<string, INodeGraphSize>;
}

const MISSION_TYPE_LABELS = {
	Kitsuna: '羁绊',
	Main: '主线',
	Side: '支线',
} as const satisfies Record<MissionNode['missionType'], string>;

const UNSUPPORTED_MARK = '未实现';

/** 去掉“【未实现】”等前缀标记和末尾的英文名，只留卡片上的短名称。 */
function shortenOptionLabel(label: string) {
	return label
		.replace(/^(?:【[^】]*】)+/u, '')
		.replace(/（[^（）]*）$/u, '')
		.trim();
}

const TRIGGER_LABELS = new Map(
	TRIGGER_TYPES.map(({ label, value }) => [
		value,
		{
			isUnsupported: label.includes(UNSUPPORTED_MARK),
			text: shortenOptionLabel(label),
		},
	])
);

const CONDITION_LABELS = new Map(
	CONDITION_TYPES.map(({ label, type }) => [type, shortenOptionLabel(label)])
);

function describeEventData(eventData: EventData | undefined) {
	switch (eventData?.eventType) {
		case 'Dialog':
			return `对话 · ${eventData.dialogPackageName || '未选择对话包'}`;
		case 'Timeline':
			return 'Timeline';
		default:
			return '无演出';
	}
}

function createCharacterNameResolver(resourcePack: ResourceEx) {
	const namesByLabel = new Map<string, string>();
	SPECIAL_GUESTS.forEach(({ label, name }) => namesByLabel.set(label, name));
	resourcePack.characters.forEach(({ label, name }) =>
		namesByLabel.set(label, name || label)
	);
	return (label: string | undefined) =>
		label ? (namesByLabel.get(label) ?? label) : '';
}

function getBadges(node: ISchedulerGraphNode): TNodeGraphBadge[] {
	const badges: TNodeGraphBadge[] = [];
	if (!node.label) badges.push('emptyLabel');
	if (node.isDuplicate) badges.push('duplicateLabel');
	if (!node.hasEntry) badges.push('noEntry');
	return badges;
}

export function createNodeGraphFlowModel(
	resourcePack: ResourceEx,
	graph: ISchedulerGraph
): INodeGraphFlowModel {
	const resolveCharacterName = createCharacterNameResolver(resourcePack);
	const conditionInputKeys = new Set(
		graph.edges.flatMap(({ target, targetConditionIndex }) =>
			targetConditionIndex === undefined
				? []
				: [`${target}|${targetConditionIndex}`]
		)
	);

	const nodes: TNodeGraphFlowNode[] = [];
	graph.entries.forEach((entry) => {
		const kizuna = resourcePack.characters[entry.characterIndex]?.kizuna;
		nodes.push({
			ariaLabel: `羁绊入口：${entry.characterName || entry.characterLabel}`,
			data: {
				characterLabel: entry.characterLabel,
				characterName: entry.characterName,
				levels: KIZUNA_PREREQUISITE_LEVELS.map((level) => ({
					hasEvent: Boolean(
						kizuna?.[KIZUNA_PREREQUISITE_FIELD_BY_LEVEL[level]]
					),
					level,
				})),
			},
			id: entry.id,
			position: { x: 0, y: 0 },
			type: 'entry',
		});
	});
	graph.nodes.forEach((node) => {
		if (node.origin !== 'local') {
			nodes.push({
				ariaLabel: `${node.origin === 'missing' ? '缺失' : '外部'}${node.kind === 'mission' ? '任务' : '事件'}：${node.label}`,
				data: {
					label: node.label,
					nodeKind: node.kind,
					origin: node.origin,
				},
				id: node.id,
				position: { x: 0, y: 0 },
				type: 'external',
			});
			return;
		}
		if (node.kind === 'mission') {
			const mission = resourcePack.missionNodes[node.index ?? -1];
			if (!mission) return;
			const conditions: INodeGraphCondition[] =
				mission.finishConditions.map((condition, index) => {
					const typeLabel =
						CONDITION_LABELS.get(condition.conditionType) ??
						condition.conditionType;
					const signal =
						condition.conditionType === 'FakeMission' &&
						condition.label
							? ` · ${condition.label}`
							: '';
					return {
						input:
							condition.conditionType ===
							'CompleteSpecifiedFollowingEvents'
								? 'connectable'
								: conditionInputKeys.has(`${node.id}|${index}`)
									? 'display'
									: 'none',
						index,
						text: `${typeLabel}${signal}`,
					};
				});
			const sender = resolveCharacterName(mission.sender);
			const receiver = resolveCharacterName(mission.reciever);
			const title = mission.title || mission.debugLabel || '未命名任务';
			nodes.push({
				ariaLabel: `任务：${title}`,
				data: {
					badges: getBadges(node),
					conditions,
					isTimed: mission.isTimedMission === true,
					label: mission.label,
					missionTypeLabel:
						MISSION_TYPE_LABELS[mission.missionType] ??
						mission.missionType,
					participants: `${sender || '无发布者'} → ${receiver || '无接收者'}`,
					performance: describeEventData(mission.missionFinishEvent),
					title,
				},
				id: node.id,
				position: { x: 0, y: 0 },
				type: 'mission',
			});
			return;
		}
		const eventNode = resourcePack.eventNodes[node.index ?? -1];
		if (!eventNode) return;
		const trigger = eventNode.scheduledEvent?.trigger;
		const triggerLabel = trigger?.triggerType
			? TRIGGER_LABELS.get(trigger.triggerType)
			: undefined;
		const triggerCharacter = resolveCharacterName(trigger?.triggerId);
		const title = eventNode.debugLabel || '未命名事件';
		nodes.push({
			ariaLabel: `事件：${title}`,
			data: {
				badges: getBadges(node),
				isTriggerUnsupported: triggerLabel?.isUnsupported ?? false,
				label: eventNode.label,
				performance: describeEventData(
					eventNode.scheduledEvent?.eventData
				),
				title,
				trigger: trigger?.triggerType
					? `${triggerLabel?.text ?? trigger.triggerType}${triggerCharacter ? ` · ${triggerCharacter}` : ''}`
					: '未设置触发器',
			},
			id: node.id,
			position: { x: 0, y: 0 },
			type: 'event',
		});
	});

	const edges = graph.edges.map((edge): TNodeGraphFlowEdge => {
		const style: INodeGraphEdgeStyle = NODE_GRAPH_EDGE_STYLES[edge.kind];
		const isRemovable = isNodeGraphEdgeRemovable(edge);
		return {
			data: {
				isRemovable,
				isSelected: false,
				kind: edge.kind,
				...(edge.signal === undefined ? {} : { label: edge.signal }),
			},
			focusable: isRemovable,
			id: edge.id,
			markerEnd: {
				color: style.color,
				height: 16,
				type: MarkerType.ArrowClosed,
				width: 16,
			},
			selectable: false,
			source: edge.source,
			sourceHandle:
				edge.kizunaLevel !== undefined
					? getNodeGraphKizunaHandleId(edge.kizunaLevel)
					: (edge.sourcePhase ?? null),
			style: {
				stroke: style.color,
				strokeWidth: 1.75,
				...(style.dashArray === undefined
					? {}
					: { strokeDasharray: style.dashArray }),
			},
			target: edge.target,
			type: NODE_GRAPH_EDGE_TYPE,
			targetHandle:
				edge.targetConditionIndex === undefined
					? NODE_GRAPH_INPUT_HANDLE_ID
					: getNodeGraphConditionHandleId(edge.targetConditionIndex),
		};
	});

	const sizes = new Map<string, INodeGraphSize>();
	nodes.forEach((node) =>
		sizes.set(node.id, estimateNodeGraphCardSize(node))
	);

	return { edges, nodes, sizes };
}

export interface INodeGraphChain {
	edgeIds: Set<string>;
	nodeIds: Set<string>;
}

/** 选中节点的全部上游和下游，用于在图上突出整条链路。 */
export function collectNodeGraphChain(
	edges: readonly TNodeGraphFlowEdge[],
	startId: string
): INodeGraphChain {
	const chain: INodeGraphChain = {
		edgeIds: new Set(),
		nodeIds: new Set([startId]),
	};
	const walk = (direction: 'downstream' | 'upstream') => {
		const visitedIds = new Set([startId]);
		const pendingIds = [startId];
		for (
			let id = pendingIds.pop();
			id !== undefined;
			id = pendingIds.pop()
		) {
			edges.forEach((edge) => {
				const [fromId, toId] =
					direction === 'downstream'
						? [edge.source, edge.target]
						: [edge.target, edge.source];
				if (fromId !== id) return;
				chain.edgeIds.add(edge.id);
				chain.nodeIds.add(toId);
				if (visitedIds.has(toId)) return;
				visitedIds.add(toId);
				pendingIds.push(toId);
			});
		}
	};
	walk('downstream');
	walk('upstream');
	return chain;
}
