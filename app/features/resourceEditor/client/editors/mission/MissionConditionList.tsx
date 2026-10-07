import { memo, type ReactNode, useCallback, useId } from 'react';

import Input from '@/design/ui/components/input';

import { BEVERAGE_TAGS, FOOD_TAGS } from '@/domain/data/tags';
import type { EventNode } from '@/domain/resourcePack/contracts/event';
import type {
	ConditionType,
	MissionCondition,
	MissionNode,
} from '@/domain/resourcePack/contracts/mission';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { PRODUCT_TYPE_OPTIONS } from '@/features/resourceEditor/client/components/select/productTypeOptions';
import {
	type ISelectChangeConfirmation,
	Select,
} from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { TagsField } from '@/features/resourceEditor/client/components/tags/TagsField';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';

import {
	createMissionCondition,
	createMissionTimeLimit,
} from './missionEditorValues';

// -----------------------------------------------------------------------------
// 常量
// -----------------------------------------------------------------------------

const CONDITION_TYPES: { type: ConditionType; label: string }[] = [
	{ type: 'BillRepayment', label: '还债' },
	{ type: 'TalkWithCharacter', label: '和角色交谈' },
	{ type: 'InspectInteractable', label: '调查白天交互物品' },
	{ type: 'SubmitItem', label: '交付目标物品' },
	{ type: 'ServeInWork', label: '请角色品尝料理' },
	{ type: 'SubmitByTag', label: '交付包含标签的对应物品' },
	{ type: 'SubmitByTags', label: '交付包含多个标签的对应物品' },
	{ type: 'SellInWork', label: '营业售卖记录' },
	{ type: 'SubmitByIngredients', label: '交付包含食材的料理' },
	{
		type: 'CompleteSpecifiedFollowingTasks',
		label: '【未实现】完成以下任务中的几个',
	},
	{
		type: 'CompleteSpecifiedFollowingTasksSubCondition',
		label: '【未实现】（完成以下任务中的几个）操作的任务条件',
	},
	{
		type: 'ReachTargetCharacterKisunaLevel',
		label: '达到目标角色的指定羁绊等级',
	},
	{ type: 'FakeMission', label: '等待外部信号' },
	{ type: 'SubmitByAnyOneTag', label: '交付包含其中任意一个标签的对应物品' },
	{ type: 'CompleteSpecifiedFollowingEvents', label: '完成指定数量的事件' },
	{ type: 'SubmitByLevel', label: '【未实现】交付指定等级的对应物品' },
];

const SUPPORTED_PRODUCT_TYPES = new Set(['Food', 'Ingredient', 'Beverage']);

const SUPPORTED_CONDITION_TYPES = new Set<ConditionType>([
	'InspectInteractable',
	'SellInWork',
	'FakeMission',
	'CompleteSpecifiedFollowingEvents',
	'SubmitItem',
	'ServeInWork',
	'SubmitByTag',
	'SubmitByTags',
	'SubmitByAnyOneTag',
	'SubmitByIngredients',
	'ReachTargetCharacterKisunaLevel',
	'BillRepayment',
	'TalkWithCharacter',
]);

// -----------------------------------------------------------------------------
// 本地表单原语
// -----------------------------------------------------------------------------

interface FieldProps {
	label: string;
	children: ReactNode;
}

function Field({ label, children }: FieldProps) {
	return (
		<div className="flex flex-col gap-1">
			<Label size="sm">{label}</Label>
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
	options: readonly SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	getChangeConfirmation?: (
		nextValue: string,
		currentValue: string | undefined
	) => ISelectChangeConfirmation | null;
	onChange: (value: string) => void;
}

function SelectField({
	label,
	value,
	options,
	placeholder,
	disabled,
	getChangeConfirmation,
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
				{...(getChangeConfirmation ? { getChangeConfirmation } : {})}
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
	max?: number;
	defaultValue?: number;
	onChange: (value: number) => void;
}

function NumberField({
	label,
	value,
	min = 0,
	max,
	defaultValue = 0,
	onChange,
}: NumberFieldProps) {
	return (
		<Field label={label}>
			<Input
				type="number"
				min={min}
				{...(max !== undefined ? { max } : {})}
				value={String(value ?? defaultValue)}
				onChange={(e) => onChange(Number(e.target.value))}
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
	allEvents: EventNode[];
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

function InspectInteractableEditor({
	condition,
	onUpdate,
}: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<Field label="交互物标识（Label）">
				<Input
					aria-label="交互物标识"
					value={condition.label ?? ''}
					onChange={(e) => onUpdate({ label: e.target.value })}
					placeholder="例如 LostBook_Clue"
				/>
			</Field>
			<WarningNotice>
				引用游戏中已有且可触发的白天交互物；填写标识不会创建或开启交互物。
			</WarningNotice>
		</div>
	);
}

function SellInWorkEditor({ condition, ctx, onUpdate }: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="记录销量的料理"
				value={condition.amount ?? ''}
				placeholder="请选择料理…"
				options={toIdOptions(ctx.allFoods)}
				onChange={(v) =>
					onUpdate(
						patch({ amount: v === '' ? undefined : Number(v) })
					)
				}
			/>
			<WarningNotice>
				沿用原版营业销量记录：进入营业阶段即满足此条件，销量单独累计。此处不提供“卖满若干份”的目标。
			</WarningNotice>
		</div>
	);
}

function FakeMissionEditor({ condition, onUpdate }: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<Field label="信号标识（Label）">
				<Input
					aria-label="信号标识"
					value={condition.label ?? ''}
					onChange={(e) => onUpdate({ label: e.target.value })}
					placeholder="使用资源包前缀，例如 _Example_FoundClue"
				/>
			</Field>
			<Field label="条件说明">
				<Input
					aria-label="条件说明"
					value={condition.text ?? ''}
					onChange={(e) => onUpdate({ text: e.target.value })}
					placeholder="例如 找到线索"
				/>
			</Field>
			<WarningNotice>
				任务开始后，在另一个事件或任务的奖励中配置“发送任务完成信号”，填写相同标识即可满足本条件。信号不会补发给尚未开始的任务。
			</WarningNotice>
		</div>
	);
}

function CompleteEventsEditor({
	condition,
	ctx,
	onUpdate,
}: ConditionEditorProps) {
	const events = condition.events ?? [];
	const optionsId = useId();
	const eventListRef = useFocusOnItemAppend(events.length);
	return (
		<div className="flex flex-col gap-3">
			<NumberField
				label="需要完成的事件数"
				min={1}
				defaultValue={1}
				value={condition.amount}
				onChange={(amount) => onUpdate({ amount })}
			/>
			<WarningNotice>
				统计下列事件的原版完成记录。这里只引用事件，不会自动启动事件。
			</WarningNotice>
			<datalist id={optionsId}>
				{ctx.allEvents.map((event) => (
					<option key={event.label} value={event.label}>
						{event.debugLabel || event.label}
					</option>
				))}
			</datalist>
			<div ref={eventListRef} className="flex flex-col gap-3">
				{events.map((event, index) => (
					<div
						key={index}
						data-editor-appended-item
						className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider p-3"
					>
						<Field label={`事件 ${index + 1} 标识`}>
							<Input
								aria-label={`事件 ${index + 1} 标识`}
								list={optionsId}
								value={event.label}
								onChange={(e) =>
									onUpdate({
										events: events.map((entry, i) =>
											i === index
												? {
														...entry,
														label: e.target.value,
													}
												: entry
										),
									})
								}
								placeholder="选择本包事件，或输入原版／依赖包事件标识"
							/>
						</Field>
						<Field label={`事件 ${index + 1} 说明`}>
							<Input
								aria-label={`事件 ${index + 1} 说明`}
								value={event.text}
								onChange={(e) =>
									onUpdate({
										events: events.map((entry, i) =>
											i === index
												? {
														...entry,
														text: e.target.value,
													}
												: entry
										),
									})
								}
								placeholder="显示在任务条件中的文字"
							/>
						</Field>
						<SectionDeleteButton
							aria-label={`删除条件事件 ${index + 1}`}
							onPress={() =>
								onUpdate({
									events: events.filter(
										(_, i) => i !== index
									),
								})
							}
						>
							删除事件
						</SectionDeleteButton>
					</div>
				))}
			</div>
			<SectionAddButton
				onPress={() =>
					onUpdate({ events: [...events, { label: '', text: '' }] })
				}
			>
				添加条件事件
			</SectionAddButton>
		</div>
	);
}

function SubmitItemEditor({ condition, ctx, onUpdate }: ConditionEditorProps) {
	const productType = condition.productType;
	const isSupported =
		!productType || SUPPORTED_PRODUCT_TYPES.has(productType);

	const idLabel = `商品ID（${productType || 'Food'}）`;
	const idOptions =
		productType === 'Ingredient'
			? toIdOptions(ctx.allIngredients)
			: productType === 'Beverage'
				? toIdOptions(ctx.allBeverages)
				: toIdOptions(ctx.allFoods);
	const idPlaceholder =
		productType === 'Ingredient'
			? '请选择食材…'
			: productType === 'Beverage'
				? '请选择酒水…'
				: '请选择料理…';

	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="商品类型（Product Type）"
				value={productType}
				placeholder="请选择类型…"
				options={PRODUCT_TYPE_OPTIONS}
				onChange={(v) =>
					onUpdate(patch({ productType: v || undefined }))
				}
			/>
			{!isSupported && (
				<WarningNotice>
					当前编辑器尚未支持配置此条件的详细参数。
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
						label="数量（Amount）"
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
				label="可交付类型（Sellable Type）"
				value={condition.sellableType || 'Food'}
				disabled
				options={[
					{ value: 'Food', label: '料理（Food）' },
					{ value: 'Beverage', label: '酒水（Beverage）' },
				]}
				onChange={() => {}}
			/>
			<SelectField
				label="目标角色（Label）"
				value={condition.label}
				placeholder="请选择角色…"
				options={ctx.characterOptions}
				onChange={(v) => onUpdate({ label: v })}
			/>
			<SelectField
				label="指定料理（Food ID）"
				value={condition.amount ?? ''}
				placeholder="请选择料理…"
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
				label="可交付类型（Sellable Type）"
				value={sellableType}
				options={[
					{ value: 'Food', label: '料理（Food）' },
					{ value: 'Beverage', label: '酒水（Beverage）' },
				]}
				onChange={(v) =>
					onUpdate({ sellableType: v as 'Food' | 'Beverage', tag: 0 })
				}
				getChangeConfirmation={(nextType, currentType) =>
					nextType !== currentType && Boolean(condition.tag)
						? {
								confirmLabel: '切换类型',
								description:
									'切换可交付类型会清除当前选择的标签。',
								title: '确定要切换可交付类型吗？',
							}
						: null
				}
			/>
			<SelectField
				label="标签（Tag）"
				value={condition.tag ?? 0}
				options={toIdOptions(tagOptions)}
				onChange={(v) => onUpdate({ tag: Number(v) })}
			/>
			<NumberField
				label="数量（Amount）"
				value={condition.amount}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function SubmitByTagsEditor({ condition, onUpdate }: ConditionEditorProps) {
	const sellableType = condition.sellableType || 'Food';
	const tagPool = sellableType === 'Food' ? FOOD_TAGS : BEVERAGE_TAGS;

	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="可交付类型（Sellable Type）"
				value={sellableType}
				options={[
					{ value: 'Food', label: '料理（Food）' },
					{ value: 'Beverage', label: '酒水（Beverage）' },
				]}
				onChange={(v) =>
					onUpdate({
						sellableType: v as 'Food' | 'Beverage',
						tags: [],
					})
				}
				getChangeConfirmation={(nextType, currentType) =>
					nextType !== currentType && Boolean(condition.tags?.length)
						? {
								confirmLabel: '切换类型',
								description:
									'切换可交付类型会清除当前选择的标签。',
								title: '确定要切换可交付类型吗？',
							}
						: null
				}
			/>
			<TagsField
				label={`标签（Tags，已选${(condition.tags ?? []).length}个）`}
				tags={condition.tags ?? []}
				tagPool={tagPool}
				onChange={(newTags) => onUpdate({ tags: newTags })}
				tone={sellableType === 'Food' ? 'positive' : 'beverage'}
			/>
			<NumberField
				label="数量（Amount）"
				value={condition.amount}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function SubmitByIngredientsEditor({
	condition,
	ctx,
	onUpdate,
}: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<TagsField
				label={`所需食材（已选${(condition.tags ?? []).length}）`}
				tags={condition.tags ?? []}
				tagPool={ctx.allIngredients}
				onChange={(newTags) => onUpdate({ tags: newTags })}
			/>
			<NumberField
				label="数量（需提交的料理份数）"
				value={condition.amount}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function ReachTargetCharacterKisunaLevelEditor({
	condition,
	ctx,
	onUpdate,
}: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="目标角色"
				value={condition.label}
				placeholder="请选择角色…"
				options={ctx.characterOptions}
				onChange={(v) => onUpdate({ label: v })}
			/>
			<NumberField
				label="羁绊等级（LV0～LV5）"
				value={condition.amount}
				min={0}
				max={5}
				defaultValue={0}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function BillRepaymentEditor({ condition, onUpdate }: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<NumberField
				label="需偿还金额"
				value={condition.amount}
				min={1}
				defaultValue={1}
				onChange={(v) => onUpdate({ amount: v })}
			/>
		</div>
	);
}

function TalkWithCharacterEditor({
	condition,
	ctx,
	onUpdate,
}: ConditionEditorProps) {
	return (
		<div className="flex flex-col gap-3">
			<SelectField
				label="目标角色"
				value={condition.label}
				placeholder="请选择角色…"
				options={ctx.characterOptions}
				onChange={(v) => onUpdate({ label: v })}
			/>
		</div>
	);
}

const CONDITION_EDITORS: Partial<
	Record<ConditionType, (props: ConditionEditorProps) => ReactNode>
> = {
	InspectInteractable: InspectInteractableEditor,
	SellInWork: SellInWorkEditor,
	FakeMission: FakeMissionEditor,
	CompleteSpecifiedFollowingEvents: CompleteEventsEditor,
	SubmitItem: SubmitItemEditor,
	ServeInWork: ServeInWorkEditor,
	SubmitByTag: SubmitByTagEditor,
	SubmitByTags: SubmitByTagsEditor,
	SubmitByAnyOneTag: SubmitByTagsEditor,
	SubmitByIngredients: SubmitByIngredientsEditor,
	ReachTargetCharacterKisunaLevel: ReachTargetCharacterKisunaLevelEditor,
	BillRepayment: BillRepaymentEditor,
	TalkWithCharacter: TalkWithCharacterEditor,
};

// -----------------------------------------------------------------------------
// 单条条件项
// -----------------------------------------------------------------------------

interface ConditionItemProps {
	condition: MissionCondition;
	ctx: ConditionEditorContext;
	hasReceiver: boolean;
	onUpdate: (updates: Partial<MissionCondition>) => void;
	onRemove: () => void;
}

function ConditionItem({
	condition,
	ctx,
	hasReceiver,
	onUpdate,
	onRemove,
}: ConditionItemProps) {
	const Editor = CONDITION_EDITORS[condition.conditionType];
	const isSupported = SUPPORTED_CONDITION_TYPES.has(condition.conditionType);

	return (
		<div
			data-editor-appended-item
			className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-4"
		>
			<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
				<Select<ConditionType>
					ariaLabel="完成条件类型"
					baseClassName="min-w-0 flex-1"
					value={condition.conditionType}
					onChange={(v) =>
						onUpdate(createMissionCondition(v as ConditionType))
					}
					getChangeConfirmation={(nextType, currentType) => {
						if (nextType === currentType) return null;
						const hasConfiguredCondition =
							JSON.stringify(condition) !==
							JSON.stringify(
								createMissionCondition(condition.conditionType)
							);
						const willClearReceiver =
							nextType === 'BillRepayment' && hasReceiver;
						if (!hasConfiguredCondition && !willClearReceiver)
							return null;
						return {
							confirmLabel: '切换类型',
							description: willClearReceiver
								? '切换后会清除当前条件配置和任务接取人。'
								: '切换后会清除当前条件中已填写的配置。',
							title: '确定要切换完成条件类型吗？',
						};
					}}
					items={CONDITION_TYPES.map((t) => ({
						value: t.type,
						label: `${t.label}（${t.type}）`,
					}))}
				/>
				<SectionDeleteButton
					className="h-10 shrink-0 text-sm sm:h-10 sm:text-sm"
					confirmTitle="确定要删除这个任务条件吗？"
					onPress={onRemove}
				>
					删除条件
				</SectionDeleteButton>
			</div>

			{Editor && (
				<Editor condition={condition} ctx={ctx} onUpdate={onUpdate} />
			)}
			{!isSupported && (
				<WarningNotice>
					当前编辑器尚未支持配置此条件的详细参数。
				</WarningNotice>
			)}
		</div>
	);
}

// -----------------------------------------------------------------------------
// 主组件
// -----------------------------------------------------------------------------

interface MissionConditionListProps {
	allEvents: EventNode[];
	mission: MissionNode;
	characterOptions: { value: string; label: string }[];
	allFoods: { id: number; name: string }[];
	allIngredients: { id: number; name: string }[];
	allBeverages: { id: number; name: string }[];
	onUpdate: (updates: Partial<MissionNode>) => void;
}

export const MissionConditionList = memo<MissionConditionListProps>(
	function MissionConditionList({
		allEvents,
		mission,
		characterOptions,
		allFoods,
		allIngredients,
		allBeverages,
		onUpdate,
	}) {
		const conditions = mission.finishConditions ?? [];
		const conditionListRef = useFocusOnItemAppend(conditions.length);
		const updateConditions = useCallback(
			(nextConditions: MissionCondition[]) => {
				const hasBillRepayment = nextConditions.some(
					(condition) => condition.conditionType === 'BillRepayment'
				);
				onUpdate({
					finishConditions: nextConditions,
					isTimedMission: hasBillRepayment,
					...(hasBillRepayment
						? {
								reciever: '',
								missionFailedAction:
									mission.missionFailedAction ?? 'None',
								missionTimeLimit: createMissionTimeLimit(
									mission.missionTimeLimit
								),
							}
						: {}),
				});
			},
			[mission.missionFailedAction, mission.missionTimeLimit, onUpdate]
		);

		const addCondition = useCallback(() => {
			updateConditions([
				...conditions,
				createMissionCondition('ServeInWork'),
			]);
		}, [conditions, updateConditions]);

		const removeCondition = useCallback(
			(index: number) => {
				updateConditions(conditions.filter((_, i) => i !== index));
			},
			[conditions, updateConditions]
		);

		const updateCondition = useCallback(
			(index: number, updates: Partial<MissionCondition>) => {
				const next = [...conditions];
				const currentCondition = next[index];
				if (!currentCondition) return;
				next[index] =
					updates.conditionType !== undefined &&
					updates.conditionType !== currentCondition.conditionType
						? createMissionCondition(updates.conditionType)
						: ({
								...currentCondition,
								...updates,
							} as MissionCondition);
				updateConditions(next);
			},
			[conditions, updateConditions]
		);

		const ctx: ConditionEditorContext = {
			allEvents,
			allFoods,
			allIngredients,
			allBeverages,
			characterOptions,
		};

		return (
			<EditorSection
				title={`完成条件（Finish Conditions）（${conditions.length}）`}
				actions={
					<SectionAddButton onPress={addCondition}>
						添加完成条件
					</SectionAddButton>
				}
			>
				<div ref={conditionListRef} className="flex flex-col gap-3">
					{conditions.map((condition, index) => (
						<ConditionItem
							key={index}
							condition={condition}
							ctx={ctx}
							hasReceiver={mission.reciever.trim().length > 0}
							onUpdate={(updates) =>
								updateCondition(index, updates)
							}
							onRemove={() => removeCondition(index)}
						/>
					))}
					{conditions.length === 0 && (
						<EmptyState
							title="暂无完成条件"
							description="可使用“添加完成条件”创建第一项"
						/>
					)}
				</div>
			</EditorSection>
		);
	}
);
