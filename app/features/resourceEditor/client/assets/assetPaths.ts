import {
	getAssetKind,
	type TAssetKind,
} from '@/domain/resourcePack/assetTypes';

import type { IAssetPathOperation } from './contracts';

export interface AssetEntry {
	kind: TAssetKind;
	name: string;
	path: string;
	url?: string;
}

export interface FolderStats {
	files: number;
	folders: number;
}

export interface IAssetReferenceStatus {
	isMissing: boolean;
	isOutsideRecommendedFolder: boolean;
	isUnsupportedType: boolean;
}

const INVALID_PATH_CHARS = /[:*?"<>|\x00-\x1f]/;

export function normalizeAssetFolderPath(
	value: string,
	root = 'assets/'
): string | null {
	const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
	const trimmed = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
	const collapsed = trimmed.replace(/\/+/g, '/').replace(/\/+$/, '');
	const folder = collapsed ? `${collapsed}/` : normalizedRoot;

	if (!folder.startsWith(normalizedRoot)) return null;

	const segments = folder.split('/').filter(Boolean);
	if (segments.length === 0) return null;
	for (const segment of segments) {
		if (segment === '.' || segment === '..') return null;
		if (INVALID_PATH_CHARS.test(segment)) return null;
	}

	return folder;
}

export function normalizeAssetFilename(name: string): string {
	return name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'untitled';
}

export function joinAssetPath(folder: string, name: string): string {
	const normalizedFolder = folder.endsWith('/') ? folder : `${folder}/`;
	return `${normalizedFolder}${normalizeAssetFilename(name)}`;
}

export function getAssetName(path: string): string {
	const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

export function getAssetParentFolder(path: string, root = 'assets/'): string {
	const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
	const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
	const index = trimmed.lastIndexOf('/');
	if (index < 0) return normalizedRoot;
	const parent = `${trimmed.slice(0, index)}/`;
	return parent.startsWith(normalizedRoot) ? parent : normalizedRoot;
}

export function listAssetFolder(
	assetUrls: Record<string, string>,
	currentFolder: string,
	root = 'assets/',
	virtualFolders: Set<string> = new Set()
): AssetEntry[] {
	const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
	const folder = currentFolder.endsWith('/')
		? currentFolder
		: `${currentFolder}/`;
	const childFolders = new Set<string>();
	const files: AssetEntry[] = [];

	for (const path of Object.keys(assetUrls)) {
		if (!path.startsWith(normalizedRoot)) continue;
		if (!path.startsWith(folder)) continue;
		const rest = path.slice(folder.length);
		if (!rest) continue;
		const slashIndex = rest.indexOf('/');
		if (slashIndex >= 0) {
			childFolders.add(`${folder}${rest.slice(0, slashIndex + 1)}`);
		} else {
			const url = assetUrls[path];
			files.push({
				kind: getAssetKind(path),
				name: rest,
				path,
				...(url ? { url } : {}),
			});
		}
	}

	for (const path of virtualFolders) {
		if (!path.startsWith(normalizedRoot)) continue;
		if (!path.startsWith(folder) || path === folder) continue;
		const rest = path.slice(folder.length);
		const slashIndex = rest.indexOf('/');
		if (slashIndex >= 0) {
			childFolders.add(`${folder}${rest.slice(0, slashIndex + 1)}`);
		}
	}

	const folders: AssetEntry[] = Array.from(childFolders).map((path) => ({
		kind: 'folder',
		name: getAssetName(path),
		path,
	}));

	return [...folders, ...files].sort((a, b) => {
		if (a.kind === 'folder' && b.kind !== 'folder') return -1;
		if (a.kind !== 'folder' && b.kind === 'folder') return 1;
		return a.name.localeCompare(b.name, 'zh-CN');
	});
}

export function collectAssetFolders(
	assetPaths: string[],
	root = 'assets/'
): string[] {
	const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
	const folders = new Set<string>([normalizedRoot]);

	for (const path of assetPaths) {
		if (!path.startsWith(normalizedRoot)) continue;
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i++) {
			const folder = `${parts.slice(0, i).join('/')}/`;
			if (folder.startsWith(normalizedRoot)) folders.add(folder);
		}
	}

	return Array.from(folders).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function getFolderStats(
	assetUrls: Record<string, string>,
	folder: string,
	root = 'assets/',
	virtualFolders: Set<string> = new Set(),
	isFileAccepted?: (path: string) => boolean
): FolderStats {
	const entries = listAssetFolder(
		assetUrls,
		folder,
		root,
		virtualFolders
	).filter(
		(entry) =>
			entry.kind === 'folder' ||
			!isFileAccepted ||
			isFileAccepted(entry.path)
	);
	return {
		files: entries.filter((entry) => entry.kind !== 'folder').length,
		folders: entries.filter((entry) => entry.kind === 'folder').length,
	};
}

export function getAssetReferenceStatus(
	path: string | undefined,
	assetUrls: Readonly<Record<string, string>>,
	recommendedFolder: string,
	isSupportedType: (path: string) => boolean
): IAssetReferenceStatus {
	if (!path) {
		return {
			isMissing: false,
			isOutsideRecommendedFolder: false,
			isUnsupportedType: false,
		};
	}
	return {
		isMissing: !Object.hasOwn(assetUrls, path),
		isOutsideRecommendedFolder: !path.startsWith(recommendedFolder),
		isUnsupportedType: !isSupportedType(path),
	};
}

export function hasAssetPathKindConflict(
	operations: readonly IAssetPathOperation[],
	assetPaths: readonly string[],
	folderPaths: readonly string[]
) {
	const assetPathSet = new Set(assetPaths);
	const folderPathSet = new Set(folderPaths);
	return operations.some(({ to }) => {
		const targetPath = getAssetPathKey(to);
		if (
			(to.endsWith('/') && assetPathSet.has(targetPath)) ||
			(!to.endsWith('/') && folderPathSet.has(`${targetPath}/`))
		) {
			return true;
		}

		let parentSeparatorIndex = targetPath.lastIndexOf('/');
		while (parentSeparatorIndex > 0) {
			const parentPath = targetPath.slice(0, parentSeparatorIndex);
			if (assetPathSet.has(parentPath)) return true;
			parentSeparatorIndex = parentPath.lastIndexOf('/');
		}
		return false;
	});
}

export function expandAssetSelection(
	selectedPaths: Set<string>,
	assetPaths: string[]
): string[] {
	const expanded = new Set<string>();

	for (const selected of selectedPaths) {
		if (selected.endsWith('/')) {
			for (const path of assetPaths) {
				if (path.startsWith(selected)) expanded.add(path);
			}
		} else {
			expanded.add(selected);
		}
	}

	return Array.from(expanded).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function expandAssetFolderSelection(
	selectedPaths: Set<string>,
	folderPaths: readonly string[]
) {
	const selectedFolders = Array.from(selectedPaths).filter((path) =>
		path.endsWith('/')
	);
	return folderPaths.filter((folder) =>
		selectedFolders.some(
			(selected) => folder === selected || folder.startsWith(selected)
		)
	);
}

export function compactAssetSelection(selectedPaths: Set<string>): string[] {
	const ordered = Array.from(selectedPaths).sort((a, b) => {
		if (a.length !== b.length) return a.length - b.length;
		return a.localeCompare(b, 'zh-CN');
	});
	const compact: string[] = [];

	for (const path of ordered) {
		const isCovered = compact.some((parent) => {
			if (!parent.endsWith('/')) return false;
			return path !== parent && path.startsWith(parent);
		});
		if (!isCovered) compact.push(path);
	}

	return compact;
}

function getAssetPathKey(path: string) {
	return path.endsWith('/') ? path.slice(0, -1) : path;
}

function getCopyName(name: string, copyIndex: number, isFolder: boolean) {
	if (isFolder) {
		return copyIndex === 1
			? `${name} - 副本`
			: `${name} - 副本 (${copyIndex})`;
	}

	const extensionIndex = name.lastIndexOf('.');
	const hasExtension = extensionIndex > 0;
	const basename = hasExtension ? name.slice(0, extensionIndex) : name;
	const extension = hasExtension ? name.slice(extensionIndex) : '';
	return copyIndex === 1
		? `${basename} - 副本${extension}`
		: `${basename} - 副本 (${copyIndex})${extension}`;
}

function buildUniqueCopyDestination(
	root: string,
	target: string,
	occupiedPaths: ReadonlySet<string>
) {
	const isFolder = root.endsWith('/');
	const name = getAssetName(root);
	let copyIndex = 1;
	while (true) {
		const candidate = `${target}${getCopyName(name, copyIndex, isFolder)}${isFolder ? '/' : ''}`;
		if (!occupiedPaths.has(getAssetPathKey(candidate))) return candidate;
		copyIndex += 1;
	}
}

export function buildAssetPathOperations(
	selectedPaths: Set<string>,
	assetPaths: string[],
	targetFolder: string,
	folderPaths: readonly string[] = [],
	mode: 'copy' | 'move' = 'move',
	rootFolder = 'assets/'
): IAssetPathOperation[] | null {
	const roots = compactAssetSelection(selectedPaths);
	const target = targetFolder.endsWith('/')
		? targetFolder
		: `${targetFolder}/`;
	const operations: IAssetPathOperation[] = [];
	const assetPathSet = new Set(assetPaths);
	const folderPathSet = new Set(folderPaths);
	const occupiedPaths = new Set([
		...assetPaths.map(getAssetPathKey),
		...folderPaths.map(getAssetPathKey),
	]);

	for (const root of roots) {
		if (root.endsWith('/')) {
			if (!folderPathSet.has(root)) return null;
			if (target.startsWith(root)) return null;
			const folderName = getAssetName(root);
			const destinationRoot =
				mode === 'copy' &&
				getAssetParentFolder(root, rootFolder) === target
					? buildUniqueCopyDestination(root, target, occupiedPaths)
					: `${target}${folderName}/`;
			occupiedPaths.add(getAssetPathKey(destinationRoot));
			operations.push({ from: root, to: destinationRoot });
			for (const folder of folderPaths) {
				if (folder === root || !folder.startsWith(root)) continue;
				operations.push({
					from: folder,
					to: `${destinationRoot}${folder.slice(root.length)}`,
				});
			}
			for (const path of assetPaths) {
				if (!path.startsWith(root)) continue;
				operations.push({
					from: path,
					to: `${destinationRoot}${path.slice(root.length)}`,
				});
			}
		} else {
			if (!assetPathSet.has(root)) return null;
			const destination =
				mode === 'copy' &&
				getAssetParentFolder(root, rootFolder) === target
					? buildUniqueCopyDestination(root, target, occupiedPaths)
					: `${target}${getAssetName(root)}`;
			occupiedPaths.add(getAssetPathKey(destination));
			operations.push({ from: root, to: destination });
		}
	}

	const effectiveOperations = operations.filter(
		(operation) => operation.from !== operation.to
	);
	const targetPaths = new Set<string>();
	for (const operation of effectiveOperations) {
		const targetPath = operation.to.endsWith('/')
			? operation.to.slice(0, -1)
			: operation.to;
		if (targetPaths.has(targetPath)) return null;
		targetPaths.add(targetPath);
	}

	return effectiveOperations;
}
