import { memo, useCallback } from 'react';

import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';

import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';
import type {
	MerchandiseConfig,
	ProductConfig,
} from '@/domain/resourcePack/contracts/merchant';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';

import { ProductEditor } from './ProductEditor';

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
		const merchandiseListRef = useFocusOnItemAppend(merchandiseList.length);

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
			<EditorSection
				title={`商品列表（${merchandiseList.length}）`}
				actions={
					<SectionAddButton onPress={handleAdd}>
						添加商品
					</SectionAddButton>
				}
			>
				{merchandiseList.length === 0 && (
					<EmptyState
						title="暂无商品"
						description="可使用“添加商品”创建第一项"
					/>
				)}

				<div ref={merchandiseListRef} className="flex flex-col gap-4">
					{merchandiseList.length > 0 &&
						merchandiseList.map((merch, index) => (
							<div
								key={index}
								data-editor-appended-item
								className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-4"
							>
								<div className="flex items-center justify-between">
									<Heading as="h4" variant="subsection">
										商品#{index + 1}
									</Heading>
									<SectionDeleteButton
										iconOnly
										confirmTitle="确定要删除这个商品吗？"
										onPress={() => handleRemove(index)}
									>
										删除商品
									</SectionDeleteButton>
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
										<Label size="sm">
											数量范围（下界）
										</Label>
										<Input
											type="number"
											min={0}
											value={String(merch.itemAmountMin)}
											isInvalid={
												!Number.isInteger(
													merch.itemAmountMin
												) ||
												merch.itemAmountMin < 0 ||
												merch.itemAmountMin >
													merch.itemAmountMax
											}
											onChange={(e) =>
												handleUpdateItem(index, {
													itemAmountMin:
														parseInt(
															e.target.value
														) || 0,
												})
											}
										/>
									</div>
									<div className="flex flex-col gap-1">
										<Label size="sm">
											数量范围（上界）
										</Label>
										<Input
											type="number"
											min={0}
											value={String(merch.itemAmountMax)}
											isInvalid={
												!Number.isInteger(
													merch.itemAmountMax
												) ||
												merch.itemAmountMax <
													merch.itemAmountMin
											}
											onChange={(e) =>
												handleUpdateItem(index, {
													itemAmountMax:
														parseInt(
															e.target.value
														) || 0,
												})
											}
										/>
									</div>
									<div className="flex flex-col gap-1">
										<Label size="sm">
											出售概率（0～1）
										</Label>
										<Input
											type="number"
											min={0}
											max={1}
											step={0.01}
											value={String(
												merch.sellProbability
											)}
											isInvalid={
												!Number.isFinite(
													merch.sellProbability
												) ||
												merch.sellProbability < 0 ||
												merch.sellProbability > 1
											}
											onChange={(e) =>
												handleUpdateItem(index, {
													sellProbability:
														parseFloat(
															e.target.value
														) || 0,
												})
											}
										/>
									</div>
								</div>
							</div>
						))}
				</div>

				{/* Bottom add button */}
				{merchandiseList.length > 0 && (
					<SectionAddButton onPress={handleAdd} className="w-full">
						追加商品
					</SectionAddButton>
				)}
			</EditorSection>
		);
	}
);
