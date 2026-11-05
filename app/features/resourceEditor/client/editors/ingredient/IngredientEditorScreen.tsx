'use client';

import { useCallback, useMemo } from 'react';

import type { Ingredient } from '@/domain/resourcePack/contracts/items';
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

import { IngredientEditor } from './IngredientEditor';
import { IngredientList } from './IngredientList';

export function IngredientEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	useEditorEntityNavigationIntent({
		entityKind: 'ingredient',
		getStableKey: (ingredient) => ingredient.id,
		items: data.ingredients,
		onSelect: setSelectedIndex,
	});

	const addIngredient = useCallback(() => {
		const newId = findNextAvailableInteger(
			data.ingredients.map((ingredient) => ingredient.id),
			getEntityIdAllocationStart(data.packInfo.idRangeStart, 11000)
		);
		const newIngredient: Ingredient = {
			id: newId,
			name: findNextAvailableSuffixedValue(
				data.ingredients.map((ingredient) => ingredient.name),
				'新食材'
			),
			description: '',
			level: 1,
			prefix: -1,
			isFish: false,
			isMeat: false,
			isVeg: false,
			baseValue: 1,
			tags: [],
			spritePath: `assets/Ingredient/${newId}.png`,
		};
		const newIngredients = [...data.ingredients, newIngredient];
		updateResourcePack(() => ({ ...data, ingredients: newIngredients }));
		setSelectedIndex(newIngredients.length - 1);
	}, [data, updateResourcePack]);

	const removeIngredient = useCallback(
		(index: number) => {
			const newIngredients = data.ingredients.filter(
				(_, i) => i !== index
			);
			updateResourcePack(() => ({
				...data,
				ingredients: newIngredients,
			}));
			if (selectedIndex === index) {
				replaceSelection(newIngredients.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateIngredient = useCallback(
		(index: number | null, updates: Partial<Ingredient>) => {
			if (index === null) {
				return;
			}
			const newIngredients = [...data.ingredients];
			const previousIngredient = newIngredients[index];
			newIngredients[index] = {
				...newIngredients[index],
				...updates,
			} as Ingredient;
			let nextData = { ...data, ingredients: newIngredients };
			if (
				previousIngredient &&
				updates.id !== undefined &&
				updates.id !== previousIngredient.id
			) {
				nextData = remapResourcePackItemReferences(
					nextData,
					'Ingredient',
					previousIngredient.id,
					updates.id
				);
			}
			updateResourcePack(() => nextData);
		},
		[data, updateResourcePack]
	);

	const selectedIngredient = useMemo(
		() =>
			selectedIndex === null
				? null
				: (data.ingredients[selectedIndex] ?? null),
		[data, selectedIndex]
	);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<IngredientList
				ingredients={data.ingredients}
				selectedIndex={selectedIndex}
				onAdd={addIngredient}
				onRemove={removeIngredient}
				onSelect={setSelectedIndex}
			/>

			<IngredientEditor
				ingredient={selectedIngredient}
				ingredientIndex={selectedIndex}
				onUpdate={(updates: Partial<Ingredient>) => {
					updateIngredient(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
