'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';
import {
	createComparisonHashQueue,
	type IComparisonHashQueue,
} from '@/features/resourceComparison/client/files/comparisonHashQueue';
import { getComparisonSnapshotId } from '@/features/resourceComparison/client/files/comparisonSnapshotIdentity';
import {
	applyComparisonCommand,
	applyComparisonInverseCommand,
} from '@/features/resourceComparison/domain/applyComparisonCommand';
import { buildComparisonCommand } from '@/features/resourceComparison/domain/buildComparisonCommand';
import {
	type IBuildComparisonCommandInput,
	type IComparisonAssetHashPair,
	type IComparisonCommandBuildResult,
	type IComparisonContentSnapshot,
	type IComparisonInverseCommand,
	type IComparisonNode,
	type IComparisonSnapshot,
	type TComparisonAssetConflictResolution,
	type TComparisonExecutableCommandKind,
} from '@/features/resourceComparison/domain/contracts';
import { type TResourceEditorMutationSnapshot } from '@/features/resourceEditor/client/state/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

export type TComparisonReviewCommandKind = Extract<
	TComparisonExecutableCommandKind,
	'delete-added' | 'restore-removed'
>;

export interface IComparisonCommandRequest {
	commandKind: TComparisonReviewCommandKind;
	targetAssetPath?: string;
	targetNode: IComparisonNode;
}

export interface IComparisonCommandReview {
	assetConflictResolutions: ReadonlyMap<
		string,
		TComparisonAssetConflictResolution
	>;
	buildResult: IComparisonCommandBuildResult;
	includeReferencedAssets: boolean;
	request: IComparisonCommandRequest;
}

interface IUseComparisonCommandInput {
	isEditable: boolean;
	left: IComparisonSnapshot;
	right: IComparisonSnapshot;
}

interface IPrepareReviewOptions {
	assetConflictResolutions: ReadonlyMap<
		string,
		TComparisonAssetConflictResolution
	>;
	includeReferencedAssets: boolean;
}

interface ICurrentCommandContext {
	assetGeneration: number;
	right: IComparisonSnapshot;
}

const EMPTY_COUNTS = Object.freeze({
	added: 0,
	ambiguous: 0,
	modified: 0,
	removed: 0,
	unchanged: 0,
});

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError';
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function createAssetCommandNode(
	commandKind: TComparisonReviewCommandKind,
	node: IAssetComparisonNode
): IComparisonNode {
	return {
		children: [],
		counts: { ...EMPTY_COUNTS, [node.status]: 1 },
		editCapabilities: [commandKind],
		fieldPath: [node.path],
		id: `asset:${node.kind}:${node.path}`,
		issues: [],
		kind: node.kind === 'folder' ? 'folder' : 'asset',
		label: node.name,
		leftValue: node.isLeftPresent
			? { isPresent: true, value: node.path }
			: { isPresent: false },
		parentId: null,
		rawFieldName: node.name,
		referenceImpacts: [],
		rightValue: node.isRightPresent
			? { isPresent: true, value: node.path }
			: { isPresent: false },
		status: node.status === 'removed' ? 'removed' : 'added',
	};
}

function toComparisonSnapshot(
	current: TResourceEditorMutationSnapshot,
	revision: number,
	source: IComparisonSnapshot['source']
): IComparisonSnapshot {
	return {
		files: current.files,
		folders: current.folders,
		hasLicenseFile: current.hasLicenseFile,
		license: current.license,
		resourcePack: current.resourcePack,
		revision,
		source,
	};
}

function applyComparisonContent(
	current: TResourceEditorMutationSnapshot,
	next: IComparisonContentSnapshot
): TResourceEditorMutationSnapshot {
	return {
		...current,
		files: next.files,
		folders: next.folders,
		hasLicenseFile: next.hasLicenseFile,
		license: next.license,
		resourcePack: next.resourcePack,
	};
}

function createBuildInput(
	left: IComparisonSnapshot,
	context: ICurrentCommandContext,
	request: IComparisonCommandRequest,
	options: IPrepareReviewOptions,
	assetHashes?: ReadonlyMap<string, IComparisonAssetHashPair>
): IBuildComparisonCommandInput {
	return {
		assetConflictResolutions: options.assetConflictResolutions,
		...(assetHashes ? { assetHashes } : {}),
		commandKind: request.commandKind,
		expectedAssetGeneration: context.assetGeneration,
		includeReferencedAssets: options.includeReferencedAssets,
		left,
		right: context.right,
		...(request.targetAssetPath
			? { targetAssetPath: request.targetAssetPath }
			: {}),
		targetNode: request.targetNode,
	};
}

function collectHashCandidatePaths(result: IComparisonCommandBuildResult) {
	return [
		...new Set(
			result.plan.conflicts.flatMap((conflict) =>
				conflict.kind === 'path-content-mismatch' && conflict.assetPath
					? [conflict.assetPath]
					: []
			)
		),
	].sort();
}

export function useComparisonCommand({
	isEditable,
	left,
	right,
}: IUseComparisonCommandInput) {
	const {
		activeWorkspaceId,
		applyWorkspaceMutation,
		assets,
		isAssetGenerationCurrent,
		readCurrentWorkspaceSnapshot,
		revision,
	} = useResourceEditor();
	const [actionError, setActionError] = useState<string | null>(null);
	const [inverse, setInverse] = useState<IComparisonInverseCommand | null>(
		null
	);
	const [isExecuting, setIsExecuting] = useState(false);
	const [isPlanning, setIsPlanning] = useState(false);
	const [review, setReview] = useState<IComparisonCommandReview | null>(null);
	const hashQueueRef = useRef<IComparisonHashQueue | null>(null);
	const preflightControllerRef = useRef<AbortController | null>(null);
	const preflightGenerationRef = useRef(0);
	const leftSnapshotId = useMemo(() => getComparisonSnapshotId(left), [left]);
	const sessionKey = useMemo(() => {
		const rightSourceId =
			right.source.kind === 'workspace'
				? `workspace:${right.source.workspaceId}`
				: `archive:${right.source.sourceId}`;
		return JSON.stringify([leftSnapshotId, rightSourceId]);
	}, [leftSnapshotId, right.source]);

	useEffect(() => {
		const queue = createComparisonHashQueue();
		hashQueueRef.current = queue;
		return () => {
			preflightControllerRef.current?.abort();
			if (hashQueueRef.current === queue) hashQueueRef.current = null;
			queue.dispose();
		};
	}, [sessionKey]);

	useEffect(() => {
		preflightGenerationRef.current += 1;
		preflightControllerRef.current?.abort();
		setActionError(null);
		setInverse(null);
		setIsPlanning(false);
		setReview(null);
	}, [sessionKey]);

	useEffect(() => {
		if (!isEditable) {
			preflightGenerationRef.current += 1;
			preflightControllerRef.current?.abort();
			setInverse(null);
			setIsPlanning(false);
			setReview(null);
		}
	}, [isEditable]);

	useEffect(() => {
		if (inverse && revision !== inverse.expectedRevision) {
			setInverse(null);
		}
		if (review && revision !== review.buildResult.plan.expectedRevision) {
			setReview(null);
			setActionError('新版内容已变化，请重新确认操作。');
		}
	}, [inverse, review, revision]);

	const readCurrentContext = useCallback((): ICurrentCommandContext => {
		if (!isEditable || right.source.kind !== 'workspace') {
			throw new Error('当前对比页没有新版编辑权。');
		}
		if (activeWorkspaceId !== right.source.workspaceId) {
			throw new Error('新版工作区已变化。');
		}
		const current = readCurrentWorkspaceSnapshot();
		if (!current) throw new Error('无法读取新版工作区的当前内容。');
		return {
			assetGeneration: assets.generation,
			right: {
				files: current.files,
				folders: current.folders,
				hasLicenseFile: current.hasLicenseFile,
				license: current.license,
				resourcePack: current.resourcePack,
				revision: current.revision,
				source: right.source,
			},
		};
	}, [
		activeWorkspaceId,
		assets.generation,
		isEditable,
		readCurrentWorkspaceSnapshot,
		right.source,
	]);

	const prepareReview = useCallback(
		async (
			request: IComparisonCommandRequest,
			options: IPrepareReviewOptions
		) => {
			const queue = hashQueueRef.current;
			if (!queue) {
				setActionError('操作尚未准备完成，请稍后重试。');
				return false;
			}
			const requestGeneration = preflightGenerationRef.current + 1;
			preflightGenerationRef.current = requestGeneration;
			preflightControllerRef.current?.abort();
			const controller = new AbortController();
			preflightControllerRef.current = controller;
			setActionError(null);
			setIsPlanning(true);
			try {
				const context = readCurrentContext();
				const initialBuild = buildComparisonCommand(
					createBuildInput(left, context, request, options)
				);
				const assetHashes = new Map<string, IComparisonAssetHashPair>();
				const rightSnapshotId = getComparisonSnapshotId(context.right);
				await Promise.all(
					collectHashCandidatePaths(initialBuild).map(
						async (path) => {
							const leftBlob = left.files.get(path);
							const rightBlob = context.right.files.get(path);
							if (!leftBlob || !rightBlob) return;
							const [leftHash, rightHash] = await Promise.all([
								queue.hash({
									blob: leftBlob,
									path,
									signal: controller.signal,
									snapshotId: leftSnapshotId,
								}),
								queue.hash({
									blob: rightBlob,
									path,
									signal: controller.signal,
									snapshotId: rightSnapshotId,
								}),
							]);
							assetHashes.set(path, {
								...(leftHash.status === 'hashed'
									? { leftHash: leftHash.hash }
									: {}),
								...(rightHash.status === 'hashed'
									? { rightHash: rightHash.hash }
									: {}),
							});
						}
					)
				);
				if (
					controller.signal.aborted ||
					preflightGenerationRef.current !== requestGeneration
				) {
					return false;
				}
				const latest = readCurrentWorkspaceSnapshot();
				if (
					!latest ||
					latest.revision !== context.right.revision ||
					!isAssetGenerationCurrent(context.assetGeneration)
				) {
					throw new Error('新版内容已变化，请重新操作。');
				}
				const buildResult = buildComparisonCommand(
					createBuildInput(
						left,
						context,
						request,
						options,
						assetHashes
					)
				);
				setReview({
					assetConflictResolutions: options.assetConflictResolutions,
					buildResult,
					includeReferencedAssets: options.includeReferencedAssets,
					request,
				});
				return true;
			} catch (error) {
				if (isAbortError(error)) return false;
				if (preflightGenerationRef.current === requestGeneration) {
					setReview(null);
					setActionError(describeError(error));
				}
				return false;
			} finally {
				if (preflightGenerationRef.current === requestGeneration) {
					setIsPlanning(false);
				}
			}
		},
		[
			isAssetGenerationCurrent,
			left,
			leftSnapshotId,
			readCurrentContext,
			readCurrentWorkspaceSnapshot,
		]
	);

	const requestFieldCommand = useCallback(
		(node: IComparisonNode, commandKind: TComparisonReviewCommandKind) => {
			void prepareReview(
				{ commandKind, targetNode: node },
				{
					assetConflictResolutions: new Map(),
					includeReferencedAssets: false,
				}
			);
		},
		[prepareReview]
	);

	const requestAssetCommand = useCallback(
		(
			commandKind: TComparisonReviewCommandKind,
			node: IAssetComparisonNode
		) =>
			void prepareReview(
				{
					commandKind,
					targetAssetPath: node.path,
					targetNode: createAssetCommandNode(commandKind, node),
				},
				{
					assetConflictResolutions: new Map(),
					includeReferencedAssets: false,
				}
			),
		[prepareReview]
	);

	const closeReview = useCallback(() => {
		preflightGenerationRef.current += 1;
		preflightControllerRef.current?.abort();
		setIsPlanning(false);
		setReview(null);
	}, []);

	const setAssetConflictResolution = useCallback(
		(path: string, resolution: TComparisonAssetConflictResolution) => {
			if (!review) return;
			const nextResolutions = new Map(review.assetConflictResolutions);
			nextResolutions.set(path, resolution);
			void prepareReview(review.request, {
				assetConflictResolutions: nextResolutions,
				includeReferencedAssets: review.includeReferencedAssets,
			});
		},
		[prepareReview, review]
	);

	const setIncludeReferencedAssets = useCallback(
		(includeReferencedAssets: boolean) => {
			if (!review) return;
			void prepareReview(review.request, {
				assetConflictResolutions: review.assetConflictResolutions,
				includeReferencedAssets,
			});
		},
		[prepareReview, review]
	);

	const executeReview = useCallback(() => {
		setActionError(null);
		const buildResult = review?.buildResult;
		const command = buildResult?.command;
		if (!review || !command || !buildResult.plan.isApplicable) {
			setActionError('当前操作仍有未解决的冲突。');
			return false;
		}
		if (!isEditable || right.source.kind !== 'workspace') {
			setReview(null);
			setActionError('当前对比页没有新版编辑权。');
			return false;
		}
		if (
			activeWorkspaceId !== buildResult.plan.expectedWorkspaceId ||
			right.source.workspaceId !== buildResult.plan.expectedWorkspaceId
		) {
			setReview(null);
			setActionError('新版工作区已变化，请重新确认操作。');
			return false;
		}
		setIsExecuting(true);
		let nextInverse: IComparisonInverseCommand | undefined;
		const result = applyWorkspaceMutation({
			expectedRevision: buildResult.plan.expectedRevision,
			mutate(current) {
				const application = applyComparisonCommand(command, {
					assetGeneration: assets.generation,
					current: toComparisonSnapshot(
						current,
						buildResult.plan.expectedRevision,
						right.source
					),
				});
				if (!application.isSuccess || !application.next) {
					throw new Error(
						application.conflict?.message ?? '操作内容已经失效。'
					);
				}
				nextInverse = application.inverse;
				return applyComparisonContent(current, application.next);
			},
		});
		setIsExecuting(false);
		setReview(null);
		if (!result.isSuccess || result.revision === undefined) {
			setInverse(null);
			setActionError(result.error ?? '无法执行当前操作。');
			return false;
		}
		if (!nextInverse || nextInverse.expectedRevision !== result.revision) {
			setInverse(null);
			setActionError('修改已保存，但当前状态无法安全撤销。');
			return true;
		}
		setInverse(nextInverse);
		return true;
	}, [
		activeWorkspaceId,
		applyWorkspaceMutation,
		assets.generation,
		isEditable,
		review,
		right.source,
	]);

	const undoLastCommand = useCallback(() => {
		setActionError(null);
		if (!inverse || right.source.kind !== 'workspace' || !isEditable) {
			return false;
		}
		if (
			activeWorkspaceId !== inverse.expectedWorkspaceId ||
			right.source.workspaceId !== inverse.expectedWorkspaceId
		) {
			setInverse(null);
			setActionError('新版工作区已变化，无法撤销。');
			return false;
		}
		let inverseError: string | undefined;
		const result = applyWorkspaceMutation({
			expectedRevision: inverse.expectedRevision,
			mutate(current) {
				const application = applyComparisonInverseCommand(inverse, {
					assetGeneration: assets.generation,
					current: toComparisonSnapshot(
						current,
						inverse.expectedRevision,
						right.source
					),
				});
				if (!application.isSuccess || !application.next) {
					inverseError =
						application.conflict?.message ??
						'新版内容已变化，无法安全撤销。';
					throw new Error(inverseError);
				}
				return applyComparisonContent(current, application.next);
			},
		});
		setInverse(null);
		if (!result.isSuccess) {
			setActionError(
				inverseError ?? result.error ?? '新版内容已变化，无法安全撤销。'
			);
			return false;
		}
		return true;
	}, [
		activeWorkspaceId,
		applyWorkspaceMutation,
		assets.generation,
		inverse,
		isEditable,
		right.source,
	]);

	return {
		actionError,
		closeReview,
		executeReview,
		isEditable,
		isExecuting,
		isPlanning,
		isUndoAvailable: inverse !== null && isEditable,
		requestAssetCommand,
		requestFieldCommand,
		review,
		setAssetConflictResolution,
		setIncludeReferencedAssets,
		undoLastCommand,
	};
}
