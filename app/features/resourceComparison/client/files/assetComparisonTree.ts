import 'client-only';

import {
	getAssetKind,
	type TAssetKind,
} from '@/domain/resourcePack/assetTypes';

import { type IComparisonFilePairAnalysis } from './comparisonFileAnalysis';

export type TAssetComparisonStatus =
	'added' | 'modified' | 'removed' | 'unchanged' | 'unknown';

export interface IAssetComparisonCounts {
	added: number;
	modified: number;
	removed: number;
	unchanged: number;
	unknown: number;
}

export interface IAssetComparisonNode {
	analysis?: IComparisonFilePairAnalysis;
	children: readonly IAssetComparisonNode[];
	counts: IAssetComparisonCounts;
	isLeftPresent: boolean;
	isRightPresent: boolean;
	kind: TAssetKind;
	leftBlob?: Blob;
	name: string;
	parentPath: string | null;
	path: string;
	rightBlob?: Blob;
	status: TAssetComparisonStatus;
}

export interface IAssetComparisonTree {
	nodesByPath: ReadonlyMap<string, IAssetComparisonNode>;
	root: IAssetComparisonNode;
}

export interface IAssetComparisonTreeSide {
	files: ReadonlyMap<string, Blob>;
	folders: readonly string[];
}

export interface IBuildAssetComparisonTreeInput {
	analyses?: ReadonlyMap<string, IComparisonFilePairAnalysis>;
	left: IAssetComparisonTreeSide;
	right: IAssetComparisonTreeSide;
}

export interface IFlattenAssetComparisonTreeOptions {
	expandedFolders: ReadonlySet<string>;
	includeUnchanged: boolean;
	query?: string;
}

export interface IAssetPotentialMove {
	hash: string;
	leftPath: string;
	rightPath: string;
}

interface IAssetComparisonDraft {
	childrenPaths: string[];
	isLeftPresent: boolean;
	isRightPresent: boolean;
	kind: TAssetKind;
	leftBlob?: Blob;
	path: string;
	rightBlob?: Blob;
}

function createEmptyCounts(): IAssetComparisonCounts {
	return { added: 0, modified: 0, removed: 0, unchanged: 0, unknown: 0 };
}

function createSingleCount(
	status: TAssetComparisonStatus
): IAssetComparisonCounts {
	return { ...createEmptyCounts(), [status]: 1 };
}

function addCounts(
	left: IAssetComparisonCounts,
	right: IAssetComparisonCounts
): IAssetComparisonCounts {
	return {
		added: left.added + right.added,
		modified: left.modified + right.modified,
		removed: left.removed + right.removed,
		unchanged: left.unchanged + right.unchanged,
		unknown: left.unknown + right.unknown,
	};
}

function getPathName(path: string): string {
	if (!path) return '全部文件';
	const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function getParentPath(path: string): string {
	const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
	const separatorIndex = trimmed.lastIndexOf('/');
	return separatorIndex < 0 ? '' : `${trimmed.slice(0, separatorIndex + 1)}`;
}

function collectSideFolders(side: IAssetComparisonTreeSide): Set<string> {
	const folders = new Set<string>(['']);
	const addFolderWithParents = (folderPath: string) => {
		const normalized = folderPath.endsWith('/')
			? folderPath
			: `${folderPath}/`;
		if (normalized === '/') return;
		folders.add(normalized);
		let parentPath = getParentPath(normalized);
		while (parentPath) {
			folders.add(parentPath);
			parentPath = getParentPath(parentPath);
		}
	};

	for (const folder of side.folders) addFolderWithParents(folder);
	for (const path of side.files.keys()) {
		const parentPath = getParentPath(path);
		if (parentPath) addFolderWithParents(parentPath);
	}
	return folders;
}

function comparePaths(
	left: IAssetComparisonDraft,
	right: IAssetComparisonDraft
) {
	if (left.kind === 'folder' && right.kind !== 'folder') return -1;
	if (left.kind !== 'folder' && right.kind === 'folder') return 1;
	return left.path.localeCompare(right.path, 'zh-CN');
}

function getFileStatus(
	draft: IAssetComparisonDraft,
	analysis: IComparisonFilePairAnalysis | undefined
): TAssetComparisonStatus {
	if (!draft.isLeftPresent) return 'added';
	if (!draft.isRightPresent) return 'removed';
	if (analysis) return analysis.status;
	if (!draft.leftBlob || !draft.rightBlob) return 'unknown';
	return draft.leftBlob.size !== draft.rightBlob.size ||
		draft.leftBlob.type !== draft.rightBlob.type
		? 'modified'
		: 'unknown';
}

function getFolderStatus(
	draft: IAssetComparisonDraft,
	counts: IAssetComparisonCounts
): TAssetComparisonStatus {
	if (!draft.isLeftPresent) return 'added';
	if (!draft.isRightPresent) return 'removed';
	if (counts.added + counts.modified + counts.removed > 0) {
		return 'modified';
	}
	if (counts.unknown > 0) return 'unknown';
	return 'unchanged';
}

function freezeCounts(counts: IAssetComparisonCounts): IAssetComparisonCounts {
	return Object.freeze(counts);
}

export function buildAssetComparisonTree({
	analyses = new Map(),
	left,
	right,
}: IBuildAssetComparisonTreeInput): IAssetComparisonTree {
	const leftFolders = collectSideFolders(left);
	const rightFolders = collectSideFolders(right);
	const drafts = new Map<string, IAssetComparisonDraft>();
	const folderPaths = new Set([...leftFolders, ...rightFolders]);

	for (const path of folderPaths) {
		drafts.set(path, {
			childrenPaths: [],
			isLeftPresent: leftFolders.has(path),
			isRightPresent: rightFolders.has(path),
			kind: 'folder',
			path,
		});
	}
	for (const path of new Set([...left.files.keys(), ...right.files.keys()])) {
		const leftBlob = left.files.get(path);
		const rightBlob = right.files.get(path);
		drafts.set(path, {
			childrenPaths: [],
			isLeftPresent: leftBlob !== undefined,
			isRightPresent: rightBlob !== undefined,
			kind: getAssetKind(path),
			...(leftBlob === undefined ? {} : { leftBlob }),
			path,
			...(rightBlob === undefined ? {} : { rightBlob }),
		});
	}

	for (const draft of drafts.values()) {
		if (!draft.path) continue;
		const parentPath = getParentPath(draft.path);
		const parent = drafts.get(parentPath);
		if (parent) parent.childrenPaths.push(draft.path);
	}
	for (const draft of drafts.values()) {
		draft.childrenPaths.sort((leftPath, rightPath) => {
			const leftDraft = drafts.get(leftPath);
			const rightDraft = drafts.get(rightPath);
			if (!leftDraft || !rightDraft) return 0;
			return comparePaths(leftDraft, rightDraft);
		});
	}

	const nodesByPath = new Map<string, IAssetComparisonNode>();
	const buildNode = (path: string): IAssetComparisonNode => {
		const draft = drafts.get(path);
		if (!draft) throw new Error(`资产树缺少路径${path}。`);
		const children = draft.childrenPaths.map(buildNode);
		const analysis = analyses.get(path);
		let counts = children.reduce(
			(total, child) => addCounts(total, child.counts),
			createEmptyCounts()
		);
		const status =
			draft.kind === 'folder'
				? getFolderStatus(draft, counts)
				: getFileStatus(draft, analysis);
		if (children.length === 0) counts = createSingleCount(status);
		const node = Object.freeze({
			...(analysis === undefined ? {} : { analysis }),
			children: Object.freeze(children),
			counts: freezeCounts(counts),
			isLeftPresent: draft.isLeftPresent,
			isRightPresent: draft.isRightPresent,
			kind: draft.kind,
			...(draft.leftBlob === undefined
				? {}
				: { leftBlob: draft.leftBlob }),
			name: getPathName(path),
			parentPath: path ? getParentPath(path) : null,
			path,
			...(draft.rightBlob === undefined
				? {}
				: { rightBlob: draft.rightBlob }),
			status,
		}) satisfies IAssetComparisonNode;
		nodesByPath.set(path, node);
		return node;
	};

	const root = buildNode('');
	return Object.freeze({ nodesByPath, root });
}

function normalizeQuery(query: string | undefined): string {
	return query?.normalize('NFKC').trim().toLocaleLowerCase('zh-CN') ?? '';
}

export function flattenAssetComparisonTree(
	tree: IAssetComparisonTree,
	options: IFlattenAssetComparisonTreeOptions
): readonly IAssetComparisonNode[] {
	const query = normalizeQuery(options.query);
	const visit = (
		node: IAssetComparisonNode
	): { hasQueryMatch: boolean; rows: IAssetComparisonNode[] } => {
		const shouldVisitChildren =
			node.path === '' ||
			query.length > 0 ||
			options.expandedFolders.has(node.path);
		const childResults = shouldVisitChildren
			? node.children.map(visit)
			: [];
		const isSelfMatch =
			query.length === 0 ||
			node.path
				.normalize('NFKC')
				.toLocaleLowerCase('zh-CN')
				.includes(query) ||
			node.name
				.normalize('NFKC')
				.toLocaleLowerCase('zh-CN')
				.includes(query);
		const hasQueryMatch =
			isSelfMatch || childResults.some((result) => result.hasQueryMatch);
		const isStatusVisible =
			options.includeUnchanged || node.status !== 'unchanged';
		const isVisible = node.path !== '' && isStatusVisible && hasQueryMatch;
		return {
			hasQueryMatch,
			rows: [
				...(isVisible ? [node] : []),
				...(isVisible || node.path === ''
					? childResults.flatMap((result) => result.rows)
					: []),
			],
		};
	};

	return Object.freeze(visit(tree.root).rows);
}

export function preserveAssetComparisonSelection(
	previousPaths: readonly string[],
	nextPaths: readonly string[],
	selectedPath: string | null
): string | null {
	if (nextPaths.length === 0) return null;
	if (selectedPath && nextPaths.includes(selectedPath)) return selectedPath;
	const previousIndex = selectedPath
		? previousPaths.indexOf(selectedPath)
		: -1;
	return (
		nextPaths[Math.min(Math.max(previousIndex, 0), nextPaths.length - 1)] ??
		null
	);
}

export function collectPotentialAssetMoves(
	tree: IAssetComparisonTree
): readonly IAssetPotentialMove[] {
	const removedByHash = new Map<string, string[]>();
	const addedByHash = new Map<string, string[]>();
	for (const node of tree.nodesByPath.values()) {
		if (node.kind === 'folder') continue;
		const leftHash = node.analysis?.left?.hash;
		if (
			node.status === 'removed' &&
			node.analysis?.left?.hashStatus === 'hashed' &&
			leftHash !== undefined
		) {
			const paths = removedByHash.get(leftHash) ?? [];
			paths.push(node.path);
			removedByHash.set(leftHash, paths);
		}
		const rightHash = node.analysis?.right?.hash;
		if (
			node.status === 'added' &&
			node.analysis?.right?.hashStatus === 'hashed' &&
			rightHash !== undefined
		) {
			const paths = addedByHash.get(rightHash) ?? [];
			paths.push(node.path);
			addedByHash.set(rightHash, paths);
		}
	}

	const moves: IAssetPotentialMove[] = [];
	for (const [hash, leftPaths] of removedByHash) {
		const rightPaths = addedByHash.get(hash) ?? [];
		for (const leftPath of leftPaths) {
			for (const rightPath of rightPaths) {
				moves.push({ hash, leftPath, rightPath });
			}
		}
	}
	return Object.freeze(
		moves.sort((left, right) =>
			`${left.leftPath}\0${left.rightPath}`.localeCompare(
				`${right.leftPath}\0${right.rightPath}`,
				'zh-CN'
			)
		)
	);
}
