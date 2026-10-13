import type { EventNode } from '@/domain/resourcePack/contracts/event';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { remapResourcePackLabelReferences } from '@/domain/resourcePack/entityReferences';

import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

const DEFAULT_EVENT = {
	debugLabel: '新事件',
	scheduledEvent: { eventData: { eventType: 'Null' as const } },
	postMissionsAfterPerformance: [] as string[],
};

/** 在末尾追加一个带本包前缀标签的新事件，新事件下标为原长度。 */
export function appendEventNode(resourcePack: ResourceEx): ResourceEx {
	const packLabel = resourcePack.packInfo.label;
	const labelPrefix = packLabel ? `_${packLabel}_` : '_';
	const eventNodes = resourcePack.eventNodes ?? [];
	const newEvent: EventNode = {
		...DEFAULT_EVENT,
		label: findNextAvailableSuffixedValue(
			eventNodes.map((eventNode) => eventNode.label),
			`${labelPrefix}Event_`
		),
	};
	return { ...resourcePack, eventNodes: [...eventNodes, newEvent] };
}

/** 合并事件字段；标签变化时同步更新所有引用该事件的位置。 */
export function updateEventNodeAt(
	resourcePack: ResourceEx,
	index: number,
	updates: Partial<EventNode>
): ResourceEx {
	const eventNodes = [...(resourcePack.eventNodes || [])];
	const previousEvent = eventNodes[index];
	if (!previousEvent) return resourcePack;
	eventNodes[index] = { ...previousEvent, ...updates } as EventNode;
	const nextResourcePack = { ...resourcePack, eventNodes };
	if (updates.label === undefined || updates.label === previousEvent.label) {
		return nextResourcePack;
	}
	return remapResourcePackLabelReferences(
		nextResourcePack,
		'Event',
		previousEvent.label,
		updates.label
	);
}

export function removeEventNodeAt(
	resourcePack: ResourceEx,
	index: number
): ResourceEx {
	return {
		...resourcePack,
		eventNodes: (resourcePack.eventNodes || []).filter(
			(_, i) => i !== index
		),
	};
}
