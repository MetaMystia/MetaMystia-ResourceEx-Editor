'use client';

import type { IGiftConfig } from '@/domain/resourcePack/contracts/gift';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorPageNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { GiftEditor } from './GiftEditor';
import { GiftList } from './GiftList';

export function GiftEditorScreen() {
	const { resourcePack, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	const gifts = resourcePack.gifts ?? [];
	useEditorPageNavigationIntent({ entityKinds: ['gift'] });

	function addGift() {
		const gift: IGiftConfig = {
			productType: 'Item',
			productAmount: 1,
			title: '新礼物',
			allowRepeat: false,
			dialogPackageName: '',
		};
		updateResourcePack((current) => ({
			...current,
			gifts: [...(current.gifts ?? []), gift],
		}));
		replaceSelection(gifts.length);
	}

	function removeGift(index: number) {
		updateResourcePack((current) => ({
			...current,
			gifts: (current.gifts ?? []).filter(
				(_, itemIndex) => itemIndex !== index
			),
		}));
		if (selectedIndex === index)
			replaceSelection(
				gifts.length > 1 ? Math.min(index, gifts.length - 2) : null
			);
		else if (selectedIndex !== null && selectedIndex > index)
			setSelectedIndex(selectedIndex - 1);
	}

	function moveGift(index: number, direction: -1 | 1) {
		const targetIndex = index + direction;
		if (targetIndex < 0 || targetIndex >= gifts.length) return;
		updateResourcePack((current) => {
			const nextGifts = [...(current.gifts ?? [])];
			const gift = nextGifts[index];
			const target = nextGifts[targetIndex];
			if (!gift || !target) return current;
			nextGifts[index] = target;
			nextGifts[targetIndex] = gift;
			return { ...current, gifts: nextGifts };
		});
		if (selectedIndex === index) setSelectedIndex(targetIndex);
		else if (selectedIndex === targetIndex) setSelectedIndex(index);
	}

	function updateGift(updates: Partial<IGiftConfig>) {
		if (selectedIndex === null) return;
		updateResourcePack((current) => ({
			...current,
			gifts: (current.gifts ?? []).map((gift, index) =>
				index === selectedIndex ? { ...gift, ...updates } : gift
			),
		}));
	}

	return (
		<EditorWorkspace detailKey={detailKey}>
			<GiftList
				gifts={gifts}
				selectedIndex={selectedIndex}
				onAdd={addGift}
				onMove={moveGift}
				onRemove={removeGift}
				onSelect={setSelectedIndex}
			/>
			<GiftEditor
				key={detailKey ?? 'empty'}
				gift={
					selectedIndex === null
						? null
						: (gifts[selectedIndex] ?? null)
				}
				onUpdate={updateGift}
			/>
		</EditorWorkspace>
	);
}
