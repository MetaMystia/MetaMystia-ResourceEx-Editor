import { memo, useCallback, useId, useMemo } from 'react';

import { Button, Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/design/ui/utils';
import { ErrorBadge } from '@/components/common/ErrorBadge';
import { IdRangeBadge } from '@/components/common/IdRangeBadge';
import { Label } from '@/components/common/Label';
import type { Recipe, CookerType } from '@/types/resource';
import { INGREDIENT_NAMES } from '@/data/ingredients';
import { FOOD_NAMES } from '@/data/foods';

interface RecipeEditorProps {
	recipe: Recipe | null;
	recipeIndex: number | null;
	customIngredients: Array<{ id: number; name: string }>;
	customFoods: Array<{ id: number; name: string }>;
	onUpdate: (updates: Partial<Recipe>) => void;
}

const COOKER_TYPES: { value: CookerType; label: string }[] = [
	{ value: 'Pot', label: '煮锅 (Pot)' },
	{ value: 'Grill', label: '烧烤架 (Grill)' },
	{ value: 'Fryer', label: '油锅 (Fryer)' },
	{ value: 'Steamer', label: '蒸锅 (Steamer)' },
	{ value: 'CuttingBoard', label: '料理台 (CuttingBoard)' },
];

export const RecipeEditor = memo<RecipeEditorProps>(function RecipeEditor({
	recipe,
	customIngredients,
	customFoods,
	onUpdate,
}) {
	const idId = useId();
	const idFoodId = useId();
	const idCookTime = useId();
	const idCookerType = useId();

	const isIdTooSmall = recipe && recipe.id < 9000;

	const foodItems = useMemo<SelectItemSpec<number>[]>(() => {
		const sections: SelectItemSpec<number>[] = [
			{
				section: '游戏内料理',
				options: FOOD_NAMES.map((f) => ({
					value: f.id,
					label: `[${f.id}] ${f.name}`,
				})),
			},
		];
		if (customFoods.length > 0) {
			sections.push({
				section: '自定义料理',
				options: customFoods.map((f) => ({
					value: f.id,
					label: `[${f.id}] ${f.name}`,
				})),
			});
		}
		return sections;
	}, [customFoods]);

	const ingredientItems = useMemo<SelectItemSpec<number>[]>(() => {
		const sections: SelectItemSpec<number>[] = [
			{
				section: '游戏内原料',
				options: INGREDIENT_NAMES.map((i) => ({
					value: i.id,
					label: `[${i.id}] ${i.name}`,
				})),
			},
		];
		if (customIngredients.length > 0) {
			sections.push({
				section: '自定义原料',
				options: customIngredients.map((i) => ({
					value: i.id,
					label: `[${i.id}] ${i.name}`,
				})),
			});
		}
		return sections;
	}, [customIngredients]);

	const updateIngredient = useCallback(
		(index: number, value: string) => {
			if (!recipe) return;
			const newIngredients = [...recipe.ingredients];
			const numValue = parseInt(value);
			newIngredients[index] = isNaN(numValue) ? -1 : numValue;
			onUpdate({ ingredients: newIngredients });
		},
		[recipe, onUpdate]
	);

	const addIngredient = useCallback(() => {
		if (!recipe) return;
		if (recipe.ingredients.length >= 5) {
			alert('最多只能添加 5 个原料！');
			return;
		}
		onUpdate({ ingredients: [...recipe.ingredients, -1] });
	}, [recipe, onUpdate]);

	const removeIngredient = useCallback(
		(index: number) => {
			if (!recipe) return;
			const newIngredients = recipe.ingredients.filter(
				(_, i) => i !== index
			);
			onUpdate({ ingredients: newIngredients });
		},
		[recipe, onUpdate]
	);

	if (!recipe) {
		return (
			<div className="col-span-2 flex h-96 items-center justify-center rounded-lg bg-white/10 p-4 shadow-md backdrop-blur">
				<p className="text-center text-black/40 dark:text-white/40">
					请从左侧选择一个菜谱进行编辑
				</p>
			</div>
		);
	}

	return (
		<div className="col-span-2 flex flex-col gap-6 overflow-y-auto rounded-lg bg-white/10 p-6 shadow-md backdrop-blur">
			<div className="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/5">
				<h2 className="text-2xl font-bold">菜谱编辑</h2>
			</div>

			{/* 基本信息 */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
					基本信息
				</h3>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<Label htmlFor={idId}>菜谱ID</Label>
							<div className="flex gap-2">
								{isIdTooSmall && (
									<ErrorBadge>ID需&ge;9000</ErrorBadge>
								)}
								<IdRangeBadge id={recipe.id} />
							</div>
						</div>
						<input
							id={idId}
							type="number"
							value={isNaN(recipe.id) ? '' : recipe.id}
							onChange={(e) =>
								onUpdate({ id: parseInt(e.target.value) })
							}
							className={cn(
								'h-9 w-full rounded-lg border bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:bg-black/10 dark:focus:border-white/30 dark:focus:ring-white/10',
								isIdTooSmall
									? 'border-danger bg-danger text-white opacity-50 focus:border-danger'
									: 'border-black/10 dark:border-white/10'
							)}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idFoodId}>料理ID (Food ID)</Label>
						<Select<number>
							id={idFoodId}
							ariaLabel="料理ID"
							value={recipe.foodId}
							onChange={(v) => onUpdate({ foodId: v })}
							items={foodItems}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idCookTime}>烹饪时间 (Cook Time)</Label>
						<input
							id={idCookTime}
							type="number"
							value={
								isNaN(recipe.cookTime) ? '' : recipe.cookTime
							}
							onChange={(e) =>
								onUpdate({ cookTime: parseInt(e.target.value) })
							}
							className="h-9 w-full rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-black/10 dark:focus:border-white/10 dark:focus:ring-white/10"
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idCookerType}>
							厨具类型 (Cooker Type)
						</Label>
						<Select<CookerType>
							id={idCookerType}
							ariaLabel="厨具类型"
							value={recipe.cookerType}
							onChange={(v) => onUpdate({ cookerType: v })}
							items={COOKER_TYPES.map((c) => ({
								value: c.value,
								label: c.label,
							}))}
						/>
					</div>
				</div>
			</div>

			{/* 原料配置 */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
						原料配置 (最多5个)
					</h3>
					<Button
						color="primary"
						size="sm"
						radius="full"
						onPress={addIngredient}
						isDisabled={recipe.ingredients.length >= 5}
					>
						添加原料
					</Button>
				</div>
				<div className="flex flex-col gap-3">
					{recipe.ingredients.map((ingredientId, index) => (
						<div
							key={index}
							className="flex items-center gap-3 rounded-lg border border-black/10 bg-white/40 p-3 dark:border-white/10 dark:bg-black/10"
						>
							<span className="w-8 text-center text-sm font-medium opacity-60">
								#{index + 1}
							</span>
							<Select<number>
								ariaLabel={`原料 #${index + 1}`}
								className="flex-1"
								value={ingredientId}
								onChange={(v) =>
									updateIngredient(index, String(v))
								}
								items={ingredientItems}
							/>
							<Button
								color="danger"
								size="sm"
								radius="full"
								onPress={() => removeIngredient(index)}
							>
								删除
							</Button>
						</div>
					))}
					{recipe.ingredients.length === 0 && (
						<EmptyState
							title="暂无原料配置"
							description='点击"添加原料"按钮开始配置'
						/>
					)}
				</div>
			</div>
		</div>
	);
});
