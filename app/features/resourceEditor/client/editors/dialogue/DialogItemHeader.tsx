import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import type { Dialog } from '@/domain/resourcePack/contracts/dialogue';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';

interface DialogItemHeaderProps {
	index: number;
	position: Dialog['position'];
	onRemove: () => void;
	onTogglePosition: () => void;
}

export const DialogItemHeader = memo<DialogItemHeaderProps>(
	function DialogItemHeader({ index, position, onRemove, onTogglePosition }) {
		return (
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className={TYPOGRAPHY_STYLES.compactTitle}>
						对话条目#{index + 1}
					</span>
					<Tooltip content="点击切换左右位置">
						<Button
							size="sm"
							variant="flat"
							color={
								position === 'Left' ? 'primary' : 'secondary'
							}
							className="h-10 rounded-medium px-2 text-xs sm:h-8"
							onPress={onTogglePosition}
						>
							{position === 'Left' ? '左侧' : '右侧'}
						</Button>
					</Tooltip>
				</div>
				<SectionDeleteButton
					confirmTitle="确定要删除这条对话吗？"
					onPress={onRemove}
				>
					删除此条
				</SectionDeleteButton>
			</div>
		);
	}
);
