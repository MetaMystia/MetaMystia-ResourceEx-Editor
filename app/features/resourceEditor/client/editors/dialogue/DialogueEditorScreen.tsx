'use client';

import { useCallback, useMemo } from 'react';

import type {
	Dialog,
	DialogPackage,
} from '@/domain/resourcePack/contracts/dialogue';
import {
	adjustDialogJumpsForDeletion,
	adjustDialogJumpsForInsertion,
} from '@/domain/resourcePack/dialogueReferences';
import { remapResourcePackLabelReferences } from '@/domain/resourcePack/entityReferences';

import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { DialogEditor } from './DialogEditor';
import { DialogPackageList } from './DialogPackageList';

const DEFAULT_DIALOG: Dialog = {
	characterId: 0,
	characterType: 'Special',
	pid: 0,
	position: 'Left',
	text: '',
};

export function DialogueEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	useEditorEntityNavigationIntent({
		entityKind: 'dialogue',
		getStableKey: (dialogPackage) => dialogPackage.name,
		items: data.dialogPackages,
		onSelect: setSelectedIndex,
	});

	const addDialogPackage = useCallback(() => {
		const packLabel = data.packInfo.label;
		const namePrefix = packLabel ? `_${packLabel}_` : '_';
		const newPkg: DialogPackage = {
			name: findNextAvailableSuffixedValue(
				data.dialogPackages.map((dialogPackage) => dialogPackage.name),
				`${namePrefix}Dialog_`
			),
			dialogList: [],
		};
		const newPackages = [...data.dialogPackages, newPkg];
		updateResourcePack(() => ({ ...data, dialogPackages: newPackages }));
		setSelectedIndex(newPackages.length - 1);
	}, [data, updateResourcePack]);

	const removeDialogPackage = useCallback(
		(index: number) => {
			const newPackages = data.dialogPackages.filter(
				(_, i) => i !== index
			);
			updateResourcePack(() => ({
				...data,
				dialogPackages: newPackages,
			}));
			if (selectedIndex === index) {
				replaceSelection(newPackages.length > 0 ? 0 : null);
			} else if (selectedIndex !== null && selectedIndex > index) {
				setSelectedIndex(selectedIndex - 1);
			}
		},
		[data, replaceSelection, selectedIndex, updateResourcePack]
	);

	const updateDialogPackage = useCallback(
		(index: number | null, updates: Partial<DialogPackage>) => {
			if (index === null) {
				return;
			}
			const newPackages = [...data.dialogPackages];
			const currentPackage = newPackages[index];
			if (!currentPackage) {
				return;
			}
			newPackages[index] = { ...currentPackage, ...updates };
			let nextData = { ...data, dialogPackages: newPackages };
			if (
				updates.name !== undefined &&
				updates.name !== currentPackage.name
			) {
				nextData = remapResourcePackLabelReferences(
					nextData,
					'DialogPackage',
					currentPackage.name,
					updates.name
				);
			}
			updateResourcePack(() => nextData);
		},
		[data, updateResourcePack]
	);

	const addDialog = useCallback(
		(
			insertIndex?: number,
			searchPosition?: Dialog['position'] | 'recent'
		) => {
			if (selectedIndex === null) {
				return;
			}

			const newPackages = [...data.dialogPackages];
			const pkg = newPackages[selectedIndex];
			if (!pkg) {
				return;
			}

			let refDialog: Dialog | null = null;

			// 根据 searchPosition 查找模板对话
			if (searchPosition && searchPosition !== 'recent') {
				// 搜索指定位置的最近对话
				const searchStart =
					insertIndex !== undefined
						? insertIndex - 1
						: pkg.dialogList.length - 1;
				for (let i = searchStart; i >= 0; i--) {
					const dialog = pkg.dialogList[i];
					if (dialog?.position === searchPosition) {
						refDialog = dialog;
						break;
					}
				}
			} else {
				// 默认行为：使用最近的对话
				let refDialogIndex: number | null = null;
				if (insertIndex !== undefined) {
					refDialogIndex = insertIndex > 0 ? insertIndex - 1 : null;
				} else {
					refDialogIndex =
						pkg.dialogList.length > 0
							? pkg.dialogList.length - 1
							: null;
				}
				refDialog =
					refDialogIndex !== null
						? (pkg.dialogList[refDialogIndex] ?? null)
						: null;
			}

			const newDialog: Dialog = refDialog
				? {
						characterId: refDialog.characterId,
						characterType: refDialog.characterType,
						pid: refDialog.pid,
						position: refDialog.position,
						text: '',
					}
				: {
						...DEFAULT_DIALOG,
						position:
							searchPosition && searchPosition !== 'recent'
								? searchPosition
								: DEFAULT_DIALOG.position,
					};

			const resolvedInsertIndex = insertIndex ?? pkg.dialogList.length;
			const dialogList = adjustDialogJumpsForInsertion(
				pkg.dialogList,
				resolvedInsertIndex
			);
			dialogList.splice(resolvedInsertIndex, 0, newDialog);
			newPackages[selectedIndex] = { ...pkg, dialogList };
			updateResourcePack(() => ({
				...data,
				dialogPackages: newPackages,
			}));
		},
		[data, selectedIndex, updateResourcePack]
	);

	const removeDialog = useCallback(
		(dialogIndex: number) => {
			if (selectedIndex === null) {
				return;
			}
			const newPackages = [...data.dialogPackages];
			const pkg = newPackages[selectedIndex];
			if (!pkg) {
				return;
			}

			newPackages[selectedIndex] = {
				...pkg,
				dialogList: adjustDialogJumpsForDeletion(
					pkg.dialogList.filter((_, i) => i !== dialogIndex),
					dialogIndex
				),
			};
			updateResourcePack(() => ({
				...data,
				dialogPackages: newPackages,
			}));
		},
		[data, selectedIndex, updateResourcePack]
	);

	const updateDialog = useCallback(
		(dialogIndex: number, updates: Partial<Dialog>) => {
			if (selectedIndex === null) {
				return;
			}

			const newPackages = [...data.dialogPackages];
			const pkg = newPackages[selectedIndex];
			if (!pkg) {
				return;
			}

			const currentDialog = pkg.dialogList[dialogIndex];
			if (!currentDialog) {
				return;
			}
			const dialogList = [...pkg.dialogList];
			dialogList[dialogIndex] = { ...currentDialog, ...updates };
			newPackages[selectedIndex] = { ...pkg, dialogList };
			updateResourcePack(() => ({
				...data,
				dialogPackages: newPackages,
			}));
		},
		[data, selectedIndex, updateResourcePack]
	);

	const selectedPackage = useMemo(
		() =>
			selectedIndex === null
				? null
				: (data.dialogPackages[selectedIndex] ?? null),
		[data, selectedIndex]
	);

	return (
		<EditorWorkspace detailKey={detailKey}>
			<DialogPackageList
				packages={data.dialogPackages}
				selectedIndex={selectedIndex}
				onAdd={addDialogPackage}
				onRemove={removeDialogPackage}
				onSelect={setSelectedIndex}
			/>

			<DialogEditor
				allPackages={data.dialogPackages}
				dialogPackage={selectedPackage}
				packageIndex={selectedIndex}
				onAddDialog={addDialog}
				onRemoveDialog={removeDialog}
				onUpdate={(updates) => {
					updateDialogPackage(selectedIndex, updates);
				}}
				onUpdateDialog={updateDialog}
			/>
		</EditorWorkspace>
	);
}
