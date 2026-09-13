import type { EventData, EventNodeTrigger } from './event';

export type MissionType = 'Main' | 'Side' | 'Kitsuna';

export type RewardType =
	| 'UnlockNPC'
	| 'ScheduleNews'
	| 'DismissNews'
	| 'ModifyPopSystem'
	| 'ToggleResourcePoint'
	| 'SetGlobalGuestFundModifier'
	| 'SetObjectPriceModifier'
	| 'DismissEvents'
	| 'RequestNPC'
	| 'DismissNPC'
	| 'AddNPCDialog'
	| 'RemoveNPCDialog'
	| 'ToggleInteractableEntity'
	| 'UnlockMap'
	| 'SetEnableInteractablesUI'
	| 'SetIzakayaIndex'
	| 'GiveItem'
	| 'SetDaySpecialNPCVisibility'
	| 'SetNPCDialog'
	| 'UpgradeKizunaLevel'
	| 'SetCanHaveLevel5Kizuna'
	| 'GetFund'
	| 'ToggleSwitchEntity'
	| 'SetLevelCap'
	| 'CouldSpawnTewi'
	| 'TewiSpawnTonight'
	| 'AskReimuProtectYou'
	| 'AddToKourindoStaticMerchandise'
	| 'EnableMultiPartnerMode'
	| 'SetPartnerCount'
	| 'MoveToChallenge'
	| 'CancelEvent'
	| 'MoveToStaff'
	| 'EnableSpecialGuestSpawnInNight'
	| 'EnableSGuestSpawnInTargetIzakayaById'
	| 'EnableSGuestSpawnInTargetIzakayaByMap'
	| 'UnlockSGuestInNotebook'
	| 'SetTargetMissionFulfilled'
	| 'UnlockMusicGameChapter'
	| 'RemoveKourindouMerchandise'
	| 'FinishFakeMission'
	| 'ForceCompleteMission'
	| 'RefreshRandomSpawnNpc'
	| 'AddLockedRecipe'
	| 'ClearLockedRecipe'
	| 'AddEffectiveSGuestMapping'
	| 'RemoveEffectiveSGuestMapping'
	| 'FinishEvent'
	| 'StartOrContinueRogueLike'
	| 'ControlSpecialGuestScheduled'
	| 'CancelControlSpecialGuestScheduled'
	| 'IgnoreSpecialGuest'
	| 'AddDLCLock'
	| 'RemoveDLCLock'
	| 'StopAllUnmanagedMovingProcess'
	| 'NotifySpecialGuestSpawnInNight'
	| 'SetAndSavePlayerPref';

export type ConditionType =
	| 'BillRepayment'
	| 'TalkWithCharacter'
	| 'InspectInteractable'
	| 'SubmitItem'
	| 'ServeInWork'
	| 'SubmitByTag'
	| 'SubmitByTags'
	| 'SellInWork'
	| 'SubmitByIngredients'
	| 'CompleteSpecifiedFollowingTasks'
	| 'CompleteSpecifiedFollowingTasksSubCondition'
	| 'ReachTargetCharacterKisunaLevel'
	| 'FakeMission'
	| 'SubmitByAnyOneTag'
	| 'CompleteSpecifiedFollowingEvents'
	| 'SubmitByLevel';

export interface MissionCondition {
	conditionType: ConditionType;
	amount?: number;
	sellableType?: 'Food' | 'Beverage';
	label?: string;
	tag?: number;
	tags?: number[];
	productType?: string;
	productId?: number;
	productAmount?: number;
}

export type ObjectType =
	| 'Food'
	| 'Ingredient'
	| 'Beverage'
	| 'Item'
	| 'Recipe'
	| 'Izakaya'
	| 'Partner'
	| 'Badge'
	| 'Cooker';

export interface MissionReward {
	rewardType: RewardType;
	rewardId?: string;
	objectType?: ObjectType;
	rewardIntArray?: number[];
	should?: boolean;
}

export type MissionFailedAction = 'None' | 'BackToMainMenu' | 'Rewind';

export interface MissionNode {
	title: string;
	description: string;
	label: string;
	debugLabel: string;
	missionType: MissionType;
	sender: string;
	reciever: string;
	rewards?: MissionReward[];
	postRewards?: MissionReward[];
	finishConditions: MissionCondition[];
	missionFinishEvent?: EventData;
	missionFailedEvent?: EventData;
	postMissionsAfterPerformance?: string[];
	postEvents?: string[];
	isTimedMission?: boolean;
	missionFailedAction?: MissionFailedAction;
	missionTimeLimit?: EventNodeTrigger;
}
