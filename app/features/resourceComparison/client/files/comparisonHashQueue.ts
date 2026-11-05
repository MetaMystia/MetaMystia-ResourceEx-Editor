import 'client-only';

import { calculateBlobSha256 } from '@/infrastructure/browser/crypto/calculateBlobSha256';

export interface IComparisonHashRequest {
	blob: Blob;
	path: string;
	signal?: AbortSignal;
	snapshotId: string;
}

export type TComparisonHashResult =
	{ hash: string; status: 'hashed' } | { error: string; status: 'failed' };

export interface IComparisonHashQueue {
	clear(): void;
	dispose(): void;
	hash(request: IComparisonHashRequest): Promise<TComparisonHashResult>;
}

export interface IComparisonHashQueueOptions {
	concurrency?: number;
	hashBlob?: (blob: Blob) => Promise<string>;
}

interface IHashTask {
	abortHandler?: () => void;
	isAborted: boolean;
	isSettled: boolean;
	isStarted: boolean;
	key: string;
	reject(error: unknown): void;
	request: IComparisonHashRequest;
	resolve(result: TComparisonHashResult): void;
}

const DEFAULT_HASH_CONCURRENCY = 2;

function createAbortError() {
	return new DOMException('文件分析已取消', 'AbortError');
}

function createCacheKey(snapshotId: string, path: string) {
	return JSON.stringify([snapshotId, path]);
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function createComparisonHashQueue(
	options: IComparisonHashQueueOptions = {}
): IComparisonHashQueue {
	const concurrency = options.concurrency ?? DEFAULT_HASH_CONCURRENCY;
	if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
		throw new Error('哈希并发数必须是正整数。');
	}
	const hashBlob = options.hashBlob ?? calculateBlobSha256;
	const cache = new Map<string, TComparisonHashResult>();
	const pendingTasks: IHashTask[] = [];
	const runningTasks = new Set<IHashTask>();
	let isDisposed = false;

	const cleanupTask = (task: IHashTask) => {
		if (task.abortHandler) {
			task.request.signal?.removeEventListener(
				'abort',
				task.abortHandler
			);
			delete task.abortHandler;
		}
	};
	const resolveTask = (task: IHashTask, result: TComparisonHashResult) => {
		if (task.isSettled) return;
		task.isSettled = true;
		cleanupTask(task);
		task.resolve(result);
	};
	const rejectTask = (task: IHashTask, error: unknown) => {
		if (task.isSettled) return;
		task.isSettled = true;
		cleanupTask(task);
		task.reject(error);
	};

	const pump = () => {
		while (
			!isDisposed &&
			runningTasks.size < concurrency &&
			pendingTasks.length > 0
		) {
			const task = pendingTasks.shift();
			if (!task) continue;
			if (task.isAborted || task.request.signal?.aborted) {
				rejectTask(task, createAbortError());
				continue;
			}
			task.isStarted = true;
			runningTasks.add(task);
			void Promise.resolve()
				.then(() => hashBlob(task.request.blob))
				.then((hash) => {
					if (
						isDisposed ||
						task.isAborted ||
						task.request.signal?.aborted
					) {
						rejectTask(task, createAbortError());
						return;
					}
					const result = { hash, status: 'hashed' } as const;
					cache.set(task.key, result);
					resolveTask(task, result);
				})
				.catch((error: unknown) => {
					if (
						isDisposed ||
						task.isAborted ||
						task.request.signal?.aborted
					) {
						rejectTask(task, createAbortError());
						return;
					}
					resolveTask(task, {
						error: describeError(error),
						status: 'failed',
					});
				})
				.finally(() => {
					runningTasks.delete(task);
					pump();
				});
		}
	};

	return {
		clear() {
			cache.clear();
		},
		dispose() {
			if (isDisposed) return;
			isDisposed = true;
			cache.clear();
			for (const task of [...pendingTasks, ...runningTasks]) {
				task.isAborted = true;
				rejectTask(task, createAbortError());
			}
			pendingTasks.length = 0;
		},
		hash(request) {
			if (isDisposed || request.signal?.aborted) {
				return Promise.reject(createAbortError());
			}
			const key = createCacheKey(request.snapshotId, request.path);
			const cached = cache.get(key);
			if (cached) return Promise.resolve(cached);

			return new Promise<TComparisonHashResult>((resolve, reject) => {
				const task: IHashTask = {
					isAborted: false,
					isSettled: false,
					isStarted: false,
					key,
					reject,
					request,
					resolve,
				};
				task.abortHandler = () => {
					task.isAborted = true;
					if (!task.isStarted) {
						const index = pendingTasks.indexOf(task);
						if (index >= 0) pendingTasks.splice(index, 1);
					}
					rejectTask(task, createAbortError());
				};
				request.signal?.addEventListener('abort', task.abortHandler, {
					once: true,
				});
				pendingTasks.push(task);
				pump();
			});
		},
	};
}
