export type TComparisonArraySemantics =
	| { kind: 'keyed'; stableKey: string }
	| { kind: 'ordered' }
	| { kind: 'set' };

const KEYED_ARRAY_SEMANTICS = {
	beverages: { kind: 'keyed', stableKey: 'id' },
	characters: { kind: 'keyed', stableKey: 'id' },
	'characters[].guest.bevRequests': { kind: 'keyed', stableKey: 'tagId' },
	'characters[].guest.foodRequests': { kind: 'keyed', stableKey: 'tagId' },
	'characters[].guest.likeBevTag': { kind: 'keyed', stableKey: 'tagId' },
	'characters[].guest.likeFoodTag': { kind: 'keyed', stableKey: 'tagId' },
	'characters[].guest.spawn': { kind: 'keyed', stableKey: 'izakayaId' },
	'characters[].portraits': { kind: 'keyed', stableKey: 'pid' },
	clothes: { kind: 'keyed', stableKey: 'id' },
	dayMaps: { kind: 'keyed', stableKey: 'id' },
	'dayMaps[].tiles': { kind: 'keyed', stableKey: 'key' },
	'dayMaps[].spawnMarkers': { kind: 'keyed', stableKey: 'name' },
	dialogPackages: { kind: 'keyed', stableKey: 'name' },
	eventNodes: { kind: 'keyed', stableKey: 'label' },
	foods: { kind: 'keyed', stableKey: 'id' },
	ingredients: { kind: 'keyed', stableKey: 'id' },
	merchants: { kind: 'keyed', stableKey: 'key' },
	missionNodes: { kind: 'keyed', stableKey: 'label' },
	recipes: { kind: 'keyed', stableKey: 'id' },
} as const satisfies Record<string, TComparisonArraySemantics>;

const SET_ARRAY_SEMANTICS = {
	'beverages[].tags': { kind: 'set' },
	'characters[].guest.hateFoodTag': { kind: 'set' },
	'foods[].banTags': { kind: 'set' },
	'foods[].tags': { kind: 'set' },
	'ingredients[].tags': { kind: 'set' },
	'missionNodes[].finishConditions[].tags': { kind: 'set' },
} as const satisfies Record<string, TComparisonArraySemantics>;

const ORDERED_ARRAY_PATHS = [
	'characters[].characterSpriteSetCompact.eyeSprite',
	'characters[].characterSpriteSetCompact.mainSprite',
	'characters[].descriptions',
	'characters[].guest.conversation',
	'characters[].guest.evaluation',
	'characters[].kizuna.lv1ChatData',
	'characters[].kizuna.lv1Welcome',
	'characters[].kizuna.lv2ChatData',
	'characters[].kizuna.lv2InviteFailed',
	'characters[].kizuna.lv2InviteSucceed',
	'characters[].kizuna.lv2Welcome',
	'characters[].kizuna.lv3ChatData',
	'characters[].kizuna.lv3InviteFailed',
	'characters[].kizuna.lv3InviteSucceed',
	'characters[].kizuna.lv3RequestIngerdient',
	'characters[].kizuna.lv3Welcome',
	'characters[].kizuna.lv4ChatData',
	'characters[].kizuna.lv4InviteFailed',
	'characters[].kizuna.lv4InviteSucceed',
	'characters[].kizuna.lv4RequestBeverage',
	'characters[].kizuna.lv4RequestIngerdient',
	'characters[].kizuna.lv4Welcome',
	'characters[].kizuna.lv5ChatData',
	'characters[].kizuna.lv5Commision',
	'characters[].kizuna.lv5CommisionFinish',
	'characters[].kizuna.lv5InviteSucceed',
	'characters[].kizuna.lv5RequestBeverage',
	'characters[].kizuna.lv5RequestIngerdient',
	'characters[].kizuna.lv5Welcome',
	'clothes[].pixelFullConfig.backSprite',
	'clothes[].pixelFullConfig.eyeSprite',
	'clothes[].pixelFullConfig.hairSprite',
	'clothes[].pixelFullConfig.mainSprite',
	'dialogPackages[].dialogList',
	'dialogPackages[].dialogList[].actions',
	'dialogPackages[].dialogList[].actions[].options',
	'eventNodes[].postEvents',
	'eventNodes[].postMissionsAfterPerformance',
	'eventNodes[].postRewards',
	'eventNodes[].rewards',
	'eventNodes[].scheduledEvent.trigger.labels',
	'eventNodes[].postRewards[].rewardIntArray',
	'eventNodes[].rewards[].rewardIntArray',
	'gifts',
	'merchants[].merchandise',
	'merchants[].nullDialogPackageNames',
	'merchants[].welcomeDialogPackageNames',
	'missionNodes[].finishConditions',
	'missionNodes[].postEvents',
	'missionNodes[].postMissionsAfterPerformance',
	'missionNodes[].postRewards',
	'missionNodes[].postRewards[].rewardIntArray',
	'missionNodes[].rewards',
	'missionNodes[].rewards[].rewardIntArray',
	'packInfo.authors',
	'packInfo.dependencies',
	'recipes[].ingredients',
] as const;

export const COMPARISON_ARRAY_SEMANTICS = {
	...KEYED_ARRAY_SEMANTICS,
	...Object.fromEntries(
		ORDERED_ARRAY_PATHS.map((path) => [path, { kind: 'ordered' } as const])
	),
	...SET_ARRAY_SEMANTICS,
} as const satisfies Record<string, TComparisonArraySemantics>;

const comparisonArraySemanticsByPath: Readonly<
	Record<string, TComparisonArraySemantics>
> = COMPARISON_ARRAY_SEMANTICS;

export function getComparisonArraySemantics(
	path: string
): TComparisonArraySemantics | undefined {
	return comparisonArraySemanticsByPath[path];
}
