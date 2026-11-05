import { cn } from '@heroui/theme';
import { memo, useCallback, useId, useMemo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Input from '@/design/ui/components/input';

import { COOKER_TYPE_NAMES, COOKER_TYPES } from '@/domain/data/cookerTypes';
import { FOOD_NAMES } from '@/domain/data/foods';
import { INGREDIENT_NAMES } from '@/domain/data/ingredients';
import type { CookerType, Recipe } from '@/domain/resourcePack/contracts/items';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import {
	Select,
	type SelectItem as SelectItemSpec,
} from '@/features/resourceEditor/client/components/select/Select';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { IdRangeBadge } from '@/features/resourceEditor/client/editors/info/IdRangeBadge';
import { parseIntegerInput } from '@/features/resourceEditor/client/editorValueAllocation';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';

interface RecipeEditorProps {
	recipe: Recipe | null;
	recipeIndex: number | null;
	customIngredients: Array<{ id: number; name: string }>;
	customFoods: Array<{ id: number; name: string }>;
	onUpdate: (updates: Partial<Recipe>) => void;
}

const COOKER_TYPE_OPTIONS: { value: CookerType; label: string }[] =
	COOKER_TYPES.map((value) => ({
		value,
		label: `${COOKER_TYPE_NAMES[value]}（${value}）`,
	}));

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
	const ingredientListRef = useFocusOnItemAppend(
		recipe?.ingredients.length ?? 0
	);

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
				section: '游戏内食材',
				options: INGREDIENT_NAMES.map((i) => ({
					value: i.id,
					label: `[${i.id}] ${i.name}`,
				})),
			},
		];
		if (customIngredients.length > 0) {
			sections.push({
				section: '自定义食材',
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
		if (recipe.ingredients.length >= 5) return;
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
		return <EditorDetailEmptyState itemLabel="食谱" />;
	}

	return (
		<EditorDetailPanel>
			<EditorDetailHeader title="食谱编辑" />

			<EditorSection title="基本信息">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<Label htmlFor={idId}>食谱ID</Label>
							<div className="flex gap-2">
								{isIdTooSmall && (
									<ErrorBadge>ID需&ge;9000</ErrorBadge>
								)}
								<IdRangeBadge id={recipe.id} />
							</div>
						</div>
						<Input
							id={idId}
							type="number"
							value={isNaN(recipe.id) ? '' : String(recipe.id)}
							onChange={(e) => {
								const value = parseIntegerInput(e.target.value);
								if (value !== null) onUpdate({ id: value });
							}}
							isInvalid={Boolean(isIdTooSmall)}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idFoodId}>料理ID（Food ID）</Label>
						<Select<number>
							id={idFoodId}
							ariaLabel="料理ID"
							value={recipe.foodId}
							onChange={(v) => onUpdate({ foodId: v })}
							items={foodItems}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idCookTime}>
							烹饪时间（Cook Time）
						</Label>
						<Input
							id={idCookTime}
							type="number"
							min={1}
							value={
								isNaN(recipe.cookTime)
									? ''
									: String(recipe.cookTime)
							}
							onChange={(e) => {
								const value = parseIntegerInput(e.target.value);
								if (value !== null)
									onUpdate({ cookTime: value });
							}}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idCookerType}>
							厨具类型（Cooker Type）
						</Label>
						<Select<CookerType>
							id={idCookerType}
							ariaLabel="厨具类型"
							value={recipe.cookerType}
							onChange={(v) => onUpdate({ cookerType: v })}
							items={COOKER_TYPE_OPTIONS}
						/>
					</div>
				</div>
			</EditorSection>

			<EditorSection
				title="食材配置（最多5个）"
				actions={
					<SectionAddButton
						onPress={addIngredient}
						isDisabled={recipe.ingredients.length >= 5}
					>
						添加食材
					</SectionAddButton>
				}
			>
				{recipe.ingredients.length >= 5 && (
					<WarningNotice>已达到最多5个食材的上限。</WarningNotice>
				)}
				<div ref={ingredientListRef} className="flex flex-col gap-3">
					{recipe.ingredients.map((ingredientId, index) => (
						<div
							key={index}
							data-editor-appended-item
							className="flex items-center gap-3 rounded-medium border border-divider bg-content1/50 p-3"
						>
							<span
								className={cn(
									TYPOGRAPHY_STYLES.navigationTitle,
									'w-8 text-center'
								)}
							>
								#{index + 1}
							</span>
							<Select<number>
								ariaLabel={`食材#${index + 1}`}
								baseClassName="flex-1"
								value={ingredientId}
								onChange={(v) =>
									updateIngredient(index, String(v))
								}
								items={ingredientItems}
							/>
							<SectionDeleteButton
								iconOnly
								className="sm:h-10 sm:w-10 sm:rounded-medium"
								onPress={() => removeIngredient(index)}
								aria-label="删除食材"
							/>
						</div>
					))}
					{recipe.ingredients.length === 0 && (
						<EmptyState
							title="暂无食材配置"
							description="点击“添加食材”按钮开始配置。"
						/>
					)}
				</div>
			</EditorSection>
		</EditorDetailPanel>
	);
});
