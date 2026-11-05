import { cn } from '@heroui/theme';
import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';

interface DialogItemProps {
	dialog: string;
	onRemove: () => void;
}

export const DialogItem = memo<DialogItemProps>(function DialogItem({
	dialog,
	onRemove,
}) {
	return (
		<div className="flex min-w-0 items-center gap-2 rounded-medium border border-divider bg-content1/60 py-1 pl-3 pr-1">
			<span
				title={dialog}
				className={cn(
					TYPOGRAPHY_STYLES.compactBody,
					'min-w-0 flex-1 truncate'
				)}
			>
				{dialog}
			</span>
			<SectionDeleteButton
				iconOnly
				className="h-10 w-10 shrink-0 sm:h-8 sm:w-8"
				onPress={onRemove}
			>
				移除对话包
			</SectionDeleteButton>
		</div>
	);
});
