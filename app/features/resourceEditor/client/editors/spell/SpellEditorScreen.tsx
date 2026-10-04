'use client';

import { useState } from 'react';

import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import { UNMANAGED_ID_MIN } from '@/domain/resourcePack/constants';
import type {
	IBuffConfig,
	ISpellConfig,
} from '@/domain/resourcePack/contracts/spell';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import {
	EditorCollectionItem,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import {
	EditorWorkspace,
	useEditorSelection,
} from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import {
	findNextAvailableInteger,
	parseIntegerInput,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorPageNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { SpellAssetField } from './SpellAssetField';
import { SpellEditor } from './SpellEditor';

const COLLECTION_LABELS = {
	spells: '符卡',
	buffs: 'Buff',
	assetBundles: '特效包',
} as const;
type TCollection = keyof typeof COLLECTION_LABELS;

export function SpellEditorScreen() {
	const { resourcePack, updateResourcePack } = useResourceEditor();
	const [collection, setCollection] = useState<TCollection>('spells');
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	const items = resourcePack[collection];
	const label = COLLECTION_LABELS[collection];
	useEditorPageNavigationIntent({
		entityKinds: ['spell', 'buff', 'assetBundle'],
		onTarget: (target) => {
			const targetCollection =
				target.entityKind === 'spell'
					? 'spells'
					: target.entityKind === 'buff'
						? 'buffs'
						: 'assetBundles';
			const index = resourcePack[targetCollection].findIndex(
				(item) =>
					('id' in item ? item.id : item.path) === target.stableKey
			);
			if (index < 0) return false;
			setCollection(targetCollection);
			replaceSelection(index);
			return true;
		},
	});

	function add() {
		const index = items.length;
		updateResourcePack((current) => {
			if (collection === 'spells') {
				const id =
					current.characters.find(
						(character) =>
							!current.spells.some(
								(spell) => spell.id === character.id
							)
					)?.id ?? 0;
				const spell: ISpellConfig = {
					id,
					implementation: '',
					positive: { name: '', description: '', portrait: '' },
					negative: { name: '', description: '', portrait: '' },
				};
				return { ...current, spells: [...current.spells, spell] };
			}
			if (collection === 'buffs') {
				const id = findNextAvailableInteger(
					current.buffs.map((buff) => buff.id),
					current.packInfo.idRangeStart ?? UNMANAGED_ID_MIN
				);
				return {
					...current,
					buffs: [
						...current.buffs,
						{ id, name: '新 Buff', description: '', icon: '' },
					],
				};
			}
			return {
				...current,
				assetBundles: [...current.assetBundles, { path: '' }],
			};
		});
		replaceSelection(index);
	}

	function remove(index: number) {
		updateResourcePack((current) => ({
			...current,
			[collection]: current[collection].filter(
				(_, itemIndex) => itemIndex !== index
			),
		}));
		if (selectedIndex === index) replaceSelection(null);
		else if (selectedIndex !== null && selectedIndex > index)
			setSelectedIndex(selectedIndex - 1);
	}

	function updateSpell(spell: ISpellConfig) {
		updateResourcePack((current) => ({
			...current,
			spells: current.spells.map((item, index) =>
				index === selectedIndex ? spell : item
			),
		}));
	}
	function updateBuff(buff: IBuffConfig) {
		updateResourcePack((current) => ({
			...current,
			buffs: current.buffs.map((item, index) =>
				index === selectedIndex ? buff : item
			),
		}));
	}
	const spell =
		collection === 'spells' && selectedIndex !== null
			? resourcePack.spells[selectedIndex]
			: undefined;
	const buff =
		collection === 'buffs' && selectedIndex !== null
			? resourcePack.buffs[selectedIndex]
			: undefined;
	const bundle =
		collection === 'assetBundles' && selectedIndex !== null
			? resourcePack.assetBundles[selectedIndex]
			: undefined;

	return (
		<>
			<div
				className="mx-auto flex w-full max-w-7xl flex-wrap gap-2 px-4 pt-4 sm:px-6"
				aria-label="符卡资源类型"
			>
				{(Object.keys(COLLECTION_LABELS) as TCollection[]).map(
					(key) => (
						<Button
							key={key}
							aria-pressed={collection === key}
							color={collection === key ? 'primary' : 'default'}
							variant="flat"
							onPress={() => {
								setCollection(key);
								replaceSelection(null);
							}}
						>
							{COLLECTION_LABELS[key]}
						</Button>
					)
				)}
			</div>
			<EditorWorkspace detailKey={`${collection}:${detailKey}`}>
				<EditorCollectionPanel
					title={`${label}列表`}
					addLabel={`新建${label}`}
					emptyTitle={`暂无${label}`}
					hasItems={items.length > 0}
					onAdd={add}
				>
					{items.map((item, index) => (
						<EditorCollectionItem
							key={index}
							isSelected={selectedIndex === index}
							onSelect={() => setSelectedIndex(index)}
							actions={
								<SectionDeleteButton
									iconOnly
									confirmTitle={`删除这项${label}？`}
									onPress={() => remove(index)}
								>
									删除{label}
								</SectionDeleteButton>
							}
						>
							<EditorCollectionItemTitle>
								{'implementation' in item
									? `[${item.id}] ${item.positive.name || '未命名符卡'}`
									: 'id' in item
										? `[${item.id}] ${item.name}`
										: item.path || '未选择特效包'}
							</EditorCollectionItemTitle>
						</EditorCollectionItem>
					))}
				</EditorCollectionPanel>
				{!spell && !buff && !bundle ? (
					<EditorDetailEmptyState itemLabel={label} />
				) : (
					<EditorDetailPanel key={`${collection}:${detailKey}`}>
						<EditorDetailHeader
							title={`${label}编辑`}
							description="编辑符卡及配套显示资源，效果由 Mod 中的符卡实现决定。"
						/>
						{spell && (
							<SpellEditor spell={spell} onUpdate={updateSpell} />
						)}
						{buff && (
							<EditorSection title="Buff 显示信息">
								<Input
									label="Buff ID"
									type="number"
									value={String(buff.id)}
									onValueChange={(raw) => {
										const id = parseIntegerInput(raw);
										if (id !== null)
											updateBuff({ ...buff, id });
									}}
								/>
								<Input
									label="Buff 名称"
									value={buff.name}
									onValueChange={(name) =>
										updateBuff({ ...buff, name })
									}
								/>
								<Textarea
									label="Buff 说明"
									description="保留 $a、$b、$c 等占位符，具体含义由符卡实现决定。"
									value={buff.description}
									onValueChange={(description) =>
										updateBuff({ ...buff, description })
									}
								/>
								<SpellAssetField
									label="Buff 图标路径"
									path={buff.icon}
									isImage
									onChange={(icon) =>
										updateBuff({ ...buff, icon })
									}
								/>
							</EditorSection>
						)}
						{bundle && (
							<EditorSection title="AssetBundle 文件">
								<SpellAssetField
									label="AssetBundle 路径"
									path={bundle.path}
									onChange={(path) =>
										updateResourcePack((current) => ({
											...current,
											assetBundles:
												current.assetBundles.map(
													(item, index) =>
														index === selectedIndex
															? { ...item, path }
															: item
												),
										}))
									}
								/>
								<p className="text-sm text-foreground-500">
									选择已构建的 AssetBundle
									文件，可无扩展名；这里不构建或预览 Unity
									特效。
								</p>
							</EditorSection>
						)}
					</EditorDetailPanel>
				)}
			</EditorWorkspace>
		</>
	);
}
