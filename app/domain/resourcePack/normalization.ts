import type {
	Character,
	CharacterPortrait,
	CharacterSpriteSet,
	GuestInfo,
	KizunaInfo,
	LikeTag,
	Request,
	SpawnConfig,
	SpawnMarker,
	TSpawnMarkerRotation,
} from './contracts/character';
import type {
	IDayMap,
	IDayMapCell,
	IDayMapCollision,
	IDayMapHeightCell,
	IDayMapLayer,
	IDayMapObject,
	IDayMapSpawn,
	IDayMapTile,
} from './contracts/dayMap';
import type {
	Dialog,
	DialogAction,
	DialogBranchOption,
	DialogPackage,
} from './contracts/dialogue';
import type {
	DayConfig,
	EventData,
	EventNode,
	EventNodeTrigger,
	ScheduledEvent,
} from './contracts/event';
import type { IGiftConfig } from './contracts/gift';
import type {
	Beverage,
	Clothes,
	Food,
	Ingredient,
	PixelFullConfig,
	Recipe,
} from './contracts/items';
import type {
	MerchandiseConfig,
	MerchantConfig,
	ProductConfig,
} from './contracts/merchant';
import type {
	MissionCondition,
	MissionNode,
	MissionReward,
} from './contracts/mission';
import type { PackInfo, ResourceEx } from './contracts/resourceEx';
import type { IResourcePackWire } from './contracts/resourcePackWire';

const COLLECTION_KEYS = [
	'characters',
	'dialogPackages',
	'gifts',
	'dayMaps',
	'ingredients',
	'foods',
	'beverages',
	'recipes',
	'missionNodes',
	'eventNodes',
	'merchants',
	'clothes',
] as const satisfies readonly (keyof IResourcePackWire)[];

interface IUnknownRecord {
	[key: string]: unknown;
}

type TReader<T> = (value: unknown, path: string) => T;

export class ResourcePackWireError extends Error {
	readonly path: string;

	constructor(path: string, expected: string) {
		super(`${path} must be ${expected}`);
		this.name = 'ResourcePackWireError';
		this.path = path;
	}
}

function readRecord(value: unknown, path: string): IUnknownRecord {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new ResourcePackWireError(path, 'an object');
	}
	return value as IUnknownRecord;
}

function hasOwn(record: IUnknownRecord, key: string) {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function omitFields(
	record: IUnknownRecord,
	keys: readonly string[]
): IUnknownRecord {
	const remaining = { ...record };
	keys.forEach((key) => delete remaining[key]);
	return remaining;
}

function readString(value: unknown, path: string): string {
	if (typeof value !== 'string') {
		throw new ResourcePackWireError(path, 'a string');
	}
	return value;
}

function readNumber(value: unknown, path: string): number {
	if (typeof value !== 'number') {
		throw new ResourcePackWireError(path, 'a number');
	}
	return value;
}

function readBoolean(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') {
		throw new ResourcePackWireError(path, 'a boolean');
	}
	return value;
}

function readArray<T>(value: unknown, path: string, readItem: TReader<T>): T[] {
	if (!Array.isArray(value)) {
		throw new ResourcePackWireError(path, 'an array');
	}
	return value.map((item, index) => readItem(item, `${path}[${index}]`));
}

function readStringArray(value: unknown, path: string): string[] {
	return readArray(value, path, readString);
}

function readNumberArray(value: unknown, path: string): number[] {
	return readArray(value, path, readNumber);
}

function readLiteral<const T extends string>(
	value: unknown,
	path: string,
	values: readonly T[],
	expected: string
): T {
	if (typeof value !== 'string' || !values.includes(value as T)) {
		throw new ResourcePackWireError(path, expected);
	}
	return value as T;
}

function readRequired<T>(
	record: IUnknownRecord,
	key: string,
	path: string,
	reader: TReader<T>
): T {
	return reader(record[key], `${path}.${key}`);
}

function validateOptional<T>(
	record: IUnknownRecord,
	key: string,
	path: string,
	reader: TReader<T>,
	isExplicitUndefinedAllowed = false
): void {
	if (!hasOwn(record, key)) return;
	const value = record[key];
	if (value === undefined && isExplicitUndefinedAllowed) return;
	reader(value, `${path}.${key}`);
}

function readOptionalValue<T>(
	record: IUnknownRecord,
	key: string,
	path: string,
	reader: TReader<T>,
	isExplicitUndefinedAllowed = false
): T | undefined {
	validateOptional(record, key, path, reader, isExplicitUndefinedAllowed);
	const value = record[key];
	if (value === undefined) return undefined;
	return reader(value, `${path}.${key}`);
}

function readOptionalProperty<K extends string, T>(
	record: IUnknownRecord,
	key: K,
	path: string,
	reader: TReader<T>
): Partial<Record<K, T>> {
	validateOptional(record, key, path, reader);
	if (!hasOwn(record, key)) return {};
	return { [key]: reader(record[key], `${path}.${key}`) } as Record<K, T>;
}

function readEntity(value: unknown, path: string): IUnknownRecord {
	return readRecord(value, path);
}

function readPackInfo(value: unknown, path: string): PackInfo {
	const record = readRecord(value, path);
	validateOptional(record, 'name', path, readString);
	validateOptional(record, 'label', path, readString);
	validateOptional(record, 'authors', path, readStringArray);
	validateOptional(record, 'dependencies', path, readStringArray);
	validateOptional(record, 'description', path, readString);
	validateOptional(record, 'version', path, readString);
	validateOptional(record, 'idRangeStart', path, readNumber, true);
	validateOptional(record, 'idRangeEnd', path, readNumber, true);
	validateOptional(record, 'idSignature', path, readString, true);
	const packInfo = omitFields(record, ['license']);
	return {
		...packInfo,
		...readOptionalProperty(record, 'name', path, readString),
	};
}

function readCharacterPortrait(
	value: unknown,
	path: string
): CharacterPortrait {
	const record = readEntity(value, path);
	readRequired(record, 'pid', path, readNumber);
	validateOptional(record, 'label', path, readString);
	readRequired(record, 'path', path, readString);
	return {
		...record,
		pid: readRequired(record, 'pid', path, readNumber),
		path: readRequired(record, 'path', path, readString),
	};
}

function readRequest(
	value: unknown,
	path: string,
	isEnabledByDefault: boolean
): Request {
	const record = readEntity(value, path);
	readRequired(record, 'tagId', path, readNumber);
	readRequired(record, 'request', path, readString);
	validateOptional(record, 'enable', path, readBoolean, true);
	return {
		...record,
		tagId: readRequired(record, 'tagId', path, readNumber),
		request: readRequired(record, 'request', path, readString),
		enable:
			record['enable'] === undefined
				? isEnabledByDefault
				: readBoolean(record['enable'], `${path}.enable`),
	};
}

function readLikeTag(value: unknown, path: string): LikeTag {
	const record = readEntity(value, path);
	readRequired(record, 'tagId', path, readNumber);
	readRequired(record, 'weight', path, readNumber);
	return {
		...record,
		tagId: readRequired(record, 'tagId', path, readNumber),
		weight: readRequired(record, 'weight', path, readNumber),
	};
}

function readSpawnConfig(value: unknown, path: string): SpawnConfig {
	const record = readEntity(value, path);
	readRequired(record, 'izakayaId', path, readNumber);
	readRequired(record, 'relativeProb', path, readNumber);
	readRequired(record, 'onlySpawnAfterUnlocking', path, readBoolean);
	readRequired(record, 'onlySpawnWhenPlaceBeRecorded', path, readBoolean);
	return {
		...record,
		izakayaId: readRequired(record, 'izakayaId', path, readNumber),
		relativeProb: readRequired(record, 'relativeProb', path, readNumber),
		onlySpawnAfterUnlocking: readRequired(
			record,
			'onlySpawnAfterUnlocking',
			path,
			readBoolean
		),
		onlySpawnWhenPlaceBeRecorded: readRequired(
			record,
			'onlySpawnWhenPlaceBeRecorded',
			path,
			readBoolean
		),
	};
}

function readGuestInfo(value: unknown, path: string): GuestInfo {
	const record = readEntity(value, path);
	readRequired(record, 'fundRangeLower', path, readNumber);
	readRequired(record, 'fundRangeUpper', path, readNumber);
	validateOptional(record, 'evaluation', path, readStringArray);
	readRequired(record, 'conversation', path, readStringArray);
	validateOptional(record, 'foodRequests', path, (requests, childPath) =>
		readArray(requests, childPath, (request, requestPath) =>
			readRequest(request, requestPath, true)
		)
	);
	validateOptional(record, 'bevRequests', path, (requests, childPath) =>
		readArray(requests, childPath, (request, requestPath) =>
			readRequest(request, requestPath, false)
		)
	);
	validateOptional(record, 'hateFoodTag', path, readNumberArray);
	validateOptional(record, 'likeFoodTag', path, (tags, childPath) =>
		readArray(tags, childPath, readLikeTag)
	);
	validateOptional(record, 'likeBevTag', path, (tags, childPath) =>
		readArray(tags, childPath, readLikeTag)
	);
	validateOptional(
		record,
		'spawn',
		path,
		(spawn, childPath) => readArray(spawn, childPath, readSpawnConfig),
		true
	);
	return {
		...record,
		fundRangeLower: readRequired(
			record,
			'fundRangeLower',
			path,
			readNumber
		),
		fundRangeUpper: readRequired(
			record,
			'fundRangeUpper',
			path,
			readNumber
		),
		evaluation:
			readOptionalValue(record, 'evaluation', path, readStringArray) ??
			[],
		conversation: readRequired(
			record,
			'conversation',
			path,
			readStringArray
		),
		foodRequests:
			readOptionalValue(
				record,
				'foodRequests',
				path,
				(requests, childPath) =>
					readArray(requests, childPath, (request, requestPath) =>
						readRequest(request, requestPath, true)
					)
			) ?? [],
		bevRequests:
			readOptionalValue(
				record,
				'bevRequests',
				path,
				(requests, childPath) =>
					readArray(requests, childPath, (request, requestPath) =>
						readRequest(request, requestPath, false)
					)
			) ?? [],
		hateFoodTag:
			readOptionalValue(record, 'hateFoodTag', path, readNumberArray) ??
			[],
		likeFoodTag:
			readOptionalValue(record, 'likeFoodTag', path, (tags, childPath) =>
				readArray(tags, childPath, readLikeTag)
			) ?? [],
		likeBevTag:
			readOptionalValue(record, 'likeBevTag', path, (tags, childPath) =>
				readArray(tags, childPath, readLikeTag)
			) ?? [],
		spawn:
			readOptionalValue(
				record,
				'spawn',
				path,
				(spawn, childPath) =>
					readArray(spawn, childPath, readSpawnConfig),
				true
			) ?? [],
	};
}

function readCharacterSpriteSet(
	value: unknown,
	path: string
): CharacterSpriteSet {
	const record = readEntity(value, path);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'mainSprite', path, readStringArray);
	readRequired(record, 'eyeSprite', path, readStringArray);
	return {
		...record,
		name: readRequired(record, 'name', path, readString),
		mainSprite: readRequired(record, 'mainSprite', path, readStringArray),
		eyeSprite: readRequired(record, 'eyeSprite', path, readStringArray),
	};
}

function readKizunaInfo(value: unknown, path: string): KizunaInfo {
	const record = readEntity(value, path);
	for (const key of [
		'lv1UpgradePrerequisiteEvent',
		'lv2UpgradePrerequisiteEvent',
		'lv3UpgradePrerequisiteEvent',
		'lv4UpgradePrerequisiteEvent',
		'commisionAreaLabel',
	]) {
		validateOptional(record, key, path, readString);
	}
	for (const key of [
		'lv1Welcome',
		'lv2Welcome',
		'lv3Welcome',
		'lv4Welcome',
		'lv5Welcome',
		'lv1ChatData',
		'lv2ChatData',
		'lv3ChatData',
		'lv4ChatData',
		'lv5ChatData',
		'lv2InviteSucceed',
		'lv2InviteFailed',
		'lv3InviteSucceed',
		'lv3InviteFailed',
		'lv4InviteSucceed',
		'lv4InviteFailed',
		'lv5InviteSucceed',
		'lv3RequestIngerdient',
		'lv4RequestIngerdient',
		'lv5RequestIngerdient',
		'lv4RequestBeverage',
		'lv5RequestBeverage',
		'lv5Commision',
		'lv5CommisionFinish',
	]) {
		validateOptional(record, key, path, readStringArray);
	}
	return {
		...record,
		...readOptionalProperty(record, 'commisionAreaLabel', path, readString),
	};
}

function readSpawnMarkerRotation(
	value: unknown,
	path: string
): TSpawnMarkerRotation {
	return readLiteral(
		value,
		path,
		['Down', 'Up', 'Left', 'Right'],
		'a supported rotation'
	);
}

function readSpawnMarker(value: unknown, path: string): SpawnMarker {
	const record = readEntity(value, path);
	readRequired(record, 'mapLabel', path, readString);
	readRequired(record, 'x', path, readNumber);
	readRequired(record, 'y', path, readNumber);
	validateOptional(record, 'rotation', path, readSpawnMarkerRotation);
	return {
		...record,
		mapLabel: readRequired(record, 'mapLabel', path, readString),
		x: readRequired(record, 'x', path, readNumber),
		y: readRequired(record, 'y', path, readNumber),
		...(hasOwn(record, 'rotation')
			? {
					rotation: readSpawnMarkerRotation(
						record['rotation'],
						`${path}.rotation`
					),
				}
			: {}),
	};
}

function readCharacter(value: unknown, path: string): Character {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'label', path, readString);
	readLiteral(
		record['type'],
		`${path}.type`,
		['Self', 'Special', 'Normal', 'Unknown'],
		'a supported character type'
	);
	validateOptional(record, 'descriptions', path, readStringArray);
	validateOptional(record, 'spawnMarker', path, readSpawnMarker);
	validateOptional(record, 'faceInNoteBook', path, readNumber, true);
	validateOptional(
		record,
		'portraits',
		path,
		(portraits, childPath) =>
			readArray(portraits, childPath, readCharacterPortrait),
		true
	);
	validateOptional(record, 'guest', path, readGuestInfo, true);
	validateOptional(record, 'kizuna', path, readKizunaInfo, true);
	validateOptional(
		record,
		'characterSpriteSetCompact',
		path,
		readCharacterSpriteSet,
		true
	);
	validateOptional(record, 'hideInAlbum', path, readBoolean);
	validateOptional(record, 'isParticular', path, readBoolean);
	validateOptional(record, 'isCollabCharacter', path, readBoolean);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		name: readRequired(record, 'name', path, readString),
		label: readRequired(record, 'label', path, readString),
		...readOptionalProperty(record, 'spawnMarker', path, readSpawnMarker),
		...(hasOwn(record, 'guest')
			? {
					guest: readOptionalValue(
						record,
						'guest',
						path,
						readGuestInfo,
						true
					),
				}
			: {}),
		type: readLiteral(
			record['type'],
			`${path}.type`,
			['Self', 'Special', 'Normal', 'Unknown'],
			'a supported character type'
		),
	};
}

function readIngredient(value: unknown, path: string): Ingredient {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'description', path, readString);
	readRequired(record, 'level', path, readNumber);
	readRequired(record, 'prefix', path, readNumber);
	readRequired(record, 'isFish', path, readBoolean);
	readRequired(record, 'isMeat', path, readBoolean);
	readRequired(record, 'isVeg', path, readBoolean);
	readRequired(record, 'baseValue', path, readNumber);
	readRequired(record, 'tags', path, readNumberArray);
	readRequired(record, 'spritePath', path, readString);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		name: readRequired(record, 'name', path, readString),
		description: readRequired(record, 'description', path, readString),
		level: readRequired(record, 'level', path, readNumber),
		prefix: readRequired(record, 'prefix', path, readNumber),
		isFish: readRequired(record, 'isFish', path, readBoolean),
		isMeat: readRequired(record, 'isMeat', path, readBoolean),
		isVeg: readRequired(record, 'isVeg', path, readBoolean),
		baseValue: readRequired(record, 'baseValue', path, readNumber),
		tags: readRequired(record, 'tags', path, readNumberArray),
		spritePath: readRequired(record, 'spritePath', path, readString),
	};
}

function readFood(value: unknown, path: string): Food {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'description', path, readString);
	readRequired(record, 'level', path, readNumber);
	readRequired(record, 'baseValue', path, readNumber);
	validateOptional(record, 'tags', path, readNumberArray);
	validateOptional(record, 'banTags', path, readNumberArray);
	readRequired(record, 'spritePath', path, readString);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		name: readRequired(record, 'name', path, readString),
		description: readRequired(record, 'description', path, readString),
		level: readRequired(record, 'level', path, readNumber),
		baseValue: readRequired(record, 'baseValue', path, readNumber),
		tags: readOptionalValue(record, 'tags', path, readNumberArray) ?? [],
		banTags:
			readOptionalValue(record, 'banTags', path, readNumberArray) ?? [],
		spritePath: readRequired(record, 'spritePath', path, readString),
	};
}

function readBeverage(value: unknown, path: string): Beverage {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'description', path, readString);
	readRequired(record, 'level', path, readNumber);
	readRequired(record, 'baseValue', path, readNumber);
	validateOptional(record, 'tags', path, readNumberArray);
	readRequired(record, 'spritePath', path, readString);
	validateOptional(record, 'modRoot', path, readString);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		name: readRequired(record, 'name', path, readString),
		description: readRequired(record, 'description', path, readString),
		level: readRequired(record, 'level', path, readNumber),
		baseValue: readRequired(record, 'baseValue', path, readNumber),
		tags: readOptionalValue(record, 'tags', path, readNumberArray) ?? [],
		spritePath: readRequired(record, 'spritePath', path, readString),
	};
}

function readRecipe(value: unknown, path: string): Recipe {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'foodId', path, readNumber);
	readRequired(record, 'ingredients', path, readNumberArray);
	readRequired(record, 'cookTime', path, readNumber);
	readLiteral(
		record['cookerType'],
		`${path}.cookerType`,
		['Pot', 'Grill', 'Fryer', 'Steamer', 'CuttingBoard'],
		'a supported cooker type'
	);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		foodId: readRequired(record, 'foodId', path, readNumber),
		ingredients: readRequired(record, 'ingredients', path, readNumberArray),
		cookTime: readRequired(record, 'cookTime', path, readNumber),
		cookerType: readLiteral(
			record['cookerType'],
			`${path}.cookerType`,
			['Pot', 'Grill', 'Fryer', 'Steamer', 'CuttingBoard'],
			'a supported cooker type'
		),
	};
}

function readPixelFullConfig(value: unknown, path: string): PixelFullConfig {
	const record = readEntity(value, path);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'mainSprite', path, readStringArray);
	readRequired(record, 'eyeSprite', path, readStringArray);
	readRequired(record, 'hairSprite', path, readStringArray);
	readRequired(record, 'backSprite', path, readStringArray);
	return {
		...record,
		name: readRequired(record, 'name', path, readString),
		mainSprite: readRequired(record, 'mainSprite', path, readStringArray),
		eyeSprite: readRequired(record, 'eyeSprite', path, readStringArray),
		hairSprite: readRequired(record, 'hairSprite', path, readStringArray),
		backSprite: readRequired(record, 'backSprite', path, readStringArray),
	};
}

function readClothes(value: unknown, path: string, packLabel: string): Clothes {
	const record = readEntity(value, path);
	readRequired(record, 'id', path, readNumber);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'description', path, readString);
	readRequired(record, 'spritePath', path, readString);
	readRequired(record, 'portraitPath', path, readString);
	validateOptional(record, 'pixelFullConfig', path, readPixelFullConfig);
	for (const key of [
		'izakayaSkinIndex',
		'izkayaHorizontalOffset',
		'notebookHorizontalOffset',
		'notebookVerticalOffset',
		'notebookUITitleHorizontalOffset',
		'notebookUITitleVerticalOffset',
	]) {
		validateOptional(record, key, path, readNumber);
	}
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		name: readRequired(record, 'name', path, readString),
		description: readRequired(record, 'description', path, readString),
		spritePath: readRequired(record, 'spritePath', path, readString),
		portraitPath: readRequired(record, 'portraitPath', path, readString),
		pixelFullConfig:
			record['pixelFullConfig'] === undefined
				? createPixelFullConfig(record['id'], packLabel)
				: readPixelFullConfig(
						record['pixelFullConfig'],
						`${path}.pixelFullConfig`
					),
	};
}

function readDialogBranchOption(
	value: unknown,
	path: string
): DialogBranchOption {
	const record = readEntity(value, path);
	readRequired(record, 'text', path, readString);
	validateOptional(record, 'jump', path, readNumber, true);
	validateOptional(record, 'price', path, readNumber, true);
	return { ...record, text: readRequired(record, 'text', path, readString) };
}

function readDialogAction(value: unknown, path: string): DialogAction {
	const record = readEntity(value, path);
	readLiteral(
		record['actionType'],
		`${path}.actionType`,
		['CameraShake', 'CG', 'BG', 'Sound', 'Branch', 'Goto', 'End'],
		'a supported dialog action type'
	);
	validateOptional(record, 'sprite', path, readString, true);
	validateOptional(record, 'shouldSet', path, readBoolean, true);
	validateOptional(record, 'sound', path, readString, true);
	validateOptional(
		record,
		'options',
		path,
		(value, childPath) =>
			readArray(value, childPath, readDialogBranchOption),
		true
	);
	validateOptional(record, 'index', path, readNumber, true);
	validateOptional(record, 'exitCode', path, readNumber, true);
	return {
		...record,
		actionType: readLiteral(
			record['actionType'],
			`${path}.actionType`,
			['CameraShake', 'CG', 'BG', 'Sound', 'Branch', 'Goto', 'End'],
			'a supported dialog action type'
		),
	};
}

function readDialog(value: unknown, path: string): Dialog {
	const record = readEntity(value, path);
	readRequired(record, 'characterId', path, readNumber);
	readLiteral(
		record['characterType'],
		`${path}.characterType`,
		['Self', 'Special', 'Normal', 'Unknown'],
		'a supported character type'
	);
	readRequired(record, 'pid', path, readNumber);
	readLiteral(
		record['position'],
		`${path}.position`,
		['Left', 'Right'],
		'Left or Right'
	);
	readRequired(record, 'text', path, readString);
	validateOptional(
		record,
		'actions',
		path,
		(value, childPath) => readArray(value, childPath, readDialogAction),
		true
	);
	return {
		...record,
		characterId: readRequired(record, 'characterId', path, readNumber),
		characterType: readLiteral(
			record['characterType'],
			`${path}.characterType`,
			['Self', 'Special', 'Normal', 'Unknown'],
			'a supported character type'
		),
		pid: readRequired(record, 'pid', path, readNumber),
		position: readLiteral(
			record['position'],
			`${path}.position`,
			['Left', 'Right'],
			'Left or Right'
		),
		text: readRequired(record, 'text', path, readString),
	};
}

function readDialogPackage(value: unknown, path: string): DialogPackage {
	const record = readEntity(value, path);
	readRequired(record, 'name', path, readString);
	readRequired(record, 'dialogList', path, (dialogs, childPath) =>
		readArray(dialogs, childPath, readDialog)
	);
	return {
		...record,
		name: readRequired(record, 'name', path, readString),
		dialogList: readRequired(
			record,
			'dialogList',
			path,
			(dialogs, childPath) => readArray(dialogs, childPath, readDialog)
		),
	};
}

function readProductConfig(value: unknown, path: string): ProductConfig {
	const record = readEntity(value, path);
	readLiteral(
		record['productType'],
		`${path}.productType`,
		[
			'Food',
			'Ingredient',
			'Beverage',
			'Money',
			'Mission',
			'Item',
			'Recipe',
			'Izakaya',
			'Cooker',
			'Partner',
			'Badge',
			'Trophy',
		],
		'a supported product type'
	);
	readRequired(record, 'productId', path, readNumber);
	readRequired(record, 'productAmount', path, readNumber);
	readRequired(record, 'productLabel', path, readString);
	return {
		...record,
		productType: readLiteral(
			record['productType'],
			`${path}.productType`,
			[
				'Food',
				'Ingredient',
				'Beverage',
				'Money',
				'Mission',
				'Item',
				'Recipe',
				'Izakaya',
				'Cooker',
				'Partner',
				'Badge',
				'Trophy',
			],
			'a supported product type'
		),
		productId: readRequired(record, 'productId', path, readNumber),
		productAmount: readRequired(record, 'productAmount', path, readNumber),
		productLabel: readRequired(record, 'productLabel', path, readString),
	};
}

function readMerchandiseConfig(
	value: unknown,
	path: string
): MerchandiseConfig {
	const record = readEntity(value, path);
	readRequired(record, 'item', path, readProductConfig);
	readRequired(record, 'itemAmountMin', path, readNumber);
	readRequired(record, 'itemAmountMax', path, readNumber);
	readRequired(record, 'sellProbability', path, readNumber);
	return {
		...record,
		item: readRequired(record, 'item', path, readProductConfig),
		itemAmountMin: readRequired(record, 'itemAmountMin', path, readNumber),
		itemAmountMax: readRequired(record, 'itemAmountMax', path, readNumber),
		sellProbability: readRequired(
			record,
			'sellProbability',
			path,
			readNumber
		),
	};
}

function readMerchantConfig(value: unknown, path: string): MerchantConfig {
	const record = readEntity(value, path);
	readRequired(record, 'key', path, readString);
	readRequired(record, 'welcomeDialogPackageNames', path, readStringArray);
	readRequired(record, 'nullDialogPackageNames', path, readStringArray);
	readRequired(record, 'priceMultiplierMin', path, readNumber);
	readRequired(record, 'priceMultiplierMax', path, readNumber);
	readRequired(record, 'leastSellNum', path, readNumber);
	readRequired(record, 'merchandise', path, (items, childPath) =>
		readArray(items, childPath, readMerchandiseConfig)
	);
	return {
		...record,
		key: readRequired(record, 'key', path, readString),
		welcomeDialogPackageNames: readRequired(
			record,
			'welcomeDialogPackageNames',
			path,
			readStringArray
		),
		nullDialogPackageNames: readRequired(
			record,
			'nullDialogPackageNames',
			path,
			readStringArray
		),
		priceMultiplierMin: readRequired(
			record,
			'priceMultiplierMin',
			path,
			readNumber
		),
		priceMultiplierMax: readRequired(
			record,
			'priceMultiplierMax',
			path,
			readNumber
		),
		leastSellNum: readRequired(record, 'leastSellNum', path, readNumber),
		merchandise: readRequired(
			record,
			'merchandise',
			path,
			(items, childPath) =>
				readArray(items, childPath, readMerchandiseConfig)
		),
	};
}

function readDayConfig(value: unknown, path: string): DayConfig {
	const record = readEntity(value, path);
	const dayType = readLiteral(
		record['dayType'],
		`${path}.dayType`,
		['Relative', 'Absolute'],
		'Relative or Absolute'
	);
	const dayCalcType = readLiteral(
		record['dayCalcType'],
		`${path}.dayCalcType`,
		['Constant', 'Random'],
		'Constant or Random'
	);
	validateOptional(record, 'day', path, readNumber);
	validateOptional(record, 'dayRangeMin', path, readNumber);
	validateOptional(record, 'dayRangeMax', path, readNumber);
	return { ...record, dayCalcType, dayType };
}

function readEventNodeTrigger(value: unknown, path: string): EventNodeTrigger {
	const record = readEntity(value, path);
	const triggerType = readRequired(record, 'triggerType', path, readString);
	validateOptional(record, 'triggerId', path, readString);
	validateOptional(record, 'time', path, readDayConfig);
	validateOptional(record, 'labels', path, readStringArray);
	validateOptional(record, 'executeOrder', path, readNumber);
	return { ...record, triggerType };
}

function readEventData(value: unknown, path: string): EventData {
	const record = readEntity(value, path);
	const eventType = readLiteral(
		record['eventType'],
		`${path}.eventType`,
		['Null', 'Timeline', 'Dialog'],
		'a supported event type'
	);
	validateOptional(record, 'dialogPackageName', path, readString);
	return { ...record, eventType };
}

function readScheduledEvent(value: unknown, path: string): ScheduledEvent {
	const record = readEntity(value, path);
	validateOptional(record, 'trigger', path, readEventNodeTrigger);
	validateOptional(record, 'eventData', path, readEventData);
	return {
		...record,
		...(readOptionalValue(record, 'trigger', path, readEventNodeTrigger) ===
		undefined
			? {}
			: {
					trigger: readEventNodeTrigger(
						record['trigger'],
						`${path}.trigger`
					),
				}),
		...(readOptionalValue(record, 'eventData', path, readEventData) ===
		undefined
			? {}
			: {
					eventData: readEventData(
						record['eventData'],
						`${path}.eventData`
					),
				}),
	};
}

function readMissionCondition(value: unknown, path: string): MissionCondition {
	const record = readEntity(value, path);
	const conditionType = readLiteral(
		record['conditionType'],
		`${path}.conditionType`,
		[
			'BillRepayment',
			'TalkWithCharacter',
			'InspectInteractable',
			'SubmitItem',
			'ServeInWork',
			'SubmitByTag',
			'SubmitByTags',
			'SellInWork',
			'SubmitByIngredients',
			'CompleteSpecifiedFollowingTasks',
			'CompleteSpecifiedFollowingTasksSubCondition',
			'ReachTargetCharacterKisunaLevel',
			'FakeMission',
			'SubmitByAnyOneTag',
			'CompleteSpecifiedFollowingEvents',
			'SubmitByLevel',
		],
		'a supported mission condition type'
	);
	validateOptional(record, 'amount', path, readNumber);
	validateOptional(record, 'sellableType', path, (item, childPath) =>
		readLiteral(item, childPath, ['Food', 'Beverage'], 'Food or Beverage')
	);
	validateOptional(record, 'label', path, readString);
	validateOptional(record, 'tag', path, readNumber);
	validateOptional(record, 'tags', path, readNumberArray);
	validateOptional(record, 'productType', path, readString);
	validateOptional(record, 'productId', path, readNumber);
	validateOptional(record, 'productAmount', path, readNumber);
	return { ...record, conditionType };
}

function readMissionReward(value: unknown, path: string): MissionReward {
	const record = readEntity(value, path);
	const rewardType = readLiteral(
		record['rewardType'],
		`${path}.rewardType`,
		[
			'UnlockNPC',
			'ScheduleNews',
			'DismissNews',
			'ModifyPopSystem',
			'ToggleResourcePoint',
			'SetGlobalGuestFundModifier',
			'SetObjectPriceModifier',
			'DismissEvents',
			'RequestNPC',
			'DismissNPC',
			'AddNPCDialog',
			'RemoveNPCDialog',
			'ToggleInteractableEntity',
			'UnlockMap',
			'SetEnableInteractablesUI',
			'SetIzakayaIndex',
			'GiveItem',
			'SetDaySpecialNPCVisibility',
			'SetNPCDialog',
			'UpgradeKizunaLevel',
			'SetCanHaveLevel5Kizuna',
			'GetFund',
			'ToggleSwitchEntity',
			'SetLevelCap',
			'CouldSpawnTewi',
			'TewiSpawnTonight',
			'AskReimuProtectYou',
			'AddToKourindoStaticMerchandise',
			'EnableMultiPartnerMode',
			'SetPartnerCount',
			'MoveToChallenge',
			'CancelEvent',
			'MoveToStaff',
			'EnableSpecialGuestSpawnInNight',
			'EnableSGuestSpawnInTargetIzakayaById',
			'EnableSGuestSpawnInTargetIzakayaByMap',
			'UnlockSGuestInNotebook',
			'SetTargetMissionFulfilled',
			'UnlockMusicGameChapter',
			'RemoveKourindouMerchandise',
			'FinishFakeMission',
			'ForceCompleteMission',
			'RefreshRandomSpawnNpc',
			'AddLockedRecipe',
			'ClearLockedRecipe',
			'AddEffectiveSGuestMapping',
			'RemoveEffectiveSGuestMapping',
			'FinishEvent',
			'StartOrContinueRogueLike',
			'ControlSpecialGuestScheduled',
			'CancelControlSpecialGuestScheduled',
			'IgnoreSpecialGuest',
			'AddDLCLock',
			'RemoveDLCLock',
			'StopAllUnmanagedMovingProcess',
			'NotifySpecialGuestSpawnInNight',
			'SetAndSavePlayerPref',
		],
		'a supported mission reward type'
	);
	validateOptional(record, 'rewardId', path, readString);
	validateOptional(record, 'objectType', path, (item, childPath) =>
		readLiteral(
			item,
			childPath,
			[
				'Food',
				'Ingredient',
				'Beverage',
				'Item',
				'Recipe',
				'Izakaya',
				'Partner',
				'Badge',
				'Cooker',
			],
			'a supported reward object type'
		)
	);
	validateOptional(record, 'rewardIntArray', path, readNumberArray);
	return { ...record, rewardType };
}

function readMissionNode(value: unknown, path: string): MissionNode {
	const record = readEntity(value, path);
	validateOptional(record, 'name', path, readString);
	validateOptional(record, 'title', path, readString);
	validateOptional(record, 'description', path, readString);
	validateOptional(record, 'label', path, readString);
	const debugLabel = readRequired(record, 'debugLabel', path, readString);
	const missionType = readLiteral(
		record['missionType'],
		`${path}.missionType`,
		['Main', 'Side', 'Kitsuna'],
		'a supported mission type'
	);
	validateOptional(record, 'sender', path, readString);
	validateOptional(record, 'reciever', path, readString);
	validateOptional(record, 'receiver', path, readString);
	validateOptional(record, 'rewards', path, (items, childPath) =>
		readArray(items, childPath, readMissionReward)
	);
	validateOptional(record, 'postRewards', path, (items, childPath) =>
		readArray(items, childPath, readMissionReward)
	);
	validateOptional(record, 'finishConditions', path, (items, childPath) =>
		readArray(items, childPath, readMissionCondition)
	);
	validateOptional(record, 'missionFinishEvent', path, readEventData);
	validateOptional(record, 'missionFailedEvent', path, readEventData);
	validateOptional(
		record,
		'postMissionsAfterPerformance',
		path,
		readStringArray
	);
	validateOptional(record, 'postEvents', path, readStringArray);
	validateOptional(record, 'isTimedMission', path, readBoolean);
	validateOptional(record, 'missionFailedAction', path, (item, childPath) =>
		readLiteral(
			item,
			childPath,
			['None', 'BackToMainMenu', 'Rewind'],
			'a supported mission failed action'
		)
	);
	validateOptional(record, 'missionTimeLimit', path, readEventNodeTrigger);

	const legacyName = readOptionalValue(record, 'name', path, readString);
	const title =
		readOptionalValue(record, 'title', path, readString) ??
		legacyName ??
		'';
	const { name: ignoredName, ...rest } = record;
	void ignoredName;
	return {
		...rest,
		title,
		debugLabel,
		missionType,
		rewards:
			readOptionalValue(record, 'rewards', path, (items, childPath) =>
				readArray(items, childPath, readMissionReward)
			) ?? [],
		finishConditions:
			readOptionalValue(
				record,
				'finishConditions',
				path,
				(items, childPath) =>
					readArray(items, childPath, readMissionCondition)
			) ?? [],
		postMissionsAfterPerformance:
			readOptionalValue(
				record,
				'postMissionsAfterPerformance',
				path,
				readStringArray
			) ?? [],
		postEvents:
			readOptionalValue(record, 'postEvents', path, readStringArray) ??
			[],
		label: readOptionalValue(record, 'label', path, readString) ?? title,
		description:
			readOptionalValue(record, 'description', path, readString) ?? '',
		sender: readOptionalValue(record, 'sender', path, readString) ?? '',
		reciever:
			readOptionalValue(record, 'reciever', path, readString) ??
			readOptionalValue(record, 'receiver', path, readString) ??
			'',
	};
}

function readEventNode(value: unknown, path: string): EventNode {
	const record = readEntity(value, path);
	validateOptional(record, 'label', path, readString);
	validateOptional(record, 'debugLabel', path, readString);
	validateOptional(record, 'scheduledEvent', path, readScheduledEvent);
	validateOptional(record, 'trigger', path, readEventNodeTrigger);
	validateOptional(record, 'eventData', path, readEventData);
	validateOptional(record, 'rewards', path, (items, childPath) =>
		readArray(items, childPath, readMissionReward)
	);
	validateOptional(record, 'postRewards', path, (items, childPath) =>
		readArray(items, childPath, readMissionReward)
	);
	validateOptional(
		record,
		'postMissionsAfterPerformance',
		path,
		readStringArray
	);
	validateOptional(record, 'postEvents', path, readStringArray);

	const scheduledEvent = readOptionalValue(
		record,
		'scheduledEvent',
		path,
		readScheduledEvent
	) ?? {
		...(readOptionalValue(record, 'trigger', path, readEventNodeTrigger) ===
		undefined
			? {}
			: {
					trigger: readEventNodeTrigger(
						record['trigger'],
						`${path}.trigger`
					),
				}),
		...(readOptionalValue(record, 'eventData', path, readEventData) ===
		undefined
			? {}
			: {
					eventData: readEventData(
						record['eventData'],
						`${path}.eventData`
					),
				}),
	};
	const extraFields = omitFields(record, [
		'label',
		'debugLabel',
		'scheduledEvent',
		'trigger',
		'eventData',
		'rewards',
		'postRewards',
		'postMissionsAfterPerformance',
		'postEvents',
	]);

	return {
		...extraFields,
		label: readOptionalValue(record, 'label', path, readString) ?? '',
		debugLabel:
			readOptionalValue(record, 'debugLabel', path, readString) ?? '',
		scheduledEvent,
		rewards:
			readOptionalValue(record, 'rewards', path, (items, childPath) =>
				readArray(items, childPath, readMissionReward)
			) ?? [],
		postRewards:
			readOptionalValue(record, 'postRewards', path, (items, childPath) =>
				readArray(items, childPath, readMissionReward)
			) ?? [],
		postMissionsAfterPerformance:
			readOptionalValue(
				record,
				'postMissionsAfterPerformance',
				path,
				readStringArray
			) ?? [],
		postEvents:
			readOptionalValue(record, 'postEvents', path, readStringArray) ??
			[],
	};
}

function readCollection(
	record: IUnknownRecord,
	key: (typeof COLLECTION_KEYS)[number]
): unknown[] {
	const value = record[key];
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		throw new ResourcePackWireError(key, 'an array or null');
	}
	return value;
}

function readGift(value: unknown, path: string): IGiftConfig {
	const record = value === null ? {} : readRecord(value, path);
	return {
		...record,
		...readOptionalProperty(record, 'itemId', path, (itemId, itemPath) =>
			itemId === null ? null : readNumber(itemId, itemPath)
		),
		allowRepeat:
			readOptionalValue(record, 'allowRepeat', path, readBoolean) ??
			false,
		title:
			readOptionalValue(record, 'title', path, (title, titlePath) =>
				title === null ? '' : readString(title, titlePath)
			) ?? '',
		dialogPackageName:
			readOptionalValue(
				record,
				'dialogPackageName',
				path,
				(name, namePath) =>
					name === null ? '' : readString(name, namePath)
			) ?? '',
	};
}

function readDayMapTile(value: unknown, path: string): IDayMapTile {
	const record = readRecord(value, path);
	return {
		...record,
		key: readRequired(record, 'key', path, readString),
		image: readRequired(record, 'image', path, readString),
		rect: readOptionalValue(record, 'rect', path, readNumberArray) ?? [],
		pivot: readOptionalValue(record, 'pivot', path, readNumberArray) ?? [
			0, 0,
		],
		pixelsPerUnit:
			readOptionalValue(record, 'pixelsPerUnit', path, readNumber) ?? 48,
	};
}

function readDayMapCell(value: unknown, path: string): IDayMapCell {
	const record = readRecord(value, path);
	return {
		...record,
		x: readOptionalValue(record, 'x', path, readNumber) ?? 0,
		y: readOptionalValue(record, 'y', path, readNumber) ?? 0,
		tile: readRequired(record, 'tile', path, readString),
	};
}

function readDayMapHeightCell(value: unknown, path: string): IDayMapHeightCell {
	const record = readRecord(value, path);
	return {
		...record,
		x: readOptionalValue(record, 'x', path, readNumber) ?? 0,
		y: readOptionalValue(record, 'y', path, readNumber) ?? 0,
		slope: readOptionalValue(record, 'slope', path, readNumber) ?? 0,
	};
}

function readDayMapLayer(value: unknown, path: string): IDayMapLayer {
	const record = readRecord(value, path);
	return {
		...record,
		name: readOptionalValue(record, 'name', path, readString) ?? '',
		sortingLayer:
			readOptionalValue(record, 'sortingLayer', path, readString) ??
			'Background',
		sortingOrder:
			readOptionalValue(record, 'sortingOrder', path, readNumber) ??
			-2000,
		cells:
			readOptionalValue(record, 'cells', path, (value, path) =>
				readArray(value, path, readDayMapCell)
			) ?? [],
	};
}

function readDayMapObject(value: unknown, path: string): IDayMapObject {
	const record = readRecord(value, path);
	return {
		...record,
		name: readOptionalValue(record, 'name', path, readString) ?? '',
		tile: readRequired(record, 'tile', path, readString),
		x: readOptionalValue(record, 'x', path, readNumber) ?? 0,
		y: readOptionalValue(record, 'y', path, readNumber) ?? 0,
		scale: readOptionalValue(record, 'scale', path, readNumberArray) ?? [
			1, 1,
		],
		sortByY:
			readOptionalValue(record, 'sortByY', path, readBoolean) ?? true,
		sortingLayer:
			readOptionalValue(record, 'sortingLayer', path, readString) ??
			'Character',
		sortingOrder:
			readOptionalValue(record, 'sortingOrder', path, readNumber) ?? 0,
	};
}

function readDayMapCollision(value: unknown, path: string): IDayMapCollision {
	const record = readRecord(value, path);
	return {
		...record,
		name: readOptionalValue(record, 'name', path, readString) ?? '',
		x: readOptionalValue(record, 'x', path, readNumber) ?? 0,
		y: readOptionalValue(record, 'y', path, readNumber) ?? 0,
		width: readOptionalValue(record, 'width', path, readNumber) ?? 0,
		height: readOptionalValue(record, 'height', path, readNumber) ?? 0,
	};
}

function readDayMapSpawn(value: unknown, path: string): IDayMapSpawn {
	const record = readRecord(value, path);
	return {
		...record,
		name: readRequired(record, 'name', path, readString),
		x: readOptionalValue(record, 'x', path, readNumber) ?? 0,
		y: readOptionalValue(record, 'y', path, readNumber) ?? 0,
		rotation:
			readOptionalValue(
				record,
				'rotation',
				path,
				readSpawnMarkerRotation
			) ?? 'Down',
	};
}

function readDayMap(value: unknown, path: string): IDayMap {
	const record = readRecord(value, path);
	return {
		...record,
		id: readRequired(record, 'id', path, readNumber),
		formatVersion:
			readOptionalValue(record, 'formatVersion', path, readNumber) ?? 1,
		name: readOptionalValue(record, 'name', path, readString) ?? '',
		description:
			readOptionalValue(record, 'description', path, readString) ?? '',
		tiles:
			readOptionalValue(record, 'tiles', path, (value, path) =>
				readArray(value, path, readDayMapTile)
			) ?? [],
		layers:
			readOptionalValue(record, 'layers', path, (value, path) =>
				readArray(value, path, readDayMapLayer)
			) ?? [],
		objects:
			readOptionalValue(record, 'objects', path, (value, path) =>
				readArray(value, path, readDayMapObject)
			) ?? [],
		collisions:
			readOptionalValue(record, 'collisions', path, (value, path) =>
				readArray(value, path, readDayMapCollision)
			) ?? [],
		spawnMarkers:
			readOptionalValue(record, 'spawnMarkers', path, (value, path) =>
				readArray(value, path, readDayMapSpawn)
			) ?? [],
		defaultSpawnMarker:
			readOptionalValue(record, 'defaultSpawnMarker', path, readString) ??
			'',
		...readOptionalProperty(record, 'height', path, (value, path) => {
			if (value === null) return null;
			const height = readRecord(value, path);
			return {
				...height,
				cells:
					readOptionalValue(height, 'cells', path, (value, path) =>
						readArray(value, path, readDayMapHeightCell)
					) ?? [],
			};
		}),
		camera: readOptionalValue(record, 'camera', path, (value, path) => {
			const camera = readRecord(value, path);
			return {
				...camera,
				shouldFollow:
					readOptionalValue(
						camera,
						'shouldFollow',
						path,
						readBoolean
					) ?? true,
				bounds:
					readOptionalValue(
						camera,
						'bounds',
						path,
						readNumberArray
					) ?? [],
				position: readOptionalValue(
					camera,
					'position',
					path,
					readNumberArray
				) ?? [0, 0, -10],
			};
		}) ?? { shouldFollow: true, bounds: [], position: [0, 0, -10] },
		mapBGM: readOptionalValue(record, 'mapBGM', path, (value, path) => {
			const bgm = readRecord(value, path);
			return {
				...bgm,
				intro: readOptionalValue(bgm, 'intro', path, readString) ?? '',
				loop: readOptionalValue(bgm, 'loop', path, readString) ?? '',
			};
		}) ?? { intro: '', loop: '' },
	};
}

export function parseResourcePackWire(input: unknown): IResourcePackWire {
	const record = readRecord(input, 'ResourceEx');
	const legacyLabel = readOptionalValue(
		record,
		'label',
		'ResourceEx',
		readString
	);
	const packInfo =
		record['packInfo'] === undefined
			? undefined
			: readPackInfo(record['packInfo'], 'packInfo');
	const packLabel = packInfo?.label ?? legacyLabel ?? 'ResourceExample';
	return {
		...record,
		...readOptionalProperty(record, 'name', 'ResourceEx', readString),
		...(legacyLabel === undefined ? {} : { label: legacyLabel }),
		...readOptionalProperty(
			record,
			'authors',
			'ResourceEx',
			readStringArray
		),
		...readOptionalProperty(
			record,
			'description',
			'ResourceEx',
			readString
		),
		...readOptionalProperty(record, 'version', 'ResourceEx', readString),
		...(packInfo === undefined ? {} : { packInfo }),
		characters: readCollection(record, 'characters').map((value, index) =>
			readCharacter(value, `characters[${index}]`)
		),
		dialogPackages: readCollection(record, 'dialogPackages').map(
			(value, index) =>
				readDialogPackage(value, `dialogPackages[${index}]`)
		),
		dayMaps: readCollection(record, 'dayMaps').map((value, index) =>
			readDayMap(value, `dayMaps[${index}]`)
		),
		gifts: readCollection(record, 'gifts').map((value, index) =>
			readGift(value, `gifts[${index}]`)
		),
		ingredients: readCollection(record, 'ingredients').map((value, index) =>
			readIngredient(value, `ingredients[${index}]`)
		),
		foods: readCollection(record, 'foods').map((value, index) =>
			readFood(value, `foods[${index}]`)
		),
		beverages: readCollection(record, 'beverages').map((value, index) =>
			readBeverage(value, `beverages[${index}]`)
		),
		recipes: readCollection(record, 'recipes').map((value, index) =>
			readRecipe(value, `recipes[${index}]`)
		),
		missionNodes: readCollection(record, 'missionNodes').map(
			(value, index) => readMissionNode(value, `missionNodes[${index}]`)
		),
		eventNodes: readCollection(record, 'eventNodes').map((value, index) =>
			readEventNode(value, `eventNodes[${index}]`)
		),
		merchants: readCollection(record, 'merchants').map((value, index) =>
			readMerchantConfig(value, `merchants[${index}]`)
		),
		clothes: readCollection(record, 'clothes').map((value, index) =>
			readClothes(value, `clothes[${index}]`, packLabel)
		),
	};
}

function createPixelFullConfig(id: unknown, packLabel: string) {
	return {
		name: `_${packLabel}_Clothes_${String(id)}`,
		mainSprite: Array(12)
			.fill('')
			.map(
				(_, index) =>
					`assets/Clothes/${String(id)}/Sprite/Main_${Math.floor(index / 3)}, ${index % 3}.png`
			),
		eyeSprite: Array(24)
			.fill('')
			.map(
				(_, index) =>
					`assets/Clothes/${String(id)}/Sprite/Eyes_${Math.floor(index / 4)}, ${index % 4}.png`
			),
		hairSprite: Array(12)
			.fill('')
			.map(
				(_, index) =>
					`assets/Clothes/${String(id)}/Sprite/Hair_${Math.floor(index / 3)}, ${index % 3}.png`
			),
		backSprite: Array(12)
			.fill('')
			.map(
				(_, index) =>
					`assets/Clothes/${String(id)}/Sprite/Back_${Math.floor(index / 3)}, ${index % 3}.png`
			),
	};
}

function normalizePackInfo(wire: IResourcePackWire): PackInfo {
	if (wire.packInfo !== undefined) {
		const packInfo = { ...wire.packInfo } as Record<string, unknown>;
		delete packInfo['license'];
		return readPackInfo(packInfo, 'packInfo');
	}

	return {
		...(wire.name === undefined ? {} : { name: wire.name }),
		...(wire.label === undefined ? {} : { label: wire.label }),
		...(wire.authors === undefined ? {} : { authors: wire.authors }),
		...(wire.description === undefined
			? {}
			: { description: wire.description }),
		...(wire.version === undefined ? {} : { version: wire.version }),
	};
}

function normalizeCharacter(character: Character): Character {
	const descriptions = [...(character.descriptions ?? []), '', '', ''].slice(
		0,
		3
	);
	const guest = character.guest;

	return {
		...character,
		hideInAlbum: character.hideInAlbum ?? false,
		isParticular: character.isParticular ?? false,
		isCollabCharacter: character.isCollabCharacter ?? false,
		descriptions,
		...(guest === undefined
			? {}
			: {
					guest: {
						...guest,
						evaluation: [
							...guest.evaluation,
							...Array<string>(9).fill(''),
						].slice(0, 9),
						foodRequests: guest.foodRequests
							.map((request) => ({
								...request,
								enable: request.enable ?? true,
							}))
							.sort((a, b) => a.tagId - b.tagId),
						bevRequests: guest.bevRequests
							.map((request) => ({
								...request,
								enable: request.enable ?? false,
							}))
							.sort((a, b) => a.tagId - b.tagId),
						likeFoodTag: [...guest.likeFoodTag].sort(
							(a, b) => a.tagId - b.tagId
						),
						likeBevTag: [...guest.likeBevTag].sort(
							(a, b) => a.tagId - b.tagId
						),
						hateFoodTag: [...guest.hateFoodTag].sort(
							(a, b) => a - b
						),
						spawn: [...(guest.spawn ?? [])].sort(
							(a, b) => a.izakayaId - b.izakayaId
						),
					},
				}),
	};
}

export function normalizeResourcePack(input: unknown): ResourceEx {
	const wire = parseResourcePackWire(input);

	return {
		packInfo: normalizePackInfo(wire),
		characters: (wire.characters ?? []).map(normalizeCharacter),
		dialogPackages: [...(wire.dialogPackages ?? [])],
		gifts: [...(wire.gifts ?? [])],
		dayMaps: [...(wire.dayMaps ?? [])],
		ingredients: [...(wire.ingredients ?? [])],
		foods: (wire.foods ?? []).map((food) => ({
			...food,
			tags: [...food.tags].sort((a, b) => a - b),
			banTags: [...food.banTags].sort((a, b) => a - b),
		})),
		beverages: (wire.beverages ?? []).map((beverage) => ({
			...beverage,
			tags: [...beverage.tags].sort((a, b) => a - b),
		})),
		recipes: [...(wire.recipes ?? [])],
		missionNodes: [...(wire.missionNodes ?? [])],
		merchants: [...(wire.merchants ?? [])],
		clothes: [...(wire.clothes ?? [])],
		eventNodes: [...(wire.eventNodes ?? [])],
	};
}
