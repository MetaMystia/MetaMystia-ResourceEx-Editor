'use client';

import { useCallback, useMemo } from 'react';

import {
	createClothesPixelFullConfigName,
	createDefaultClothesAssetPaths,
	createDefaultClothesSpritePaths,
	followClothesDefaults,
} from '@/domain/resourcePack/clothesDefaults';
import type { Clothes } from '@/domain/resourcePack/contracts/items';
import { remapResourcePackItemReferences } from '@/domain/resourcePack/entityReferences';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import {
	findNextAvailableInteger,
	findNextAvailableSuffixedValue,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { ClothesEditor } from './ClothesEditor';
import { ClothesList } from './ClothesList';

export function ClothesEditorScreen() {
	const {
		moveAssets,
		resourcePack: data,
		updateResourcePack,
	} = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	useEditorEntityNavigationIntent({
		entityKind: 'clothes',
		getStableKey: (clothes) => clothes.id,
		items: data.clothes ?? [],
		onSelect: setSelectedIndex,
	});

	const addClothes = useCallback(() => {
		const clothes = data.clothes ?? [];
		const newId = findNextAvailableInteger(
			clothes.map((item) => item.id),
			getEntityIdAllocationStart(data.packInfo.idRangeStart, 9000)
		);
		const newName = findNextAvailableSuffixedValue(
			clothes.map((item) => item.name),
			'新衣服'
		);
		const newClothes: Clothes = {
			id: newId,
			name: newName,
			description: '',
			...createDefaultClothesAssetPaths(newId),
			pixelFullConfig: {
				name: createClothesPixelFullConfigName(
					data.packInfo.label,
					newId,
					newName
				),
				...createDefaultClothesSpritePaths(newId),
			},
		};
		const newClothesList = [...clothes, newClothes];
		updateResourcePack(() => ({ ...data, clothes: newClothesList }));
		setSelectedIndex(newClothesList.length - 1);
	}, [data, updateResourcePack]);

	const removeClothes = useCallback(
		(index: number) => {
			const newClothesList = (data.clothes || []).filter(
				(_, i) => i !== index
			);
			updateResourcePack(() => ({ ...data, clothes: newClothesList }));
			if (selectedIndex === index) {
				replaceSelection(newClothesList.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateClothes = useCallback(
		(index: number | null, updates: Partial<Clothes>) => {
			if (index === null) {
				return;
			}
			let pathMoves: ReadonlyMap<string, string> = new Map();
			updateResourcePack((current) => {
				const previous = current.clothes[index];
				if (!previous) return current;
				const followed = followClothesDefaults(
					previous,
					{ ...previous, ...updates },
					current.clothes.filter((_, i) => i !== index),
					current.packInfo.label
				);
				pathMoves = followed.pathMoves;
				const clothes = [...current.clothes];
				clothes[index] = followed.clothes;
				return remapResourcePackItemReferences(
					{ ...current, clothes },
					'Item',
					previous.id,
					followed.clothes.id
				);
			});
			if (pathMoves.size > 0) {
				moveAssets(
					Array.from(pathMoves, ([from, to]) => ({ from, to }))
				);
			}
		},
		[moveAssets, updateResourcePack]
	);

	const selectedClothes = useMemo(
		() =>
			selectedIndex === null
				? null
				: ((data.clothes || [])[selectedIndex] ?? null),
		[data, selectedIndex]
	);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<ClothesList
				clothes={data.clothes || []}
				selectedIndex={selectedIndex}
				onAdd={addClothes}
				onRemove={removeClothes}
				onSelect={setSelectedIndex}
			/>

			<ClothesEditor
				key={detailKey ?? 'empty'}
				clothes={selectedClothes}
				clothesIndex={selectedIndex}
				onUpdate={(updates: Partial<Clothes>) => {
					updateClothes(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
