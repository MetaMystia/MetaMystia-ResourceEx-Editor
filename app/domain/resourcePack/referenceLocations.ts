import type { EventData, EventNodeTrigger } from './contracts/event';
import type { MissionCondition, MissionReward } from './contracts/mission';
import type { ResourceEx } from './contracts/resourceEx';
import { resolveDayMapAssetPath } from './dayMapAssets';

export type TResourcePackReferenceKind =
	| 'asset'
	| 'beverage'
	| 'character'
	| 'characterPortrait'
	| 'dialogPackage'
	| 'event'
	| 'food'
	| 'ingredient'
	| 'item'
	| 'mission'
	| 'recipe';

export type TResourcePackReferenceOwnerKind =
	| 'beverage'
	| 'character'
	| 'clothes'
	| 'dayMap'
	| 'dialogPackage'
	| 'event'
	| 'food'
	| 'gift'
	| 'ingredient'
	| 'merchant'
	| 'mission'
	| 'recipe';

export type TResourcePackReferencePathSegment = number | string;

export interface IResourcePackReferenceLocation {
	fieldPath: readonly TResourcePackReferencePathSegment[];
	ownerKey: number | string;
	ownerKind: TResourcePackReferenceOwnerKind;
	referencedKind: TResourcePackReferenceKind;
	referencedValue: number | string;
}

interface IReferenceOwner {
	key: number | string;
	kind: TResourcePackReferenceOwnerKind;
}

const ITEM_REFERENCE_KIND_MAP = {
	Beverage: 'beverage',
	Food: 'food',
	Ingredient: 'ingredient',
	Item: 'item',
	Recipe: 'recipe',
} as const satisfies Record<
	string,
	Extract<
		TResourcePackReferenceKind,
		'beverage' | 'food' | 'ingredient' | 'item' | 'recipe'
	>
>;

const itemReferenceKindsByName: Readonly<
	Record<
		string,
		Extract<
			TResourcePackReferenceKind,
			'beverage' | 'food' | 'ingredient' | 'item' | 'recipe'
		>
	>
> = ITEM_REFERENCE_KIND_MAP;

function createCharacterReferenceValue(
	characterType: string,
	characterId: number
): string {
	return `${characterType}:${characterId}`;
}

function addReference(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPath: readonly TResourcePackReferencePathSegment[],
	referencedKind: TResourcePackReferenceKind,
	referencedValue: number | string | undefined
): void {
	if (
		referencedValue === undefined ||
		(typeof referencedValue === 'string' && !referencedValue.trim())
	) {
		return;
	}

	locations.push({
		fieldPath: Object.freeze([...fieldPath]),
		ownerKey: owner.key,
		ownerKind: owner.kind,
		referencedKind,
		referencedValue,
	});
}

function addAssetReference(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPath: readonly TResourcePackReferencePathSegment[],
	path: string | undefined
): void {
	addReference(locations, owner, fieldPath, 'asset', path);
}

function addItemReference(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPath: readonly TResourcePackReferencePathSegment[],
	itemKind: string | undefined,
	itemId: number | undefined
): void {
	const referencedKind = itemKind
		? itemReferenceKindsByName[itemKind]
		: undefined;
	if (!referencedKind) return;
	addReference(locations, owner, fieldPath, referencedKind, itemId);
}

function addRewardReferences(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPrefix: readonly TResourcePackReferencePathSegment[],
	rewards: readonly MissionReward[] | undefined
): void {
	rewards?.forEach((reward, rewardIndex) => {
		const rewardPath = [...fieldPrefix, rewardIndex];
		if (reward.rewardType === 'UpgradeKizunaLevel') {
			addReference(
				locations,
				owner,
				[...rewardPath, 'rewardId'],
				'character',
				reward.rewardId
			);
		}
		if (reward.rewardType !== 'GiveItem') return;
		reward.rewardIntArray?.forEach((itemId, itemIndex) =>
			addItemReference(
				locations,
				owner,
				[...rewardPath, 'rewardIntArray', itemIndex],
				reward.objectType,
				itemId
			)
		);
	});
}

function addCharacterTriggerReference(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPrefix: readonly TResourcePackReferencePathSegment[],
	trigger: EventNodeTrigger | undefined
): void {
	if (
		trigger?.triggerType !== 'KizunaCheckPoint' &&
		trigger?.triggerType !== 'OnTalkWithCharacter'
	) {
		return;
	}

	addReference(
		locations,
		owner,
		[...fieldPrefix, 'triggerId'],
		'character',
		trigger.triggerId
	);
}

function addEventDataReference(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPrefix: readonly TResourcePackReferencePathSegment[],
	eventData: EventData | undefined
): void {
	if (eventData?.eventType !== 'Dialog') return;
	addReference(
		locations,
		owner,
		[...fieldPrefix, 'dialogPackageName'],
		'dialogPackage',
		eventData.dialogPackageName
	);
}

function addMissionConditionReferences(
	locations: IResourcePackReferenceLocation[],
	owner: IReferenceOwner,
	fieldPrefix: readonly TResourcePackReferencePathSegment[],
	condition: MissionCondition
): void {
	switch (condition.conditionType) {
		case 'SubmitItem':
			addItemReference(
				locations,
				owner,
				[...fieldPrefix, 'productId'],
				condition.productType,
				condition.productId
			);
			break;
		case 'ServeInWork':
			addReference(
				locations,
				owner,
				[...fieldPrefix, 'amount'],
				'food',
				condition.amount
			);
			addReference(
				locations,
				owner,
				[...fieldPrefix, 'label'],
				'character',
				condition.label
			);
			break;
		case 'SubmitByIngredients':
			condition.tags?.forEach((ingredientId, ingredientIndex) =>
				addReference(
					locations,
					owner,
					[...fieldPrefix, 'tags', ingredientIndex],
					'ingredient',
					ingredientId
				)
			);
			break;
		case 'ReachTargetCharacterKisunaLevel':
		case 'TalkWithCharacter':
			addReference(
				locations,
				owner,
				[...fieldPrefix, 'label'],
				'character',
				condition.label
			);
			break;
	}
}

export function collectResourcePackReferenceLocations(
	resourcePack: ResourceEx
): readonly IResourcePackReferenceLocation[] {
	const locations: IResourcePackReferenceLocation[] = [];

	(resourcePack.dayMaps ?? []).forEach((map) => {
		const owner = { key: map.id, kind: 'dayMap' } as const;
		const resolvePath = (path: string) =>
			resolveDayMapAssetPath(path, resourcePack.packInfo.label) ?? path;
		map.tiles.forEach((tile, index) =>
			addAssetReference(
				locations,
				owner,
				['tiles', index, 'image'],
				resolvePath(tile.image)
			)
		);
		addAssetReference(
			locations,
			owner,
			['mapBGM', 'intro'],
			resolvePath(map.mapBGM.intro)
		);
		addAssetReference(
			locations,
			owner,
			['mapBGM', 'loop'],
			resolvePath(map.mapBGM.loop)
		);
	});
	(resourcePack.gifts ?? []).forEach((gift, index) => {
		const owner = { key: index, kind: 'gift' } as const;
		addReference(
			locations,
			owner,
			['itemId'],
			'item',
			gift.itemId ?? undefined
		);
		addReference(
			locations,
			owner,
			['dialogPackageName'],
			'dialogPackage',
			gift.dialogPackageName
		);
	});

	resourcePack.ingredients.forEach((ingredient) =>
		addAssetReference(
			locations,
			{ key: ingredient.id, kind: 'ingredient' },
			['spritePath'],
			ingredient.spritePath
		)
	);
	resourcePack.foods.forEach((food) =>
		addAssetReference(
			locations,
			{ key: food.id, kind: 'food' },
			['spritePath'],
			food.spritePath
		)
	);
	resourcePack.beverages.forEach((beverage) =>
		addAssetReference(
			locations,
			{ key: beverage.id, kind: 'beverage' },
			['spritePath'],
			beverage.spritePath
		)
	);

	resourcePack.clothes.forEach((clothes) => {
		const owner = { key: clothes.id, kind: 'clothes' } as const;
		addAssetReference(locations, owner, ['spritePath'], clothes.spritePath);
		addAssetReference(
			locations,
			owner,
			['portraitPath'],
			clothes.portraitPath
		);
		const pixelFullConfig = clothes.pixelFullConfig;
		(
			['mainSprite', 'eyeSprite', 'hairSprite', 'backSprite'] as const
		).forEach((field) => {
			pixelFullConfig?.[field].forEach((path, index) =>
				addAssetReference(
					locations,
					owner,
					['pixelFullConfig', field, index],
					path
				)
			);
		});
	});

	resourcePack.characters.forEach((character) => {
		const owner = { key: character.id, kind: 'character' } as const;
		character.portraits?.forEach((portrait, portraitIndex) =>
			addAssetReference(
				locations,
				owner,
				['portraits', portraitIndex, 'path'],
				portrait.path
			)
		);
		character.characterSpriteSetCompact?.mainSprite.forEach((path, index) =>
			addAssetReference(
				locations,
				owner,
				['characterSpriteSetCompact', 'mainSprite', index],
				path
			)
		);
		character.characterSpriteSetCompact?.eyeSprite.forEach((path, index) =>
			addAssetReference(
				locations,
				owner,
				['characterSpriteSetCompact', 'eyeSprite', index],
				path
			)
		);

		Object.entries(character.kizuna ?? {}).forEach(([field, value]) => {
			if (Array.isArray(value)) {
				value.forEach((dialogPackageName, index) => {
					if (typeof dialogPackageName !== 'string') return;
					addReference(
						locations,
						owner,
						['kizuna', field, index],
						'dialogPackage',
						dialogPackageName
					);
				});
			} else if (
				typeof value === 'string' &&
				field.endsWith('PrerequisiteEvent')
			) {
				addReference(
					locations,
					owner,
					['kizuna', field],
					'event',
					value
				);
			}
		});
	});

	resourcePack.dialogPackages.forEach((dialogPackage) => {
		const owner = {
			key: dialogPackage.name,
			kind: 'dialogPackage',
		} as const;
		dialogPackage.dialogList.forEach((dialog, dialogIndex) => {
			const dialogPath = ['dialogList', dialogIndex] as const;
			const characterReference = createCharacterReferenceValue(
				dialog.characterType,
				dialog.characterId
			);
			addReference(
				locations,
				owner,
				[...dialogPath, 'characterId'],
				'character',
				characterReference
			);
			addReference(
				locations,
				owner,
				[...dialogPath, 'pid'],
				'characterPortrait',
				`${characterReference}:${dialog.pid}`
			);
			dialog.actions?.forEach((action, actionIndex) => {
				const actionPath = [
					...dialogPath,
					'actions',
					actionIndex,
				] as const;
				if (
					(action.actionType === 'CG' ||
						action.actionType === 'BG') &&
					action.shouldSet !== false
				) {
					addAssetReference(
						locations,
						owner,
						[...actionPath, 'sprite'],
						action.sprite
					);
				}
				if (action.actionType === 'Sound') {
					addAssetReference(
						locations,
						owner,
						[...actionPath, 'sound'],
						action.sound
					);
				}
			});
		});
	});

	resourcePack.recipes.forEach((recipe) => {
		const owner = { key: recipe.id, kind: 'recipe' } as const;
		addReference(locations, owner, ['foodId'], 'food', recipe.foodId);
		recipe.ingredients.forEach((ingredientId, index) =>
			addReference(
				locations,
				owner,
				['ingredients', index],
				'ingredient',
				ingredientId
			)
		);
	});

	resourcePack.merchants.forEach((merchant) => {
		const owner = { key: merchant.key, kind: 'merchant' } as const;
		addReference(locations, owner, ['key'], 'character', merchant.key);
		merchant.welcomeDialogPackageNames.forEach((name, index) =>
			addReference(
				locations,
				owner,
				['welcomeDialogPackageNames', index],
				'dialogPackage',
				name
			)
		);
		merchant.nullDialogPackageNames.forEach((name, index) =>
			addReference(
				locations,
				owner,
				['nullDialogPackageNames', index],
				'dialogPackage',
				name
			)
		);
		merchant.merchandise.forEach(({ item }, merchandiseIndex) =>
			addItemReference(
				locations,
				owner,
				['merchandise', merchandiseIndex, 'item', 'productId'],
				item.productType,
				item.productId
			)
		);
	});

	resourcePack.missionNodes.forEach((mission) => {
		const owner = { key: mission.label, kind: 'mission' } as const;
		addReference(locations, owner, ['sender'], 'character', mission.sender);
		addReference(
			locations,
			owner,
			['reciever'],
			'character',
			mission.reciever
		);
		mission.finishConditions.forEach((condition, conditionIndex) =>
			addMissionConditionReferences(
				locations,
				owner,
				['finishConditions', conditionIndex],
				condition
			)
		);
		addRewardReferences(locations, owner, ['rewards'], mission.rewards);
		addRewardReferences(
			locations,
			owner,
			['postRewards'],
			mission.postRewards
		);
		mission.postMissionsAfterPerformance?.forEach((label, index) =>
			addReference(
				locations,
				owner,
				['postMissionsAfterPerformance', index],
				'mission',
				label
			)
		);
		mission.postEvents?.forEach((label, index) =>
			addReference(
				locations,
				owner,
				['postEvents', index],
				'event',
				label
			)
		);
		addEventDataReference(
			locations,
			owner,
			['missionFinishEvent'],
			mission.missionFinishEvent
		);
		addEventDataReference(
			locations,
			owner,
			['missionFailedEvent'],
			mission.missionFailedEvent
		);
		addCharacterTriggerReference(
			locations,
			owner,
			['missionTimeLimit'],
			mission.missionTimeLimit
		);
	});

	resourcePack.eventNodes.forEach((eventNode) => {
		const owner = { key: eventNode.label, kind: 'event' } as const;
		addRewardReferences(locations, owner, ['rewards'], eventNode.rewards);
		addRewardReferences(
			locations,
			owner,
			['postRewards'],
			eventNode.postRewards
		);
		eventNode.postMissionsAfterPerformance?.forEach((label, index) =>
			addReference(
				locations,
				owner,
				['postMissionsAfterPerformance', index],
				'mission',
				label
			)
		);
		eventNode.postEvents?.forEach((label, index) =>
			addReference(
				locations,
				owner,
				['postEvents', index],
				'event',
				label
			)
		);
		addEventDataReference(
			locations,
			owner,
			['scheduledEvent', 'eventData'],
			eventNode.scheduledEvent?.eventData
		);
		addCharacterTriggerReference(
			locations,
			owner,
			['scheduledEvent', 'trigger'],
			eventNode.scheduledEvent?.trigger
		);
	});

	return Object.freeze(locations);
}
