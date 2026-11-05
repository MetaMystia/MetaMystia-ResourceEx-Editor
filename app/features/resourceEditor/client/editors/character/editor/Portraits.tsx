import { cn } from '@heroui/theme';
import { useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';

import type { CharacterPortrait } from '@/domain/resourcePack/contracts/character';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { PortraitUploader } from '@/features/resourceEditor/client/components/uploads/PortraitUploader';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

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
	const [isExpanded, setIsExpanded] = useState(false);
	const portraitsRef = useFocusOnItemAppend(portraits.length);
	const { updateAsset } = useResourceEditor();

	const isPidDuplicate = (pid: number, currentIndex: number) => {
		return portraits.some((p, i) => i !== currentIndex && p.pid === pid);
	};

	const handleUpload = (index: number, file: File, pid: number) => {
		const path = `assets/Character/${characterId}/Portrait/${pid}.png`;
		const result = updateAsset(path, file);
		if (!result.isSuccess) return result;
		// Auto-fill label with filename (without extension)
		const label = file.name.replace(/\.[^/.]+$/, '');
		onUpdate(index, { path, label });
		return result;
	};

	return (
		<EditorSection
			title={
				<Button
					variant="light"
					size="sm"
					aria-expanded={isExpanded}
					className={cn(
						TYPOGRAPHY_STYLES.sectionTitle,
						'-ml-2 h-10 px-2 sm:h-8'
					)}
					startContent={
						<ChevronRight
							className={cn(
								'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
								isExpanded && 'rotate-90'
							)}
						/>
					}
					onPress={() => setIsExpanded((value) => !value)}
				>
					{`立绘配置（Portraits）${portraits.length ? `（${portraits.length}）` : ''}`}
				</Button>
			}
			actions={
				<SectionAddButton
					onPress={() => {
						setIsExpanded(true);
						onAdd();
					}}
				>
					添加立绘配置
				</SectionAddButton>
			}
		>
			<p className={TYPOGRAPHY_STYLES.description}>
				为角色配置不同的立绘表情，可用于对话系统和小碎骨笔记本图鉴。
			</p>
			{isExpanded && (
				<div ref={portraitsRef} className="grid grid-cols-1 gap-3">
					{portraits.map((portrait, i) => {
						const duplicatePid = isPidDuplicate(portrait.pid, i);

						return (
							<article
								key={i}
								data-editor-appended-item
								className={cn(
									'flex min-w-0 flex-col gap-4 rounded-medium border bg-content1/50 p-4',
									duplicatePid
										? 'border-danger/50 bg-danger/10'
										: 'border-divider'
								)}
							>
								<div className="flex min-w-0 items-center justify-between gap-3 border-b border-divider pb-3">
									<div className="min-w-0">
										<Heading as="h4" variant="subsection">
											立绘配置{i + 1}
										</Heading>
										<p
											title={portrait.path}
											className={cn(
												TYPOGRAPHY_STYLES.metadata,
												'mt-1 truncate'
											)}
										>
											{portrait.path}
										</p>
									</div>
									<SectionDeleteButton
										iconOnly
										confirmTitle="确定要删除这个立绘配置吗？"
										onPress={() => onRemove(i)}
									>
										删除立绘配置
									</SectionDeleteButton>
								</div>
								<div className="grid min-w-0 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
									<PortraitUploader
										className="mx-auto lg:mx-0"
										spritePath={portrait.path}
										onUpload={(file) =>
											handleUpload(i, file, portrait.pid)
										}
									/>
									<div className="grid min-w-0 content-start gap-4">
										<div className="flex min-w-0 flex-col gap-2">
											<div className="flex items-center justify-between gap-2">
												<Label
													tip={
														'角色立绘的唯一标识符，用于在对话系统中调用对应立绘。'
													}
												>
													PID
												</Label>
												{duplicatePid && (
													<span
														className={cn(
															TYPOGRAPHY_STYLES.badgeLabel,
															'text-danger'
														)}
													>
														PID重复
													</span>
												)}
											</div>
											<Input
												type="number"
												value={String(portrait.pid)}
												onChange={(e) =>
													onUpdate(i, {
														pid:
															parseInt(
																e.target.value
															) || 0,
													})
												}
												isInvalid={duplicatePid}
											/>
										</div>
										<div className="flex min-w-0 flex-col gap-2">
											<Label tip="用于给立绘添加备注，但不会注入游戏">
												备注标签
											</Label>
											<Input
												type="text"
												value={portrait.label || ''}
												onChange={(e) =>
													onUpdate(i, {
														label: e.target.value,
													})
												}
												placeholder="例如：大妖精 低沉"
											/>
										</div>
										<Button
											size="sm"
											color="primary"
											variant={
												faceInNoteBook === portrait.pid
													? 'flat'
													: 'bordered'
											}
											aria-pressed={
												faceInNoteBook === portrait.pid
											}
											className="h-10 justify-self-start px-4 sm:h-8"
											onPress={() =>
												onSetDefault(portrait.pid)
											}
										>
											{faceInNoteBook === portrait.pid
												? '当前图鉴立绘'
												: '设为图鉴立绘'}
										</Button>
									</div>
								</div>
							</article>
						);
					})}
					{(!portraits || portraits.length === 0) && (
						<EmptyState
							title="暂无立绘配置"
							description="可使用“添加立绘配置”创建第一项"
						/>
					)}
				</div>
			)}
		</EditorSection>
	);
}
