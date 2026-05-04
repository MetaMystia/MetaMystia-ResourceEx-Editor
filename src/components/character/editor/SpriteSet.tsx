import { useState } from 'react';
import { Switch } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { CharacterSpriteSet } from '@/types/resource';
import { ChevronRight } from '@/components/icons/ChevronRight';
import { cn } from '@/design/ui/utils';
import { useData } from '@/components/context/DataContext';
import { InfoTip } from '@/components/common/InfoTip';
import { Label } from '@/components/common/Label';
import { WarningBadge } from '@/components/common/WarningBadge';
import { useLabelPrefixValidation } from '@/components/common/useLabelPrefixValidation';

interface SpriteSetProps {
	characterId: number;
	spriteSet: CharacterSpriteSet | undefined;
	label: string;
	onUpdate: (updates: Partial<CharacterSpriteSet>) => void;
	onEnable: () => void;
	onDisable: () => void;
	onGenerateDefaults: () => void;
}

export function SpriteSetEditor({
	characterId,
	spriteSet,
	onUpdate,
	onEnable,
	onDisable,
	onGenerateDefaults,
}: SpriteSetProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const { updateAsset, getAssetUrl } = useData();
	const {
		isValid: isSpriteNamePrefixValid,
		prefix: expectedPrefix,
		hasPackLabel,
	} = useLabelPrefixValidation(spriteSet?.name || '');
	const showPrefixWarning =
		hasPackLabel && spriteSet && !isSpriteNamePrefixValid;

	const updateSpriteArray = (
		field: 'mainSprite' | 'eyeSprite',
		index: number,
		value: string
	) => {
		if (!spriteSet) return;
		const newArray = [...spriteSet[field]];
		newArray[index] = value;
		onUpdate({ [field]: newArray });
	};

	const handleUpload = (
		field: 'mainSprite' | 'eyeSprite',
		index: number,
		file: File
	) => {
		// Check size and reject if invalid
		const img = new Image();
		img.src = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(img.src);
			if (img.width !== 64 || img.height !== 64) {
				alert(
					`错误: Sprite Set 贴图尺寸必须为 64x64，当前为 ${img.width}x${img.height}`
				);
				return;
			}

			let filename = '';
			if (field === 'mainSprite') {
				const row = Math.floor(index / 3);
				const col = index % 3;
				filename = `Main_${row}, ${col}.png`;
			} else {
				const row = Math.floor(index / 4);
				const col = index % 4;
				filename = `Eyes_${row}, ${col}.png`;
			}

			const path = `assets/Character/${characterId}/Sprite/${filename}`;
			updateAsset(path, file);
			updateSpriteArray(field, index, path);
		};
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="ml-1 flex items-center justify-between">
				<div
					className="flex cursor-pointer select-none items-center gap-2"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<ChevronRight
						className={cn(
							'transition-transform duration-200',
							isExpanded && 'rotate-90'
						)}
					/>
					<label className="cursor-pointer font-semibold">
						角色小人配置（Sprite Set）
						<InfoTip>
							配置角色的小人贴图，包括主身体和眼睛的贴图。贴图大小为
							64x64。主身体为 12 张，一共 4 个方向，每个方向 3
							张。如需尝试创作，可以在群文件中找到游戏原始资源，或使用
							MetaMystia 提供的资源包
						</InfoTip>
					</label>
				</div>
				<div className="flex items-center gap-2">
					<span className="whitespace-nowrap text-xs font-medium">
						{spriteSet ? '已启用小人配置' : '启用小人配置'}
					</span>
					<Switch
						size="sm"
						isSelected={Boolean(spriteSet)}
						onValueChange={(v) => {
							if (v) {
								onEnable();
							} else if (
								confirm(
									'关闭角色小人配置将丢失名称与贴图路径等所有小人配置数据，且不可恢复。\n\n确定要关闭吗？'
								)
							) {
								onDisable();
							}
						}}
					/>
				</div>
			</div>

			{isExpanded && spriteSet && (
				<div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-6 rounded-2xl border border-white/5 bg-black/5 p-6 duration-200">
					<div className="flex flex-col gap-2">
						<div className="ml-1 flex items-center justify-between">
							<Label
								className="text-sm font-bold opacity-70"
								tip="角色小人名称，建议以 _{资源包label}_ 开头，如：_MyPack_Daiyousei"
							>
								角色小人名称 (Name)
							</Label>
							<div className="flex items-center gap-2">
								{showPrefixWarning && (
									<WarningBadge>
										建议以 {expectedPrefix} 开头
									</WarningBadge>
								)}
								<button
									onClick={onGenerateDefaults}
									className="rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] transition-all hover:bg-white/20 active:scale-95"
								>
									刷新默认填充
								</button>
							</div>
						</div>
						<input
							type="text"
							value={spriteSet.name}
							onChange={(e) => onUpdate({ name: e.target.value })}
							placeholder="默认为角色 Label"
							className="rounded-xl border border-white/10 bg-black/10 p-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
						/>
					</div>

					<div className="flex flex-col gap-4">
						<label className="ml-1 text-sm font-bold opacity-70">
							主身体贴图 (Main Sprites - 12张)
						</label>
						<div className="grid grid-cols-3 gap-3">
							{spriteSet.mainSprite.map((path, i) => (
								<div
									key={i}
									className="group relative flex flex-col gap-2 rounded-lg border border-white/5 bg-black/10 p-2 transition-colors hover:bg-black/20"
								>
									<label
										className="bg-checkerboard relative aspect-square cursor-pointer overflow-hidden rounded border border-white/10 hover:border-primary/50"
										onDragOver={(e) => e.preventDefault()}
										onDrop={(e) => {
											e.preventDefault();
											const file =
												e.dataTransfer.files?.[0];
											if (
												file &&
												file.type === 'image/png'
											) {
												handleUpload(
													'mainSprite',
													i,
													file
												);
											}
										}}
									>
										<span className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1 text-[10px] text-white">
											{i}
										</span>
										{getAssetUrl(path) ? (
											<img
												src={getAssetUrl(path)}
												className="image-rendering-pixelated h-full w-full object-contain"
												alt=""
											/>
										) : (
											<div className="flex h-full w-full flex-col items-center justify-center text-black/30">
												<span className="text-xs">
													上传
												</span>
											</div>
										)}
										<div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
											<span className="text-xs font-bold text-white">
												更换
											</span>
										</div>
										<input
											type="file"
											accept="image/png"
											className="hidden"
											onChange={(e) => {
												const file =
													e.target.files?.[0];
												if (file)
													handleUpload(
														'mainSprite',
														i,
														file
													);
											}}
										/>
									</label>
									<p className="truncate text-center text-[10px] text-black">
										{path.split('/').pop()}
									</p>
								</div>
							))}
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<label className="ml-1 text-sm font-bold opacity-70">
							眼睛贴图 (Eye Sprites - 24张)
						</label>
						<div className="grid grid-cols-4 gap-3">
							{spriteSet.eyeSprite.map((path, i) => (
								<div
									key={i}
									className="group relative flex flex-col gap-2 rounded-lg border border-white/5 bg-black/10 p-2 transition-colors hover:bg-black/20"
								>
									<label
										className="bg-checkerboard relative aspect-square cursor-pointer overflow-hidden rounded border border-white/10 hover:border-primary/50"
										onDragOver={(e) => e.preventDefault()}
										onDrop={(e) => {
											e.preventDefault();
											const file =
												e.dataTransfer.files?.[0];
											if (
												file &&
												file.type === 'image/png'
											) {
												handleUpload(
													'eyeSprite',
													i,
													file
												);
											}
										}}
									>
										<span className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1 text-[10px] text-white">
											{i}
										</span>
										{getAssetUrl(path) ? (
											<img
												src={getAssetUrl(path)}
												className="image-rendering-pixelated h-full w-full object-contain"
												alt=""
											/>
										) : (
											<div className="flex h-full w-full flex-col items-center justify-center text-black/30">
												<span className="text-xs">
													上传
												</span>
											</div>
										)}
										<div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
											<span className="text-xs font-bold text-white">
												更换
											</span>
										</div>
										<input
											type="file"
											accept="image/png"
											className="hidden"
											onChange={(e) => {
												const file =
													e.target.files?.[0];
												if (file)
													handleUpload(
														'eyeSprite',
														i,
														file
													);
											}}
										/>
									</label>
									<p className="truncate text-center text-[10px] text-black">
										{path.split('/').pop()}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			)}
			{isExpanded && !spriteSet && (
				<EmptyState
					title="暂未启用角色小人配置"
					description="点击右侧开关启用"
				/>
			)}
		</div>
	);
}
