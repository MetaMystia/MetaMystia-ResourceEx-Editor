import type { MissionReward } from '@/domain/resourcePack/contracts/mission';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import {
	type ISchedulerGraph,
	type ISchedulerGraphEdge,
	type ISchedulerGraphEntry,
	type ISchedulerGraphNode,
	KIZUNA_PREREQUISITE_FIELD_BY_LEVEL,
	type TKizunaPrerequisiteLevel,
	type TSchedulerGraphNodeKind,
} from '@/domain/resourcePack/schedulerGraph';

import {
	appendEventNode,
	updateEventNodeAt,
} from '@/features/resourceEditor/client/editors/event/eventNodeEdits';
import { createMissionReward } from '@/features/resourceEditor/client/editors/mission/missionEditorValues';
import {
	appendMissionNode,
	updateMissionNodeAt,
} from '@/features/resourceEditor/client/editors/mission/missionNodeEdits';
import {
	appendNewsNode,
	updateNewsNodeAt,
} from '@/features/resourceEditor/client/editors/news/newsNodeEdits';

import {
	NODE_GRAPH_INPUT_HANDLE_ID,
	readNodeGraphConditionHandleIndex,
	readNodeGraphKizunaHandleLevel,
} from './NodeGraphNodes';

/** 从卡片出口拖出的一条连线；目标为空表示拖到画布空白处。 */
export interface INodeGraphConnectionRequest {
	sourceHandleId: string | null;
	sourceId: string;
	targetHandleId: string | null;
	targetId: string;
}

interface ILocalNodeRef {
	index: number;
	kind: TSchedulerGraphNodeKind;
}

type TRewardField = 'postRewards' | 'rewards';

/** 结算时执行 rewards，演出后执行 postRewards；新闻发布时两者依次执行。 */
const REWARD_FIELD_BY_HANDLE_ID: Readonly<Record<string, TRewardField>> = {
	afterPerformance: 'postRewards',
	settle: 'rewards',
};

type TNodeGraphConnectionPlan =
	| { label: string; owner: ILocalNodeRef; type: 'postEvent' }
	| { label: string; owner: ILocalNodeRef; type: 'postMission' }
	| {
			field: TRewardField;
			label: string;
			owner: ILocalNodeRef;
			type: 'scheduleNews';
	  }
	| {
			conditionIndex: number;
			label: string;
			missionIndex: number;
			type: 'waitEvent';
	  }
	| {
			characterIndex: number;
			label: string;
			level: TKizunaPrerequisiteLevel;
			type: 'kizunaPrerequisite';
	  };

export interface INodeGraphCreatedNode {
	index: number;
	kind: TSchedulerGraphNodeKind;
	label: string;
	resourcePack: ResourceEx;
}

function findLocalNode(graph: ISchedulerGraph, id: string) {
	const node = graph.nodes.find((candidate) => candidate.id === id);
	return node?.origin === 'local' &&
		!node.isDuplicate &&
		node.index !== undefined
		? { index: node.index, kind: node.kind, node }
		: null;
}

function findEntry(graph: ISchedulerGraph, id: string) {
	return graph.entries.find((entry) => entry.id === id) ?? null;
}

/**
 * 出口能新建并连接哪种节点：结算时安排事件、演出后开始任务、羁绊等级指定前置事件；
 * 新闻的两个出口安排新闻。
 */
function getCreatableKind(
	graph: ISchedulerGraph,
	sourceId: string,
	sourceHandleId: string | null
): TSchedulerGraphNodeKind | null {
	if (findEntry(graph, sourceId)) {
		return readNodeGraphKizunaHandleLevel(sourceHandleId) === null
			? null
			: 'event';
	}
	const source = findLocalNode(graph, sourceId);
	if (!source) return null;
	if (source.kind === 'news') {
		return sourceHandleId !== null &&
			Object.hasOwn(REWARD_FIELD_BY_HANDLE_ID, sourceHandleId)
			? 'news'
			: null;
	}
	if (sourceHandleId === 'settle') return 'event';
	if (sourceHandleId === 'afterPerformance') return 'mission';
	return null;
}

function readLocalNode(resourcePack: ResourceEx, owner: ILocalNodeRef) {
	switch (owner.kind) {
		case 'mission':
			return resourcePack.missionNodes[owner.index];
		case 'event':
			return resourcePack.eventNodes[owner.index];
		case 'news':
			return resourcePack.newsNodes[owner.index];
	}
}

function readList(resourcePack: ResourceEx, owner: ILocalNodeRef) {
	const node = readLocalNode(resourcePack, owner);
	return {
		postEvents: node && 'postEvents' in node ? (node.postEvents ?? []) : [],
		postMissions:
			node && 'postMissionsAfterPerformance' in node
				? (node.postMissionsAfterPerformance ?? [])
				: [],
	};
}

function readRewards(
	resourcePack: ResourceEx,
	owner: ILocalNodeRef,
	field: TRewardField
): MissionReward[] {
	return readLocalNode(resourcePack, owner)?.[field] ?? [];
}

function writeRewards(
	resourcePack: ResourceEx,
	owner: ILocalNodeRef,
	field: TRewardField,
	rewards: MissionReward[]
): ResourceEx {
	switch (owner.kind) {
		case 'mission':
			return updateMissionNodeAt(resourcePack, owner.index, {
				[field]: rewards,
			});
		case 'event':
			return updateEventNodeAt(resourcePack, owner.index, {
				[field]: rewards,
			});
		case 'news':
			return updateNewsNodeAt(resourcePack, owner.index, {
				[field]: rewards,
			});
	}
}

function planToTarget(
	resourcePack: ResourceEx,
	graph: ISchedulerGraph,
	request: INodeGraphConnectionRequest,
	target: Pick<ISchedulerGraphNode, 'id' | 'kind' | 'label'>
): TNodeGraphConnectionPlan | null {
	const { sourceHandleId, sourceId, targetHandleId } = request;
	if (!target.label || target.id === sourceId) return null;

	const entry = findEntry(graph, sourceId);
	if (entry) {
		const level = readNodeGraphKizunaHandleLevel(sourceHandleId);
		const kizuna = resourcePack.characters[entry.characterIndex]?.kizuna;
		if (
			level === null ||
			!kizuna ||
			target.kind !== 'event' ||
			targetHandleId !== NODE_GRAPH_INPUT_HANDLE_ID ||
			kizuna[KIZUNA_PREREQUISITE_FIELD_BY_LEVEL[level]] === target.label
		) {
			return null;
		}
		return {
			characterIndex: entry.characterIndex,
			label: target.label,
			level,
			type: 'kizunaPrerequisite',
		};
	}

	const source = findLocalNode(graph, sourceId);
	if (!source) return null;
	const owner = { index: source.index, kind: source.kind };
	const lists = readList(resourcePack, owner);

	if (targetHandleId === NODE_GRAPH_INPUT_HANDLE_ID) {
		const rewardField =
			sourceHandleId === null
				? undefined
				: REWARD_FIELD_BY_HANDLE_ID[sourceHandleId];
		if (target.kind === 'news') {
			if (!rewardField) return null;
			const isScheduled = readRewards(
				resourcePack,
				owner,
				rewardField
			).some(
				(reward) =>
					reward.rewardType === 'ScheduleNews' &&
					reward.rewardIdArray?.includes(target.label)
			);
			return isScheduled
				? null
				: {
						field: rewardField,
						label: target.label,
						owner,
						type: 'scheduleNews',
					};
		}
		// 新闻节点没有 postEvents、postMissions，只能安排新闻。
		if (source.kind === 'news') return null;
		if (sourceHandleId === 'settle' && target.kind === 'event') {
			return lists.postEvents.includes(target.label)
				? null
				: { label: target.label, owner, type: 'postEvent' };
		}
		if (
			sourceHandleId === 'afterPerformance' &&
			target.kind === 'mission'
		) {
			return lists.postMissions.includes(target.label)
				? null
				: { label: target.label, owner, type: 'postMission' };
		}
		return null;
	}

	// 事件结算时记为完成，可计入任务的“完成指定数量的事件”条件。
	const conditionIndex = readNodeGraphConditionHandleIndex(targetHandleId);
	const targetMission = findLocalNode(graph, target.id);
	if (
		conditionIndex === null ||
		sourceHandleId !== 'settle' ||
		source.kind !== 'event' ||
		!source.node.label ||
		targetMission?.kind !== 'mission'
	) {
		return null;
	}
	const condition =
		resourcePack.missionNodes[targetMission.index]?.finishConditions[
			conditionIndex
		];
	if (
		condition?.conditionType !== 'CompleteSpecifiedFollowingEvents' ||
		condition.events?.some((event) => event.label === source.node.label)
	) {
		return null;
	}
	return {
		conditionIndex,
		label: source.node.label,
		missionIndex: targetMission.index,
		type: 'waitEvent',
	};
}

export function planNodeGraphConnection(
	resourcePack: ResourceEx,
	graph: ISchedulerGraph,
	request: INodeGraphConnectionRequest
): TNodeGraphConnectionPlan | null {
	const target = graph.nodes.find(
		(candidate) => candidate.id === request.targetId
	);
	if (!target || target.isDuplicate) return null;
	return planToTarget(resourcePack, graph, request, target);
}

export function applyNodeGraphConnection(
	resourcePack: ResourceEx,
	plan: TNodeGraphConnectionPlan
): ResourceEx {
	switch (plan.type) {
		case 'postEvent':
		case 'postMission': {
			const lists = readList(resourcePack, plan.owner);
			const updates =
				plan.type === 'postEvent'
					? { postEvents: [...lists.postEvents, plan.label] }
					: {
							postMissionsAfterPerformance: [
								...lists.postMissions,
								plan.label,
							],
						};
			if (plan.owner.kind === 'mission') {
				return updateMissionNodeAt(
					resourcePack,
					plan.owner.index,
					updates
				);
			}
			// 新闻节点不会产生这两种连接。
			return plan.owner.kind === 'event'
				? updateEventNodeAt(resourcePack, plan.owner.index, updates)
				: resourcePack;
		}
		case 'scheduleNews':
			return writeRewards(resourcePack, plan.owner, plan.field, [
				...readRewards(resourcePack, plan.owner, plan.field),
				{
					...createMissionReward('ScheduleNews'),
					rewardIdArray: [plan.label],
				},
			]);
		case 'waitEvent': {
			const mission = resourcePack.missionNodes[plan.missionIndex];
			if (!mission) return resourcePack;
			return updateMissionNodeAt(resourcePack, plan.missionIndex, {
				finishConditions: mission.finishConditions.map(
					(condition, index) =>
						index === plan.conditionIndex
							? {
									...condition,
									events: [
										...(condition.events ?? []),
										{ label: plan.label, text: '' },
									],
								}
							: condition
				),
			});
		}
		case 'kizunaPrerequisite':
			return {
				...resourcePack,
				characters: resourcePack.characters.map((character, index) =>
					index === plan.characterIndex && character.kizuna
						? {
								...character,
								kizuna: {
									...character.kizuna,
									[KIZUNA_PREREQUISITE_FIELD_BY_LEVEL[
										plan.level
									]]: plan.label,
								},
							}
						: character
				),
			};
	}
}

/** 拖到空白处时出口能否新建节点。 */
export function canCreateNodeGraphConnectedNode(
	graph: ISchedulerGraph,
	sourceId: string,
	sourceHandleId: string | null
) {
	return getCreatableKind(graph, sourceId, sourceHandleId) !== null;
}

function createKizunaEventDefaults(
	entry: ISchedulerGraphEntry,
	level: TKizunaPrerequisiteLevel
) {
	return {
		debugLabel: `${entry.characterName || entry.characterLabel}羁绊 LV${level} 前置`,
		scheduledEvent: {
			eventData: { eventType: 'Null' as const },
			trigger: {
				triggerId: entry.characterLabel,
				triggerType: 'KizunaCheckPoint',
			},
		},
	};
}

/** 在出口拖到空白处时新建节点并连接；羁绊前置事件默认使用羁绊升级触发器。 */
export function createNodeGraphConnectedNode(
	resourcePack: ResourceEx,
	graph: ISchedulerGraph,
	sourceId: string,
	sourceHandleId: string | null
): INodeGraphCreatedNode | null {
	const kind = getCreatableKind(graph, sourceId, sourceHandleId);
	if (kind === null) return null;

	let nextResourcePack =
		kind === 'mission'
			? appendMissionNode(resourcePack)
			: kind === 'event'
				? appendEventNode(resourcePack)
				: appendNewsNode(resourcePack);
	const index =
		kind === 'mission'
			? nextResourcePack.missionNodes.length - 1
			: kind === 'event'
				? nextResourcePack.eventNodes.length - 1
				: nextResourcePack.newsNodes.length - 1;
	const entry = findEntry(graph, sourceId);
	const level = readNodeGraphKizunaHandleLevel(sourceHandleId);
	if (entry && level !== null) {
		nextResourcePack = updateEventNodeAt(
			nextResourcePack,
			index,
			createKizunaEventDefaults(entry, level)
		);
	}
	const label = readLocalNode(nextResourcePack, { index, kind })?.label;
	if (!label) return null;

	const plan = planToTarget(
		nextResourcePack,
		graph,
		{
			sourceHandleId,
			sourceId,
			targetHandleId: NODE_GRAPH_INPUT_HANDLE_ID,
			targetId: '',
		},
		{ id: '', kind, label }
	);
	if (!plan) return null;
	return {
		index,
		kind,
		label,
		resourcePack: applyNodeGraphConnection(nextResourcePack, plan),
	};
}

/** 外部信号来自奖励配置，只能在表单里修改。 */
export function isNodeGraphEdgeRemovable(edge: ISchedulerGraphEdge) {
	return edge.kind !== 'fakeMissionSignal';
}

/** 删除一条连线对应的引用；无法删除时返回 null。 */
export function removeNodeGraphEdge(
	resourcePack: ResourceEx,
	graph: ISchedulerGraph,
	edge: ISchedulerGraphEdge
): ResourceEx | null {
	if (!isNodeGraphEdgeRemovable(edge)) return null;
	const [rootField, firstIndex, , secondIndex] = edge.fieldPath;

	if (edge.kind === 'kizunaEntry') {
		const entry = findEntry(graph, edge.ownerId);
		if (!entry || edge.kizunaLevel === undefined) return null;
		const field = KIZUNA_PREREQUISITE_FIELD_BY_LEVEL[edge.kizunaLevel];
		return {
			...resourcePack,
			characters: resourcePack.characters.map((character, index) =>
				index === entry.characterIndex && character.kizuna
					? {
							...character,
							kizuna: { ...character.kizuna, [field]: '' },
						}
					: character
			),
		};
	}

	const owner = findLocalNode(graph, edge.ownerId);
	if (!owner || typeof firstIndex !== 'number') return null;

	if (edge.kind === 'scheduleNews' || edge.kind === 'dismissNews') {
		if (rootField !== 'rewards' && rootField !== 'postRewards') return null;
		const rewards = readRewards(resourcePack, owner, rootField);
		const reward = rewards[firstIndex];
		if (!reward) return null;
		// 候选新闻只剩这一条时删除整个奖励，否则只移除这一条候选。
		const remainingLabels =
			edge.kind === 'scheduleNews' && typeof secondIndex === 'number'
				? (reward.rewardIdArray ?? []).filter(
						(_, labelIndex) => labelIndex !== secondIndex
					)
				: [];
		return writeRewards(
			resourcePack,
			owner,
			rootField,
			remainingLabels.length > 0
				? rewards.map((candidate, index) =>
						index === firstIndex
							? { ...candidate, rewardIdArray: remainingLabels }
							: candidate
					)
				: rewards.filter((_, index) => index !== firstIndex)
		);
	}

	if (edge.kind === 'waitEvent') {
		const mission = resourcePack.missionNodes[owner.index];
		if (!mission || typeof secondIndex !== 'number') return null;
		return updateMissionNodeAt(resourcePack, owner.index, {
			finishConditions: mission.finishConditions.map(
				(condition, index) =>
					index === firstIndex
						? {
								...condition,
								events: (condition.events ?? []).filter(
									(_, eventIndex) =>
										eventIndex !== secondIndex
								),
							}
						: condition
			),
		});
	}

	const lists = readList(resourcePack, owner);
	const updates =
		rootField === 'postEvents'
			? {
					postEvents: lists.postEvents.filter(
						(_, i) => i !== firstIndex
					),
				}
			: rootField === 'postMissionsAfterPerformance'
				? {
						postMissionsAfterPerformance: lists.postMissions.filter(
							(_, i) => i !== firstIndex
						),
					}
				: null;
	if (!updates) return null;
	switch (owner.kind) {
		case 'mission':
			return updateMissionNodeAt(resourcePack, owner.index, updates);
		case 'event':
			return updateEventNodeAt(resourcePack, owner.index, updates);
		case 'news':
			return null;
	}
}
