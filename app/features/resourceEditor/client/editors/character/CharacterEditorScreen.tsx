'use client';

import { useCallback, useMemo, useState } from 'react';

import type {
	Character,
	CharacterType,
} from '@/domain/resourcePack/contracts/character';
import {
	remapResourcePackCharacterPortraitReferences,
	remapResourcePackCharacterReferences,
} from '@/domain/resourcePack/entityReferences';

import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import {
	findNextAvailableInteger,
	findNextAvailableSuffixedValue,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { CharacterEditor } from './CharacterEditor';
import { CharacterList } from './CharacterList';

const DEFAULT_CHARACTER = {
	id: 0,
	name: '',
	descriptions: ['', '', ''],
	type: 'Special' as const,
	portraits: [],
};

export function CharacterEditorScreen() {
	const {
		clearGuestDrafts,
		replaceGuestDraftCharacterId,
		resourcePack: data,
		updateResourcePack,
	} = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	useEditorEntityNavigationIntent({
		entityKind: 'character',
		getStableKey: (character) => character.id,
		items: data.characters,
		onSelect: setSelectedIndex,
	});

	const sortCharacters = useCallback((chars: Character[]) => {
		const typeOrder: Record<CharacterType, number> = {
			Self: 0,
			Special: 1,
			Normal: 2,
			Unknown: 3,
		};

		return [...chars].sort((a, b) => {
			if (a.type !== b.type) {
				return typeOrder[a.type] - typeOrder[b.type];
			}
			return a.id - b.id;
		});
	}, []);

	const addCharacter = useCallback(() => {
		const newId = findNextAvailableInteger(
			data.characters.map((character) => character.id),
			getEntityIdAllocationStart(data.packInfo.idRangeStart, 9000)
		);
		const packLabel = data.packInfo.label;
		const labelPrefix = packLabel ? `_${packLabel}_` : '_';
		const newChar: Character = {
			...DEFAULT_CHARACTER,
			id: newId,
			label: findNextAvailableSuffixedValue(
				data.characters.map((character) => character.label),
				`${labelPrefix}Character_`
			),
		};
		const newCharacters = sortCharacters([...data.characters, newChar]);
		updateResourcePack(() => ({ ...data, characters: newCharacters }));
		const newIndex = newCharacters.indexOf(newChar);
		setSelectedIndex(newIndex);
	}, [data, sortCharacters, updateResourcePack]);

	const removeCharacter = useCallback(
		(index: number | null) => {
			if (index === null) {
				return;
			}
			const newCharacters = [...data.characters];
			const removedCharacter = newCharacters[index];
			if (removedCharacter) clearGuestDrafts(removedCharacter.id);
			newCharacters.splice(index, 1);
			updateResourcePack(() => ({ ...data, characters: newCharacters }));
			setSelectedIndex(null);
		},
		[clearGuestDrafts, data, updateResourcePack]
	);

	const updateCharacter = useCallback(
		(index: number | null, updates: Partial<Character>) => {
			if (index === null) {
				return;
			}

			const newCharacters = [...data.characters];
			const previousCharacter = newCharacters[index];
			if (!previousCharacter) return;
			const updatedChar = {
				...previousCharacter,
				...updates,
			} as Character;
			if (previousCharacter.id !== updatedChar.id) {
				replaceGuestDraftCharacterId(
					previousCharacter.id,
					updatedChar.id
				);
			}
			newCharacters[index] = updatedChar;
			const sorted =
				'id' in updates || 'type' in updates
					? sortCharacters(newCharacters)
					: newCharacters;
			let nextData = { ...data, characters: sorted };
			if (
				previousCharacter.id !== updatedChar.id ||
				previousCharacter.label !== updatedChar.label ||
				previousCharacter.type !== updatedChar.type
			) {
				nextData = remapResourcePackCharacterReferences(nextData, {
					fromId: previousCharacter.id,
					fromLabel: previousCharacter.label,
					fromType: previousCharacter.type,
					toId: updatedChar.id,
					toLabel: updatedChar.label,
					toType: updatedChar.type,
				});
			}
			if (
				updates.portraits &&
				updates.portraits.length ===
					(previousCharacter.portraits ?? []).length
			) {
				const pidMap = new Map<number, number>();
				updates.portraits.forEach((portrait, portraitIndex) => {
					const previousPid =
						previousCharacter.portraits?.[portraitIndex]?.pid;
					if (
						previousPid !== undefined &&
						previousPid !== portrait.pid
					) {
						pidMap.set(previousPid, portrait.pid);
					}
				});
				nextData = remapResourcePackCharacterPortraitReferences(
					nextData,
					updatedChar.id,
					updatedChar.type,
					pidMap
				);
			}
			updateResourcePack(() => nextData);

			if ('id' in updates || 'type' in updates) {
				const newIndex = sorted.indexOf(updatedChar);
				setSelectedIndex(newIndex);
			}
		},
		[data, replaceGuestDraftCharacterId, sortCharacters, updateResourcePack]
	);

	const selectedChar = useMemo(() => {
		if (selectedIndex === null) {
			return null;
		}

		return data.characters[selectedIndex] ?? null;
	}, [data.characters, selectedIndex]);

	const isIdDuplicate = useCallback(
		(id: number, index: number | null) => {
			return data.characters.some((c, i) => i !== index && c.id === id);
		},
		[data.characters]
	);

	const isLabelDuplicate = useCallback(
		(label: string, index: number | null) =>
			Boolean(label) &&
			data.characters.some(
				(character, characterIndex) =>
					characterIndex !== index && character.label === label
			),
		[data.characters]
	);

	return (
		<EditorWorkspace detailKey={selectedIndex}>
			<CharacterList
				characters={data.characters}
				selectedIndex={selectedIndex}
				onAdd={addCharacter}
				onSelect={setSelectedIndex}
			/>

			<CharacterEditor
				character={selectedChar}
				allEvents={data.eventNodes || []}
				allDialogPackages={data.dialogPackages || []}
				isIdDuplicate={
					selectedChar
						? isIdDuplicate(selectedChar.id, selectedIndex)
						: false
				}
				isLabelDuplicate={
					selectedChar
						? isLabelDuplicate(selectedChar.label, selectedIndex)
						: false
				}
				onRemove={() => {
					removeCharacter(selectedIndex);
				}}
				onUpdate={(updates) => {
					updateCharacter(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
