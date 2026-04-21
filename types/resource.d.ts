export type CharacterType = 'Self' | 'Special' | 'Normal' | 'Unknown';

export interface CharacterPortrait {
	pid: number;
	label?: string;
	path: string;
}

export interface Request {
	tagId: number;
	request: string;
	enable: boolean;
}

export interface LikeTag {
	tagId: number;
	weight: number;
}

export interface SpawnConfig {
	izakayaId: number;
	relativeProb: number;
	onlySpawnAfterUnlocking: boolean;
	onlySpawnWhenPlaceBeRecorded: boolean;
}

export interface GuestInfo {
	fundRangeLower: number;
	fundRangeUpper: number;
	evaluation: string[];
	conversation: string[];
	foodRequests: Request[];
	bevRequests: Request[];
	hateFoodTag: number[];
	likeFoodTag: LikeTag[];
	likeBevTag: LikeTag[];
	spawn?: SpawnConfig[] | undefined;
}

export interface CharacterSpriteSet {
	name: string;
	mainSprite: string[];
	eyeSprite: string[];
}

export interface KizunaInfo {
	lv1UpgradePrerequisiteEvent?: string; // event label
	lv2UpgradePrerequisiteEvent?: string;
	lv3UpgradePrerequisiteEvent?: string;
	lv4UpgradePrerequisiteEvent?: string;

	lv1Welcome?: string[]; // dialog package names
	lv2Welcome?: string[];
	lv3Welcome?: string[];
	lv4Welcome?: string[];
	lv5Welcome?: string[];

	lv1ChatData?: string[];
	lv2ChatData?: string[];
	lv3ChatData?: string[];
	lv4ChatData?: string[];
	lv5ChatData?: string[];

	lv2InviteSucceed?: string[];
	lv2InviteFailed?: string[];
	lv3InviteSucceed?: string[];
	lv3InviteFailed?: string[];
	lv4InviteSucceed?: string[];
	lv4InviteFailed?: string[];
	lv5InviteSucceed?: string[];

	lv3RequestIngerdient?: string[]; // ignore typo
	lv4RequestIngerdient?: string[]; // ignore typo
	lv5RequestIngerdient?: string[]; // ignore typo
	lv4RequestBeverage?: string[];
	lv5RequestBeverage?: string[];
	lv5Commision?: string[];
	lv5CommisionFinish?: string[];
	commisionAreaLabel?: string; // map label for commission area
}

export interface SpawnMarker {
	mapLabel: string;
	x: number;
	y: number;
	rotation: 'Down' | 'Up' | 'Left' | 'Right';
}

export interface Spell {
	name: string;
	description: string;
	pid: number;
	overrideSpell: number;
}

export interface Buff {
	type: string;
	name: string;
	description: string;
	spritePath: string;
	spriteFallback: string;
}

export interface SpellCard {
	spellCardType: string;
	positiveSpell: Spell;
	negativeSpell: Spell;
	positiveBuff?: Buff;
	negativeBuff?: Buff;
}

export interface Character {
	id: number;
	name: string;
	label: string;
	descriptions?: string[];
	type: CharacterType;
	spawnMarker?: SpawnMarker;
	faceInNoteBook?: number | undefined;
	portraits?: CharacterPortrait[] | undefined;
	guest?: GuestInfo | undefined;
	kizuna?: KizunaInfo | undefined;
	characterSpriteSetCompact?: CharacterSpriteSet | undefined;
	spellCard?: SpellCard | undefined;
}

export type DialogActionType = 'CameraShake' | 'CG' | 'BG';

/**
 * 对话条目附加的运行时动作。
 * - CameraShake: 触发一次镜头抖动，无额外字段。
 * - CG / BG: 通过 sprite 设置一张图片，或将 shouldSet 置为 false 清空当前 CG/BG。
 *   两个字段互斥：要么提供 sprite（默认 shouldSet 视为 true），要么 shouldSet=false 表示清空。
 */
export interface DialogAction {
	actionType: DialogActionType;
	/** CG/BG 资源的相对路径，例如 "assets/CG/black.png"。 */
	sprite?: string | undefined;
	/** 显式置为 false 表示清空 CG/BG。默认/缺省视为 true。 */
	shouldSet?: boolean | undefined;
}

export interface Dialog {
	characterId: number;
	characterType: CharacterType;
	pid: number;
	position: 'Left' | 'Right';
	text: string;
	/** 可选的附加动作序列；空数组或 undefined 在导出时会被省略以兼容旧资源包。 */
	actions?: DialogAction[] | undefined;
}

export interface DialogPackage {
	name: string;
	dialogList: Dialog[];
}

export interface Ingredient {
	id: number;
	name: string;
	description: string;
	level: number;
	prefix: number;
	isFish: boolean;
	isMeat: boolean;
	isVeg: boolean;
	baseValue: number;
	tags: number[];
	spritePath: string;
}

export interface Food {
	id: number;
	name: string;
	description: string;
	level: number;
	baseValue: number;
	tags: number[];
	banTags: number[];
	spritePath: string;
}

export interface Beverage {
	id: number;
	name: string;
	description: string;
	level: number;
	baseValue: number;
	tags: number[];
	spritePath: string;
	modRoot?: string;
}

export interface PixelFullConfig {
	name: string;
	mainSprite: string[];
	eyeSprite: string[];
	hairSprite: string[];
	backSprite: string[];
}

export interface Clothes {
	id: number;
	name: string;
	description: string;
	spritePath: string;
	portraitPath: string;
	pixelFullConfig: PixelFullConfig;
	izakayaSkinIndex?: number;
	izkayaHorizontalOffset?: number;
	notebookHorizontalOffset?: number;
	notebookVerticalOffset?: number;
	izakayaSkinIndex?: number;
	izkayaHorizontalOffset?: number;
	notebookHorizontalOffset?: number;
	notebookVerticalOffset?: number;
}

export type CookerType = 'Pot' | 'Grill' | 'Fryer' | 'Steamer' | 'CuttingBoard';

export interface Recipe {
	id: number;
	foodId: number;
	ingredients: number[];
	cookTime: number;
	cookerType: CookerType;
}

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
}

export interface MissionNode {
	title: string;
	description: string;
	label: string;
	debugLabel: string;
	missionType: MissionType;
	sender: string;
	reciever: string; // ignore typo
	rewards?: MissionReward[];
	postRewards?: MissionReward[];
	finishConditions: MissionCondition[];
	missionFinishEvent?: EventData;
	postMissionsAfterPerformance?: string[];
	postEvents?: string[];
}

export interface EventNodeTrigger {
	triggerType: string;
	triggerId?: string;
}

export type EventType = 'Null' | 'Timeline' | 'Dialog';

export interface EventData {
	eventType: EventType;
	dialogPackageName?: string;
}

export interface ScheduledEvent {
	trigger?: EventNodeTrigger;
	eventData?: EventData;
}

export interface EventNode {
	label: string;
	debugLabel: string;
	scheduledEvent?: ScheduledEvent;
	rewards?: MissionReward[];
	postRewards?: MissionReward[];
	postMissionsAfterPerformance?: string[];
	postEvents?: string[];
}

export type ProductType =
	| 'Food'
	| 'Ingredient'
	| 'Beverage'
	| 'Money'
	| 'Mission'
	| 'Item'
	| 'Recipe'
	| 'Izakaya'
	| 'Cooker'
	| 'Partner'
	| 'Badge'
	| 'Trophy';

export interface ProductConfig {
	productType: ProductType;
	productId: number;
	productAmount: number;
	productLabel: string;
}

export interface MerchandiseConfig {
	item: ProductConfig;
	itemAmountMin: number;
	itemAmountMax: number;
	sellProbability: number;
}

export interface MerchantConfig {
	key: string;
	welcomeDialogPackageNames: string[];
	nullDialogPackageNames: string[];
	priceMultiplierMin: number;
	priceMultiplierMax: number;
	leastSellNum: number;
	merchandise: MerchandiseConfig[];
}

export interface PackInfo {
	name?: string;
	label?: string;
	authors?: string[];
	dependencies?: string[];
	description?: string;
	version?: string;
	license?: string;
	idRangeStart?: number | undefined;
	idRangeEnd?: number | undefined;
	idSignature?: string | undefined;
}

export interface ResourceEx {
	packInfo: PackInfo;

	characters: Character[];
	dialogPackages: DialogPackage[];
	ingredients: Ingredient[];
	foods: Food[];
	beverages?: Beverage[];
	recipes: Recipe[];
	missionNodes: MissionNode[];
	eventNodes?: EventNode[];
	merchants?: MerchantConfig[];
	clothes?: Clothes[];
}
