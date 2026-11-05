import { memo, useCallback } from 'react';

import type { Clothes } from '@/domain/resourcePack/contracts/items';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface ClothesListProps {
	clothes: Clothes[];
	selectedIndex: number | null;
	onSelect: (index: number) => void;
	onAdd: () => void;
	onRemove: (index: number) => void;
}

export const ClothesList = memo<ClothesListProps>(function ClothesList({
	clothes,
	selectedIndex,
	onSelect,
	onAdd,
	onRemove,
}) {
	const { resourcePack } = useResourceEditor();
	const isIdDuplicate = useCallback(
		(id: number, index: number) =>
			clothes.some(
				(item, itemIndex) => itemIndex !== index && item.id === id
			),
		[clothes]
	);

	return (
		<EditorCollectionPanel
			title="衣服列表"
			addLabel="新建衣服"
			emptyTitle="暂无衣服"
			hasItems={clothes.length > 0}
			onAdd={onAdd}
		>
			{clothes.map((item, index) => {
				const isDuplicate = isIdDuplicate(item.id, index);
				const giftTitles = (resourcePack.gifts ?? []).flatMap(
					(gift, giftIndex) =>
						gift.productType === 'Item' &&
						gift.productId === item.id
							? [
									`${giftIndex + 1}. ${gift.title || '未命名礼物'}`,
								]
							: []
				);

				return (
					<EditorCollectionItem
						key={index}
						isInvalid={isDuplicate}
						isSelected={selectedIndex === index}
						onSelect={() => onSelect(index)}
						actions={
							<SectionDeleteButton
								iconOnly
								confirmTitle="删除这件衣服？"
								confirmDescription={
									giftTitles.length > 0
										? `以下礼物仍引用此物品：${giftTitles.join('、')}。删除后请修改对应礼物。`
										: undefined
								}
								onPress={() => onRemove(index)}
							>
								删除衣服
							</SectionDeleteButton>
						}
					>
						<EditorCollectionItemTitle>
							<span className="min-w-0 break-words">
								{item.name || '未命名衣服'}
							</span>
							{isDuplicate && <ErrorBadge>ID重复</ErrorBadge>}
						</EditorCollectionItemTitle>
						<EditorCollectionItemMeta>
							ID：{item.id}
						</EditorCollectionItemMeta>
					</EditorCollectionItem>
				);
			})}
		</EditorCollectionPanel>
	);
});
