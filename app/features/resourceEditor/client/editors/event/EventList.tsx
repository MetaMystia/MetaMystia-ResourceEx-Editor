import { memo } from 'react';

import type { EventNode } from '@/domain/resourcePack/contracts/event';

import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { usePackLabelPrefix } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

interface EventListProps {
	events: EventNode[];
	selectedIndex: number | null;
	onAdd: () => void;
	onSelect: (index: number) => void;
}

export const EventList = memo<EventListProps>(function EventList({
	events,
	selectedIndex,
	onAdd,
	onSelect,
}) {
	const packLabelPrefix = usePackLabelPrefix();

	return (
		<EditorCollectionPanel
			title="事件节点列表"
			addLabel="新建事件"
			emptyTitle="暂无事件节点"
			hasItems={events.length > 0}
			onAdd={onAdd}
		>
			{events.map((event, index) => {
				const hasPrefixWarning =
					packLabelPrefix &&
					packLabelPrefix !== '_' &&
					event.label &&
					!event.label.startsWith(packLabelPrefix);

				return (
					<EditorCollectionItem
						key={index}
						isSelected={selectedIndex === index}
						onSelect={() => onSelect(index)}
					>
						<EditorCollectionItemTitle>
							<span className="min-w-0 break-words">
								{event.debugLabel || '未命名事件'}
							</span>
							{hasPrefixWarning && (
								<WarningBadge>前缀不规范</WarningBadge>
							)}
						</EditorCollectionItemTitle>
						<EditorCollectionItemMeta>
							{event.label}
						</EditorCollectionItemMeta>
					</EditorCollectionItem>
				);
			})}
		</EditorCollectionPanel>
	);
});
