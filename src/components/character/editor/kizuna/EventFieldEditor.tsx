import { memo, useMemo } from 'react';
import { Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import type { EventNode } from '@/types/resource';

interface EventFieldEditorProps {
	label: string;
	value: string | undefined;
	allEvents: EventNode[];
	onChange: (value: string) => void;
}

export const EventFieldEditor = memo<EventFieldEditorProps>(
	function EventFieldEditor({ label, value, allEvents, onChange }) {
		const eventItems = useMemo<SelectItemSpec<string>[]>(() => {
			return allEvents.map((e) => ({
				value: e.label,
				label: `${e.label} (${e.debugLabel})`,
			}));
		}, [allEvents]);

		return (
			<div className="flex flex-col gap-2">
				<label className="text-sm font-bold opacity-70">{label}</label>
				<Select<string>
					value={value}
					onChange={onChange}
					placeholder="请选择事件..."
					items={eventItems}
				/>
			</div>
		);
	}
);
