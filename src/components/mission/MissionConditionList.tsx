import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';

import { Button, Select } from '@/design/ui/components';
import { EditorField } from '@/components/common/EditorField';
import { EmptyState } from '@/components/common/EmptyState';
import { WarningNotice } from '@/components/common/WarningNotice';
import { BEVERAGE_TAGS, FOOD_TAGS } from '@/data/tags';
import type {
	ConditionType,
	MissionCondition,
	MissionNode,
} from '@/types/resource';

// -----------------------------------------------------------------------------
// 常量
// -----------------------------------------------------------------------------

const CONDITION_TYPES: { type: ConditionType; label: string }[] = [
	{ type: 'BillRepayment', label: '【未实现】还债' },
	{ type: 'TalkWithCharacter', label: '【未实现】和角色交谈' },
	{ type: 'InspectInteractable', label: '【未实现】调查白天交互物品' },
	{ type: 'SubmitItem', label: '交付目标物品' },
	{ type: 'ServeInWork', label: '请角色品尝料理' },
	{ type: 'SubmitByTag', label: '交付包含Tag的对应物品' },
	{ type: 'SubmitByTags', label: '交付包含多个Tag的对应物品' },
	{ type: 'SellInWork', label: '【未实现】在工作中售卖料理' },
	{ type: 'SubmitByIngredients', label: '【未实现】交付包含食材的料理' },
	{
		type: 'CompleteSpecifiedFollowingTasks',
		label: '【未实现】完成以下任务中的几个',
	},
	{
		type: 'CompleteSpecifiedFollowingTasksSubCondition',
		label: '【未实现】(完成以下任务中的几个)操作的任务条件',
	},
	{
		type: 'ReachTargetCharacterKisunaLevel',
		label: '【未实现】达到目标角色的羁绊等级LV',
	},
	{
		type: 'FakeMission',
		label: '【未实现】表示某种事情发生(不会自动完成，需要手动完成或者取消计划)',
	},
	{
		type: 'SubmitByAnyOneTag',
		label: '【未实现】交付包含任意一个Tag的对应物品',
	},
	{
		type: 'CompleteSpecifiedFollowingEvents',
		label: '【未实现】完成以下事件中的X(指定数量)个',
	},
	{ type: 'SubmitByLevel', label: '【未实现】交付指定Level的对应物品' },
];

const PRODUCT_TYPES: { value: string; label: string }[] = [
	{ value: 'Food', label: '料理 Food' },
	{ value: 'Ingredient', label: '原料 Ingredient' },
	{ value: 'Beverage', label: '酒水 Beverage' },
	{ value: 'Money', label: 'Money' },
	{ value: 'Mission', label: 'Mission' },
	{ value: 'Item', label: 'Item' },
	{ value: 'Recipe', label: 'Recipe' },
	{ value: 'Izakaya', label: 'Izakaya' },
	{ value: 'Cooker', label: 'Cooker' },
	{ value: 'Partner', label: 'Partner' },
	{ value: 'Badge', label: 'Badge' },
	{ value: 'Trophy', label: 'Trophy' },
];

const SUPPORTED_PRODUCT_TYPES = new Set(['Food', 'Ingredient', 'Beverage']);

const SUPPORTED_CONDITION_TYPES = new Set<ConditionType>([
	'SubmitItem',
	'ServeInWork',
	'SubmitByTag',
	'SubmitByTags',
]);

// -----------------------------------------------------------------------------
// 本地表单原语
// -----------------------------------------------------------------------------

const FIELD_CLASS =
	'rounded border border-black/10 bg-white/50 px-2 py-1 text-sm focus:border-primary focus:outline-none dark:border-white/10 dark:bg-black/50';

interface FieldProps {
	label: string;
	children: ReactNode;
}

function Field({ label, children }: FieldProps) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium opacity-70">{label}</label>
			{children}
		</div>
	);
}

interface SelectOption {
	value: string | number;
	label: string;
}

interface SelectFieldProps {
	label: string;
	value: string | number | undefined;
	options: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	onChange: (value: string) => void;
}

function SelectField({
	label,
	value,
	options,
	placeholder,
	disabled,
	onChange,
}: SelectFieldProps) {
	return (
		<Field label={label}>
			<Select<string>
				ariaLabel={label}
				{...(placeholder !== undefined ? { placeholder } : {})}
				{...(disabled ? { isDisabled: true } : {})}
				value={value !== undefined ? String(value) : ''}
				onChange={(v) => onChange(v)}
				items={options.map((o) => ({
					value: String(o.value),
					label: o.label,
				}))}
			/>
		</Field>
	);
}

interface NumberFieldProps {
	label: string;
	value: number | undefined;
	min?: number;
	defaultValue?: number;
	onChange: (value: number) => void;
}

function NumberField({
	label,
	value,
	min = 0,
	defaultValue = 0,
	onChange,
}: NumberFieldProps) {
	return (
		<Field label={label}>
			<input
				type="number"
				min={min}
				value={value ?? defaultValue}
				onChange={(e) => onChange(Number(e.target.value))}
				className={FIELD_CLASS}
			/>
		</Field>
	);
}

// -----------------------------------------------------------------------------
// 工具
// -----------------------------------------------------------------------------

function toIdOptions(items: { id: number; name: string }[]): SelectOption[] {
	return items.map((it) => ({
		value: it.id,
		label: `[${it.id}] ${it.name}`,
	}));
}

// 在 exactOptionalPropertyTypes 模式下，把 undefined 字段安全地塞入 Partial。
function patch(updates: Record<string, unknown>): Partial<MissionCondition> {
	return updates as Partial<MissionCondition>;
}

// -----------------------------------------------------------------------------
// 条件子编辑器
// -----------------------------------------------------------------------------

interface ConditionEditorContext {
	allFoods: { id: number; name: string }[];
	allIngredients: { id: number; name: string }[];
	allBeverages: { id: number; name: string }[];
	characterOptions: { value: string; label: string }[];
}

interface ConditionEditorProps {
	condition: MissionCondition;
	ctx: ConditionEditorContext;
	onUpdate: (updates: Partial<MissionCondition>) => void;
}

function SubmitItemEditor({ condition, ctx, onUpdate }: ConditionEditorProps) {
	const productType = condition.productType;
	const isSupported =
		!productType || SUPPORTED_PRODUCT_TYPES.has(productType);

	const idLabel = `Product ID (${productType || 'Food'})`;
	const idOptions =
		productType === 'Ingredient'
			? toIdOptions(ctx.allIngredients)
			: productType === 'Beverage'
				? toIdOptions(ctx.allBeverages)
				: toIdOptions(ctx.allFoods);
	const idPlaceholder =
		productType === 'Ingredient'
			? '请选择食材...'
			: productType === 'Beverage'
				? '请选择酒水...'
				: '请选择料理...';

	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="Product Type"
				value={productType}
				placeholder="请选择类型..."
				options={PRODUCT_TYPES}
				onChange={(v) =>
					onUpdate(patch({ productType: v || undefined }))
				}
			/>
			{!isSupported && (
				<WarningNotice>
					⚠ 当前编辑器尚未支持配置此条件的详细参数
				</WarningNotice>
			)}
			{isSupported && (
				<>
					<SelectField
						label={idLabel}
						value={condition.productId ?? ''}
						placeholder={idPlaceholder}
						options={idOptions}
						onChange={(v) =>
							onUpdate(
								patch({
									productId: v === '' ? undefined : Number(v),
								})
							)
						}
					/>
					<NumberField
						label="Amount"
						min={1}
						defaultValue={1}
						value={condition.productAmount}
						onChange={(v) => onUpdate({ productAmount: v })}
					/>
				</>
			)}
		</div>
	);
}

function ServeInWorkEditor({ condition, ctx, onUpdate }: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="Sellable Type"
				value={condition.sellableType || 'Food'}
				disabled
				options={[
					{ value: 'Food', label: 'Food' },
					{ value: 'Beverage', label: 'Beverage' },
				]}
				onChange={() => {}}
			/>
			<SelectField
				label="目标角色 (Label)"
				value={condition.label}
				placeholder="请选择角色..."
				options={ctx.characterOptions}
				onChange={(v) => onUpdate({ label: v })}
			/>
			<SelectField
				label="指定料理 (Food ID)"
				value={condition.amount ?? ''}
				placeholder="请选择料理..."
				options={toIdOptions(ctx.allFoods)}
				onChange={(v) =>
					onUpdate(
						patch({ amount: v === '' ? undefined : Number(v) })
					)
				}
			/>
		</div>
	);
}

function SubmitByTagEditor({ condition, onUpdate }: ConditionEditorProps) {
	const sellableType = condition.sellableType || 'Food';
	const tagOptions = sellableType === 'Food' ? FOOD_TAGS : BEVERAGE_TAGS;

	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="Sellable Type"
				value={sellableType}
				options={[
					{ value: 'Food', label: '料理 Food' },
					{ value: 'Beverage', label: '酒水 Beverage' },
				]}
				onChange={(v) =>
					onUpdate({ sellableType: v as 'Food' | 'Beverage', tag: 0 })
				}
			/>
			<SelectField
				label="Tag"
				value={condition.tag ?? 0}
				options={toIdOptions(tagOptions)}
				onChange={(v) => onUpdate({ tag: Number(v) })}
			/>
			<NumberField
				label="Amount"
				value={condition.amount}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function SubmitByTagsEditor({ condition, onUpdate }: ConditionEditorProps) {
	const sellableType = condition.sellableType || 'Food';
	const tagPool = sellableType === 'Food' ? FOOD_TAGS : BEVERAGE_TAGS;
	const tags = condition.tags ?? [];

	const toggleTag = (id: number, checked: boolean) => {
		const next = checked
			? Array.from(new Set([...tags, id])).sort((a, b) => a - b)
			: tags.filter((t) => t !== id);
		onUpdate({ tags: next });
	};

	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="Sellable Type"
				value={sellableType}
				options={[
					{ value: 'Food', label: '料理 Food' },
					{ value: 'Beverage', label: '酒水 Beverage' },
				]}
				onChange={(v) =>
					onUpdate({
						sellableType: v as 'Food' | 'Beverage',
						tags: [],
					})
				}
			/>
			<Field label={`Tags (已选 ${tags.length})`}>
				<div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded border border-black/10 bg-white/50 p-2 dark:border-white/10 dark:bg-black/50">
					{tagPool.map((t) => {
						const checked = tags.includes(t.id);
						return (
							<label
								key={t.id}
								className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition ${
									checked
										? 'bg-primary/20 text-primary'
										: 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'
								}`}
							>
								<input
									type="checkbox"
									className="h-3 w-3"
									checked={checked}
									onChange={(e) =>
										toggleTag(t.id, e.target.checked)
									}
								/>
								<span>
									[{t.id}] {t.name}
								</span>
							</label>
						);
					})}
				</div>
			</Field>
			<NumberField
				label="Amount"
				value={condition.amount}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

const CONDITION_EDITORS: Partial<
	Record<ConditionType, (props: ConditionEditorProps) => ReactNode>
> = {
	SubmitItem: SubmitItemEditor,
	ServeInWork: ServeInWorkEditor,
	SubmitByTag: SubmitByTagEditor,
	SubmitByTags: SubmitByTagsEditor,
};

// -----------------------------------------------------------------------------
// 单条条件项
// -----------------------------------------------------------------------------

interface ConditionItemProps {
	condition: MissionCondition;
	ctx: ConditionEditorContext;
	onUpdate: (updates: Partial<MissionCondition>) => void;
	onRemove: () => void;
}

function ConditionItem({
	condition,
	ctx,
	onUpdate,
	onRemove,
}: ConditionItemProps) {
	const Editor = CONDITION_EDITORS[condition.conditionType];
	const isSupported = SUPPORTED_CONDITION_TYPES.has(condition.conditionType);

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-black/5 bg-black/5 p-4 dark:border-white/5 dark:bg-white/5">
			<div className="flex items-center justify-between gap-4">
				<Select<ConditionType>
					ariaLabel="Condition Type"
					className="flex-1"
					value={condition.conditionType}
					onChange={(v) => onUpdate({ conditionType: v })}
					items={CONDITION_TYPES.map((t) => ({
						value: t.type,
						label: `${t.label} (${t.type})`,
					}))}
				/>
				<Button
					variant="light"
					size="sm"
					onPress={onRemove}
					className="text-xs text-danger hover:bg-danger/10"
				>
					删除
				</Button>
			</div>

			{Editor && (
				<Editor condition={condition} ctx={ctx} onUpdate={onUpdate} />
			)}
			{!isSupported && (
				<WarningNotice>
					⚠ 当前编辑器尚未支持配置此条件的详细参数
				</WarningNotice>
			)}
		</div>
	);
}

// -----------------------------------------------------------------------------
// 主组件
// -----------------------------------------------------------------------------

interface MissionConditionListProps {
	mission: MissionNode;
	characterOptions: { value: string; label: string }[];
	allFoods: { id: number; name: string }[];
	allIngredients: { id: number; name: string }[];
	allBeverages: { id: number; name: string }[];
	onUpdate: (updates: Partial<MissionNode>) => void;
}

export const MissionConditionList = memo<MissionConditionListProps>(
	function MissionConditionList({
		mission,
		characterOptions,
		allFoods,
		allIngredients,
		allBeverages,
		onUpdate,
	}) {
		const conditions = mission.finishConditions ?? [];

		const addCondition = useCallback(() => {
			onUpdate({
				finishConditions: [
					...conditions,
					{ conditionType: 'ServeInWork', sellableType: 'Food' },
				],
			});
		}, [conditions, onUpdate]);

		const removeCondition = useCallback(
			(index: number) => {
				onUpdate({
					finishConditions: conditions.filter((_, i) => i !== index),
				});
			},
			[conditions, onUpdate]
		);

		const updateCondition = useCallback(
			(index: number, updates: Partial<MissionCondition>) => {
				const next = [...conditions];
				next[index] = {
					...next[index],
					...updates,
				} as MissionCondition;
				onUpdate({ finishConditions: next });
			},
			[conditions, onUpdate]
		);

		const ctx: ConditionEditorContext = {
			allFoods,
			allIngredients,
			allBeverages,
			characterOptions,
		};

		return (
			<EditorField
				className="gap-4"
				label={`Finish Conditions (${conditions.length})`}
				actions={
					<Button
						color="primary"
						size="sm"
						onPress={addCondition}
						className="h-8 px-3 text-sm"
					>
						+ 添加完成条件
					</Button>
				}
			>
				<div className="flex flex-col gap-3">
					{conditions.map((condition, index) => (
						<ConditionItem
							key={index}
							condition={condition}
							ctx={ctx}
							onUpdate={(updates) =>
								updateCondition(index, updates)
							}
							onRemove={() => removeCondition(index)}
						/>
					))}
					{conditions.length === 0 && (
						<EmptyState variant="text" title="暂无完成条件" />
					)}
				</div>
			</EditorField>
		);
	}
);
