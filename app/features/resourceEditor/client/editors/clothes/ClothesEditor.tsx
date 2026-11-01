import { cn } from '@heroui/theme';
import { memo, useCallback, useId, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import {
	createClothesPixelFullConfigName,
	createDefaultClothesSpritePaths,
} from '@/domain/resourcePack/clothesDefaults';
import type {
	Clothes,
	PixelFullConfig,
} from '@/domain/resourcePack/contracts/items';

import { InfoTip } from '@/features/resourceEditor/client/components/fields/InfoTip';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { PortraitUploader } from '@/features/resourceEditor/client/components/uploads/PortraitUploader';
import { SpriteUploader } from '@/features/resourceEditor/client/components/uploads/SpriteUploader';
import { IdRangeBadge } from '@/features/resourceEditor/client/editors/info/IdRangeBadge';
import { parseIntegerInput } from '@/features/resourceEditor/client/editorValueAllocation';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { SpriteGrid } from './SpriteGrid';

interface ClothesEditorProps {
	clothes: Clothes | null;
	clothesIndex: number | null;
	onUpdate: (updates: Partial<Clothes>) => void;
}

const SPRITE_FIELDS = [
	{
		field: 'mainSprite' as const,
		label: '主身体贴图（Main Sprites，12张）',
		count: 12,
		cols: 3,
		prefix: 'Main',
		tip: '主身体贴图，共12张，4个方向，每个方向3张。尺寸为64×64。',
	},
	{
		field: 'eyeSprite' as const,
		label: '眼睛贴图（Eye Sprites，24张）',
		count: 24,
		cols: 4,
		prefix: 'Eyes',
		tip: '眼睛贴图，共24张。尺寸为64×64。',
	},
	{
		field: 'hairSprite' as const,
		label: '头发贴图（Hair Sprites，12张）',
		count: 12,
		cols: 3,
		prefix: 'Hair',
		tip: '头发贴图，共12张，与主身体贴图一一对应。尺寸为64×64。',
	},
	{
		field: 'backSprite' as const,
		label: '背部贴图（Back Sprites，12张）',
		count: 12,
		cols: 3,
		prefix: 'Back',
		tip: '背部贴图，共12张，与主身体贴图一一对应。尺寸为64×64。',
	},
];

export const ClothesEditor = memo<ClothesEditorProps>(function ClothesEditor({
	clothes,
	onUpdate,
}) {
	const idId = useId();
	const idName = useId();
	const idDescription = useId();

	const [isSpriteExpanded, setIsSpriteExpanded] = useState(false);

	const isIdTooSmall = clothes && clothes.id < 9000;

	const { getAssetUrl, resourcePack, updateAsset } = useResourceEditor();

	const autoName = useMemo(() => {
		if (!clothes) return '';
		return createClothesPixelFullConfigName(
			resourcePack.packInfo.label,
			clothes.id,
			clothes.name
		);
	}, [clothes, resourcePack.packInfo.label]);

	const handleIconSpriteUpdate = useCallback(
		(blob: Blob) => {
			if (!clothes) return { isSuccess: false, error: '未选择衣服。' };
			return updateAsset(clothes.spritePath, blob);
		},
		[clothes, updateAsset]
	);

	const handlePortraitUpload = useCallback(
		(file: File) => {
			if (!clothes) return { isSuccess: false, error: '未选择衣服。' };
			return updateAsset(clothes.portraitPath, file);
		},
		[clothes, updateAsset]
	);

	const updatePixelFullConfig = useCallback(
		(updates: Partial<PixelFullConfig>) => {
			if (!clothes) return;
			onUpdate({
				pixelFullConfig: { ...clothes.pixelFullConfig, ...updates },
			});
		},
		[clothes, onUpdate]
	);

	const handleSpriteGridUpload = useCallback(
		(
			field: 'mainSprite' | 'eyeSprite' | 'hairSprite' | 'backSprite',
			index: number,
			path: string,
			file: File
		) => {
			if (!clothes) return { isSuccess: false, error: '未选择衣服。' };
			const result = updateAsset(path, file);
			if (!result.isSuccess) return result;
			const newArray = [...clothes.pixelFullConfig[field]];
			newArray[index] = path;
			updatePixelFullConfig({ [field]: newArray });
			return result;
		},
		[clothes, updateAsset, updatePixelFullConfig]
	);

	const generateDefaultPaths = useCallback(() => {
		if (!clothes) return;
		updatePixelFullConfig({
			name: autoName,
			...createDefaultClothesSpritePaths(clothes.id),
		});
	}, [autoName, clothes, updatePixelFullConfig]);

	if (!clothes) {
		return <EditorDetailEmptyState itemLabel="衣服" />;
	}

	const iconSpriteUrl = getAssetUrl(clothes.spritePath);

	return (
		<EditorDetailPanel>
			<EditorDetailHeader title="衣服编辑" />

			<EditorSection title="基本信息">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<Label
								htmlFor={idId}
								tip="衣服是一种物品，该ID在全局物品中应唯一。修改ID时，默认路径（assets/Clothes/{ID}/）下的图片与路径同步更新。"
							>
								ID
							</Label>
							<div className="flex gap-2">
								{isIdTooSmall && (
									<ErrorBadge>ID需&ge;9000</ErrorBadge>
								)}
								<IdRangeBadge id={clothes.id} />
							</div>
						</div>
						<Input
							id={idId}
							type="number"
							value={isNaN(clothes.id) ? '' : String(clothes.id)}
							onChange={(e) => {
								const value = parseIntegerInput(e.target.value);
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
							value={clothes.name}
							onChange={(e) => onUpdate({ name: e.target.value })}
						/>
					</div>

					<div className="col-span-full flex flex-col gap-1">
						<Label htmlFor={idDescription}>
							描述（Description）
						</Label>
						<Textarea
							id={idDescription}
							value={clothes.description}
							onChange={(e) =>
								onUpdate({ description: e.target.value })
							}
							minRows={3}
						/>
					</div>
				</div>
			</EditorSection>

			<EditorSection
				title={
					<>
						物品图标贴图（Icon Sprite）
						<InfoTip>
							衣服是一种物品，在背包中作为物品显示时需要物品图标贴图。
						</InfoTip>
					</>
				}
			>
				<SpriteUploader
					spriteUrl={iconSpriteUrl ?? null}
					spritePath={clothes.spritePath}
					recommendedSize={{ width: 26, height: 26 }}
					onUpload={handleIconSpriteUpdate}
				/>
			</EditorSection>

			{/* 显示参数 (居酒屋 / 笔记本) */}
			<ClothesDisplayOffsets clothes={clothes} onUpdate={onUpdate} />

			<EditorSection
				title={
					<>
						立绘（Portrait）
						<InfoTip>
							小碎骨身着该衣服的立绘，尺寸为256×359。
						</InfoTip>
					</>
				}
			>
				<PortraitUploader
					spritePath={clothes.portraitPath}
					onUpload={handlePortraitUpload}
					width={256}
					height={359}
				/>
			</EditorSection>

			{/* 小人贴图配置 (PixelFullConfig) */}
			<EditorSection
				title={
					<div className="flex min-w-0 items-center gap-1">
						<Button
							variant="light"
							size="sm"
							aria-expanded={isSpriteExpanded}
							className={cn(
								TYPOGRAPHY_STYLES.sectionTitle,
								'-ml-2 h-10 px-2 sm:h-8'
							)}
							startContent={
								<ChevronRight
									className={cn(
										'h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
										isSpriteExpanded && 'rotate-90'
									)}
								/>
							}
							onPress={() =>
								setIsSpriteExpanded((isExpanded) => !isExpanded)
							}
						>
							衣服小人配置（Pixel Full Config）
						</Button>
						<InfoTip>
							配置衣服的小人贴图，包括主身体、眼睛、头发和背部的贴图。贴图大小为64×64。主身体、头发和背部各12张，眼睛24张，共4个方向。头发和背部与主身体一一对应。
						</InfoTip>
					</div>
				}
			>
				{isSpriteExpanded && (
					<div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-6 rounded-medium border border-divider bg-content2/30 p-4 duration-200 sm:p-6">
						<div className="flex flex-col gap-2">
							<div className="ml-1 flex items-center justify-between">
								<Label
									className={
										TYPOGRAPHY_STYLES.subsectionTitle
									}
									tip="衣服小人名称，格式为_{PackLabel}_Clothes_{ID}_{衣服名称}，随ID和名称自动更新。"
								>
									衣服小人名称（Name）
								</Label>
								<Button
									variant="flat"
									size="sm"
									onPress={generateDefaultPaths}
								>
									刷新默认填充
								</Button>
							</div>
							<div
								className={cn(
									TYPOGRAPHY_STYLES.codeBody,
									'select-all rounded-medium border border-divider bg-content1/50 p-3'
								)}
							>
								{autoName}
							</div>
						</div>

						{SPRITE_FIELDS.map((meta) => (
							<SpriteGrid
								key={meta.field}
								label={meta.label}
								tip={meta.tip}
								cols={meta.cols}
								prefix={meta.prefix}
								paths={clothes.pixelFullConfig[meta.field]}
								basePath={`assets/Clothes/${clothes.id}/Sprite`}
								onUpload={(index, path, file) =>
									handleSpriteGridUpload(
										meta.field,
										index,
										path,
										file
									)
								}
							/>
						))}
					</div>
				)}
			</EditorSection>
		</EditorDetailPanel>
	);
});

interface ClothesDisplayOffsetsProps {
	clothes: Clothes;
	onUpdate: (updates: Partial<Clothes>) => void;
}

const OFFSET_FIELDS: {
	key:
		| 'izakayaSkinIndex'
		| 'izkayaHorizontalOffset'
		| 'notebookHorizontalOffset'
		| 'notebookVerticalOffset'
		| 'notebookUITitleHorizontalOffset'
		| 'notebookUITitleVerticalOffset';
	label: string;
	tip: string;
	step: number;
	defaultValue: number;
	integer?: boolean;
}[] = [
	{
		key: 'izakayaSkinIndex',
		label: '居酒屋皮肤索引（izakayaSkinIndex）',
		tip: '居酒屋场景中使用的皮肤索引，-1表示使用默认皮肤',
		step: 1,
		defaultValue: -1,
		integer: true,
	},
	{
		key: 'izkayaHorizontalOffset',
		label: '居酒屋水平偏移（izkayaHorizontalOffset）',
		tip: '居酒屋场景中立绘的水平偏移，单位与游戏内坐标一致',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookHorizontalOffset',
		label: '笔记本水平偏移（notebookHorizontalOffset）',
		tip: '笔记本（图鉴）中立绘的水平偏移',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookVerticalOffset',
		label: '笔记本垂直偏移（notebookVerticalOffset）',
		tip: '笔记本（图鉴）中立绘的垂直偏移',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookUITitleHorizontalOffset',
		label: '笔记本标题水平偏移（notebookUITitleHorizontalOffset）',
		tip: '笔记本UI标题文字的水平偏移',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookUITitleVerticalOffset',
		label: '笔记本标题垂直偏移（notebookUITitleVerticalOffset）',
		tip: '笔记本UI标题文字的垂直偏移',
		step: 0.01,
		defaultValue: 0,
	},
];

function ClothesDisplayOffsets({
	clothes,
	onUpdate,
}: ClothesDisplayOffsetsProps) {
	return (
		<EditorSection
			title={
				<>
					显示参数（居酒屋、笔记本）
					<InfoTip>
						这些字段为可选项，留空或使用默认值时，导出JSON将沿用游戏内置的默认行为（皮肤索引为-1，各偏移为0）。
					</InfoTip>
				</>
			}
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{OFFSET_FIELDS.map((field) => {
					const current = clothes[field.key];
					const value = current ?? field.defaultValue;
					return (
						<div key={field.key} className="flex flex-col gap-1">
							<Label tip={field.tip}>{field.label}</Label>
							<Input
								type="number"
								step={field.step}
								value={
									Number.isFinite(value) ? String(value) : ''
								}
								onChange={(e) => {
									const raw = e.target.value;
									if (raw === '') {
										onUpdate({
											[field.key]: undefined,
										} as Partial<Clothes>);
										return;
									}
									const num = field.integer
										? parseInt(raw, 10)
										: parseFloat(raw);
									if (Number.isNaN(num)) return;
									onUpdate({
										[field.key]: num,
									} as Partial<Clothes>);
								}}
							/>
						</div>
					);
				})}
			</div>
		</EditorSection>
	);
}
