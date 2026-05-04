import { memo, useId, useMemo } from 'react';

import { Select } from '@/design/ui/components';
import { SPECIAL_PORTRAITS } from '@/data/specialPortraits';
import type { Character, CharacterType } from '@/types/resource';
import { Label } from '@/components/common/Label';

interface PortraitSelectorProps {
	characterId: number;
	characterType: CharacterType;
	value: number;
	onChange: (pid: number) => void;
	customCharacters: Character[];
}

export const PortraitSelector = memo<PortraitSelectorProps>(
	function PortraitSelector({
		characterId,
		characterType,
		customCharacters,
		value,
		onChange,
	}) {
		const id = useId();

		const portraits = useMemo(() => {
			const customChar = customCharacters.find(
				({ id, type }) => id === characterId && type === characterType
			);

			if (customChar) {
				return (customChar.portraits ?? []).map(({ label, pid }) => ({
					pid,
					name: label || `立绘${pid}`,
				}));
			}
			if (characterType === 'Special') {
				return SPECIAL_PORTRAITS.filter(
					(p) => p.characterId === characterId
				).map(({ name, pid }) => ({ name, pid }));
			}

			return [];
		}, [characterId, characterType, customCharacters]);

		return (
			<div className="flex flex-col gap-1">
				<Label htmlFor={id}>表情/立绘</Label>
				<Select<number>
					id={id}
					ariaLabel="表情/立绘"
					value={value}
					onChange={(v) => onChange(v)}
					placeholder={
						portraits.length === 0 ? '无可用立绘' : '请选择...'
					}
					isDisabled={portraits.length === 0}
					items={portraits.map(({ name, pid }) => ({
						value: pid,
						label: `(${pid}) ${name}`,
					}))}
				/>
			</div>
		);
	}
);
