import { createResourceInfoEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import {
	buildComparisonSearchIndex,
	searchComparisonNodes,
} from './comparisonSearch';
import { compareResourcePacks } from './compareResourcePacks';
import {
	type IComparisonContentSnapshot,
	type IComparisonNode,
	type IResourcePackComparison,
	type IResourcePackComparisonOptions,
	type TComparisonDifferenceStatus,
	type TComparisonPathSegment,
	type TComparisonValue,
} from './contracts';
import {
	createComparisonDifferenceCounts,
	deriveComparisonParentStatus,
	indexComparisonNodes,
	pruneUnchangedComparisonNode,
} from './differenceTree';

export type TComparisonFieldEditorKind =
	| 'asset-path'
	| 'boolean'
	| 'license'
	| 'literal'
	| 'multiline'
	| 'number'
	| 'number-set'
	| 'string'
	| 'string-list';

export interface IComparisonFieldOption {
	label: string;
	value: string;
}

export interface IComparisonFieldDescriptor {
	isOptional?: boolean;
	kind: TComparisonFieldEditorKind;
	options?: readonly IComparisonFieldOption[];
	setKind?: 'beverage-tags' | 'food-tags';
}

export interface IComparisonFieldQuery {
	hasIssuesOnly?: boolean;
	query?: string;
	resourceTypes?: ReadonlySet<string>;
	statuses?: ReadonlySet<string>;
}

const LITERAL_OPTIONS_BY_PATH = new Map<
	string,
	readonly IComparisonFieldOption[]
>([
	[
		'characters.*.type',
		[
			{ label: '自身（Self）', value: 'Self' },
			{ label: '特殊（Special）', value: 'Special' },
			{ label: '普通（Normal）', value: 'Normal' },
			{ label: '未知（Unknown）', value: 'Unknown' },
		],
	],
	[
		'missionNodes.*.missionFailedAction',
		[
			{ label: '无操作（None）', value: 'None' },
			{ label: '返回主菜单（BackToMainMenu）', value: 'BackToMainMenu' },
			{ label: '时间回滚（Rewind）', value: 'Rewind' },
		],
	],
	[
		'missionNodes.*.missionType',
		[
			{ label: '羁绊（Kitsuna）', value: 'Kitsuna' },
			{ label: '主线（Main）', value: 'Main' },
			{ label: '支线（Side）', value: 'Side' },
		],
	],
	[
		'recipes.*.cookerType',
		[
			{ label: '煮锅（Pot）', value: 'Pot' },
			{ label: '烤架（Grill）', value: 'Grill' },
			{ label: '油锅（Fryer）', value: 'Fryer' },
			{ label: '蒸锅（Steamer）', value: 'Steamer' },
			{ label: '料理台（CuttingBoard）', value: 'CuttingBoard' },
		],
	],
]);

const MULTILINE_PATHS = new Set([
	'beverages.*.description',
	'clothes.*.description',
	'foods.*.description',
	'ingredients.*.description',
	'missionNodes.*.description',
	'packInfo.description',
]);

const STRING_PATHS = new Set([
	'beverages.*.modRoot',
	'beverages.*.name',
	'characters.*.name',
	'clothes.*.name',
	'eventNodes.*.debugLabel',
	'foods.*.name',
	'ingredients.*.name',
	'missionNodes.*.debugLabel',
	'missionNodes.*.title',
	'packInfo.idSignature',
	'packInfo.name',
	'packInfo.version',
]);

const NUMBER_PATHS = new Set([
	'beverages.*.baseValue',
	'beverages.*.level',
	'clothes.*.izakayaSkinIndex',
	'clothes.*.izkayaHorizontalOffset',
	'clothes.*.notebookHorizontalOffset',
	'clothes.*.notebookUITitleHorizontalOffset',
	'clothes.*.notebookUITitleVerticalOffset',
	'clothes.*.notebookVerticalOffset',
	'foods.*.baseValue',
	'foods.*.level',
	'ingredients.*.baseValue',
	'ingredients.*.level',
	'ingredients.*.prefix',
	'merchants.*.leastSellNum',
	'merchants.*.priceMultiplierMax',
	'merchants.*.priceMultiplierMin',
	'packInfo.idRangeEnd',
	'packInfo.idRangeStart',
	'recipes.*.cookTime',
]);

const BOOLEAN_PATHS = new Set([
	'characters.*.hideInAlbum',
	'characters.*.isCollabCharacter',
	'characters.*.isParticular',
	'ingredients.*.isFish',
	'ingredients.*.isMeat',
	'ingredients.*.isVeg',
	'missionNodes.*.isTimedMission',
]);

const ASSET_PATHS = new Set([
	'beverages.*.spritePath',
	'clothes.*.portraitPath',
	'clothes.*.spritePath',
	'foods.*.spritePath',
	'ingredients.*.spritePath',
]);

const NUMBER_SET_PATHS = new Map<string, 'beverage-tags' | 'food-tags'>([
	['beverages.*.tags', 'beverage-tags'],
	['foods.*.banTags', 'food-tags'],
	['foods.*.tags', 'food-tags'],
	['ingredients.*.tags', 'food-tags'],
]);

const STRING_LIST_PATHS = new Set([
	'packInfo.authors',
	'packInfo.dependencies',
]);

const OPTIONAL_NUMBER_PATHS = new Set([
	'packInfo.idRangeEnd',
	'packInfo.idRangeStart',
]);

function createComparisonValue(
	isPresent: boolean,
	value: unknown
): TComparisonValue {
	return isPresent
		? Object.freeze({ isPresent: true, value })
		: Object.freeze({ isPresent: false });
}

function getLicenseStatus(
	left: IComparisonContentSnapshot,
	right: IComparisonContentSnapshot
): TComparisonDifferenceStatus {
	if (!left.hasLicenseFile && right.hasLicenseFile) return 'added';
	if (left.hasLicenseFile && !right.hasLicenseFile) return 'removed';
	if (!left.hasLicenseFile || !right.hasLicenseFile) return 'unchanged';
	return left.license === right.license ? 'unchanged' : 'modified';
}

function createLicenseNode(
	left: IComparisonContentSnapshot,
	right: IComparisonContentSnapshot,
	parentId: string
): IComparisonNode {
	const status = getLicenseStatus(left, right);
	return Object.freeze({
		children: Object.freeze([]),
		counts: Object.freeze(createComparisonDifferenceCounts(status, [])),
		editCapabilities:
			status === 'added'
				? Object.freeze(['delete-added'] as const)
				: status === 'removed'
					? Object.freeze(['restore-removed'] as const)
					: status === 'modified'
						? Object.freeze([
								'adopt-old',
								'edit-lightweight',
							] as const)
						: Object.freeze([]),
		fieldPath: Object.freeze(['license']),
		id: 'license:s:license',
		issues: Object.freeze([]),
		kind: 'license',
		label: 'License',
		leftValue: createComparisonValue(left.hasLicenseFile, left.license),
		navigationTarget: createResourceInfoEditorNavigationTarget(
			'license',
			'license',
			['license']
		),
		parentId,
		rawFieldName: 'license',
		referenceImpacts: Object.freeze([]),
		rightValue: createComparisonValue(right.hasLicenseFile, right.license),
		status,
	});
}

export function compareComparisonContents(
	left: IComparisonContentSnapshot,
	right: IComparisonContentSnapshot,
	options: IResourcePackComparisonOptions = {}
): IResourcePackComparison {
	const resourceComparison = compareResourcePacks(
		left.resourcePack,
		right.resourcePack,
		{ includeUnchanged: true }
	);
	const children = Object.freeze([
		...resourceComparison.root.children,
		createLicenseNode(left, right, resourceComparison.root.id),
	]);
	const status = deriveComparisonParentStatus(children);
	const fullRoot = Object.freeze({
		...resourceComparison.root,
		children,
		counts: Object.freeze(
			createComparisonDifferenceCounts(status, children)
		),
		status,
	});
	const root = options.includeUnchanged
		? fullRoot
		: pruneUnchangedComparisonNode(fullRoot, true);
	if (!root) throw new Error('Comparison root must always be retained.');
	return Object.freeze({
		nodesById: indexComparisonNodes(root),
		root,
		searchIndex: buildComparisonSearchIndex(root),
	});
}

function isStableSelector(segment: TComparisonPathSegment): boolean {
	return (
		typeof segment === 'string' && /^[^=]+=(number|string):/u.test(segment)
	);
}

function getDescriptorPath(node: IComparisonNode): string {
	return node.fieldPath
		.map((segment) => (isStableSelector(segment) ? '*' : String(segment)))
		.join('.');
}

export function getComparisonFieldDescriptor(
	node: IComparisonNode | undefined
): IComparisonFieldDescriptor | null {
	if (!node || node.status === 'ambiguous') return null;
	if (node.kind === 'license') return { kind: 'license' };
	const path = getDescriptorPath(node);
	if (path === 'packInfo.label') return null;
	const literalOptions = LITERAL_OPTIONS_BY_PATH.get(path);
	if (literalOptions) return { kind: 'literal', options: literalOptions };
	if (MULTILINE_PATHS.has(path)) return { kind: 'multiline' };
	if (STRING_PATHS.has(path)) return { kind: 'string' };
	if (NUMBER_PATHS.has(path)) {
		return {
			...(OPTIONAL_NUMBER_PATHS.has(path) ? { isOptional: true } : {}),
			kind: 'number',
		};
	}
	if (BOOLEAN_PATHS.has(path)) return { kind: 'boolean' };
	if (ASSET_PATHS.has(path)) return { kind: 'asset-path' };
	const setKind = NUMBER_SET_PATHS.get(path);
	if (setKind) return { kind: 'number-set', setKind };
	if (STRING_LIST_PATHS.has(path)) return { kind: 'string-list' };
	return null;
}

export function getComparisonNodeDisplayLabel(
	comparison: IResourcePackComparison,
	node: IComparisonNode
): string {
	const contextLabels: string[] = [];
	let parentId = node.parentId;
	while (parentId && contextLabels.length < 2) {
		const parent = comparison.nodesById.get(parentId);
		if (!parent) break;
		if (
			(parent.kind === 'entity' || parent.kind === 'member') &&
			parent.label !== node.label &&
			!contextLabels.includes(parent.label)
		) {
			contextLabels.unshift(parent.label);
		}
		parentId = parent.parentId;
	}
	return [...contextLabels, node.label].join(' · ');
}

function collectNavigableFieldNodes(
	root: IComparisonNode
): readonly IComparisonNode[] {
	const nodes: IComparisonNode[] = [];
	const pendingNodes = [root];
	while (pendingNodes.length > 0) {
		const node = pendingNodes.pop();
		if (!node) continue;
		if (node.kind === 'root') {
			pendingNodes.push(...node.children.toReversed());
			continue;
		}
		if (getComparisonFieldDescriptor(node)) {
			nodes.push(node);
			continue;
		}
		if (
			node.status === 'added' ||
			node.status === 'ambiguous' ||
			node.status === 'removed'
		) {
			nodes.push(node);
			continue;
		}
		if (node.children.length === 0 || node.issues.length > 0) {
			nodes.push(node);
		}
		pendingNodes.push(...node.children.toReversed());
	}
	return nodes;
}

export function queryComparisonFieldNodes(
	comparison: IResourcePackComparison,
	query: IComparisonFieldQuery
): readonly IComparisonNode[] {
	const searchNodeIds = new Set(
		searchComparisonNodes(comparison.searchIndex, query.query ?? '')
	);
	return Object.freeze(
		collectNavigableFieldNodes(comparison.root).filter((node) => {
			if (!searchNodeIds.has(node.id)) return false;
			if (query.statuses && !query.statuses.has(node.status)) {
				return false;
			}
			const resourceType = String(node.fieldPath[0] ?? '');
			if (
				query.resourceTypes?.size &&
				!query.resourceTypes.has(resourceType)
			) {
				return false;
			}
			return !query.hasIssuesOnly || node.issues.length > 0;
		})
	);
}

export function preserveComparisonSelection(
	previousNodeId: string | null,
	previousIndex: number,
	nodes: readonly IComparisonNode[]
): string | null {
	if (previousNodeId && nodes.some(({ id }) => id === previousNodeId)) {
		return previousNodeId;
	}
	if (nodes.length === 0) return null;
	return (
		nodes[Math.min(Math.max(previousIndex, 0), nodes.length - 1)]?.id ??
		null
	);
}
