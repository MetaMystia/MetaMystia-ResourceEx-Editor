import { memo, useId } from 'react';

import { Select } from '@/design/ui/components';
import { CharacterSelector } from '@/components/dialog/CharacterSelector';
import { PortraitSelector } from '@/components/dialog/PortraitSelector';
import { SPECIAL_PORTRAITS } from '@/data/specialPortraits';
import type { Character, Dialog } from '@/types/resource';
import { Label } from '@/components/common/Label';

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
								{ value: 'Left', label: '左侧 (Left)' },
								{ value: 'Right', label: '右侧 (Right)' },
							]}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idType}>角色类型</Label>
						<input
							disabled
							id={idType}
							type="text"
							value={dialog.characterType}
							className="h-9 w-full cursor-not-allowed rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none disabled:opacity-50 dark:border-white/10 dark:bg-black/10"
						/>
					</div>
				</div>

				<div className="flex flex-1 flex-col gap-1">
					<Label htmlFor={idText}>对话内容</Label>
					<textarea
						id={idText}
						placeholder="在此输入对话文本..."
						value={dialog.text}
						onChange={(e) => {
							onUpdate({ text: e.target.value });
						}}
						className="min-h-40 w-full flex-1 rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-black/10 dark:focus:border-white/10 dark:focus:ring-white/10"
					/>
				</div>
			</div>
		);
	}
);
