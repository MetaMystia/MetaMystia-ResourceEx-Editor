'use client';

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
import { SpellAssetField } from '@/features/resourceEditor/client/editors/spell/SpellAssetField';
import { SpellEditor } from '@/features/resourceEditor/client/editors/spell/SpellEditor';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

const COLLECTION_LABELS = {
	spells: '符卡',
	buffs: 'Buff',
	assetBundles: 'AssetBundle',
} as const;
type TCollection = keyof typeof COLLECTION_LABELS;

const ENTITY_KINDS = {
	spells: 'spell',
	buffs: 'buff',
	assetBundles: 'assetBundle',
} as const;

const COLLECTION_DESCRIPTIONS = {
	spells: '编辑符卡显示资源，效果由 Mod 中的符卡实现决定。',
	buffs: '编辑 Buff 的名称、说明与图标，效果由 Mod 代码决定。',
	assetBundles:
		'声明启动时需要加载的 AssetBundle 文件。仅上传文件不会自动加载。',
} as const;

interface IProps {
	collection: TCollection;
}

export function ResourceDisplayEditorScreen({ collection }: IProps) {
	const { resourcePack, updateResourcePack } = useResourceEditor();
	const { detailKey, replaceSelection, selectedIndex, setSelectedIndex } =
		useEditorSelection();
	const items = resourcePack[collection];
	const label = COLLECTION_LABELS[collection];
	useEditorEntityNavigationIntent<(typeof items)[number]>({
		entityKind: ENTITY_KINDS[collection],
		items,
		getStableKey: (item) => ('id' in item ? item.id : item.path),
		onSelect: replaceSelection,
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
			<EditorWorkspace detailKey={`${collection}:${detailKey}`}>
				{collection !== 'assetBundles' && (
					<aside
						role="note"
						aria-label="编辑范围说明"
						className="col-span-full rounded-medium border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground-700"
					>
						<p className="font-semibold">
							这里只编辑显示资源，不编写实际效果
						</p>
						<p className="mt-1">
							{collection === 'spells'
								? '可配置符卡名称、说明、立绘和特效资源。新增条目或修改说明不会生成或改变效果；符卡需要使用 Mod 已实现的效果，并配齐所需资源。'
								: '可配置 Buff 名称、说明和图标。新增条目不会自动产生或触发 Buff；需要 Mod 中的效果代码使用对应的 Buff ID。'}
						</p>
					</aside>
				)}
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
										: item.path || '未选择 AssetBundle'}
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
							description={COLLECTION_DESCRIPTIONS[collection]}
						/>
						{spell && (
							<SpellEditor spell={spell} onUpdate={updateSpell} />
						)}
						{buff && (
							<EditorSection title="Buff 显示信息">
								<Input
									label="Buff ID"
									description="需与 Mod 效果代码使用的 ID 一致，不要随意更改已有 ID。"
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
									description="保留 $a、$b、$c 等占位符，具体含义由使用该 Buff 的代码决定。"
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
									文件，可无扩展名。当前 Mod
									主要用于符卡特效预制件，不支持在此构建或预览包内资源。
								</p>
							</EditorSection>
						)}
					</EditorDetailPanel>
				)}
			</EditorWorkspace>
		</>
	);
}
