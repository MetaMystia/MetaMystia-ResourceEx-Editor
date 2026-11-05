import { useId, useMemo } from 'react';

import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import { GIFT_PRODUCT_TYPES } from '@/domain/resourcePack/constants';
import type {
	GiftProductType,
	IGiftConfig,
} from '@/domain/resourcePack/contracts/gift';
import {
	GIFT_PRODUCT_TYPE_LABELS,
	MAX_GIFT_AMOUNT,
	validateGift,
} from '@/domain/resourcePack/giftValidation';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { getProductIdOptions } from '@/features/resourceEditor/client/components/select/productIdOptions';
import { PRODUCT_TYPE_LABELS } from '@/features/resourceEditor/client/components/select/productTypeOptions';
import {
	type ISelectOption,
	Select,
} from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IProps {
	gift: IGiftConfig | null;
	onUpdate: (updates: Partial<IGiftConfig>) => void;
}

export function GiftEditor({ gift, onUpdate }: IProps) {
	const titleId = useId();
	const productFieldId = useId();
	const amountId = useId();
	const dialogId = useId();
	const { resourcePack } = useResourceEditor();
	const productType = gift?.productType;
	const { beverages, clothes, foods, ingredients, recipes } = resourcePack;
	const productItems = useMemo<ISelectOption<number>[]>(() => {
		if (productType === 'Item') {
			return clothes.map((item) => ({
				value: item.id,
				label: `[${item.id}] ${item.name}`,
			}));
		}
		return getProductIdOptions(productType ?? 'Item', {
			beverages,
			foods,
			ingredients,
			recipes,
		}).map((option) => ({
			value: option.id,
			label: `[${option.id}] ${option.name}`,
			description: option.source,
		}));
	}, [productType, beverages, clothes, foods, ingredients, recipes]);
	if (!gift) return <EditorDetailEmptyState itemLabel="礼物" />;
	const issues = validateGift(gift, resourcePack);
	const isInvalid = (field: keyof IGiftConfig) =>
		issues.some(
			(issue) => issue.field === field && issue.severity === 'error'
		);
	const selectedProduct = productItems.find(
		(item) => item.value === gift.productId
	);
	const typeLabel = GIFT_PRODUCT_TYPE_LABELS[gift.productType];
	const localDialog = resourcePack.dialogPackages.find(
		(dialog) => dialog.name === gift.dialogPackageName
	);

	return (
		<EditorDetailPanel>
			<EditorDetailHeader
				title="礼物编辑"
				description="游戏中显示对话，结束后发放所选物品、食谱、料理、酒水或食材。列表顺序就是邮箱中的显示顺序。"
			/>
			<EditorSection title="基本信息">
				<div className="flex flex-col gap-1">
					<Label htmlFor={titleId}>礼物标题（title）</Label>
					<Input
						id={titleId}
						value={gift.title}
						isInvalid={isInvalid('title')}
						onChange={(event) =>
							onUpdate({ title: event.target.value })
						}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<Label tip="Item包含衣服、装饰、唱片等；食谱填写食谱ID，不是料理ID。">
							礼物类型（productType）
						</Label>
						<Select<GiftProductType>
							ariaLabel="礼物类型"
							value={gift.productType}
							items={GIFT_PRODUCT_TYPES.map((type) => ({
								value: type,
								label: PRODUCT_TYPE_LABELS[type],
							}))}
							getChangeConfirmation={(nextType, currentType) =>
								nextType !== currentType &&
								(gift.productId != null ||
									gift.productAmount !== 1)
									? {
											confirmLabel: '切换类型',
											description:
												'切换礼物类型会清空当前已选择的ID和数量。',
											title: '确定要切换礼物类型吗？',
										}
									: null
							}
							onChange={(type) =>
								onUpdate({
									productType: type,
									productId: null,
									productAmount: 1,
								})
							}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label
							htmlFor={amountId}
							tip="食谱只会学会一次，数量固定为1；衣服、装饰和唱片不能叠加，请保持为1。"
						>
							数量（productAmount）
						</Label>
						<Input
							id={amountId}
							type="number"
							step={1}
							min={1}
							max={MAX_GIFT_AMOUNT}
							value={String(gift.productAmount)}
							isDisabled={gift.productType === 'Recipe'}
							isInvalid={isInvalid('productAmount')}
							onChange={(event) => {
								const value = Number(event.target.value);
								if (Number.isFinite(value))
									onUpdate({ productAmount: value });
							}}
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<Label
							htmlFor={productFieldId}
							tip="原版与外部资源包的对象可手填ID。"
						>
							{typeLabel}ID（productId）
						</Label>
						<Input
							id={productFieldId}
							type="number"
							step={1}
							value={
								gift.productId == null
									? ''
									: String(gift.productId)
							}
							isInvalid={isInvalid('productId')}
							onChange={(event) => {
								const raw = event.target.value;
								const value = raw === '' ? null : Number(raw);
								if (value === null || Number.isFinite(value))
									onUpdate({ productId: value });
							}}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label>
							{gift.productType === 'Item'
								? '从本包衣服中选择'
								: `从原版与本包${typeLabel}中选择`}
						</Label>
						<Select<number>
							ariaLabel={`选择${typeLabel}`}
							value={selectedProduct?.value}
							items={productItems}
							isDisabled={productItems.length === 0}
							onChange={(value) => onUpdate({ productId: value })}
						/>
					</div>
				</div>
				<Switch
					isSelected={gift.allowRepeat}
					onValueChange={(allowRepeat) => onUpdate({ allowRepeat })}
				>
					允许重复领取
				</Switch>
				<WarningNotice>
					关闭时，当前已持有同一对象（食谱为已学会）就不再发放；物品移除或料理、酒水、食材用完后可重新领取。衣服、装饰和唱片即使开启重复领取，仍按游戏规则去重。
				</WarningNotice>
			</EditorSection>
			<EditorSection title="绑定对话">
				<Select<string>
					ariaLabel="选择本包对话"
					value={localDialog?.name}
					items={resourcePack.dialogPackages.map((dialog) => ({
						value: dialog.name,
						label: dialog.name,
						description: `${dialog.dialogList.length}条对话`,
					}))}
					placeholder="选择本包对话"
					isDisabled={resourcePack.dialogPackages.length === 0}
					onChange={(dialogPackageName) =>
						onUpdate({ dialogPackageName })
					}
				/>
				<div className="flex flex-col gap-1">
					<Label
						htmlFor={dialogId}
						tip="填写dialogPackages中的name。引用外部对话时，需确保对应ResourceEx包已加载。"
					>
						对话包名称（dialogPackageName）
					</Label>
					<Input
						id={dialogId}
						value={gift.dialogPackageName}
						isInvalid={isInvalid('dialogPackageName')}
						onChange={(event) =>
							onUpdate({ dialogPackageName: event.target.value })
						}
					/>
				</div>
			</EditorSection>
			{issues.length > 0 && (
				<EditorSection title="配置检查">
					<ul className="space-y-2 text-sm">
						{issues.map((issue, index) => (
							<li
								key={index}
								className={
									issue.severity === 'error'
										? 'text-danger'
										: 'text-warning-700 dark:text-warning'
								}
							>
								{issue.message}
							</li>
						))}
					</ul>
				</EditorSection>
			)}
		</EditorDetailPanel>
	);
}
