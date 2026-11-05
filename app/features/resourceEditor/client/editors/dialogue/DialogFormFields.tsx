import { memo, useId } from 'react';

import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import { SPECIAL_PORTRAITS } from '@/domain/data/specialPortraits';
import type { Character } from '@/domain/resourcePack/contracts/character';
import type { Dialog } from '@/domain/resourcePack/contracts/dialogue';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { Select } from '@/features/resourceEditor/client/components/select/Select';

import { CharacterSelector } from './CharacterSelector';
import { PortraitSelector } from './PortraitSelector';
import { useCompositionDraft } from './useCompositionDraft';

interface DialogFormFieldsProps {
	dialog: Dialog;
	customCharacters: Character[];
	onUpdate: (updates: Partial<Dialog>) => void;
}

export const DialogFormFields = memo<DialogFormFieldsProps>(
	function DialogFormFields({ dialog, customCharacters, onUpdate }) {
		const idPos = useId();
		const idText = useId();
		const idType = useId();
		const textDraftProps = useCompositionDraft(dialog.text, (text) => {
			onUpdate({ text });
		});

		const handleCharacterChange = (
			id: number,
			type: Dialog['characterType']
		) => {
			let newPid = dialog.pid;
			// 检查新角色的立绘列表
			if (type === 'Special') {
				const hasPortrait = SPECIAL_PORTRAITS.some(
					(p) => p.characterId === id && p.pid === newPid
				);
				if (!hasPortrait) {
					const firstPortrait = SPECIAL_PORTRAITS.find(
						(p) => p.characterId === id
					);
					newPid = firstPortrait ? firstPortrait.pid : 0;
				}
			} else {
				const customChar = customCharacters.find(
					(c) => c.id === id && c.type === type
				);
				if (customChar) {
					const hasPortrait = customChar.portraits?.some(
						(p) => p.pid === newPid
					);
					if (!hasPortrait) {
						newPid = customChar.portraits?.[0]?.pid ?? 0;
					}
				} else {
					newPid = 0;
				}
			}

			onUpdate({ characterId: id, characterType: type, pid: newPid });
		};

		return (
			<div className="flex flex-1 flex-col justify-between gap-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<CharacterSelector
						characterType={dialog.characterType}
						customCharacters={customCharacters}
						value={dialog.characterId}
						onChange={handleCharacterChange}
					/>
					<PortraitSelector
						characterId={dialog.characterId}
						characterType={dialog.characterType}
						customCharacters={customCharacters}
						value={dialog.pid}
						onChange={(pid) => onUpdate({ pid })}
					/>
					<div className="flex flex-col gap-1">
						<Label htmlFor={idPos}>显示位置</Label>
						<Select<Dialog['position']>
							id={idPos}
							ariaLabel="显示位置"
							value={dialog.position}
							onChange={(v) => onUpdate({ position: v })}
							items={[
								{ value: 'Left', label: '左侧（Left）' },
								{ value: 'Right', label: '右侧（Right）' },
							]}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idType}>角色类型</Label>
						<Input
							isDisabled
							id={idType}
							type="text"
							value={dialog.characterType}
						/>
					</div>
				</div>

				<div className="flex flex-1 flex-col gap-1">
					<Label htmlFor={idText}>对话内容</Label>
					<Textarea
						id={idText}
						placeholder="在此输入对话文本…"
						{...textDraftProps}
						minRows={6}
						className="min-w-0 flex-1"
					/>
				</div>
			</div>
		);
	}
);
