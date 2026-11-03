import { useMemo } from 'react';

import { BEVERAGE_NAMES } from '@/domain/data/beverages';
import { FOOD_NAMES } from '@/domain/data/foods';
import { INGREDIENT_NAMES } from '@/domain/data/ingredients';
import { RECIPE_NAMES } from '@/domain/data/recipes';
import { SPECIAL_GUESTS } from '@/domain/data/specialGuest';
import type { Character } from '@/domain/resourcePack/contracts/character';
import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';

interface INamedId {
	id: number;
	name: string;
}

interface IUseRewardOptionsInput {
	beverages: readonly Beverage[];
	characters: readonly Character[];
	foods: readonly Food[];
	ingredients: readonly Ingredient[];
	recipes: readonly Recipe[];
}

/** 游戏内容与本包内容合并后的选项，供任务条件与奖励选择。 */
export function useRewardOptions({
	beverages,
	characters,
	foods,
	ingredients,
	recipes,
}: IUseRewardOptionsInput) {
	const allFoods = useMemo(() => {
		const result: INamedId[] = [...FOOD_NAMES];
		foods.forEach((f) => {
			if (!result.find((r) => r.id === f.id)) {
				result.push({ id: f.id, name: f.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [foods]);

	const allIngredients = useMemo(() => {
		const result: INamedId[] = [...INGREDIENT_NAMES];
		ingredients.forEach((i) => {
			if (!result.find((r) => r.id === i.id)) {
				result.push({ id: i.id, name: i.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [ingredients]);

	const allBeverages = useMemo(() => {
		const result: INamedId[] = [...BEVERAGE_NAMES];
		beverages.forEach((b) => {
			if (!result.find((r) => r.id === b.id)) {
				result.push({ id: b.id, name: b.name });
			}
		});
		return result.sort((a, b) => a.id - b.id);
	}, [beverages]);

	const allRecipes = useMemo(() => {
		const result: INamedId[] = [...RECIPE_NAMES];
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
		SPECIAL_GUESTS.forEach((g) => {
			options.push({
				value: g.label,
				label: `[${g.id}] ${g.name}（${g.label}）`,
			});
		});
		characters.forEach((c) => {
			options.push({
				value: c.label,
				label: `[${c.id}] ${c.name}（${c.label}）`,
			});
		});
		return options;
	}, [characters]);

	return {
		allBeverages,
		allFoods,
		allIngredients,
		allRecipes,
		characterOptions,
	};
}
