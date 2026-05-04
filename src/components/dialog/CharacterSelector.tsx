import { memo, useId, useMemo } from 'react';

import { Select } from '@/design/ui/components';
import type { SelectItemSpec } from '@/design/ui/components';
import { SPECIAL_GUESTS } from '@/data/specialGuest';
import type { Character, CharacterType } from '@/types/resource';
import { Label } from '@/components/common/Label';

interface CharacterSelectorProps {
	characterType: CharacterType;
	customCharacters: Character[];
	value: number;
	onChange: (id: number, type: CharacterType) => void;
}

export const CharacterSelector = memo<CharacterSelectorProps>(
	function CharacterSelector({
		characterType,
		customCharacters,
		value,
		onChange,
	}: CharacterSelectorProps) {
		const id = useId();

		const items = useMemo<SelectItemSpec<string>[]>(() => {
			const sections: SelectItemSpec<string>[] = [
				{
					section: '游戏角色',
					options: SPECIAL_GUESTS.map(({ id, name }) => ({
						value: `Special:${id}`,
						label: `(${id}) ${name}`,
					})),
				},
			];
			if (customCharacters.length > 0) {
				sections.push({
					section: '自定义角色',
					options: customCharacters.map(({ id, name, type }) => ({
						value: `${type}:${id}`,
						label: `(${id}) ${name} [${type}]`,
					})),
				});
			}
			return sections;
		}, [customCharacters]);

		return (
			<div className="flex flex-col gap-1">
				<Label htmlFor={id}>角色</Label>
				<Select<string>
					id={id}
					ariaLabel="角色"
					value={`${characterType}:${value}`}
					onChange={(key) => {
						const [type, idStr] = key.split(':');
						if (type && idStr) {
							onChange(parseInt(idStr), type as CharacterType);
						}
					}}
					items={items}
				/>
			</div>
		);
	}
);
