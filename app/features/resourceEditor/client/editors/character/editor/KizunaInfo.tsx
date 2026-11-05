import { cn } from '@heroui/theme';
import { memo, useCallback, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Switch from '@/design/ui/components/switch';

import type { KizunaInfo } from '@/domain/resourcePack/contracts/character';
import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';
import type { EventNode } from '@/domain/resourcePack/contracts/event';

import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';
import { InfoTip } from '@/features/resourceEditor/client/components/fields/InfoTip';
import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';

import { DIALOG_FIELDS, EVENT_FIELDS, MAP_FIELD } from './kizuna/constants';
import { DialogArrayField } from './kizuna/DialogArrayField';
import { EventFieldEditor } from './kizuna/EventFieldEditor';
import { MapFieldEditor } from './kizuna/MapFieldEditor';

interface KizunaInfoEditorProps {
	kizuna: KizunaInfo | undefined;
	allEvents: EventNode[];
	allDialogPackages: DialogPackage[];
	onUpdate: (updates: Partial<KizunaInfo>) => void;
	onEnable: () => void;
	onDisable: () => void;
}

const DIALOG_GROUPS = [
	{ title: '欢迎对话', fields: DIALOG_FIELDS.slice(0, 5) },
	{ title: '闲聊对话', fields: DIALOG_FIELDS.slice(5, 10) },
	{ title: '邀请结果', fields: DIALOG_FIELDS.slice(10, 17) },
	{ title: '请求与委托', fields: DIALOG_FIELDS.slice(17) },
] as const;

export const KizunaInfoEditor = memo<KizunaInfoEditorProps>(
	function KizunaInfoEditor({
		kizuna,
		allEvents,
		allDialogPackages,
		onUpdate,
		onEnable,
		onDisable,
	}) {
		const [isExpanded, setIsExpanded] = useState(false);
		const [isDisableConfirmationOpen, setIsDisableConfirmationOpen] =
			useState(false);

		const handleDialogAdd = useCallback(
			(field: keyof KizunaInfo, dialogName: string) => {
				if (!dialogName) return;
				const current = (kizuna?.[field] as string[]) || [];
				if (current.includes(dialogName)) return;
				onUpdate({ [field]: [...current, dialogName] });
			},
			[kizuna, onUpdate]
		);

		const handleDialogRemove = useCallback(
			(field: keyof KizunaInfo, index: number) => {
				const current = (kizuna?.[field] as string[]) || [];
				onUpdate({ [field]: current.filter((_, i) => i !== index) });
			},
			[kizuna, onUpdate]
		);

		return (
			<EditorSection
				title={
					<div className="flex min-w-0 items-center gap-1">
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
							羁绊配置（Kizuna Info）
						</Button>
						<InfoTip>
							配置角色的羁绊相关信息，包括事件前置条件、对话包等
						</InfoTip>
					</div>
				}
				actions={
					<div className="flex items-center gap-2">
						<span
							className={cn(
								TYPOGRAPHY_STYLES.compactLabel,
								'whitespace-nowrap'
							)}
						>
							{kizuna ? '已启用羁绊配置' : '启用羁绊配置'}
						</span>
						{kizuna ? (
							<ConfirmPopover
								title="确定要关闭羁绊配置吗？"
								description="关闭后将丢失已填写的所有羁绊数据（升级前置事件、各等级对话包、委托区域等），且不可恢复。"
								confirmLabel="确认关闭"
								isOpen={isDisableConfirmationOpen}
								onConfirm={onDisable}
								onOpenChange={setIsDisableConfirmationOpen}
								trigger={
									<Switch
										aria-label="关闭羁绊配置"
										isSelected
										onValueChange={(isSelected) => {
											if (!isSelected) {
												setIsDisableConfirmationOpen(
													true
												);
											}
										}}
										size="sm"
									/>
								}
							/>
						) : (
							<Switch
								aria-label="启用羁绊配置"
								size="sm"
								isSelected={false}
								onValueChange={(isSelected) => {
									if (!isSelected) return;
									setIsExpanded(true);
									onEnable();
								}}
							/>
						)}
					</div>
				}
			>
				{isExpanded && kizuna && (
					<div className="animate-in fade-in slide-in-from-top-2 flex min-w-0 flex-col gap-4 duration-200 motion-reduce:animate-none">
						<section className="flex min-w-0 flex-col gap-4 rounded-medium border border-divider bg-content1/50 p-4 sm:p-5">
							<div className="flex items-center gap-1">
								<Heading as="h4" variant="subsection">
									升级前置事件
								</Heading>
								<InfoTip>
									“升级前置事件”用于检测稀客的羁绊进度是否已满。ResourceEx会检测稀客等级并自动触发对应的事件节点。您需要在“事件节点编辑”中设计羁绊事件
								</InfoTip>
							</div>
							<div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
								{EVENT_FIELDS.map((field) => (
									<EventFieldEditor
										key={field.key}
										label={field.label}
										value={kizuna[field.key]}
										allEvents={allEvents}
										onChange={(value) =>
											onUpdate({ [field.key]: value })
										}
									/>
								))}
							</div>
						</section>

						<section className="flex min-w-0 flex-col gap-4 rounded-medium border border-divider bg-content1/50 p-4 sm:p-5">
							<div className="flex items-center gap-1">
								<Heading as="h4" variant="subsection">
									对话包配置
								</Heading>
								<InfoTip>
									配置与稀客相关的对话包，这些对话包会在与稀客对话时触发
								</InfoTip>
							</div>
							<div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-2">
								{DIALOG_GROUPS.map((group) => (
									<section
										key={group.title}
										className="flex min-w-0 flex-col gap-4 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4"
									>
										<Heading as="h5" variant="subsection">
											{group.title}
										</Heading>
										{group.fields.map((field) => (
											<DialogArrayField
												key={field.key}
												label={field.label}
												dialogs={
													(kizuna[
														field.key
													] as string[]) || []
												}
												allDialogPackages={
													allDialogPackages
												}
												onAdd={(dialogName) =>
													handleDialogAdd(
														field.key,
														dialogName
													)
												}
												onRemove={(index) =>
													handleDialogRemove(
														field.key,
														index
													)
												}
											/>
										))}
									</section>
								))}
							</div>
							<MapFieldEditor
								label={MAP_FIELD.label}
								value={kizuna[MAP_FIELD.key]}
								onChange={(value) =>
									onUpdate({ [MAP_FIELD.key]: value })
								}
							/>
						</section>
					</div>
				)}

				{isExpanded && !kizuna && (
					<EmptyState
						title="暂未启用羁绊配置"
						description="点击右侧开关启用"
					/>
				)}
			</EditorSection>
		);
	}
);
