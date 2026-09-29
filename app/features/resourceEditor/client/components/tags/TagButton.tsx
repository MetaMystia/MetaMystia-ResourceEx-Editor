import { cn } from '@heroui/theme';
import { type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

export type TTagTone =
	'beverage' | 'ingredient' | 'negative' | 'neutral' | 'positive';

const TAG_UNSELECTED_CLASS_NAME =
	'border-divider bg-content1/40 text-foreground-700';

const TAG_TONE_CLASS_NAMES = {
	beverage: {
		selected:
			'border-tag-beverage-border bg-tag-beverage font-semibold text-tag-beverage-foreground dark:text-tag-beverage-foreground',
		unselected: TAG_UNSELECTED_CLASS_NAME,
	},
	ingredient: {
		selected:
			'border-tag-ingredient-border bg-tag-ingredient font-semibold text-tag-ingredient-foreground dark:text-tag-ingredient-foreground',
		unselected: TAG_UNSELECTED_CLASS_NAME,
	},
	negative: {
		selected:
			'border-tag-negative-border bg-tag-negative font-semibold text-tag-negative-foreground dark:text-tag-negative-foreground',
		unselected: TAG_UNSELECTED_CLASS_NAME,
	},
	neutral: {
		selected:
			'border-primary bg-primary/30 font-semibold text-primary-700 ring-2 ring-primary/30 ring-offset-1 ring-offset-content2 dark:text-primary',
		unselected: 'border-divider bg-content1/40 text-foreground-700',
	},
	positive: {
		selected:
			'border-tag-positive-border bg-tag-positive font-semibold text-tag-positive-foreground dark:text-tag-positive-foreground',
		unselected: TAG_UNSELECTED_CLASS_NAME,
	},
} as const satisfies Record<TTagTone, { selected: string; unselected: string }>;

interface ITagBadgeProps {
	children: ReactNode;
	isMuted?: boolean;
	tone?: TTagTone;
}

export function TagBadge({
	children,
	isMuted = false,
	tone = 'neutral',
}: ITagBadgeProps) {
	return (
		<span
			className={cn(
				TYPOGRAPHY_STYLES.compactInteractiveLabel,
				'inline-flex min-h-7 items-center break-all rounded-small border px-2 py-1 text-center',
				isMuted
					? 'border-divider bg-default/20 text-foreground-500'
					: TAG_TONE_CLASS_NAMES[tone].selected
			)}
		>
			{children}
		</span>
	);
}

interface IProps {
	tag: { id: number; name: string };
	isDisabled?: boolean;
	isInvalid?: boolean;
	isSelected: boolean;
	onClick: () => void;
	tone?: TTagTone;
	title?: string;
}

export function TagButton({
	isDisabled = false,
	isInvalid = false,
	isSelected,
	onClick,
	tag,
	tone = 'neutral',
	title,
}: IProps) {
	const button = (
		<Button
			color="default"
			isDisabled={isDisabled}
			variant={isSelected ? 'flat' : 'bordered'}
			size="sm"
			onPress={onClick}
			aria-invalid={isInvalid || undefined}
			aria-pressed={isSelected}
			className={cn(
				TYPOGRAPHY_STYLES.compactInteractiveLabel,
				'h-auto min-h-10 min-w-0 whitespace-normal break-all rounded-medium border px-3 py-2 text-center sm:min-h-8 sm:px-2 sm:py-1',
				TAG_TONE_CLASS_NAMES[tone][
					isSelected ? 'selected' : 'unselected'
				],
				isInvalid &&
					'ring-2 ring-danger/70 ring-offset-1 ring-offset-content2'
			)}
		>
			{tag.name}
		</Button>
	);

	return title ? <Tooltip content={title}>{button}</Tooltip> : button;
}
