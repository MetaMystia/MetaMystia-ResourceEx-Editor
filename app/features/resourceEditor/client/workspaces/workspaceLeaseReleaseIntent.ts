const WORKSPACE_LEASE_RELEASE_INTENT_KEY_PREFIX =
	'resourceEditorWorkspaceLeaseRelease:';

interface IWorkspaceLeaseReleaseStorage {
	readonly length: number;
	getItem(key: string): string | null;
	key(index: number): string | null;
	removeItem(key: string): void;
	setItem(key: string, value: string): void;
}

export interface IWorkspaceLeaseReleaseIntent {
	leaseId: string;
	workspaceId: string;
}

function createIntentKey(leaseId: string) {
	return `${WORKSPACE_LEASE_RELEASE_INTENT_KEY_PREFIX}${leaseId}`;
}

function parseIntent(
	key: string,
	value: string
): IWorkspaceLeaseReleaseIntent | null {
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const leaseId = Reflect.get(parsed, 'leaseId');
		const workspaceId = Reflect.get(parsed, 'workspaceId');
		if (
			typeof leaseId !== 'string' ||
			leaseId.length === 0 ||
			typeof workspaceId !== 'string' ||
			workspaceId.length === 0 ||
			key !== createIntentKey(leaseId)
		) {
			return null;
		}
		return { leaseId, workspaceId };
	} catch {
		return null;
	}
}

export function readWorkspaceLeaseReleaseIntents(
	storage: IWorkspaceLeaseReleaseStorage | null
): IWorkspaceLeaseReleaseIntent[] {
	if (!storage) return [];
	try {
		const intents: IWorkspaceLeaseReleaseIntent[] = [];
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (!key?.startsWith(WORKSPACE_LEASE_RELEASE_INTENT_KEY_PREFIX)) {
				continue;
			}
			const value = storage.getItem(key);
			if (value === null) continue;
			const intent = parseIntent(key, value);
			if (intent) intents.push(intent);
		}
		return intents.sort((left, right) =>
			left.leaseId.localeCompare(right.leaseId)
		);
	} catch {
		return [];
	}
}

export function removeWorkspaceLeaseReleaseIntent(
	storage: IWorkspaceLeaseReleaseStorage | null,
	leaseId: string
) {
	if (!storage) return false;
	try {
		storage.removeItem(createIntentKey(leaseId));
		return true;
	} catch {
		return false;
	}
}

export function writeWorkspaceLeaseReleaseIntent(
	storage: IWorkspaceLeaseReleaseStorage | null,
	intent: IWorkspaceLeaseReleaseIntent
) {
	if (!storage || !intent.leaseId || !intent.workspaceId) return false;
	try {
		storage.setItem(
			createIntentKey(intent.leaseId),
			JSON.stringify(intent)
		);
		return true;
	} catch {
		return false;
	}
}
