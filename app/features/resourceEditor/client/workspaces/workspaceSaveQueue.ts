import type { IWorkspaceSnapshot } from './contracts';

export interface IWorkspaceSaveQueue {
	dispose(): void;
	enqueue(snapshot: IWorkspaceSnapshot): void;
	flush(): Promise<void>;
	retry(): void;
}

interface ICreateWorkspaceSaveQueueInput {
	initialRevision: number;
	onStatusChange(status: 'error' | 'saved' | 'saving', error?: unknown): void;
	save(snapshot: IWorkspaceSnapshot): Promise<void>;
}

export function createWorkspaceSaveQueue(
	input: ICreateWorkspaceSaveQueueInput
): IWorkspaceSaveQueue {
	let isDisposed = false;
	let isSuspended = false;
	let lastError: unknown;
	let newestQueuedRevision = input.initialRevision;
	let pendingSnapshot: IWorkspaceSnapshot | undefined;
	let savePromise: Promise<void> | null = null;

	const runSaves = async () => {
		while (pendingSnapshot) {
			const snapshot = pendingSnapshot;
			pendingSnapshot = undefined;
			try {
				await input.save(snapshot);
			} catch (error) {
				lastError = error;
				isSuspended = true;
				const queuedAfterFailure = pendingSnapshot as
					IWorkspaceSnapshot | undefined;
				if (
					!queuedAfterFailure ||
					queuedAfterFailure.revision < snapshot.revision
				) {
					pendingSnapshot = snapshot;
				}
				input.onStatusChange('error', error);
				throw error;
			}
		}
		lastError = undefined;
		if (!isDisposed) input.onStatusChange('saved');
	};

	const startSaves = () => {
		if (isSuspended || savePromise || !pendingSnapshot) return;
		input.onStatusChange('saving');
		const nextSavePromise = runSaves();
		savePromise = nextSavePromise;
		void nextSavePromise
			.catch(() => undefined)
			.finally(() => {
				if (savePromise === nextSavePromise) savePromise = null;
				if (pendingSnapshot && !isDisposed && !isSuspended)
					startSaves();
			});
	};

	return {
		dispose() {
			isDisposed = true;
			pendingSnapshot = undefined;
		},
		enqueue(snapshot) {
			if (isDisposed || snapshot.revision <= newestQueuedRevision) return;
			newestQueuedRevision = snapshot.revision;
			pendingSnapshot = snapshot;
			startSaves();
		},
		async flush() {
			if (isSuspended && lastError !== undefined) throw lastError;
			startSaves();
			while (savePromise) {
				await savePromise;
			}
			if (lastError !== undefined) throw lastError;
		},
		retry() {
			if (isDisposed || !isSuspended) return;
			isSuspended = false;
			lastError = undefined;
			startSaves();
		},
	};
}
