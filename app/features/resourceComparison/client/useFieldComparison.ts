'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { collectResourcePackReferenceLocations } from '@/domain/resourcePack/referenceLocations';

import {
	applyComparisonFieldValue,
	removeComparisonFieldValue,
} from '@/features/resourceComparison/domain/applyComparisonCommand';
import { attachComparisonIssues } from '@/features/resourceComparison/domain/attachComparisonIssues';
import {
	type IComparisonNode,
	type IComparisonSnapshot,
	type TComparisonDifferenceStatus,
} from '@/features/resourceComparison/domain/contracts';
import {
	compareComparisonContents,
	preserveComparisonSelection,
	queryComparisonFieldNodes,
} from '@/features/resourceComparison/domain/fieldComparison';
import { type TResourceEditorMutationSnapshot } from '@/features/resourceEditor/client/state/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';
import { validateResourcePackForExport } from '@/features/resourceEditor/client/validation/validateResourcePackForExport';

export interface IResolvedComparisonDifference {
	id: string;
	label: string;
	status: TComparisonDifferenceStatus;
}

interface IComparisonUndoState {
	before: TResourceEditorMutationSnapshot;
	expectedRevision: number;
	nodeId: string;
}

interface IValidationState {
	issues: Awaited<ReturnType<typeof validateResourcePackForExport>>;
	revision: number | null;
}

interface IUseFieldComparisonInput {
	isEditable: boolean;
	left: IComparisonSnapshot;
	right: IComparisonSnapshot;
}

function cloneMutationSnapshot(
	snapshot: TResourceEditorMutationSnapshot
): TResourceEditorMutationSnapshot {
	return {
		editorState: structuredClone(snapshot.editorState),
		files: new Map(snapshot.files),
		folders: [...snapshot.folders],
		hasLicenseFile: snapshot.hasLicenseFile,
		license: snapshot.license,
		resourcePack: structuredClone(snapshot.resourcePack),
	};
}

function areFieldValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) && Array.isArray(right)) {
		return (
			left.length === right.length &&
			left.every((value, index) => Object.is(value, right[index]))
		);
	}
	return false;
}

export function useFieldComparison({
	isEditable,
	left,
	right,
}: IUseFieldComparisonInput) {
	const { applyWorkspaceMutation, revision } = useResourceEditor();
	const [actionError, setActionError] = useState<string | null>(null);
	const [hasIssuesOnly, setHasIssuesOnly] = useState(false);
	const [includeUnchanged, setIncludeUnchanged] = useState(false);
	const [query, setQuery] = useState('');
	const [resolvedDifferences, setResolvedDifferences] = useState<
		readonly IResolvedComparisonDifference[]
	>([]);
	const [resourceType, setResourceType] = useState<string>('all');
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectionRequestNodeId, setSelectionRequestNodeId] = useState<
		string | null
	>(null);
	const [selectionRequestVersion, setSelectionRequestVersion] = useState(0);
	const [statuses, setStatuses] = useState<
		readonly TComparisonDifferenceStatus[]
	>(['added', 'ambiguous', 'modified', 'removed']);
	const [undoState, setUndoState] = useState<IComparisonUndoState | null>(
		null
	);
	const [validationState, setValidationState] = useState<IValidationState>({
		issues: [],
		revision: null,
	});
	const previousSelectedIndexRef = useRef(0);

	useEffect(() => {
		let isCancelled = false;
		void validateResourcePackForExport(
			right.resourcePack,
			right.files.keys()
		).then((issues) => {
			if (isCancelled) return;
			setValidationState({ issues, revision: right.revision });
		});
		return () => {
			isCancelled = true;
		};
	}, [right.files, right.resourcePack, right.revision]);

	useEffect(() => {
		if (undoState && revision !== undoState.expectedRevision) {
			setUndoState(null);
		}
	}, [revision, undoState]);

	const comparison = useMemo(() => {
		const base = compareComparisonContents(left, right, {
			includeUnchanged,
		});
		return attachComparisonIssues(
			base,
			validationState.revision === right.revision
				? validationState.issues
				: [],
			collectResourcePackReferenceLocations(right.resourcePack),
			{ includeUnchanged }
		);
	}, [includeUnchanged, left, right, validationState]);

	const visibleNodes = useMemo(
		() =>
			queryComparisonFieldNodes(comparison, {
				hasIssuesOnly,
				query,
				...(resourceType === 'all'
					? {}
					: { resourceTypes: new Set([resourceType]) }),
				statuses: new Set(statuses),
			}),
		[comparison, hasIssuesOnly, query, resourceType, statuses]
	);

	useEffect(() => {
		setSelectedNodeId((currentNodeId) =>
			preserveComparisonSelection(
				currentNodeId,
				previousSelectedIndexRef.current,
				visibleNodes
			)
		);
	}, [visibleNodes]);

	const selectedIndex = visibleNodes.findIndex(
		({ id }) => id === selectedNodeId
	);
	const selectedNode =
		selectedIndex >= 0 ? visibleNodes[selectedIndex] : undefined;

	const activateNode = useCallback(
		(nodeId: string) => {
			const nextIndex = visibleNodes.findIndex(({ id }) => id === nodeId);
			if (nextIndex < 0) return false;
			previousSelectedIndexRef.current = nextIndex;
			setSelectedNodeId(nodeId);
			return true;
		},
		[visibleNodes]
	);

	const selectNode = useCallback(
		(nodeId: string) => {
			if (!activateNode(nodeId)) return;
			setSelectionRequestNodeId(nodeId);
			setSelectionRequestVersion((current) => current + 1);
		},
		[activateNode]
	);

	const selectRelativeNode = useCallback(
		(offset: -1 | 1) => {
			if (visibleNodes.length === 0) return;
			const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
			const nextIndex = Math.min(
				Math.max(currentIndex + offset, 0),
				visibleNodes.length - 1
			);
			const nextNodeId = visibleNodes[nextIndex]?.id;
			if (!nextNodeId) return;
			previousSelectedIndexRef.current = nextIndex;
			setSelectedNodeId(nextNodeId);
			setSelectionRequestNodeId(nextNodeId);
			setSelectionRequestVersion((current) => current + 1);
		},
		[selectedIndex, visibleNodes]
	);

	const mutateNodeValue = useCallback(
		(node: IComparisonNode, value: unknown, isRemoval: boolean) => {
			setActionError(null);
			if (!isEditable || right.revision === null) {
				setActionError('当前对比页没有新版编辑权。');
				return false;
			}
			if (
				isRemoval
					? !node.rightValue.isPresent
					: node.rightValue.isPresent &&
						areFieldValuesEqual(node.rightValue.value, value)
			) {
				return true;
			}

			let nextResourcePack = right.resourcePack;
			if (node.kind !== 'license') {
				const preflight = isRemoval
					? removeComparisonFieldValue(
							right.resourcePack,
							node.fieldPath
						)
					: applyComparisonFieldValue(
							right.resourcePack,
							node.fieldPath,
							value
						);
				if (preflight.error) {
					setActionError(preflight.error);
					return false;
				}
				nextResourcePack = preflight.resourcePack;
			}

			let before: TResourceEditorMutationSnapshot | null = null;
			const result = applyWorkspaceMutation({
				expectedRevision: right.revision,
				mutate(current) {
					before = cloneMutationSnapshot(current);
					return node.kind === 'license'
						? {
								...current,
								hasLicenseFile: String(value ?? '').length > 0,
								license: String(value ?? ''),
							}
						: { ...current, resourcePack: nextResourcePack };
				},
			});
			if (!result.isSuccess || result.revision === undefined || !before) {
				setActionError(result.error ?? '无法保存字段修改。');
				return false;
			}
			setResolvedDifferences((current) =>
				(
					isRemoval
						? !node.leftValue.isPresent
						: node.leftValue.isPresent &&
							areFieldValuesEqual(node.leftValue.value, value)
				)
					? [
							{
								id: node.id,
								label: node.label,
								status: node.status,
							},
							...current.filter(({ id }) => id !== node.id),
						]
					: current.filter(({ id }) => id !== node.id)
			);
			setUndoState({
				before,
				expectedRevision: result.revision,
				nodeId: node.id,
			});
			return true;
		},
		[applyWorkspaceMutation, isEditable, right]
	);

	const commitNodeValue = useCallback(
		(node: IComparisonNode, value: unknown) =>
			mutateNodeValue(node, value, false),
		[mutateNodeValue]
	);

	const removeNodeValue = useCallback(
		(node: IComparisonNode) => mutateNodeValue(node, undefined, true),
		[mutateNodeValue]
	);

	const adoptOldValue = useCallback(
		(node: IComparisonNode) => {
			if (!node.leftValue.isPresent) {
				setActionError('旧版没有可采用的值。');
				return false;
			}
			return commitNodeValue(node, node.leftValue.value);
		},
		[commitNodeValue]
	);

	const undoLastChange = useCallback(() => {
		setActionError(null);
		if (!undoState) return false;
		const result = applyWorkspaceMutation({
			expectedRevision: undoState.expectedRevision,
			mutate: () => cloneMutationSnapshot(undoState.before),
		});
		if (!result.isSuccess) {
			setActionError(result.error ?? '新版已发生其他修改，无法撤销。');
			setUndoState(null);
			return false;
		}
		setResolvedDifferences((current) =>
			current.filter(({ id }) => id !== undoState.nodeId)
		);
		setUndoState(null);
		return true;
	}, [applyWorkspaceMutation, undoState]);

	const toggleStatus = useCallback((status: TComparisonDifferenceStatus) => {
		setStatuses((current) =>
			current.includes(status)
				? current.filter((value) => value !== status)
				: [...current, status]
		);
	}, []);

	return {
		actionError,
		activateNode,
		adoptOldValue,
		commitNodeValue,
		comparison,
		hasIssuesOnly,
		includeUnchanged,
		isEditable,
		isUndoAvailable: undoState !== null,
		isValidating: validationState.revision !== right.revision,
		query,
		removeNodeValue,
		resolvedDifferences,
		resourceType,
		selectedIndex,
		selectedNode,
		selectionRequestNodeId,
		selectionRequestVersion,
		selectNode,
		selectRelativeNode,
		setHasIssuesOnly,
		setIncludeUnchanged,
		setQuery,
		setResourceType,
		statuses,
		toggleStatus,
		undoLastChange,
		visibleNodes,
	};
}
