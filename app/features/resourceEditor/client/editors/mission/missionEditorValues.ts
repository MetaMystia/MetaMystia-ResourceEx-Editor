import type { EventNodeTrigger } from '@/domain/resourcePack/contracts/event';
import type {
	ConditionType,
	MissionCondition,
	MissionReward,
	RewardType,
} from '@/domain/resourcePack/contracts/mission';

export function createMissionTimeLimit(
	currentValue?: EventNodeTrigger
): EventNodeTrigger {
	const defaultTime = {
		dayType: 'Relative' as const,
		dayCalcType: 'Constant' as const,
		day: 1,
	};
	return {
		...currentValue,
		triggerType: 'OnWorkEnd',
		time: currentValue?.time ?? defaultTime,
	};
}

export function createMissionCondition(
	conditionType: ConditionType
): MissionCondition {
	switch (conditionType) {
		case 'SubmitItem':
			return { conditionType, productType: 'Food', productAmount: 1 };
		case 'ServeInWork':
			return { conditionType, sellableType: 'Food' };
		case 'SubmitByTag':
			return { conditionType, sellableType: 'Food', tag: 0, amount: 0 };
		case 'SubmitByTags':
		case 'SubmitByAnyOneTag':
			return { conditionType, sellableType: 'Food', tags: [], amount: 0 };
		case 'SubmitByIngredients':
			return { conditionType, tags: [], amount: 0 };
		case 'ReachTargetCharacterKisunaLevel':
			return { conditionType, amount: 0 };
		case 'CompleteSpecifiedFollowingEvents':
			return { conditionType, amount: 1, events: [] };
		case 'BillRepayment':
			return { conditionType, amount: 1 };
		default:
			return { conditionType };
	}
}

export function createMissionReward(rewardType: RewardType): MissionReward {
	if (rewardType === 'GiveItem') {
		return { rewardType, objectType: 'Food', rewardIntArray: [] };
	}
	return { rewardType };
}

export function parseRewardItemCount(value: string): number {
	const count = Number.parseInt(value, 10);
	return Number.isInteger(count) && count > 0 ? count : 1;
}
