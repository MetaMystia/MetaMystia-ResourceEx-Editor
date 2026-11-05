'use client';

import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Input from '@/design/ui/components/input';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';

interface IProps<T = string> {
	items: T[];
	onUpdate: (index: number, value: T) => void;
	onRemove: (index: number) => void;
	renderItem?: (
		item: T,
		index: number,
		onChange: (value: T) => void
	) => ReactNode;
	placeholder?: string;
	emptyMessage?: string;
}

export function ArrayFieldEditor<T = string>({
	emptyMessage = '暂无项目',
	items,
	onRemove,
	onUpdate,
	placeholder = '',
	renderItem,
}: IProps<T>) {
	const containerRef = useFocusOnItemAppend(items.length);

	const defaultRenderItem = (
		item: T,
		index: number,
		onChange: (value: T) => void
	) => (
		<div
			key={index}
			data-editor-appended-item
			className="flex items-center gap-2"
		>
			<Input
				value={item as string}
				onValueChange={(value) => onChange(value as T)}
				placeholder={placeholder}
			/>
			<SectionDeleteButton
				iconOnly
				className="h-10 w-10 shrink-0 sm:h-10 sm:w-10"
				confirmTitle="确定要删除这位作者吗？"
				onPress={() => onRemove(index)}
			>
				删除作者
			</SectionDeleteButton>
		</div>
	);

	return (
		<div ref={containerRef} className="flex flex-col gap-2">
			{items.map((item, index) =>
				renderItem
					? renderItem(item, index, (value) => onUpdate(index, value))
					: defaultRenderItem(item, index, (value) =>
							onUpdate(index, value)
						)
			)}
			{items.length === 0 && (
				<div
					className={cn(
						TYPOGRAPHY_STYLES.emptyDescription,
						'rounded-medium border border-dashed border-divider p-4 text-center'
					)}
				>
					{emptyMessage}
				</div>
			)}
		</div>
	);
}
