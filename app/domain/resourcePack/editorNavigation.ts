import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

export const RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND = {
	asset: '/asset',
	beverage: '/beverage',
	character: '/character',
	clothes: '/clothes',
	dayMap: '/map',
	dialogue: '/dialogue',
	event: '/event',
	food: '/food',
	gift: '/gift',
	ingredient: '/ingredient',
	license: '/info',
	merchant: '/merchant',
	mission: '/mission',
	'pack-info': '/info',
	recipe: '/recipe',
} as const;

export type TResourceEditorEntityKind =
	keyof typeof RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND;

export type TResourceEditorRoute =
	(typeof RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND)[TResourceEditorEntityKind];

export interface IResourceEditorNavigationTarget {
	entityKind: TResourceEditorEntityKind;
	fieldPath?: readonly (number | string)[];
	route: TResourceEditorRoute;
	stableKey: number | string;
}

export type TResourceEditorCollection = Exclude<keyof ResourceEx, 'packInfo'>;

export const RESOURCE_EDITOR_TARGET_BY_COLLECTION = {
	beverages: { entityKind: 'beverage', route: '/beverage' },
	characters: { entityKind: 'character', route: '/character' },
	clothes: { entityKind: 'clothes', route: '/clothes' },
	dayMaps: { entityKind: 'dayMap', route: '/map' },
	dialogPackages: { entityKind: 'dialogue', route: '/dialogue' },
	eventNodes: { entityKind: 'event', route: '/event' },
	foods: { entityKind: 'food', route: '/food' },
	gifts: { entityKind: 'gift', route: '/gift' },
	ingredients: { entityKind: 'ingredient', route: '/ingredient' },
	merchants: { entityKind: 'merchant', route: '/merchant' },
	missionNodes: { entityKind: 'mission', route: '/mission' },
	recipes: { entityKind: 'recipe', route: '/recipe' },
} as const satisfies Record<
	TResourceEditorCollection,
	Pick<IResourceEditorNavigationTarget, 'entityKind' | 'route'>
>;

const RESOURCE_EDITOR_ENTITY_KINDS = new Set<string>(
	Object.keys(RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND)
);

export function isResourceEditorEntityKind(
	value: string
): value is TResourceEditorEntityKind {
	return RESOURCE_EDITOR_ENTITY_KINDS.has(value);
}

export function isResourceEditorCollection(
	value: string
): value is TResourceEditorCollection {
	return Object.hasOwn(RESOURCE_EDITOR_TARGET_BY_COLLECTION, value);
}

export function isResourceEditorRoute(
	value: string
): value is TResourceEditorRoute {
	return Object.values(RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND).some(
		(route) => route === value
	);
}

export function createAssetEditorNavigationTarget(
	path: string
): IResourceEditorNavigationTarget {
	return {
		entityKind: 'asset',
		fieldPath: Object.freeze([path]),
		route: '/asset',
		stableKey: path,
	};
}

export function createResourceInfoEditorNavigationTarget(
	entityKind: 'license' | 'pack-info',
	stableKey: 'license' | 'packInfo',
	fieldPath: readonly (number | string)[]
): IResourceEditorNavigationTarget {
	return {
		entityKind,
		fieldPath: Object.freeze([...fieldPath]),
		route: '/info',
		stableKey,
	};
}
