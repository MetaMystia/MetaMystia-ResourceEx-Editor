'use client';

import { cn } from '@heroui/theme';
import {
	applyNodeChanges,
	Background,
	BackgroundVariant,
	type Connection,
	type Edge,
	MiniMap,
	type NodeChange,
	type OnConnectEnd,
	Panel,
	ReactFlow,
	useNodesInitialized,
	useReactFlow,
	useStore,
} from '@xyflow/react';
import {
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';

import { THEME_VARIANT_CLASS_NAME } from '@/design/theme/runtime/constants';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { type INodeGraphConnectionRequest } from './nodeGraphConnections';
import {
	NODE_GRAPH_EDGE_TYPES,
	NodeGraphEdgeActionsContext,
} from './NodeGraphEdge';
import { type TNodeGraphFlowEdge } from './nodeGraphFlowModel';
import { type INodeGraphPoint } from './nodeGraphLayout';
import {
	NODE_GRAPH_INPUT_HANDLE_ID,
	NODE_GRAPH_NODE_TYPES,
	type TNodeGraphFlowNode,
} from './NodeGraphNodes';
import { useDocumentColorScheme } from './useDocumentColorScheme';

import '@xyflow/react/dist/style.css';
import './nodeGraph.scss';

export interface INodeGraphCanvasHandle {
	focusNode(id: string): void;
}

interface IProps {
	edges: TNodeGraphFlowEdge[];
	nodes: TNodeGraphFlowNode[];
	isValidConnection(request: INodeGraphConnectionRequest): boolean;
	onAutoLayout(): void;
	onConnect(request: INodeGraphConnectionRequest): void;
	onConnectToEmpty(
		sourceId: string,
		sourceHandleId: string | null,
		position: INodeGraphPoint
	): void;
	onEdgeRemove(edgeId: string): void;
	onEdgeSelect(edgeId: string): void;
	onPositionsCommit(positions: ReadonlyMap<string, INodeGraphPoint>): void;
	onSelect(id: string | null): void;
	overlay?: ReactNode;
	ref?: Ref<INodeGraphCanvasHandle>;
}

/** 只吸附很近的端点；落在卡片上时按光标下的卡片连接，避免缩小后吸到相邻卡片。 */
const CONNECTION_RADIUS_PX = 10;
const CONNECTION_LINE_STYLE = {
	stroke: 'hsl(var(--heroui-focus))',
	strokeWidth: 2,
} as const;

function createConnectionRequest(
	connection: Connection | Edge
): INodeGraphConnectionRequest {
	return {
		sourceHandleId: connection.sourceHandle ?? null,
		sourceId: connection.source,
		targetHandleId: connection.targetHandle ?? null,
		targetId: connection.target,
	};
}

const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.12 } as const;
/** 节点多到整体缩放后看不清时，概览改为从左上角按这个缩放显示。 */
const OVERVIEW_READABLE_ZOOM = 0.8;
const OVERVIEW_PADDING_PX = 48;
const VIEW_TRANSITION_MS = 240;
const FOCUS_MIN_ZOOM = 0.8;
const FOCUS_MAX_WAIT_FRAMES = 30;

const MINIMAP_NODE_COLORS = {
	entry: 'hsl(var(--heroui-success) / 0.7)',
	event: 'hsl(var(--heroui-warning) / 0.7)',
	external: 'hsl(var(--heroui-default-400) / 0.7)',
	mission: 'hsl(var(--heroui-focus) / 0.7)',
} as const satisfies Record<NonNullable<TNodeGraphFlowNode['type']>, string>;

/** 浮在画布上的工具条底板。 */
export const NODE_GRAPH_FLOATING_SURFACE_CLASS_NAME =
	'select-none rounded-large border border-divider bg-content1/85 shadow-md backdrop-blur-lg dark:bg-content1/75';

function getMiniMapNodeColor(node: TNodeGraphFlowNode) {
	return node.type ? MINIMAP_NODE_COLORS[node.type] : 'transparent';
}

/** 显示全部节点；节点太多时改为从流程起点（左上角）开始的可读缩放。 */
function useShowOverview() {
	const { fitView, getNodes, getNodesBounds, setViewport } =
		useReactFlow<TNodeGraphFlowNode>();
	const paneWidth = useStore((state) => state.width);
	const paneHeight = useStore((state) => state.height);
	const isReducedMotion = useReducedMotion();
	return useCallback(() => {
		const duration = isReducedMotion ? 0 : VIEW_TRANSITION_MS;
		const bounds = getNodesBounds(getNodes());
		if (bounds.width <= 0 || bounds.height <= 0 || paneWidth <= 0) return;
		const fitZoom = Math.min(
			(paneWidth - OVERVIEW_PADDING_PX * 2) / bounds.width,
			(paneHeight - OVERVIEW_PADDING_PX * 2) / bounds.height
		);
		if (fitZoom >= OVERVIEW_READABLE_ZOOM) {
			void fitView({ ...FIT_VIEW_OPTIONS, duration });
			return;
		}
		void setViewport(
			{
				x: OVERVIEW_PADDING_PX - bounds.x * OVERVIEW_READABLE_ZOOM,
				y: OVERVIEW_PADDING_PX * 2 - bounds.y * OVERVIEW_READABLE_ZOOM,
				zoom: OVERVIEW_READABLE_ZOOM,
			},
			{ duration }
		);
	}, [
		fitView,
		getNodes,
		getNodesBounds,
		isReducedMotion,
		paneHeight,
		paneWidth,
		setViewport,
	]);
}

function ZoomControls({ onAutoLayout }: { onAutoLayout(): void }) {
	const { fitView, zoomIn, zoomOut } = useReactFlow();
	const showOverview = useShowOverview();
	const isReducedMotion = useReducedMotion();
	const duration = isReducedMotion ? 0 : VIEW_TRANSITION_MS;
	const buttonClassName = 'h-8 min-w-8 px-2 text-xs';
	return (
		<div
			role="group"
			aria-label="视图"
			className={cn(
				NODE_GRAPH_FLOATING_SURFACE_CLASS_NAME,
				'flex items-center gap-0.5 p-1'
			)}
		>
			<Tooltip content="缩小">
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="缩小"
					className={buttonClassName}
					onPress={() => void zoomOut({ duration })}
				>
					−
				</Button>
			</Tooltip>
			<Tooltip content="显示全部节点">
				<Button
					size="sm"
					variant="light"
					className={buttonClassName}
					onPress={() =>
						void fitView({ ...FIT_VIEW_OPTIONS, duration })
					}
				>
					适应
				</Button>
			</Tooltip>
			<Tooltip content="放大">
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="放大"
					className={buttonClassName}
					onPress={() => void zoomIn({ duration })}
				>
					+
				</Button>
			</Tooltip>
			<span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-divider" />
			<Tooltip content="清除手动摆放的位置，重新自动排列">
				<Button
					size="sm"
					variant="light"
					className={buttonClassName}
					onPress={() => {
						onAutoLayout();
						// 等新位置渲染后再回到概览。
						requestAnimationFrame(() =>
							requestAnimationFrame(showOverview)
						);
					}}
				>
					自动排列
				</Button>
			</Tooltip>
		</div>
	);
}

export function NodeGraphCanvas({
	edges,
	nodes,
	isValidConnection,
	onAutoLayout,
	onConnect,
	onConnectToEmpty,
	onEdgeRemove,
	onEdgeSelect,
	onPositionsCommit,
	onSelect,
	overlay,
	ref,
}: IProps) {
	const { getInternalNode, getZoom, screenToFlowPosition, setCenter } =
		useReactFlow<TNodeGraphFlowNode>();
	const isReducedMotion = useReducedMotion();
	const colorScheme = useDocumentColorScheme();
	const [flowNodes, setFlowNodes] = useState(nodes);
	const areNodesInitialized = useNodesInitialized();
	const hasShownOverviewRef = useRef(false);
	const showOverview = useShowOverview();

	useEffect(() => {
		if (!areNodesInitialized || hasShownOverviewRef.current) return;
		hasShownOverviewRef.current = true;
		showOverview();
	}, [areNodesInitialized, showOverview]);

	// 数据变化时换成新节点，保留已测量的尺寸，避免卡片在重新测量前闪烁。
	useEffect(() => {
		setFlowNodes((previousNodes) => {
			const measuredById = new Map(
				previousNodes.map(({ id, measured }) => [id, measured])
			);
			return nodes.map((node) => {
				const measured = measuredById.get(node.id);
				return measured ? { ...node, measured } : node;
			});
		});
	}, [nodes]);

	const focusFrameRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (focusFrameRef.current !== null) {
				cancelAnimationFrame(focusFrameRef.current);
			}
		},
		[]
	);
	useImperativeHandle(
		ref,
		() => ({
			focusNode(id) {
				if (focusFrameRef.current !== null) {
					cancelAnimationFrame(focusFrameRef.current);
				}
				let remainingFrames = FOCUS_MAX_WAIT_FRAMES;
				// 新节点要等 React Flow 测量完尺寸后才能居中。
				const tryFocus = () => {
					focusFrameRef.current = null;
					const node = getInternalNode(id);
					const { height, width } = node?.measured ?? {};
					if (!node || width === undefined || height === undefined) {
						remainingFrames -= 1;
						if (remainingFrames > 0) {
							focusFrameRef.current =
								requestAnimationFrame(tryFocus);
						}
						return;
					}
					void setCenter(
						node.internals.positionAbsolute.x + width / 2,
						node.internals.positionAbsolute.y + height / 2,
						{
							duration: isReducedMotion ? 0 : VIEW_TRANSITION_MS,
							zoom: Math.max(getZoom(), FOCUS_MIN_ZOOM),
						}
					);
				};
				tryFocus();
			},
		}),
		[getInternalNode, getZoom, isReducedMotion, setCenter]
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange<TNodeGraphFlowNode>[]) => {
			setFlowNodes((currentNodes) =>
				applyNodeChanges(changes, currentNodes)
			);
			const committedPositions = new Map<string, INodeGraphPoint>();
			changes.forEach((change) => {
				if (
					change.type === 'position' &&
					change.position &&
					change.dragging !== true
				) {
					committedPositions.set(change.id, {
						x: Math.round(change.position.x),
						y: Math.round(change.position.y),
					});
				}
			});
			if (committedPositions.size > 0) {
				onPositionsCommit(committedPositions);
			}
		},
		[onPositionsCommit]
	);

	// 选择只由页面状态决定；React Flow 自带的选择会在节点改名换 ID 时与页面状态来回同步。
	const handleNodeClick = useCallback(
		(_event: unknown, node: TNodeGraphFlowNode) => onSelect(node.id),
		[onSelect]
	);
	const handlePaneClick = useCallback(() => onSelect(null), [onSelect]);
	const handleEdgeClick = useCallback(
		(_event: unknown, edge: TNodeGraphFlowEdge) => onEdgeSelect(edge.id),
		[onEdgeSelect]
	);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			const { target } = event;
			if (!(target instanceof Element)) return;
			const id = target.getAttribute('data-id');
			if (id === null) return;
			if (target.classList.contains('react-flow__node')) {
				event.preventDefault();
				onSelect(id);
			} else if (target.classList.contains('react-flow__edge')) {
				event.preventDefault();
				onEdgeSelect(id);
			}
		},
		[onEdgeSelect, onSelect]
	);

	const handleIsValidConnection = useCallback(
		(connection: Connection | Edge) =>
			isValidConnection(createConnectionRequest(connection)),
		[isValidConnection]
	);
	const handleConnect = useCallback(
		(connection: Connection) =>
			onConnect(createConnectionRequest(connection)),
		[onConnect]
	);
	// 没有落在可用的入口上时：落在卡片上按“连到这张卡片”处理，落在空白处则新建节点。
	const handleConnectEnd = useCallback<OnConnectEnd>(
		(event, connectionState) => {
			const { fromHandle, fromNode, isValid } = connectionState;
			if (isValid || !fromNode || fromHandle?.type !== 'source') return;
			const point =
				'changedTouches' in event ? event.changedTouches[0] : event;
			if (!point) return;
			const element = document.elementFromPoint(
				point.clientX,
				point.clientY
			);
			if (!element?.closest('.react-flow__pane')) return;
			const sourceHandleId = fromHandle.id ?? null;
			const targetId = element
				.closest('.react-flow__node')
				?.getAttribute('data-id');
			if (targetId !== undefined && targetId !== null) {
				if (targetId === fromNode.id) return;
				onConnect({
					sourceHandleId,
					sourceId: fromNode.id,
					targetHandleId: NODE_GRAPH_INPUT_HANDLE_ID,
					targetId,
				});
				return;
			}
			onConnectToEmpty(
				fromNode.id,
				sourceHandleId,
				screenToFlowPosition({ x: point.clientX, y: point.clientY })
			);
		},
		[onConnect, onConnectToEmpty, screenToFlowPosition]
	);
	const edgeActions = useMemo(
		() => ({ onRemove: onEdgeRemove }),
		[onEdgeRemove]
	);

	// React Flow 会在根节点加 light/dark 类，命中 HeroUI 默认主题变量，需在根节点重新套用应用主题。
	return (
		<NodeGraphEdgeActionsContext.Provider value={edgeActions}>
			<ReactFlow<TNodeGraphFlowNode, TNodeGraphFlowEdge>
				className={cn('node-graph-canvas', THEME_VARIANT_CLASS_NAME)}
				colorMode={colorScheme}
				connectionLineStyle={CONNECTION_LINE_STYLE}
				connectionRadius={CONNECTION_RADIUS_PX}
				deleteKeyCode={null}
				edges={edges}
				edgeTypes={NODE_GRAPH_EDGE_TYPES}
				elementsSelectable={false}
				isValidConnection={handleIsValidConnection}
				maxZoom={1.6}
				minZoom={0.15}
				multiSelectionKeyCode={null}
				nodes={flowNodes}
				nodeTypes={NODE_GRAPH_NODE_TYPES}
				selectionKeyCode={null}
				zoomOnDoubleClick={false}
				onConnect={handleConnect}
				onConnectEnd={handleConnectEnd}
				onEdgeClick={handleEdgeClick}
				onKeyDown={handleKeyDown}
				onNodeClick={handleNodeClick}
				onNodesChange={handleNodesChange}
				onPaneClick={handlePaneClick}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={20}
					size={1.2}
				/>
				{overlay !== undefined && (
					<Panel position="top-left" className="!m-2 sm:!m-3">
						{overlay}
					</Panel>
				)}
				<Panel position="bottom-left" className="!m-2 sm:!m-3">
					<ZoomControls onAutoLayout={onAutoLayout} />
				</Panel>
				<MiniMap<TNodeGraphFlowNode>
					ariaLabel="节点图缩略图"
					className="!hidden overflow-hidden rounded-large border border-divider sm:!block"
					nodeColor={getMiniMapNodeColor}
					nodeStrokeWidth={0}
					pannable
					zoomable
				/>
			</ReactFlow>
		</NodeGraphEdgeActionsContext.Provider>
	);
}
