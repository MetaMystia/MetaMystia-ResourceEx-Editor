import {
	type EdgeLabel,
	Graph,
	type GraphLabel,
	layout,
	type NodeLabel,
	type Point,
} from '@dagrejs/dagre';

import { safeStorage } from '@/infrastructure/browser/storage/safeStorage';

export interface INodeGraphPoint {
	x: number;
	y: number;
}

export interface INodeGraphSize {
	height: number;
	width: number;
}

interface IStoredWorkspacePositions {
	positions: Record<string, INodeGraphPoint>;
	updatedAt: number;
}

/** 节点位置只存在本机浏览器里，不进入工作区文档，也不随资源包导出。 */
const POSITIONS_STORAGE_KEY = 'nodeGraphEditor:positions';
const MAX_STORED_WORKSPACES = 20;

const LAYOUT_NODE_GAP_PX = 36;
const LAYOUT_RANK_GAP_PX = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readPoint(value: unknown): INodeGraphPoint | null {
	if (!isRecord(value)) return null;
	const { x, y } = value;
	return typeof x === 'number' &&
		Number.isFinite(x) &&
		typeof y === 'number' &&
		Number.isFinite(y)
		? { x, y }
		: null;
}

function readStoredWorkspaces(): Record<string, IStoredWorkspacePositions> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(safeStorage.getItem(POSITIONS_STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
	if (!isRecord(parsed)) return {};
	const workspaces: Record<string, IStoredWorkspacePositions> = {};
	Object.entries(parsed).forEach(([workspaceId, value]) => {
		if (!isRecord(value) || !isRecord(value['positions'])) return;
		const updatedAt = value['updatedAt'];
		const positions: Record<string, INodeGraphPoint> = {};
		Object.entries(value['positions']).forEach(([nodeId, point]) => {
			const parsedPoint = readPoint(point);
			if (parsedPoint) positions[nodeId] = parsedPoint;
		});
		workspaces[workspaceId] = {
			positions,
			updatedAt:
				typeof updatedAt === 'number' && Number.isFinite(updatedAt)
					? updatedAt
					: 0,
		};
	});
	return workspaces;
}

export function readNodeGraphPositions(
	workspaceId: string
): ReadonlyMap<string, INodeGraphPoint> {
	const stored = readStoredWorkspaces()[workspaceId];
	return new Map(Object.entries(stored?.positions ?? {}));
}

/** 保存一个工作区的手动位置；只保留最近使用的若干个工作区。 */
export function writeNodeGraphPositions(
	workspaceId: string,
	positions: ReadonlyMap<string, INodeGraphPoint>
) {
	const workspaces = readStoredWorkspaces();
	if (positions.size === 0) {
		delete workspaces[workspaceId];
	} else {
		workspaces[workspaceId] = {
			positions: Object.fromEntries(positions),
			updatedAt: Date.now(),
		};
	}
	const keptEntries = Object.entries(workspaces)
		.sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
		.slice(0, MAX_STORED_WORKSPACES);
	if (keptEntries.length === 0) {
		safeStorage.removeItem(POSITIONS_STORAGE_KEY);
		return;
	}
	safeStorage.setItem(
		POSITIONS_STORAGE_KEY,
		JSON.stringify(Object.fromEntries(keptEntries))
	);
}

interface IComputeLayoutInput {
	edges: readonly { source: string; target: string }[];
	nodeSizes: ReadonlyMap<string, INodeGraphSize>;
}

/** 从左到右分层排列，返回每个节点左上角坐标。 */
export function computeNodeGraphLayout({
	edges,
	nodeSizes,
}: IComputeLayoutInput): Map<string, INodeGraphPoint> {
	const graph = new Graph<GraphLabel, NodeLabel & Partial<Point>, EdgeLabel>({
		multigraph: true,
	});
	graph.setGraph({
		nodesep: LAYOUT_NODE_GAP_PX,
		rankdir: 'LR',
		ranksep: LAYOUT_RANK_GAP_PX,
	});
	graph.setDefaultEdgeLabel(() => ({}));
	nodeSizes.forEach((size, id) => graph.setNode(id, { ...size }));
	edges.forEach(({ source, target }, index) => {
		if (nodeSizes.has(source) && nodeSizes.has(target)) {
			graph.setEdge(source, target, {}, String(index));
		}
	});
	layout(graph);

	const positions = new Map<string, INodeGraphPoint>();
	nodeSizes.forEach((size, id) => {
		const center = graph.node(id);
		positions.set(id, {
			x: Math.round((center.x ?? 0) - size.width / 2),
			y: Math.round((center.y ?? 0) - size.height / 2),
		});
	});
	return positions;
}

interface IResolvePositionsInput {
	autoPositions: ReadonlyMap<string, INodeGraphPoint>;
	edges: readonly { source: string; target: string }[];
	nodeSizes: ReadonlyMap<string, INodeGraphSize>;
	storedPositions: ReadonlyMap<string, INodeGraphPoint>;
}

function overlapsAny(
	point: INodeGraphPoint,
	size: INodeGraphSize,
	positions: ReadonlyMap<string, INodeGraphPoint>,
	nodeSizes: ReadonlyMap<string, INodeGraphSize>
) {
	for (const [id, other] of positions) {
		const otherSize = nodeSizes.get(id);
		if (!otherSize) continue;
		if (
			point.x < other.x + otherSize.width + LAYOUT_NODE_GAP_PX &&
			other.x < point.x + size.width + LAYOUT_NODE_GAP_PX &&
			point.y < other.y + otherSize.height + LAYOUT_NODE_GAP_PX &&
			other.y < point.y + size.height + LAYOUT_NODE_GAP_PX
		) {
			return true;
		}
	}
	return false;
}

/**
 * 没有手动位置时全部自动排列；摆过位置后保留已有坐标，
 * 新出现的节点放到前驱右侧（避开重叠），没有已摆好的前驱时放到所有节点下方。
 */
export function resolveNodeGraphPositions({
	autoPositions,
	edges,
	nodeSizes,
	storedPositions,
}: IResolvePositionsInput): Map<string, INodeGraphPoint> {
	if (storedPositions.size === 0) return new Map(autoPositions);

	const positions = new Map<string, INodeGraphPoint>();
	nodeSizes.forEach((_, id) => {
		const stored = storedPositions.get(id);
		if (stored) positions.set(id, stored);
	});
	let pendingIds = [...nodeSizes.keys()].filter((id) => !positions.has(id));
	let left = Infinity;
	let bottom = -Infinity;
	positions.forEach((point, id) => {
		left = Math.min(left, point.x);
		bottom = Math.max(bottom, point.y + (nodeSizes.get(id)?.height ?? 0));
	});
	if (!Number.isFinite(left)) left = 0;
	if (!Number.isFinite(bottom)) bottom = -LAYOUT_RANK_GAP_PX;

	const place = (id: string, start: INodeGraphPoint) => {
		const size = nodeSizes.get(id);
		if (!size) return;
		const point = { ...start };
		while (overlapsAny(point, size, positions, nodeSizes)) {
			point.y += LAYOUT_NODE_GAP_PX;
		}
		positions.set(id, point);
		bottom = Math.max(bottom, point.y + size.height);
	};

	while (pendingIds.length > 0) {
		const remainingIds: string[] = [];
		pendingIds.forEach((id) => {
			const predecessorId = edges.find(
				({ source, target }) => target === id && positions.has(source)
			)?.source;
			const predecessor =
				predecessorId === undefined
					? undefined
					: positions.get(predecessorId);
			const predecessorSize =
				predecessorId === undefined
					? undefined
					: nodeSizes.get(predecessorId);
			if (predecessor && predecessorSize) {
				place(id, {
					x:
						predecessor.x +
						predecessorSize.width +
						LAYOUT_RANK_GAP_PX,
					y: predecessor.y,
				});
			} else {
				remainingIds.push(id);
			}
		});
		if (remainingIds.length === pendingIds.length) {
			const [id, ...rest] = remainingIds;
			if (id !== undefined) {
				place(id, { x: left, y: bottom + LAYOUT_RANK_GAP_PX });
			}
			pendingIds = rest;
		} else {
			pendingIds = remainingIds;
		}
	}
	return positions;
}
