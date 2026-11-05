import 'client-only';

import {
	getAssetKind,
	type TAssetKind,
} from '@/domain/resourcePack/assetTypes';

import type {
	IComparisonHashQueue,
	TComparisonHashResult,
} from './comparisonHashQueue';

export type TComparisonFileAnalysisStatus =
	'added' | 'modified' | 'removed' | 'unchanged' | 'unknown';

export type TComparisonFileAnalysisReason =
	'content' | 'hash-failed' | 'metadata' | 'presence';

export type TComparisonFileHashStatus = 'failed' | 'hashed' | 'not-requested';

export interface IComparisonFileInput {
	blob: Blob;
	path: string;
	snapshotId: string;
}

export interface IComparisonAnalyzedFile {
	hash?: string;
	hashError?: string;
	hashStatus: TComparisonFileHashStatus;
	kind: TAssetKind;
	mimeType: string;
	path: string;
	size: number;
}

export interface IComparisonFilePairAnalysis {
	isPotentialMove: boolean;
	left?: IComparisonAnalyzedFile;
	reason: TComparisonFileAnalysisReason;
	right?: IComparisonAnalyzedFile;
	status: TComparisonFileAnalysisStatus;
}

export interface IAnalyzeComparisonFilePairInput {
	hashQueue: IComparisonHashQueue;
	left?: IComparisonFileInput;
	right?: IComparisonFileInput;
	signal?: AbortSignal;
}

export interface IAnalyzeComparisonFileInput extends IComparisonFileInput {
	hashQueue: IComparisonHashQueue;
	signal?: AbortSignal;
}

function createMetadata(
	input: IComparisonFileInput,
	hashResult?: TComparisonHashResult
): IComparisonAnalyzedFile {
	return {
		...(hashResult?.status === 'hashed' ? { hash: hashResult.hash } : {}),
		...(hashResult?.status === 'failed'
			? { hashError: hashResult.error }
			: {}),
		hashStatus: hashResult?.status ?? 'not-requested',
		kind: getAssetKind(input.path),
		mimeType: input.blob.type,
		path: input.path,
		size: input.blob.size,
	};
}

export async function analyzeComparisonFile(
	input: IAnalyzeComparisonFileInput
): Promise<IComparisonAnalyzedFile> {
	const hashResult = await input.hashQueue.hash({
		blob: input.blob,
		path: input.path,
		...(input.signal ? { signal: input.signal } : {}),
		snapshotId: input.snapshotId,
	});
	return createMetadata(input, hashResult);
}

export async function analyzeComparisonFilePair(
	input: IAnalyzeComparisonFilePairInput
): Promise<IComparisonFilePairAnalysis> {
	if (!input.left && !input.right) {
		throw new Error('文件对比至少需要一侧文件。');
	}
	if (!input.left) {
		const right = input.right;
		if (!right) throw new Error('文件对比缺少新版文件。');
		return {
			isPotentialMove: false,
			reason: 'presence',
			right: await analyzeComparisonFile({
				...right,
				hashQueue: input.hashQueue,
				...(input.signal ? { signal: input.signal } : {}),
			}),
			status: 'added',
		};
	}
	if (!input.right) {
		return {
			isPotentialMove: false,
			left: await analyzeComparisonFile({
				...input.left,
				hashQueue: input.hashQueue,
				...(input.signal ? { signal: input.signal } : {}),
			}),
			reason: 'presence',
			status: 'removed',
		};
	}

	const leftMetadata = createMetadata(input.left);
	const rightMetadata = createMetadata(input.right);
	if (
		leftMetadata.size !== rightMetadata.size ||
		leftMetadata.mimeType !== rightMetadata.mimeType
	) {
		return {
			isPotentialMove: false,
			left: leftMetadata,
			reason: 'metadata',
			right: rightMetadata,
			status: 'modified',
		};
	}

	const [leftHash, rightHash] = await Promise.all([
		input.hashQueue.hash({
			blob: input.left.blob,
			path: input.left.path,
			...(input.signal ? { signal: input.signal } : {}),
			snapshotId: input.left.snapshotId,
		}),
		input.hashQueue.hash({
			blob: input.right.blob,
			path: input.right.path,
			...(input.signal ? { signal: input.signal } : {}),
			snapshotId: input.right.snapshotId,
		}),
	]);
	const left = createMetadata(input.left, leftHash);
	const right = createMetadata(input.right, rightHash);
	if (leftHash.status === 'failed' || rightHash.status === 'failed') {
		return {
			isPotentialMove: false,
			left,
			reason: 'hash-failed',
			right,
			status: 'unknown',
		};
	}

	const isSameContent = leftHash.hash === rightHash.hash;
	const isSamePath = input.left.path === input.right.path;
	return {
		isPotentialMove: isSameContent && !isSamePath,
		left,
		reason: 'content',
		right,
		status: isSameContent && isSamePath ? 'unchanged' : 'modified',
	};
}
