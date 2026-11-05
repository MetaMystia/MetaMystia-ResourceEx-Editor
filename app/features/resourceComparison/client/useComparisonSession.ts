'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import type { IComparisonSnapshot } from '@/features/resourceComparison/domain/contracts';
import type { IReadResourcePackArchiveResult } from '@/features/resourceEditor/client/archive/contracts';
import { readResourcePackArchive } from '@/features/resourceEditor/client/archive/readResourcePackArchive';
import { createEditorNavigationUrl } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';
import type {
	IWorkspaceLoadedSnapshot,
	IWorkspaceOperationResult,
	IWorkspaceSummary,
} from '@/features/resourceEditor/client/workspaces/contracts';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

import type { IComparisonStartupIntent } from './comparisonStartupIntent';

export type TComparisonLeftState =
	| { status: 'empty' }
	| { status: 'loading' }
	| { error: string; status: 'error' }
	| {
			isStale: boolean;
			snapshot: IComparisonSnapshot;
			status: 'ready';
			workspace?: IWorkspaceSummary;
	  };

export type TComparisonRightState =
	| { status: 'empty' }
	| { error: string; status: 'error' }
	| {
			snapshot?: IComparisonSnapshot;
			status: 'invalid';
			workspace?: IWorkspaceSummary;
			error: string;
	  }
	| { status: 'preparing'; workspaceId?: string }
	| { status: 'preset'; workspace: IWorkspaceSummary }
	| {
			snapshot: IComparisonSnapshot;
			status: 'editable' | 'observing';
			workspace: IWorkspaceSummary;
	  };

export interface IComparisonRightCopyCandidate {
	snapshot: IComparisonSnapshot;
	workspace: IWorkspaceSummary;
}

interface ISelectRightWorkspaceOptions {
	retainCurrent?: boolean;
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function createArchiveComparisonSnapshot(
	archive: IReadResourcePackArchiveResult,
	fileName: string,
	sourceId: string
): IComparisonSnapshot {
	return {
		files: archive.files,
		folders: archive.folders,
		hasLicenseFile: archive.hasLicenseFile,
		license: archive.license,
		resourcePack: archive.resourcePack,
		revision: null,
		source: { fileName, kind: 'archive', sourceId },
	};
}

export function createWorkspaceComparisonSnapshot(
	loaded: IWorkspaceLoadedSnapshot
): IComparisonSnapshot {
	return {
		files: loaded.snapshot.files,
		folders: loaded.snapshot.folders,
		hasLicenseFile: loaded.snapshot.hasLicenseFile,
		license: loaded.snapshot.license,
		resourcePack: loaded.snapshot.resourcePack,
		revision: loaded.snapshot.revision,
		source: { kind: 'workspace', workspaceId: loaded.workspace.id },
	};
}

export function getComparisonSnapshotLabel(snapshot: IComparisonSnapshot) {
	return snapshot.resourcePack.packInfo.label?.trim() ?? '';
}

export function getRightSourceDisabledReason(
	left: TComparisonLeftState
): string | null {
	switch (left.status) {
		case 'empty':
			return '请先选择或上传旧版资源包';
		case 'loading':
			return '正在读取旧版';
		case 'error':
			return `旧版读取失败：${left.error}`;
		case 'ready':
			return getComparisonSnapshotLabel(left.snapshot)
				? null
				: '旧版的资源包标识符（Label）为空';
	}
}

export function filterComparisonWorkspaceCandidates(
	workspaces: readonly IWorkspaceSummary[],
	left: TComparisonLeftState
) {
	if (left.status !== 'ready') return [];
	const leftLabel = getComparisonSnapshotLabel(left.snapshot);
	if (!leftLabel) return [];
	const leftWorkspaceId =
		left.snapshot.source.kind === 'workspace'
			? left.snapshot.source.workspaceId
			: null;
	return workspaces.filter(
		(workspace) =>
			workspace.id !== leftWorkspaceId &&
			(workspace.label?.trim() ?? '') === leftLabel
	);
}

function validateRightSnapshot(
	left: TComparisonLeftState,
	snapshot: IComparisonSnapshot
) {
	if (left.status !== 'ready') return '旧版尚未就绪';
	const leftLabel = getComparisonSnapshotLabel(left.snapshot);
	const rightLabel = getComparisonSnapshotLabel(snapshot);
	if (!leftLabel) return '旧版的资源包标识符（Label）为空';
	if (!rightLabel) return '新版的资源包标识符（Label）为空';
	if (leftLabel !== rightLabel) {
		return `两侧资源包标识符（Label）不一致：${leftLabel}≠${rightLabel}`;
	}
	if (
		left.snapshot.source.kind === 'workspace' &&
		snapshot.source.kind === 'workspace' &&
		left.snapshot.source.workspaceId === snapshot.source.workspaceId
	) {
		return '不能对比同一工作区';
	}
	return null;
}

export function useComparisonSession(
	startupIntent: IComparisonStartupIntent | null = null
) {
	const {
		activeWorkspaceId,
		readCurrentWorkspaceSnapshot,
		revision,
		storageMode,
	} = useResourceEditor();
	const {
		activeWorkspace,
		closeWorkspace,
		consumeLeaseLossResolution,
		importWorkspace,
		leaseLoss,
		leaseLossResolution,
		openWorkspace,
		readWorkspaceSnapshot,
		workspaceCatalogGeneration,
		workspaces,
		yieldActiveWorkspace,
	} = useResourceWorkspaces();
	const [left, setLeft] = useState<TComparisonLeftState>(() =>
		startupIntent
			? {
					isStale: false,
					snapshot: startupIntent.left.snapshot,
					status: 'ready',
					...(startupIntent.left.workspace === undefined
						? {}
						: { workspace: startupIntent.left.workspace }),
				}
			: { status: 'empty' }
	);
	const [right, setRight] = useState<TComparisonRightState>(() =>
		startupIntent
			? { status: 'preset', workspace: startupIntent.rightWorkspace }
			: { status: 'empty' }
	);
	const [isYieldingEditor, setIsYieldingEditor] = useState(false);
	const [isReacquiringEditor, setIsReacquiringEditor] = useState(false);
	const [rightCopyCandidate, setRightCopyCandidate] =
		useState<IComparisonRightCopyCandidate | null>(null);
	const [sessionActionError, setSessionActionError] = useState<string | null>(
		null
	);
	const copyRequestGenerationRef = useRef(0);
	const leftRequestGenerationRef = useRef(0);
	const rightRef = useRef<TComparisonRightState>(right);
	const rightRequestControllerRef = useRef<AbortController | null>(null);
	const rightRequestGenerationRef = useRef(0);
	rightRef.current = right;

	const rightWorkspaceCandidates = useMemo(
		() => filterComparisonWorkspaceCandidates(workspaces, left),
		[left, workspaces]
	);
	const rightDisabledReason = getRightSourceDisabledReason(left);

	const clearSelectedRight = useCallback(async () => {
		rightRequestControllerRef.current?.abort();
		rightRequestControllerRef.current = null;
		rightRequestGenerationRef.current += 1;
		const selectedRight = rightRef.current;
		const selectedWorkspaceId =
			'workspace' in selectedRight
				? selectedRight.workspace.id
				: 'workspaceId' in selectedRight
					? selectedRight.workspaceId
					: undefined;
		if (selectedWorkspaceId && activeWorkspaceId === selectedWorkspaceId) {
			const result = await closeWorkspace();
			if (!result.isSuccess) return result;
		}
		setRight({ status: 'empty' });
		return { isSuccess: true } satisfies IWorkspaceOperationResult;
	}, [activeWorkspaceId, closeWorkspace]);

	const prepareLeftSelection = useCallback(async () => {
		leftRequestGenerationRef.current += 1;
		const requestGeneration = leftRequestGenerationRef.current;
		const clearResult = await clearSelectedRight();
		if (leftRequestGenerationRef.current !== requestGeneration) return null;
		if (!clearResult.isSuccess) {
			setLeft({
				error: clearResult.error ?? '无法结束新版编辑',
				status: 'error',
			});
			return null;
		}
		setLeft({ status: 'loading' });
		return requestGeneration;
	}, [clearSelectedRight]);

	const selectLeftArchive = useCallback(
		async (file: File) => {
			const requestGeneration = await prepareLeftSelection();
			if (requestGeneration === null) return;
			try {
				const archive = await readResourcePackArchive(file);
				if (leftRequestGenerationRef.current !== requestGeneration)
					return;
				const snapshot = createArchiveComparisonSnapshot(
					archive,
					file.name,
					crypto.randomUUID()
				);
				const label = getComparisonSnapshotLabel(snapshot);
				if (!label) {
					setLeft({
						error: '资源包标识符（Label）为空',
						status: 'error',
					});
					return;
				}
				setLeft({ isStale: false, snapshot, status: 'ready' });
			} catch (error) {
				if (leftRequestGenerationRef.current !== requestGeneration)
					return;
				setLeft({ error: describeError(error), status: 'error' });
			}
		},
		[prepareLeftSelection]
	);

	const selectLeftWorkspace = useCallback(
		async (workspaceId: string) => {
			const requestGeneration = await prepareLeftSelection();
			if (requestGeneration === null) return;
			try {
				if (activeWorkspaceId === workspaceId) {
					const closeResult = await closeWorkspace();
					if (!closeResult.isSuccess) {
						throw new Error(
							closeResult.error ?? '无法释放旧版工作区的编辑权'
						);
					}
				}
				const loaded = await readWorkspaceSnapshot(
					workspaceId,
					'current'
				);
				if (leftRequestGenerationRef.current !== requestGeneration)
					return;
				const snapshot = createWorkspaceComparisonSnapshot(loaded);
				if (!getComparisonSnapshotLabel(snapshot)) {
					setLeft({
						error: '资源包标识符（Label）为空',
						status: 'error',
					});
					return;
				}
				setLeft({
					isStale: false,
					snapshot,
					status: 'ready',
					workspace: loaded.workspace,
				});
			} catch (error) {
				if (leftRequestGenerationRef.current !== requestGeneration)
					return;
				setLeft({ error: describeError(error), status: 'error' });
			}
		},
		[
			activeWorkspaceId,
			closeWorkspace,
			prepareLeftSelection,
			readWorkspaceSnapshot,
		]
	);

	const reloadLeftWorkspace = useCallback(async () => {
		if (
			left.status !== 'ready' ||
			left.snapshot.source.kind !== 'workspace'
		) {
			return;
		}
		await selectLeftWorkspace(left.snapshot.source.workspaceId);
	}, [left, selectLeftWorkspace]);

	const selectRightWorkspace = useCallback(
		async (
			workspaceId: string,
			options: ISelectRightWorkspaceOptions = {}
		) => {
			setRightCopyCandidate(null);
			setSessionActionError(null);
			if (options.retainCurrent) setIsReacquiringEditor(true);
			rightRequestControllerRef.current?.abort();
			const requestController = new AbortController();
			rightRequestControllerRef.current = requestController;
			const requestGeneration = rightRequestGenerationRef.current + 1;
			rightRequestGenerationRef.current = requestGeneration;
			if (!options.retainCurrent) {
				setRight({ status: 'preparing', workspaceId });
			}
			try {
				const loaded = await readWorkspaceSnapshot(
					workspaceId,
					'current'
				);
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				const initialSnapshot =
					createWorkspaceComparisonSnapshot(loaded);
				const validationError = validateRightSnapshot(
					left,
					initialSnapshot
				);
				if (validationError) {
					setRight({
						error: validationError,
						snapshot: initialSnapshot,
						status: 'invalid',
						workspace: loaded.workspace,
					});
					return;
				}
				if (
					activeWorkspace?.workspace.id !== workspaceId &&
					activeWorkspace
				) {
					const closeResult = await closeWorkspace();
					if (!closeResult.isSuccess) {
						throw new Error(
							closeResult.error ?? '无法结束当前资源包编辑'
						);
					}
				}
				const openResult = await openWorkspace(workspaceId, {
					recoveryMode: 'continue-current',
					signal: requestController.signal,
				});
				if (rightRequestGenerationRef.current !== requestGeneration) {
					if (openResult.isSuccess) {
						await yieldActiveWorkspace(workspaceId);
					}
					return;
				}
				if (openResult.isLeaseConflict) {
					setRight({
						snapshot: initialSnapshot,
						status: 'observing',
						workspace: loaded.workspace,
					});
					return;
				}
				if (!openResult.isSuccess) {
					const error = openResult.error ?? '无法打开新版工作区';
					if (options.retainCurrent) setSessionActionError(error);
					else setRight({ error, status: 'error' });
				}
			} catch (error) {
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				if (options.retainCurrent) {
					setSessionActionError(describeError(error));
				} else {
					setRight({ error: describeError(error), status: 'error' });
				}
			} finally {
				if (rightRequestControllerRef.current === requestController) {
					rightRequestControllerRef.current = null;
				}
				if (
					options.retainCurrent &&
					rightRequestGenerationRef.current === requestGeneration
				) {
					setIsReacquiringEditor(false);
				}
			}
		},
		[
			activeWorkspace,
			closeWorkspace,
			left,
			openWorkspace,
			readWorkspaceSnapshot,
			yieldActiveWorkspace,
		]
	);

	const importRightArchive = useCallback(
		async (file: File) => {
			if (rightDisabledReason) return;
			rightRequestControllerRef.current?.abort();
			rightRequestControllerRef.current = null;
			const requestGeneration = rightRequestGenerationRef.current + 1;
			rightRequestGenerationRef.current = requestGeneration;
			const previousRight = rightRef.current;
			setRight({ status: 'preparing' });
			try {
				const archive = await readResourcePackArchive(file);
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				const preflightSnapshot = createArchiveComparisonSnapshot(
					archive,
					file.name,
					crypto.randomUUID()
				);
				const validationError = validateRightSnapshot(
					left,
					preflightSnapshot
				);
				if (validationError) {
					setRight({ error: validationError, status: 'error' });
					return;
				}
			} catch (error) {
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				setRight({ error: describeError(error), status: 'error' });
				return;
			}
			const result = await importWorkspace(file);
			if (rightRequestGenerationRef.current !== requestGeneration) {
				if (result.workspaceId) {
					await yieldActiveWorkspace(result.workspaceId);
				}
				return;
			}
			if (result.isLeaseConflict && result.workspaceId) {
				await selectRightWorkspace(result.workspaceId);
				return;
			}
			if (!result.isSuccess) {
				setRight({
					error: result.error ?? '无法导入新版资源包',
					status: 'error',
				});
				return;
			}
			if (result.resolution === 'cancel') {
				setRight(previousRight);
				return;
			}
			if (!result.workspaceId) {
				setRight({ error: '导入结果中没有工作区', status: 'error' });
				return;
			}
			await selectRightWorkspace(result.workspaceId);
		},
		[
			importWorkspace,
			left,
			rightDisabledReason,
			selectRightWorkspace,
			yieldActiveWorkspace,
		]
	);

	useEffect(() => {
		if (right.status !== 'preset') return;
		void selectRightWorkspace(right.workspace.id);
	}, [right, selectRightWorkspace]);

	const returnFromRecovery = useCallback(async () => {
		const result = await closeWorkspace();
		if (result.isSuccess) setRight({ status: 'empty' });
		return result;
	}, [closeWorkspace]);

	useEffect(() => {
		if (
			left.status !== 'ready' ||
			left.snapshot.source.kind !== 'workspace'
		) {
			return;
		}
		const workspaceId = left.snapshot.source.workspaceId;
		const summary = workspaces.find(
			(workspace) => workspace.id === workspaceId
		);
		const isStale =
			!summary || summary.currentRevision !== left.snapshot.revision;
		if (left.isStale !== isStale) {
			setLeft({ ...left, isStale });
		}
	}, [left, workspaceCatalogGeneration, workspaces]);

	useEffect(() => {
		const selectedWorkspaceId =
			right.status === 'preparing'
				? right.workspaceId
				: 'workspace' in right
					? right.workspace.id
					: undefined;
		if (
			!selectedWorkspaceId ||
			activeWorkspaceId !== selectedWorkspaceId ||
			activeWorkspace?.workspace.id !== selectedWorkspaceId ||
			leaseLoss?.workspace.id === selectedWorkspaceId
		) {
			return;
		}
		const current = readCurrentWorkspaceSnapshot();
		if (!current) return;
		const loaded = {
			snapshot: current,
			workspace: activeWorkspace.workspace,
		};
		const snapshot = createWorkspaceComparisonSnapshot(loaded);
		const validationError = validateRightSnapshot(left, snapshot);
		if (validationError) {
			setRight({
				error: validationError,
				snapshot,
				status: 'invalid',
				workspace: activeWorkspace.workspace,
			});
			return;
		}
		if (
			right.status !== 'editable' ||
			right.snapshot.revision !== snapshot.revision
		) {
			setRight({
				snapshot,
				status: 'editable',
				workspace: activeWorkspace.workspace,
			});
		}
	}, [
		activeWorkspace,
		activeWorkspaceId,
		left,
		leaseLoss?.workspace.id,
		readCurrentWorkspaceSnapshot,
		revision,
		right,
	]);

	useEffect(() => {
		if (
			right.status !== 'editable' ||
			leaseLoss?.workspace.id !== right.workspace.id
		) {
			return;
		}
		setRight({ ...right, status: 'observing' });
	}, [leaseLoss?.workspace.id, right]);

	useEffect(() => {
		if (!leaseLossResolution) return;
		const resolution = consumeLeaseLossResolution();
		if (!resolution) return;
		if (resolution.action !== 'save-copy' || !resolution.workspaceId) {
			setRightCopyCandidate(null);
			return;
		}
		const requestGeneration = copyRequestGenerationRef.current + 1;
		copyRequestGenerationRef.current = requestGeneration;
		void readWorkspaceSnapshot(resolution.workspaceId, 'current')
			.then((loaded) => {
				if (copyRequestGenerationRef.current !== requestGeneration)
					return;
				const snapshot = createWorkspaceComparisonSnapshot(loaded);
				const validationError = validateRightSnapshot(left, snapshot);
				if (validationError) {
					setRightCopyCandidate(null);
					setSessionActionError(
						`保存的副本不能作为新版：${validationError}`
					);
					return;
				}
				setRightCopyCandidate({
					snapshot,
					workspace: loaded.workspace,
				});
			})
			.catch((error) => {
				if (copyRequestGenerationRef.current !== requestGeneration)
					return;
				setRightCopyCandidate(null);
				setSessionActionError(
					`无法读取保存的副本：${describeError(error)}`
				);
			});
	}, [
		consumeLeaseLossResolution,
		leaseLossResolution,
		left,
		readWorkspaceSnapshot,
	]);

	const openRightInFullEditor = useCallback(
		async (target: IResourceEditorNavigationTarget) => {
			setSessionActionError(null);
			const selectedRight = rightRef.current;
			if (selectedRight.status !== 'editable') {
				setSessionActionError('当前对比页没有新版编辑权');
				return;
			}
			if (storageMode !== 'persistent') {
				setSessionActionError('内存模式不支持跨标签页交接编辑权');
				return;
			}
			const editorTab = window.open('about:blank', '_blank');
			if (!editorTab) {
				setSessionActionError(
					'浏览器阻止了新标签页。请允许弹出窗口后重试。'
				);
				return;
			}
			setIsYieldingEditor(true);
			const workspaceId = selectedRight.workspace.id;
			rightRequestGenerationRef.current += 1;
			try {
				const result = await yieldActiveWorkspace(workspaceId);
				if (!result.isSuccess || !result.loaded) {
					editorTab.close();
					setSessionActionError(
						result.error ?? '无法让出新版工作区的编辑权'
					);
					return;
				}
				const snapshot = createWorkspaceComparisonSnapshot(
					result.loaded
				);
				const validationError = validateRightSnapshot(left, snapshot);
				if (validationError) {
					editorTab.close();
					setRight({
						error: validationError,
						snapshot,
						status: 'invalid',
						workspace: result.loaded.workspace,
					});
					return;
				}
				setRight({
					snapshot,
					status: 'observing',
					workspace: result.loaded.workspace,
				});
				if (editorTab.closed) {
					setSessionActionError(
						'新标签页已关闭。新版编辑权已经让出，可在对比页重新获取。'
					);
					return;
				}
				const editorUrl = createEditorNavigationUrl(
					window.location.href,
					{ continueCurrent: true, target, workspaceId }
				);
				try {
					editorTab.opener = null;
					editorTab.location.replace(editorUrl);
				} catch (error) {
					editorTab.close();
					setSessionActionError(
						`无法打开完整编辑器：${describeError(error)}`
					);
				}
			} catch (error) {
				editorTab.close();
				setSessionActionError(
					`无法让出新版工作区的编辑权：${describeError(error)}`
				);
			} finally {
				setIsYieldingEditor(false);
			}
		},
		[left, storageMode, yieldActiveWorkspace]
	);

	const reacquireRightEditor = useCallback(() => {
		const selectedRight = rightRef.current;
		if (selectedRight.status !== 'observing') return;
		void selectRightWorkspace(selectedRight.workspace.id, {
			retainCurrent: true,
		});
	}, [selectRightWorkspace]);

	const selectRightCopyCandidate = useCallback(() => {
		if (!rightCopyCandidate) return;
		void selectRightWorkspace(rightCopyCandidate.workspace.id);
	}, [rightCopyCandidate, selectRightWorkspace]);

	useEffect(() => {
		if (right.status !== 'observing') return;
		const requestGeneration = rightRequestGenerationRef.current + 1;
		rightRequestGenerationRef.current = requestGeneration;
		void readWorkspaceSnapshot(right.workspace.id, 'current')
			.then((loaded) => {
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				const snapshot = createWorkspaceComparisonSnapshot(loaded);
				const validationError = validateRightSnapshot(left, snapshot);
				setRight(
					validationError
						? {
								error: validationError,
								snapshot,
								status: 'invalid',
								workspace: loaded.workspace,
							}
						: {
								snapshot,
								status: 'observing',
								workspace: loaded.workspace,
							}
				);
			})
			.catch((error) => {
				if (rightRequestGenerationRef.current !== requestGeneration)
					return;
				setRight({
					error: `无法刷新新版工作区：${describeError(error)}`,
					snapshot: right.snapshot,
					status: 'invalid',
					workspace: right.workspace,
				});
			});
	}, [left, readWorkspaceSnapshot, right.status, workspaceCatalogGeneration]);

	useEffect(
		() => () => {
			copyRequestGenerationRef.current += 1;
			leftRequestGenerationRef.current += 1;
			rightRequestControllerRef.current?.abort();
			rightRequestControllerRef.current = null;
			rightRequestGenerationRef.current += 1;
		},
		[]
	);

	return {
		clearSelectedRight,
		fullEditorDisabledReason:
			storageMode === 'memory'
				? '内存模式不支持跨标签页交接编辑权'
				: isYieldingEditor
					? '正在让出新版编辑权'
					: right.status !== 'editable'
						? '当前对比页没有新版编辑权'
						: null,
		importRightArchive,
		isReacquiringEditor,
		isYieldingEditor,
		left,
		openRightInFullEditor,
		reacquireRightEditor,
		reloadLeftWorkspace,
		returnFromRecovery,
		right,
		rightCopyCandidate,
		rightDisabledReason,
		rightWorkspaceCandidates,
		selectLeftArchive,
		selectLeftWorkspace,
		selectRightCopyCandidate,
		selectRightWorkspace,
		sessionActionError,
		workspaces,
	};
}
