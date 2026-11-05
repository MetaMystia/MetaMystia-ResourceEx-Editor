import { cn } from '@heroui/theme';
import { memo, useMemo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';
import Tooltip from '@/design/ui/components/tooltip';

import type { Character } from '@/domain/resourcePack/contracts/character';
import type {
	MissionNode,
	MissionType,
} from '@/domain/resourcePack/contracts/mission';

import { EditorField } from '@/features/resourceEditor/client/components/fields/EditorField';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { useLabelPrefixValidation } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

interface MissionBasicInfoProps {
	mission: MissionNode;
	characters: Character[];
	allFoods: { id: number; name: string }[];
	characterOptions: { value: string; label: string }[];
	isLabelDuplicate: boolean;
	onUpdate: (updates: Partial<MissionNode>) => void;
}

export const MissionBasicInfo = memo<MissionBasicInfoProps>(
	function MissionBasicInfo({
		mission,
		characters,
		allFoods,
		characterOptions,
		isLabelDuplicate,
		onUpdate,
	}) {
		const {
			isValid: isLabelPrefixValid,
			prefix: expectedPrefix,
			hasPackLabel,
		} = useLabelPrefixValidation(mission.label || '');
		const showPrefixWarning =
			hasPackLabel && mission.label && !isLabelPrefixValid;

		const hasBillRepayment = useMemo(
			() =>
				(mission.finishConditions ?? []).some(
					(c) => c.conditionType === 'BillRepayment'
				),
			[mission.finishConditions]
		);

		return (
			<EditorSection title="基本信息">
				<div className="grid grid-cols-1 gap-6">
					<EditorField label="标题（Title）">
						<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
							<Input
								type="text"
								value={mission.title || ''}
								onChange={(e) =>
									onUpdate({ title: e.target.value })
								}
								className="min-w-0 flex-1"
								placeholder="自动或手动设置显示标题"
							/>
							<Tooltip content="根据第一个完成条件生成标题和描述">
								<Button
									variant="flat"
									color="primary"
									size="sm"
									onPress={() => {
										const cond =
											(mission.finishConditions || [])[0];
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
											char?.name ||
											targetLabel ||
											'目标角色';
										const food = allFoods.find(
											(f) => f.id === cond.amount
										);
										const foodName = food?.name || '料理';
										onUpdate({
											title: `请${charName}品尝一下「${foodName}」吧！`,
											description: `从${charName}那儿得到了新料理的灵感，做出来以后请她尝一尝吧！`,
										});
									}}
									className="h-10 shrink-0 sm:h-10"
								>
									同步标题与描述
								</Button>
							</Tooltip>
						</div>
					</EditorField>

					<EditorField label="描述（Description）">
						<Textarea
							minRows={3}
							value={mission.description || ''}
							onChange={(e) =>
								onUpdate({ description: e.target.value })
							}
							placeholder="任务描述（可选）"
						/>
					</EditorField>

					<EditorField
						label="标签（Label）"
						actions={
							isLabelDuplicate || showPrefixWarning ? (
								<div className="flex gap-2">
									{isLabelDuplicate && (
										<ErrorBadge>标签重复</ErrorBadge>
									)}
									{showPrefixWarning && (
										<WarningBadge>
											建议以{expectedPrefix}开头
										</WarningBadge>
									)}
								</div>
							) : undefined
						}
					>
						<Input
							type="text"
							value={mission.label || ''}
							onChange={(e) =>
								onUpdate({ label: e.target.value })
							}
							placeholder="例如：Kizuna_Rumia_LV3_Upgrade_001_Mission"
							isInvalid={isLabelDuplicate}
						/>
					</EditorField>

					<EditorField label="任务类型（Mission Type）">
						<Select<MissionType>
							ariaLabel="任务类型"
							value={mission.missionType}
							onChange={(v) => onUpdate({ missionType: v })}
							items={[
								{ value: 'Kitsuna', label: '羁绊（Kitsuna）' },
								{ value: 'Main', label: '主线（Main）' },
								{ value: 'Side', label: '支线（Side）' },
							]}
						/>
					</EditorField>

					<EditorField label="委托自（Sender）">
						<Select<string>
							ariaLabel="委托自"
							placeholder="请选择角色…"
							value={mission.sender ?? ''}
							onChange={(v) => onUpdate({ sender: v })}
							items={characterOptions.map((opt) => ({
								value: opt.value,
								label: opt.label,
							}))}
						/>
					</EditorField>

					<EditorField label="交付至（Receiver）">
						<div className="flex flex-col gap-1">
							<Select<string>
								ariaLabel="交付至"
								placeholder={
									hasBillRepayment
										? 'BillRepayment条件存在时强制留空'
										: '请选择角色…'
								}
								isDisabled={hasBillRepayment}
								value={
									hasBillRepayment
										? '__FORCED_EMPTY__'
										: (mission.reciever ?? '')
								}
								onChange={(v) => onUpdate({ reciever: v })}
								items={
									hasBillRepayment
										? [
												{
													value: '__FORCED_EMPTY__',
													label: '（必须留空）',
												},
											]
										: characterOptions.map((opt) => ({
												value: opt.value,
												label: opt.label,
											}))
								}
							/>
							{hasBillRepayment && (
								<p
									className={cn(
										TYPOGRAPHY_STYLES.compactBody,
										'text-warning-700 dark:text-warning-600'
									)}
								>
									存在BillRepayment条件时，Receiver必须为空字符串。
								</p>
							)}
						</div>
					</EditorField>

					{/* ── 限时任务（仅 BillRepayment 条件存在时显示） ── */}
					{hasBillRepayment && (
						<>
							<EditorField label="任务失败处理（Mission Failed Action）">
								<Select<'None' | 'BackToMainMenu' | 'Rewind'>
									ariaLabel="Mission Failed Action"
									value={
										mission.missionFailedAction ?? 'None'
									}
									onChange={(v) =>
										onUpdate({
											missionFailedAction: v as
												| 'None'
												| 'BackToMainMenu'
												| 'Rewind',
										})
									}
									items={[
										{
											value: 'None',
											label: '无操作（None）',
										},
										{
											value: 'BackToMainMenu',
											label: '返回主菜单（BackToMainMenu）',
										},
										{
											value: 'Rewind',
											label: '时间回滚（Rewind）',
										},
									]}
								/>
							</EditorField>

							<EditorField label="任务时限（Mission Time Limit）">
								<div className="flex flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-4">
									<div className="flex flex-col gap-1">
										<Label size="sm">
											触发类型（Trigger Type）
										</Label>
										<Input
											isReadOnly
											value="OnWorkEnd（固定）"
										/>
									</div>

									<div className="flex flex-col gap-1">
										<Label size="sm">
											触发标识符（Trigger ID）
										</Label>
										<Input
											type="text"
											value={
												mission.missionTimeLimit
													?.triggerId ?? ''
											}
											onChange={(e) =>
												onUpdate({
													missionTimeLimit: {
														...(mission.missionTimeLimit ?? {
															triggerType:
																'OnWorkEnd',
														}),
														triggerId:
															e.target.value,
													},
												})
											}
											placeholder="建议留空"
										/>
									</div>

									<div className="flex flex-col gap-1">
										<Label size="sm">
											日期类型（Day Type）
										</Label>
										<Select<string>
											ariaLabel="日期类型"
											value={
												mission.missionTimeLimit?.time
													?.dayType ?? 'Relative'
											}
											onChange={(v) =>
												onUpdate({
													missionTimeLimit: {
														...(mission.missionTimeLimit ?? {
															triggerType:
																'OnWorkEnd',
														}),
														time: {
															...(mission
																.missionTimeLimit
																?.time ?? {
																dayType:
																	'Relative',
																dayCalcType:
																	'Constant',
															}),
															dayType: v as
																| 'Relative'
																| 'Absolute',
														},
													},
												})
											}
											items={[
												{
													value: 'Relative',
													label: '相对（Relative）',
												},
												{
													value: 'Absolute',
													label: '绝对（Absolute）',
												},
											]}
										/>
									</div>

									<div className="flex flex-col gap-1">
										<Label size="sm">
											日期计算方式（Day Calc Type）
										</Label>
										<Select<string>
											ariaLabel="日期计算方式"
											value={
												mission.missionTimeLimit?.time
													?.dayCalcType ?? 'Constant'
											}
											onChange={(v) =>
												onUpdate({
													missionTimeLimit: {
														...(mission.missionTimeLimit ?? {
															triggerType:
																'OnWorkEnd',
														}),
														time: {
															...(mission
																.missionTimeLimit
																?.time ?? {
																dayType:
																	'Relative',
																dayCalcType:
																	'Constant',
															}),
															dayCalcType: v as
																| 'Constant'
																| 'Random',
														},
													},
												})
											}
											items={[
												{
													value: 'Constant',
													label: '固定（Constant）',
												},
												{
													value: 'Random',
													label: '随机（Random）',
												},
											]}
										/>
									</div>

									{mission.missionTimeLimit?.time
										?.dayCalcType === 'Random' ? (
										<>
											<div className="flex flex-col gap-1">
												<Label size="sm">
													最小天数
												</Label>
												<Input
													type="number"
													min={0}
													value={String(
														mission.missionTimeLimit
															?.time
															?.dayRangeMin ?? 0
													)}
													onChange={(e) =>
														onUpdate({
															missionTimeLimit: {
																...(mission.missionTimeLimit ?? {
																	triggerType:
																		'OnWorkEnd',
																}),
																time: {
																	...(mission
																		.missionTimeLimit
																		?.time ?? {
																		dayType:
																			'Relative',
																		dayCalcType:
																			'Constant',
																	}),
																	dayRangeMin:
																		Number(
																			e
																				.target
																				.value
																		),
																},
															},
														})
													}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label size="sm">
													最大天数
												</Label>
												<Input
													type="number"
													min={0}
													value={String(
														mission.missionTimeLimit
															?.time
															?.dayRangeMax ?? 0
													)}
													onChange={(e) =>
														onUpdate({
															missionTimeLimit: {
																...(mission.missionTimeLimit ?? {
																	triggerType:
																		'OnWorkEnd',
																}),
																time: {
																	...(mission
																		.missionTimeLimit
																		?.time ?? {
																		dayType:
																			'Relative',
																		dayCalcType:
																			'Constant',
																	}),
																	dayRangeMax:
																		Number(
																			e
																				.target
																				.value
																		),
																},
															},
														})
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
												value={String(
													mission.missionTimeLimit
														?.time?.day ?? 1
												)}
												onChange={(e) =>
													onUpdate({
														missionTimeLimit: {
															...(mission.missionTimeLimit ?? {
																triggerType:
																	'OnWorkEnd',
															}),
															time: {
																...(mission
																	.missionTimeLimit
																	?.time ?? {
																	dayType:
																		'Relative',
																	dayCalcType:
																		'Constant',
																}),
																day: Number(
																	e.target
																		.value
																),
															},
														},
													})
												}
											/>
										</div>
									)}
								</div>
							</EditorField>
						</>
					)}
				</div>
			</EditorSection>
		);
	}
);
