'use client';

import { useCallback, useMemo } from 'react';

import type { MerchantConfig } from '@/domain/resourcePack/contracts/merchant';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { MerchantEditor } from './MerchantEditor';
import { MerchantList } from './MerchantList';

const DEFAULT_MERCHANT: MerchantConfig = {
	key: '',
	welcomeDialogPackageNames: [],
	nullDialogPackageNames: [],
	priceMultiplierMin: 1,
	priceMultiplierMax: 1,
	leastSellNum: 1,
	merchandise: [],
};

export function MerchantEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();

	const merchants = useMemo(() => data.merchants || [], [data.merchants]);
	useEditorEntityNavigationIntent({
		entityKind: 'merchant',
		getStableKey: (merchant) => merchant.key,
		items: merchants,
		onSelect: setSelectedIndex,
	});

	const addMerchant = useCallback(() => {
		const newMerchants = [...merchants, { ...DEFAULT_MERCHANT }];
		updateResourcePack(() => ({ ...data, merchants: newMerchants }));
		setSelectedIndex(newMerchants.length - 1);
	}, [data, merchants, updateResourcePack]);

	const removeMerchant = useCallback(
		(index: number) => {
			const newMerchants = merchants.filter((_, i) => i !== index);
			updateResourcePack(() => ({ ...data, merchants: newMerchants }));
			if (selectedIndex === index) {
				replaceSelection(newMerchants.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, merchants, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateMerchant = useCallback(
		(index: number | null, updates: Partial<MerchantConfig>) => {
			if (index === null) return;
			const newMerchants = [...merchants];
			newMerchants[index] = {
				...newMerchants[index],
				...updates,
			} as MerchantConfig;
			updateResourcePack(() => ({ ...data, merchants: newMerchants }));
		},
		[data, merchants, updateResourcePack]
	);

	const selectedMerchant = useMemo(
		() =>
			selectedIndex === null ? null : (merchants[selectedIndex] ?? null),
		[merchants, selectedIndex]
	);

	const extFoods = useMemo(() => data.foods || [], [data.foods]);
	const extIngredients = useMemo(
		() => data.ingredients || [],
		[data.ingredients]
	);
	const extBeverages = useMemo(() => data.beverages || [], [data.beverages]);
	const extRecipes = useMemo(() => data.recipes || [], [data.recipes]);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<MerchantList
				merchants={merchants}
				allCharacters={data.characters}
				selectedIndex={selectedIndex}
				onAdd={addMerchant}
				onRemove={removeMerchant}
				onSelect={setSelectedIndex}
			/>

			<MerchantEditor
				merchant={selectedMerchant}
				allCharacters={data.characters}
				allDialogPackages={data.dialogPackages}
				extFoods={extFoods}
				extIngredients={extIngredients}
				extBeverages={extBeverages}
				extRecipes={extRecipes}
				onUpdate={(updates: Partial<MerchantConfig>) => {
					updateMerchant(selectedIndex, updates);
				}}
			/>
		</EditorWorkspace>
	);
}
