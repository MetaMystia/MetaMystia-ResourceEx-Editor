import { memo, useCallback, useMemo } from 'react';

import Input from '@/design/ui/components/input';

import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';
import type {
	ProductConfig,
	ProductType,
} from '@/domain/resourcePack/contracts/merchant';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { getProductIdOptions } from '@/features/resourceEditor/client/components/select/productIdOptions';
import { PRODUCT_TYPE_OPTIONS } from '@/features/resourceEditor/client/components/select/productTypeOptions';
import {
	Select,
	type SelectItem as SelectItemSpec,
} from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

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

	const idOptions = useMemo(
		() =>
			getProductIdOptions(product.productType, {
				beverages: extBeverages,
				foods: extFoods,
				ingredients: extIngredients,
				recipes: extRecipes,
			}),
		[
			product.productType,
			extFoods,
			extIngredients,
			extBeverages,
			extRecipes,
		]
	);

	const typeItems = useMemo<SelectItemSpec<ProductType>[]>(() => {
		return PRODUCT_TYPE_OPTIONS.map((type) => ({
			value: type.value,
			label: `${type.label}${!SUPPORTED_TYPES.includes(type.value) ? '（暂未实现）' : ''}`,
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
		<div className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content2/30 p-3">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{/* Product Type */}
				<div className="flex flex-col gap-1">
					<Label size="sm">商品类型</Label>
					<Select<ProductType>
						value={product.productType}
						onChange={handleTypeChange}
						getChangeConfirmation={(nextType, currentType) =>
							nextType !== currentType &&
							(product.productId !== 0 ||
								product.productAmount !== 1 ||
								product.productLabel.trim().length > 0)
								? {
										confirmLabel: '切换类型',
										description:
											'切换商品类型会清空当前已选择的商品及关联配置。',
										title: '确定要切换商品类型吗？',
									}
								: null
						}
						placeholder="请选择商品类型"
						items={typeItems}
					/>
				</div>

				{/* Product Amount */}
				<div className="flex flex-col gap-1">
					<Label size="sm">商品数量</Label>
					<Input isDisabled type="number" value="1" />
				</div>
			</div>

			{!isSupported ? (
				<WarningNotice>
					暂不支持配置{product.productType}类型商品
				</WarningNotice>
			) : (
				<div className="flex flex-col gap-1">
					<Label size="sm">选择商品（productId）</Label>
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
