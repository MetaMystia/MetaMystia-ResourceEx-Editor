import Button from '@/design/ui/components/button';

import type { IGiftConfig } from '@/domain/resourcePack/contracts/gift';
import { validateGift } from '@/domain/resourcePack/giftValidation';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IProps {
	gifts: readonly IGiftConfig[];
	selectedIndex: number | null;
	onAdd: () => void;
	onMove: (index: number, direction: -1 | 1) => void;
	onRemove: (index: number) => void;
	onSelect: (index: number) => void;
}

export function GiftList({
	gifts,
	selectedIndex,
	onAdd,
	onMove,
	onRemove,
	onSelect,
}: IProps) {
	const { resourcePack } = useResourceEditor();
	return (
		<EditorCollectionPanel
			title="礼物列表"
			addLabel="新建礼物"
			emptyTitle="暂无礼物"
			hasItems={gifts.length > 0}
			onAdd={onAdd}
		>
			{gifts.map((gift, index) => {
				const isInvalid = validateGift(gift, resourcePack).some(
					(issue) => issue.severity === 'error'
				);
				return (
					<EditorCollectionItem
						key={index}
						isInvalid={isInvalid}
						isSelected={selectedIndex === index}
						onSelect={() => onSelect(index)}
						actions={
							<div className="flex flex-col items-center gap-1">
								<Button
									size="sm"
									variant="light"
									aria-label={`上移礼物${index + 1}`}
									isDisabled={index === 0}
									onPress={() => onMove(index, -1)}
								>
									上移
								</Button>
								<Button
									size="sm"
									variant="light"
									aria-label={`下移礼物${index + 1}`}
									isDisabled={index === gifts.length - 1}
									onPress={() => onMove(index, 1)}
								>
									下移
								</Button>
								<SectionDeleteButton
									iconOnly
									confirmTitle="删除这份礼物？"
									onPress={() => onRemove(index)}
								>
									删除礼物
								</SectionDeleteButton>
							</div>
						}
					>
						<EditorCollectionItemTitle>
							{index + 1}. {gift.title || '未命名礼物'}
							{isInvalid && <ErrorBadge>待完善</ErrorBadge>}
						</EditorCollectionItemTitle>
						<EditorCollectionItemMeta>
							Item ID：{gift.itemId ?? '未填写'} ·{' '}
							{gift.allowRepeat ? '允许重复' : '持有时不再发放'}
						</EditorCollectionItemMeta>
					</EditorCollectionItem>
				);
			})}
		</EditorCollectionPanel>
	);
}
