'use client';

import { useCallback, useState } from 'react';

import type { EventNode } from '@/domain/resourcePack/contracts/event';

import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import EventEditor from './EventEditor';
import { EventList } from './EventList';
import {
	appendEventNode,
	removeEventNodeAt,
	updateEventNodeAt,
} from './eventNodeEdits';

export function EventEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	useEditorEntityNavigationIntent({
		entityKind: 'event',
		getStableKey: (eventNode) => eventNode.label,
		items: data.eventNodes,
		onSelect: setSelectedIndex,
	});

	const eventCount = (data.eventNodes ?? []).length;
	const addEvent = useCallback(() => {
		updateResourcePack(appendEventNode);
		setSelectedIndex(eventCount);
	}, [eventCount, updateResourcePack]);

	const updateEvent = useCallback(
		(index: number | null, updates: Partial<EventNode>) => {
			if (index === null) return;
			updateResourcePack((current) =>
				updateEventNodeAt(current, index, updates)
			);
		},
		[updateResourcePack]
	);

	const removeEvent = useCallback(
		(index: number | null) => {
			if (index === null) return;
			updateResourcePack((current) => removeEventNodeAt(current, index));
			setSelectedIndex(null);
		},
		[updateResourcePack]
	);

	const selectedEvent =
		selectedIndex !== null &&
		data.eventNodes &&
		data.eventNodes[selectedIndex]
			? data.eventNodes[selectedIndex]
			: null;

	return (
		<EditorWorkspace detailKey={selectedIndex}>
			<EventList
				events={data.eventNodes || []}
				selectedIndex={selectedIndex}
				onAdd={addEvent}
				onSelect={setSelectedIndex}
			/>

			<div className="lg:col-span-2">
				<EventEditor
					eventNode={selectedEvent}
					allMissions={data.missionNodes || []}
					allEvents={data.eventNodes || []}
					allCharacters={data.characters || []}
					beverages={data.beverages || []}
					foods={data.foods || []}
					ingredients={data.ingredients || []}
					recipes={data.recipes || []}
					allDialogPackages={data.dialogPackages || []}
					onRemove={() => removeEvent(selectedIndex)}
					onUpdate={(updates) => updateEvent(selectedIndex, updates)}
				/>
			</div>
		</EditorWorkspace>
	);
}
