import 'client-only';

import { createBlankResourcePack } from '@/domain/resourcePack/createBlankResourcePack';
import { normalizeResourcePack } from '@/domain/resourcePack/normalization';

import type {
	ICreateWorkspaceArchiveInput,
	IWorkspaceDocument,
	IWorkspaceImportCandidate,
	IWorkspaceLeaseResult,
	IWorkspaceLoadedSnapshot,
	IWorkspaceRepository,
	IWorkspaceSnapshot,
	IWorkspaceSummary,
	TWorkspaceLoadSource,
} from './contracts';
import {
	type IStoredWorkspaceDocument,
	type IStoredWorkspaceFileRecord,
	type IStoredWorkspaceRecord,
	openWorkspaceDatabase,
	requestToPromise,
	transactionToPromise,
	WORKSPACE_FILES_STORE_NAME,
	WORKSPACES_STORE_NAME,
	WorkspacePersistenceError,
} from './workspaceDatabase';
import {
	cloneWorkspaceEditorState,
	createEmptyWorkspaceEditorState,
	normalizeWorkspaceEditorState,
} from './workspaceEditorState';
import {
	type IWorkspaceFileBinding,
	planWorkspaceManifestUpdate,
} from './workspaceManifest';

const EMPTY_FOLDERS = ['assets/'] as const;

function createStoredDocument(
	document: ICreateWorkspaceArchiveInput | IWorkspaceDocument,
	revision: number,
	savedAt: number
): IStoredWorkspaceDocument {
	return {
		editorState: cloneWorkspaceEditorState(
			document.editorState ?? createEmptyWorkspaceEditorState()
		),
		folders: [...document.folders],
		hasLicenseFile: document.hasLicenseFile,
		license: document.license,
		resourcePack: document.resourcePack,
		revision,
		savedAt,
	};
}

function createSummary(record: IStoredWorkspaceRecord): IWorkspaceSummary {
	const label = record.currentDocument.resourcePack.packInfo.label;
	const resourcePackName = record.currentDocument.resourcePack.packInfo.name;
	const version = record.currentDocument.resourcePack.packInfo.version;
	const activeLease =
		record.lease !== null && record.lease.expiresAt > Date.now()
			? record.lease
			: null;
	return {
		checkpointRevision: record.checkpointDocument.revision,
		createdAt: record.createdAt,
		currentRevision: record.currentDocument.revision,
		displayName: record.displayName,
		id: record.id,
		isCheckpointExported: record.isCheckpointExported === true,
		isCurrentExported:
			record.isCheckpointExported === true &&
			record.currentDocument.revision ===
				record.checkpointDocument.revision,
		isEditing: activeLease !== null,
		...(activeLease === null
			? {}
			: { editingExpiresAt: activeLease.expiresAt }),
		...(label === undefined ? {} : { label }),
		...(resourcePackName === undefined ? {} : { resourcePackName }),
		updatedAt: record.updatedAt,
		...(version === undefined ? {} : { version }),
	};
}

function resolveDisplayName(input: ICreateWorkspaceArchiveInput) {
	const requestedName = input.displayName?.trim();
	if (requestedName) return requestedName;
	return (
		input.resourcePack.packInfo.name?.trim() ||
		input.resourcePack.packInfo.label?.trim() ||
		'未命名资源包'
	);
}

function assertWorkspaceRecord(
	record: unknown,
	id: string
): IStoredWorkspaceRecord {
	if (record === undefined) {
		throw new WorkspacePersistenceError(
			'not-found',
			`未找到本地资源包：${id}`
		);
	}
	if (!isStoredWorkspaceRecord(record)) {
		throw new WorkspacePersistenceError(
			'corrupt',
			`本地资源包记录已损坏：${id}`
		);
	}
	try {
		const currentResourcePack = normalizeResourcePack(
			record.currentDocument.resourcePack
		);
		const checkpointResourcePack =
			record.checkpointDocument.resourcePack ===
			record.currentDocument.resourcePack
				? currentResourcePack
				: normalizeResourcePack(record.checkpointDocument.resourcePack);
		return {
			...record,
			currentDocument: {
				...record.currentDocument,
				resourcePack: currentResourcePack,
			},
			checkpointDocument: {
				...record.checkpointDocument,
				resourcePack: checkpointResourcePack,
			},
		};
	} catch (error) {
		throw new WorkspacePersistenceError(
			'corrupt',
			`本地资源包内容已损坏：${id}`,
			{ cause: error }
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStoredDocument(value: unknown): value is IStoredWorkspaceDocument {
	if (!isRecord(value)) return false;
	const resourcePack = value['resourcePack'];
	const packInfo = isRecord(resourcePack) ? resourcePack['packInfo'] : null;
	const hasValidPackInfo =
		isRecord(packInfo) &&
		(packInfo['label'] === undefined ||
			typeof packInfo['label'] === 'string') &&
		(packInfo['name'] === undefined ||
			typeof packInfo['name'] === 'string') &&
		(packInfo['version'] === undefined ||
			typeof packInfo['version'] === 'string');
	return (
		Array.isArray(value['folders']) &&
		value['folders'].every((folder) => typeof folder === 'string') &&
		typeof value['hasLicenseFile'] === 'boolean' &&
		typeof value['license'] === 'string' &&
		isRecord(resourcePack) &&
		hasValidPackInfo &&
		typeof value['revision'] === 'number' &&
		Number.isSafeInteger(value['revision']) &&
		value['revision'] >= 0 &&
		typeof value['savedAt'] === 'number' &&
		Number.isFinite(value['savedAt'])
	);
}

function isStoredManifest(
	value: unknown
): value is Readonly<Record<string, string>> {
	return (
		isRecord(value) &&
		Object.values(value).every((fileId) => typeof fileId === 'string')
	);
}

function isStoredWorkspaceRecord(
	value: unknown
): value is IStoredWorkspaceRecord {
	if (!isRecord(value)) return false;
	const lease = value['lease'];
	const isLeaseValid =
		lease === null ||
		(isRecord(lease) &&
			typeof lease['expiresAt'] === 'number' &&
			Number.isFinite(lease['expiresAt']) &&
			typeof lease['leaseId'] === 'string' &&
			typeof lease['ownerId'] === 'string');
	return (
		isStoredDocument(value['checkpointDocument']) &&
		isStoredManifest(value['checkpointManifest']) &&
		typeof value['createdAt'] === 'number' &&
		Number.isFinite(value['createdAt']) &&
		isStoredDocument(value['currentDocument']) &&
		isStoredManifest(value['currentManifest']) &&
		typeof value['displayName'] === 'string' &&
		typeof value['id'] === 'string' &&
		(value['isCheckpointExported'] === undefined ||
			typeof value['isCheckpointExported'] === 'boolean') &&
		isLeaseValid &&
		(value['sourceArchiveHash'] === undefined ||
			typeof value['sourceArchiveHash'] === 'string') &&
		typeof value['updatedAt'] === 'number' &&
		Number.isFinite(value['updatedAt'])
	);
}

function assertWorkspaceFileRecord(
	record: unknown,
	workspaceId: string
): IStoredWorkspaceFileRecord {
	if (
		!isRecord(record) ||
		!(record['blob'] instanceof Blob) ||
		typeof record['id'] !== 'string' ||
		record['workspaceId'] !== workspaceId
	) {
		throw new WorkspacePersistenceError(
			'corrupt',
			'本地资源包缺少文件数据，无法安全打开'
		);
	}
	return { blob: record['blob'], id: record['id'], workspaceId };
}

function assertLease(record: IStoredWorkspaceRecord, leaseId: string) {
	if (
		record.lease?.leaseId === leaseId &&
		record.lease.expiresAt > Date.now()
	) {
		return;
	}
	throw new WorkspacePersistenceError(
		'lease-conflict',
		'当前页面已失去该资源包的编辑权，请返回资源包管理后重新打开'
	);
}

function uniqueFileIds(...manifests: Readonly<Record<string, string>>[]) {
	return new Set(manifests.flatMap((manifest) => Object.values(manifest)));
}

class IndexedDbWorkspaceRepository implements IWorkspaceRepository {
	private readonly database: IDBDatabase;
	private readonly bindingsByWorkspaceId = new Map<
		string,
		ReadonlyMap<string, IWorkspaceFileBinding>
	>();

	public constructor(database: IDBDatabase) {
		this.database = database;
	}

	private async createWorkspace(
		input: ICreateWorkspaceArchiveInput
	): Promise<IWorkspaceLoadedSnapshot> {
		const id = crypto.randomUUID();
		const now = Date.now();
		const manifestUpdate = planWorkspaceManifestUpdate({
			createFileId: () => crypto.randomUUID(),
			currentBindings: new Map(),
			files: input.files,
			retainedFileIds: new Set(),
		});
		const document = createStoredDocument(input, 0, now);
		const record: IStoredWorkspaceRecord = {
			checkpointDocument: document,
			checkpointManifest: manifestUpdate.manifest,
			createdAt: now,
			currentDocument: document,
			currentManifest: manifestUpdate.manifest,
			displayName: resolveDisplayName(input),
			id,
			isCheckpointExported: input.isCheckpointExported ?? false,
			lease: null,
			...(input.sourceArchiveHash === undefined
				? {}
				: { sourceArchiveHash: input.sourceArchiveHash }),
			updatedAt: now,
		};
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		manifestUpdate.filesToAdd.forEach(({ blob, fileId }) => {
			fileStore.put({ blob, id: fileId, workspaceId: id });
		});
		transaction.objectStore(WORKSPACES_STORE_NAME).add(record);
		await transactionPromise;
		this.bindingsByWorkspaceId.set(id, manifestUpdate.bindings);
		return {
			snapshot: {
				editorState: cloneWorkspaceEditorState(
					input.editorState ?? createEmptyWorkspaceEditorState()
				),
				files: new Map(input.files),
				folders: [...input.folders],
				hasLicenseFile: input.hasLicenseFile,
				license: input.license,
				resourcePack: input.resourcePack,
				revision: 0,
			},
			workspace: createSummary(record),
		};
	}

	public async acquireLease(
		id: string,
		ownerId: string,
		leaseId: string,
		expiresAt: number,
		isTakeover = false
	): Promise<IWorkspaceLeaseResult> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const store = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				store.get(id)
			),
			id
		);
		const activeLease =
			record.lease && record.lease.expiresAt > Date.now()
				? record.lease
				: null;
		if (activeLease && activeLease.ownerId !== ownerId && !isTakeover) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// This abort intentionally leaves the existing lease unchanged.
			}
			return { isAcquired: false, ownerId: activeLease.ownerId };
		}
		const lease = { expiresAt, leaseId, ownerId };
		store.put({ ...record, lease });
		await transactionPromise;
		return { isAcquired: true, lease };
	}

	public async createBlank(): Promise<IWorkspaceLoadedSnapshot> {
		return this.createWorkspace({
			files: new Map(),
			folders: EMPTY_FOLDERS,
			hasLicenseFile: false,
			isCheckpointExported: false,
			license: '',
			resourcePack: createBlankResourcePack(),
		});
	}

	public async createFromArchive(
		input: ICreateWorkspaceArchiveInput
	): Promise<IWorkspaceLoadedSnapshot> {
		return this.createWorkspace(input);
	}

	public dispose() {
		this.database.close();
		this.bindingsByWorkspaceId.clear();
	}

	public async duplicate(id: string): Promise<IWorkspaceLoadedSnapshot> {
		const loaded = await this.load(id, 'current');
		return this.createWorkspace({
			displayName: `${loaded.workspace.displayName}（副本）`,
			editorState: loaded.snapshot.editorState,
			files: loaded.snapshot.files,
			folders: loaded.snapshot.folders,
			hasLicenseFile: loaded.snapshot.hasLicenseFile,
			isCheckpointExported: false,
			license: loaded.snapshot.license,
			resourcePack: loaded.snapshot.resourcePack,
		});
	}

	public async findImportCandidates(
		sourceArchiveHash: string | undefined,
		label: string | undefined,
		version: string | undefined
	): Promise<readonly IWorkspaceImportCandidate[]> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readonly'
		);
		const transactionPromise = transactionToPromise(transaction);
		const records = await requestToPromise<unknown[]>(
			transaction.objectStore(WORKSPACES_STORE_NAME).getAll()
		);
		await transactionPromise;
		const normalizedLabel = label?.trim();
		const normalizedVersion = version?.trim() || undefined;
		return records.flatMap((value): IWorkspaceImportCandidate[] => {
			const record = assertWorkspaceRecord(value, '未知');
			if (
				sourceArchiveHash !== undefined &&
				record.sourceArchiveHash === sourceArchiveHash
			) {
				return [
					{
						matchStrength: 'exact',
						workspace: createSummary(record),
					},
				];
			}
			if (
				normalizedLabel &&
				record.currentDocument.resourcePack.packInfo.label?.trim() ===
					normalizedLabel &&
				(record.currentDocument.resourcePack.packInfo.version?.trim() ||
					undefined) === normalizedVersion
			) {
				return [
					{
						matchStrength: 'metadata',
						workspace: createSummary(record),
					},
				];
			}
			return [];
		});
	}

	public async list(): Promise<readonly IWorkspaceSummary[]> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readonly'
		);
		const transactionPromise = transactionToPromise(transaction);
		const records = await requestToPromise<unknown[]>(
			transaction.objectStore(WORKSPACES_STORE_NAME).getAll()
		);
		await transactionPromise;
		return records
			.map((record) =>
				createSummary(assertWorkspaceRecord(record, '未知'))
			)
			.sort((left, right) => right.updatedAt - left.updatedAt);
	}

	public async load(
		id: string,
		source: TWorkspaceLoadSource
	): Promise<IWorkspaceLoadedSnapshot> {
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readonly'
		);
		const transactionPromise = transactionToPromise(transaction);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				transaction.objectStore(WORKSPACES_STORE_NAME).get(id)
			),
			id
		);
		const document =
			source === 'current'
				? record.currentDocument
				: record.checkpointDocument;
		const manifest =
			source === 'current'
				? record.currentManifest
				: record.checkpointManifest;
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		const fileRecords = await Promise.all(
			Array.from(uniqueFileIds(manifest), (fileId) =>
				requestToPromise<IStoredWorkspaceFileRecord | undefined>(
					fileStore.get(fileId)
				)
			)
		);
		await transactionPromise;
		const filesById = new Map<string, Blob>();
		fileRecords.forEach((value) => {
			const fileRecord = assertWorkspaceFileRecord(value, id);
			filesById.set(fileRecord.id, fileRecord.blob);
		});
		const files = new Map<string, Blob>();
		const bindings = new Map<string, IWorkspaceFileBinding>();
		Object.entries(manifest).forEach(([path, fileId]) => {
			const blob = filesById.get(fileId);
			if (!blob) {
				throw new WorkspacePersistenceError(
					'corrupt',
					`本地资源包缺少文件：${path}`
				);
			}
			files.set(path, blob);
			bindings.set(path, { blob, fileId });
		});
		if (source === 'current') {
			this.bindingsByWorkspaceId.set(id, bindings);
		}
		return {
			snapshot: {
				editorState: normalizeWorkspaceEditorState(
					document.editorState
				),
				files,
				folders: [...document.folders],
				hasLicenseFile: document.hasLicenseFile,
				license: document.license,
				resourcePack: document.resourcePack,
				revision: document.revision,
			},
			workspace: createSummary(record),
		};
	}

	public async promoteCheckpoint(
		id: string,
		leaseId: string,
		revision: number
	): Promise<void> {
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const workspaceStore = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				workspaceStore.get(id)
			),
			id
		);
		assertLease(record, leaseId);
		if (record.currentDocument.revision !== revision) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// The explicit domain error below is more useful than AbortError.
			}
			throw new WorkspacePersistenceError(
				'stale-revision',
				'资源包内容已变化，无法更新本地恢复版本'
			);
		}
		const currentFileIds = uniqueFileIds(record.currentManifest);
		const previousCheckpointFileIds = uniqueFileIds(
			record.checkpointManifest
		);
		workspaceStore.put({
			...record,
			checkpointDocument: record.currentDocument,
			checkpointManifest: record.currentManifest,
			isCheckpointExported: true,
		});
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		previousCheckpointFileIds.forEach((fileId) => {
			if (!currentFileIds.has(fileId)) fileStore.delete(fileId);
		});
		await transactionPromise;
	}

	public async readSourceArchiveHash(
		id: string
	): Promise<string | undefined> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readonly'
		);
		const transactionPromise = transactionToPromise(transaction);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				transaction.objectStore(WORKSPACES_STORE_NAME).get(id)
			),
			id
		);
		await transactionPromise;
		return record.sourceArchiveHash;
	}

	public async releaseLease(id: string, leaseId: string): Promise<void> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const store = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = await requestToPromise<
			IStoredWorkspaceRecord | undefined
		>(store.get(id));
		if (record?.lease?.leaseId === leaseId) {
			store.put({ ...record, lease: null });
		}
		await transactionPromise;
	}

	public async remove(
		id: string,
		leaseId?: string,
		isForced = false
	): Promise<void> {
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const workspaceStore = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				workspaceStore.get(id)
			),
			id
		);
		if (
			!isForced &&
			record.lease &&
			record.lease.expiresAt > Date.now() &&
			record.lease.leaseId !== leaseId
		) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// The explicit lease conflict below identifies the real cause.
			}
			throw new WorkspacePersistenceError(
				'lease-conflict',
				'该资源包正在其他页面中编辑，不能删除'
			);
		}
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		uniqueFileIds(
			record.currentManifest,
			record.checkpointManifest
		).forEach((fileId) => fileStore.delete(fileId));
		workspaceStore.delete(id);
		await transactionPromise;
		this.bindingsByWorkspaceId.delete(id);
	}

	public async rename(
		id: string,
		displayName: string,
		leaseId?: string
	): Promise<void> {
		const normalizedName = displayName.trim();
		if (!normalizedName) throw new Error('工作区名称不能为空');
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const store = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				store.get(id)
			),
			id
		);
		if (
			record.lease &&
			record.lease.expiresAt > Date.now() &&
			record.lease.leaseId !== leaseId
		) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// The explicit lease conflict below identifies the real cause.
			}
			throw new WorkspacePersistenceError(
				'lease-conflict',
				'该工作区正在其他页面中编辑，不能重命名'
			);
		}
		store.put({ ...record, displayName: normalizedName });
		await transactionPromise;
	}

	public async renewLease(
		id: string,
		leaseId: string,
		expiresAt: number
	): Promise<IWorkspaceLeaseResult> {
		const transaction = this.database.transaction(
			WORKSPACES_STORE_NAME,
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const store = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				store.get(id)
			),
			id
		);
		if (record.lease?.leaseId !== leaseId) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// This abort intentionally leaves the new lease owner untouched.
			}
			return {
				isAcquired: false,
				...(record.lease?.ownerId === undefined
					? {}
					: { ownerId: record.lease.ownerId }),
			};
		}
		const lease = { ...record.lease, expiresAt };
		store.put({ ...record, lease });
		await transactionPromise;
		return { isAcquired: true, lease };
	}

	public async replaceFromArchive(
		id: string,
		leaseId: string,
		input: ICreateWorkspaceArchiveInput
	): Promise<IWorkspaceLoadedSnapshot> {
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const workspaceStore = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				workspaceStore.get(id)
			),
			id
		);
		assertLease(record, leaseId);
		const nextRevision = record.currentDocument.revision + 1;
		const now = Date.now();
		const manifestUpdate = planWorkspaceManifestUpdate({
			createFileId: () => crypto.randomUUID(),
			currentBindings: new Map(),
			files: input.files,
			retainedFileIds: new Set(),
		});
		const document = createStoredDocument(input, nextRevision, now);
		const nextRecord: IStoredWorkspaceRecord = {
			...record,
			checkpointDocument: document,
			checkpointManifest: manifestUpdate.manifest,
			currentDocument: document,
			currentManifest: manifestUpdate.manifest,
			displayName: input.displayName?.trim() || record.displayName,
			isCheckpointExported: input.isCheckpointExported ?? false,
			updatedAt: now,
		};
		if (input.sourceArchiveHash === undefined) {
			delete nextRecord.sourceArchiveHash;
		} else {
			nextRecord.sourceArchiveHash = input.sourceArchiveHash;
		}
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		manifestUpdate.filesToAdd.forEach(({ blob, fileId }) =>
			fileStore.put({ blob, id: fileId, workspaceId: id })
		);
		uniqueFileIds(
			record.currentManifest,
			record.checkpointManifest
		).forEach((fileId) => fileStore.delete(fileId));
		workspaceStore.put(nextRecord);
		await transactionPromise;
		this.bindingsByWorkspaceId.set(id, manifestUpdate.bindings);
		return {
			snapshot: {
				editorState: cloneWorkspaceEditorState(
					input.editorState ?? createEmptyWorkspaceEditorState()
				),
				files: new Map(input.files),
				folders: [...input.folders],
				hasLicenseFile: input.hasLicenseFile,
				license: input.license,
				resourcePack: input.resourcePack,
				revision: nextRevision,
			},
			workspace: createSummary(nextRecord),
		};
	}

	public async restoreCheckpoint(
		id: string,
		leaseId: string
	): Promise<IWorkspaceLoadedSnapshot> {
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const workspaceStore = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				workspaceStore.get(id)
			),
			id
		);
		assertLease(record, leaseId);
		const nextRevision = record.currentDocument.revision + 1;
		const now = Date.now();
		const restoredDocument = {
			...record.checkpointDocument,
			revision: nextRevision,
			savedAt: now,
		};
		const nextRecord: IStoredWorkspaceRecord = {
			...record,
			checkpointDocument: restoredDocument,
			currentDocument: restoredDocument,
			currentManifest: record.checkpointManifest,
			updatedAt: now,
		};
		const checkpointFileIds = uniqueFileIds(record.checkpointManifest);
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		uniqueFileIds(record.currentManifest).forEach((fileId) => {
			if (!checkpointFileIds.has(fileId)) fileStore.delete(fileId);
		});
		workspaceStore.put(nextRecord);
		await transactionPromise;
		return this.load(id, 'current');
	}

	public async saveCurrent(
		id: string,
		leaseId: string,
		snapshot: IWorkspaceSnapshot
	): Promise<void> {
		if (!this.bindingsByWorkspaceId.has(id)) await this.load(id, 'current');
		const currentBindings = this.bindingsByWorkspaceId.get(id) ?? new Map();
		const transaction = this.database.transaction(
			[WORKSPACES_STORE_NAME, WORKSPACE_FILES_STORE_NAME],
			'readwrite'
		);
		const transactionPromise = transactionToPromise(transaction);
		const workspaceStore = transaction.objectStore(WORKSPACES_STORE_NAME);
		const record = assertWorkspaceRecord(
			await requestToPromise<IStoredWorkspaceRecord | undefined>(
				workspaceStore.get(id)
			),
			id
		);
		assertLease(record, leaseId);
		if (snapshot.revision < record.currentDocument.revision) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// The explicit domain error below is more useful than AbortError.
			}
			throw new WorkspacePersistenceError(
				'stale-revision',
				'较旧的自动保存不能覆盖较新的资源包内容'
			);
		}
		if (snapshot.revision === record.currentDocument.revision) {
			transaction.abort();
			try {
				await transactionPromise;
			} catch {
				// No changes are required for an already persisted revision.
			}
			return;
		}
		const manifestUpdate = planWorkspaceManifestUpdate({
			createFileId: () => crypto.randomUUID(),
			currentBindings,
			files: snapshot.files,
			retainedFileIds: uniqueFileIds(record.checkpointManifest),
		});
		const now = Date.now();
		const currentDocument = createStoredDocument(
			snapshot,
			snapshot.revision,
			now
		);
		const fileStore = transaction.objectStore(WORKSPACE_FILES_STORE_NAME);
		manifestUpdate.filesToAdd.forEach(({ blob, fileId }) =>
			fileStore.put({ blob, id: fileId, workspaceId: id })
		);
		manifestUpdate.fileIdsToRemove.forEach((fileId) =>
			fileStore.delete(fileId)
		);
		workspaceStore.put({
			...record,
			currentDocument,
			currentManifest: manifestUpdate.manifest,
			updatedAt: now,
		});
		await transactionPromise;
		this.bindingsByWorkspaceId.set(id, manifestUpdate.bindings);
	}
}

export async function createWorkspaceRepository(): Promise<IWorkspaceRepository> {
	return new IndexedDbWorkspaceRepository(await openWorkspaceDatabase());
}
