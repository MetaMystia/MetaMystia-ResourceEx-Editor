'use client';

import { EyeIcon } from '@heroui/shared-icons';
import { cn } from '@heroui/theme';
import { memo, useMemo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Popover, {
	PopoverContent,
	PopoverTrigger,
} from '@/design/ui/components/popover';
import Tooltip from '@/design/ui/components/tooltip';

import { getIngredientPrefixLabel } from '@/domain/data/ingredientPrefixes';
import { FOOD_TAGS } from '@/domain/data/tags';
import type { Ingredient } from '@/domain/resourcePack/contracts/items';

import { TagBadge } from '@/features/resourceEditor/client/components/tags/TagButton';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IProps {
	ingredient: Ingredient;
}

function renderDescription(description: string) {
	return description
		.split(/(\r\n|\r|\n|<br\s*\/?>)/gi)
		.map((part, index) =>
			/^(\r\n|\r|\n|<br\s*\/?>)$/i.test(part) ? <br key={index} /> : part
		);
}

export const IngredientPreviewPopover = memo<IProps>(
	function IngredientPreviewPopover({ ingredient }) {
		const { getAssetUrl } = useResourceEditor();
		const tagNames = useMemo(
			() => new Map(FOOD_TAGS.map((item) => [item.id, item.name])),
			[]
		);
		const ingredientName = ingredient.name || '未命名食材';
		const spriteUrl = getAssetUrl(ingredient.spritePath);
		const categories = [
			ingredient.isFish ? '鱼类' : null,
			ingredient.isMeat ? '肉类' : null,
			ingredient.isVeg ? '蔬菜' : null,
		].filter((category): category is string => category !== null);

		return (
			<Popover showArrow>
				<Tooltip content="预览食材">
					<span className="inline-flex">
						<PopoverTrigger>
							<Button
								isIconOnly
								aria-label="预览食材"
								color="primary"
								variant="flat"
								size="sm"
								className="h-10 w-10 rounded-medium sm:h-8 sm:w-8"
							>
								<EyeIcon className="h-4 w-4" />
							</Button>
						</PopoverTrigger>
					</span>
				</Tooltip>
				<PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-3">
					<div
						className={cn(
							TYPOGRAPHY_STYLES.body,
							'grid w-full gap-3'
						)}
					>
						<div className="flex items-center gap-2">
							{spriteUrl ? (
								<img
									src={spriteUrl}
									alt={ingredientName}
									className="image-rendering-pixelated h-8 w-8 shrink-0 object-contain"
								/>
							) : null}
							<div className="min-w-0">
								<p
									title={ingredientName}
									className={cn(
										TYPOGRAPHY_STYLES.subsectionTitle,
										'truncate'
									)}
								>
									{ingredientName}
								</p>
								<p className={TYPOGRAPHY_STYLES.metadata}>
									食材ID：{ingredient.id}
								</p>
							</div>
						</div>

						<div
							className={cn(
								TYPOGRAPHY_STYLES.compactDescription,
								'flex flex-wrap gap-x-4 gap-y-1'
							)}
						>
							<p>售价：{ingredient.baseValue}</p>
							<p>等级：{ingredient.level}</p>
							<p>
								前缀：
								{getIngredientPrefixLabel(ingredient.prefix)}
							</p>
							<p>
								分类：
								{categories.length > 0
									? categories.join('、')
									: '其他'}
							</p>
						</div>

						{ingredient.description ? (
							<p className={TYPOGRAPHY_STYLES.compactDescription}>
								{renderDescription(ingredient.description)}
							</p>
						) : null}

						{ingredient.tags.length > 0 ? (
							<div className="flex flex-wrap gap-1 border-t border-divider pt-3">
								{ingredient.tags.map((id) => (
									<TagBadge key={id} tone="ingredient">
										{tagNames.get(id) ?? `#${id}`}
									</TagBadge>
								))}
							</div>
						) : null}
					</div>
				</PopoverContent>
			</Popover>
		);
	}
);
