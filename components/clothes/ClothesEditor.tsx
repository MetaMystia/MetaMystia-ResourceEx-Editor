import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';

import { useData } from '@/components/context/DataContext';
import { ErrorBadge } from '@/components/common/ErrorBadge';
import { IdRangeBadge } from '@/components/common/IdRangeBadge';
import { SpriteUploader } from '@/components/common/SpriteUploader';
import { PortraitUploader } from '@/components/common/PortraitUploader';
import { Label } from '@/components/common/Label';
import { InfoTip } from '@/components/common/InfoTip';
import { ChevronRight } from '@/components/icons/ChevronRight';
import { SpriteGrid } from './SpriteGrid';

import { cn } from '@/lib';
import type { Clothes, PixelFullConfig } from '@/types/resource';

interface ClothesEditorProps {
	clothes: Clothes | null;
	clothesIndex: number | null;
	onUpdate: (updates: Partial<Clothes>) => void;
}

const SPRITE_FIELDS = [
	{
		field: 'mainSprite' as const,
		label: '主身体贴图 (Main Sprites - 12张)',
		count: 12,
		cols: 3,
		prefix: 'Main',
		tip: '主身体贴图，共 12 张，4 个方向每方向 3 张。尺寸 64x64',
	},
	{
		field: 'eyeSprite' as const,
		label: '眼睛贴图 (Eye Sprites - 24张)',
		count: 24,
		cols: 4,
		prefix: 'Eyes',
		tip: '眼睛贴图，共 24 张。尺寸 64x64',
	},
	{
		field: 'hairSprite' as const,
		label: '头发贴图 (Hair Sprites - 12张)',
		count: 12,
		cols: 3,
		prefix: 'Hair',
		tip: '头发贴图，共 12 张，与主身体贴图一一对应。尺寸 64x64',
	},
	{
		field: 'backSprite' as const,
		label: '背部贴图 (Back Sprites - 12张)',
		count: 12,
		cols: 3,
		prefix: 'Back',
		tip: '背部贴图，共 12 张，与主身体贴图一一对应。尺寸 64x64',
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

	const { data, getAssetUrl, updateAsset } = useData();

	const autoName = useMemo(() => {
		if (!clothes) return '';
		const packLabel = data.packInfo?.label || 'ResourceExample';
		const clothesName = clothes.name || 'Unnamed';
		return `_${packLabel}_Clothes_${clothes.id}_${clothesName}`;
	}, [clothes, data.packInfo?.label]);

	useEffect(() => {
		if (!clothes || clothes.pixelFullConfig.name === autoName) return;
		onUpdate({
			pixelFullConfig: { ...clothes.pixelFullConfig, name: autoName },
		});
	}, [autoName]);

	const handleIconSpriteUpdate = useCallback(
		(blob: Blob) => {
			if (!clothes) return;
			updateAsset(clothes.spritePath, blob);
		},
		[clothes, updateAsset]
	);

	const handlePortraitUpload = useCallback(
		(file: File) => {
			if (!clothes) return;
			updateAsset(clothes.portraitPath, file);
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
			if (!clothes) return;
			updateAsset(path, file);
			const newArray = [...clothes.pixelFullConfig[field]];
			newArray[index] = path;
			updatePixelFullConfig({ [field]: newArray });
		},
		[clothes, updateAsset, updatePixelFullConfig]
	);

	const generateDefaultPaths = useCallback(() => {
		if (!clothes) return;
		updatePixelFullConfig({
			mainSprite: Array(12)
				.fill('')
				.map(
					(_, i) =>
						`assets/Clothes/${clothes.id}/Sprite/Main_${Math.floor(i / 3)}, ${i % 3}.png`
				),
			eyeSprite: Array(24)
				.fill('')
				.map(
					(_, i) =>
						`assets/Clothes/${clothes.id}/Sprite/Eyes_${Math.floor(i / 4)}, ${i % 4}.png`
				),
			hairSprite: Array(12)
				.fill('')
				.map(
					(_, i) =>
						`assets/Clothes/${clothes.id}/Sprite/Hair_${Math.floor(i / 3)}, ${i % 3}.png`
				),
			backSprite: Array(12)
				.fill('')
				.map(
					(_, i) =>
						`assets/Clothes/${clothes.id}/Sprite/Back_${Math.floor(i / 3)}, ${i % 3}.png`
				),
		});
	}, [clothes, updatePixelFullConfig]);

	if (!clothes) {
		return (
			<div className="col-span-2 flex h-96 items-center justify-center rounded-lg bg-white/10 p-4 shadow-md backdrop-blur">
				<p className="text-center text-black/40 dark:text-white/40">
					请从左侧选择一个服装进行编辑
				</p>
			</div>
		);
	}

	const iconSpriteUrl = getAssetUrl(clothes.spritePath);

	return (
		<div className="col-span-2 flex flex-col gap-6 overflow-y-auto rounded-lg bg-white/10 p-6 font-sans shadow-md backdrop-blur">
			<div className="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/5">
				<h2 className="text-2xl font-bold">服装编辑</h2>
			</div>

			{/* 基本信息 */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
					基本信息
				</h3>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<Label
								htmlFor={idId}
								tip="服装是一种物品，该 ID 在全局物品中应唯一"
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
						<input
							id={idId}
							type="number"
							value={isNaN(clothes.id) ? '' : clothes.id}
							onChange={(e) => {
								const val = parseInt(e.target.value);
								if (isNaN(val)) {
									onUpdate({ id: val });
								} else {
									onUpdate({
										id: val,
										spritePath: `assets/Clothes/${val}/icon.png`,
										portraitPath: `assets/Clothes/${val}/portrait.png`,
									});
								}
							}}
							className={cn(
								'h-9 w-full rounded-lg border bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:bg-black/10 dark:focus:border-white/30 dark:focus:ring-white/10',
								isIdTooSmall
									? 'border-danger bg-danger text-white opacity-50 focus:border-danger'
									: 'border-black/10 dark:border-white/10'
							)}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<Label htmlFor={idName}>名称 (Name)</Label>
						<input
							id={idName}
							type="text"
							value={clothes.name}
							onChange={(e) => onUpdate({ name: e.target.value })}
							className="h-9 w-full rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-black/10 dark:focus:border-white/10 dark:focus:ring-white/10"
						/>
					</div>

					<div className="col-span-full flex flex-col gap-1">
						<Label htmlFor={idDescription}>
							描述 (Description)
						</Label>
						<textarea
							id={idDescription}
							value={clothes.description}
							onChange={(e) =>
								onUpdate({ description: e.target.value })
							}
							rows={3}
							className="w-full rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-black/10 dark:focus:border-white/10 dark:focus:ring-white/10"
						/>
					</div>
				</div>
			</div>

			{/* 资源 - 图标贴图 */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
					物品图标贴图 (Icon Sprite)
					<InfoTip>
						服装是一种物品，在背包中作为物品显示时需要物品图标贴图
					</InfoTip>
				</h3>
				<SpriteUploader
					spriteUrl={iconSpriteUrl ?? null}
					spritePath={clothes.spritePath}
					recommendedSize={{ width: 26, height: 26 }}
					onUpload={handleIconSpriteUpdate}
				/>
			</div>

			{/* 显示参数 (居酒屋 / 笔记本) */}
			<ClothesDisplayOffsets clothes={clothes} onUpdate={onUpdate} />

			{/* 资源 - 立绘 */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
					立绘 (Portrait)
					<InfoTip>小碎骨身着该服装的立绘，256x359</InfoTip>
				</h3>
				<PortraitUploader
					spritePath={clothes.portraitPath}
					onUpload={handlePortraitUpload}
					width={256}
					height={359}
				/>
			</div>

			{/* 小人贴图配置 (PixelFullConfig) */}
			<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
				<div className="ml-1 flex items-center justify-between">
					<div
						className="flex cursor-pointer select-none items-center gap-2"
						onClick={() => setIsSpriteExpanded(!isSpriteExpanded)}
					>
						<ChevronRight
							className={cn(
								'transition-transform duration-200',
								isSpriteExpanded && 'rotate-90'
							)}
						/>
						<label className="cursor-pointer font-semibold">
							服装小人配置（Pixel Full Config）
							<InfoTip>
								配置服装的小人贴图，包括主身体、眼睛、头发和背部的贴图。贴图大小为
								64x64。主身体/头发/背部各 12 张，眼睛 24 张，4
								个方向。头发和背部与主身体一一对应。
							</InfoTip>
						</label>
					</div>
				</div>

				{isSpriteExpanded && (
					<div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-6 rounded-2xl border border-white/5 bg-black/5 p-6 duration-200">
						<div className="flex flex-col gap-2">
							<div className="ml-1 flex items-center justify-between">
								<Label
									className="text-sm font-bold opacity-70"
									tip="服装小人名称，格式为 _{PackLabel}_Clothes_{服装名称}_{ID}，根据资源包标签、服装名称和 ID 自动生成"
								>
									服装小人名称 (Name)
								</Label>
								<button
									onClick={generateDefaultPaths}
									className="rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] transition-all hover:bg-white/20 active:scale-95"
								>
									刷新默认填充
								</button>
							</div>
							<div className="select-all rounded-xl border border-white/10 bg-black/5 p-3 font-mono text-sm opacity-70">
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
			</div>
		</div>
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
		| 'notebookVerticalOffset';
	label: string;
	tip: string;
	step: number;
	defaultValue: number;
	integer?: boolean;
}[] = [
	{
		key: 'izakayaSkinIndex',
		label: '居酒屋皮肤索引 (izakayaSkinIndex)',
		tip: '居酒屋场景中使用的皮肤索引，-1 表示使用默认皮肤',
		step: 1,
		defaultValue: -1,
		integer: true,
	},
	{
		key: 'izkayaHorizontalOffset',
		label: '居酒屋水平偏移 (izkayaHorizontalOffset)',
		tip: '居酒屋场景中立绘的水平偏移，单位与游戏内坐标一致',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookHorizontalOffset',
		label: '笔记本水平偏移 (notebookHorizontalOffset)',
		tip: '笔记本（图鉴）中立绘的水平偏移',
		step: 0.01,
		defaultValue: 0,
	},
	{
		key: 'notebookVerticalOffset',
		label: '笔记本垂直偏移 (notebookVerticalOffset)',
		tip: '笔记本（图鉴）中立绘的垂直偏移',
		step: 0.01,
		defaultValue: 0,
	},
];

function ClothesDisplayOffsets({
	clothes,
	onUpdate,
}: ClothesDisplayOffsetsProps) {
	return (
		<div className="flex flex-col gap-4 rounded-lg bg-white/20 p-4 dark:bg-white/5">
			<h3 className="text-sm font-bold uppercase tracking-wider opacity-60">
				显示参数 (居酒屋 / 笔记本)
				<InfoTip>
					这些字段为可选项，留空 / 使用默认值时导出 JSON
					将沿用游戏内置的默认行为（皮肤索引 -1、各偏移 0）
				</InfoTip>
			</h3>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{OFFSET_FIELDS.map((field) => {
					const current = clothes[field.key];
					const value = current ?? field.defaultValue;
					return (
						<div key={field.key} className="flex flex-col gap-1">
							<Label tip={field.tip}>{field.label}</Label>
							<input
								type="number"
								step={field.step}
								value={Number.isFinite(value) ? value : ''}
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
								className="h-9 w-full rounded-lg border border-black/10 bg-white/40 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-black/10 dark:focus:border-white/10 dark:focus:ring-white/10"
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
