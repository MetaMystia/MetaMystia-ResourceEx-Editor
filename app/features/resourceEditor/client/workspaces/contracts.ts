import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

import { type IWorkspaceEditorState } from './workspaceEditorState';

export type TWorkspaceImportMatchStrength = 'exact' | 'metadata';

export type TWorkspaceLoadSource = 'checkpoint' | 'current';

export type TWorkspaceLifecycleStatus =
	| 'editing'
	| 'hydrating'
	| 'importing'
	| 'manager'
	| 'opening'
	| 'recovering';

export type TWorkspaceSaveStatus =
	'error' | 'idle' | 'memory-only' | 'saved' | 'saving';

export type TWorkspaceStorageMode = 'memory' | 'persistent';

export type TWorkspacePersistenceErrorCode =
	| 'blocked'
	| 'corrupt'
	| 'lease-conflict'
	| 'not-found'
	| 'open-failed'
	| 'quota-exceeded'
	| 'stale-revision'
	| 'transaction-failed';

export interface IWorkspaceDocument {
	editorState: IWorkspaceEditorState;
	folders: readonly string[];
	hasLicenseFile: boolean;
	license: string;
	resourcePack: ResourceEx;
}

export interface IWorkspaceSnapshot extends IWorkspaceDocument {
	files: ReadonlyMap<string, Blob>;
	revision: number;
}

export interface IWorkspaceSummary {
	checkpointRevision: number;
	createdAt: number;
	currentRevision: number;
	displayName: string;
	id: string;
	isCheckpointExported: boolean;
	isCurrentExported: boolean;
	isEditing: boolean;
	editingExpiresAt?: number;
	label?: string;
	resourcePackName?: string;
	updatedAt: number;
	version?: string;
}

export interface IWorkspaceLoadedSnapshot {
	snapshot: IWorkspaceSnapshot;
	workspace: IWorkspaceSummary;
}

export interface ICreateWorkspaceArchiveInput extends Omit<
	IWorkspaceDocument,
	'editorState'
> {
	displayName?: string;
	editorState?: IWorkspaceEditorState;
	files: ReadonlyMap<string, Blob>;
	isCheckpointExported?: boolean;
	sourceArchiveHash?: string;
}

export interface IWorkspaceImportCandidate {
	matchStrength: TWorkspaceImportMatchStrength;
	workspace: IWorkspaceSummary;
}

export interface IWorkspaceLease {
	expiresAt: number;
	leaseId: string;
	ownerId: string;
}

export interface IWorkspaceLeaseResult {
	isAcquired: boolean;
	lease?: IWorkspaceLease;
	ownerId?: string;
}

export interface IWorkspaceOperationResult {
	error?: string;
	isLeaseConflict?: boolean;
	isSuccess: boolean;
	workspaceId?: string;
}

export interface IWorkspaceOpenOptions {
	recoveryMode?: 'continue-current' | 'prompt';
	signal?: AbortSignal;
}

export interface IWorkspaceImportResult extends IWorkspaceOperationResult {
	resolution?: TWorkspaceImportResolution;
}

export interface IWorkspaceYieldResult extends IWorkspaceOperationResult {
	loaded?: IWorkspaceLoadedSnapshot;
}

export interface IWorkspaceDuplicateIntent {
	candidates: readonly IWorkspaceImportCandidate[];
	displayName: string;
}

export interface IWorkspaceLeaseConflict {
	ownerId?: string;
	workspace: IWorkspaceSummary;
}

export interface IWorkspaceLeaseLoss {
	copyDisplayName: string;
	hasChanges: boolean;
	hasUnsavedChanges: boolean;
	isResolved: boolean;
	workspace: IWorkspaceSummary;
}

export interface IWorkspaceLeaseLossResolution {
	action: 'discard' | 'save-copy';
	workspaceId?: string;
}

export type TWorkspaceImportResolution = 'cancel' | 'copy' | 'open' | 'replace';

export interface IResourceWorkspaceContext {
	activeWorkspace: IWorkspaceLoadedSnapshot | null;
	duplicateIntent: IWorkspaceDuplicateIntent | null;
	isExportSnapshot: boolean;
	isRetryingStorage: boolean;
	leaseConflict: IWorkspaceLeaseConflict | null;
	leaseLoss: IWorkspaceLeaseLoss | null;
	leaseLossResolution: IWorkspaceLeaseLossResolution | null;
	lifecycleStatus: TWorkspaceLifecycleStatus;
	pendingExportWorkspaceId: string | null;
	recoveryWorkspace: IWorkspaceSummary | null;
	saveError: string | null;
	saveStatus: TWorkspaceSaveStatus;
	storageError: string | null;
	storageMode: TWorkspaceStorageMode;
	workspaceCatalogGeneration: number;
	workspaces: readonly IWorkspaceSummary[];
	closeWorkspace(): Promise<IWorkspaceOperationResult>;
	clearPendingWorkspaceExport(): void;
	consumeLeaseLossResolution(): IWorkspaceLeaseLossResolution | null;
	continueRecovery(): void;
	createWorkspace(): Promise<IWorkspaceOperationResult>;
	discardLeaseLossChanges(): Promise<IWorkspaceOperationResult>;
	discardRecovery(): Promise<IWorkspaceOperationResult>;
	dismissLeaseConflict(): void;
	dismissResolvedLeaseLoss(): void;
	duplicateWorkspace(id: string): Promise<IWorkspaceOperationResult>;
	flushActiveSave(): Promise<IWorkspaceOperationResult>;
	importWorkspace(file: File): Promise<IWorkspaceImportResult>;
	openLastWorkspace(): Promise<IWorkspaceOperationResult>;
	openWorkspaceForExport(id: string): Promise<IWorkspaceOperationResult>;
	openWorkspace(
		id: string,
		options?: IWorkspaceOpenOptions
	): Promise<IWorkspaceOperationResult>;
	promoteActiveCheckpoint(
		revision: number
	): Promise<IWorkspaceOperationResult>;
	removeWorkspace(
		id: string,
		isForced?: boolean
	): Promise<IWorkspaceOperationResult>;
	requestWorkspaceExport(id: string): Promise<IWorkspaceOperationResult>;
	renameWorkspace(
		id: string,
		displayName: string
	): Promise<IWorkspaceOperationResult>;
	readWorkspaceSnapshot(
		id: string,
		source?: TWorkspaceLoadSource
	): Promise<IWorkspaceLoadedSnapshot>;
	resolveImport(
		resolution: TWorkspaceImportResolution,
		workspaceId?: string
	): Promise<IWorkspaceImportResult>;
	retryActiveSave(): void;
	retryPersistentStorage(): Promise<IWorkspaceOperationResult>;
	saveActiveSnapshot(snapshot: IWorkspaceSnapshot): void;
	saveLeaseLossAsCopy(): Promise<IWorkspaceOperationResult>;
	takeOverWorkspace(): Promise<IWorkspaceOperationResult>;
	yieldActiveWorkspace(
		expectedWorkspaceId: string
	): Promise<IWorkspaceYieldResult>;
}

export interface IWorkspaceRepository {
	acquireLease(
		id: string,
		ownerId: string,
		leaseId: string,
		expiresAt: number,
		isTakeover?: boolean
	): Promise<IWorkspaceLeaseResult>;
	createBlank(): Promise<IWorkspaceLoadedSnapshot>;
	createFromArchive(
		input: ICreateWorkspaceArchiveInput
	): Promise<IWorkspaceLoadedSnapshot>;
	dispose(): void;
	duplicate(id: string): Promise<IWorkspaceLoadedSnapshot>;
	findImportCandidates(
		sourceArchiveHash: string | undefined,
		label: string | undefined,
		version: string | undefined
	): Promise<readonly IWorkspaceImportCandidate[]>;
	list(): Promise<readonly IWorkspaceSummary[]>;
	load(
		id: string,
		source: TWorkspaceLoadSource
	): Promise<IWorkspaceLoadedSnapshot>;
	readSourceArchiveHash(id: string): Promise<string | undefined>;
	promoteCheckpoint(
		id: string,
		leaseId: string,
		revision: number
	): Promise<void>;
	releaseLease(id: string, leaseId: string): Promise<void>;
	remove(id: string, leaseId?: string, isForced?: boolean): Promise<void>;
	rename(id: string, displayName: string, leaseId?: string): Promise<void>;
	renewLease(
		id: string,
		leaseId: string,
		expiresAt: number
	): Promise<IWorkspaceLeaseResult>;
	replaceFromArchive(
		id: string,
		leaseId: string,
		input: ICreateWorkspaceArchiveInput
	): Promise<IWorkspaceLoadedSnapshot>;
	restoreCheckpoint(
		id: string,
		leaseId: string
	): Promise<IWorkspaceLoadedSnapshot>;
	saveCurrent(
		id: string,
		leaseId: string,
		snapshot: IWorkspaceSnapshot
	): Promise<void>;
}
