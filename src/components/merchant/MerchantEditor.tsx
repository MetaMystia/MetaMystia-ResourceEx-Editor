import { memo, useCallback, useId, useMemo, useState } from 'react';

import { Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import { Button } from '@/design/ui/components';
import { Label } from '@/components/common/Label';
import { MerchandiseListEditor } from './MerchandiseListEditor';
import type {
	MerchantConfig,
	MerchandiseConfig,
	Character,
	DialogPackage,
	Food,
	Ingredient,
	Beverage,
	Recipe,
} from '@/types/resource';

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
				label: `${char.name} (${char.label})`,
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
			return (
				<div className="col-span-2 flex h-96 items-center justify-center rounded-lg bg-white/10 p-4 shadow-md backdrop-blur">
					<p className="text-center text-black/40 dark:text-white/40">
						请从左侧选择一个商人进行编辑
					</p>
				</div>
			);
		}

		return (
			<div className="col-span-2 flex flex-col gap-6 overflow-y-auto rounded-lg bg-white/10 p-6 font-sans shadow-md backdrop-blur">
				<div className="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/5">
					<h2 className="text-2xl font-bold">商人编辑</h2>
				</div>

				{/* 基本信息 */}
				<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
					<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
						基本信息
					</h3>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{/* Key - Character select */}
						<div className="flex flex-col gap-1 md:col-span-2">
							<Label htmlFor={idKey}>角色 (key)</Label>
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
							<Label htmlFor={idPriceMin}>价格倍率 (下界)</Label>
							<input
								id={idPriceMin}
								type="number"
								min={0}
								step={0.01}
								value={merchant.priceMultiplierMin}
								onChange={(e) =>
									onUpdate({
										priceMultiplierMin:
											parseFloat(e.target.value) || 1,
									})
								}
								className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<Label htmlFor={idPriceMax}>价格倍率 (上界)</Label>
							<input
								id={idPriceMax}
								type="number"
								min={0}
								step={0.01}
								value={merchant.priceMultiplierMax}
								onChange={(e) =>
									onUpdate({
										priceMultiplierMax:
											parseFloat(e.target.value) || 1,
									})
								}
								className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>

						{/* Least Sell Num */}
						<div className="flex flex-col gap-1">
							<Label htmlFor={idLeastSellNum}>最低出售数量</Label>
							<input
								id={idLeastSellNum}
								type="number"
								min={1}
								value={merchant.leastSellNum}
								onChange={(e) =>
									onUpdate({
										leastSellNum:
											parseInt(e.target.value) || 1,
									})
								}
								className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>
					</div>
				</div>

				{/* 欢迎对话包 */}
				<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
					<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
						欢迎对话包 (welcomeDialogPackageNames)
					</h3>
					<DialogPackageArrayField
						dialogs={merchant.welcomeDialogPackageNames}
						allDialogPackages={allDialogPackages}
						onAdd={handleWelcomeDialogAdd}
						onRemove={handleWelcomeDialogRemove}
					/>
				</div>

				{/* 售罄对话包 */}
				<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
					<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
						售罄对话包 (nullDialogPackageNames)
					</h3>
					<DialogPackageArrayField
						dialogs={merchant.nullDialogPackageNames}
						allDialogPackages={allDialogPackages}
						onAdd={handleNullDialogAdd}
						onRemove={handleNullDialogRemove}
					/>
				</div>

				{/* 商品列表 */}
				<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
					<MerchandiseListEditor
						merchandiseList={merchant.merchandise}
						extFoods={extFoods}
						extIngredients={extIngredients}
						extBeverages={extBeverages}
						extRecipes={extRecipes}
						onUpdate={handleMerchandiseUpdate}
					/>
				</div>
			</div>
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
				{dialogs.length > 0 && (
					<div className="flex flex-col gap-1">
						{dialogs.map((name, idx) => (
							<div
								key={idx}
								className="flex items-center justify-between rounded bg-black/5 px-3 py-2 dark:bg-white/5"
							>
								<span className="truncate font-mono text-sm">
									{name}
								</span>
								<Button
									color="danger"
									size="sm"
									radius="full"
									onPress={() => onRemove(idx)}
									className="ml-2 h-6 min-w-0 shrink-0 px-2 text-xs"
								>
									移除
								</Button>
							</div>
						))}
					</div>
				)}
				<Select<string>
					value={selectedValue}
					onChange={handleAdd}
					placeholder="添加对话包..."
					items={dialogItems}
				/>
			</div>
		);
	}
);
