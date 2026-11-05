'use client';

import {
	type PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { remapResourcePackAssetReferences } from '@/domain/resourcePack/assetReferences';
import type {
	LikeTag,
	SpawnConfig,
} from '@/domain/resourcePack/contracts/character';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { createBlankResourcePack } from '@/domain/resourcePack/createBlankResourcePack';

import { downloadResourcePack } from '@/features/resourceEditor/client/archive/downloadResourcePack';
import { writeResourcePackArchive } from '@/features/resourceEditor/client/archive/writeResourcePackArchive';
import type { IAssetPathOperation } from '@/features/resourceEditor/client/assets/contracts';
import { useAssetStore } from '@/features/resourceEditor/client/assets/useAssetStore';
import type { IWorkspaceSnapshot } from '@/features/resourceEditor/client/workspaces/contracts';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';
import {
	clearGuestDrafts as clearStoredGuestDrafts,
	createEmptyWorkspaceEditorState,
	readGuestLikeTagDraft,
	readGuestSpawnDraft,
	replaceGuestLikeTagDraft as replaceStoredGuestLikeTagDraft,
	replaceGuestSpawnDraft as replaceStoredGuestSpawnDraft,
	replaceWorkspaceEditorStateCharacterId,
	type TGuestLikeTagDraftField,
} from '@/features/resourceEditor/client/workspaces/workspaceEditorState';

import type {
	IResourceEditorBatchMutationInput,
	IResourceEditorBatchMutationResult,
	IResourceEditorExportResult,
	TResourceEditorMutationSnapshot,
	TResourceExportStatus,
} from './contracts';
import { runResourcePackExport } from './runResourcePackExport';
import { ResourceEditorContext } from './useResourceEditor';

import '@/features/resourceEditor/client/assets/styles.scss';

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

const RESOURCE_EDITOR_UNMOUNTED_ERROR = '资源编辑器已卸载';
const RESOURCE_EDITOR_EXPORT_SNAPSHOT_ERROR = '正在导出，不能修改资源包';

export function ResourceEditorProvider({ children }: PropsWithChildren) {
	const {
		activeWorkspace,
		flushActiveSave,
		isExportSnapshot,
		leaseLoss,
		promoteActiveCheckpoint,
		retryActiveSave,
		saveActiveSnapshot,
		saveError,
		saveStatus,
		storageMode,
		workspaces,
	} = useResourceWorkspaces();
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
		null
	);
	const [resourcePack, setResourcePack] = useState<ResourceEx>(() =>
		createBlankResourcePack()
	);
	const [license, setLicense] = useState('');
	const [hasChangesSinceCheckpoint, setHasChangesSinceCheckpoint] =
		useState(false);
	const [isCurrentExported, setIsCurrentExported] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isLocalSavePending, setIsLocalSavePending] = useState(false);
	const [revision, setRevision] = useState(0);
	const activeWorkspaceIdRef = useRef<string | null>(null);
	const editorStateRef = useRef(createEmptyWorkspaceEditorState());
	const hasLicenseFileRef = useRef(false);
	const isExportingRef = useRef(false);
	const isExportSnapshotRef = useRef(isExportSnapshot);
	const isMountedRef = useRef(false);
	const licenseRef = useRef(license);
	const leaseLossRef = useRef(leaseLoss);
	const appliedSnapshotRef = useRef<IWorkspaceSnapshot | null>(null);
	const resourcePackRef = useRef(resourcePack);
	const revisionRef = useRef(revision);
	isExportSnapshotRef.current = isExportSnapshot;
	leaseLossRef.current = leaseLoss;
	const bumpRevision = useCallback(() => {
		const nextRevision = revisionRef.current + 1;
		revisionRef.current = nextRevision;
		setRevision(nextRevision);
		return nextRevision;
	}, []);
	const markDirty = useCallback(() => {
		if (isExportSnapshotRef.current) return;
		bumpRevision();
		setHasChangesSinceCheckpoint(true);
		setIsCurrentExported(false);
		setIsLocalSavePending(true);
	}, [bumpRevision]);
	const {
		assetState,
		copyAssets: copyStoredAssets,
		createAssetFolder: createStoredAssetFolder,
		getAssetGeneration,
		getAssetSnapshot,
		getAssetUrl,
		isAssetGenerationCurrent,
		moveAssets: moveStoredAssets,
		removeAsset: removeStoredAsset,
		removeAssets: removeStoredAssets,
		removeAssetFolders: removeStoredAssetFolders,
		replaceAssets,
		replaceAssetSnapshot,
		updateAsset: updateStoredAsset,
		updateAssets: updateStoredAssets,
	} = useAssetStore(markDirty);
	const copyAssets = useCallback(
		(operations: readonly IAssetPathOperation[]) => {
			if (isExportSnapshotRef.current) return;
			copyStoredAssets(operations);
		},
		[copyStoredAssets]
	);
	const createAssetFolder = useCallback(
		(path: string) =>
			isExportSnapshotRef.current
				? {
						error: RESOURCE_EDITOR_EXPORT_SNAPSHOT_ERROR,
						isSuccess: false,
					}
				: createStoredAssetFolder(path),
		[createStoredAssetFolder]
	);
	const removeAsset = useCallback(
		(path: string) => {
			if (isExportSnapshotRef.current) return;
			removeStoredAsset(path);
		},
		[removeStoredAsset]
	);
	const removeAssets = useCallback(
		(paths: readonly string[]) => {
			if (isExportSnapshotRef.current) return;
			removeStoredAssets(paths);
		},
		[removeStoredAssets]
	);
	const removeAssetFolders = useCallback(
		(paths: readonly string[]) => {
			if (isExportSnapshotRef.current) return;
			removeStoredAssetFolders(paths);
		},
		[removeStoredAssetFolders]
	);
	const updateAsset = useCallback(
		(path: string, blob: Blob) =>
			isExportSnapshotRef.current
				? {
						error: RESOURCE_EDITOR_EXPORT_SNAPSHOT_ERROR,
						isSuccess: false,
					}
				: updateStoredAsset(path, blob),
		[updateStoredAsset]
	);
	const updateAssets = useCallback(
		(updates: ReadonlyMap<string, Blob>) =>
			isExportSnapshotRef.current
				? {
						error: RESOURCE_EDITOR_EXPORT_SNAPSHOT_ERROR,
						isSuccess: false,
					}
				: updateStoredAssets(updates),
		[updateStoredAssets]
	);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			const hasTemporaryWorkspaces =
				storageMode === 'memory' && workspaces.length > 0;
			if (
				!isLocalSavePending &&
				saveStatus !== 'saving' &&
				saveStatus !== 'error' &&
				saveStatus !== 'memory-only' &&
				!hasTemporaryWorkspaces
			) {
				return;
			}
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () =>
			window.removeEventListener('beforeunload', handleBeforeUnload);
	}, [isLocalSavePending, saveStatus, storageMode, workspaces.length]);

	const updateResourcePack = useCallback(
		(updater: (current: ResourceEx) => ResourceEx) => {
			if (isExportSnapshotRef.current) return;
			const nextResourcePack = updater(resourcePackRef.current);
			resourcePackRef.current = nextResourcePack;
			setResourcePack(nextResourcePack);
			markDirty();
		},
		[markDirty]
	);

	const applyWorkspaceMutation = useCallback(
		(
			input: IResourceEditorBatchMutationInput
		): IResourceEditorBatchMutationResult => {
			if (!isMountedRef.current) {
				return {
					error: RESOURCE_EDITOR_UNMOUNTED_ERROR,
					isSuccess: false,
				};
			}
			if (isExportSnapshotRef.current) {
				return {
					error: RESOURCE_EDITOR_EXPORT_SNAPSHOT_ERROR,
					isSuccess: false,
				};
			}
			const workspaceId = activeWorkspaceIdRef.current;
			if (!workspaceId) {
				return { error: '当前没有可编辑的资源包', isSuccess: false };
			}
			if (leaseLossRef.current) {
				return {
					error: '当前页面已失去资源包编辑权',
					isSuccess: false,
				};
			}
			if (revisionRef.current !== input.expectedRevision) {
				return {
					error: '资源内容已变化，请重新操作',
					isSuccess: false,
				};
			}

			const assetGeneration = getAssetGeneration();
			const assets = getAssetSnapshot();
			const current = {
				...assets,
				editorState: editorStateRef.current,
				hasLicenseFile: hasLicenseFileRef.current,
				license: licenseRef.current,
				resourcePack: resourcePackRef.current,
			};
			let next: TResourceEditorMutationSnapshot;
			try {
				next = input.mutate(current);
			} catch (error) {
				return { error: describeError(error), isSuccess: false };
			}

			const canCommit = () =>
				isMountedRef.current &&
				!isExportSnapshotRef.current &&
				!leaseLossRef.current &&
				activeWorkspaceIdRef.current === workspaceId &&
				revisionRef.current === input.expectedRevision &&
				getAssetGeneration() === assetGeneration;
			if (!canCommit()) {
				return {
					error: '资源内容已变化，请重新操作',
					isSuccess: false,
				};
			}
			const assetResult = replaceAssetSnapshot({
				canCommit,
				expectedGeneration: assetGeneration,
				files: next.files,
				folders: next.folders,
			});
			if (!assetResult.isSuccess) return assetResult;

			editorStateRef.current = next.editorState;
			hasLicenseFileRef.current = next.hasLicenseFile;
			licenseRef.current = next.license;
			resourcePackRef.current = next.resourcePack;
			setLicense(next.license);
			setResourcePack(next.resourcePack);
			const nextRevision = bumpRevision();
			setHasChangesSinceCheckpoint(true);
			setIsCurrentExported(false);
			setIsLocalSavePending(true);
			return { isSuccess: true, revision: nextRevision };
		},
		[
			bumpRevision,
			getAssetGeneration,
			getAssetSnapshot,
			replaceAssetSnapshot,
		]
	);

	const clearGuestDrafts = useCallback((characterId: number) => {
		if (isExportSnapshotRef.current) return;
		editorStateRef.current = clearStoredGuestDrafts(
			editorStateRef.current,
			characterId
		);
	}, []);

	const getGuestLikeTagDraft = useCallback(
		(characterId: number, field: TGuestLikeTagDraftField, tagId: number) =>
			readGuestLikeTagDraft(
				editorStateRef.current,
				characterId,
				field,
				tagId
			),
		[]
	);
	const getGuestSpawnDraft = useCallback(
		(characterId: number, izakayaId: number) =>
			readGuestSpawnDraft(editorStateRef.current, characterId, izakayaId),
		[]
	);
	const replaceGuestLikeTagDraft = useCallback(
		(
			characterId: number,
			field: TGuestLikeTagDraftField,
			tagId: number,
			tag: LikeTag | undefined
		) => {
			if (isExportSnapshotRef.current) return;
			editorStateRef.current = replaceStoredGuestLikeTagDraft(
				editorStateRef.current,
				characterId,
				field,
				tagId,
				tag
			);
		},
		[]
	);
	const replaceGuestSpawnDraft = useCallback(
		(
			characterId: number,
			izakayaId: number,
			spawn: SpawnConfig | undefined
		) => {
			if (isExportSnapshotRef.current) return;
			editorStateRef.current = replaceStoredGuestSpawnDraft(
				editorStateRef.current,
				characterId,
				izakayaId,
				spawn
			);
		},
		[]
	);
	const replaceGuestDraftCharacterId = useCallback(
		(previousCharacterId: number, nextCharacterId: number) => {
			if (isExportSnapshotRef.current) return;
			editorStateRef.current = replaceWorkspaceEditorStateCharacterId(
				editorStateRef.current,
				previousCharacterId,
				nextCharacterId
			);
		},
		[]
	);

	const moveAssets = useCallback(
		(operations: readonly IAssetPathOperation[]) => {
			if (isExportSnapshotRef.current) return;
			if (!moveStoredAssets(operations)) return;
			const pathMap = new Map(
				operations
					.filter(({ from }) => !from.endsWith('/'))
					.map(({ from, to }) => [from, to] as const)
			);
			const nextResourcePack = remapResourcePackAssetReferences(
				resourcePackRef.current,
				pathMap
			);
			if (nextResourcePack === resourcePackRef.current) return;
			resourcePackRef.current = nextResourcePack;
			setResourcePack(nextResourcePack);
		},
		[moveStoredAssets]
	);

	const replaceLicense = useCallback(
		(nextLicense: string) => {
			if (isExportSnapshotRef.current) return;
			hasLicenseFileRef.current = nextLicense.length > 0;
			licenseRef.current = nextLicense;
			setLicense(nextLicense);
			markDirty();
		},
		[markDirty]
	);

	const readCurrentSnapshot = useCallback(
		(expectedRevision: number) => {
			if (!isMountedRef.current) return null;
			if (revisionRef.current !== expectedRevision) return null;
			const assets = getAssetSnapshot();
			if (revisionRef.current !== expectedRevision) return null;
			return {
				...assets,
				editorState: editorStateRef.current,
				hasLicenseFile: hasLicenseFileRef.current,
				license: licenseRef.current,
				resourcePack: resourcePackRef.current,
				revision: expectedRevision,
			};
		},
		[getAssetSnapshot]
	);
	const readCurrentWorkspaceSnapshot = useCallback(
		() => readCurrentSnapshot(revisionRef.current),
		[readCurrentSnapshot]
	);

	useEffect(() => {
		if (!activeWorkspace) {
			appliedSnapshotRef.current = null;
			editorStateRef.current = createEmptyWorkspaceEditorState();
			activeWorkspaceIdRef.current = null;
			setActiveWorkspaceId(null);
			setIsLocalSavePending(false);
			return;
		}
		const { snapshot, workspace } = activeWorkspace;
		// 只有新加载的快照才替换编辑内容；摘要同步沿用已应用的快照。
		const isApplied = appliedSnapshotRef.current === snapshot;
		appliedSnapshotRef.current = snapshot;
		if (
			activeWorkspaceId === workspace.id &&
			(isApplied || revisionRef.current === snapshot.revision)
		) {
			return;
		}
		editorStateRef.current = snapshot.editorState;
		replaceAssets(snapshot.files, snapshot.folders);
		resourcePackRef.current = snapshot.resourcePack;
		hasLicenseFileRef.current = snapshot.hasLicenseFile;
		licenseRef.current = snapshot.license;
		revisionRef.current = snapshot.revision;
		setResourcePack(snapshot.resourcePack);
		setLicense(snapshot.license);
		setRevision(snapshot.revision);
		setHasChangesSinceCheckpoint(
			workspace.currentRevision !== workspace.checkpointRevision
		);
		setIsCurrentExported(workspace.isCurrentExported);
		setIsLocalSavePending(false);
		activeWorkspaceIdRef.current = workspace.id;
		setActiveWorkspaceId(workspace.id);
	}, [activeWorkspace, activeWorkspaceId, replaceAssets]);

	useEffect(() => {
		if (
			!activeWorkspaceId ||
			activeWorkspace?.workspace.id !== activeWorkspaceId ||
			revisionRef.current !== revision
		) {
			return;
		}
		const snapshot = readCurrentSnapshot(revision);
		if (!snapshot) return;
		saveActiveSnapshot(snapshot);
	}, [
		activeWorkspace?.workspace.id,
		activeWorkspaceId,
		readCurrentSnapshot,
		revision,
		saveActiveSnapshot,
	]);

	useEffect(() => {
		if (saveStatus === 'saved') setIsLocalSavePending(false);
	}, [saveStatus]);

	const flushLocalSave = useCallback(async () => {
		if (activeWorkspaceId) {
			const snapshot = readCurrentSnapshot(revisionRef.current);
			if (snapshot) saveActiveSnapshot(snapshot);
		}
		const result = await flushActiveSave();
		if (result.isSuccess) setIsLocalSavePending(false);
		return result;
	}, [
		activeWorkspaceId,
		flushActiveSave,
		readCurrentSnapshot,
		saveActiveSnapshot,
	]);

	const retryLocalSave = useCallback(() => {
		const snapshot = readCurrentSnapshot(revisionRef.current);
		if (snapshot) saveActiveSnapshot(snapshot);
		retryActiveSave();
	}, [readCurrentSnapshot, retryActiveSave, saveActiveSnapshot]);

	const clearDirtyIfRevision = useCallback((expectedRevision: number) => {
		if (!isMountedRef.current) return false;
		if (revisionRef.current !== expectedRevision) return false;
		setHasChangesSinceCheckpoint(false);
		setIsCurrentExported(true);
		return true;
	}, []);

	const exportStatus: TResourceExportStatus = hasChangesSinceCheckpoint
		? 'modified'
		: isCurrentExported
			? 'exported'
			: 'unexported';

	const exportArchive = useCallback(
		async (
			expectedRevision: number,
			filename?: string
		): Promise<IResourceEditorExportResult> => {
			if (!isMountedRef.current) {
				return {
					isSuccess: false,
					error: RESOURCE_EDITOR_UNMOUNTED_ERROR,
				};
			}
			if (isExportingRef.current) {
				return { isSuccess: false, error: '资源包正在导出' };
			}
			isExportingRef.current = true;
			setIsExporting(true);
			try {
				const result = await runResourcePackExport({
					clearDirtyIfRevision,
					downloadArchive: downloadResourcePack,
					expectedRevision,
					...(filename === undefined ? {} : { filename }),
					readCurrentRevision: () => revisionRef.current,
					readSnapshot: readCurrentSnapshot,
					writeArchive: writeResourcePackArchive,
				});
				if (!result.isSuccess) return result;
				if (isExportSnapshotRef.current) return result;
				const checkpointResult =
					await promoteActiveCheckpoint(expectedRevision);
				return checkpointResult.isSuccess
					? result
					: {
							...result,
							warning: `资源包已导出，但本地恢复版本更新失败：${checkpointResult.error ?? '未知错误'}`,
						};
			} catch (error) {
				if (isMountedRef.current) console.error(error);
				return { isSuccess: false, error: describeError(error) };
			} finally {
				isExportingRef.current = false;
				if (isMountedRef.current) setIsExporting(false);
			}
		},
		[clearDirtyIfRevision, promoteActiveCheckpoint, readCurrentSnapshot]
	);

	const value = useMemo(
		() => ({
			activeWorkspaceId,
			applyWorkspaceMutation,
			assets: assetState,
			clearGuestDrafts,
			copyAssets,
			createAssetFolder,
			exportStatus,
			exportArchive,
			flushLocalSave,
			getGuestLikeTagDraft,
			getGuestSpawnDraft,
			getAssetUrl,
			isAssetGenerationCurrent,
			isExporting,
			isLocalSavePending,
			license,
			localSaveError: saveError,
			localSaveStatus: saveStatus,
			moveAssets,
			readCurrentWorkspaceSnapshot,
			removeAsset,
			removeAssets,
			removeAssetFolders,
			replaceGuestDraftCharacterId,
			replaceGuestLikeTagDraft,
			replaceGuestSpawnDraft,
			replaceLicense,
			resourcePack,
			retryLocalSave,
			revision,
			storageMode,
			updateAsset,
			updateAssets,
			updateResourcePack,
		}),
		[
			activeWorkspaceId,
			applyWorkspaceMutation,
			assetState,
			clearGuestDrafts,
			copyAssets,
			createAssetFolder,
			exportStatus,
			exportArchive,
			flushLocalSave,
			getGuestLikeTagDraft,
			getGuestSpawnDraft,
			getAssetUrl,
			isAssetGenerationCurrent,
			isExporting,
			isLocalSavePending,
			license,
			moveAssets,
			readCurrentWorkspaceSnapshot,
			removeAsset,
			removeAssets,
			removeAssetFolders,
			replaceGuestDraftCharacterId,
			replaceGuestLikeTagDraft,
			replaceGuestSpawnDraft,
			replaceLicense,
			resourcePack,
			retryLocalSave,
			revision,
			saveError,
			saveStatus,
			storageMode,
			updateAsset,
			updateAssets,
			updateResourcePack,
		]
	);

	return (
		<ResourceEditorContext.Provider value={value}>
			{children}
		</ResourceEditorContext.Provider>
	);
}
