'use client';

import { useCallback, useState } from 'react';

import type { MissionNode } from '@/domain/resourcePack/contracts/mission';

import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import MissionEditor from './MissionEditor';
import { MissionList } from './MissionList';
import {
	appendMissionNode,
	removeMissionNodeAt,
	updateMissionNodeAt,
} from './missionNodeEdits';

export function MissionEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	useEditorEntityNavigationIntent({
		entityKind: 'mission',
		getStableKey: (missionNode) => missionNode.label,
		items: data.missionNodes,
		onSelect: setSelectedIndex,
	});

	const missionCount = data.missionNodes.length;
	const addMission = useCallback(() => {
		updateResourcePack(appendMissionNode);
		setSelectedIndex(missionCount);
	}, [missionCount, updateResourcePack]);

	const updateMission = useCallback(
		(index: number | null, updates: Partial<MissionNode>) => {
			if (index === null) return;
			updateResourcePack((current) =>
				updateMissionNodeAt(current, index, updates)
			);
		},
		[updateResourcePack]
	);

	const removeMission = useCallback(
		(index: number | null) => {
			if (index === null) return;
			updateResourcePack((current) =>
				removeMissionNodeAt(current, index)
			);
			setSelectedIndex(null);
		},
		[updateResourcePack]
	);

	const selectedMission =
		selectedIndex !== null && data.missionNodes[selectedIndex]
			? data.missionNodes[selectedIndex]
			: null;

	return (
		<EditorWorkspace detailKey={selectedIndex}>
			<MissionList
				missions={data.missionNodes}
				selectedIndex={selectedIndex}
				onAdd={addMission}
				onSelect={setSelectedIndex}
			/>

			<div className="lg:col-span-2">
				<MissionEditor
					mission={selectedMission}
					characters={data.characters || []}
					foods={data.foods || []}
					ingredients={data.ingredients || []}
					beverages={data.beverages || []}
					recipes={data.recipes || []}
					allMissions={data.missionNodes || []}
					allEvents={data.eventNodes || []}
					allDialogPackages={data.dialogPackages || []}
					onRemove={() => removeMission(selectedIndex)}
					onUpdate={(updates) =>
						updateMission(selectedIndex, updates)
					}
				/>
			</div>
		</EditorWorkspace>
	);
}
