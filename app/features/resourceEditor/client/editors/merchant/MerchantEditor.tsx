import { cn } from '@heroui/theme';
import { memo, useCallback, useId, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Input from '@/design/ui/components/input';

import type { Character } from '@/domain/resourcePack/contracts/character';
import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';
import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';
import type {
	MerchandiseConfig,
	MerchantConfig,
} from '@/domain/resourcePack/contracts/merchant';

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

import { MerchandiseListEditor } from './MerchandiseListEditor';

interface MerchantEditorProps {
	merchant: MerchantConfig | null;
	allCharacters: Character[];
	allDialogPackages: DialogPackage[];
	extFoods: Food[];
	extIngredients: Ingredient[];
	extBeverages: Beverage[];
	extRecipes: Recipe[];
	onUpdate: (updates: Partial<MerchantConfig>) => void;
}

export const MerchantEditor = memo<MerchantEditorProps>(
	function MerchantEditor({
		merchant,
		allCharacters,
		allDialogPackages,
		extFoods,
		extIngredients,
		extBeverages,
		extRecipes,
		onUpdate,
	}) {
		const idKey = useId();
		const idPriceMin = useId();
		const idPriceMax = useId();
		const idLeastSellNum = useId();

		const characterItems = useMemo<SelectItemSpec<string>[]>(() => {
			return allCharacters.map((char) => ({
				value: char.label,
				label: `${char.name}（${char.label}）`,
			}));
		}, [allCharacters]);

		const handleWelcomeDialogAdd = useCallback(
			(name: string) => {
				if (!merchant || !name) return;
				if (merchant.welcomeDialogPackageNames.includes(name)) return;
				onUpdate({
					welcomeDialogPackageNames: [
						...merchant.welcomeDialogPackageNames,
						name,
					],
				});
			},
			[merchant, onUpdate]
		);

		const handleWelcomeDialogRemove = useCallback(
			(index: number) => {
				if (!merchant) return;
				onUpdate({
					welcomeDialogPackageNames:
						merchant.welcomeDialogPackageNames.filter(
							(_, i) => i !== index
						),
				});
			},
			[merchant, onUpdate]
		);

		const handleNullDialogAdd = useCallback(
			(name: string) => {
				if (!merchant || !name) return;
				if (merchant.nullDialogPackageNames.includes(name)) return;
				onUpdate({
					nullDialogPackageNames: [
						...merchant.nullDialogPackageNames,
						name,
					],
				});
			},
			[merchant, onUpdate]
		);

		const handleNullDialogRemove = useCallback(
			(index: number) => {
				if (!merchant) return;
				onUpdate({
					nullDialogPackageNames:
						merchant.nullDialogPackageNames.filter(
							(_, i) => i !== index
						),
				});
			},
			[merchant, onUpdate]
		);

		const handleMerchandiseUpdate = useCallback(
			(merchandise: MerchandiseConfig[]) => {
				onUpdate({ merchandise });
			},
			[onUpdate]
		);

		if (!merchant) {
			return <EditorDetailEmptyState itemLabel="商人" />;
		}
		const isPriceRangeInvalid =
			!Number.isFinite(merchant.priceMultiplierMin) ||
			merchant.priceMultiplierMin < 0 ||
			!Number.isFinite(merchant.priceMultiplierMax) ||
			merchant.priceMultiplierMax < merchant.priceMultiplierMin;
		const isLeastSellNumInvalid =
			!Number.isInteger(merchant.leastSellNum) ||
			merchant.leastSellNum < 1;

		return (
			<EditorDetailPanel>
				<EditorDetailHeader title="商人编辑" />

				<EditorSection title="基本信息">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{/* Key - Character select */}
						<div className="flex flex-col gap-1 md:col-span-2">
							<Label htmlFor={idKey}>角色（key）</Label>
							<Select<string>
								id={idKey}
								ariaLabel="角色"
								value={merchant.key}
								onChange={(v) => onUpdate({ key: v })}
								items={characterItems}
							/>
						</div>

						{/* Price Multiplier Min/Max */}
						<div className="flex flex-col gap-1">
							<Label htmlFor={idPriceMin}>价格倍率（下界）</Label>
							<Input
								id={idPriceMin}
								type="number"
								min={0}
								step={0.01}
								value={String(merchant.priceMultiplierMin)}
								isInvalid={isPriceRangeInvalid}
								onChange={(e) => {
									const value = parseFloat(e.target.value);
									onUpdate({
										priceMultiplierMin: Number.isNaN(value)
											? 1
											: value,
									});
								}}
							/>
						</div>
						<div className="flex flex-col gap-1">
							<Label htmlFor={idPriceMax}>价格倍率（上界）</Label>
							<Input
								id={idPriceMax}
								type="number"
								min={0}
								step={0.01}
								value={String(merchant.priceMultiplierMax)}
								isInvalid={isPriceRangeInvalid}
								onChange={(e) => {
									const value = parseFloat(e.target.value);
									onUpdate({
										priceMultiplierMax: Number.isNaN(value)
											? 1
											: value,
									});
								}}
							/>
						</div>

						{/* Least Sell Num */}
						<div className="flex flex-col gap-1">
							<Label htmlFor={idLeastSellNum}>最低出售数量</Label>
							<Input
								id={idLeastSellNum}
								type="number"
								min={1}
								value={String(merchant.leastSellNum)}
								isInvalid={isLeastSellNumInvalid}
								onChange={(e) =>
									onUpdate({
										leastSellNum:
											parseInt(e.target.value) || 1,
									})
								}
							/>
						</div>
					</div>
				</EditorSection>

				<EditorSection title="欢迎对话包（welcomeDialogPackageNames）">
					<DialogPackageArrayField
						dialogs={merchant.welcomeDialogPackageNames}
						allDialogPackages={allDialogPackages}
						onAdd={handleWelcomeDialogAdd}
						onRemove={handleWelcomeDialogRemove}
					/>
				</EditorSection>

				<EditorSection title="售罄对话包（nullDialogPackageNames）">
					<DialogPackageArrayField
						dialogs={merchant.nullDialogPackageNames}
						allDialogPackages={allDialogPackages}
						onAdd={handleNullDialogAdd}
						onRemove={handleNullDialogRemove}
					/>
				</EditorSection>

				<MerchandiseListEditor
					merchandiseList={merchant.merchandise}
					extFoods={extFoods}
					extIngredients={extIngredients}
					extBeverages={extBeverages}
					extRecipes={extRecipes}
					onUpdate={handleMerchandiseUpdate}
				/>
			</EditorDetailPanel>
		);
	}
);

/* ── Inline sub-component for dialog package arrays ── */

interface DialogPackageArrayFieldProps {
	dialogs: string[];
	allDialogPackages: DialogPackage[];
	onAdd: (name: string) => void;
	onRemove: (index: number) => void;
}

const DialogPackageArrayField = memo<DialogPackageArrayFieldProps>(
	function DialogPackageArrayField({
		dialogs,
		allDialogPackages,
		onAdd,
		onRemove,
	}) {
		const [selectedValue, setSelectedValue] = useState<string>('');

		const dialogItems = useMemo<SelectItemSpec<string>[]>(() => {
			return allDialogPackages.map((d) => ({
				value: d.name,
				label: d.name,
				isDisabled: dialogs.includes(d.name),
			}));
		}, [allDialogPackages, dialogs]);

		const handleAdd = useCallback(
			(value: string) => {
				if (value) {
					onAdd(value);
					setSelectedValue('');
				}
			},
			[onAdd]
		);

		return (
			<div className="flex flex-col gap-2">
				{dialogs.length === 0 && (
					<EmptyState variant="text" title="暂无已选对话包" />
				)}
				{dialogs.length > 0 && (
					<div className="flex flex-col gap-1">
						{dialogs.map((name, idx) => (
							<div
								key={idx}
								className="flex min-w-0 items-center justify-between rounded-medium border border-divider bg-content1/50 px-3 py-2"
							>
								<span
									title={name}
									className={cn(
										TYPOGRAPHY_STYLES.codeBody,
										'truncate'
									)}
								>
									{name}
								</span>
								<SectionDeleteButton
									iconOnly
									onPress={() => onRemove(idx)}
									className="ml-2 shrink-0"
								>
									移除对话包
								</SectionDeleteButton>
							</div>
						))}
					</div>
				)}
				<Select<string>
					value={selectedValue}
					onChange={handleAdd}
					placeholder="添加对话包…"
					items={dialogItems}
				/>
			</div>
		);
	}
);
