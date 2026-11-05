import { cn } from '@heroui/theme';
import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import type { MissionNode } from '@/domain/resourcePack/contracts/mission';

import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { usePackLabelPrefix } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

interface MissionListProps {
	missions: MissionNode[];
	selectedIndex: number | null;
	onAdd: () => void;
	onSelect: (index: number) => void;
}

export const MissionList = memo<MissionListProps>(function MissionList({
	missions,
	selectedIndex,
	onAdd,
	onSelect,
}) {
	const packLabelPrefix = usePackLabelPrefix();

	return (
		<EditorCollectionPanel
			title="任务节点列表"
			addLabel="新建任务"
			emptyTitle="暂无任务节点"
			hasItems={missions.length > 0}
			onAdd={onAdd}
		>
			{missions.map((mission, index) => {
				const hasPrefixWarning =
					packLabelPrefix &&
					packLabelPrefix !== '_' &&
					mission.label &&
					!mission.label.startsWith(packLabelPrefix);

				return (
					<EditorCollectionItem
						key={index}
						isSelected={selectedIndex === index}
						onSelect={() => onSelect(index)}
					>
						<EditorCollectionItemTitle>
							<span className="min-w-0 break-words">
								{mission.title ||
									mission.debugLabel ||
									'未命名任务'}
							</span>
							{hasPrefixWarning && (
								<WarningBadge>前缀不规范</WarningBadge>
							)}
						</EditorCollectionItemTitle>
						<EditorCollectionItemMeta>
							<span
								className={cn(
									TYPOGRAPHY_STYLES.badgeLabel,
									'mr-2 rounded-small bg-primary/15 px-2 py-0.5 text-primary'
								)}
							>
								{mission.missionType}
							</span>
							<span>{mission.label}</span>
						</EditorCollectionItemMeta>
					</EditorCollectionItem>
				);
			})}
		</EditorCollectionPanel>
	);
});
