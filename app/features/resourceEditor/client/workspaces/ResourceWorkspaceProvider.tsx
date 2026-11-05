'use client';

import {
	type PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { createBlankResourcePack } from '@/domain/resourcePack/createBlankResourcePack';

import { readResourcePackArchive } from '@/features/resourceEditor/client/archive/readResourcePackArchive';

import { calculateBlobSha256 } from '@/infrastructure/browser/crypto/calculateBlobSha256';
import { safeStorage } from '@/infrastructure/browser/storage/safeStorage';

import type {
	ICreateWorkspaceArchiveInput,
	IWorkspaceDuplicateIntent,
	IWorkspaceImportCandidate,
	IWorkspaceImportResult,
	IWorkspaceLeaseConflict,
	IWorkspaceLeaseLoss,
	IWorkspaceLeaseLossResolution,
	IWorkspaceLoadedSnapshot,
	IWorkspaceOperationResult,
	IWorkspaceOpenOptions,
	IWorkspaceRepository,
	IWorkspaceSnapshot,
	IWorkspaceSummary,
	IWorkspaceYieldResult,
	TWorkspaceImportResolution,
	TWorkspaceLifecycleStatus,
	TWorkspaceLoadSource,
	TWorkspaceSaveStatus,
	TWorkspaceStorageMode,
} from './contracts';
import { createMemoryWorkspaceRepository } from './memoryWorkspaceRepository';
import { ResourceWorkspaceContext } from './useResourceWorkspaces';
import {
	createWorkspaceCatalogSync,
	type IWorkspaceCatalogSync,
	WORKSPACE_CATALOG_CHANNEL_NAME,
} from './workspaceCatalogSync';
import { WorkspacePersistenceError } from './workspaceDatabase';
import {
	claimWorkspaceOwnerId,
	createWorkspaceLeaseController,
	type IWorkspaceLeaseController,
} from './workspaceLease';
import { createWorkspaceLeaseLossCopyName } from './workspaceLeaseLoss';
import {
	readWorkspaceLeaseReleaseIntents,
	removeWorkspaceLeaseReleaseIntent,
	writeWorkspaceLeaseReleaseIntent,
} from './workspaceLeaseReleaseIntent';
import { migrateTemporaryWorkspaces } from './workspaceMigration';
import { createWorkspaceRepository } from './workspaceRepository';
import {
	createWorkspaceSaveQueue,
	type IWorkspaceSaveQueue,
} from './workspaceSaveQueue';

const LAST_ACTIVE_WORKSPACE_SESSION_KEY = 'resourceEditorLastWorkspaceIdV2';
const LEGACY_LAST_ACTIVE_WORKSPACE_STORAGE_KEY =
	'resourceEditorLastWorkspaceId';
const WORKSPACE_AUTOSAVE_DELAY_MS = 400;
const WORKSPACE_OWNER_CHANNEL_NAME = 'resourceEditorWorkspaceOwners';
const WORKSPACE_OWNER_CLAIM_DELAY_MS = 50;
const WORKSPACE_RECOVERY_COPY_SUFFIX = '（恢复副本）';

interface IPendingImport {
	candidates: readonly IWorkspaceImportCandidate[];
	input: ICreateWorkspaceArchiveInput;
	settle(result: IWorkspaceImportResult): void;
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function operationError(error: unknown): IWorkspaceOperationResult {
	return { error: describeError(error), isSuccess: false };
}

function shouldUseMemoryFallback(error: unknown) {
	if (error instanceof DOMException) return true;
	return (
		error instanceof WorkspacePersistenceError &&
		error.code !== 'lease-conflict' &&
		error.code !== 'stale-revision'
	);
}

function isLeaseConflictError(error: unknown) {
	return (
		(error instanceof WorkspacePersistenceError &&
			error.code === 'lease-conflict') ||
		(error instanceof Error && error.message.includes('正在其他页面中编辑'))
	);
}

function snapshotToArchiveInput(
	snapshot: IWorkspaceSnapshot,
	displayName: string,
	isCheckpointExported: boolean,
	sourceArchiveHash: string | undefined
): ICreateWorkspaceArchiveInput {
	return {
		displayName,
		editorState: snapshot.editorState,
		files: snapshot.files,
		folders: snapshot.folders,
		hasLicenseFile: snapshot.hasLicenseFile,
		isCheckpointExported,
		license: snapshot.license,
		resourcePack: snapshot.resourcePack,
		...(sourceArchiveHash === undefined ? {} : { sourceArchiveHash }),
	};
}

async function loadCurrentAndCheckpoint(
	repository: IWorkspaceRepository,
	workspaceId: string
) {
	const current = await repository.load(workspaceId, 'current');
	const checkpointSnapshot =
		current.workspace.currentRevision ===
		current.workspace.checkpointRevision
			? current.snapshot
			: (await repository.load(workspaceId, 'checkpoint')).snapshot;
	return { checkpointSnapshot, current };
}

function markWorkspaceReleased(
	loaded: IWorkspaceLoadedSnapshot
): IWorkspaceLoadedSnapshot {
	const workspace = { ...loaded.workspace, isEditing: false };
	delete workspace.editingExpiresAt;
	return { snapshot: loaded.snapshot, workspace };
}

export function ResourceWorkspaceProvider({ children }: PropsWithChildren) {
	const [memoryRepository] = useState<IWorkspaceRepository>(() =>
		createMemoryWorkspaceRepository({
			createBlankResourcePack,
			createId: () => crypto.randomUUID(),
			now: () => Date.now(),
		})
	);
	const [activeWorkspace, setActiveWorkspace] =
		useState<IWorkspaceLoadedSnapshot | null>(null);
	const [duplicateIntent, setDuplicateIntent] =
		useState<IWorkspaceDuplicateIntent | null>(null);
	const [leaseConflict, setLeaseConflict] =
		useState<IWorkspaceLeaseConflict | null>(null);
	const [leaseLoss, setLeaseLoss] = useState<IWorkspaceLeaseLoss | null>(
		null
	);
	const [leaseLossResolution, setLeaseLossResolution] =
		useState<IWorkspaceLeaseLossResolution | null>(null);
	const [isExportSnapshot, setIsExportSnapshot] = useState(false);
	const [isRetryingStorage, setIsRetryingStorage] = useState(false);
	const [lifecycleStatus, setLifecycleStatus] =
		useState<TWorkspaceLifecycleStatus>('hydrating');
	const [pendingExportWorkspaceId, setPendingExportWorkspaceId] = useState<
		string | null
	>(null);
	const [recoveryWorkspace, setRecoveryWorkspace] =
		useState<IWorkspaceSummary | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<TWorkspaceSaveStatus>('idle');
	const [storageError, setStorageError] = useState<string | null>(null);
	const [storageMode, setStorageMode] =
		useState<TWorkspaceStorageMode>('memory');
	const [workspaces, setWorkspaces] = useState<readonly IWorkspaceSummary[]>(
		[]
	);
	const [workspaceCatalogGeneration, setWorkspaceCatalogGeneration] =
		useState(0);
	const activeLeaseIdRef = useRef<string | null>(null);
	const activeCheckpointIsExportedRef = useRef(false);
	const activeCheckpointRevisionRef = useRef<number | null>(null);
	const activeCheckpointSnapshotRef = useRef<IWorkspaceSnapshot | null>(null);
	const activeWorkspaceRef = useRef<IWorkspaceLoadedSnapshot | null>(null);
	const autosaveTimeoutRef = useRef<number | null>(null);
	const fallbackPromiseRef = useRef<Promise<void> | null>(null);
	const fallbackToMemoryRef = useRef<
		((error: unknown) => Promise<void>) | null
	>(null);
	const handleLeaseLossRef = useRef<
		((ownerId?: string) => Promise<void>) | null
	>(null);
	const initializationGenerationRef = useRef(0);
	const isLeaseLostRef = useRef(false);
	const lastActiveWorkspaceIdRef = useRef<string | null>(null);
	const leaseControllerRef = useRef<IWorkspaceLeaseController | null>(null);
	const isResolvingLeaseLossRef = useRef(false);
	const leaseLossPromiseRef = useRef<Promise<void> | null>(null);
	const leaseLossRef = useRef<IWorkspaceLeaseLoss | null>(null);
	const leaseLossResolutionRef = useRef<IWorkspaceLeaseLossResolution | null>(
		null
	);
	const latestSnapshotRef = useRef<IWorkspaceSnapshot | null>(null);
	const persistedRevisionRef = useRef<number | null>(null);
	const isExportSnapshotRef = useRef(false);
	const isRetryingStorageRef = useRef(false);
	const pendingImportRef = useRef<IPendingImport | null>(null);
	const pendingExportWorkspaceIdRef = useRef<string | null>(null);
	const pendingRecoveryRef = useRef<IWorkspaceLoadedSnapshot | null>(null);
	const ownerClaimDisposeRef = useRef<(() => void) | null>(null);
	const publishLoadedWorkspaceRef = useRef<
		| ((
				loaded: IWorkspaceLoadedSnapshot,
				leaseId: string,
				checkpointSnapshot: IWorkspaceSnapshot
		  ) => void)
		| null
	>(null);
	const repositoryRef = useRef<IWorkspaceRepository>(memoryRepository);
	const saveQueueRef = useRef<IWorkspaceSaveQueue | null>(null);
	const storageModeRef = useRef<TWorkspaceStorageMode>('memory');
	const summaryRefreshGenerationRef = useRef(0);
	const workspaceCatalogSyncRef = useRef<IWorkspaceCatalogSync | null>(null);
	const workspaceOwnerIdRef = useRef<string | null>(null);
	const workspacesRef = useRef<readonly IWorkspaceSummary[]>([]);

	const completePendingImport = useCallback(
		(result: IWorkspaceImportResult): IWorkspaceImportResult => {
			const pendingImport = pendingImportRef.current;
			if (!pendingImport) return result;
			pendingImportRef.current = null;
			setDuplicateIntent(null);
			pendingImport.settle(result);
			return result;
		},
		[]
	);

	const clearAutosaveTimeout = useCallback(() => {
		if (autosaveTimeoutRef.current === null) return;
		window.clearTimeout(autosaveTimeoutRef.current);
		autosaveTimeoutRef.current = null;
	}, []);

	const enqueueLatestSnapshot = useCallback(() => {
		clearAutosaveTimeout();
		if (isLeaseLostRef.current) return;
		const snapshot = latestSnapshotRef.current;
		if (snapshot) saveQueueRef.current?.enqueue(snapshot);
	}, [clearAutosaveTimeout]);

	const flushCurrentWorkspace = useCallback(async () => {
		enqueueLatestSnapshot();
		await saveQueueRef.current?.flush();
	}, [enqueueLatestSnapshot]);

	const restoreCurrentLifecycle = useCallback(() => {
		setLifecycleStatus(
			pendingRecoveryRef.current
				? 'recovering'
				: activeWorkspaceRef.current
					? 'editing'
					: 'manager'
		);
	}, []);

	const clearPendingWorkspaceExport = useCallback(() => {
		pendingExportWorkspaceIdRef.current = null;
		setPendingExportWorkspaceId(null);
	}, []);

	const dismissLeaseConflict = useCallback(() => {
		setLeaseConflict(null);
		clearPendingWorkspaceExport();
		restoreCurrentLifecycle();
	}, [clearPendingWorkspaceExport, restoreCurrentLifecycle]);

	const readLastActiveWorkspaceId = useCallback(() => {
		try {
			const workspaceId = sessionStorage.getItem(
				LAST_ACTIVE_WORKSPACE_SESSION_KEY
			);
			lastActiveWorkspaceIdRef.current = workspaceId;
			return workspaceId;
		} catch {
			return lastActiveWorkspaceIdRef.current;
		}
	}, []);

	const rememberLastActiveWorkspaceId = useCallback((workspaceId: string) => {
		lastActiveWorkspaceIdRef.current = workspaceId;
		try {
			sessionStorage.setItem(
				LAST_ACTIVE_WORKSPACE_SESSION_KEY,
				workspaceId
			);
		} catch {
			// The in-memory fallback remains available for the current page.
		}
	}, []);

	const forgetLastActiveWorkspaceId = useCallback(() => {
		lastActiveWorkspaceIdRef.current = null;
		try {
			sessionStorage.removeItem(LAST_ACTIVE_WORKSPACE_SESSION_KEY);
		} catch {
			// The in-memory fallback was already cleared.
		}
	}, []);

	const clearActiveWorkspaceState = useCallback(() => {
		clearAutosaveTimeout();
		saveQueueRef.current?.dispose();
		saveQueueRef.current = null;
		leaseControllerRef.current?.dispose();
		activeLeaseIdRef.current = null;
		activeCheckpointIsExportedRef.current = false;
		activeCheckpointRevisionRef.current = null;
		activeCheckpointSnapshotRef.current = null;
		activeWorkspaceRef.current = null;
		latestSnapshotRef.current = null;
		persistedRevisionRef.current = null;
		isExportSnapshotRef.current = false;
		setActiveWorkspace(null);
		setIsExportSnapshot(false);
		setLeaseConflict(null);
		clearPendingWorkspaceExport();
		pendingRecoveryRef.current = null;
		setRecoveryWorkspace(null);
		setSaveError(null);
		setSaveStatus('idle');
		setLifecycleStatus('manager');
		forgetLastActiveWorkspaceId();
	}, [
		clearAutosaveTimeout,
		clearPendingWorkspaceExport,
		forgetLastActiveWorkspaceId,
	]);

	const syncActiveWorkspaceSummary = useCallback(
		(summary: IWorkspaceSummary) => {
			const loaded = activeWorkspaceRef.current;
			if (!loaded || loaded.workspace.id !== summary.id) return;
			const nextLoaded = {
				snapshot: latestSnapshotRef.current ?? loaded.snapshot,
				workspace: summary,
			};
			activeWorkspaceRef.current = nextLoaded;
			if (pendingRecoveryRef.current) {
				pendingRecoveryRef.current = nextLoaded;
				setRecoveryWorkspace(summary);
				return;
			}
			// 摘要同步不更换状态中的快照：本地可能已有更新的修改尚未发布，旧快照不能覆盖它。
			setActiveWorkspace((current) =>
				current?.workspace.id === summary.id
					? { ...current, workspace: summary }
					: nextLoaded
			);
		},
		[]
	);

	const refreshSummaries = useCallback(
		async (isCatalogMutation = false) => {
			const repository = repositoryRef.current;
			const refreshGeneration = summaryRefreshGenerationRef.current + 1;
			summaryRefreshGenerationRef.current = refreshGeneration;
			let summaries: readonly IWorkspaceSummary[];
			try {
				summaries = await repository.list();
			} catch (error) {
				if (
					repositoryRef.current !== repository ||
					summaryRefreshGenerationRef.current !== refreshGeneration
				) {
					return [];
				}
				throw error;
			}
			if (
				isCatalogMutation &&
				repositoryRef.current === repository &&
				storageModeRef.current === 'persistent'
			) {
				workspaceCatalogSyncRef.current?.notify();
			}
			if (
				repositoryRef.current !== repository ||
				summaryRefreshGenerationRef.current !== refreshGeneration
			) {
				return summaries;
			}
			workspacesRef.current = summaries;
			setWorkspaces(summaries);
			if (isCatalogMutation) {
				setWorkspaceCatalogGeneration((generation) => generation + 1);
			}
			const activeWorkspaceId = activeWorkspaceRef.current?.workspace.id;
			const activeSummary = summaries.find(
				(summary) => summary.id === activeWorkspaceId
			);
			if (activeSummary) syncActiveWorkspaceSummary(activeSummary);
			if (
				activeWorkspaceId &&
				!activeSummary &&
				storageModeRef.current === 'persistent'
			) {
				await fallbackToMemoryRef.current?.(
					new Error('当前工作区已在其他页面中删除')
				);
			}
			return summaries;
		},
		[syncActiveWorkspaceSummary]
	);

	const notifyPersistentCatalogChange = useCallback(() => {
		if (storageModeRef.current === 'persistent') {
			workspaceCatalogSyncRef.current?.notify();
		}
	}, []);

	const createLeaseController = useCallback(
		(repository: IWorkspaceRepository) => {
			const ownerId = workspaceOwnerIdRef.current;
			if (!ownerId) throw new Error('资源包编辑状态尚未就绪');
			return createWorkspaceLeaseController({
				clearInterval: (intervalId) => window.clearInterval(intervalId),
				createLeaseId: () => crypto.randomUUID(),
				now: () => Date.now(),
				onLeaseLost: (ownerIdValue) => {
					if (ownerIdValue) {
						void handleLeaseLossRef.current?.(ownerIdValue);
						return;
					}
					activeLeaseIdRef.current = null;
					void fallbackToMemoryRef
						.current?.(new Error('无法续期资源包编辑权'))
						?.catch((error) =>
							setStorageError(describeError(error))
						);
				},
				ownerId,
				repository,
				setInterval: (callback, intervalMs) =>
					window.setInterval(callback, intervalMs),
			});
		},
		[]
	);

	const installLeaseController = useCallback(
		(
			repository: IWorkspaceRepository,
			controller = createLeaseController(repository)
		) => {
			leaseControllerRef.current?.dispose();
			leaseControllerRef.current = controller;
		},
		[createLeaseController]
	);

	const installRepository = useCallback(
		(
			repository: IWorkspaceRepository,
			mode: TWorkspaceStorageMode,
			error: string | null,
			controller?: IWorkspaceLeaseController
		) => {
			const previousRepository = repositoryRef.current;
			summaryRefreshGenerationRef.current += 1;
			repositoryRef.current = repository;
			storageModeRef.current = mode;
			setStorageMode(mode);
			setStorageError(error);
			installLeaseController(repository, controller);
			if (previousRepository !== repository) previousRepository.dispose();
		},
		[installLeaseController]
	);

	const fallbackToMemory = useCallback(
		async (error: unknown) => {
			if (storageModeRef.current === 'memory') {
				setStorageError(describeError(error));
				return;
			}
			if (fallbackPromiseRef.current) {
				await fallbackPromiseRef.current;
				return;
			}

			const fallbackPromise = (async () => {
				const loadedWorkspace = activeWorkspaceRef.current;
				const checkpointSnapshot = activeCheckpointSnapshotRef.current;
				const sourceWorkspaceId = loadedWorkspace?.workspace.id;
				let temporaryWorkspace: IWorkspaceLoadedSnapshot | null = null;
				if (loadedWorkspace && checkpointSnapshot) {
					let sourceArchiveHash: string | undefined;
					try {
						sourceArchiveHash =
							await repositoryRef.current.readSourceArchiveHash(
								loadedWorkspace.workspace.id
							);
					} catch {
						// The live snapshot remains usable without exact-match metadata.
					}
					temporaryWorkspace =
						await memoryRepository.createFromArchive(
							snapshotToArchiveInput(
								checkpointSnapshot,
								loadedWorkspace.workspace.displayName.endsWith(
									WORKSPACE_RECOVERY_COPY_SUFFIX
								)
									? loadedWorkspace.workspace.displayName
									: `${loadedWorkspace.workspace.displayName}${WORKSPACE_RECOVERY_COPY_SUFFIX}`,
								activeCheckpointIsExportedRef.current,
								sourceArchiveHash
							)
						);
				}

				try {
					await leaseControllerRef.current?.release();
				} catch {
					// A failed durable release must not block the temporary copy.
				}
				notifyPersistentCatalogChange();
				clearAutosaveTimeout();
				saveQueueRef.current?.dispose();
				saveQueueRef.current = null;
				activeLeaseIdRef.current = null;
				installRepository(
					memoryRepository,
					'memory',
					describeError(error)
				);
				clearPendingWorkspaceExport();

				if (temporaryWorkspace && sourceWorkspaceId) {
					const leaseResult =
						await leaseControllerRef.current?.acquire(
							temporaryWorkspace.workspace.id
						);
					if (!leaseResult?.isAcquired || !leaseResult.lease) {
						throw new Error('无法取得临时资源包的编辑权');
					}
					let persistedRevision =
						temporaryWorkspace.snapshot.revision;
					while (
						activeWorkspaceRef.current?.workspace.id ===
						sourceWorkspaceId
					) {
						const latestSnapshot = latestSnapshotRef.current;
						if (!latestSnapshot) break;
						const isCheckpointSnapshot =
							activeCheckpointRevisionRef.current ===
							latestSnapshot.revision;
						if (
							!isCheckpointSnapshot &&
							latestSnapshot.revision > persistedRevision
						) {
							await memoryRepository.saveCurrent(
								temporaryWorkspace.workspace.id,
								leaseResult.lease.leaseId,
								latestSnapshot
							);
							persistedRevision = latestSnapshot.revision;
						}
						const copiedSourceRevision = latestSnapshot.revision;
						const [loadedCurrent, loadedCheckpoint] =
							await Promise.all([
								memoryRepository.load(
									temporaryWorkspace.workspace.id,
									'current'
								),
								memoryRepository.load(
									temporaryWorkspace.workspace.id,
									'checkpoint'
								),
							]);
						if (
							latestSnapshotRef.current?.revision !==
							copiedSourceRevision
						) {
							continue;
						}
						publishLoadedWorkspaceRef.current?.(
							loadedCurrent,
							leaseResult.lease.leaseId,
							loadedCheckpoint.snapshot
						);
						break;
					}
				}
				await refreshSummaries(true);
			})();
			fallbackPromiseRef.current = fallbackPromise;
			try {
				await fallbackPromise;
			} finally {
				if (fallbackPromiseRef.current === fallbackPromise) {
					fallbackPromiseRef.current = null;
				}
			}
		},
		[
			clearPendingWorkspaceExport,
			clearAutosaveTimeout,
			installRepository,
			memoryRepository,
			notifyPersistentCatalogChange,
			refreshSummaries,
		]
	);
	fallbackToMemoryRef.current = fallbackToMemory;
	const safelyFallbackToMemory = useCallback(
		async (error: unknown) => {
			try {
				await fallbackToMemory(error);
				return null;
			} catch (fallbackError) {
				const message = describeError(fallbackError);
				setStorageError(message);
				return operationError(fallbackError);
			}
		},
		[fallbackToMemory]
	);

	const handleLeaseLoss = useCallback(
		async (ownerId?: string) => {
			if (leaseLossRef.current) return;
			if (leaseLossPromiseRef.current) {
				await leaseLossPromiseRef.current;
				return;
			}
			const loadedWorkspace = activeWorkspaceRef.current;
			if (!loadedWorkspace || isExportSnapshotRef.current) return;
			const workspaceId = loadedWorkspace.workspace.id;
			leaseLossResolutionRef.current = null;
			setLeaseLossResolution(null);
			isLeaseLostRef.current = true;
			activeLeaseIdRef.current = null;
			clearAutosaveTimeout();
			const saveQueue = saveQueueRef.current;
			const lossPromise = (async () => {
				try {
					await saveQueue?.flush();
				} catch {
					// A queued save rejected by the new lease remains in the live snapshot.
				}
				saveQueue?.dispose();
				if (saveQueueRef.current === saveQueue)
					saveQueueRef.current = null;
				leaseControllerRef.current?.dispose();
				const currentWorkspace = activeWorkspaceRef.current;
				const latestSnapshot = latestSnapshotRef.current;
				if (
					currentWorkspace?.workspace.id !== workspaceId ||
					!latestSnapshot
				) {
					isLeaseLostRef.current = false;
					return;
				}
				const persistedRevision =
					persistedRevisionRef.current ??
					currentWorkspace.snapshot.revision;
				const checkpointRevision =
					activeCheckpointRevisionRef.current ??
					currentWorkspace.workspace.checkpointRevision;
				const nextLeaseLoss: IWorkspaceLeaseLoss = {
					copyDisplayName: createWorkspaceLeaseLossCopyName(
						currentWorkspace.workspace.displayName,
						workspacesRef.current.map(
							(workspace) => workspace.displayName
						)
					),
					hasChanges: latestSnapshot.revision > checkpointRevision,
					hasUnsavedChanges:
						latestSnapshot.revision > persistedRevision,
					isResolved: false,
					workspace: currentWorkspace.workspace,
				};
				leaseLossRef.current = nextLeaseLoss;
				setLeaseLoss(nextLeaseLoss);
				setSaveError(
					ownerId
						? '该资源包已被其他页面接管'
						: '当前页面已失去资源包编辑权'
				);
				setSaveStatus('error');
			})();
			leaseLossPromiseRef.current = lossPromise;
			try {
				await lossPromise;
			} finally {
				if (leaseLossPromiseRef.current === lossPromise) {
					leaseLossPromiseRef.current = null;
				}
			}
		},
		[clearAutosaveTimeout]
	);
	handleLeaseLossRef.current = handleLeaseLoss;

	useEffect(() => {
		const generation = initializationGenerationRef.current + 1;
		initializationGenerationRef.current = generation;
		const refreshExternalCatalog = () => {
			if (storageModeRef.current !== 'persistent') return;
			setWorkspaceCatalogGeneration((current) => current + 1);
			void refreshSummaries().catch((error) =>
				setStorageError(describeError(error))
			);
		};
		let catalogChannel: BroadcastChannel | null = null;
		let leaseReleaseStorage: Storage | null = null;
		try {
			leaseReleaseStorage = window.localStorage;
		} catch {
			// The existing lease expiry remains the fallback when local storage is unavailable.
		}
		try {
			catalogChannel = new BroadcastChannel(
				WORKSPACE_CATALOG_CHANNEL_NAME
			);
		} catch {
			// Window focus still refreshes the shared persistent catalog.
		}
		const catalogSync = createWorkspaceCatalogSync({
			channel: catalogChannel,
			onCatalogChange: refreshExternalCatalog,
			onLeaseReleaseRequest: (workspaceId, leaseId) => {
				if (storageModeRef.current !== 'persistent') return;
				void repositoryRef.current
					.releaseLease(workspaceId, leaseId)
					.then(() => {
						removeWorkspaceLeaseReleaseIntent(
							leaseReleaseStorage,
							leaseId
						);
						return refreshSummaries(true);
					})
					.catch((error) => setStorageError(describeError(error)));
			},
			onWorkspaceTakeover: (workspaceId, ownerId) => {
				if (
					storageModeRef.current !== 'persistent' ||
					activeWorkspaceRef.current?.workspace.id !== workspaceId ||
					workspaceOwnerIdRef.current === ownerId
				) {
					return;
				}
				void handleLeaseLossRef.current?.(ownerId);
			},
		});
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible')
				refreshExternalCatalog();
		};
		const requestActiveLeaseRelease = (shouldPersistIntent = false) => {
			const activeWorkspaceId = activeWorkspaceRef.current?.workspace.id;
			const activeLeaseId = activeLeaseIdRef.current;
			if (
				storageModeRef.current !== 'persistent' ||
				!activeWorkspaceId ||
				!activeLeaseId
			) {
				return;
			}
			if (shouldPersistIntent) {
				writeWorkspaceLeaseReleaseIntent(leaseReleaseStorage, {
					leaseId: activeLeaseId,
					workspaceId: activeWorkspaceId,
				});
			}
			catalogSync.requestLeaseRelease(activeWorkspaceId, activeLeaseId);
		};
		const handlePageHide = (event: PageTransitionEvent) => {
			if (event.persisted) return;
			requestActiveLeaseRelease(true);
		};
		workspaceCatalogSyncRef.current?.dispose();
		workspaceCatalogSyncRef.current = catalogSync;
		safeStorage.removeItem(LEGACY_LAST_ACTIVE_WORKSPACE_STORAGE_KEY);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', refreshExternalCatalog);
		window.addEventListener('pagehide', handlePageHide);
		void (async () => {
			try {
				let ownerChannel: BroadcastChannel | null = null;
				let ownerClaim: Awaited<
					ReturnType<typeof claimWorkspaceOwnerId>
				> | null = null;
				try {
					ownerChannel = new BroadcastChannel(
						WORKSPACE_OWNER_CHANNEL_NAME
					);
				} catch {
					// Browsers without BroadcastChannel retain session-only ownership.
				}
				try {
					ownerClaim = await claimWorkspaceOwnerId({
						channel: ownerChannel,
						createId: () => crypto.randomUUID(),
						storage: sessionStorage,
						waitForClaims: () =>
							new Promise((resolve) =>
								window.setTimeout(
									resolve,
									WORKSPACE_OWNER_CLAIM_DELAY_MS
								)
							),
					});
				} catch {
					ownerChannel?.close();
				}
				if (initializationGenerationRef.current !== generation) {
					ownerClaim?.dispose();
					return;
				}
				if (ownerClaim) {
					ownerClaimDisposeRef.current?.();
					ownerClaimDisposeRef.current = ownerClaim.dispose;
					workspaceOwnerIdRef.current = ownerClaim.ownerId;
				} else {
					workspaceOwnerIdRef.current = crypto.randomUUID();
				}
				const repository = await createWorkspaceRepository();
				if (initializationGenerationRef.current !== generation) {
					repository.dispose();
					return;
				}
				installRepository(repository, 'persistent', null);
				for (const intent of readWorkspaceLeaseReleaseIntents(
					leaseReleaseStorage
				)) {
					try {
						await repository.releaseLease(
							intent.workspaceId,
							intent.leaseId
						);
						removeWorkspaceLeaseReleaseIntent(
							leaseReleaseStorage,
							intent.leaseId
						);
					} catch {
						// Keep the exact release intent for a later startup attempt.
					}
				}
				await refreshSummaries();
				try {
					void navigator.storage?.persist?.().catch(() => undefined);
				} catch {
					// Persistent-storage requests are best effort only.
				}
			} catch (error) {
				if (initializationGenerationRef.current !== generation) return;
				workspaceOwnerIdRef.current ??= crypto.randomUUID();
				const repository = memoryRepository;
				installRepository(repository, 'memory', describeError(error));
				await refreshSummaries();
			} finally {
				if (initializationGenerationRef.current === generation) {
					setLifecycleStatus('manager');
				}
			}
		})();
		return () => {
			initializationGenerationRef.current += 1;
			summaryRefreshGenerationRef.current += 1;
			requestActiveLeaseRelease();
			clearAutosaveTimeout();
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			);
			window.removeEventListener('focus', refreshExternalCatalog);
			window.removeEventListener('pagehide', handlePageHide);
			if (workspaceCatalogSyncRef.current === catalogSync) {
				workspaceCatalogSyncRef.current = null;
			}
			catalogSync.dispose();
			ownerClaimDisposeRef.current?.();
			ownerClaimDisposeRef.current = null;
			leaseControllerRef.current?.dispose();
			saveQueueRef.current?.dispose();
			const pendingImport = pendingImportRef.current;
			pendingImportRef.current = null;
			pendingImport?.settle({
				error: '导入流程已结束',
				isSuccess: false,
				resolution: 'cancel',
			});
			const repository = repositoryRef.current;
			queueMicrotask(() => repository.dispose());
		};
	}, [
		clearAutosaveTimeout,
		installRepository,
		memoryRepository,
		refreshSummaries,
	]);

	useEffect(() => {
		const editingExpiryTimes = workspaces.flatMap((workspace) =>
			workspace.editingExpiresAt === undefined
				? []
				: [workspace.editingExpiresAt]
		);
		if (editingExpiryTimes.length === 0) return;
		const nextExpiryTime = Math.min(...editingExpiryTimes);
		const timeoutId = window.setTimeout(
			() =>
				void refreshSummaries().catch((error) =>
					setStorageError(describeError(error))
				),
			Math.max(0, nextExpiryTime - Date.now() + 50)
		);
		return () => window.clearTimeout(timeoutId);
	}, [refreshSummaries, workspaces]);

	const installSaveQueue = useCallback(
		(workspaceId: string, leaseId: string, initialRevision: number) => {
			saveQueueRef.current?.dispose();
			saveQueueRef.current = createWorkspaceSaveQueue({
				initialRevision,
				onStatusChange: (status, error) => {
					if (status === 'error') {
						if (isLeaseConflictError(error)) {
							void handleLeaseLoss();
							return;
						}
						const message = describeError(error);
						setSaveError(message);
						if (!shouldUseMemoryFallback(error)) {
							setSaveStatus('error');
							return;
						}
						setStorageError(message);
						setSaveStatus('memory-only');
						void fallbackToMemory(error).catch((fallbackError) =>
							setStorageError(describeError(fallbackError))
						);
						return;
					}
					setSaveError(null);
					setSaveStatus(
						storageModeRef.current === 'memory'
							? 'memory-only'
							: status
					);
				},
				save: async (snapshot) => {
					await repositoryRef.current.saveCurrent(
						workspaceId,
						leaseId,
						snapshot
					);
					if (
						activeWorkspaceRef.current?.workspace.id === workspaceId
					) {
						persistedRevisionRef.current = Math.max(
							persistedRevisionRef.current ?? initialRevision,
							snapshot.revision
						);
					}
					await refreshSummaries(true);
				},
			});
		},
		[fallbackToMemory, handleLeaseLoss, refreshSummaries]
	);

	const publishLoadedWorkspace = useCallback(
		(
			loaded: IWorkspaceLoadedSnapshot,
			leaseId: string,
			checkpointSnapshot: IWorkspaceSnapshot
		) => {
			clearAutosaveTimeout();
			activeLeaseIdRef.current = leaseId;
			activeCheckpointIsExportedRef.current =
				loaded.workspace.isCheckpointExported;
			activeCheckpointRevisionRef.current =
				loaded.workspace.checkpointRevision;
			activeCheckpointSnapshotRef.current = checkpointSnapshot;
			latestSnapshotRef.current = loaded.snapshot;
			persistedRevisionRef.current = loaded.snapshot.revision;
			isLeaseLostRef.current = false;
			isResolvingLeaseLossRef.current = false;
			leaseLossRef.current = null;
			setLeaseLoss(null);
			pendingRecoveryRef.current = null;
			setRecoveryWorkspace(null);
			setLeaseConflict(null);
			activeWorkspaceRef.current = loaded;
			setActiveWorkspace(loaded);
			isExportSnapshotRef.current = false;
			setIsExportSnapshot(false);
			setLifecycleStatus('editing');
			if (storageModeRef.current === 'persistent') setSaveError(null);
			setSaveStatus(
				storageModeRef.current === 'memory' ? 'memory-only' : 'saved'
			);
			rememberLastActiveWorkspaceId(loaded.workspace.id);
			installSaveQueue(
				loaded.workspace.id,
				leaseId,
				loaded.snapshot.revision
			);
		},
		[clearAutosaveTimeout, installSaveQueue, rememberLastActiveWorkspaceId]
	);
	publishLoadedWorkspaceRef.current = publishLoadedWorkspace;

	const publishExportWorkspace = useCallback(
		(
			loaded: IWorkspaceLoadedSnapshot,
			checkpointSnapshot: IWorkspaceSnapshot
		) => {
			clearAutosaveTimeout();
			saveQueueRef.current?.dispose();
			saveQueueRef.current = null;
			activeLeaseIdRef.current = null;
			activeCheckpointIsExportedRef.current =
				loaded.workspace.isCheckpointExported;
			activeCheckpointRevisionRef.current =
				loaded.workspace.checkpointRevision;
			activeCheckpointSnapshotRef.current = checkpointSnapshot;
			latestSnapshotRef.current = loaded.snapshot;
			persistedRevisionRef.current = loaded.snapshot.revision;
			isLeaseLostRef.current = false;
			isResolvingLeaseLossRef.current = false;
			leaseLossRef.current = null;
			setLeaseLoss(null);
			pendingRecoveryRef.current = null;
			setRecoveryWorkspace(null);
			setLeaseConflict(null);
			activeWorkspaceRef.current = loaded;
			setActiveWorkspace(loaded);
			isExportSnapshotRef.current = true;
			setIsExportSnapshot(true);
			setLifecycleStatus('editing');
			setSaveError(null);
			setSaveStatus(
				storageModeRef.current === 'memory' ? 'memory-only' : 'saved'
			);
		},
		[clearAutosaveTimeout]
	);

	const finishWorkspaceOpen = useCallback(
		(
			loaded: IWorkspaceLoadedSnapshot,
			leaseId: string,
			checkpointSnapshot: IWorkspaceSnapshot,
			options: IWorkspaceOpenOptions
		) => {
			setLeaseConflict(null);
			activeCheckpointSnapshotRef.current = checkpointSnapshot;
			activeCheckpointIsExportedRef.current =
				loaded.workspace.isCheckpointExported;
			if (
				loaded.workspace.currentRevision !==
					loaded.workspace.checkpointRevision &&
				pendingExportWorkspaceIdRef.current !== loaded.workspace.id &&
				options.recoveryMode !== 'continue-current'
			) {
				clearAutosaveTimeout();
				saveQueueRef.current?.dispose();
				saveQueueRef.current = null;
				activeLeaseIdRef.current = leaseId;
				activeCheckpointRevisionRef.current =
					loaded.workspace.checkpointRevision;
				activeWorkspaceRef.current = loaded;
				latestSnapshotRef.current = loaded.snapshot;
				pendingRecoveryRef.current = loaded;
				setActiveWorkspace(null);
				setRecoveryWorkspace(loaded.workspace);
				setLifecycleStatus('recovering');
				return;
			}
			publishLoadedWorkspace(loaded, leaseId, checkpointSnapshot);
		},
		[clearAutosaveTimeout, publishLoadedWorkspace]
	);

	const openWorkspace = useCallback(
		async (
			id: string,
			options: IWorkspaceOpenOptions = {}
		): Promise<IWorkspaceOperationResult> => {
			setLifecycleStatus('opening');
			let preparedController: IWorkspaceLeaseController | null = null;
			const cancelOpen = () => {
				restoreCurrentLifecycle();
				return {
					error: '已取消打开资源包',
					isSuccess: false,
				} satisfies IWorkspaceOperationResult;
			};
			try {
				if (options.signal?.aborted) return cancelOpen();
				await flushCurrentWorkspace();
				if (options.signal?.aborted) return cancelOpen();
				if (
					activeWorkspaceRef.current?.workspace.id === id &&
					!isExportSnapshotRef.current &&
					!pendingRecoveryRef.current
				) {
					setLeaseConflict(null);
					setLifecycleStatus('editing');
					return { isSuccess: true, workspaceId: id };
				}
				const summary =
					workspaces.find((workspace) => workspace.id === id) ??
					(await repositoryRef.current.list()).find(
						(workspace) => workspace.id === id
					);
				if (!summary) throw new Error('未找到要打开的资源包');
				if (options.signal?.aborted) return cancelOpen();
				preparedController = createLeaseController(
					repositoryRef.current
				);
				const leaseResult = await preparedController.acquire(id);
				if (!leaseResult.isAcquired || !leaseResult.lease) {
					preparedController.dispose();
					preparedController = null;
					setLeaseConflict({
						...(leaseResult.ownerId === undefined
							? {}
							: { ownerId: leaseResult.ownerId }),
						workspace: summary,
					});
					restoreCurrentLifecycle();
					return {
						error: '该资源包正在其他页面中编辑',
						isLeaseConflict: true,
						isSuccess: false,
						workspaceId: id,
					};
				}
				if (options.signal?.aborted) {
					await preparedController.release();
					preparedController.dispose();
					preparedController = null;
					return cancelOpen();
				}
				const { checkpointSnapshot, current } =
					await loadCurrentAndCheckpoint(repositoryRef.current, id);
				if (options.signal?.aborted) {
					await preparedController.release();
					preparedController.dispose();
					preparedController = null;
					return cancelOpen();
				}
				await leaseControllerRef.current?.release();
				if (options.signal?.aborted) {
					await preparedController.release();
					preparedController.dispose();
					preparedController = null;
					clearActiveWorkspaceState();
					return cancelOpen();
				}
				installLeaseController(
					repositoryRef.current,
					preparedController
				);
				preparedController = null;
				finishWorkspaceOpen(
					current,
					leaseResult.lease.leaseId,
					checkpointSnapshot,
					options
				);
				await refreshSummaries(true);
				if (
					options.signal?.aborted &&
					activeWorkspaceRef.current?.workspace.id === id
				) {
					await leaseControllerRef.current?.release();
					clearActiveWorkspaceState();
					return cancelOpen();
				}
				return { isSuccess: true, workspaceId: id };
			} catch (error) {
				if (preparedController) {
					try {
						await preparedController.release();
					} catch {
						// The prepared lease expires naturally if cleanup fails.
					}
				}
				const fallbackResult = shouldUseMemoryFallback(error)
					? await safelyFallbackToMemory(error)
					: null;
				restoreCurrentLifecycle();
				if (fallbackResult) return fallbackResult;
				return operationError(error);
			}
		},
		[
			clearActiveWorkspaceState,
			createLeaseController,
			finishWorkspaceOpen,
			flushCurrentWorkspace,
			installLeaseController,
			refreshSummaries,
			restoreCurrentLifecycle,
			safelyFallbackToMemory,
			workspaces,
		]
	);

	const openWorkspaceForExport = useCallback(
		async (id: string): Promise<IWorkspaceOperationResult> => {
			setLifecycleStatus('opening');
			try {
				await flushCurrentWorkspace();
				if (
					activeWorkspaceRef.current?.workspace.id === id &&
					isExportSnapshotRef.current
				) {
					setLeaseConflict(null);
					setLifecycleStatus('editing');
					return { isSuccess: true, workspaceId: id };
				}
				const { checkpointSnapshot, current } =
					await loadCurrentAndCheckpoint(repositoryRef.current, id);
				await leaseControllerRef.current?.release();
				publishExportWorkspace(current, checkpointSnapshot);
				await refreshSummaries(true);
				return { isSuccess: true, workspaceId: id };
			} catch (error) {
				const fallbackResult = shouldUseMemoryFallback(error)
					? await safelyFallbackToMemory(error)
					: null;
				restoreCurrentLifecycle();
				if (fallbackResult) return fallbackResult;
				return operationError(error);
			}
		},
		[
			flushCurrentWorkspace,
			publishExportWorkspace,
			refreshSummaries,
			restoreCurrentLifecycle,
			safelyFallbackToMemory,
		]
	);

	const readWorkspaceSnapshot = useCallback(
		async (id: string, source: TWorkspaceLoadSource = 'current') => {
			const repository = repositoryRef.current;
			try {
				return await repository.load(id, source);
			} catch (error) {
				if (repositoryRef.current !== repository) {
					return repositoryRef.current.load(id, source);
				}
				if (!shouldUseMemoryFallback(error)) throw error;
				await fallbackToMemory(error);
				return repositoryRef.current.load(id, source);
			}
		},
		[fallbackToMemory]
	);

	const createWorkspace = useCallback(async () => {
		setLifecycleStatus('opening');
		try {
			await flushCurrentWorkspace();
			let loaded: IWorkspaceLoadedSnapshot;
			try {
				loaded = await repositoryRef.current.createBlank();
			} catch (error) {
				if (!shouldUseMemoryFallback(error)) throw error;
				await fallbackToMemory(error);
				loaded = await memoryRepository.createBlank();
			}
			await refreshSummaries(true);
			return openWorkspace(loaded.workspace.id);
		} catch (error) {
			restoreCurrentLifecycle();
			return operationError(error);
		}
	}, [
		fallbackToMemory,
		flushCurrentWorkspace,
		memoryRepository,
		openWorkspace,
		refreshSummaries,
		restoreCurrentLifecycle,
	]);

	const importWorkspace = useCallback(
		async (file: File): Promise<IWorkspaceImportResult> => {
			if (pendingImportRef.current) {
				return {
					error: '已有一个导入资源包正在等待处理',
					isSuccess: false,
				};
			}
			setLifecycleStatus('importing');
			try {
				const archive = await readResourcePackArchive(file);
				let sourceArchiveHash: string | undefined;
				try {
					sourceArchiveHash = await calculateBlobSha256(file);
				} catch {
					// A valid archive remains importable when exact hashing is unavailable.
				}
				const input: ICreateWorkspaceArchiveInput = {
					files: archive.files,
					folders: archive.folders,
					hasLicenseFile: archive.hasLicenseFile,
					isCheckpointExported: false,
					license: archive.license,
					resourcePack: archive.resourcePack,
					...(sourceArchiveHash === undefined
						? {}
						: { sourceArchiveHash }),
				};
				await flushCurrentWorkspace();
				let candidates: readonly IWorkspaceImportCandidate[];
				try {
					candidates =
						await repositoryRef.current.findImportCandidates(
							sourceArchiveHash,
							archive.resourcePack.packInfo.label,
							archive.resourcePack.packInfo.version
						);
				} catch (error) {
					if (!shouldUseMemoryFallback(error)) throw error;
					await fallbackToMemory(error);
					candidates = await memoryRepository.findImportCandidates(
						sourceArchiveHash,
						archive.resourcePack.packInfo.label,
						archive.resourcePack.packInfo.version
					);
				}
				if (candidates.length > 0) {
					restoreCurrentLifecycle();
					return await new Promise<IWorkspaceImportResult>(
						(settle) => {
							pendingImportRef.current = {
								candidates,
								input,
								settle,
							};
							setDuplicateIntent({
								candidates,
								displayName:
									archive.resourcePack.packInfo.name?.trim() ||
									archive.resourcePack.packInfo.label?.trim() ||
									file.name,
							});
						}
					);
				}
				let loaded: IWorkspaceLoadedSnapshot;
				try {
					loaded =
						await repositoryRef.current.createFromArchive(input);
				} catch (error) {
					if (!shouldUseMemoryFallback(error)) throw error;
					await fallbackToMemory(error);
					loaded = await memoryRepository.createFromArchive(input);
				}
				await refreshSummaries(true);
				restoreCurrentLifecycle();
				return { isSuccess: true, workspaceId: loaded.workspace.id };
			} catch (error) {
				restoreCurrentLifecycle();
				return operationError(error);
			}
		},
		[
			fallbackToMemory,
			flushCurrentWorkspace,
			memoryRepository,
			refreshSummaries,
			restoreCurrentLifecycle,
		]
	);

	const continueRecovery = useCallback(() => {
		const loaded = pendingRecoveryRef.current;
		const leaseId = activeLeaseIdRef.current;
		const checkpointSnapshot = activeCheckpointSnapshotRef.current;
		if (!loaded || !leaseId || !checkpointSnapshot) return;
		publishLoadedWorkspace(loaded, leaseId, checkpointSnapshot);
	}, [publishLoadedWorkspace]);

	const discardRecovery = useCallback(async () => {
		const workspace = pendingRecoveryRef.current?.workspace;
		const leaseId = activeLeaseIdRef.current;
		if (!workspace || !leaseId) {
			return { error: '没有可放弃的本地修改', isSuccess: false };
		}
		try {
			const loaded = await repositoryRef.current.restoreCheckpoint(
				workspace.id,
				leaseId
			);
			await refreshSummaries(true);
			publishLoadedWorkspace(loaded, leaseId, loaded.snapshot);
			return { isSuccess: true, workspaceId: workspace.id };
		} catch (error) {
			const fallbackResult = shouldUseMemoryFallback(error)
				? await safelyFallbackToMemory(error)
				: null;
			return fallbackResult ?? operationError(error);
		}
	}, [publishLoadedWorkspace, refreshSummaries, safelyFallbackToMemory]);

	const closeWorkspace = useCallback(async () => {
		try {
			enqueueLatestSnapshot();
			await saveQueueRef.current?.flush();
			await leaseControllerRef.current?.release();
		} catch (error) {
			const fallbackResult = shouldUseMemoryFallback(error)
				? await safelyFallbackToMemory(error)
				: null;
			if (fallbackResult) return fallbackResult;
			if (!shouldUseMemoryFallback(error)) return operationError(error);
			try {
				enqueueLatestSnapshot();
				await saveQueueRef.current?.flush();
				await leaseControllerRef.current?.release();
			} catch (fallbackError) {
				return operationError(fallbackError);
			}
		}
		try {
			await refreshSummaries(true);
		} catch (error) {
			setStorageError(describeError(error));
		}
		saveQueueRef.current?.dispose();
		saveQueueRef.current = null;
		clearAutosaveTimeout();
		activeLeaseIdRef.current = null;
		activeCheckpointIsExportedRef.current = false;
		activeCheckpointRevisionRef.current = null;
		activeCheckpointSnapshotRef.current = null;
		activeWorkspaceRef.current = null;
		latestSnapshotRef.current = null;
		persistedRevisionRef.current = null;
		pendingRecoveryRef.current = null;
		isExportSnapshotRef.current = false;
		setActiveWorkspace(null);
		setIsExportSnapshot(false);
		setLeaseConflict(null);
		clearPendingWorkspaceExport();
		setRecoveryWorkspace(null);
		setLifecycleStatus('manager');
		forgetLastActiveWorkspaceId();
		return { isSuccess: true };
	}, [
		clearAutosaveTimeout,
		clearPendingWorkspaceExport,
		enqueueLatestSnapshot,
		forgetLastActiveWorkspaceId,
		refreshSummaries,
		safelyFallbackToMemory,
	]);

	const yieldActiveWorkspace = useCallback(
		async (expectedWorkspaceId: string): Promise<IWorkspaceYieldResult> => {
			const loadedWorkspace = activeWorkspaceRef.current;
			const leaseId = activeLeaseIdRef.current;
			const leaseController = leaseControllerRef.current;
			const repository = repositoryRef.current;
			if (storageModeRef.current === 'memory') {
				return {
					error: '内存模式不支持跨标签页交接编辑权',
					isSuccess: false,
				};
			}
			if (
				!loadedWorkspace ||
				loadedWorkspace.workspace.id !== expectedWorkspaceId ||
				!leaseId ||
				!leaseController
			) {
				return {
					error: '当前页面没有该资源包的编辑权',
					isSuccess: false,
				};
			}
			if (isExportSnapshotRef.current) {
				return {
					error: '只读导出快照不能交接编辑权',
					isSuccess: false,
				};
			}
			if (pendingRecoveryRef.current) {
				return { error: '请先处理资源包恢复选择', isSuccess: false };
			}
			if (leaseLossRef.current || isLeaseLostRef.current) {
				return {
					error: '当前页面已经失去资源包编辑权',
					isSuccess: false,
				};
			}
			try {
				enqueueLatestSnapshot();
				await saveQueueRef.current?.flush();
				const savedWorkspace = await repository.load(
					expectedWorkspaceId,
					'current'
				);
				if (
					repositoryRef.current !== repository ||
					leaseControllerRef.current !== leaseController ||
					activeLeaseIdRef.current !== leaseId ||
					activeWorkspaceRef.current?.workspace.id !==
						expectedWorkspaceId
				) {
					return {
						error: '资源包编辑状态已变化，请重试',
						isSuccess: false,
					};
				}
				await leaseController.release();
				activeLeaseIdRef.current = null;
				try {
					await refreshSummaries(true);
				} catch (error) {
					setStorageError(describeError(error));
				}
				clearActiveWorkspaceState();
				return {
					isSuccess: true,
					loaded: markWorkspaceReleased(savedWorkspace),
					workspaceId: expectedWorkspaceId,
				};
			} catch (error) {
				return operationError(error);
			}
		},
		[clearActiveWorkspaceState, enqueueLatestSnapshot, refreshSummaries]
	);

	const duplicateWorkspace = useCallback(
		async (id: string): Promise<IWorkspaceOperationResult> => {
			const isActiveSource =
				activeWorkspaceRef.current?.workspace.id === id;
			try {
				await flushCurrentWorkspace();
				const loaded = await repositoryRef.current.duplicate(id);
				await refreshSummaries(true);
				return { isSuccess: true, workspaceId: loaded.workspace.id };
			} catch (error) {
				if (shouldUseMemoryFallback(error)) {
					const fallbackResult = await safelyFallbackToMemory(error);
					if (fallbackResult) {
						restoreCurrentLifecycle();
						return fallbackResult;
					}
					const temporarySource = activeWorkspaceRef.current;
					if (
						isActiveSource &&
						storageModeRef.current === 'memory' &&
						temporarySource
					) {
						try {
							const loaded =
								await repositoryRef.current.duplicate(
									temporarySource.workspace.id
								);
							await refreshSummaries(true);
							return {
								isSuccess: true,
								workspaceId: loaded.workspace.id,
							};
						} catch (fallbackError) {
							return operationError(fallbackError);
						}
					}
				}
				restoreCurrentLifecycle();
				return operationError(error);
			}
		},
		[
			flushCurrentWorkspace,
			refreshSummaries,
			restoreCurrentLifecycle,
			safelyFallbackToMemory,
		]
	);

	const requestWorkspaceExport = useCallback(
		async (id: string) => {
			pendingExportWorkspaceIdRef.current = id;
			setPendingExportWorkspaceId(id);
			const result = await openWorkspace(id);
			if (!result.isSuccess && !result.isLeaseConflict) {
				clearPendingWorkspaceExport();
			}
			return result;
		},
		[clearPendingWorkspaceExport, openWorkspace]
	);

	const renameWorkspace = useCallback(
		async (id: string, displayName: string) => {
			const isActiveTarget =
				activeWorkspaceRef.current?.workspace.id === id;
			try {
				if (isActiveTarget) await flushCurrentWorkspace();
				const leaseId =
					activeWorkspaceRef.current?.workspace.id === id
						? (activeLeaseIdRef.current ?? undefined)
						: undefined;
				await repositoryRef.current.rename(id, displayName, leaseId);
				await refreshSummaries(true);
				return { isSuccess: true };
			} catch (error) {
				if (shouldUseMemoryFallback(error)) {
					const fallbackResult = await safelyFallbackToMemory(error);
					if (fallbackResult) return fallbackResult;
					const temporaryTarget = activeWorkspaceRef.current;
					if (
						isActiveTarget &&
						storageModeRef.current === 'memory' &&
						temporaryTarget
					) {
						try {
							await repositoryRef.current.rename(
								temporaryTarget.workspace.id,
								displayName,
								activeLeaseIdRef.current ?? undefined
							);
							await refreshSummaries(true);
							return { isSuccess: true };
						} catch (fallbackError) {
							return operationError(fallbackError);
						}
					}
				}
				return operationError(error);
			}
		},
		[flushCurrentWorkspace, refreshSummaries, safelyFallbackToMemory]
	);

	const removeWorkspace = useCallback(
		async (id: string, isForced = false) => {
			try {
				if (activeWorkspaceRef.current?.workspace.id === id) {
					const closeResult = await closeWorkspace();
					if (!closeResult.isSuccess) return closeResult;
				}
				await repositoryRef.current.remove(id, undefined, isForced);
				await refreshSummaries(true);
				return { isSuccess: true };
			} catch (error) {
				if (isLeaseConflictError(error)) {
					return {
						error: describeError(error),
						isLeaseConflict: true,
						isSuccess: false,
					};
				}
				const fallbackResult = shouldUseMemoryFallback(error)
					? await safelyFallbackToMemory(error)
					: null;
				return fallbackResult ?? operationError(error);
			}
		},
		[closeWorkspace, refreshSummaries, safelyFallbackToMemory]
	);

	const resolveImport = useCallback(
		async (
			resolution: TWorkspaceImportResolution,
			workspaceId?: string
		): Promise<IWorkspaceImportResult> => {
			const pendingImport = pendingImportRef.current;
			if (!pendingImport) {
				return { error: '没有等待处理的导入资源包', isSuccess: false };
			}
			if (resolution === 'cancel') {
				restoreCurrentLifecycle();
				return completePendingImport({ isSuccess: true, resolution });
			}
			if (!workspaceId && resolution !== 'copy') {
				return { error: '未选择已有资源包', isSuccess: false };
			}
			const targetWorkspaceId = workspaceId;
			const pendingDisplayName =
				duplicateIntent?.displayName ||
				pendingImport.input.resourcePack.packInfo.name?.trim() ||
				pendingImport.input.resourcePack.packInfo.label?.trim() ||
				'资源包';
			const refreshPendingImportCandidates = async () => {
				const candidates =
					await repositoryRef.current.findImportCandidates(
						pendingImport.input.sourceArchiveHash,
						pendingImport.input.resourcePack.packInfo.label,
						pendingImport.input.resourcePack.packInfo.version
					);
				pendingImportRef.current = { ...pendingImport, candidates };
				setDuplicateIntent({
					candidates,
					displayName: pendingDisplayName,
				});
			};
			try {
				if (resolution === 'open') {
					if (!targetWorkspaceId) {
						return { error: '未选择已有资源包', isSuccess: false };
					}
					const result = await openWorkspace(targetWorkspaceId);
					if (result.isSuccess || result.isLeaseConflict) {
						return completePendingImport({ ...result, resolution });
					} else if (storageModeRef.current === 'memory') {
						await refreshPendingImportCandidates();
					}
					return { ...result, resolution };
				}
				if (resolution === 'replace') {
					await flushCurrentWorkspace();
					if (!targetWorkspaceId) {
						return { error: '未选择已有资源包', isSuccess: false };
					}
					const isActiveTarget =
						activeWorkspaceRef.current?.workspace.id ===
						targetWorkspaceId;
					const activeLeaseId =
						isActiveTarget && !isExportSnapshotRef.current
							? activeLeaseIdRef.current
							: null;
					let preparedController: IWorkspaceLeaseController | null =
						null;
					let leaseId = activeLeaseId;
					if (!leaseId) {
						preparedController = createLeaseController(
							repositoryRef.current
						);
						const leaseResult =
							await preparedController.acquire(targetWorkspaceId);
						if (!leaseResult.isAcquired || !leaseResult.lease) {
							preparedController.dispose();
							return {
								error: '该资源包正在其他页面中编辑，不能覆盖',
								isSuccess: false,
							};
						}
						leaseId = leaseResult.lease.leaseId;
					}
					if (!leaseId) {
						throw new Error('无法取得该资源包的编辑权');
					}
					let loaded: IWorkspaceLoadedSnapshot;
					try {
						loaded = await repositoryRef.current.replaceFromArchive(
							targetWorkspaceId,
							leaseId,
							pendingImport.input
						);
					} catch (error) {
						if (preparedController) {
							try {
								await preparedController.release();
							} catch {
								// The prepared lease expires naturally if cleanup fails.
							}
						}
						throw error;
					}
					if (preparedController) {
						await preparedController.release();
						preparedController.dispose();
						preparedController = null;
					}
					if (isActiveTarget && activeLeaseId) {
						publishLoadedWorkspace(
							loaded,
							activeLeaseId,
							loaded.snapshot
						);
					} else {
						restoreCurrentLifecycle();
					}
					await refreshSummaries(true);
					return completePendingImport({
						isSuccess: true,
						resolution,
						workspaceId: loaded.workspace.id,
					});
				}
				await flushCurrentWorkspace();
				const loaded = await repositoryRef.current.createFromArchive({
					...pendingImport.input,
					displayName: `${pendingDisplayName}（副本）`,
				});
				await refreshSummaries(true);
				restoreCurrentLifecycle();
				return completePendingImport({
					isSuccess: true,
					resolution,
					workspaceId: loaded.workspace.id,
				});
			} catch (error) {
				const fallbackResult = shouldUseMemoryFallback(error)
					? await safelyFallbackToMemory(error)
					: null;
				restoreCurrentLifecycle();
				if (fallbackResult) return fallbackResult;
				if (
					shouldUseMemoryFallback(error) &&
					pendingImportRef.current === pendingImport
				) {
					try {
						if (resolution === 'copy') {
							const loaded =
								await repositoryRef.current.createFromArchive({
									...pendingImport.input,
									displayName: `${pendingDisplayName}（副本）`,
								});
							await refreshSummaries(true);
							restoreCurrentLifecycle();
							return completePendingImport({
								isSuccess: true,
								resolution,
								workspaceId: loaded.workspace.id,
							});
						}
						await refreshPendingImportCandidates();
					} catch (fallbackError) {
						return operationError(fallbackError);
					}
				}
				return operationError(error);
			}
		},
		[
			completePendingImport,
			createLeaseController,
			duplicateIntent?.displayName,
			flushCurrentWorkspace,
			openWorkspace,
			publishLoadedWorkspace,
			refreshSummaries,
			restoreCurrentLifecycle,
			safelyFallbackToMemory,
		]
	);

	const takeOverWorkspace = useCallback(async () => {
		const conflict = leaseConflict;
		if (!conflict) {
			return { error: '没有需要接管的资源包', isSuccess: false };
		}
		setLifecycleStatus('opening');
		let preparedController: IWorkspaceLeaseController | null =
			createLeaseController(repositoryRef.current);
		try {
			const result = await preparedController.takeOver(
				conflict.workspace.id
			);
			if (!result.isAcquired || !result.lease) {
				throw new Error('无法接管该资源包');
			}
			const { checkpointSnapshot, current } =
				await loadCurrentAndCheckpoint(
					repositoryRef.current,
					conflict.workspace.id
				);
			await leaseControllerRef.current?.release();
			installLeaseController(repositoryRef.current, preparedController);
			preparedController = null;
			finishWorkspaceOpen(
				current,
				result.lease.leaseId,
				checkpointSnapshot,
				{}
			);
			const ownerId = workspaceOwnerIdRef.current;
			if (ownerId) {
				workspaceCatalogSyncRef.current?.notifyWorkspaceTakeover(
					conflict.workspace.id,
					ownerId
				);
			}
			await refreshSummaries(true);
			return { isSuccess: true, workspaceId: conflict.workspace.id };
		} catch (error) {
			if (preparedController) {
				try {
					await preparedController.release();
				} catch {
					// The prepared lease expires naturally if cleanup fails.
				}
			}
			const fallbackResult = shouldUseMemoryFallback(error)
				? await safelyFallbackToMemory(error)
				: null;
			restoreCurrentLifecycle();
			if (fallbackResult) return fallbackResult;
			return operationError(error);
		}
	}, [
		createLeaseController,
		finishWorkspaceOpen,
		installLeaseController,
		leaseConflict,
		refreshSummaries,
		restoreCurrentLifecycle,
		safelyFallbackToMemory,
	]);

	const consumeLeaseLossResolution = useCallback(() => {
		const resolution = leaseLossResolutionRef.current;
		leaseLossResolutionRef.current = null;
		setLeaseLossResolution(null);
		return resolution;
	}, []);

	const resolveLeaseLoss = useCallback(
		(resolution: IWorkspaceLeaseLossResolution) => {
			const currentLeaseLoss = leaseLossRef.current;
			if (!currentLeaseLoss) return;
			leaseLossResolutionRef.current = resolution;
			setLeaseLossResolution(resolution);
			clearActiveWorkspaceState();
			const resolvedLeaseLoss = { ...currentLeaseLoss, isResolved: true };
			leaseLossRef.current = resolvedLeaseLoss;
			setLeaseLoss(resolvedLeaseLoss);
		},
		[clearActiveWorkspaceState]
	);

	const discardLeaseLossChanges = useCallback(async () => {
		if (!leaseLossRef.current || leaseLossRef.current.isResolved) {
			return { error: '没有需要处理的接管冲突', isSuccess: false };
		}
		if (isResolvingLeaseLossRef.current) {
			return { error: '正在处理当前修改', isSuccess: false };
		}
		isResolvingLeaseLossRef.current = true;
		try {
			await refreshSummaries();
		} catch (error) {
			setStorageError(describeError(error));
		}
		resolveLeaseLoss({ action: 'discard' });
		return { isSuccess: true };
	}, [refreshSummaries, resolveLeaseLoss]);

	const saveLeaseLossAsCopy = useCallback(async () => {
		const currentLeaseLoss = leaseLossRef.current;
		const snapshot = latestSnapshotRef.current;
		if (!currentLeaseLoss || currentLeaseLoss.isResolved || !snapshot) {
			return { error: '没有可保存的接管前修改', isSuccess: false };
		}
		if (!currentLeaseLoss.hasChanges) {
			return {
				error: '当前页面没有需要保存的额外修改',
				isSuccess: false,
			};
		}
		if (isResolvingLeaseLossRef.current) {
			return { error: '正在处理当前修改', isSuccess: false };
		}
		isResolvingLeaseLossRef.current = true;
		const input = snapshotToArchiveInput(
			snapshot,
			currentLeaseLoss.copyDisplayName,
			false,
			undefined
		);
		let loaded: IWorkspaceLoadedSnapshot;
		try {
			loaded = await repositoryRef.current.createFromArchive(input);
		} catch (error) {
			if (!shouldUseMemoryFallback(error)) {
				isResolvingLeaseLossRef.current = false;
				return operationError(error);
			}
			try {
				loaded = await memoryRepository.createFromArchive(input);
				installRepository(
					memoryRepository,
					'memory',
					describeError(error)
				);
			} catch (fallbackError) {
				isResolvingLeaseLossRef.current = false;
				return operationError(fallbackError);
			}
		}
		try {
			await refreshSummaries(true);
		} catch (error) {
			setStorageError(describeError(error));
		}
		resolveLeaseLoss({
			action: 'save-copy',
			workspaceId: loaded.workspace.id,
		});
		return { isSuccess: true, workspaceId: loaded.workspace.id };
	}, [
		installRepository,
		memoryRepository,
		refreshSummaries,
		resolveLeaseLoss,
	]);

	const dismissResolvedLeaseLoss = useCallback(() => {
		if (!leaseLossRef.current?.isResolved) return;
		leaseLossRef.current = null;
		isLeaseLostRef.current = false;
		isResolvingLeaseLossRef.current = false;
		setLeaseLoss(null);
	}, []);

	const saveActiveSnapshot = useCallback(
		(snapshot: IWorkspaceSnapshot) => {
			if (isExportSnapshotRef.current) return;
			latestSnapshotRef.current = snapshot;
			if (isLeaseLostRef.current) return;
			clearAutosaveTimeout();
			autosaveTimeoutRef.current = window.setTimeout(
				enqueueLatestSnapshot,
				WORKSPACE_AUTOSAVE_DELAY_MS
			);
		},
		[clearAutosaveTimeout, enqueueLatestSnapshot]
	);

	const flushActiveSave = useCallback(async () => {
		if (leaseLossRef.current) {
			return { error: '当前页面已失去资源包编辑权', isSuccess: false };
		}
		try {
			enqueueLatestSnapshot();
			await saveQueueRef.current?.flush();
			return { isSuccess: true };
		} catch (error) {
			return operationError(error);
		}
	}, [enqueueLatestSnapshot]);

	const retryActiveSave = useCallback(() => {
		if (leaseLossRef.current) return;
		saveQueueRef.current?.retry();
		enqueueLatestSnapshot();
	}, [enqueueLatestSnapshot]);

	const promoteActiveCheckpoint = useCallback(
		async (revision: number) => {
			const workspaceId = activeWorkspace?.workspace.id;
			const leaseId = activeLeaseIdRef.current;
			if (isExportSnapshotRef.current) {
				return {
					error: '直接导出不会修改其他页面的本地恢复版本',
					isSuccess: false,
				};
			}
			if (!workspaceId || !leaseId) {
				return {
					error: '当前没有可更新本地恢复版本的资源包',
					isSuccess: false,
				};
			}
			try {
				enqueueLatestSnapshot();
				await saveQueueRef.current?.flush();
				await repositoryRef.current.promoteCheckpoint(
					workspaceId,
					leaseId,
					revision
				);
				activeCheckpointRevisionRef.current = revision;
				activeCheckpointIsExportedRef.current = true;
				if (latestSnapshotRef.current?.revision === revision) {
					activeCheckpointSnapshotRef.current =
						latestSnapshotRef.current;
				}
				await refreshSummaries(true);
				return { isSuccess: true };
			} catch (error) {
				if (shouldUseMemoryFallback(error)) {
					try {
						await fallbackToMemory(error);
						const temporaryWorkspace = activeWorkspaceRef.current;
						const temporaryLeaseId = activeLeaseIdRef.current;
						if (
							temporaryWorkspace?.snapshot.revision ===
								revision &&
							temporaryLeaseId
						) {
							await repositoryRef.current.promoteCheckpoint(
								temporaryWorkspace.workspace.id,
								temporaryLeaseId,
								revision
							);
							const { checkpointSnapshot, current } =
								await loadCurrentAndCheckpoint(
									repositoryRef.current,
									temporaryWorkspace.workspace.id
								);
							publishLoadedWorkspace(
								current,
								temporaryLeaseId,
								checkpointSnapshot
							);
							await refreshSummaries(true);
						}
					} catch (fallbackError) {
						setStorageError(describeError(fallbackError));
					}
				}
				if (storageModeRef.current === 'memory') {
					const temporaryWorkspace = activeWorkspaceRef.current;
					if (
						temporaryWorkspace?.snapshot.revision === revision &&
						activeCheckpointRevisionRef.current === revision
					) {
						return { isSuccess: true };
					}
				}
				return operationError(error);
			}
		},
		[
			activeWorkspace?.workspace.id,
			enqueueLatestSnapshot,
			fallbackToMemory,
			publishLoadedWorkspace,
			refreshSummaries,
		]
	);

	const openLastWorkspace = useCallback(async () => {
		const rememberedWorkspaceId = readLastActiveWorkspaceId();
		const id =
			rememberedWorkspaceId ??
			(workspaces.length === 1 ? workspaces[0]?.id : undefined);
		return id
			? openWorkspace(id)
			: { error: '没有上次打开的资源包', isSuccess: false };
	}, [openWorkspace, readLastActiveWorkspaceId, workspaces]);

	const retryPersistentStorage = useCallback(async () => {
		if (isRetryingStorageRef.current) {
			return { error: '正在重试本地存储', isSuccess: false };
		}
		isRetryingStorageRef.current = true;
		setIsRetryingStorage(true);
		let candidateRepository: IWorkspaceRepository | null = null;
		try {
			if (fallbackPromiseRef.current) {
				await fallbackPromiseRef.current;
			}
			if (storageModeRef.current === 'persistent') {
				saveQueueRef.current?.retry();
				enqueueLatestSnapshot();
				await saveQueueRef.current?.flush();
				await refreshSummaries(true);
				setStorageError(null);
				return {
					isSuccess: true,
					...(activeWorkspaceRef.current === null
						? {}
						: {
								workspaceId:
									activeWorkspaceRef.current.workspace.id,
							}),
				};
			}
			await flushCurrentWorkspace();
			const repository = await createWorkspaceRepository();
			candidateRepository = repository;
			const temporaryWorkspaces = await memoryRepository.list();
			const activeTemporaryId = activeWorkspaceRef.current?.workspace.id;
			const migratedIds = await migrateTemporaryWorkspaces({
				createExpiresAt: () => Date.now() + 60_000,
				createLeaseId: () => crypto.randomUUID(),
				ownerId: `migration-${crypto.randomUUID()}`,
				source: memoryRepository,
				target: repository,
			});
			const preparedController = createLeaseController(repository);
			let isPreparedControllerInstalled = false;
			let migratedActiveId: string | undefined;
			let preparedActive:
				| {
						checkpointSnapshot: IWorkspaceSnapshot;
						current: IWorkspaceLoadedSnapshot;
						leaseId: string;
				  }
				| undefined;
			try {
				if (activeTemporaryId) {
					migratedActiveId = migratedIds.get(activeTemporaryId);
					if (migratedActiveId) {
						const leaseResult =
							await preparedController.acquire(migratedActiveId);
						if (!leaseResult.isAcquired || !leaseResult.lease) {
							throw new Error('无法取得已保存资源包的编辑权');
						}
						const loaded = await loadCurrentAndCheckpoint(
							repository,
							migratedActiveId
						);
						preparedActive = {
							...loaded,
							leaseId: leaseResult.lease.leaseId,
						};
					}
				}
				await leaseControllerRef.current?.release();
				clearAutosaveTimeout();
				saveQueueRef.current?.dispose();
				saveQueueRef.current = null;
				activeLeaseIdRef.current = null;
				activeCheckpointIsExportedRef.current = false;
				activeCheckpointRevisionRef.current = null;
				activeCheckpointSnapshotRef.current = null;
				activeWorkspaceRef.current = null;
				latestSnapshotRef.current = null;
				isExportSnapshotRef.current = false;
				setActiveWorkspace(null);
				setIsExportSnapshot(false);
				installRepository(
					repository,
					'persistent',
					null,
					preparedController
				);
				candidateRepository = null;
				isPreparedControllerInstalled = true;
				if (preparedActive) {
					publishLoadedWorkspace(
						preparedActive.current,
						preparedActive.leaseId,
						preparedActive.checkpointSnapshot
					);
				}
				await Promise.allSettled(
					temporaryWorkspaces.map((workspace) =>
						memoryRepository.remove(workspace.id)
					)
				);
				await refreshSummaries(true);
				return {
					isSuccess: true,
					...(migratedActiveId === undefined
						? {}
						: { workspaceId: migratedActiveId }),
				};
			} catch (error) {
				if (!isPreparedControllerInstalled) {
					try {
						await preparedController.release();
					} catch {
						// Rollback below still attempts every newly created target.
					}
					await Promise.allSettled(
						Array.from(migratedIds.values(), (id) =>
							repository.remove(id)
						)
					);
				}
				throw error;
			}
		} catch (error) {
			candidateRepository?.dispose();
			setStorageError(describeError(error));
			return operationError(error);
		} finally {
			isRetryingStorageRef.current = false;
			setIsRetryingStorage(false);
		}
	}, [
		clearAutosaveTimeout,
		createLeaseController,
		enqueueLatestSnapshot,
		flushCurrentWorkspace,
		installRepository,
		memoryRepository,
		publishLoadedWorkspace,
		refreshSummaries,
	]);

	const value = useMemo(
		() => ({
			activeWorkspace,
			clearPendingWorkspaceExport,
			closeWorkspace,
			consumeLeaseLossResolution,
			continueRecovery,
			createWorkspace,
			discardLeaseLossChanges,
			discardRecovery,
			dismissLeaseConflict,
			dismissResolvedLeaseLoss,
			duplicateIntent,
			duplicateWorkspace,
			flushActiveSave,
			importWorkspace,
			isExportSnapshot,
			isRetryingStorage,
			leaseConflict,
			leaseLoss,
			leaseLossResolution,
			lifecycleStatus,
			openLastWorkspace,
			openWorkspace,
			openWorkspaceForExport,
			pendingExportWorkspaceId,
			promoteActiveCheckpoint,
			readWorkspaceSnapshot,
			recoveryWorkspace,
			removeWorkspace,
			requestWorkspaceExport,
			renameWorkspace,
			resolveImport,
			retryActiveSave,
			retryPersistentStorage,
			saveActiveSnapshot,
			saveLeaseLossAsCopy,
			saveError,
			saveStatus,
			storageError,
			storageMode,
			takeOverWorkspace,
			workspaceCatalogGeneration,
			workspaces,
			yieldActiveWorkspace,
		}),
		[
			activeWorkspace,
			clearPendingWorkspaceExport,
			closeWorkspace,
			consumeLeaseLossResolution,
			continueRecovery,
			createWorkspace,
			discardLeaseLossChanges,
			discardRecovery,
			dismissLeaseConflict,
			dismissResolvedLeaseLoss,
			duplicateIntent,
			duplicateWorkspace,
			flushActiveSave,
			importWorkspace,
			isExportSnapshot,
			isRetryingStorage,
			leaseConflict,
			leaseLoss,
			leaseLossResolution,
			lifecycleStatus,
			openLastWorkspace,
			openWorkspace,
			openWorkspaceForExport,
			pendingExportWorkspaceId,
			promoteActiveCheckpoint,
			readWorkspaceSnapshot,
			recoveryWorkspace,
			removeWorkspace,
			requestWorkspaceExport,
			renameWorkspace,
			resolveImport,
			retryActiveSave,
			retryPersistentStorage,
			saveActiveSnapshot,
			saveLeaseLossAsCopy,
			saveError,
			saveStatus,
			storageError,
			storageMode,
			takeOverWorkspace,
			workspaceCatalogGeneration,
			workspaces,
			yieldActiveWorkspace,
		]
	);

	return (
		<ResourceWorkspaceContext.Provider value={value}>
			{children}
		</ResourceWorkspaceContext.Provider>
	);
}
