'use client';

import { memo } from 'react';
import { Select } from '@/design/ui/components';
import { WarningNotice } from '@/components/common/WarningNotice';
import type { ScheduledEvent, DialogPackage } from '@/types/resource';

type EventType = NonNullable<ScheduledEvent['eventData']>['eventType'];

interface EventDataEditorProps {
	eventData?: ScheduledEvent['eventData'];
	allDialogPackages: DialogPackage[];
	onChange: (eventData: NonNullable<ScheduledEvent['eventData']>) => void;
}

export const EventDataEditor = memo<EventDataEditorProps>(
	function EventDataEditor({ eventData, allDialogPackages, onChange }) {
		return (
			<div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
				<div className="flex flex-col gap-1">
					<label className="text-xs font-medium opacity-70">
						Event Type
					</label>
					<Select<EventType>
						ariaLabel="Event Type"
						value={eventData?.eventType || 'Null'}
						onChange={(newType) => {
							const newEventData: any = { eventType: newType };
							if (
								newType === 'Dialog' &&
								eventData?.dialogPackageName
							) {
								newEventData.dialogPackageName =
									eventData.dialogPackageName;
							}
							onChange(newEventData);
						}}
						items={[
							{ value: 'Null', label: 'Null' },
							{ value: 'Timeline', label: 'Timeline' },
							{ value: 'Dialog', label: 'Dialog' },
						]}
					/>
				</div>

				{eventData?.eventType === 'Dialog' && (
					<div className="flex flex-col gap-1">
						<label className="text-xs font-medium opacity-70">
							Dialog Package Name
						</label>
						<Select<string>
							ariaLabel="Dialog Package Name"
							placeholder="Select Package..."
							value={eventData?.dialogPackageName ?? ''}
							onChange={(v) =>
								onChange({
									...(eventData || { eventType: 'Dialog' }),
									dialogPackageName: v,
								})
							}
							items={allDialogPackages.map((pkg, index) => ({
								value: pkg.name,
								label: pkg.name || `Dialog Package ${index}`,
								textValue: `${pkg.name}-${index}`,
							}))}
						/>
					</div>
				)}

				{eventData?.eventType === 'Timeline' && (
					<WarningNotice>⚠ 暂不支持配置 Timeline</WarningNotice>
				)}
			</div>
		);
	}
);
