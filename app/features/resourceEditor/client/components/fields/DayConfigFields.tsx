import { memo } from 'react';

import Input from '@/design/ui/components/input';

import type { DayConfig } from '@/domain/resourcePack/contracts/event';

import { Select } from '@/features/resourceEditor/client/components/select/Select';

import { Label } from './Label';

const DEFAULT_DAY_CONFIG: DayConfig = {
	dayCalcType: 'Constant',
	dayType: 'Relative',
};

interface IProps {
	value: DayConfig | undefined;
	/** 未填写 `day` 时显示的天数。 */
	defaultDay: number;
	onChange: (value: DayConfig) => void;
}

/** 游戏 `SchedulerNode.Day`：相对或绝对日期，固定天数或闭区间随机。 */
export const DayConfigFields = memo<IProps>(function DayConfigFields({
	value,
	defaultDay,
	onChange,
}) {
	const current = value ?? DEFAULT_DAY_CONFIG;
	const update = (updates: Partial<DayConfig>) =>
		onChange({ ...current, ...updates });

	return (
		<>
			<div className="flex flex-col gap-1">
				<Label size="sm">日期类型（Day Type）</Label>
				<Select<DayConfig['dayType']>
					ariaLabel="日期类型"
					value={current.dayType}
					onChange={(dayType) => update({ dayType })}
					items={[
						{ value: 'Relative', label: '相对（Relative）' },
						{ value: 'Absolute', label: '绝对（Absolute）' },
					]}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<Label size="sm">日期计算方式（Day Calc Type）</Label>
				<Select<DayConfig['dayCalcType']>
					ariaLabel="日期计算方式"
					value={current.dayCalcType}
					onChange={(dayCalcType) => update({ dayCalcType })}
					items={[
						{ value: 'Constant', label: '固定（Constant）' },
						{ value: 'Random', label: '随机（Random）' },
					]}
				/>
			</div>

			{current.dayCalcType === 'Random' ? (
				<>
					<div className="flex flex-col gap-1">
						<Label size="sm">最小天数</Label>
						<Input
							type="number"
							min={0}
							value={String(current.dayRangeMin ?? 0)}
							onChange={(e) =>
								update({ dayRangeMin: Number(e.target.value) })
							}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label size="sm">最大天数</Label>
						<Input
							type="number"
							min={0}
							value={String(current.dayRangeMax ?? 0)}
							onChange={(e) =>
								update({ dayRangeMax: Number(e.target.value) })
							}
						/>
					</div>
				</>
			) : (
				<div className="flex flex-col gap-1">
					<Label size="sm">天数（Day）</Label>
					<Input
						type="number"
						min={0}
						value={String(current.day ?? defaultDay)}
						onChange={(e) =>
							update({ day: Number(e.target.value) })
						}
					/>
				</div>
			)}
		</>
	);
});
