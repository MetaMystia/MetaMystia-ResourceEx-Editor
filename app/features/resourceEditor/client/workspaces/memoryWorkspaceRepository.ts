import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

import type {
	ICreateWorkspaceArchiveInput,
	IWorkspaceImportCandidate,
	IWorkspaceLease,
	IWorkspaceLoadedSnapshot,
	IWorkspaceRepository,
	IWorkspaceSnapshot,
	IWorkspaceSummary,
	TWorkspaceLoadSource,
} from './contracts';
import {
	cloneWorkspaceEditorState,
	createEmptyWorkspaceEditorState,
} from './workspaceEditorState';

interface ICreateMemoryWorkspaceRepositoryInput {
	createBlankResourcePack(): ResourceEx;
	createId(): string;
	now(): number;
}

interface IMemoryWorkspaceRecord {
	checkpoint: IWorkspaceSnapshot;
	createdAt: number;
	current: IWorkspaceSnapshot;
	displayName: string;
	id: string;
	isCheckpointExported: boolean;
	lease: IWorkspaceLease | null;
	sourceArchiveHash?: string;
	updatedAt: number;
}

const EMPTY_FOLDERS = ['assets/'] as const;

function cloneSnapshot(snapshot: IWorkspaceSnapshot): IWorkspaceSnapshot {
	return {
		editorState: cloneWorkspaceEditorState(snapshot.editorState),
		files: new Map(snapshot.files),
		folders: [...snapshot.folders],
		hasLicenseFile: snapshot.hasLicenseFile,
		license: snapshot.license,
		resourcePack: snapshot.resourcePack,
		revision: snapshot.revision,
	};
}

function createSnapshot(
	input: ICreateWorkspaceArchiveInput,
	revision: number
): IWorkspaceSnapshot {
	return {
		editorState: cloneWorkspaceEditorState(
			input.editorState ?? createEmptyWorkspaceEditorState()
		),
		files: new Map(input.files),
		folders: [...input.folders],
		hasLicenseFile: input.hasLicenseFile,
		license: input.license,
		resourcePack: input.resourcePack,
		revision,
	};
}

function createSummary(record: IMemoryWorkspaceRecord): IWorkspaceSummary {
	const label = record.current.resourcePack.packInfo.label;
	const resourcePackName = record.current.resourcePack.packInfo.name;
	const version = record.current.resourcePack.packInfo.version;
	return {
		checkpointRevision: record.checkpoint.revision,
		createdAt: record.createdAt,
		currentRevision: record.current.revision,
		displayName: record.displayName,
		id: record.id,
		isCheckpointExported: record.isCheckpointExported,
		isCurrentExported:
			record.isCheckpointExported &&
			record.current.revision === record.checkpoint.revision,
		isEditing: false,
		...(label === undefined ? {} : { label }),
		...(resourcePackName === undefined ? {} : { resourcePackName }),
		updatedAt: record.updatedAt,
		...(version === undefined ? {} : { version }),
	};
}

function createLoadedSnapshot(
	record: IMemoryWorkspaceRecord,
	source: TWorkspaceLoadSource
): IWorkspaceLoadedSnapshot {
	return {
		snapshot: cloneSnapshot(
			source === 'current' ? record.current : record.checkpoint
		),
		workspace: createSummary(record),
	};
}

function resolveDisplayName(input: ICreateWorkspaceArchiveInput) {
	return (
		input.displayName?.trim() ||
		input.resourcePack.packInfo.name?.trim() ||
		input.resourcePack.packInfo.label?.trim() ||
		'未命名资源包'
	);
}

export function createMemoryWorkspaceRepository(
	input: ICreateMemoryWorkspaceRepositoryInput
): IWorkspaceRepository {
	const records = new Map<string, IMemoryWorkspaceRecord>();

	const readRecord = (id: string) => {
		const record = records.get(id);
		if (!record) throw new Error(`未找到临时资源包：${id}`);
		return record;
	};

	const assertLease = (record: IMemoryWorkspaceRecord, leaseId: string) => {
		if (
			record.lease?.leaseId === leaseId &&
			record.lease.expiresAt > input.now()
		) {
			return;
		}
		throw new Error('当前页面已失去该临时资源包的编辑权');
	};

	const createWorkspace = (archive: ICreateWorkspaceArchiveInput) => {
		const id = input.createId();
		const timestamp = input.now();
		const snapshot = createSnapshot(archive, 0);
		const record: IMemoryWorkspaceRecord = {
			checkpoint: snapshot,
			createdAt: timestamp,
			current: snapshot,
			displayName: resolveDisplayName(archive),
			id,
			isCheckpointExported: archive.isCheckpointExported ?? false,
			lease: null,
			...(archive.sourceArchiveHash === undefined
				? {}
				: { sourceArchiveHash: archive.sourceArchiveHash }),
			updatedAt: timestamp,
		};
		records.set(id, record);
		return createLoadedSnapshot(record, 'current');
	};

	return {
		async acquireLease(
			id,
			ownerId,
			leaseId,
			expiresAt,
			isTakeover = false
		) {
			const record = readRecord(id);
			const activeLease =
				record.lease && record.lease.expiresAt > input.now()
					? record.lease
					: null;
			if (activeLease && activeLease.ownerId !== ownerId && !isTakeover) {
				return { isAcquired: false, ownerId: activeLease.ownerId };
			}
			const lease = { expiresAt, leaseId, ownerId };
			record.lease = lease;
			return { isAcquired: true, lease };
		},
		async createBlank() {
			return createWorkspace({
				files: new Map(),
				folders: EMPTY_FOLDERS,
				hasLicenseFile: false,
				isCheckpointExported: false,
				license: '',
				resourcePack: input.createBlankResourcePack(),
			});
		},
		async createFromArchive(archive) {
			return createWorkspace(archive);
		},
		dispose() {
			records.clear();
		},
		async duplicate(id) {
			const source = readRecord(id);
			return createWorkspace({
				displayName: `${source.displayName}（副本）`,
				isCheckpointExported: false,
				...cloneSnapshot(source.current),
			});
		},
		async findImportCandidates(sourceArchiveHash, label, version) {
			const normalizedLabel = label?.trim();
			const normalizedVersion = version?.trim() || undefined;
			return Array.from(records.values()).flatMap(
				(record): IWorkspaceImportCandidate[] => {
					if (
						sourceArchiveHash !== undefined &&
						record.sourceArchiveHash === sourceArchiveHash
					) {
						return [
							{
								matchStrength: 'exact' as const,
								workspace: createSummary(record),
							},
						];
					}
					if (
						normalizedLabel &&
						record.current.resourcePack.packInfo.label?.trim() ===
							normalizedLabel &&
						(record.current.resourcePack.packInfo.version?.trim() ||
							undefined) === normalizedVersion
					) {
						return [
							{
								matchStrength: 'metadata' as const,
								workspace: createSummary(record),
							},
						];
					}
					return [];
				}
			);
		},
		async list() {
			return Array.from(records.values(), createSummary).sort(
				(left, right) => right.updatedAt - left.updatedAt
			);
		},
		async load(id, source) {
			return createLoadedSnapshot(readRecord(id), source);
		},
		async readSourceArchiveHash(id) {
			return readRecord(id).sourceArchiveHash;
		},
		async promoteCheckpoint(id, leaseId, revision) {
			const record = readRecord(id);
			assertLease(record, leaseId);
			if (record.current.revision !== revision) {
				throw new Error('资源包内容已变化，无法更新本地恢复版本');
			}
			record.checkpoint = cloneSnapshot(record.current);
			record.isCheckpointExported = true;
		},
		async releaseLease(id, leaseId) {
			const record = records.get(id);
			if (record?.lease?.leaseId === leaseId) record.lease = null;
		},
		async remove(id, leaseId, isForced = false) {
			const record = readRecord(id);
			if (
				!isForced &&
				record.lease &&
				record.lease.expiresAt > input.now() &&
				record.lease.leaseId !== leaseId
			) {
				throw new Error('该临时资源包正在其他页面中编辑，不能删除');
			}
			if (!records.delete(id)) {
				throw new Error(`未找到临时资源包：${id}`);
			}
		},
		async rename(id, displayName, leaseId) {
			const normalizedName = displayName.trim();
			if (!normalizedName) throw new Error('工作区名称不能为空');
			const record = readRecord(id);
			if (
				record.lease &&
				record.lease.expiresAt > input.now() &&
				record.lease.leaseId !== leaseId
			) {
				throw new Error('该临时工作区正在其他页面中编辑，不能重命名');
			}
			record.displayName = normalizedName;
		},
		async renewLease(id, leaseId, expiresAt) {
			const record = readRecord(id);
			if (record.lease?.leaseId !== leaseId) {
				return {
					isAcquired: false,
					...(record.lease ? { ownerId: record.lease.ownerId } : {}),
				};
			}
			record.lease = { ...record.lease, expiresAt };
			return { isAcquired: true, lease: record.lease };
		},
		async replaceFromArchive(id, leaseId, archive) {
			const record = readRecord(id);
			assertLease(record, leaseId);
			const revision = record.current.revision + 1;
			const snapshot = createSnapshot(archive, revision);
			record.checkpoint = snapshot;
			record.current = snapshot;
			record.displayName =
				archive.displayName?.trim() || record.displayName;
			record.isCheckpointExported = archive.isCheckpointExported ?? false;
			if (archive.sourceArchiveHash === undefined) {
				delete record.sourceArchiveHash;
			} else {
				record.sourceArchiveHash = archive.sourceArchiveHash;
			}
			record.updatedAt = input.now();
			return createLoadedSnapshot(record, 'current');
		},
		async restoreCheckpoint(id, leaseId) {
			const record = readRecord(id);
			assertLease(record, leaseId);
			const snapshot = {
				...cloneSnapshot(record.checkpoint),
				revision: record.current.revision + 1,
			};
			record.checkpoint = snapshot;
			record.current = snapshot;
			record.updatedAt = input.now();
			return createLoadedSnapshot(record, 'current');
		},
		async saveCurrent(id, leaseId, snapshot) {
			const record = readRecord(id);
			assertLease(record, leaseId);
			if (snapshot.revision < record.current.revision) {
				throw new Error('较旧的临时快照不能覆盖较新的资源包内容');
			}
			if (snapshot.revision === record.current.revision) return;
			record.current = cloneSnapshot(snapshot);
			record.updatedAt = input.now();
		},
	};
}
