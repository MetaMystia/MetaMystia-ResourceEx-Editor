import { memo } from 'react';
import { Button, Select } from '@/design/ui/components';
import { EditorField } from '@/components/common/EditorField';
import { WarningBadge } from '@/components/common/WarningBadge';
import { useLabelPrefixValidation } from '@/components/common/useLabelPrefixValidation';
import type { Character, MissionNode, MissionType } from '@/types/resource';

interface MissionBasicInfoProps {
	mission: MissionNode;
	characters: Character[];
	allFoods: { id: number; name: string }[];
	characterOptions: { value: string; label: string }[];
	onUpdate: (updates: Partial<MissionNode>) => void;
}

export const MissionBasicInfo = memo<MissionBasicInfoProps>(
	function MissionBasicInfo({
		mission,
		characters,
		allFoods,
		characterOptions,
		onUpdate,
	}) {
		const {
			isValid: isLabelPrefixValid,
			prefix: expectedPrefix,
			hasPackLabel,
		} = useLabelPrefixValidation(mission.label || '');
		const showPrefixWarning =
			hasPackLabel && mission.label && !isLabelPrefixValid;

		return (
			<div className="grid grid-cols-1 gap-6">
				<EditorField label="Title">
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={mission.title || ''}
							onChange={(e) =>
								onUpdate({ title: e.target.value })
							}
							className="flex-1 rounded-lg border border-black/10 bg-black/5 px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5"
							placeholder="自动或手动设置显示标题"
						/>
						<Button
							variant="light"
							size="sm"
							isIconOnly
							onPress={() => {
								const cond = (mission.finishConditions ||
									[])[0];
								if (
									!cond ||
									cond.conditionType !== 'ServeInWork'
								)
									return;
								const targetLabel = cond.label;
								const char = characters.find(
									(c) => c.label === targetLabel
								);
								const charName =
									char?.name || targetLabel || '目标角色';
								const food = allFoods.find(
									(f) => f.id === cond.amount
								);
								const foodName = food?.name || '料理';
								onUpdate({
									title: `请${charName}品尝一下「${foodName}」吧！`,
									description: `从${charName}那儿得到了新料理的灵感，做出来以后请她尝一尝吧！`,
								});
							}}
							className="h-8 w-8"
							title="根据第一个完成条件生成标题和描述"
						>
							🔄
						</Button>
					</div>
				</EditorField>

				<EditorField label="Description">
					<textarea
						rows={3}
						value={mission.description || ''}
						onChange={(e) =>
							onUpdate({ description: e.target.value })
						}
						className="rounded-lg border border-black/10 bg-black/5 px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5"
						placeholder="任务描述（可选）"
					/>
				</EditorField>

				<EditorField
					label="Label"
					actions={
						showPrefixWarning ? (
							<WarningBadge>
								建议以 {expectedPrefix} 开头
							</WarningBadge>
						) : undefined
					}
				>
					<input
						type="text"
						value={mission.label || ''}
						onChange={(e) => onUpdate({ label: e.target.value })}
						className="rounded-lg border border-black/10 bg-black/5 px-4 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-white/10 dark:bg-white/5"
						placeholder="例如：Kizuna_Rumia_LV3_Upgrade_001_Mission"
					/>
				</EditorField>

				<EditorField label="Mission Type">
					<Select<MissionType>
						ariaLabel="Mission Type"
						value={mission.missionType}
						onChange={(v) => onUpdate({ missionType: v })}
						items={[
							{ value: 'Kitsuna', label: 'Kitsuna' },
							{ value: 'Main', label: 'Main' },
							{ value: 'Side', label: 'Side' },
						]}
					/>
				</EditorField>

				<EditorField label="委托自(Sender)">
					<Select<string>
						ariaLabel="委托自"
						placeholder="请选择角色..."
						value={mission.sender ?? ''}
						onChange={(v) => onUpdate({ sender: v })}
						items={characterOptions.map((opt) => ({
							value: opt.value,
							label: opt.label,
						}))}
					/>
				</EditorField>

				<EditorField label="交付至(Receiver)">
					<Select<string>
						ariaLabel="交付至"
						placeholder="请选择角色..."
						value={mission.reciever ?? ''}
						onChange={(v) => onUpdate({ reciever: v })}
						items={characterOptions.map((opt) => ({
							value: opt.value,
							label: opt.label,
						}))}
					/>
				</EditorField>
			</div>
		);
	}
);
