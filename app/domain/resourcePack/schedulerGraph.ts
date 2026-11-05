import type { KizunaInfo } from './contracts/character';
import type { ResourceEx } from './contracts/resourceEx';
import { collectResourcePackReferenceLocations } from './referenceLocations';

/**
 * 任务节点与事件节点组成的计划（Scheduler）流程图。
 *
 * 游戏在 RunTimeScheduler 中按两个阶段处理一个完成的节点：
 * - 结算（FinishSchedulerNode）：rewards → postEvents 安排事件 → postMissions 开始任务；
 * - 演出（对话包或 Timeline）结束后（FinishSchedulerNodePost）：postRewards → postMissionsAfterPerformance。
 * 图中的出口按这两个阶段区分，入口统一为“被安排/开始”。
 */

export type TSchedulerGraphNodeKind = 'event' | 'mission';

/** local：本资源包定义；missing：带本包前缀但找不到；external：原版或其他资源包的节点。 */
export type TSchedulerGraphNodeOrigin = 'external' | 'local' | 'missing';

export type TSchedulerGraphPhase = 'afterPerformance' | 'settle';

export type TSchedulerGraphEdgeKind =
	| 'fakeMissionSignal'
	| 'kizunaEntry'
	| 'scheduleEvent'
	| 'startMission'
	| 'waitEvent';

export type TSchedulerGraphPathSegment = number | string;

export interface ISchedulerGraphNode {
	id: string;
	kind: TSchedulerGraphNodeKind;
	label: string;
	origin: TSchedulerGraphNodeOrigin;
	/** 本资源包节点在 missionNodes / eventNodes 中的下标。 */
	index?: number;
	/** 与前面的同类节点标签重复；游戏只注册第一个同名节点。 */
	isDuplicate: boolean;
	/** 能从某个羁绊入口沿“安排事件/开始任务”到达。 */
	hasEntry: boolean;
}

/** 启用了羁绊的角色；ResourceEx 按羁绊等级安排对应的前置事件。 */
export interface ISchedulerGraphEntry {
	id: string;
	characterIndex: number;
	characterLabel: string;
	characterName: string;
}

export interface ISchedulerGraphEdge {
	id: string;
	kind: TSchedulerGraphEdgeKind;
	source: string;
	target: string;
	/** 来源节点在哪个阶段触发这条边；羁绊入口没有阶段。 */
	sourcePhase?: TSchedulerGraphPhase;
	/** 等待事件与外部信号连到目标任务的具体完成条件。 */
	targetConditionIndex?: number;
	/** 引用所在的实体（节点或角色入口）与字段路径。 */
	ownerId: string;
	fieldPath: readonly TSchedulerGraphPathSegment[];
	/** 羁绊入口对应的等级（Lv N → N+1 的前置事件）。 */
	kizunaLevel?: TKizunaPrerequisiteLevel;
	/** 外部信号的名称（FinishFakeMission.rewardId / FakeMission.label）。 */
	signal?: string;
}

export interface ISchedulerGraph {
	edges: readonly ISchedulerGraphEdge[];
	entries: readonly ISchedulerGraphEntry[];
	nodes: readonly ISchedulerGraphNode[];
}

export type TKizunaPrerequisiteLevel = 1 | 2 | 3 | 4;

export const KIZUNA_PREREQUISITE_LEVELS = [
	1, 2, 3, 4,
] as const satisfies readonly TKizunaPrerequisiteLevel[];

/** 羁绊 Lv N → N+1 的前置事件字段。 */
export const KIZUNA_PREREQUISITE_FIELD_BY_LEVEL = {
	1: 'lv1UpgradePrerequisiteEvent',
	2: 'lv2UpgradePrerequisiteEvent',
	3: 'lv3UpgradePrerequisiteEvent',
	4: 'lv4UpgradePrerequisiteEvent',
} as const satisfies Record<TKizunaPrerequisiteLevel, keyof KizunaInfo>;

/** 节点 ID 只取决于类型和标签，供布局等本地状态在增删排序后保持稳定。 */
export function createSchedulerGraphNodeId(
	kind: TSchedulerGraphNodeKind,
	label: string
) {
	return `${kind}:${label}`;
}

function createUnkeyedNodeId(kind: TSchedulerGraphNodeKind, index: number) {
	return `${kind}@${index}`;
}

function createEntryId(characterId: number) {
	return `entry:${characterId}`;
}

export function buildSchedulerGraph(resourcePack: ResourceEx): ISchedulerGraph {
	const packLabel = resourcePack.packInfo.label;
	const localPrefix = packLabel ? `_${packLabel}_` : '';
	const nodes: ISchedulerGraphNode[] = [];
	const nodeIdByKey = new Map<string, string>();
	const nodeById = new Map<string, ISchedulerGraphNode>();
	const localNodeIdsByKind = {
		event: [] as string[],
		mission: [] as string[],
	} satisfies Record<TSchedulerGraphNodeKind, string[]>;

	const addLocalNodes = (
		kind: TSchedulerGraphNodeKind,
		labels: readonly string[]
	) => {
		labels.forEach((label, index) => {
			const key = createSchedulerGraphNodeId(kind, label);
			const isDuplicate = Boolean(label) && nodeIdByKey.has(key);
			const id =
				label && !isDuplicate ? key : createUnkeyedNodeId(kind, index);
			if (label && !isDuplicate) nodeIdByKey.set(key, id);
			localNodeIdsByKind[kind].push(id);
			const node: ISchedulerGraphNode = {
				hasEntry: false,
				id,
				index,
				isDuplicate,
				kind,
				label,
				origin: 'local',
			};
			nodes.push(node);
			nodeById.set(id, node);
		});
	};
	addLocalNodes(
		'mission',
		resourcePack.missionNodes.map(({ label }) => label)
	);
	addLocalNodes(
		'event',
		resourcePack.eventNodes.map(({ label }) => label)
	);

	/** 解析被引用的节点；本包里没有时生成外部或缺失节点。 */
	const resolveNodeId = (kind: TSchedulerGraphNodeKind, label: string) => {
		const key = createSchedulerGraphNodeId(kind, label);
		const existingId = nodeIdByKey.get(key);
		if (existingId !== undefined) return existingId;
		const node: ISchedulerGraphNode = {
			hasEntry: false,
			id: key,
			isDuplicate: false,
			kind,
			label,
			origin:
				localPrefix && label.trim().startsWith(localPrefix)
					? 'missing'
					: 'external',
		};
		nodes.push(node);
		nodeById.set(key, node);
		nodeIdByKey.set(key, key);
		return key;
	};

	// 引用位置按角色 ID 记录所属角色；同 ID 只保留第一个，与引用解析一致。
	const entryByCharacterId = new Map<number, ISchedulerGraphEntry>();
	resourcePack.characters.forEach((character, characterIndex) => {
		if (!character.kizuna || entryByCharacterId.has(character.id)) return;
		entryByCharacterId.set(character.id, {
			characterIndex,
			characterLabel: character.label,
			characterName: character.name,
			id: createEntryId(character.id),
		});
	});

	const edges: ISchedulerGraphEdge[] = [];
	const addEdge = (edge: Omit<ISchedulerGraphEdge, 'id'>) => {
		edges.push({
			...edge,
			id: `${edge.kind}|${edge.ownerId}|${edge.fieldPath.join('.')}`,
		});
	};

	for (const location of collectResourcePackReferenceLocations(
		resourcePack
	)) {
		const { fieldPath, ownerKey, ownerKind, referencedKind } = location;
		const referencedLabel = String(location.referencedValue);
		const [rootField, secondField] = fieldPath;

		if (ownerKind === 'character') {
			if (referencedKind !== 'event' || rootField !== 'kizuna') continue;
			const kizunaLevel = KIZUNA_PREREQUISITE_LEVELS.find(
				(level) =>
					KIZUNA_PREREQUISITE_FIELD_BY_LEVEL[level] === secondField
			);
			const entry =
				typeof ownerKey === 'number'
					? entryByCharacterId.get(ownerKey)
					: undefined;
			if (kizunaLevel === undefined || entry === undefined) continue;
			addEdge({
				fieldPath,
				kind: 'kizunaEntry',
				kizunaLevel,
				ownerId: entry.id,
				source: entry.id,
				target: resolveNodeId('event', referencedLabel),
			});
			continue;
		}

		if (ownerKind !== 'event' && ownerKind !== 'mission') continue;
		if (referencedKind !== 'event' && referencedKind !== 'mission') {
			continue;
		}
		// 引用位置只按标签记录所属节点；空标签节点无法区分，已由导出校验报错。
		if (!ownerKey) continue;
		const ownerId = resolveNodeId(ownerKind, String(ownerKey));
		const targetId = resolveNodeId(referencedKind, referencedLabel);

		if (rootField === 'postEvents') {
			addEdge({
				fieldPath,
				kind: 'scheduleEvent',
				ownerId,
				source: ownerId,
				sourcePhase: 'settle',
				target: targetId,
			});
		} else if (rootField === 'postMissionsAfterPerformance') {
			addEdge({
				fieldPath,
				kind: 'startMission',
				ownerId,
				source: ownerId,
				sourcePhase: 'afterPerformance',
				target: targetId,
			});
		} else if (
			rootField === 'finishConditions' &&
			typeof secondField === 'number'
		) {
			// 事件完成（结算阶段记入 finishedEvents）后，任务的该条件计数。
			addEdge({
				fieldPath,
				kind: 'waitEvent',
				ownerId,
				source: targetId,
				sourcePhase: 'settle',
				target: ownerId,
				targetConditionIndex: secondField,
			});
		}
	}

	// FinishFakeMission 奖励按 rewardId 匹配正在追踪任务里同名的 FakeMission 条件。
	const fakeMissionTargets = new Map<
		string,
		{ conditionIndex: number; missionId: string }[]
	>();
	resourcePack.missionNodes.forEach((mission, missionIndex) => {
		const missionId = localNodeIdsByKind.mission[missionIndex];
		if (missionId === undefined) return;
		mission.finishConditions.forEach((condition, conditionIndex) => {
			if (condition.conditionType !== 'FakeMission' || !condition.label) {
				return;
			}
			const targets = fakeMissionTargets.get(condition.label) ?? [];
			targets.push({ conditionIndex, missionId });
			fakeMissionTargets.set(condition.label, targets);
		});
	});
	nodes
		.filter((node) => node.origin === 'local' && !node.isDuplicate)
		.forEach((node) => {
			const owner =
				node.kind === 'mission'
					? resourcePack.missionNodes[node.index ?? -1]
					: resourcePack.eventNodes[node.index ?? -1];
			if (!owner) return;
			(
				[
					['rewards', 'settle'],
					['postRewards', 'afterPerformance'],
				] as const
			).forEach(([field, phase]) => {
				owner[field]?.forEach((reward, rewardIndex) => {
					if (
						reward.rewardType !== 'FinishFakeMission' ||
						!reward.rewardId
					) {
						return;
					}
					fakeMissionTargets
						.get(reward.rewardId)
						?.forEach(({ conditionIndex, missionId }) =>
							addEdge({
								fieldPath: [field, rewardIndex, 'rewardId'],
								kind: 'fakeMissionSignal',
								ownerId: node.id,
								signal: reward.rewardId ?? '',
								source: node.id,
								sourcePhase: phase,
								target: missionId,
								targetConditionIndex: conditionIndex,
							})
						);
				});
			});
		});

	const successorIdsBySourceId = new Map<string, string[]>();
	edges.forEach(({ kind, source, target }) => {
		if (kind === 'waitEvent' || kind === 'fakeMissionSignal') return;
		const successorIds = successorIdsBySourceId.get(source) ?? [];
		successorIds.push(target);
		successorIdsBySourceId.set(source, successorIds);
	});
	const entries = [...entryByCharacterId.values()];
	const pendingIds = entries.map(({ id }) => id);
	const visitedIds = new Set<string>();
	for (let id = pendingIds.pop(); id !== undefined; id = pendingIds.pop()) {
		if (visitedIds.has(id)) continue;
		visitedIds.add(id);
		const node = nodeById.get(id);
		if (node) node.hasEntry = true;
		pendingIds.push(...(successorIdsBySourceId.get(id) ?? []));
	}

	return { edges, entries, nodes };
}
