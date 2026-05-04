'use client';

import { memo, useMemo } from 'react';
import { Select } from '@/design/ui/components';
import { WarningNotice } from '@/components/common/WarningNotice';
import type { ScheduledEvent, Character } from '@/types/resource';
import { SPECIAL_GUESTS } from '@/data/specialGuest';

export const TRIGGER_TYPES = [
	{
		value: 'OnEnterDaySceneMap',
		label: '【未实现】进入白天地图前(OnEnterDaySceneMap)',
	},
	{
		value: 'OnEnterDayScene',
		label: '【未实现】进入白天前(OnEnterDayScene)',
	},
	{ value: 'OnWorkEnd', label: '【未实现】工作结束前(OnWorkEnd)' },
	{
		value: 'OnTalkWithCharacter',
		label: '【未实现】和角色对话时(OnTalkWithCharacter)',
	},
	{
		value: 'OnBeforeWorkStart',
		label: '【未实现】工作开始之前(OnBeforeWorkStart)',
	},
	{ value: 'KizunaCheckPoint', label: '羁绊等级升级时(KizunaCheckPoint)' },
	{
		value: 'OnDayEnd',
		label: '【未实现】白天结束时，在夜雀的进入店面对话前(OnDayEnd)',
	},
	{
		value: 'LevelCheckPoint',
		label: '【未实现】等级升级时(LevelCheckPoint)',
	},
	{
		value: 'BuyCount',
		label: '【未实现】【未实现】购买了目标物品X个数量时(BuyCount)',
	},
	{
		value: 'OnBeforeChallengeStart',
		label: '【未实现】挑战开始前(OnBeforeChallengeStart)',
	},
	{ value: 'OnChallengeEnd', label: '【未实现】挑战结束前(OnChallengeEnd)' },
	{
		value: 'Obsolete_OnChallengePhaseChange',
		label: '【未实现】【已弃用】挑战阶段切换时(Obsolete_OnChallengePhaseChange)',
	},
	{
		value: 'OnChallengeFailed',
		label: '【未实现】挑战失败时(OnChallengeFailed)',
	},
	{
		value: 'OnChallengeSucceed',
		label: '【未实现】挑战成功时(OnChallengeSucceed)',
	},
	{
		value: 'OnAfterDayEnd',
		label: '【未实现】白天结束时，在夜雀的进入店面对话后(OnAfterDayEnd)',
	},
	{
		value: 'OnBeforeIzakayaConfigure',
		label: '【未实现】进入雀食堂配置前(OnBeforeIzakayaConfigure)',
	},
	{
		value: 'OnEnterDaySceneTriggerArea',
		label: '【未实现】进入白天触发区域(OnEnterDaySceneTriggerArea)',
	},
	{
		value: 'TriggerFinishImmediate',
		label: '【未实现】立刻获得该事件内包含的奖励以及后置信息(TriggerFinishImmediate)',
	},
	{
		value: 'OnAfterDayEndIzakayaSelectionOpen',
		label: '【未实现】在白天结束，雀食堂配置面板打开后(OnAfterDayEndIzakayaSelectionOpen)',
	},
	{
		value: 'CompleteSpecifiedFollowingEvents',
		label: '【未实现】完成以下事件中的X(指定数量)个(CompleteSpecifiedFollowingEvents)',
	},
	{
		value: 'ImpossibleFinish',
		label: '【未实现】表示某种事情发生(不会自动完成，需要手动完成或者取消计划)(ImpossibleFinish)',
	},
	{
		value: 'OnAnyKizunaExpFull',
		label: '【未实现】在羁绊经验到达当前等级最大值时(OnAnyKizunaExpFull)',
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
				label: `[${g.id}] ${g.name} (${g.label})`,
			});
		});
		// Add custom characters
		allCharacters.forEach((c) => {
			options.push({
				value: c.label,
				label: `[${c.id}] ${c.name} (${c.label})`,
			});
		});
		return options;
	}, [allCharacters]);

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
			<div className="flex flex-col gap-1">
				<label className="text-xs font-medium opacity-70">
					Trigger Type
				</label>
				<Select<string>
					ariaLabel="Trigger Type"
					placeholder="None"
					value={trigger?.triggerType ?? ''}
					onChange={(newType) => {
						const newTrigger: {
							triggerType: string;
							triggerId?: string;
						} = { triggerType: newType };
						if (
							newType === 'KizunaCheckPoint' &&
							trigger?.triggerId
						) {
							newTrigger.triggerId = trigger.triggerId;
						}
						onChange(newTrigger);
					}}
					items={TRIGGER_TYPES.map((t) => ({
						value: t.value,
						label: t.label,
					}))}
				/>
			</div>

			{trigger?.triggerType === 'KizunaCheckPoint' && (
				<div className="flex flex-col gap-1">
					<label className="text-xs font-medium opacity-70">
						Target Character (Trigger ID)
					</label>
					<Select<string>
						ariaLabel="Target Character"
						placeholder="Select Character..."
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
				trigger.triggerType !== 'KizunaCheckPoint' && (
					<WarningNotice>
						⚠ 当前编辑器尚未支持配置此条件的详细参数
					</WarningNotice>
				)}
		</div>
	);
});
