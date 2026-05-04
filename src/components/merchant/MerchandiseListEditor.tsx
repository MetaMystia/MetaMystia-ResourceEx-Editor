import { memo, useCallback } from 'react';

import { Button } from '@/design/ui/components';
import { cn } from '@/design/ui/utils';
import { Label } from '@/components/common/Label';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import { ProductEditor } from './ProductEditor';
import type {
	MerchandiseConfig,
	ProductConfig,
	Food,
	Ingredient,
	Beverage,
	Recipe,
} from '@/types/resource';

interface MerchandiseListEditorProps {
	merchandiseList: MerchandiseConfig[];
	extFoods: Food[];
	extIngredients: Ingredient[];
	extBeverages: Beverage[];
	extRecipes: Recipe[];
	onUpdate: (merchandiseList: MerchandiseConfig[]) => void;
}

const DEFAULT_MERCHANDISE: MerchandiseConfig = {
	item: {
		productType: 'Food',
		productId: 0,
		productAmount: 1,
		productLabel: '',
	},
	itemAmountMin: 1,
	itemAmountMax: 1,
	sellProbability: 1.0,
};

export const MerchandiseListEditor = memo<MerchandiseListEditorProps>(
	function MerchandiseListEditor({
		merchandiseList,
		extFoods,
		extIngredients,
		extBeverages,
		extRecipes,
		onUpdate,
	}) {
		const handleAdd = useCallback(() => {
			onUpdate([...merchandiseList, { ...DEFAULT_MERCHANDISE }]);
		}, [merchandiseList, onUpdate]);

		const handleRemove = useCallback(
			(index: number) => {
				onUpdate(merchandiseList.filter((_, i) => i !== index));
			},
			[merchandiseList, onUpdate]
		);

		const handleUpdateItem = useCallback(
			(index: number, updates: Partial<MerchandiseConfig>) => {
				const newList = [...merchandiseList];
				newList[index] = {
					...newList[index],
					...updates,
				} as MerchandiseConfig;
				onUpdate(newList);
			},
			[merchandiseList, onUpdate]
		);

		const handleUpdateProduct = useCallback(
			(index: number, updates: Partial<ProductConfig>) => {
				const newList = [...merchandiseList];
				const current = newList[index];
				if (!current) return;
				newList[index] = {
					...current,
					item: { ...current.item, ...updates },
				} as MerchandiseConfig;
				onUpdate(newList);
			},
			[merchandiseList, onUpdate]
		);

		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
						商品列表 ({merchandiseList.length})
					</h3>
					<SectionAddButton onPress={handleAdd}>
						添加商品
					</SectionAddButton>
				</div>

				{merchandiseList.length === 0 && (
					<EmptyState
						title="暂无商品"
						description='点击"添加商品"按钮创建'
					/>
				)}

				<div className="flex flex-col gap-4">
					{merchandiseList.length > 0 &&
						merchandiseList.map((merch, index) => (
							<div
								key={index}
								className={cn(
									'group relative flex flex-col gap-3 rounded-xl border border-white/10 bg-black/5 p-4 dark:bg-white/5'
								)}
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-semibold opacity-70">
										商品 #{index + 1}
									</span>
									<Button
										color="danger"
										size="sm"
										radius="full"
										onPress={() => {
											if (
												confirm(
													'确定要删除这个商品吗？'
												)
											) {
												handleRemove(index);
											}
										}}
										className="h-7 min-w-0 px-3 text-xs opacity-0 transition-opacity group-hover:opacity-100"
									>
										删除
									</Button>
								</div>

								{/* Product config */}
								<ProductEditor
									product={merch.item}
									extFoods={extFoods}
									extIngredients={extIngredients}
									extBeverages={extBeverages}
									extRecipes={extRecipes}
									onUpdate={(updates) =>
										handleUpdateProduct(index, updates)
									}
								/>

								{/* Merchandise fields */}
								<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
									<div className="flex flex-col gap-1">
										<Label size="sm">数量范围 (下界)</Label>
										<input
											type="number"
											min={0}
											value={merch.itemAmountMin}
											onChange={(e) =>
												handleUpdateItem(index, {
													itemAmountMin:
														parseInt(
															e.target.value
														) || 0,
												})
											}
											className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<Label size="sm">数量范围 (上界)</Label>
										<input
											type="number"
											min={0}
											value={merch.itemAmountMax}
											onChange={(e) =>
												handleUpdateItem(index, {
													itemAmountMax:
														parseInt(
															e.target.value
														) || 0,
												})
											}
											className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<Label size="sm">出售概率 (0~1)</Label>
										<input
											type="number"
											min={0}
											max={1}
											step={0.01}
											value={merch.sellProbability}
											onChange={(e) =>
												handleUpdateItem(index, {
													sellProbability:
														parseFloat(
															e.target.value
														) || 0,
												})
											}
											className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
										/>
									</div>
								</div>
							</div>
						))}
				</div>

				{/* Bottom add button */}
				{merchandiseList.length > 0 && (
					<button
						onClick={handleAdd}
						className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-black/10 py-3 text-sm opacity-60 transition-all hover:border-primary/50 hover:opacity-100 dark:border-white/10"
					>
						+ 追加商品
					</button>
				)}
			</div>
		);
	}
);
