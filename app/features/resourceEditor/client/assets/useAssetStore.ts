'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
	addAssetFileParentFolders,
	areAssetSnapshotsEqual,
	copyAssetFolders,
	copyAssetMaps,
	createObjectUrlRegistry,
	getAssetFolderCreationError,
	getAssetSnapshotReplacementError,
	getAssetUpdateError,
	type IAssetMapsTransaction,
	type IObjectUrlRegistry,
	moveAssetFolders,
	moveAssetMaps,
	normalizeAssetFolders,
	removeAssetMaps,
	removeAssetMapsBatch,
	replaceAssetMaps,
	updateAssetMaps,
	updateAssetMapsBatch,
} from './assetStoreTransactions';
import type {
	IAssetMutationResult,
	IAssetPathOperation,
	IAssetSnapshot,
	IAssetState,
} from './contracts';

const EMPTY_FOLDERS = ['assets/'] as const;
const EMPTY_ASSET_STATE: IAssetState = {
	folders: EMPTY_FOLDERS,
	generation: 0,
	urls: {},
};
const ASSET_STORE_UNAVAILABLE_ERROR = '资产存储尚未就绪。';
const ASSET_STORE_STALE_ERROR = '资产状态已变化，请重试。';

interface IReplaceAssetSnapshotInput {
	canCommit(): boolean;
	expectedGeneration: number;
	files: ReadonlyMap<string, Blob>;
	folders: readonly string[];
}

function mapUrlsToRecord(urls: ReadonlyMap<string, string>) {
	return Object.fromEntries(urls) as Record<string, string>;
}

export function useAssetStore(onMutation: () => void) {
	const filesRef = useRef<Map<string, Blob>>(new Map());
	const foldersRef = useRef<readonly string[]>(EMPTY_FOLDERS);
	const generationRef = useRef(0);
	const isMountedRef = useRef(false);
	const urlsRef = useRef<Map<string, string>>(new Map());
	const urlRegistryRef = useRef<IObjectUrlRegistry | null>(null);
	const [assetState, setAssetState] =
		useState<IAssetState>(EMPTY_ASSET_STATE);

	useEffect(() => {
		const urlRegistry = createObjectUrlRegistry({
			createObjectURL: (blob) => URL.createObjectURL(blob),
			revokeObjectURL: (url) => URL.revokeObjectURL(url),
		});
		isMountedRef.current = true;
		urlRegistryRef.current = urlRegistry;
		return () => {
			if (urlRegistryRef.current === urlRegistry) {
				isMountedRef.current = false;
				urlRegistryRef.current = null;
			}
			urlRegistry.dispose();
		};
	}, []);

	const readActiveUrlRegistry = useCallback(() => {
		if (!isMountedRef.current) return null;
		return urlRegistryRef.current;
	}, []);

	const commitTransaction = useCallback(
		(
			transaction: IAssetMapsTransaction,
			urlRegistry: IObjectUrlRegistry,
			folders: readonly string[] = foldersRef.current
		) => {
			filesRef.current = transaction.files;
			foldersRef.current = folders;
			urlsRef.current = transaction.urls;
			const publishedUrls = mapUrlsToRecord(transaction.urls);
			setAssetState({
				folders,
				generation: generationRef.current,
				urls: publishedUrls,
			});
			transaction.urlsToRevoke.forEach(urlRegistry.revoke);
		},
		[]
	);

	const replaceAssets = useCallback(
		(files: ReadonlyMap<string, Blob>, folders: readonly string[]) => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) return;
			const updateError = getAssetSnapshotReplacementError(
				files,
				folders
			);
			if (updateError) throw new Error(updateError);
			const transaction = replaceAssetMaps(files, urlRegistry);
			const previousUrls = urlsRef.current;
			const nextFolders = normalizeAssetFolders(folders);
			generationRef.current += 1;
			filesRef.current = transaction.files;
			foldersRef.current = nextFolders;
			urlsRef.current = transaction.urls;
			setAssetState({
				folders: nextFolders,
				generation: generationRef.current,
				urls: mapUrlsToRecord(transaction.urls),
			});
			previousUrls.forEach(urlRegistry.revoke);
		},
		[readActiveUrlRegistry]
	);

	const replaceAssetSnapshot = useCallback(
		(input: IReplaceAssetSnapshotInput): IAssetMutationResult => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) {
				return {
					error: ASSET_STORE_UNAVAILABLE_ERROR,
					isSuccess: false,
				};
			}
			const canCommit = () => {
				try {
					return input.canCommit();
				} catch {
					return false;
				}
			};
			if (
				generationRef.current !== input.expectedGeneration ||
				!canCommit()
			) {
				return { error: ASSET_STORE_STALE_ERROR, isSuccess: false };
			}
			const replacementError = getAssetSnapshotReplacementError(
				input.files,
				input.folders
			);
			if (replacementError) {
				return { error: replacementError, isSuccess: false };
			}
			const nextFolders = normalizeAssetFolders(input.folders);
			if (
				areAssetSnapshotsEqual(
					filesRef.current,
					foldersRef.current,
					input.files,
					nextFolders
				)
			) {
				return generationRef.current === input.expectedGeneration &&
					canCommit()
					? { isSuccess: true }
					: { error: ASSET_STORE_STALE_ERROR, isSuccess: false };
			}

			let transaction: IAssetMapsTransaction;
			try {
				transaction = replaceAssetMaps(input.files, urlRegistry);
			} catch (error) {
				return {
					error:
						error instanceof Error ? error.message : String(error),
					isSuccess: false,
				};
			}
			if (
				generationRef.current !== input.expectedGeneration ||
				!canCommit()
			) {
				transaction.urls.forEach(urlRegistry.revoke);
				return { error: ASSET_STORE_STALE_ERROR, isSuccess: false };
			}

			const previousUrls = urlsRef.current;
			generationRef.current += 1;
			filesRef.current = transaction.files;
			foldersRef.current = nextFolders;
			urlsRef.current = transaction.urls;
			setAssetState({
				folders: nextFolders,
				generation: generationRef.current,
				urls: mapUrlsToRecord(transaction.urls),
			});
			previousUrls.forEach(urlRegistry.revoke);
			return { isSuccess: true };
		},
		[readActiveUrlRegistry]
	);

	const clearAssets = useCallback(() => {
		const urlRegistry = readActiveUrlRegistry();
		if (!urlRegistry) return;
		const previousUrls = urlsRef.current;
		generationRef.current += 1;
		filesRef.current = new Map();
		foldersRef.current = EMPTY_FOLDERS;
		urlsRef.current = new Map();
		setAssetState({
			folders: EMPTY_FOLDERS,
			generation: generationRef.current,
			urls: {},
		});
		previousUrls.forEach(urlRegistry.revoke);
	}, [readActiveUrlRegistry]);

	const updateAsset = useCallback(
		(path: string, blob: Blob): IAssetMutationResult => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) {
				return {
					isSuccess: false,
					error: ASSET_STORE_UNAVAILABLE_ERROR,
				};
			}
			const updates = new Map([[path, blob]]);
			const nextFolders = addAssetFileParentFolders(
				foldersRef.current,
				updates.keys()
			);
			const updateError = getAssetUpdateError(
				filesRef.current,
				nextFolders,
				updates
			);
			if (updateError) return { isSuccess: false, error: updateError };
			const transaction = updateAssetMaps(
				filesRef.current,
				urlsRef.current,
				path,
				blob,
				urlRegistry
			);
			commitTransaction(transaction, urlRegistry, nextFolders);
			onMutation();
			return { isSuccess: true };
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const updateAssets = useCallback(
		(updates: ReadonlyMap<string, Blob>): IAssetMutationResult => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) {
				return {
					isSuccess: false,
					error: ASSET_STORE_UNAVAILABLE_ERROR,
				};
			}
			if (updates.size === 0) return { isSuccess: true };
			const nextFolders = addAssetFileParentFolders(
				foldersRef.current,
				updates.keys()
			);
			const updateError = getAssetUpdateError(
				filesRef.current,
				nextFolders,
				updates
			);
			if (updateError) return { isSuccess: false, error: updateError };
			const transaction = updateAssetMapsBatch(
				filesRef.current,
				urlsRef.current,
				updates,
				urlRegistry
			);
			commitTransaction(transaction, urlRegistry, nextFolders);
			onMutation();
			return { isSuccess: true };
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const removeAsset = useCallback(
		(path: string) => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) return;
			const transaction = removeAssetMaps(
				filesRef.current,
				urlsRef.current,
				path
			);
			if (!transaction.hasChanged) return;
			commitTransaction(transaction, urlRegistry);
			onMutation();
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const removeAssets = useCallback(
		(paths: readonly string[]) => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry || paths.length === 0) return;
			const transaction = removeAssetMapsBatch(
				filesRef.current,
				urlsRef.current,
				paths
			);
			if (!transaction.hasChanged) return;
			commitTransaction(transaction, urlRegistry);
			onMutation();
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const createAssetFolder = useCallback(
		(path: string): IAssetMutationResult => {
			if (!isMountedRef.current) {
				return {
					isSuccess: false,
					error: ASSET_STORE_UNAVAILABLE_ERROR,
				};
			}
			const folder = path.endsWith('/') ? path : `${path}/`;
			const creationError = getAssetFolderCreationError(
				filesRef.current,
				folder
			);
			if (creationError) {
				return { isSuccess: false, error: creationError };
			}
			const nextFolders = normalizeAssetFolders([
				...foldersRef.current,
				folder,
			]);
			if (nextFolders.length === foldersRef.current.length) {
				return { isSuccess: true };
			}
			foldersRef.current = nextFolders;
			setAssetState((current) => ({ ...current, folders: nextFolders }));
			onMutation();
			return { isSuccess: true };
		},
		[onMutation]
	);

	const removeAssetFolders = useCallback(
		(paths: readonly string[]) => {
			if (!isMountedRef.current) return;
			const folders = paths.map((path) =>
				path.endsWith('/') ? path : `${path}/`
			);
			if (folders.length === 0) return;
			const nextFolders = normalizeAssetFolders(
				foldersRef.current.filter(
					(folder) =>
						folder === 'assets/' ||
						!folders.some(
							(target) =>
								folder === target || folder.startsWith(target)
						)
				)
			);
			if (nextFolders.length === foldersRef.current.length) return;
			foldersRef.current = nextFolders;
			setAssetState((current) => ({ ...current, folders: nextFolders }));
			onMutation();
		},
		[onMutation]
	);

	const moveAssets = useCallback(
		(operations: readonly IAssetPathOperation[]) => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) return;
			if (operations.length === 0) return;
			const fileOperations = operations.filter(
				(operation) => !operation.from.endsWith('/')
			);
			const transaction = moveAssetMaps(
				filesRef.current,
				urlsRef.current,
				fileOperations
			);
			const folderTransaction = moveAssetFolders(
				foldersRef.current,
				operations
			);
			if (!transaction.hasChanged && !folderTransaction.hasChanged)
				return false;
			commitTransaction(
				transaction,
				urlRegistry,
				folderTransaction.folders
			);
			onMutation();
			return true;
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const copyAssets = useCallback(
		(operations: readonly IAssetPathOperation[]) => {
			const urlRegistry = readActiveUrlRegistry();
			if (!urlRegistry) return;
			if (operations.length === 0) return;
			const fileOperations = operations.filter(
				(operation) => !operation.from.endsWith('/')
			);
			const transaction = copyAssetMaps(
				filesRef.current,
				urlsRef.current,
				fileOperations,
				urlRegistry
			);
			const folderTransaction = copyAssetFolders(
				foldersRef.current,
				operations
			);
			if (!transaction.hasChanged && !folderTransaction.hasChanged)
				return;
			commitTransaction(
				transaction,
				urlRegistry,
				folderTransaction.folders
			);
			onMutation();
		},
		[commitTransaction, onMutation, readActiveUrlRegistry]
	);

	const getAssetUrl = useCallback((path: string | undefined) => {
		return path ? urlsRef.current.get(path) : undefined;
	}, []);
	const getAssetGeneration = useCallback(() => generationRef.current, []);
	const isAssetGenerationCurrent = useCallback(
		(expectedGeneration: number) =>
			expectedGeneration === generationRef.current,
		[]
	);

	const getAssetSnapshot = useCallback((): IAssetSnapshot => {
		return {
			files: new Map(filesRef.current),
			folders: [...foldersRef.current],
		};
	}, []);

	return {
		assetState,
		clearAssets,
		copyAssets,
		createAssetFolder,
		getAssetGeneration,
		getAssetSnapshot,
		getAssetUrl,
		isAssetGenerationCurrent,
		moveAssets,
		removeAsset,
		removeAssets,
		removeAssetFolders,
		replaceAssets,
		replaceAssetSnapshot,
		updateAsset,
		updateAssets,
	};
}
