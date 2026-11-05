import { cn } from '@heroui/theme';
import { memo, useCallback } from 'react';

import type { Character } from '@/domain/resourcePack/contracts/character';
import type {
	Dialog,
	DialogAction,
} from '@/domain/resourcePack/contracts/dialogue';

import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { DialogActionsEditor } from './DialogActionsEditor';
import { DialogFormFields } from './DialogFormFields';
import { DialogItemHeader } from './DialogItemHeader';
import { PortraitPreview } from './PortraitPreview';
import { useDialogDisplay } from './useDialogDisplay';

interface DialogItemProps {
	dialog: Dialog;
	index: number;
	dialogCount: number;
	onUpdate: (updates: Partial<Dialog>) => void;
	onRemove: () => void;
	customCharacters: Character[];
}

export const DialogItem = memo<DialogItemProps>(function DialogItem({
	customCharacters,
	dialog,
	dialogCount,
	index,
	onRemove,
	onUpdate,
}) {
	const { portraitPath, charName, portraitName } = useDialogDisplay(
		dialog,
		customCharacters
	);

	const handleActionsChange = useCallback(
		(actions: DialogAction[] | undefined) => {
			onUpdate({ actions });
		},
		[onUpdate]
	);

	return (
		<div className="relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-medium border border-divider bg-content1/50 p-4">
			{/* Position indicator stripe */}
			<div
				className={cn(
					'absolute top-0 h-full w-1',
					dialog.position === 'Left'
						? 'left-0 bg-primary'
						: 'right-0 bg-secondary'
				)}
			/>
			<DialogItemHeader
				index={index}
				position={dialog.position}
				onRemove={onRemove}
				onTogglePosition={() => {
					onUpdate({
						position: dialog.position === 'Left' ? 'Right' : 'Left',
					});
				}}
			/>
			<div className="flex flex-col gap-6 md:flex-row">
				<div className="w-full shrink-0 md:w-56">
					<PortraitPreview
						portraitPath={portraitPath}
						characterId={dialog.characterId}
						charName={charName}
						pid={dialog.pid}
						portraitName={portraitName}
					/>
				</div>
				<DialogFormFields
					dialog={dialog}
					customCharacters={customCharacters}
					onUpdate={onUpdate}
				/>
			</div>
			<DialogActionsEditor
				actions={dialog.actions}
				dialogCount={dialogCount}
				onChange={handleActionsChange}
			/>
		</div>
	);
});

export const DialogItemWrapper = memo<
	Omit<DialogItemProps, 'customCharacters'>
>(function DialogItemWrapper({
	dialog,
	dialogCount,
	index,
	onRemove,
	onUpdate,
}) {
	const { resourcePack } = useResourceEditor();

	return (
		<DialogItem
			customCharacters={resourcePack.characters}
			dialog={dialog}
			dialogCount={dialogCount}
			index={index}
			onRemove={onRemove}
			onUpdate={onUpdate}
		/>
	);
});
