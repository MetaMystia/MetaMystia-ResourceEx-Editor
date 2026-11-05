'use client';

import { cn } from '@heroui/theme';
import { ReactFlowProvider } from '@xyflow/react';
import { type Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import type { EventNode } from '@/domain/resourcePack/contracts/event';
import type { MissionNode } from '@/domain/resourcePack/contracts/mission';
import { RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND } from '@/domain/resourcePack/editorNavigation';
import {
	buildSchedulerGraph,
	createSchedulerGraphNodeId,
	type TSchedulerGraphNodeKind,
} from '@/domain/resourcePack/schedulerGraph';

import { Select } from '@/features/resourceEditor/client/components/select/Select';
import {
	appendEventNode,
	removeEventNodeAt,
	updateEventNodeAt,
} from '@/features/resourceEditor/client/editors/event/eventNodeEdits';
import {
	appendMissionNode,
	removeMissionNodeAt,
	updateMissionNodeAt,
} from '@/features/resourceEditor/client/editors/mission/missionNodeEdits';
import { useViewportFillHeight } from '@/features/resourceEditor/client/hooks/useViewportFillHeight';
import { createEditorNavigationUrl } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import {
	type INodeGraphCanvasHandle,
	NODE_GRAPH_FLOATING_SURFACE_CLASS_NAME,
	NodeGraphCanvas,
} from './NodeGraphCanvas';
import {
	applyNodeGraphConnection,
	createNodeGraphConnectedNode,
	type INodeGraphConnectionRequest,
	isNodeGraphEdgeRemovable,
	planNodeGraphConnection,
	removeNodeGraphEdge,
} from './nodeGraphConnections';
import {
	collectNodeGraphChain,
	createNodeGraphFlowModel,
} from './nodeGraphFlowModel';
import {
	NodeGraphInspector,
	type TNodeGraphListTarget,
} from './NodeGraphInspector';
import {
	computeNodeGraphLayout,
	type INodeGraphPoint,
	readNodeGraphPositions,
	resolveNodeGraphPositions,
	writeNodeGraphPositions,
} from './nodeGraphLayout';

type TNodeGraphSelection =
	| { edgeId: string }
	| { id: string }
	| { index: number; kind: TSchedulerGraphNodeKind };

const DIMMED_NODE_CLASS_NAME = 'opacity-30';
const DIMMED_EDGE_OPACITY = 0.15;
/** 新建节点时让入口（对齐标题行）落在松手的位置。 */
const NEW_NODE_INPUT_OFFSET_PX = 41;

interface IWorkspaceNodeGraphProps {
	workspaceId: string;
}

function WorkspaceNodeGraph({ workspaceId }: IWorkspaceNodeGraphProps) {
	const router = useRouter();
	const { resourcePack, updateResourcePack } = useResourceEditor();
	const canvasRef = useRef<INodeGraphCanvasHandle>(null);
	const shouldFocusSelectionRef = useRef(false);
	const [selection, setSelection] = useState<TNodeGraphSelection | null>(
		null
	);
	const [storedPositions, setStoredPositions] = useState<
		ReadonlyMap<string, INodeGraphPoint>
	>(() => readNodeGraphPositions(workspaceId));

	const graph = useMemo(
		() => buildSchedulerGraph(resourcePack),
		[resourcePack]
	);
	const flowModel = useMemo(
		() => createNodeGraphFlowModel(resourcePack, graph),
		[graph, resourcePack]
	);
	const autoPositions = useMemo(
		() =>
			computeNodeGraphLayout({
				edges: flowModel.edges,
				nodeSizes: flowModel.sizes,
			}),
		[flowModel]
	);
	const positions = useMemo(
		() =>
			resolveNodeGraphPositions({
				autoPositions,
				edges: flowModel.edges,
				nodeSizes: flowModel.sizes,
				storedPositions,
			}),
		[autoPositions, flowModel, storedPositions]
	);

	const selectedNode = useMemo(() => {
		if (!selection) return null;
		if ('kind' in selection) {
			return (
				graph.nodes.find(
					(node) =>
						node.origin === 'local' &&
						node.kind === selection.kind &&
						node.index === selection.index
				) ?? null
			);
		}
		if ('id' in selection) {
			return graph.nodes.find((node) => node.id === selection.id) ?? null;
		}
		return null;
	}, [graph, selection]);
	const selectedEntry = useMemo(
		() =>
			selection && 'id' in selection
				? (graph.entries.find((entry) => entry.id === selection.id) ??
					null)
				: null,
		[graph, selection]
	);
	const selectedEdge = useMemo(
		() =>
			selection && 'edgeId' in selection
				? (graph.edges.find((edge) => edge.id === selection.edgeId) ??
					null)
				: null,
		[graph, selection]
	);
	const selectedId = selectedNode?.id ?? selectedEntry?.id ?? null;

	// 新建的节点要等下一次渲染才有 ID，选中后再移动视图。
	useEffect(() => {
		if (!shouldFocusSelectionRef.current || selectedId === null) return;
		shouldFocusSelectionRef.current = false;
		canvasRef.current?.focusNode(selectedId);
	}, [selectedId]);

	const chain = useMemo(() => {
		if (selectedEdge) {
			return {
				edgeIds: new Set([selectedEdge.id]),
				nodeIds: new Set([selectedEdge.source, selectedEdge.target]),
			};
		}
		return selectedId === null
			? null
			: collectNodeGraphChain(flowModel.edges, selectedId);
	}, [flowModel, selectedEdge, selectedId]);
	const nodes = useMemo(
		() =>
			flowModel.nodes.map((node) => ({
				...node,
				...(chain && !chain.nodeIds.has(node.id)
					? { className: DIMMED_NODE_CLASS_NAME }
					: {}),
				position: positions.get(node.id) ?? node.position,
				selected: node.id === selectedId,
			})),
		[chain, flowModel, positions, selectedId]
	);
	const edges = useMemo(
		() =>
			flowModel.edges.map((edge) => {
				const isSelected = edge.id === selectedEdge?.id;
				const isDimmed = chain !== null && !chain.edgeIds.has(edge.id);
				if (!isSelected && !isDimmed) return edge;
				return {
					...edge,
					...(edge.data
						? { data: { ...edge.data, isSelected } }
						: {}),
					...(isDimmed
						? {
								style: {
									...edge.style,
									opacity: DIMMED_EDGE_OPACITY,
								},
							}
						: {}),
				};
			}),
		[chain, flowModel, selectedEdge]
	);

	const handleSelect = useCallback(
		(id: string | null) => {
			if (id === null) {
				setSelection(null);
				return;
			}
			const node = graph.nodes.find((candidate) => candidate.id === id);
			setSelection(
				node?.origin === 'local' && node.index !== undefined
					? { index: node.index, kind: node.kind }
					: { id }
			);
		},
		[graph]
	);
	const handleEdgeSelect = useCallback(
		(edgeId: string) => setSelection({ edgeId }),
		[]
	);
	const handleSelectAndFocus = useCallback(
		(id: string) => {
			handleSelect(id);
			canvasRef.current?.focusNode(id);
		},
		[handleSelect]
	);

	const replaceStoredPositions = useCallback(
		(next: ReadonlyMap<string, INodeGraphPoint>) => {
			setStoredPositions(next);
			writeNodeGraphPositions(workspaceId, next);
		},
		[workspaceId]
	);
	// 第一次手动移动时把当前所有位置固定下来，之后新节点不会打乱已经摆好的布局。
	const handlePositionsCommit = useCallback(
		(changedPositions: ReadonlyMap<string, INodeGraphPoint>) => {
			const next = new Map(
				storedPositions.size > 0 ? storedPositions : positions
			);
			changedPositions.forEach((point, id) => next.set(id, point));
			[...next.keys()].forEach((id) => {
				if (!flowModel.sizes.has(id)) next.delete(id);
			});
			replaceStoredPositions(next);
		},
		[flowModel, positions, replaceStoredPositions, storedPositions]
	);
	const pinPosition = useCallback(
		(id: string, point: INodeGraphPoint) => {
			const next = new Map(
				storedPositions.size > 0 ? storedPositions : positions
			);
			next.set(id, point);
			replaceStoredPositions(next);
		},
		[positions, replaceStoredPositions, storedPositions]
	);
	const handleAutoLayout = useCallback(
		() => replaceStoredPositions(new Map()),
		[replaceStoredPositions]
	);

	/** 改标签会改变节点 ID，同步搬走手动位置。 */
	const moveStoredPosition = useCallback(
		(kind: TSchedulerGraphNodeKind, index: number, nextLabel: string) => {
			const previousId = graph.nodes.find(
				(node) =>
					node.origin === 'local' &&
					node.kind === kind &&
					node.index === index
			)?.id;
			const point =
				previousId === undefined
					? undefined
					: storedPositions.get(previousId);
			if (previousId === undefined || !point || !nextLabel) return;
			const next = new Map(storedPositions);
			next.delete(previousId);
			next.set(createSchedulerGraphNodeId(kind, nextLabel), point);
			replaceStoredPositions(next);
		},
		[graph, replaceStoredPositions, storedPositions]
	);

	const handleUpdateMission = useCallback(
		(index: number, updates: Partial<MissionNode>) => {
			updateResourcePack((current) =>
				updateMissionNodeAt(current, index, updates)
			);
			if (updates.label !== undefined) {
				moveStoredPosition('mission', index, updates.label);
			}
		},
		[moveStoredPosition, updateResourcePack]
	);
	const handleUpdateEvent = useCallback(
		(index: number, updates: Partial<EventNode>) => {
			updateResourcePack((current) =>
				updateEventNodeAt(current, index, updates)
			);
			if (updates.label !== undefined) {
				moveStoredPosition('event', index, updates.label);
			}
		},
		[moveStoredPosition, updateResourcePack]
	);
	const handleRemoveMission = useCallback(
		(index: number) => {
			updateResourcePack((current) =>
				removeMissionNodeAt(current, index)
			);
			setSelection(null);
		},
		[updateResourcePack]
	);
	const handleRemoveEvent = useCallback(
		(index: number) => {
			updateResourcePack((current) => removeEventNodeAt(current, index));
			setSelection(null);
		},
		[updateResourcePack]
	);

	const missionCount = resourcePack.missionNodes.length;
	const eventCount = resourcePack.eventNodes.length;
	const handleAddMission = useCallback(() => {
		updateResourcePack(appendMissionNode);
		shouldFocusSelectionRef.current = true;
		setSelection({ index: missionCount, kind: 'mission' });
	}, [missionCount, updateResourcePack]);
	const handleAddEvent = useCallback(() => {
		updateResourcePack(appendEventNode);
		shouldFocusSelectionRef.current = true;
		setSelection({ index: eventCount, kind: 'event' });
	}, [eventCount, updateResourcePack]);

	const isValidConnection = useCallback(
		(request: INodeGraphConnectionRequest) =>
			planNodeGraphConnection(resourcePack, graph, request) !== null,
		[graph, resourcePack]
	);
	const handleConnect = useCallback(
		(request: INodeGraphConnectionRequest) => {
			const plan = planNodeGraphConnection(resourcePack, graph, request);
			if (!plan) return;
			updateResourcePack((current) =>
				applyNodeGraphConnection(current, plan)
			);
		},
		[graph, resourcePack, updateResourcePack]
	);
	const handleConnectToEmpty = useCallback(
		(
			sourceId: string,
			sourceHandleId: string | null,
			position: INodeGraphPoint
		) => {
			const created = createNodeGraphConnectedNode(
				resourcePack,
				graph,
				sourceId,
				sourceHandleId
			);
			if (!created) return;
			updateResourcePack(() => created.resourcePack);
			pinPosition(
				createSchedulerGraphNodeId(created.kind, created.label),
				{
					x: Math.round(position.x),
					y: Math.round(position.y - NEW_NODE_INPUT_OFFSET_PX),
				}
			);
			setSelection({ index: created.index, kind: created.kind });
		},
		[graph, pinPosition, resourcePack, updateResourcePack]
	);
	const handleEdgeRemove = useCallback(
		(edgeId: string) => {
			const edge = graph.edges.find(
				(candidate) => candidate.id === edgeId
			);
			if (!edge || !isNodeGraphEdgeRemovable(edge)) return;
			updateResourcePack(
				(current) =>
					removeNodeGraphEdge(current, graph, edge) ?? current
			);
			setSelection(null);
		},
		[graph, updateResourcePack]
	);

	const handleOpenInList = useCallback(
		({ entityKind, stableKey }: TNodeGraphListTarget) => {
			const url = new URL(
				createEditorNavigationUrl(window.location.href, {
					target: {
						entityKind,
						route: RESOURCE_EDITOR_ROUTE_BY_ENTITY_KIND[entityKind],
						stableKey,
					},
					workspaceId,
				})
			);
			// 路由取自编辑器路由表，查询参数只携带定位信息。
			router.push(`${url.pathname}${url.search}` as Route);
		},
		[router, workspaceId]
	);

	const searchItems = useMemo(() => {
		const titleById = new Map(
			flowModel.nodes.map((node) => [
				node.id,
				node.type === 'entry'
					? node.data.characterName || node.data.characterLabel
					: node.type === 'external'
						? node.data.label
						: node.data.title,
			])
		);
		const createOptions = (
			predicate: (node: (typeof graph.nodes)[number]) => boolean
		) =>
			graph.nodes
				.filter(predicate)
				.map((node) => ({
					description: node.label || '（无标签）',
					label: titleById.get(node.id) ?? node.label,
					textValue: titleById.get(node.id) || node.label,
					value: node.id,
				}));
		return [
			{
				options: createOptions(
					(node) => node.origin === 'local' && node.kind === 'mission'
				),
				section: '任务',
			},
			{
				options: createOptions(
					(node) => node.origin === 'local' && node.kind === 'event'
				),
				section: '事件',
			},
			{
				options: graph.entries.map((entry) => ({
					description: entry.characterLabel,
					label: entry.characterName || entry.characterLabel,
					textValue: entry.characterName || entry.characterLabel,
					value: entry.id,
				})),
				section: '羁绊入口',
			},
			{
				options: createOptions((node) => node.origin !== 'local'),
				section: '外部与缺失',
			},
		].filter(({ options }) => options.length > 0);
	}, [flowModel, graph]);

	const toolbar = (
		<div
			className={cn(
				NODE_GRAPH_FLOATING_SURFACE_CLASS_NAME,
				'flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1.5 p-1.5'
			)}
		>
			<Button
				size="sm"
				variant="flat"
				color="primary"
				onPress={handleAddMission}
			>
				新建任务
			</Button>
			<Button
				size="sm"
				variant="flat"
				color="warning"
				onPress={handleAddEvent}
			>
				新建事件
			</Button>
			{searchItems.length > 0 && (
				<Select<string>
					ariaLabel="定位节点"
					baseClassName="w-56 min-w-0 max-w-full"
					items={searchItems}
					menuMaxHeight={360}
					placeholder="定位节点…"
					size="sm"
					value={selectedId ?? undefined}
					onChange={handleSelectAndFocus}
				/>
			)}
		</div>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
			<section
				aria-label="节点图画布"
				className="relative h-[64dvh] min-h-[360px] min-w-0 overflow-hidden rounded-large border border-divider bg-default-100/85 shadow-sm lg:h-auto lg:min-h-0 lg:flex-1 dark:bg-default-50/85"
			>
				<ReactFlowProvider>
					<NodeGraphCanvas
						ref={canvasRef}
						edges={edges}
						nodes={nodes}
						isValidConnection={isValidConnection}
						overlay={toolbar}
						onAutoLayout={handleAutoLayout}
						onConnect={handleConnect}
						onConnectToEmpty={handleConnectToEmpty}
						onEdgeRemove={handleEdgeRemove}
						onEdgeSelect={handleEdgeSelect}
						onPositionsCommit={handlePositionsCommit}
						onSelect={handleSelect}
					/>
				</ReactFlowProvider>
				{flowModel.nodes.length === 0 && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
						<p
							className={cn(
								TYPOGRAPHY_STYLES.subtleDescription,
								'max-w-sm text-center'
							)}
						>
							还没有任务节点或事件节点。用左上角的按钮新建，或在角色的羁绊设置里指定前置事件。
						</p>
					</div>
				)}
			</section>
			<aside
				aria-label="节点属性"
				className="flex w-full min-w-0 shrink-0 flex-col gap-3 lg:w-[400px] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:[scrollbar-gutter:stable] xl:w-[440px] [&>*]:shrink-0"
			>
				<NodeGraphInspector
					graph={graph}
					resourcePack={resourcePack}
					selectedEdge={selectedEdge}
					selectedEntry={selectedEntry}
					selectedNode={selectedNode}
					onOpenInList={handleOpenInList}
					onRemoveEdge={handleEdgeRemove}
					onRemoveEvent={handleRemoveEvent}
					onRemoveMission={handleRemoveMission}
					onSelect={handleSelectAndFocus}
					onUpdateEvent={handleUpdateEvent}
					onUpdateMission={handleUpdateMission}
				/>
			</aside>
		</div>
	);
}

export function NodeGraphScreen() {
	const { activeWorkspaceId } = useResourceEditor();
	const containerRef = useRef<HTMLDivElement>(null);
	useViewportFillHeight(containerRef, 560);

	return (
		<div
			ref={containerRef}
			className="flex flex-col gap-3 px-2 py-3 sm:px-4"
		>
			{activeWorkspaceId && (
				<WorkspaceNodeGraph
					key={activeWorkspaceId}
					workspaceId={activeWorkspaceId}
				/>
			)}
		</div>
	);
}
