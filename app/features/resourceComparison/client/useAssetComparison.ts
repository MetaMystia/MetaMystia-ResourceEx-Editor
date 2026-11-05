'use client';

import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import {
	collectResourcePackReferenceLocations,
	type IResourcePackReferenceLocation,
} from '@/domain/resourcePack/referenceLocations';

import {
	createComparisonAudioDecoder,
	type IComparisonAudioDecoder,
} from '@/features/resourceComparison/client/audio/decodeComparisonAudio';
import {
	buildAssetComparisonTree,
	collectPotentialAssetMoves,
	flattenAssetComparisonTree,
	type IAssetComparisonNode,
	preserveAssetComparisonSelection,
} from '@/features/resourceComparison/client/files/assetComparisonTree';
import {
	analyzeComparisonFile,
	analyzeComparisonFilePair,
	type IComparisonAnalyzedFile,
	type IComparisonFileInput,
	type IComparisonFilePairAnalysis,
} from '@/features/resourceComparison/client/files/comparisonFileAnalysis';
import {
	createComparisonHashQueue,
	type IComparisonHashQueue,
} from '@/features/resourceComparison/client/files/comparisonHashQueue';
import {
	createComparisonObjectUrlRegistry,
	type IComparisonObjectUrlRegistry,
} from '@/features/resourceComparison/client/files/comparisonObjectUrlRegistry';
import {
	createComparisonSourceKey,
	getComparisonSnapshotId,
} from '@/features/resourceComparison/client/files/comparisonSnapshotIdentity';
import { type IComparisonSnapshot } from '@/features/resourceComparison/domain/contracts';

interface IProps {
	left: IComparisonSnapshot;
	right: IComparisonSnapshot;
}

export interface IAssetComparisonPreviewSource {
	analysisRevision: number;
	audioDecoder: IComparisonAudioDecoder | null;
	getNodeByPath: (path: string) => IAssetComparisonNode | undefined;
	objectUrlRegistry: IComparisonObjectUrlRegistry | null;
	requestPathAnalysis: (path: string) => void;
}

interface IAssetComparisonRuntime {
	analysisBatchTimer: number | null;
	audioDecoder: IComparisonAudioDecoder;
	completedAnalyses: Map<string, IComparisonFilePairAnalysis>;
	completedPaths: Set<string>;
	controller: AbortController;
	hashQueue: IComparisonHashQueue;
	inFlight: Map<string, Promise<void>>;
	key: IAssetComparisonRuntimeKey;
	objectUrlRegistry: IComparisonObjectUrlRegistry;
}

interface IAssetComparisonRuntimeKey {
	sourceKey: string;
}

interface IAnalysisState {
	analyses: ReadonlyMap<string, IComparisonFilePairAnalysis>;
	key: IAssetComparisonRuntimeKey;
	revision: number;
}

const EMPTY_ANALYSES: ReadonlyMap<string, IComparisonFilePairAnalysis> =
	new Map();
const EMPTY_REFERENCES: readonly IResourcePackReferenceLocation[] =
	Object.freeze([]);
const ANALYSIS_UPDATE_BATCH_MS = 100;

function arePathsEqual(left: readonly string[], right: readonly string[]) {
	return (
		left.length === right.length &&
		left.every((path, index) => path === right[index])
	);
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError';
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function createFileInput(
	blob: Blob | undefined,
	path: string,
	snapshotId: string
): IComparisonFileInput | undefined {
	return blob ? { blob, path, snapshotId } : undefined;
}

async function ensureAnalyzedFile(
	current: IComparisonAnalyzedFile | undefined,
	input: IComparisonFileInput | undefined,
	hashQueue: IComparisonHashQueue,
	signal: AbortSignal
): Promise<IComparisonAnalyzedFile | undefined> {
	if (!input || (current && current.hashStatus !== 'not-requested')) {
		return current;
	}
	return analyzeComparisonFile({ ...input, hashQueue, signal });
}

function collectAssetReferences(
	snapshot: IComparisonSnapshot
): ReadonlyMap<string, readonly IResourcePackReferenceLocation[]> {
	const referencesByPath = new Map<
		string,
		IResourcePackReferenceLocation[]
	>();
	for (const reference of collectResourcePackReferenceLocations(
		snapshot.resourcePack
	)) {
		if (
			reference.referencedKind !== 'asset' ||
			typeof reference.referencedValue !== 'string'
		) {
			continue;
		}
		const references =
			referencesByPath.get(reference.referencedValue) ?? [];
		references.push(reference);
		referencesByPath.set(reference.referencedValue, references);
	}
	return referencesByPath;
}

export function useAssetComparison({ left, right }: IProps) {
	const leftSnapshotId = useMemo(() => getComparisonSnapshotId(left), [left]);
	const rightSnapshotId = useMemo(
		() => getComparisonSnapshotId(right),
		[right]
	);
	const sourceKey = useMemo(
		() => createComparisonSourceKey(left, right),
		[left, right]
	);
	const runtimeKey = useMemo<IAssetComparisonRuntimeKey>(
		() => ({ sourceKey }),
		[left.files, left.folders, right.files, right.folders, sourceKey]
	);
	const [analysisState, setAnalysisState] = useState<IAnalysisState>(() => ({
		analyses: EMPTY_ANALYSES,
		key: runtimeKey,
		revision: 0,
	}));
	const analyses =
		analysisState.key === runtimeKey
			? analysisState.analyses
			: EMPTY_ANALYSES;
	const analysisRevision =
		analysisState.key === runtimeKey ? analysisState.revision : 0;
	const tree = useMemo(
		() => buildAssetComparisonTree({ analyses, left, right }),
		[analyses, left, right]
	);
	const treeRef = useRef(tree);
	treeRef.current = tree;
	const sourceTree = useMemo(
		() => buildAssetComparisonTree({ left, right }),
		[left.files, left.folders, right.files, right.folders]
	);
	const defaultExpandedFolders = useMemo(
		() =>
			new Set([
				'',
				...sourceTree.root.children
					.filter((node) => node.kind === 'folder')
					.map((node) => node.path),
			]),
		[sourceTree.root.children]
	);
	const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(
		defaultExpandedFolders
	);
	const [includeUnchanged, setIncludeUnchanged] = useState(false);
	const [query, setQuery] = useState('');
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [selectionRequestVersion, setSelectionRequestVersion] = useState(0);
	const [visibleFilePaths, setVisibleFilePathsState] = useState<
		readonly string[]
	>([]);
	const [pendingPaths, setPendingPaths] = useState<ReadonlySet<string>>(
		new Set()
	);
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const [runtime, setRuntime] = useState<IAssetComparisonRuntime | null>(
		null
	);
	const activeRuntimeRef = useRef<IAssetComparisonRuntime | null>(null);
	const previousVisiblePathsRef = useRef<readonly string[]>([]);

	useEffect(() => {
		const nextRuntime: IAssetComparisonRuntime = {
			analysisBatchTimer: null,
			audioDecoder: createComparisonAudioDecoder(),
			completedAnalyses: new Map(),
			completedPaths: new Set(),
			controller: new AbortController(),
			hashQueue: createComparisonHashQueue(),
			inFlight: new Map(),
			key: runtimeKey,
			objectUrlRegistry: createComparisonObjectUrlRegistry(),
		};
		activeRuntimeRef.current = nextRuntime;
		setRuntime(nextRuntime);
		setAnalysisState({ analyses: new Map(), key: runtimeKey, revision: 0 });
		setPendingPaths(new Set());
		setAnalysisError(null);
		setVisibleFilePathsState([]);
		setExpandedFolders(defaultExpandedFolders);
		previousVisiblePathsRef.current = [];

		return () => {
			if (activeRuntimeRef.current === nextRuntime) {
				activeRuntimeRef.current = null;
			}
			if (nextRuntime.analysisBatchTimer !== null) {
				window.clearTimeout(nextRuntime.analysisBatchTimer);
				nextRuntime.analysisBatchTimer = null;
			}
			nextRuntime.completedAnalyses.clear();
			nextRuntime.completedPaths.clear();
			nextRuntime.controller.abort();
			nextRuntime.hashQueue.dispose();
			nextRuntime.objectUrlRegistry.dispose();
			nextRuntime.inFlight.clear();
			void nextRuntime.audioDecoder.dispose();
		};
	}, [defaultExpandedFolders, runtimeKey]);

	const visibleNodes = useMemo(
		() =>
			flattenAssetComparisonTree(tree, {
				expandedFolders,
				includeUnchanged,
				...(query ? { query } : {}),
			}),
		[expandedFolders, includeUnchanged, query, tree]
	);
	const visiblePaths = useMemo(
		() => visibleNodes.map((node) => node.path),
		[visibleNodes]
	);

	useEffect(() => {
		setSelectedPath((current) =>
			preserveAssetComparisonSelection(
				previousVisiblePathsRef.current,
				visiblePaths,
				current
			)
		);
		previousVisiblePathsRef.current = visiblePaths;
	}, [visiblePaths]);

	const activeRuntime = runtime?.key === runtimeKey ? runtime : null;
	const flushAnalysisBatch = useCallback(
		(runtimeToFlush: IAssetComparisonRuntime) => {
			runtimeToFlush.analysisBatchTimer = null;
			if (runtimeToFlush.controller.signal.aborted) return;
			const completedAnalyses = new Map(runtimeToFlush.completedAnalyses);
			const completedPaths = new Set(runtimeToFlush.completedPaths);
			runtimeToFlush.completedAnalyses.clear();
			runtimeToFlush.completedPaths.clear();
			if (completedAnalyses.size === 0 && completedPaths.size === 0) {
				return;
			}
			startTransition(() => {
				if (completedAnalyses.size > 0) {
					setAnalysisState((current) => {
						if (current.key !== runtimeToFlush.key) return current;
						const next = new Map(current.analyses);
						for (const [path, analysis] of completedAnalyses) {
							next.set(path, analysis);
						}
						return {
							analyses: next,
							key: current.key,
							revision: current.revision + 1,
						};
					});
				}
				if (completedPaths.size > 0) {
					setPendingPaths((current) => {
						if (activeRuntimeRef.current !== runtimeToFlush) {
							return current;
						}
						const next = new Set(current);
						for (const path of completedPaths) next.delete(path);
						return next;
					});
				}
			});
		},
		[]
	);
	const scheduleAnalysisBatch = useCallback(
		(runtimeToFlush: IAssetComparisonRuntime) => {
			if (runtimeToFlush.analysisBatchTimer !== null) return;
			runtimeToFlush.analysisBatchTimer = window.setTimeout(
				() => flushAnalysisBatch(runtimeToFlush),
				ANALYSIS_UPDATE_BATCH_MS
			);
		},
		[flushAnalysisBatch]
	);
	const requestPathAnalysis = useCallback(
		(path: string, shouldHashAll: boolean) => {
			if (!activeRuntime) return;
			const node = tree.nodesByPath.get(path);
			if (!node || node.kind === 'folder') return;
			const currentAnalysis =
				activeRuntime.completedAnalyses.get(path) ?? analyses.get(path);
			const hasFullLeft =
				!node.isLeftPresent ||
				(currentAnalysis?.left?.hashStatus !== undefined &&
					currentAnalysis.left.hashStatus !== 'not-requested');
			const hasFullRight =
				!node.isRightPresent ||
				(currentAnalysis?.right?.hashStatus !== undefined &&
					currentAnalysis.right.hashStatus !== 'not-requested');
			if (
				currentAnalysis &&
				(!shouldHashAll || (hasFullLeft && hasFullRight))
			) {
				return;
			}
			const taskKey = path;
			if (activeRuntime.inFlight.has(taskKey)) return;
			const leftInput = createFileInput(
				node.leftBlob,
				path,
				leftSnapshotId
			);
			const rightInput = createFileInput(
				node.rightBlob,
				path,
				rightSnapshotId
			);
			setPendingPaths((current) => new Set(current).add(path));
			const task = analyzeComparisonFilePair({
				hashQueue: activeRuntime.hashQueue,
				...(leftInput ? { left: leftInput } : {}),
				...(rightInput ? { right: rightInput } : {}),
				signal: activeRuntime.controller.signal,
			})
				.then(async (pairAnalysis) => {
					if (!shouldHashAll) return pairAnalysis;
					const [analyzedLeft, analyzedRight] = await Promise.all([
						ensureAnalyzedFile(
							pairAnalysis.left,
							leftInput,
							activeRuntime.hashQueue,
							activeRuntime.controller.signal
						),
						ensureAnalyzedFile(
							pairAnalysis.right,
							rightInput,
							activeRuntime.hashQueue,
							activeRuntime.controller.signal
						),
					]);
					return {
						...pairAnalysis,
						...(analyzedLeft ? { left: analyzedLeft } : {}),
						...(analyzedRight ? { right: analyzedRight } : {}),
					};
				})
				.then((pairAnalysis) => {
					if (activeRuntime.controller.signal.aborted) return;
					activeRuntime.completedAnalyses.set(path, pairAnalysis);
				})
				.catch((error: unknown) => {
					if (isAbortError(error)) return;
					setAnalysisError(
						`无法分析${path}：${describeError(error)}`
					);
				})
				.finally(() => {
					activeRuntime.inFlight.delete(taskKey);
					if (activeRuntime.controller.signal.aborted) return;
					activeRuntime.completedPaths.add(path);
					scheduleAnalysisBatch(activeRuntime);
				});
			activeRuntime.inFlight.set(taskKey, task);
		},
		[
			activeRuntime,
			analyses,
			leftSnapshotId,
			rightSnapshotId,
			scheduleAnalysisBatch,
			tree.nodesByPath,
		]
	);

	const selectedNode = selectedPath
		? tree.nodesByPath.get(selectedPath)
		: undefined;
	useEffect(() => {
		for (const path of visibleFilePaths) {
			const node = tree.nodesByPath.get(path);
			if (
				node &&
				node.kind !== 'folder' &&
				(node.status === 'added' ||
					node.status === 'removed' ||
					node.status === 'unknown')
			) {
				requestPathAnalysis(path, false);
			}
		}
		if (selectedNode && selectedNode.kind !== 'folder') {
			requestPathAnalysis(selectedNode.path, true);
		}
	}, [requestPathAnalysis, selectedNode, tree.nodesByPath, visibleFilePaths]);

	const setVisibleFilePaths = useCallback((paths: readonly string[]) => {
		const next = Array.from(new Set(paths)).sort((leftPath, rightPath) =>
			leftPath.localeCompare(rightPath, 'zh-CN')
		);
		setVisibleFilePathsState((current) =>
			arePathsEqual(current, next) ? current : next
		);
	}, []);
	const toggleFolder = useCallback((path: string) => {
		setExpandedFolders((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);
	const selectPath = useCallback((path: string) => {
		setSelectedPath(path);
		setSelectionRequestVersion((current) => current + 1);
	}, []);
	const revealPath = useCallback((path: string) => {
		setExpandedFolders((current) => {
			const next = new Set(current);
			let separatorIndex = path.lastIndexOf('/');
			while (separatorIndex >= 0) {
				next.add(path.slice(0, separatorIndex + 1));
				separatorIndex = path.lastIndexOf('/', separatorIndex - 1);
			}
			return next;
		});
		setSelectedPath(path);
		setSelectionRequestVersion((current) => current + 1);
	}, []);
	const selectRelativeNode = useCallback(
		(offset: -1 | 1) => {
			if (visibleNodes.length === 0) return;
			const currentIndex = selectedPath
				? visibleNodes.findIndex((node) => node.path === selectedPath)
				: -1;
			const nextIndex = Math.min(
				Math.max(currentIndex + offset, 0),
				visibleNodes.length - 1
			);
			setSelectedPath(visibleNodes[nextIndex]?.path ?? null);
			setSelectionRequestVersion((current) => current + 1);
		},
		[selectedPath, visibleNodes]
	);

	const selectedIndex = selectedPath
		? visibleNodes.findIndex((node) => node.path === selectedPath)
		: -1;
	const leftReferencesByPath = useMemo(
		() => collectAssetReferences(left),
		[left]
	);
	const rightReferencesByPath = useMemo(
		() => collectAssetReferences(right),
		[right]
	);
	const leftReferences = useMemo(
		() =>
			selectedPath
				? (leftReferencesByPath.get(selectedPath) ?? EMPTY_REFERENCES)
				: EMPTY_REFERENCES,
		[leftReferencesByPath, selectedPath]
	);
	const rightReferences = useMemo(
		() =>
			selectedPath
				? (rightReferencesByPath.get(selectedPath) ?? EMPTY_REFERENCES)
				: EMPTY_REFERENCES,
		[rightReferencesByPath, selectedPath]
	);
	const potentialMoves = useMemo(
		() => collectPotentialAssetMoves(tree),
		[tree]
	);
	const getPreviewNodeByPath = useCallback(
		(path: string) => treeRef.current.nodesByPath.get(path),
		[]
	);
	const requestPreviewPathAnalysis = useCallback(
		(path: string) => requestPathAnalysis(path, true),
		[requestPathAnalysis]
	);
	const previewSource = useMemo<IAssetComparisonPreviewSource>(
		() => ({
			analysisRevision,
			audioDecoder: activeRuntime?.audioDecoder ?? null,
			getNodeByPath: getPreviewNodeByPath,
			objectUrlRegistry: activeRuntime?.objectUrlRegistry ?? null,
			requestPathAnalysis: requestPreviewPathAnalysis,
		}),
		[
			activeRuntime,
			analysisRevision,
			getPreviewNodeByPath,
			requestPreviewPathAnalysis,
		]
	);

	return useMemo(
		() => ({
			analysisCount: analyses.size,
			analysisError,
			audioDecoder: activeRuntime?.audioDecoder ?? null,
			expandedFolders,
			includeUnchanged,
			isAnalyzing: pendingPaths.size > 0,
			leftReferences,
			objectUrlRegistry: activeRuntime?.objectUrlRegistry ?? null,
			pendingPaths,
			potentialMoves,
			previewSource,
			query,
			revealPath,
			rightReferences,
			selectedIndex,
			selectedNode,
			selectionRequestVersion,
			selectPath,
			selectRelativeNode,
			setIncludeUnchanged,
			setQuery,
			setVisibleFilePaths,
			toggleFolder,
			tree,
			visibleNodes,
		}),
		[
			activeRuntime,
			analyses.size,
			analysisError,
			expandedFolders,
			includeUnchanged,
			leftReferences,
			pendingPaths,
			potentialMoves,
			previewSource,
			query,
			revealPath,
			rightReferences,
			selectedIndex,
			selectedNode,
			selectionRequestVersion,
			selectPath,
			selectRelativeNode,
			setVisibleFilePaths,
			toggleFolder,
			tree,
			visibleNodes,
		]
	);
}
