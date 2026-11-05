'use client';

import { memo } from 'react';

import type { Character } from '@/domain/resourcePack/contracts/character';
import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';
import type { EventNode } from '@/domain/resourcePack/contracts/event';
import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';
import type { MissionNode } from '@/domain/resourcePack/contracts/mission';
import type { INewsNode } from '@/domain/resourcePack/contracts/news';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { PostEventList } from '@/features/resourceEditor/client/editors/event/PostEventList';
import { EventDataEditor } from '@/features/resourceEditor/client/editors/event/ScheduledEvent/EventDataEditor';

import { MissionBasicInfo } from './MissionBasicInfo';
import { MissionConditionList } from './MissionConditionList';
import { MissionRewardList } from './MissionRewardList';
import { PostMissionList } from './PostMissionList';
import { useRewardOptions } from './useRewardOptions';

interface MissionEditorProps {
	mission: MissionNode | null;
	characters: Character[];
	foods: Food[];
	ingredients: Ingredient[];
	beverages: Beverage[];
	recipes: Recipe[];
	allMissions: MissionNode[];
	allEvents: EventNode[];
	allDialogPackages: DialogPackage[];
	allNews: INewsNode[];
	onRemove: () => void;
	onUpdate: (updates: Partial<MissionNode>) => void;
}

export default memo<MissionEditorProps>(function MissionEditor({
	mission,
	characters,
	foods,
	ingredients,
	beverages,
	recipes,
	allMissions,
	allEvents,
	allDialogPackages,
	allNews,
	onRemove,
	onUpdate,
}) {
	const {
		allBeverages,
		allFoods,
		allIngredients,
		allRecipes,
		characterOptions,
	} = useRewardOptions({
		beverages,
		characters,
		foods,
		ingredients,
		recipes,
	});

	if (!mission) {
		return <EditorDetailEmptyState itemLabel="任务节点" />;
	}

	return (
		<EditorDetailPanel>
			<EditorDetailHeader
				title="任务节点编辑"
				actions={
					<SectionDeleteButton
						confirmTitle="确定要删除这个任务节点吗？"
						onPress={onRemove}
					>
						删除任务
					</SectionDeleteButton>
				}
			/>

			<MissionBasicInfo
				mission={mission}
				characters={characters}
				allFoods={allFoods}
				characterOptions={characterOptions}
				isLabelDuplicate={
					Boolean(mission.label) &&
					allMissions.some(
						(candidate) =>
							candidate !== mission &&
							candidate.label === mission.label
					)
				}
				onUpdate={onUpdate}
			/>

			<MissionConditionList
				allEvents={allEvents}
				mission={mission}
				characterOptions={characterOptions}
				allBeverages={allBeverages}
				allFoods={allFoods}
				allIngredients={allIngredients}
				onUpdate={onUpdate}
			/>

			<MissionRewardList
				title="奖励（Rewards）"
				rewards={mission.rewards || []}
				characterOptions={characterOptions}
				allBeverages={allBeverages}
				allFoods={allFoods}
				allIngredients={allIngredients}
				allRecipes={allRecipes}
				allNews={allNews}
				onUpdate={(rewards) => onUpdate({ rewards })}
			/>

			<MissionRewardList
				title="后置奖励（Post Rewards）"
				rewards={mission.postRewards || []}
				characterOptions={characterOptions}
				allBeverages={allBeverages}
				allFoods={allFoods}
				allIngredients={allIngredients}
				allRecipes={allRecipes}
				allNews={allNews}
				onUpdate={(postRewards) => onUpdate({ postRewards })}
			/>

			<EditorSection title="任务完成事件（Mission Finish Event）">
				<EventDataEditor
					eventData={mission.missionFinishEvent}
					allDialogPackages={allDialogPackages}
					onChange={(event) =>
						onUpdate({ missionFinishEvent: event })
					}
				/>
			</EditorSection>

			<EditorSection title="任务失败事件（Mission Failed Event）">
				<EventDataEditor
					eventData={mission.missionFailedEvent}
					allDialogPackages={allDialogPackages}
					onChange={(event) =>
						onUpdate({ missionFailedEvent: event })
					}
				/>
			</EditorSection>

			<PostMissionList
				postMissions={mission.postMissionsAfterPerformance}
				allMissions={allMissions}
				onUpdate={(pms) =>
					onUpdate({ postMissionsAfterPerformance: pms })
				}
			/>

			<PostEventList
				postEvents={mission.postEvents}
				allEvents={allEvents}
				onUpdate={(events) => onUpdate({ postEvents: events })}
			/>
		</EditorDetailPanel>
	);
});
