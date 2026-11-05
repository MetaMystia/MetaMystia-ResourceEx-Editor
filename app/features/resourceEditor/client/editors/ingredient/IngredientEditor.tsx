import { cn } from '@heroui/theme';
import { memo, useCallback, useId, useMemo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';
import Textarea from '@/design/ui/components/textarea';

import {
	INGREDIENT_PREFIX_NONE_ID,
	INGREDIENT_PREFIXES,
} from '@/domain/data/ingredientPrefixes';
import { FOOD_TAGS } from '@/domain/data/tags';
import type { Ingredient } from '@/domain/resourcePack/contracts/items';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { TagsField } from '@/features/resourceEditor/client/components/tags/TagsField';
import { SpriteUploader } from '@/features/resourceEditor/client/components/uploads/SpriteUploader';
import { IdRangeBadge } from '@/features/resourceEditor/client/editors/info/IdRangeBadge';
import { parseIntegerInput } from '@/features/resourceEditor/client/editorValueAllocation';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IngredientEditorProps {
	ingredient: Ingredient | null;
	ingredientIndex: number | null;
	onUpdate: (updates: Partial<Ingredient>) => void;
}

export const IngredientEditor = memo<IngredientEditorProps>(
	function IngredientEditor({ ingredient, onUpdate }) {
		const idId = useId();
		const idName = useId();
		const idDescription = useId();
		const idLevel = useId();
		const idPrefix = useId();
		const idBaseValue = useId();

		const isIdTooSmall = ingredient && ingredient.id < 9000;

		const { getAssetUrl, updateAsset } = useResourceEditor();

		const handleSpriteUpdate = useCallback(
			(blob: Blob) => {
				if (!ingredient) {
					return { isSuccess: false, error: '未选择食材。' };
				}
				return updateAsset(ingredient.spritePath, blob);
			},
			[ingredient, updateAsset]
		);

		const prefixItems = useMemo(
			() =>
				INGREDIENT_PREFIXES.map((p) => ({
					value: p.id,
					label: `[${p.id}] ${p.label}`,
				})),
			[]
		);

		if (!ingredient) {
			return <EditorDetailEmptyState itemLabel="食材" />;
		}

		const spriteUrl = getAssetUrl(ingredient.spritePath);

		const prefixValue = INGREDIENT_PREFIXES.some(
			(p) => p.id === ingredient.prefix
		)
			? ingredient.prefix
			: INGREDIENT_PREFIX_NONE_ID;
		const isOther =
			!ingredient.isFish && !ingredient.isMeat && !ingredient.isVeg;

		return (
			<EditorDetailPanel>
				<EditorDetailHeader title="食材编辑" />

				<EditorSection title="基本信息">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between">
								<Label htmlFor={idId}>ID</Label>
								<div className="flex gap-2">
									{isIdTooSmall && (
										<ErrorBadge>ID需&ge;9000</ErrorBadge>
									)}
									<IdRangeBadge id={ingredient.id} />
								</div>
							</div>
							<Input
								id={idId}
								type="number"
								value={
									isNaN(ingredient.id)
										? ''
										: String(ingredient.id)
								}
								onChange={(e) => {
									const value = parseIntegerInput(
										e.target.value
									);
									if (value !== null) onUpdate({ id: value });
								}}
								isInvalid={Boolean(isIdTooSmall)}
							/>
						</div>

						<div className="flex flex-col gap-1">
							<Label htmlFor={idName}>名称（Name）</Label>
							<Input
								id={idName}
								type="text"
								value={ingredient.name}
								onChange={(e) =>
									onUpdate({ name: e.target.value })
								}
							/>
						</div>

						<div className="col-span-full flex flex-col gap-1">
							<Label htmlFor={idDescription}>
								描述（Description）
							</Label>
							<Textarea
								id={idDescription}
								value={ingredient.description}
								onChange={(e) =>
									onUpdate({ description: e.target.value })
								}
								minRows={3}
							/>
						</div>
					</div>
				</EditorSection>

				<EditorSection title="属性">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="flex flex-col gap-1">
							<Label htmlFor={idLevel} wrapperClassName="min-h-6">
								等级（Level）
							</Label>
							<Input
								id={idLevel}
								type="number"
								min={1}
								max={5}
								value={
									isNaN(ingredient.level)
										? ''
										: String(ingredient.level)
								}
								onChange={(e) => {
									const value = parseIntegerInput(
										e.target.value
									);
									if (value !== null)
										onUpdate({ level: value });
								}}
							/>
						</div>

						<div className="flex flex-col gap-1">
							<Label
								htmlFor={idPrefix}
								wrapperClassName="min-h-6"
								tip={
									<div
										className={cn(
											TYPOGRAPHY_STYLES.compactBody,
											'max-w-xs space-y-1'
										)}
									>
										<p>
											此字段为
											<span className="font-semibold">
												游戏废案
											</span>
											，原版游戏未启用前缀效果。
										</p>
										<p>
											若要在游戏中实际生效，请安装模组{' '}
											<a
												href="https://github.com/MetaMystia/PreFix"
												target="_blank"
												rel="noreferrer"
												className="underline"
											>
												MetaMystia/PreFix
											</a>
											。
										</p>
										<p>默认值为「[-1] 无」。</p>
									</div>
								}
							>
								前缀（Prefix）
							</Label>
							<Select<number>
								id={idPrefix}
								ariaLabel="食材前缀"
								value={prefixValue}
								onChange={(v) => onUpdate({ prefix: v })}
								items={prefixItems}
							/>
						</div>

						<div className="flex flex-col gap-1">
							<Label
								htmlFor={idBaseValue}
								wrapperClassName="min-h-6"
							>
								价格（BaseValue）
							</Label>
							<Input
								id={idBaseValue}
								type="number"
								min={0}
								value={
									isNaN(ingredient.baseValue)
										? ''
										: String(ingredient.baseValue)
								}
								onChange={(e) => {
									const value = parseIntegerInput(
										e.target.value
									);
									if (value !== null) {
										onUpdate({ baseValue: value });
									}
								}}
							/>
						</div>
					</div>

					<div className="flex flex-wrap gap-x-6 gap-y-3">
						<Switch
							size="sm"
							isSelected={ingredient.isFish}
							onValueChange={(isSelected) =>
								onUpdate({
									isFish: isSelected,
									isMeat: false,
									isVeg: false,
								})
							}
						>
							鱼类
						</Switch>
						<Switch
							size="sm"
							isSelected={ingredient.isMeat}
							onValueChange={(isSelected) =>
								onUpdate({
									isFish: false,
									isMeat: isSelected,
									isVeg: false,
								})
							}
						>
							肉类
						</Switch>
						<Switch
							size="sm"
							isSelected={ingredient.isVeg}
							onValueChange={(isSelected) =>
								onUpdate({
									isFish: false,
									isMeat: false,
									isVeg: isSelected,
								})
							}
						>
							蔬菜
						</Switch>
						<Switch
							size="sm"
							isSelected={isOther}
							onValueChange={() =>
								onUpdate({
									isFish: false,
									isMeat: false,
									isVeg: false,
								})
							}
						>
							其他
						</Switch>
					</div>
				</EditorSection>

				<EditorSection title="标签（Food Tags）">
					<TagsField
						label=""
						tags={ingredient.tags}
						tagPool={FOOD_TAGS}
						onChange={(newTags) => onUpdate({ tags: newTags })}
						tone="ingredient"
					/>
				</EditorSection>

				<EditorSection title="贴图（预期26×26）">
					<SpriteUploader
						spriteUrl={spriteUrl ?? null}
						spritePath={ingredient.spritePath}
						onUpload={handleSpriteUpdate}
					/>
				</EditorSection>
			</EditorDetailPanel>
		);
	}
);
