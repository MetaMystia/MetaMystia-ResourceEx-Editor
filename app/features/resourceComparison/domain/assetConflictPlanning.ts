import type {
	IComparisonAssetHashPair,
	IComparisonCommandChange,
	IComparisonCommandConflict,
	IComparisonSkippedFile,
	TComparisonAssetConflictResolution,
} from './contracts';

export interface IComparisonAssetPlanningInput {
	conflictResolutions?: ReadonlyMap<
		string,
		TComparisonAssetConflictResolution
	>;
	copyFilePaths?: readonly string[];
	currentFiles: ReadonlyMap<string, Blob>;
	currentFolders: readonly string[];
	deleteFilePaths?: readonly string[];
	deleteFolderPaths?: readonly string[];
	hashes?: ReadonlyMap<string, IComparisonAssetHashPair>;
	nodeId: string;
	restoreFolderPaths?: readonly string[];
	sourceFiles: ReadonlyMap<string, Blob>;
	sourceFolders: readonly string[];
}

export interface IComparisonAssetPlanningResult {
	addedBytes: number;
	addedFileCount: number;
	changes: readonly IComparisonCommandChange[];
	conflicts: readonly IComparisonCommandConflict[];
	files: ReadonlyMap<string, Blob>;
	folders: readonly string[];
	skippedFiles: readonly IComparisonSkippedFile[];
}

function normalizeFolder(path: string): string {
	return path.endsWith('/') ? path : `${path}/`;
}

function normalizeFolders(folders: Iterable<string>): readonly string[] {
	const normalized = new Set<string>(['assets/']);
	for (const candidate of folders) {
		const folder = normalizeFolder(candidate);
		const segments = folder.split('/').filter(Boolean);
		for (let index = 1; index <= segments.length; index += 1) {
			normalized.add(`${segments.slice(0, index).join('/')}/`);
		}
	}
	return Array.from(normalized).sort((left, right) =>
		left.localeCompare(right, 'zh-CN')
	);
}

function appendFileParentFolders(folders: Set<string>, path: string): void {
	let separatorIndex = path.lastIndexOf('/');
	while (separatorIndex > 0) {
		folders.add(`${path.slice(0, separatorIndex)}/`);
		separatorIndex = path.lastIndexOf('/', separatorIndex - 1);
	}
}

function getParentFilePaths(files: ReadonlyMap<string, Blob>, path: string) {
	const parentPaths: string[] = [];
	let separatorIndex = path.lastIndexOf('/');
	while (separatorIndex > 0) {
		const parentPath = path.slice(0, separatorIndex);
		if (files.has(parentPath)) parentPaths.push(parentPath);
		separatorIndex = path.lastIndexOf('/', separatorIndex - 1);
	}
	return parentPaths;
}

function isKnownSameContent(
	path: string,
	left: Blob,
	right: Blob,
	hashes: ReadonlyMap<string, IComparisonAssetHashPair> | undefined
): boolean {
	if (left === right) return true;
	const pair = hashes?.get(path);
	return Boolean(
		pair?.leftHash && pair.rightHash && pair.leftHash === pair.rightHash
	);
}

function createConflict(
	kind: IComparisonCommandConflict['kind'],
	message: string,
	assetPath: string
): IComparisonCommandConflict {
	return { assetPath, isBlocking: true, kind, message };
}

export function planComparisonAssetChanges(
	input: IComparisonAssetPlanningInput
): IComparisonAssetPlanningResult {
	const files = new Map(input.currentFiles);
	const folders = new Set(normalizeFolders(input.currentFolders));
	const changes: IComparisonCommandChange[] = [];
	const conflicts: IComparisonCommandConflict[] = [];
	const skippedFiles: IComparisonSkippedFile[] = [];
	let addedBytes = 0;
	let addedFileCount = 0;

	const readResolution = (path: string) => {
		const exact = input.conflictResolutions?.get(path);
		if (exact) return exact;
		const candidateFolders = Array.from(
			input.conflictResolutions?.entries() ?? []
		)
			.filter(
				([candidate]) =>
					candidate.endsWith('/') &&
					path !== candidate &&
					path.startsWith(candidate)
			)
			.sort(([left], [right]) => right.length - left.length);
		return candidateFolders[0]?.[1];
	};
	const recordFileDeletion = (path: string) => {
		if (!files.delete(path)) return;
		changes.push({
			assetPath: path,
			kind: 'delete-file',
			nodeId: input.nodeId,
		});
	};
	const recordFolderDeletion = (path: string) => {
		const folder = normalizeFolder(path);
		for (const filePath of Array.from(files.keys()).sort()) {
			if (filePath.startsWith(folder)) recordFileDeletion(filePath);
		}
		const removedFolders = Array.from(folders)
			.filter(
				(candidate) =>
					candidate === folder || candidate.startsWith(folder)
			)
			.sort(
				(left, right) =>
					right.length - left.length || right.localeCompare(left)
			);
		for (const removedFolder of removedFolders) {
			if (removedFolder === 'assets/') continue;
			folders.delete(removedFolder);
			changes.push({
				assetPath: removedFolder,
				kind: 'delete-folder',
				nodeId: input.nodeId,
			});
		}
	};

	for (const path of [...new Set(input.deleteFilePaths ?? [])].sort()) {
		recordFileDeletion(path);
	}
	for (const path of [...new Set(input.deleteFolderPaths ?? [])].sort()) {
		recordFolderDeletion(path);
	}

	const sourceFolders = new Set(input.sourceFolders.map(normalizeFolder));
	const requestedFolders = new Set<string>();
	for (const root of [
		...new Set((input.restoreFolderPaths ?? []).map(normalizeFolder)),
	].sort()) {
		const hasSourceFolder = sourceFolders.has(root);
		const hasSourceFile = Array.from(input.sourceFiles.keys()).some(
			(path) => path.startsWith(root)
		);
		if (!hasSourceFolder && !hasSourceFile) {
			conflicts.push(
				createConflict(
					'missing-source',
					`旧版中不存在目录${root}。`,
					root
				)
			);
			continue;
		}
		requestedFolders.add(root);
		for (const sourceFolder of sourceFolders) {
			if (sourceFolder.startsWith(root)) {
				requestedFolders.add(sourceFolder);
			}
		}
	}

	const copyFilePaths = new Set(input.copyFilePaths ?? []);
	for (const folder of requestedFolders) {
		for (const path of input.sourceFiles.keys()) {
			if (path.startsWith(folder)) copyFilePaths.add(path);
		}
	}

	for (const folder of Array.from(requestedFolders).sort()) {
		const filePath = folder.slice(0, -1);
		const parentFilePaths = getParentFilePaths(files, filePath);
		const collisionPaths = [
			...(files.has(filePath) ? [filePath] : []),
			...parentFilePaths,
		];
		if (collisionPaths.length > 0) {
			const resolution = readResolution(folder);
			if (resolution === 'keep-right') continue;
			if (resolution !== 'use-left') {
				conflicts.push(
					createConflict(
						'file-folder-collision',
						`目录${folder}与新版文件冲突。`,
						folder
					)
				);
				continue;
			}
			collisionPaths.forEach(recordFileDeletion);
		}
		if (!folders.has(folder)) {
			folders.add(folder);
			changes.push({
				assetPath: folder,
				kind: 'create-folder',
				nodeId: input.nodeId,
			});
		}
	}

	for (const path of Array.from(copyFilePaths).sort()) {
		const source = input.sourceFiles.get(path);
		if (!source) {
			conflicts.push(
				createConflict(
					'missing-source',
					`旧版中不存在文件${path}。`,
					path
				)
			);
			continue;
		}

		const exactFolder = `${path}/`;
		const parentFilePaths = getParentFilePaths(files, path);
		const hasFolderCollision = folders.has(exactFolder);
		if (hasFolderCollision || parentFilePaths.length > 0) {
			const resolution =
				readResolution(path) ?? readResolution(exactFolder);
			if (resolution === 'keep-right') {
				skippedFiles.push({
					path,
					reason: 'kept-right',
					size: source.size,
				});
				continue;
			}
			if (resolution !== 'use-left') {
				conflicts.push(
					createConflict(
						'file-folder-collision',
						`文件${path}与新版目录或上级文件冲突。`,
						path
					)
				);
				continue;
			}
			if (hasFolderCollision) recordFolderDeletion(exactFolder);
			parentFilePaths.forEach(recordFileDeletion);
		}

		const current = files.get(path);
		if (
			current &&
			isKnownSameContent(path, source, current, input.hashes)
		) {
			skippedFiles.push({
				path,
				reason: 'same-content',
				size: source.size,
			});
			continue;
		}
		if (current) {
			const resolution = readResolution(path);
			if (resolution === 'keep-right') {
				skippedFiles.push({
					path,
					reason: 'kept-right',
					size: source.size,
				});
				continue;
			}
			if (resolution !== 'use-left') {
				conflicts.push(
					createConflict(
						'path-content-mismatch',
						`文件${path}在两侧内容不同，或尚未确认相同。`,
						path
					)
				);
				continue;
			}
		}

		const isAdded = !input.currentFiles.has(path);
		files.set(path, source);
		appendFileParentFolders(folders, path);
		changes.push({
			assetPath: path,
			byteSize: source.size,
			kind: 'copy-file',
			nodeId: input.nodeId,
		});
		if (isAdded) {
			addedBytes += source.size;
			addedFileCount += 1;
		}
	}

	return {
		addedBytes,
		addedFileCount,
		changes: Object.freeze(changes),
		conflicts: Object.freeze(conflicts),
		files,
		folders: Object.freeze(normalizeFolders(folders)),
		skippedFiles: Object.freeze(skippedFiles),
	};
}
