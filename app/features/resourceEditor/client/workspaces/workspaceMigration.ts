import type {
	ICreateWorkspaceArchiveInput,
	IWorkspaceRepository,
	IWorkspaceSnapshot,
} from './contracts';

interface IMigrateTemporaryWorkspacesInput {
	createExpiresAt(): number;
	createLeaseId(): string;
	ownerId: string;
	source: IWorkspaceRepository;
	target: IWorkspaceRepository;
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

export async function migrateTemporaryWorkspaces({
	createExpiresAt,
	createLeaseId,
	ownerId,
	source,
	target,
}: IMigrateTemporaryWorkspacesInput): Promise<ReadonlyMap<string, string>> {
	const createdTargetIds: string[] = [];
	const leaseIdsByTargetId = new Map<string, string>();
	const targetIdsBySourceId = new Map<string, string>();
	try {
		for (const summary of await source.list()) {
			const [checkpoint, current, sourceArchiveHash] = await Promise.all([
				source.load(summary.id, 'checkpoint'),
				source.load(summary.id, 'current'),
				source.readSourceArchiveHash(summary.id),
			]);
			const created = await target.createFromArchive(
				snapshotToArchiveInput(
					checkpoint.snapshot,
					summary.displayName,
					summary.isCheckpointExported,
					sourceArchiveHash
				)
			);
			createdTargetIds.push(created.workspace.id);
			targetIdsBySourceId.set(summary.id, created.workspace.id);
			const leaseId = createLeaseId();
			leaseIdsByTargetId.set(created.workspace.id, leaseId);
			const lease = await target.acquireLease(
				created.workspace.id,
				ownerId,
				leaseId,
				createExpiresAt()
			);
			if (!lease.isAcquired) {
				throw new Error('无法取得待保存资源包的编辑权');
			}
			if (
				summary.currentRevision !== summary.checkpointRevision &&
				current.snapshot.revision > created.snapshot.revision
			) {
				await target.saveCurrent(
					created.workspace.id,
					leaseId,
					current.snapshot
				);
			}
			await target.releaseLease(created.workspace.id, leaseId);
		}
		return targetIdsBySourceId;
	} catch (error) {
		await Promise.allSettled(
			createdTargetIds.map((id) =>
				target.remove(id, leaseIdsByTargetId.get(id))
			)
		);
		throw error;
	}
}
