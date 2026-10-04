import { cloneJsonObject } from '@/shared/utilities/objects/cloneJsonObject';

import type { CharacterType } from './contracts/character';
import type { EventNodeTrigger } from './contracts/event';
import type { MissionCondition, MissionReward } from './contracts/mission';
import type { ResourceEx } from './contracts/resourceEx';

export type TItemReferenceKind =
	'Beverage' | 'Food' | 'Ingredient' | 'Item' | 'Recipe';

export type TLabelReferenceKind = 'DialogPackage' | 'Event' | 'Mission';

export interface ICharacterReferenceRemap {
	fromId: number;
	toId: number;
	fromLabel: string;
	toLabel: string;
	fromType: CharacterType;
	toType: CharacterType;
}

function remapNumber(value: number, from: number, to: number): number {
	return value === from ? to : value;
}

function remapString(value: string, from: string, to: string): string {
	return from && value === from ? to : value;
}

function remapRewardItem(
	reward: MissionReward,
	kind: TItemReferenceKind,
	fromId: number,
	toId: number
): void {
	if (reward.objectType !== kind || !reward.rewardIntArray) return;
	reward.rewardIntArray = reward.rewardIntArray.map((id) =>
		remapNumber(id, fromId, toId)
	);
}

function remapConditionItem(
	condition: MissionCondition,
	kind: TItemReferenceKind,
	fromId: number,
	toId: number
): void {
	if (condition.productType === kind && condition.productId === fromId) {
		condition.productId = toId;
	}
	if (
		kind === 'Food' &&
		condition.conditionType === 'ServeInWork' &&
		condition.amount === fromId
	) {
		condition.amount = toId;
	}
	if (
		kind === 'Ingredient' &&
		condition.conditionType === 'SubmitByIngredients' &&
		condition.tags
	) {
		condition.tags = condition.tags.map((id) =>
			remapNumber(id, fromId, toId)
		);
	}
}

function remapCharacterTrigger(
	trigger: EventNodeTrigger | undefined,
	fromLabel: string,
	toLabel: string
): void {
	if (
		!trigger ||
		(trigger.triggerType !== 'KizunaCheckPoint' &&
			trigger.triggerType !== 'OnTalkWithCharacter') ||
		trigger.triggerId !== fromLabel
	) {
		return;
	}
	trigger.triggerId = toLabel;
}

function remapCharacterReward(
	reward: MissionReward,
	fromLabel: string,
	toLabel: string
): void {
	if (
		reward.rewardType === 'UpgradeKizunaLevel' &&
		reward.rewardId === fromLabel
	) {
		reward.rewardId = toLabel;
	}
}

export function remapResourcePackItemReferences(
	resourcePack: ResourceEx,
	kind: TItemReferenceKind,
	fromId: number,
	toId: number
): ResourceEx {
	if (fromId === toId) return resourcePack;
	const next = cloneJsonObject(resourcePack);

	if (kind === 'Item') {
		(next.gifts ?? []).forEach((gift) => {
			if (gift.itemId === fromId) gift.itemId = toId;
		});
	}

	next.recipes.forEach((recipe) => {
		if (kind === 'Food') {
			recipe.foodId = remapNumber(recipe.foodId, fromId, toId);
		}
		if (kind === 'Ingredient') {
			recipe.ingredients = recipe.ingredients.map((id) =>
				remapNumber(id, fromId, toId)
			);
		}
	});
	next.merchants.forEach((merchant) =>
		merchant.merchandise.forEach(({ item }) => {
			if (item.productType === kind) {
				item.productId = remapNumber(item.productId, fromId, toId);
			}
		})
	);
	next.missionNodes.forEach((mission) => {
		mission.finishConditions.forEach((condition) =>
			remapConditionItem(condition, kind, fromId, toId)
		);
		mission.rewards?.forEach((reward) =>
			remapRewardItem(reward, kind, fromId, toId)
		);
		mission.postRewards?.forEach((reward) =>
			remapRewardItem(reward, kind, fromId, toId)
		);
	});
	next.eventNodes.forEach((eventNode) => {
		eventNode.rewards?.forEach((reward) =>
			remapRewardItem(reward, kind, fromId, toId)
		);
		eventNode.postRewards?.forEach((reward) =>
			remapRewardItem(reward, kind, fromId, toId)
		);
	});

	return next;
}

export function remapResourcePackCharacterReferences(
	resourcePack: ResourceEx,
	remap: ICharacterReferenceRemap
): ResourceEx {
	const { fromId, fromLabel, fromType, toId, toLabel, toType } = remap;
	const next = cloneJsonObject(resourcePack);
	next.spells.forEach((spell) => {
		spell.id = remapNumber(spell.id, fromId, toId);
	});

	next.dialogPackages.forEach((dialogPackage) =>
		dialogPackage.dialogList.forEach((dialog) => {
			if (
				dialog.characterId === fromId &&
				dialog.characterType === fromType
			) {
				dialog.characterId = toId;
				dialog.characterType = toType;
			}
		})
	);
	next.merchants.forEach((merchant) => {
		merchant.key = remapString(merchant.key, fromLabel, toLabel);
	});
	next.missionNodes.forEach((mission) => {
		mission.sender = remapString(mission.sender, fromLabel, toLabel);
		mission.reciever = remapString(mission.reciever, fromLabel, toLabel);
		mission.finishConditions.forEach((condition) => {
			if (
				condition.label === fromLabel &&
				[
					'ReachTargetCharacterKisunaLevel',
					'ServeInWork',
					'TalkWithCharacter',
				].includes(condition.conditionType)
			) {
				condition.label = toLabel;
			}
		});
		mission.rewards?.forEach((reward) =>
			remapCharacterReward(reward, fromLabel, toLabel)
		);
		mission.postRewards?.forEach((reward) =>
			remapCharacterReward(reward, fromLabel, toLabel)
		);
		remapCharacterTrigger(mission.missionTimeLimit, fromLabel, toLabel);
	});
	next.eventNodes.forEach((eventNode) => {
		eventNode.rewards?.forEach((reward) =>
			remapCharacterReward(reward, fromLabel, toLabel)
		);
		eventNode.postRewards?.forEach((reward) =>
			remapCharacterReward(reward, fromLabel, toLabel)
		);
		remapCharacterTrigger(
			eventNode.scheduledEvent?.trigger,
			fromLabel,
			toLabel
		);
	});

	return next;
}

export function remapResourcePackCharacterPortraitReferences(
	resourcePack: ResourceEx,
	characterId: number,
	characterType: CharacterType,
	pidMap: ReadonlyMap<number, number>
): ResourceEx {
	if (pidMap.size === 0) return resourcePack;
	const next = cloneJsonObject(resourcePack);

	next.dialogPackages.forEach((dialogPackage) =>
		dialogPackage.dialogList.forEach((dialog) => {
			if (
				dialog.characterId !== characterId ||
				dialog.characterType !== characterType
			) {
				return;
			}
			const nextPid = pidMap.get(dialog.pid);
			if (nextPid !== undefined) dialog.pid = nextPid;
		})
	);

	return next;
}

function remapLabelArray(
	values: string[] | undefined,
	fromLabel: string,
	toLabel: string
): void {
	if (!values) return;
	values.forEach((value, index) => {
		values[index] = remapString(value, fromLabel, toLabel);
	});
}

export function remapResourcePackLabelReferences(
	resourcePack: ResourceEx,
	kind: TLabelReferenceKind,
	fromLabel: string,
	toLabel: string
): ResourceEx {
	if (fromLabel === toLabel) return resourcePack;
	const next = cloneJsonObject(resourcePack);

	next.characters.forEach((character) => {
		const kizuna = character.kizuna as Record<string, unknown> | undefined;
		if (!kizuna) return;
		Object.entries(kizuna).forEach(([field, value]) => {
			if (kind === 'DialogPackage' && Array.isArray(value)) {
				value.forEach((entry, index) => {
					if (typeof entry === 'string') {
						value[index] = remapString(entry, fromLabel, toLabel);
					}
				});
			}
			if (
				kind === 'Event' &&
				field.endsWith('PrerequisiteEvent') &&
				typeof value === 'string'
			) {
				kizuna[field] = remapString(value, fromLabel, toLabel);
			}
		});
	});
	if (kind === 'DialogPackage') {
		(next.gifts ?? []).forEach((gift) => {
			gift.dialogPackageName = remapString(
				gift.dialogPackageName,
				fromLabel,
				toLabel
			);
		});
		next.merchants.forEach((merchant) => {
			remapLabelArray(
				merchant.welcomeDialogPackageNames,
				fromLabel,
				toLabel
			);
			remapLabelArray(
				merchant.nullDialogPackageNames,
				fromLabel,
				toLabel
			);
		});
		next.missionNodes.forEach((mission) => {
			if (mission.missionFinishEvent?.dialogPackageName === fromLabel) {
				mission.missionFinishEvent.dialogPackageName = toLabel;
			}
			if (mission.missionFailedEvent?.dialogPackageName === fromLabel) {
				mission.missionFailedEvent.dialogPackageName = toLabel;
			}
		});
		next.eventNodes.forEach((eventNode) => {
			if (
				eventNode.scheduledEvent?.eventData?.dialogPackageName ===
				fromLabel
			) {
				eventNode.scheduledEvent.eventData.dialogPackageName = toLabel;
			}
		});
	}
	if (kind === 'Event') {
		next.missionNodes.forEach((mission) =>
			remapLabelArray(mission.postEvents, fromLabel, toLabel)
		);
		next.eventNodes.forEach((eventNode) =>
			remapLabelArray(eventNode.postEvents, fromLabel, toLabel)
		);
	}
	if (kind === 'Mission') {
		next.missionNodes.forEach((mission) =>
			remapLabelArray(
				mission.postMissionsAfterPerformance,
				fromLabel,
				toLabel
			)
		);
		next.eventNodes.forEach((eventNode) =>
			remapLabelArray(
				eventNode.postMissionsAfterPerformance,
				fromLabel,
				toLabel
			)
		);
	}

	return next;
}
