import 'client-only';

import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

import type { IWorkspaceLease } from './contracts';

export const WORKSPACE_DATABASE_NAME = 'metamystia-resourceex-editor';
export const WORKSPACE_DATABASE_VERSION = 1;
export const WORKSPACE_FILES_STORE_NAME = 'workspaceFiles';
export const WORKSPACES_STORE_NAME = 'workspaces';

export interface IStoredWorkspaceDocument {
	editorState?: unknown;
	folders: readonly string[];
	hasLicenseFile: boolean;
	license: string;
	resourcePack: ResourceEx;
	revision: number;
	savedAt: number;
}

export interface IStoredWorkspaceRecord {
	checkpointDocument: IStoredWorkspaceDocument;
	checkpointManifest: Readonly<Record<string, string>>;
	createdAt: number;
	currentDocument: IStoredWorkspaceDocument;
	currentManifest: Readonly<Record<string, string>>;
	displayName: string;
	id: string;
	isCheckpointExported?: boolean;
	lease: IWorkspaceLease | null;
	sourceArchiveHash?: string;
	updatedAt: number;
}

export interface IStoredWorkspaceFileRecord {
	blob: Blob;
	id: string;
	workspaceId: string;
}

export class WorkspacePersistenceError extends Error {
	public readonly code:
		| 'blocked'
		| 'corrupt'
		| 'lease-conflict'
		| 'not-found'
		| 'open-failed'
		| 'quota-exceeded'
		| 'stale-revision'
		| 'transaction-failed';

	public constructor(
		code: WorkspacePersistenceError['code'],
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'WorkspacePersistenceError';
		this.code = code;
	}
}

function isQuotaExceededError(error: unknown) {
	return error instanceof DOMException && error.name === 'QuotaExceededError';
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.addEventListener('success', () => resolve(request.result), {
			once: true,
		});
		request.addEventListener(
			'error',
			() => reject(request.error ?? new Error('本地存储请求失败')),
			{ once: true }
		);
	});
}

export function transactionToPromise(
	transaction: IDBTransaction
): Promise<void> {
	const transactionPromise = new Promise<void>((resolve, reject) => {
		transaction.addEventListener('complete', () => resolve(), {
			once: true,
		});
		transaction.addEventListener(
			'abort',
			() => {
				const error = transaction.error;
				reject(
					new WorkspacePersistenceError(
						isQuotaExceededError(error)
							? 'quota-exceeded'
							: 'transaction-failed',
						isQuotaExceededError(error)
							? '浏览器存储空间不足，无法保存资源包'
							: '本地保存失败',
						{ cause: error }
					)
				);
			},
			{ once: true }
		);
	});
	void transactionPromise.catch(() => undefined);
	return transactionPromise;
}

export function openWorkspaceDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		let isSettled = false;
		const request = indexedDB.open(
			WORKSPACE_DATABASE_NAME,
			WORKSPACE_DATABASE_VERSION
		);

		request.addEventListener('upgradeneeded', () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(WORKSPACES_STORE_NAME)) {
				database.createObjectStore(WORKSPACES_STORE_NAME, {
					keyPath: 'id',
				});
			}
			if (
				!database.objectStoreNames.contains(WORKSPACE_FILES_STORE_NAME)
			) {
				database.createObjectStore(WORKSPACE_FILES_STORE_NAME, {
					keyPath: 'id',
				});
			}
		});
		request.addEventListener('blocked', () => {
			if (isSettled) return;
			isSettled = true;
			reject(
				new WorkspacePersistenceError(
					'blocked',
					'本地存储升级被其他页面阻止，请关闭其他编辑器页面后重试'
				)
			);
		});
		request.addEventListener('error', () => {
			if (isSettled) return;
			isSettled = true;
			reject(
				new WorkspacePersistenceError(
					'open-failed',
					'无法打开本地存储',
					{ cause: request.error }
				)
			);
		});
		request.addEventListener('success', () => {
			const database = request.result;
			if (isSettled) {
				database.close();
				return;
			}
			isSettled = true;
			database.addEventListener('versionchange', () => database.close());
			resolve(database);
		});
	});
}
