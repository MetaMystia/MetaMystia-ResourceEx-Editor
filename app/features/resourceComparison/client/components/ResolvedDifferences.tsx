import { cn } from '@heroui/theme';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import { type IResolvedComparisonDifference } from '@/features/resourceComparison/client/useFieldComparison';

interface IProps {
	isUndoAvailable: boolean;
	resolvedDifferences: readonly IResolvedComparisonDifference[];
	onUndo: () => void;
}

export function ResolvedDifferences({
	isUndoAvailable,
	onUndo,
	resolvedDifferences,
}: IProps) {
	if (resolvedDifferences.length === 0 && !isUndoAvailable) return null;
	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p className={cn(TYPOGRAPHY_STYLES.compactBody, 'text-success')}>
				{resolvedDifferences.length > 0
					? `已解决${resolvedDifferences.length}项，最近：${resolvedDifferences[0]?.label ?? ''}`
					: '已保存修改，可撤销上一步'}
			</p>
			<Button
				isDisabled={!isUndoAvailable}
				variant="flat"
				onPress={onUndo}
			>
				撤销上一步
			</Button>
		</div>
	);
}
