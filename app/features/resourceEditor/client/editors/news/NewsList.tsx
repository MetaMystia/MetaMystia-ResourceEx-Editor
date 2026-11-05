import { memo } from 'react';

import type { INewsNode } from '@/domain/resourcePack/contracts/news';

import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { usePackLabelPrefix } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

interface IProps {
	newsNodes: INewsNode[];
	selectedIndex: number | null;
	onAdd: () => void;
	onSelect: (index: number) => void;
}

export const NewsList = memo<IProps>(function NewsList({
	newsNodes,
	selectedIndex,
	onAdd,
	onSelect,
}) {
	const packLabelPrefix = usePackLabelPrefix();

	return (
		<EditorCollectionPanel
			title="新闻节点列表"
			addLabel="新建新闻"
			emptyTitle="暂无新闻节点"
			hasItems={newsNodes.length > 0}
			onAdd={onAdd}
		>
			{newsNodes.map((newsNode, index) => {
				const hasPrefixWarning =
					packLabelPrefix &&
					packLabelPrefix !== '_' &&
					newsNode.label &&
					!newsNode.label.startsWith(packLabelPrefix);

				return (
					<EditorCollectionItem
						key={index}
						isSelected={selectedIndex === index}
						onSelect={() => onSelect(index)}
					>
						<EditorCollectionItemTitle>
							<span className="min-w-0 break-words">
								{newsNode.title ||
									newsNode.debugLabel ||
									'未命名新闻'}
							</span>
							{hasPrefixWarning && (
								<WarningBadge>前缀不规范</WarningBadge>
							)}
						</EditorCollectionItemTitle>
						<EditorCollectionItemMeta>
							{newsNode.label}
						</EditorCollectionItemMeta>
					</EditorCollectionItem>
				);
			})}
		</EditorCollectionPanel>
	);
});
