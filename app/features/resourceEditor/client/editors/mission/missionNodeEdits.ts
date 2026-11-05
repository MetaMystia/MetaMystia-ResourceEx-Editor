import type {
	MissionCondition,
	MissionNode,
	MissionReward,
} from '@/domain/resourcePack/contracts/mission';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { remapResourcePackLabelReferences } from '@/domain/resourcePack/entityReferences';

import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

const DEFAULT_MISSION = {
	title: '',
	description: '',
	debugLabel: '新任务',
	missionType: 'Kitsuna' as MissionNode['missionType'],
	sender: '',
	reciever: '', // ignore: typo
	rewards: [] as MissionReward[],
	postRewards: [] as MissionReward[],
	finishConditions: [] as MissionCondition[],
	missionFailedAction: 'None' as const,
};

/** 在末尾追加一个带本包前缀标签的新任务，新任务下标为原长度。 */
export function appendMissionNode(resourcePack: ResourceEx): ResourceEx {
	const packLabel = resourcePack.packInfo.label;
	const labelPrefix = packLabel ? `_${packLabel}_` : '_';
	const newMission: MissionNode = {
		...DEFAULT_MISSION,
		label: findNextAvailableSuffixedValue(
			resourcePack.missionNodes.map((mission) => mission.label),
			`${labelPrefix}Mission_`
		),
	};
	return {
		...resourcePack,
		missionNodes: [...resourcePack.missionNodes, newMission],
	};
}

/** 合并任务字段；标签变化时同步更新所有引用该任务的位置。 */
export function updateMissionNodeAt(
	resourcePack: ResourceEx,
	index: number,
	updates: Partial<MissionNode>
): ResourceEx {
	const previousMission = resourcePack.missionNodes[index];
	if (!previousMission) return resourcePack;
	const missionNodes = [...resourcePack.missionNodes];
	missionNodes[index] = { ...previousMission, ...updates } as MissionNode;
	const nextResourcePack = { ...resourcePack, missionNodes };
	if (
		updates.label === undefined ||
		updates.label === previousMission.label
	) {
		return nextResourcePack;
	}
	return remapResourcePackLabelReferences(
		nextResourcePack,
		'Mission',
		previousMission.label,
		updates.label
	);
}

export function removeMissionNodeAt(
	resourcePack: ResourceEx,
	index: number
): ResourceEx {
	return {
		...resourcePack,
		missionNodes: resourcePack.missionNodes.filter((_, i) => i !== index),
	};
}
