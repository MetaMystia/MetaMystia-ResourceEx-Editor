import { memo, useCallback, useMemo } from 'react';

import { Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import { Label } from '@/components/common/Label';
import { WarningNotice } from '@/components/common/WarningNotice';
import type {
	ProductConfig,
	ProductType,
	Food,
	Ingredient,
	Beverage,
	Recipe,
} from '@/types/resource';

import { FOOD_NAMES } from '@/data/foods';
import { INGREDIENT_NAMES } from '@/data/ingredients';
import { BEVERAGE_NAMES } from '@/data/beverages';
import { RECIPE_NAMES } from '@/data/recipes';

const ALL_PRODUCT_TYPES: { value: ProductType; label: string }[] = [
	{ value: 'Food', label: 'Food' },
	{ value: 'Ingredient', label: 'Ingredient' },
	{ value: 'Beverage', label: 'Beverage' },
	{ value: 'Recipe', label: 'Recipe' },
	{ value: 'Money', label: 'Money' },
	{ value: 'Mission', label: 'Mission' },
	{ value: 'Item', label: 'Item' },
	{ value: 'Izakaya', label: 'Izakaya' },
	{ value: 'Cooker', label: 'Cooker' },
	{ value: 'Partner', label: 'Partner' },
	{ value: 'Badge', label: 'Badge' },
	{ value: 'Trophy', label: 'Trophy' },
];

const SUPPORTED_TYPES: ProductType[] = [
	'Food',
	'Ingredient',
	'Beverage',
	'Recipe',
];

interface ProductEditorProps {
	product: ProductConfig;
	extFoods: Food[];
	extIngredients: Ingredient[];
	extBeverages: Beverage[];
	extRecipes: Recipe[];
	onUpdate: (updates: Partial<ProductConfig>) => void;
}

export const ProductEditor = memo<ProductEditorProps>(function ProductEditor({
	product,
	extFoods,
	extIngredients,
	extBeverages,
	extRecipes,
	onUpdate,
}) {
	const isSupported = SUPPORTED_TYPES.includes(product.productType);

	const idOptions = useMemo(() => {
		switch (product.productType) {
			case 'Food': {
				const gameItems = FOOD_NAMES.map((f) => ({
					id: f.id,
					name: f.name,
					source: '原版',
				}));
				const extItems = extFoods.map((f) => ({
					id: f.id,
					name: f.name,
					source: '扩展',
				}));
				return [...gameItems, ...extItems];
			}
			case 'Ingredient': {
				const gameItems = INGREDIENT_NAMES.map((i) => ({
					id: i.id,
					name: i.name,
					source: '原版',
				}));
				const extItems = extIngredients.map((i) => ({
					id: i.id,
					name: i.name,
					source: '扩展',
				}));
				return [...gameItems, ...extItems];
			}
			case 'Beverage': {
				const gameItems = BEVERAGE_NAMES.map((b) => ({
					id: b.id,
					name: b.name,
					source: '原版',
				}));
				const extItems = extBeverages.map((b) => ({
					id: b.id,
					name: b.name,
					source: '扩展',
				}));
				return [...gameItems, ...extItems];
			}
			case 'Recipe': {
				const gameItems = RECIPE_NAMES.map((r) => {
					const foodName =
						FOOD_NAMES.find((f) => f.id === r.id)?.name || r.name;
					return { id: r.id, name: `${foodName}`, source: '原版' };
				});
				const extItems = extRecipes.map((r) => {
					const foodName =
						extFoods.find((f) => f.id === r.foodId)?.name ||
						`菜谱#${r.id}`;
					return { id: r.id, name: `${foodName}`, source: '扩展' };
				});
				return [...gameItems, ...extItems];
			}
			default:
				return [];
		}
	}, [
		product.productType,
		extFoods,
		extIngredients,
		extBeverages,
		extRecipes,
	]);

	const typeItems = useMemo<SelectItemSpec<ProductType>[]>(() => {
		return ALL_PRODUCT_TYPES.map((type) => ({
			value: type.value,
			label: `${type.label}${!SUPPORTED_TYPES.includes(type.value) ? ' (暂未实现)' : ''}`,
			isDisabled: !SUPPORTED_TYPES.includes(type.value),
		}));
	}, []);

	const idItems = useMemo<SelectItemSpec<number>[]>(() => {
		if (idOptions.length === 0) {
			return [{ value: 0, label: '暂无可选项', isDisabled: true }];
		}

		return idOptions.map((opt) => ({
			value: opt.id,
			label: `[${opt.id}] ${opt.name}`,
		}));
	}, [idOptions]);

	const handleTypeChange = useCallback(
		(type: ProductType) => {
			onUpdate({
				productType: type,
				productId: 0,
				productAmount: 1,
				productLabel: '',
			});
		},
		[onUpdate]
	);

	return (
		<div className="flex flex-col gap-3 rounded-lg bg-black/5 p-3 dark:bg-white/5">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{/* Product Type */}
				<div className="flex flex-col gap-1">
					<Label size="sm">商品类型</Label>
					<Select<ProductType>
						value={product.productType}
						onChange={handleTypeChange}
						placeholder="请选择商品类型"
						items={typeItems}
					/>
				</div>

				{/* Product Amount */}
				<div className="flex flex-col gap-1">
					<Label size="sm">商品数量</Label>
					<input
						type="number"
						value={1}
						disabled
						className="cursor-not-allowed rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm opacity-50"
					/>
				</div>
			</div>

			{!isSupported ? (
				<WarningNotice>
					⚠ 暂不支持配置 {product.productType} 类型商品
				</WarningNotice>
			) : (
				<div className="flex flex-col gap-1">
					<Label size="sm">选择商品 (productId)</Label>
					<Select<number>
						value={product.productId}
						onChange={(value) => onUpdate({ productId: value })}
						placeholder="请选择商品"
						items={idItems}
					/>
				</div>
			)}
		</div>
	);
});
