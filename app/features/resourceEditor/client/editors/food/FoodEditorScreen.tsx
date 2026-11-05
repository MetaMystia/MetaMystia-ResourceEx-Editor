'use client';

import { useCallback, useMemo } from 'react';

import type { Food } from '@/domain/resourcePack/contracts/items';
import { remapResourcePackItemReferences } from '@/domain/resourcePack/entityReferences';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import {
	findNextAvailableInteger,
	findNextAvailableSuffixedValue,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { FoodEditor } from './FoodEditor';
import { FoodList } from './FoodList';

export function FoodEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	useEditorEntityNavigationIntent({
		entityKind: 'food',
		getStableKey: (food) => food.id,
		items: data.foods ?? [],
		onSelect: setSelectedIndex,
	});

	const addFood = useCallback(() => {
		const foods = data.foods ?? [];
		const newId = findNextAvailableInteger(
			foods.map((food) => food.id),
			getEntityIdAllocationStart(data.packInfo.idRangeStart, 11000)
		);
		const newFood: Food = {
			id: newId,
			name: findNextAvailableSuffixedValue(
				foods.map((food) => food.name),
				'新料理'
			),
			description: '',
			level: 1,
			baseValue: 1,
			tags: [],
			banTags: [],
			spritePath: `assets/Food/${newId}.png`,
		};
		const newFoods = [...foods, newFood];
		updateResourcePack(() => ({ ...data, foods: newFoods }));
		setSelectedIndex(newFoods.length - 1);
	}, [data, updateResourcePack]);

	const removeFood = useCallback(
		(index: number) => {
			const newFoods = (data.foods || []).filter((_, i) => i !== index);
			updateResourcePack(() => ({ ...data, foods: newFoods }));
			if (selectedIndex === index) {
				replaceSelection(newFoods.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateFood = useCallback(
		(index: number | null, updates: Partial<Food>) => {
			if (index === null) {
				return;
			}
			const newFoods = [...(data.foods || [])];
			const previousFood = newFoods[index];
			newFoods[index] = { ...newFoods[index], ...updates } as Food;
			let nextData = { ...data, foods: newFoods };
			if (
				previousFood &&
				updates.id !== undefined &&
				updates.id !== previousFood.id
			) {
				nextData = remapResourcePackItemReferences(
					nextData,
					'Food',
					previousFood.id,
					updates.id
				);
			}
			updateResourcePack(() => nextData);
		},
		[data, updateResourcePack]
	);

	const selectedFood = useMemo(
		() =>
			selectedIndex === null
				? null
				: ((data.foods || [])[selectedIndex] ?? null),
		[data, selectedIndex]
	);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<FoodList
				foods={data.foods || []}
				selectedIndex={selectedIndex}
				onAdd={addFood}
				onRemove={removeFood}
				onSelect={setSelectedIndex}
			/>

			<FoodEditor
				food={selectedFood}
				foodIndex={selectedIndex}
				onUpdate={(updates: Partial<Food>) => {
					updateFood(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
