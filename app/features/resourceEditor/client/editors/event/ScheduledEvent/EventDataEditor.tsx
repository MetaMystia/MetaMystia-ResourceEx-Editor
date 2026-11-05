'use client';

import { memo } from 'react';

import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';
import type { ScheduledEvent } from '@/domain/resourcePack/contracts/event';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

type EventType = NonNullable<ScheduledEvent['eventData']>['eventType'];

interface EventDataEditorProps {
	eventData?: ScheduledEvent['eventData'];
	allDialogPackages: DialogPackage[];
	onChange: (eventData: NonNullable<ScheduledEvent['eventData']>) => void;
}

export const EventDataEditor = memo<EventDataEditorProps>(
	function EventDataEditor({ eventData, allDialogPackages, onChange }) {
		return (
			<div className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-4">
				<div className="flex flex-col gap-1">
					<Label size="sm">事件类型（Event Type）</Label>
					<Select<EventType>
						ariaLabel="事件类型"
						value={eventData?.eventType || 'Null'}
						onChange={(newType) => {
							const newEventData: NonNullable<
								ScheduledEvent['eventData']
							> =
								newType === 'Dialog' &&
								eventData?.dialogPackageName
									? {
											eventType: newType,
											dialogPackageName:
												eventData.dialogPackageName,
										}
									: { eventType: newType };
							onChange(newEventData);
						}}
						getChangeConfirmation={(nextType, currentType) =>
							nextType !== currentType &&
							nextType !== 'Dialog' &&
							Boolean(eventData?.dialogPackageName)
								? {
										confirmLabel: '切换类型',
										description:
											'切换后会清除当前选择的对话包。',
										title: '确定要切换事件类型吗？',
									}
								: null
						}
						items={[
							{ value: 'Null', label: '无（Null）' },
							{ value: 'Timeline', label: '时间轴（Timeline）' },
							{ value: 'Dialog', label: '对话（Dialog）' },
						]}
					/>
				</div>

				{eventData?.eventType === 'Dialog' && (
					<div className="flex flex-col gap-1">
						<Label size="sm">
							对话包名称（Dialog Package Name）
						</Label>
						<Select<string>
							ariaLabel="对话包名称"
							placeholder="请选择对话包…"
							value={eventData?.dialogPackageName ?? ''}
							onChange={(v) =>
								onChange({
									...(eventData || { eventType: 'Dialog' }),
									dialogPackageName: v,
								})
							}
							items={allDialogPackages.map((pkg, index) => ({
								value: pkg.name,
								label: pkg.name || `对话包${index + 1}`,
							}))}
						/>
					</div>
				)}

				{eventData?.eventType === 'Timeline' && (
					<WarningNotice>
						暂不支持配置时间轴（Timeline）
					</WarningNotice>
				)}
			</div>
		);
	}
);
