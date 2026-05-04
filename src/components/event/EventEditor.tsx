'use client';

import { memo, useMemo } from 'react';
import { SectionDeleteButton } from '@/components/common/SectionDeleteButton';
import { FOOD_NAMES } from '@/data/foods';
import { INGREDIENT_NAMES } from '@/data/ingredients';
import { RECIPE_NAMES } from '@/data/recipes';
import { SPECIAL_GUESTS } from '@/data/specialGuest';
import type {
	EventNode,
	MissionNode,
	Character,
	DialogPackage,
	Food,
	Ingredient,
	Recipe,
} from '@/types/resource';
import { EditorField } from '@/components/common/EditorField';
import { WarningBadge } from '@/components/common/WarningBadge';
import { MissionRewardList } from '@/components/mission/MissionRewardList';
import { PostEventList } from './PostEventList';
import { PostMissionList } from '@/components/mission/PostMissionList';
import { ScheduledEventEditor } from './ScheduledEventEditor';
import { useLabelPrefixValidation } from '@/components/common/useLabelPrefixValidation';

interface EventEditorProps {
	eventNode: EventNode | null;
	allMissions: MissionNode[];
	allEvents: EventNode[];
	allCharacters: Character[];
	allDialogPackages: DialogPackage[];
	foods: Food[];
	ingredients: Ingredient[];
	recipes: Recipe[];
	onRemove: () => void;
	onUpdate: (updates: Partial<EventNode>) => void;
}

export default memo<EventEditorProps>(function EventEditor({
	eventNode,
	allMissions,
	allEvents,
	allCharacters,
	allDialogPackages,
	foods,
	ingredients,
	recipes,
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
				label: `[${g.id}] ${g.name} (${g.label})`,
			});
		});
		// Add custom characters
		allCharacters.forEach((c) => {
			options.push({
				value: c.label,
				label: `[${c.id}] ${c.name} (${c.label})`,
			});
		});
		return options;
	}, [allCharacters]);

	const {
		isValid: isLabelPrefixValid,
		prefix: expectedPrefix,
		hasPackLabel,
	} = useLabelPrefixValidation(eventNode?.label || '');
	const showPrefixWarning =
		hasPackLabel && eventNode && eventNode.label && !isLabelPrefixValid;

	if (!eventNode) {
		return (
			<div className="flex h-full items-center justify-center rounded-lg bg-white/5 p-8 text-center backdrop-blur">
				<div className="text-black/40 dark:text-white/40">
					请在左侧列表选择一个事件节点，或点击 + 按钮创建新事件节点
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 rounded-lg bg-white/10 p-6 shadow-md backdrop-blur">
			<div className="flex items-center justify-between border-b border-black/10 pb-4 dark:border-white/10">
				<h2 className="text-2xl font-bold">事件节点编辑</h2>
				<SectionDeleteButton onPress={onRemove}>
					删除事件
				</SectionDeleteButton>
			</div>

			<div className="grid grid-cols-1 gap-6">
				<EditorField label="Debug Label">
					<input
						type="text"
						value={eventNode.debugLabel || ''}
						onChange={(e) =>
							onUpdate({ debugLabel: e.target.value })
						}
						className="rounded-lg border border-black/10 bg-black/5 px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5"
						placeholder="用于显示在编辑器左侧列表的名称"
					/>
				</EditorField>

				<EditorField
					label="Label"
					actions={
						showPrefixWarning ? (
							<WarningBadge>
								建议以 {expectedPrefix} 开头
							</WarningBadge>
						) : undefined
					}
				>
					<input
						type="text"
						value={eventNode.label || ''}
						onChange={(e) => onUpdate({ label: e.target.value })}
						className="rounded-lg border border-black/10 bg-black/5 px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5"
						placeholder="游戏内唯一标识符"
					/>
				</EditorField>

				<EditorField label="Scheduled Event">
					<ScheduledEventEditor
						scheduledEvent={eventNode.scheduledEvent || {}}
						allCharacters={allCharacters}
						allDialogPackages={allDialogPackages}
						onUpdate={(updatedScheduledEvent) =>
							onUpdate({ scheduledEvent: updatedScheduledEvent })
						}
					/>
				</EditorField>
				<MissionRewardList
					title="Rewards"
					rewards={eventNode.rewards || []}
					characterOptions={characterOptions}
					allFoods={allFoods}
					allIngredients={allIngredients}
					allRecipes={allRecipes}
					onUpdate={(rewards) => onUpdate({ rewards })}
				/>

				<MissionRewardList
					title="Post Rewards"
					rewards={eventNode.postRewards || []}
					characterOptions={characterOptions}
					allFoods={allFoods}
					allIngredients={allIngredients}
					allRecipes={allRecipes}
					onUpdate={(postRewards) => onUpdate({ postRewards })}
				/>

				<PostMissionList
					postMissions={eventNode.postMissionsAfterPerformance}
					allMissions={allMissions}
					onUpdate={(pms) =>
						onUpdate({ postMissionsAfterPerformance: pms })
					}
				/>

				<PostEventList
					postEvents={eventNode.postEvents}
					allEvents={allEvents}
					onUpdate={(events) => onUpdate({ postEvents: events })}
				/>
			</div>
		</div>
	);
});
