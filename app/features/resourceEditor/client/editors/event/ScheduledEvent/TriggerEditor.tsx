'use client';

import { memo, useMemo } from 'react';

import { SPECIAL_GUESTS } from '@/domain/data/specialGuest';
import type { Character } from '@/domain/resourcePack/contracts/character';
import type { ScheduledEvent } from '@/domain/resourcePack/contracts/event';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

export const TRIGGER_TYPES = [
	{
		value: 'OnEnterDaySceneMap',
		label: '【未实现】进入白天地图前（OnEnterDaySceneMap）',
	},
	{
		value: 'OnEnterDayScene',
		label: '【未实现】进入白天前（OnEnterDayScene）',
	},
	{ value: 'OnWorkEnd', label: '【未实现】工作结束前（OnWorkEnd）' },
	{
		value: 'OnTalkWithCharacter',
		label: '和角色对话时（OnTalkWithCharacter）',
	},
	{
		value: 'OnBeforeWorkStart',
		label: '【未实现】工作开始之前（OnBeforeWorkStart）',
	},
	{ value: 'KizunaCheckPoint', label: '羁绊等级升级时（KizunaCheckPoint）' },
	{
		value: 'OnDayEnd',
		label: '【未实现】白天结束时，在夜雀的进入店面对话前（OnDayEnd）',
	},
	{
		value: 'LevelCheckPoint',
		label: '【未实现】等级升级时（LevelCheckPoint）',
	},
	{ value: 'BuyCount', label: '【未实现】购买目标物品X个时（BuyCount）' },
	{
		value: 'OnBeforeChallengeStart',
		label: '【未实现】挑战开始前（OnBeforeChallengeStart）',
	},
	{
		value: 'OnChallengeEnd',
		label: '【未实现】挑战结束前（OnChallengeEnd）',
	},
	{
		value: 'Obsolete_OnChallengePhaseChange',
		label: '【未实现】【已弃用】挑战阶段切换时（Obsolete_OnChallengePhaseChange）',
	},
	{
		value: 'OnChallengeFailed',
		label: '【未实现】挑战失败时（OnChallengeFailed）',
	},
	{
		value: 'OnChallengeSucceed',
		label: '【未实现】挑战成功时（OnChallengeSucceed）',
	},
	{
		value: 'OnAfterDayEnd',
		label: '【未实现】白天结束时，在夜雀的进入店面对话后（OnAfterDayEnd）',
	},
	{
		value: 'OnBeforeIzakayaConfigure',
		label: '【未实现】进入雀食堂配置前（OnBeforeIzakayaConfigure）',
	},
	{
		value: 'OnEnterDaySceneTriggerArea',
		label: '【未实现】进入白天触发区域（OnEnterDaySceneTriggerArea）',
	},
	{
		value: 'TriggerFinishImmediate',
		label: '【未实现】立刻获得该事件内包含的奖励以及后置信息（TriggerFinishImmediate）',
	},
	{
		value: 'OnAfterDayEndIzakayaSelectionOpen',
		label: '【未实现】在白天结束，雀食堂配置面板打开后（OnAfterDayEndIzakayaSelectionOpen）',
	},
	{
		value: 'CompleteSpecifiedFollowingEvents',
		label: '【未实现】完成以下事件中的X（指定数量）个（CompleteSpecifiedFollowingEvents）',
	},
	{
		value: 'ImpossibleFinish',
		label: '【未实现】表示某种事情发生（不会自动完成，需要手动完成或者取消计划）（ImpossibleFinish）',
	},
	{
		value: 'OnAnyKizunaExpFull',
		label: '【未实现】在羁绊经验到达当前等级最大值时（OnAnyKizunaExpFull）',
	},
];

interface TriggerEditorProps {
	trigger?: ScheduledEvent['trigger'];
	allCharacters: Character[];
	onChange: (trigger: NonNullable<ScheduledEvent['trigger']>) => void;
}

export const TriggerEditor = memo<TriggerEditorProps>(function TriggerEditor({
	trigger,
	allCharacters,
	onChange,
}) {
	const characterOptions = useMemo(() => {
		const options: { value: string; label: string }[] = [];
		// Add built-in special guests
		SPECIAL_GUESTS.forEach((g) => {
			options.push({
				value: g.label,
				label: `[${g.id}] ${g.name}（${g.label}）`,
			});
		});
		// Add custom characters
		allCharacters.forEach((c) => {
			options.push({
				value: c.label,
				label: `[${c.id}] ${c.name}（${c.label}）`,
			});
		});
		return options;
	}, [allCharacters]);

	return (
		<div className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-4">
			<div className="flex flex-col gap-1">
				<Label size="sm">触发类型（Trigger Type）</Label>
				<Select<string>
					ariaLabel="触发类型"
					placeholder="请选择触发类型…"
					value={trigger?.triggerType ?? ''}
					onChange={(newType) => {
						const newTrigger: {
							triggerType: string;
							triggerId?: string;
						} = { triggerType: newType };
						if (
							(newType === 'KizunaCheckPoint' ||
								newType === 'OnTalkWithCharacter') &&
							trigger?.triggerId
						) {
							newTrigger.triggerId = trigger.triggerId;
						}
						onChange(newTrigger);
					}}
					getChangeConfirmation={(nextType, currentType) => {
						if (nextType === currentType || !trigger) return null;
						const keepsTriggerId =
							nextType === 'KizunaCheckPoint' ||
							nextType === 'OnTalkWithCharacter';
						const losesConfiguredData = Boolean(
							trigger.time ||
							trigger.labels?.length ||
							trigger.executeOrder !== undefined ||
							(!keepsTriggerId && trigger.triggerId)
						);
						return losesConfiguredData
							? {
									confirmLabel: '切换类型',
									description:
										'切换触发类型会清除当前类型下已配置的触发参数。',
									title: '确定要切换触发类型吗？',
								}
							: null;
					}}
					items={TRIGGER_TYPES.map((t) => ({
						value: t.value,
						label: t.label,
					}))}
				/>
			</div>

			{(trigger?.triggerType === 'KizunaCheckPoint' ||
				trigger?.triggerType === 'OnTalkWithCharacter') && (
				<div className="flex flex-col gap-1">
					<Label size="sm">目标角色（Trigger ID）</Label>
					<Select<string>
						ariaLabel="目标角色"
						placeholder="请选择角色…"
						value={trigger?.triggerId ?? ''}
						onChange={(v) =>
							onChange({
								...(trigger || {
									triggerType: 'KizunaCheckPoint',
								}),
								triggerId: v,
							})
						}
						items={characterOptions.map((opt) => ({
							value: opt.value,
							label: opt.label,
						}))}
					/>
				</div>
			)}

			{trigger?.triggerType &&
				trigger.triggerType !== 'KizunaCheckPoint' &&
				trigger.triggerType !== 'OnTalkWithCharacter' && (
					<WarningNotice>
						当前编辑器尚未支持配置此条件的详细参数
					</WarningNotice>
				)}
		</div>
	);
});
