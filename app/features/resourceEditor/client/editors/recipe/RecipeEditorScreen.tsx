'use client';

import { useCallback, useMemo } from 'react';

import type { Recipe } from '@/domain/resourcePack/contracts/items';
import { remapResourcePackItemReferences } from '@/domain/resourcePack/entityReferences';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import {
	findNextAvailableInteger,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { RecipeEditor } from './RecipeEditor';
import { RecipeList } from './RecipeList';

export function RecipeEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	useEditorEntityNavigationIntent({
		entityKind: 'recipe',
		getStableKey: (recipe) => recipe.id,
		items: data.recipes ?? [],
		onSelect: setSelectedIndex,
	});

	const customIngredients = useMemo(
		() => data.ingredients.map((ing) => ({ id: ing.id, name: ing.name })),
		[data.ingredients]
	);

	const customFoods = useMemo(
		() =>
			(data.foods || []).map((food) => ({
				id: food.id,
				name: food.name,
			})),
		[data.foods]
	);

	const addRecipe = useCallback(() => {
		const newRecipe: Recipe = {
			id: findNextAvailableInteger(
				(data.recipes ?? []).map((recipe) => recipe.id),
				getEntityIdAllocationStart(data.packInfo.idRangeStart, 11000)
			),
			foodId: -1,
			ingredients: [],
			cookTime: 1,
			cookerType: 'Pot',
		};
		const newRecipes = [...(data.recipes || []), newRecipe];
		updateResourcePack(() => ({ ...data, recipes: newRecipes }));
		setSelectedIndex(newRecipes.length - 1);
	}, [data, updateResourcePack]);

	const removeRecipe = useCallback(
		(index: number) => {
			const newRecipes = (data.recipes || []).filter(
				(_, i) => i !== index
			);
			updateResourcePack(() => ({ ...data, recipes: newRecipes }));
			if (selectedIndex === index) {
				replaceSelection(newRecipes.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateRecipe = useCallback(
		(index: number | null, updates: Partial<Recipe>) => {
			if (index === null) {
				return;
			}
			const newRecipes = [...(data.recipes || [])];
			const previousRecipe = newRecipes[index];
			newRecipes[index] = { ...newRecipes[index], ...updates } as Recipe;
			let nextData = { ...data, recipes: newRecipes };
			if (
				previousRecipe &&
				updates.id !== undefined &&
				updates.id !== previousRecipe.id
			) {
				nextData = remapResourcePackItemReferences(
					nextData,
					'Recipe',
					previousRecipe.id,
					updates.id
				);
			}
			updateResourcePack(() => nextData);
		},
		[data, updateResourcePack]
	);

	const selectedRecipe = useMemo(
		() =>
			selectedIndex === null
				? null
				: ((data.recipes || [])[selectedIndex] ?? null),
		[data, selectedIndex]
	);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<RecipeList
				recipes={data.recipes || []}
				customIngredients={customIngredients}
				customFoods={customFoods}
				selectedIndex={selectedIndex}
				onAdd={addRecipe}
				onRemove={removeRecipe}
				onSelect={setSelectedIndex}
			/>

			<RecipeEditor
				recipe={selectedRecipe}
				recipeIndex={selectedIndex}
				customIngredients={customIngredients}
				customFoods={customFoods}
				onUpdate={(updates: Partial<Recipe>) => {
					updateRecipe(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
