'use client';

import { cn } from '@heroui/theme';
import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from '@xyflow/react';
import { createContext, memo, useContext } from 'react';

import Button from '@/design/ui/components/button';

import {
	NODE_GRAPH_EDGE_TYPE,
	type TNodeGraphFlowEdge,
} from './nodeGraphFlowModel';

interface INodeGraphEdgeActions {
	onRemove(edgeId: string): void;
}

export const NodeGraphEdgeActionsContext =
	createContext<INodeGraphEdgeActions | null>(null);

const EDGE_INTERACTION_WIDTH_PX = 18;
/** 选中连线的删除按钮要盖在卡片上面，否则中点落在卡片下时点不到。 */
const SELECTED_EDGE_LABEL_Z_INDEX = 1001;

/** 连线本身；选中的可删除连线在中点显示删除按钮。 */
export const NodeGraphEdge = memo(function NodeGraphEdge({
	data,
	id,
	markerEnd,
	sourcePosition,
	sourceX,
	sourceY,
	style,
	targetPosition,
	targetX,
	targetY,
}: EdgeProps<TNodeGraphFlowEdge>) {
	const actions = useContext(NodeGraphEdgeActionsContext);
	const [path, labelX, labelY] = getBezierPath({
		sourcePosition,
		sourceX,
		sourceY,
		targetPosition,
		targetX,
		targetY,
	});
	const isSelected = data?.isSelected === true;
	const shouldShowRemove = isSelected && data?.isRemovable === true;
	const label = data?.label;

	return (
		<>
			<BaseEdge
				id={id}
				interactionWidth={EDGE_INTERACTION_WIDTH_PX}
				path={path}
				style={{ ...style, ...(isSelected ? { strokeWidth: 3 } : {}) }}
				{...(markerEnd === undefined ? {} : { markerEnd })}
			/>
			{(label !== undefined || shouldShowRemove) && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
						style={{
							left: labelX,
							top: labelY,
							...(shouldShowRemove
								? { zIndex: SELECTED_EDGE_LABEL_Z_INDEX }
								: {}),
						}}
					>
						{label !== undefined && (
							<span
								className={cn(
									'rounded-small bg-content1 px-1.5 text-[11px] leading-5 text-foreground-600 shadow-sm',
									style?.opacity !== undefined && 'opacity-40'
								)}
							>
								{label}
							</span>
						)}
						{shouldShowRemove && actions && (
							<Button
								size="sm"
								color="danger"
								variant="flat"
								className="h-7 min-w-0 px-2 text-xs shadow-sm"
								onPress={() => actions.onRemove(id)}
							>
								删除连线
							</Button>
						)}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
});

export const NODE_GRAPH_EDGE_TYPES = { [NODE_GRAPH_EDGE_TYPE]: NodeGraphEdge };
