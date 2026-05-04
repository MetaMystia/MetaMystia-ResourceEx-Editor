import { useState } from 'react';
import { Button } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import { CharacterPortrait } from '@/types/resource';
import { cn } from '@/design/ui/utils';
import { ChevronRight } from '@/components/icons/ChevronRight';
import { useData } from '@/components/context/DataContext';
import { Label } from '@/components/common/Label';
import { PortraitUploader } from '@/components/common/PortraitUploader';

interface PortraitsProps {
	characterId: number;
	portraits: CharacterPortrait[];
	faceInNoteBook: number | undefined;
	onAdd: () => void;
	onUpdate: (index: number, updates: Partial<CharacterPortrait>) => void;
	onRemove: (index: number) => void;
	onSetDefault: (pid: number) => void;
}

export function Portraits({
	characterId,
	portraits,
	faceInNoteBook,
	onAdd,
	onUpdate,
	onRemove,
	onSetDefault,
}: PortraitsProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const { updateAsset } = useData();

	const isPidDuplicate = (pid: number, currentIndex: number) => {
		return portraits.some((p, i) => i !== currentIndex && p.pid === pid);
	};

	const handleUpload = (index: number, file: File, pid: number) => {
		const path = `assets/Character/${characterId}/Portrait/${pid}.png`;
		updateAsset(path, file);
		// Auto-fill label with filename (without extension)
		const label = file.name.replace(/\.[^/.]+$/, '');
		onUpdate(index, { path, label });
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
					<Label
						className="cursor-pointer text-base font-semibold normal-case opacity-100"
						tip="为角色配置不同的立绘表情，可用于对话系统和小碎骨笔记本图鉴"
					>
						立绘配置（Portraits）
						{portraits?.length ? `(${portraits.length})` : ''}
					</Label>
				</div>
				<SectionAddButton onPress={onAdd}>
					添加立绘配置
				</SectionAddButton>
			</div>
			{isExpanded && (
				<div className="grid grid-cols-1 gap-3 duration-200">
					{portraits?.map((portrait, i) => {
						const duplicatePid = isPidDuplicate(portrait.pid, i);

						return (
							<div
								key={i}
								className={cn(
									'flex w-full flex-wrap items-end gap-3 rounded-xl border bg-black/10 p-4 transition-all',
									duplicatePid
										? 'border-danger/50 bg-danger/5'
										: 'border-white/5'
								)}
							>
								<div className="flex w-20 flex-col gap-1">
									<div className="ml-1 flex items-center justify-between">
										<Label
											size="sm"
											className="ml-1"
											tip={
												'角色立绘的唯一标识符，用于在对话系统中调用对应立绘。'
											}
										>
											PID
										</Label>
										{duplicatePid && (
											<span className="text-[8px] font-bold text-danger">
												重复
											</span>
										)}
									</div>
									<input
										type="number"
										value={portrait.pid}
										onChange={(e) =>
											onUpdate(i, {
												pid:
													parseInt(e.target.value) ||
													0,
											})
										}
										className={cn(
											'rounded-lg border bg-black/10 p-2 text-sm transition-all focus:outline-none focus:ring-1',
											duplicatePid
												? 'border-danger focus:ring-danger/50'
												: 'border-white/10 focus:ring-primary/50'
										)}
									/>
								</div>
								<div className="flex flex-1 flex-col gap-1">
									<Label
										size="sm"
										className="ml-1"
										tip="用于给立绘添加备注，但不会注入游戏"
									>
										备注标签
									</Label>
									<div className="flex gap-2">
										<input
											type="text"
											value={portrait.label || ''}
											onChange={(e) =>
												onUpdate(i, {
													label: e.target.value,
												})
											}
											placeholder="例如：大妖精 低沉"
											className="flex-1 rounded-lg border border-white/10 bg-black/10 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
										/>
										<label
											className={cn(
												'flex cursor-pointer items-center gap-2 rounded px-3 py-1 transition-colors',
												faceInNoteBook === portrait.pid
													? 'bg-primary/20 text-primary'
													: 'bg-black/10 text-white/50 hover:bg-black/20 hover:text-white/70'
											)}
										>
											<input
												type="radio"
												name={`default-portrait-${characterId}`}
												checked={
													faceInNoteBook ===
													portrait.pid
												}
												onChange={() =>
													onSetDefault(portrait.pid)
												}
												className="accent-primary"
											/>
											<span className="whitespace-nowrap text-xs font-bold">
												设为图鉴立绘
											</span>
										</label>
									</div>
								</div>
								<PortraitUploader
									spritePath={portrait.path}
									onUpload={(file) =>
										handleUpload(i, file, portrait.pid)
									}
								/>
								<div className="flex flex-col justify-end">
									<button
										onClick={() => onRemove(i)}
										className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger/20 bg-danger/10 p-2 text-danger transition-all hover:bg-danger/20 active:scale-90"
										title="删除立绘"
									>
										×
									</button>
								</div>
							</div>
						);
					})}
					{portraits && portraits.length > 0 && (
						<div className="mt-2 flex justify-end gap-2 border-t border-white/5 pt-4">
							<SectionAddButton onPress={onAdd}>
								添加立绘配置
							</SectionAddButton>
							<Button
								variant="light"
								size="sm"
								onPress={() => setIsExpanded(false)}
								className="h-8 rounded-md px-3 text-xs"
							>
								收起列表
							</Button>
						</div>
					)}
					{(!portraits || portraits.length === 0) && (
						<EmptyState
							title="暂无立绘配置"
							description="点击右上角“添加立绘配置”按钮创建"
						/>
					)}
				</div>
			)}
		</div>
	);
}
