import { memo, useMemo } from 'react';
import { Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import type { DialogPackage } from '@/types/resource';
import { DialogItem } from './DialogItem';

interface DialogArrayFieldProps {
	label: string;
	dialogs: string[];
	allDialogPackages: DialogPackage[];
	onAdd: (dialogName: string) => void;
	onRemove: (index: number) => void;
}

export const DialogArrayField = memo<DialogArrayFieldProps>(
	function DialogArrayField({
		label,
		dialogs,
		allDialogPackages,
		onAdd,
		onRemove,
	}) {
		const items = useMemo<SelectItemSpec<string>[]>(
			() =>
				allDialogPackages.map((d) => ({
					value: d.name,
					label: d.name,
					isDisabled: dialogs.includes(d.name),
				})),
			[allDialogPackages, dialogs]
		);

		return (
			<div className="flex flex-col gap-2">
				<label className="text-sm font-bold opacity-70">{label}</label>
				<div className="flex flex-col gap-2">
					{/* Dialog List */}
					{dialogs.length > 0 && (
						<div className="flex flex-col gap-1">
							{dialogs.map((dialog, idx) => (
								<DialogItem
									key={idx}
									dialog={dialog}
									onRemove={() => onRemove(idx)}
								/>
							))}
						</div>
					)}
					{/* Add Dialog Dropdown */}
					<Select<string>
						ariaLabel="添加对话包"
						placeholder="添加对话包..."
						value={undefined}
						onChange={(v) => {
							if (v) onAdd(v);
						}}
						items={items}
					/>
				</div>
			</div>
		);
	}
);
