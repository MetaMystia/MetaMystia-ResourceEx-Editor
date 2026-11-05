import type { IAssetPathOperation } from './contracts';

export interface IObjectUrlEnvironment {
	createObjectURL(blob: Blob): string;
	revokeObjectURL(url: string): void;
}

export interface IObjectUrlRegistry {
	create(blob: Blob): string;
	revoke(url: string | undefined): void;
	dispose(): void;
}

export interface IAssetMapsTransaction {
	files: Map<string, Blob>;
	hasChanged: boolean;
	urls: Map<string, string>;
	urlsToRevoke: readonly string[];
}

export interface IAssetFoldersTransaction {
	folders: readonly string[];
	hasChanged: boolean;
}

export function getAssetFolderCreationError(
	files: ReadonlyMap<string, Blob>,
	path: string
): string | null {
	const folder = path.endsWith('/') ? path : `${path}/`;
	if (!path) return '资产目录路径不能为空。';
	if (path.includes('\0')) return `资产目录路径${folder}包含无效字符。`;
	if (
		path.split('/').some((segment) => segment === '.' || segment === '..')
	) {
		return `资产目录路径${folder}不能包含.或..路径段。`;
	}

	const folderFilePath = folder.slice(0, -1);
	if (files.has(folderFilePath)) return `路径${folder}已被文件占用。`;

	let separatorIndex = folderFilePath.lastIndexOf('/');
	while (separatorIndex > 0) {
		const parentPath = folderFilePath.slice(0, separatorIndex);
		if (files.has(parentPath)) {
			return `路径${folder}的父路径${parentPath}已被文件占用。`;
		}
		separatorIndex = parentPath.lastIndexOf('/');
	}

	return null;
}

export function getAssetUpdateError(
	files: ReadonlyMap<string, Blob>,
	folders: readonly string[],
	updates: ReadonlyMap<string, Blob>
): string | null {
	const updatePaths = new Set(updates.keys());
	const allFilePaths = new Set([...files.keys(), ...updatePaths]);
	const allFolderPaths = new Set(normalizeAssetFolders(folders));
	for (const filePath of allFilePaths) {
		let separatorIndex = filePath.lastIndexOf('/');
		while (separatorIndex > 0) {
			const parentPath = filePath.slice(0, separatorIndex);
			allFolderPaths.add(`${parentPath}/`);
			separatorIndex = parentPath.lastIndexOf('/');
		}
	}

	for (const path of updatePaths) {
		if (!path) return '资产路径不能为空。';
		if (path.endsWith('/')) return `资产路径${path}不能指向目录。`;
		if (path.includes('\0')) return `资产路径${path}包含无效字符。`;
		if (
			path
				.split('/')
				.some((segment) => segment === '.' || segment === '..')
		) {
			return `资产路径${path}不能包含.或..路径段。`;
		}

		if (allFolderPaths.has(`${path}/`)) {
			return `路径${path}已被目录占用。`;
		}

		let separatorIndex = path.lastIndexOf('/');
		while (separatorIndex > 0) {
			const parentPath = path.slice(0, separatorIndex);
			if (allFilePaths.has(parentPath)) {
				return `路径${path}的父路径${parentPath}已被文件占用。`;
			}
			separatorIndex = parentPath.lastIndexOf('/');
		}
	}

	return null;
}

function areFoldersEqual(left: readonly string[], right: readonly string[]) {
	return (
		left.length === right.length &&
		left.every((folder, index) => folder === right[index])
	);
}

export function areAssetSnapshotsEqual(
	currentFiles: ReadonlyMap<string, Blob>,
	currentFolders: readonly string[],
	nextFiles: ReadonlyMap<string, Blob>,
	nextFolders: readonly string[]
) {
	if (currentFiles.size !== nextFiles.size) return false;
	for (const [path, blob] of currentFiles) {
		if (nextFiles.get(path) !== blob) return false;
	}
	return areFoldersEqual(
		normalizeAssetFolders(currentFolders),
		normalizeAssetFolders(nextFolders)
	);
}

export function getAssetSnapshotReplacementError(
	files: ReadonlyMap<string, Blob>,
	folders: readonly string[]
) {
	for (const folder of folders) {
		const error = getAssetFolderCreationError(files, folder);
		if (error) return error;
	}
	return getAssetUpdateError(new Map(), folders, files);
}

export function normalizeAssetFolders(folders: readonly string[]) {
	const normalized = new Set<string>(['assets/']);
	folders.forEach((folder) => {
		const normalizedFolder = folder.endsWith('/') ? folder : `${folder}/`;
		const segments = normalizedFolder.split('/').filter(Boolean);
		for (let index = 1; index <= segments.length; index++) {
			const ancestor = `${segments.slice(0, index).join('/')}/`;
			if (ancestor) normalized.add(ancestor);
		}
	});
	return Array.from(normalized).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function addAssetFileParentFolders(
	folders: readonly string[],
	filePaths: Iterable<string>
) {
	const nextFolders = [...folders];
	for (const path of filePaths) {
		const separatorIndex = path.lastIndexOf('/');
		if (separatorIndex > 0) {
			nextFolders.push(path.slice(0, separatorIndex + 1));
		}
	}
	return normalizeAssetFolders(nextFolders);
}

export function copyAssetFolders(
	folders: readonly string[],
	operations: readonly IAssetPathOperation[]
): IAssetFoldersTransaction {
	const currentFolders = normalizeAssetFolders(folders);
	const nextFolders = new Set(currentFolders);
	operations.forEach(({ to }) => {
		if (to.endsWith('/')) nextFolders.add(to);
	});
	const normalizedFolders = normalizeAssetFolders(Array.from(nextFolders));
	return {
		folders: normalizedFolders,
		hasChanged: !areFoldersEqual(currentFolders, normalizedFolders),
	};
}

export function moveAssetFolders(
	folders: readonly string[],
	operations: readonly IAssetPathOperation[]
): IAssetFoldersTransaction {
	const currentFolders = normalizeAssetFolders(folders);
	const nextFolders = new Set(currentFolders);
	operations.forEach(({ from }) => {
		if (from.endsWith('/')) nextFolders.delete(from);
	});
	operations.forEach(({ to }) => {
		if (to.endsWith('/')) nextFolders.add(to);
	});
	const normalizedFolders = normalizeAssetFolders(Array.from(nextFolders));
	return {
		folders: normalizedFolders,
		hasChanged: !areFoldersEqual(currentFolders, normalizedFolders),
	};
}

export function createObjectUrlRegistry(
	environment: IObjectUrlEnvironment
): IObjectUrlRegistry {
	const generatedUrls = new Set<string>();
	let isDisposed = false;
	return {
		create(blob) {
			if (isDisposed) {
				throw new Error('Object URL registry is disposed');
			}
			const url = environment.createObjectURL(blob);
			generatedUrls.add(url);
			return url;
		},
		revoke(url) {
			if (!url || !generatedUrls.delete(url)) return;
			environment.revokeObjectURL(url);
		},
		dispose() {
			if (isDisposed) return;
			isDisposed = true;
			for (const url of Array.from(generatedUrls)) {
				generatedUrls.delete(url);
				environment.revokeObjectURL(url);
			}
		},
	};
}

export function replaceAssetMaps(
	files: ReadonlyMap<string, Blob>,
	urlRegistry: IObjectUrlRegistry
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map<string, string>();
	const createdUrls: string[] = [];
	try {
		for (const [path, blob] of nextFiles) {
			const url = urlRegistry.create(blob);
			createdUrls.push(url);
			nextUrls.set(path, url);
		}
	} catch (error) {
		createdUrls.forEach(urlRegistry.revoke);
		throw error;
	}
	return {
		files: nextFiles,
		hasChanged: true,
		urls: nextUrls,
		urlsToRevoke: [],
	};
}

export function updateAssetMaps(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	path: string,
	blob: Blob,
	urlRegistry: IObjectUrlRegistry
): IAssetMapsTransaction {
	const nextUrl = urlRegistry.create(blob);
	const previousUrl = urls.get(path);
	return {
		files: new Map(files).set(path, blob),
		hasChanged: true,
		urls: new Map(urls).set(path, nextUrl),
		urlsToRevoke: previousUrl ? [previousUrl] : [],
	};
}

export function updateAssetMapsBatch(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	updates: ReadonlyMap<string, Blob>,
	urlRegistry: IObjectUrlRegistry
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map(urls);
	const createdUrls: string[] = [];
	const urlsToRevoke: string[] = [];
	try {
		for (const [path, blob] of updates) {
			const nextUrl = urlRegistry.create(blob);
			createdUrls.push(nextUrl);
			const previousUrl = nextUrls.get(path);
			if (previousUrl) urlsToRevoke.push(previousUrl);
			nextFiles.set(path, blob);
			nextUrls.set(path, nextUrl);
		}
	} catch (error) {
		createdUrls.forEach(urlRegistry.revoke);
		throw error;
	}
	return {
		files: nextFiles,
		hasChanged: updates.size > 0,
		urls: nextUrls,
		urlsToRevoke,
	};
}

export function removeAssetMaps(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	path: string
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map(urls);
	const previousUrl = nextUrls.get(path);
	nextFiles.delete(path);
	nextUrls.delete(path);
	return {
		files: nextFiles,
		hasChanged: previousUrl !== undefined || files.has(path),
		urls: nextUrls,
		urlsToRevoke: previousUrl ? [previousUrl] : [],
	};
}

export function removeAssetMapsBatch(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	paths: readonly string[]
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map(urls);
	const urlsToRevoke: string[] = [];
	let hasChanged = false;
	for (const path of paths) {
		const previousUrl = nextUrls.get(path);
		if (nextFiles.delete(path)) hasChanged = true;
		if (nextUrls.delete(path)) hasChanged = true;
		if (previousUrl) urlsToRevoke.push(previousUrl);
	}
	return { files: nextFiles, hasChanged, urls: nextUrls, urlsToRevoke };
}

export function copyAssetMaps(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	operations: readonly IAssetPathOperation[],
	urlRegistry: IObjectUrlRegistry
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map(urls);
	const createdUrls: string[] = [];
	const urlsToRevoke: string[] = [];
	try {
		for (const { from, to } of operations) {
			if (from === to) continue;
			const blob = nextFiles.get(from);
			if (!blob) continue;
			const url = urlRegistry.create(blob);
			createdUrls.push(url);
			const overwrittenUrl = nextUrls.get(to);
			if (overwrittenUrl) urlsToRevoke.push(overwrittenUrl);
			nextFiles.set(to, blob);
			nextUrls.set(to, url);
		}
	} catch (error) {
		createdUrls.forEach(urlRegistry.revoke);
		throw error;
	}
	return {
		files: nextFiles,
		hasChanged: createdUrls.length > 0,
		urls: nextUrls,
		urlsToRevoke,
	};
}

export function moveAssetMaps(
	files: ReadonlyMap<string, Blob>,
	urls: ReadonlyMap<string, string>,
	operations: readonly IAssetPathOperation[]
): IAssetMapsTransaction {
	const nextFiles = new Map(files);
	const nextUrls = new Map(urls);
	const urlsToRevoke: string[] = [];
	let hasChanged = false;
	for (const { from, to } of operations) {
		if (from === to) continue;
		const blob = nextFiles.get(from);
		const url = nextUrls.get(from);
		if (!blob || !url) continue;
		const overwrittenUrl = nextUrls.get(to);
		if (overwrittenUrl && overwrittenUrl !== url) {
			urlsToRevoke.push(overwrittenUrl);
		}
		nextFiles.delete(from);
		nextUrls.delete(from);
		nextFiles.set(to, blob);
		nextUrls.set(to, url);
		hasChanged = true;
	}
	return { files: nextFiles, hasChanged, urls: nextUrls, urlsToRevoke };
}
