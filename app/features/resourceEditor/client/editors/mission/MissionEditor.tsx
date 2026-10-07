'use client';

import { memo, useMemo } from 'react';

import { BEVERAGE_NAMES } from '@/domain/data/beverages';
import { FOOD_NAMES } from '@/domain/data/foods';
import { INGREDIENT_NAMES } from '@/domain/data/ingredients';
import { RECIPE_NAMES } from '@/domain/data/recipes';
import { SPECIAL_GUESTS } from '@/domain/data/specialGuest';
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
	onRemove,
	onUpdate,
}) {
	const allFoods = useMemo(() => {
		const result = [...FOOD_NAMES];
		foods.forEach((f) => {
			if (!result.find((r) => r.id === f.id)) {
				result.push({ id: f.id, name: f.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [foods]);

	const allIngredients = useMemo(() => {
		const result = [...INGREDIENT_NAMES];
		ingredients.forEach((i) => {
			if (!result.find((r) => r.id === i.id)) {
				result.push({ id: i.id, name: i.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [ingredients]);

	const allBeverages = useMemo(() => {
		const result = [...BEVERAGE_NAMES];
		beverages.forEach((b) => {
			if (!result.find((r) => r.id === b.id)) {
				result.push({ id: b.id, name: b.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [beverages]);

	const allRecipes = useMemo(() => {
		const result = [...RECIPE_NAMES];
		recipes.forEach((r) => {
			if (!result.find((existing) => existing.id === r.id)) {
				const targetFood = allFoods.find((f) => f.id === r.foodId);
				const name = targetFood ? targetFood.name : `Food_${r.foodId}`;
				result.push({ id: r.id, name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [recipes, allFoods]);

	const characterOptions = useMemo(() => {
		const options: { value: string; label: string }[] = [];
		// Add built-in special guests
		SPECIAL_GUESTS.forEach((g) => {
			options.push({
				value: g.label,
				label: `[${g.id}] ${g.name}（${g.label}）`,
			});
		});
		// Add custom characters
		characters.forEach((c) => {
			options.push({
				value: c.label,
				label: `[${c.id}] ${c.name}（${c.label}）`,
			});
		});
		return options;
	}, [characters]);

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
