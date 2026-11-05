import 'client-only';

export interface IComparisonObjectUrlEnvironment {
	createObjectURL(blob: Blob): string;
	revokeObjectURL(url: string): void;
}

export interface IComparisonObjectUrlLease {
	release(): void;
	url: string;
}

export interface IComparisonObjectUrlRegistry {
	acquire(blob: Blob): IComparisonObjectUrlLease;
	dispose(): void;
	getActiveUrlCount(): number;
}

interface IObjectUrlEntry {
	referenceCount: number;
	url: string;
}

const MAX_INACTIVE_OBJECT_URL_COUNT = 2;

export function createComparisonObjectUrlRegistry(
	environment: IComparisonObjectUrlEnvironment = {
		createObjectURL: (blob) => URL.createObjectURL(blob),
		revokeObjectURL: (url) => URL.revokeObjectURL(url),
	}
): IComparisonObjectUrlRegistry {
	const entries = new Map<Blob, IObjectUrlEntry>();
	const inactiveBlobs = new Set<Blob>();
	let isDisposed = false;
	const pruneInactiveEntries = () => {
		while (inactiveBlobs.size > MAX_INACTIVE_OBJECT_URL_COUNT) {
			const oldestBlob = inactiveBlobs.values().next().value;
			if (!oldestBlob) return;
			inactiveBlobs.delete(oldestBlob);
			const oldestEntry = entries.get(oldestBlob);
			if (!oldestEntry || oldestEntry.referenceCount > 0) continue;
			entries.delete(oldestBlob);
			environment.revokeObjectURL(oldestEntry.url);
		}
	};

	return {
		acquire(blob) {
			if (isDisposed) {
				throw new DOMException('预览资源已释放', 'AbortError');
			}
			let entry = entries.get(blob);
			if (entry) {
				inactiveBlobs.delete(blob);
				entry.referenceCount += 1;
			} else {
				entry = {
					referenceCount: 1,
					url: environment.createObjectURL(blob),
				};
				entries.set(blob, entry);
			}
			let isReleased = false;
			return {
				release() {
					if (isReleased) return;
					isReleased = true;
					const activeEntry = entries.get(blob);
					if (!activeEntry || activeEntry !== entry) return;
					activeEntry.referenceCount = Math.max(
						activeEntry.referenceCount - 1,
						0
					);
					if (activeEntry.referenceCount === 0) {
						inactiveBlobs.delete(blob);
						inactiveBlobs.add(blob);
						pruneInactiveEntries();
					}
				},
				url: entry.url,
			};
		},
		dispose() {
			if (isDisposed) return;
			isDisposed = true;
			for (const entry of entries.values()) {
				environment.revokeObjectURL(entry.url);
			}
			entries.clear();
			inactiveBlobs.clear();
		},
		getActiveUrlCount() {
			let activeUrlCount = 0;
			for (const entry of entries.values()) {
				if (entry.referenceCount > 0) activeUrlCount += 1;
			}
			return activeUrlCount;
		},
	};
}
