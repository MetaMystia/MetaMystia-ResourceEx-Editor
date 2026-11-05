import { BEVERAGE_NAMES } from '@/domain/data/beverages';
import { FOOD_NAMES } from '@/domain/data/foods';
import { INGREDIENT_NAMES } from '@/domain/data/ingredients';
import { RECIPE_NAMES } from '@/domain/data/recipes';
import type { ProductType } from '@/domain/resourcePack/contracts/merchant';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';

export interface IProductIdOption {
	id: number;
	name: string;
	source: '原版' | '扩展';
}

type TExtensionPack = Pick<
	ResourceEx,
	'beverages' | 'foods' | 'ingredients' | 'recipes'
>;

/** 原版与本包的料理、食材、酒水、食谱选项；其他类型没有可选项。 */
export function getProductIdOptions(
	productType: ProductType,
	pack: TExtensionPack
): IProductIdOption[] {
	switch (productType) {
		case 'Food':
			return [
				...FOOD_NAMES.map(({ id, name }) => ({
					id,
					name,
					source: '原版' as const,
				})),
				...pack.foods.map(({ id, name }) => ({
					id,
					name,
					source: '扩展' as const,
				})),
			];
		case 'Ingredient':
			return [
				...INGREDIENT_NAMES.map(({ id, name }) => ({
					id,
					name,
					source: '原版' as const,
				})),
				...pack.ingredients.map(({ id, name }) => ({
					id,
					name,
					source: '扩展' as const,
				})),
			];
		case 'Beverage':
			return [
				...BEVERAGE_NAMES.map(({ id, name }) => ({
					id,
					name,
					source: '原版' as const,
				})),
				...pack.beverages.map(({ id, name }) => ({
					id,
					name,
					source: '扩展' as const,
				})),
			];
		case 'Recipe':
			return [
				...RECIPE_NAMES.map(({ id, name }) => ({
					id,
					name,
					source: '原版' as const,
				})),
				...pack.recipes.map(({ id, foodId }) => ({
					id,
					name:
						pack.foods.find((food) => food.id === foodId)?.name ||
						`食谱#${id}`,
					source: '扩展' as const,
				})),
			];
		default:
			return [];
	}
}
