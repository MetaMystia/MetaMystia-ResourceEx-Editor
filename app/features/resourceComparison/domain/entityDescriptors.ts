import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

export type TResourceEntityCollection = Exclude<keyof ResourceEx, 'packInfo'>;

export type TComparisonStableKey =
	| 'id'
	| 'izakayaId'
	| 'key'
	| 'label'
	| 'name'
	| 'pid'
	| 'tagId';

export interface IComparisonEntityDescriptor {
	collection: TResourceEntityCollection;
	displayField: string;
	label: string;
	stableKey?: TComparisonStableKey;
}

export interface IComparisonNestedEntityDescriptor {
	displayField?: string;
	label: string;
	path: string;
	stableKey: TComparisonStableKey;
}

export const RESOURCE_ENTITY_DESCRIPTORS = [
	{
		collection: 'beverages',
		displayField: 'name',
		label: '酒水',
		stableKey: 'id',
	},
	{
		collection: 'characters',
		displayField: 'name',
		label: '稀客',
		stableKey: 'id',
	},
	{
		collection: 'clothes',
		displayField: 'name',
		label: '衣服',
		stableKey: 'id',
	},
	{
		collection: 'dialogPackages',
		displayField: 'name',
		label: '对话包',
		stableKey: 'name',
	},
	{
		collection: 'eventNodes',
		displayField: 'debugLabel',
		label: '事件节点',
		stableKey: 'label',
	},
	{
		collection: 'foods',
		displayField: 'name',
		label: '料理',
		stableKey: 'id',
	},
	{
		collection: 'dayMaps',
		displayField: 'name',
		label: '白天地图',
		stableKey: 'id',
	},
	{ collection: 'gifts', displayField: 'title', label: '礼物邮箱' },
	{
		collection: 'ingredients',
		displayField: 'name',
		label: '食材',
		stableKey: 'id',
	},
	{
		collection: 'merchants',
		displayField: 'key',
		label: '商人',
		stableKey: 'key',
	},
	{
		collection: 'missionNodes',
		displayField: 'title',
		label: '任务节点',
		stableKey: 'label',
	},
	{
		collection: 'recipes',
		displayField: 'id',
		label: '食谱',
		stableKey: 'id',
	},
] as const satisfies readonly IComparisonEntityDescriptor[];

export const NESTED_ENTITY_DESCRIPTORS = [
	{
		displayField: 'key',
		label: '瓦片',
		path: 'dayMaps[].tiles',
		stableKey: 'key',
	},
	{
		displayField: 'name',
		label: '出生点',
		path: 'dayMaps[].spawnMarkers',
		stableKey: 'name',
	},
	{
		displayField: 'label',
		label: '立绘',
		path: 'characters[].portraits',
		stableKey: 'pid',
	},
	{
		label: '料理请求',
		path: 'characters[].guest.foodRequests',
		stableKey: 'tagId',
	},
	{
		label: '酒水请求',
		path: 'characters[].guest.bevRequests',
		stableKey: 'tagId',
	},
	{
		label: '喜爱料理标签',
		path: 'characters[].guest.likeFoodTag',
		stableKey: 'tagId',
	},
	{
		label: '喜爱酒水标签',
		path: 'characters[].guest.likeBevTag',
		stableKey: 'tagId',
	},
	{
		label: '生成地点',
		path: 'characters[].guest.spawn',
		stableKey: 'izakayaId',
	},
] as const satisfies readonly IComparisonNestedEntityDescriptor[];

export const RESOURCE_ENTITY_COLLECTIONS = RESOURCE_ENTITY_DESCRIPTORS.map(
	({ collection }) => collection
);

const resourceEntityDescriptorsByCollection: Readonly<
	Record<string, IComparisonEntityDescriptor>
> = Object.fromEntries(
	RESOURCE_ENTITY_DESCRIPTORS.map((descriptor) => [
		descriptor.collection,
		descriptor,
	])
);

const nestedEntityDescriptorsByPath: Readonly<
	Record<string, IComparisonNestedEntityDescriptor>
> = Object.fromEntries(
	NESTED_ENTITY_DESCRIPTORS.map((descriptor) => [descriptor.path, descriptor])
);

export function getResourceEntityDescriptor(
	collection: string
): IComparisonEntityDescriptor | undefined {
	return resourceEntityDescriptorsByCollection[collection];
}

export function getNestedEntityDescriptor(
	path: string
): IComparisonNestedEntityDescriptor | undefined {
	return nestedEntityDescriptorsByPath[path];
}
