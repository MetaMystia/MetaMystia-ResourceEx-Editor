import { memo, useCallback, useId } from 'react';

import { Button } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import { DialogItemWrapper } from './DialogItem';
import { ErrorBadge } from '@/components/common/ErrorBadge';
import { WarningBadge } from '@/components/common/WarningBadge';
import { cn } from '@/design/ui/utils';
import type { Dialog, DialogPackage } from '@/types/resource';
import { Label } from '../common/Label';
import { useLabelPrefixValidation } from '@/components/common/useLabelPrefixValidation';

interface DialogEditorProps {
	allPackages: DialogPackage[];
	dialogPackage: DialogPackage | null;
	packageIndex: number | null;
	onAddDialog: (
		insertIndex?: number,
		searchPosition?: Dialog['position'] | 'recent'
	) => void;
	onRemoveDialog: (index: number) => void;
	onUpdate: (updates: Partial<DialogPackage>) => void;
	onUpdateDialog: (index: number, updates: Partial<Dialog>) => void;
}

export const DialogEditor = memo<DialogEditorProps>(function DialogEditor({
	allPackages,
	dialogPackage,
	packageIndex,
	onAddDialog,
	onRemoveDialog,
	onUpdate,
	onUpdateDialog,
}) {
	const id = useId();
	const {
		isValid: isNamePrefixValid,
		prefix: expectedPrefix,
		hasPackLabel,
	} = useLabelPrefixValidation(dialogPackage?.name || '');
	const showPrefixWarning =
		hasPackLabel && dialogPackage && !isNamePrefixValid;

	const isNameDuplicate = useCallback(
		(name: string, index: number | null) => {
			return allPackages.some(
				(p, i) => i !== index && p.name === name && name.length > 0
			);
		},
		[allPackages]
	);

	if (!dialogPackage) {
		return (
			<div className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 shadow-md backdrop-blur lg:col-span-2">
				<div className="flex items-center justify-center text-center font-semibold italic opacity-30">
					请在左侧选择一个对话包进行编辑，或点击 + 按钮创建新对话包
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-8 overflow-y-auto rounded-lg bg-white/10 p-4 shadow-md backdrop-blur lg:col-span-2">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label
						htmlFor={id}
						className="block w-full text-sm font-medium opacity-80"
						tip={
							'必须保证全局唯一\n建议以 _{资源包label}_ 开头\n例如：_MyPack_Kizuna_Daiyousei_LV1_001\n修改此名称需要对应修改引用此对话包的地方\n全局：游戏以及全部资源包'
						}
					>
						对话包名称
					</Label>
					<div className="flex gap-2">
						{isNameDuplicate(dialogPackage.name, packageIndex) && (
							<ErrorBadge>命名重复</ErrorBadge>
						)}
						{showPrefixWarning && (
							<WarningBadge>
								建议以 {expectedPrefix} 开头
							</WarningBadge>
						)}
					</div>
				</div>
				<input
					id={id}
					type="text"
					value={dialogPackage.name}
					onChange={(e) => {
						onUpdate({ name: e.target.value });
					}}
					className={cn(
						'w-full rounded-lg border bg-white/40 px-3 py-2 text-sm text-foreground outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:bg-black/10 dark:focus:border-white/30 dark:focus:ring-white/10',
						isNameDuplicate(dialogPackage.name, packageIndex)
							? 'border-danger bg-danger text-white opacity-50 focus:border-danger'
							: 'border-black/10 dark:border-white/10'
					)}
				/>
			</div>
			<div className="flex items-center justify-between">
				<span className="block w-full text-sm font-medium opacity-80">
					对话列表（{dialogPackage.dialogList.length}）
				</span>
				<SectionAddButton
					onPress={() => {
						onAddDialog();
					}}
				>
					添加对话
				</SectionAddButton>
			</div>
			<div className="flex flex-col gap-2">
				{/* 在列表首位添加插入按钮 */}
				{dialogPackage.dialogList.length > 0 && (
					<Button
						variant="light"
						size="sm"
						onPress={() => {
							onAddDialog(0);
						}}
						className="w-full rounded-lg border border-dashed border-black/10 text-xs dark:border-white/10"
					>
						在顶部插入对话
					</Button>
				)}
				{dialogPackage.dialogList.map((dialog, index) => (
					<div key={index} className="flex flex-col gap-2">
						<DialogItemWrapper
							dialog={dialog}
							index={index}
							onRemove={() => {
								onRemoveDialog(index);
							}}
							onUpdate={(updates) =>
								onUpdateDialog(index, updates)
							}
						/>
						<div className="flex w-full gap-1">
							<Button
								variant="light"
								size="sm"
								onPress={() => {
									onAddDialog(index + 1, 'Left');
								}}
								className="flex-1 rounded-lg border border-dashed border-black/10 text-xs dark:border-white/10"
								title="使用上方最近的左侧角色"
							>
								↑ 左
							</Button>
							<Button
								variant="light"
								size="sm"
								onPress={() => {
									onAddDialog(index + 1, 'recent');
								}}
								className="flex-[2] rounded-lg border border-dashed border-black/10 text-xs dark:border-white/10"
								title="使用上方最近的对话"
							>
								在此处插入对话
							</Button>
							<Button
								variant="light"
								size="sm"
								onPress={() => {
									onAddDialog(index + 1, 'Right');
								}}
								className="flex-1 rounded-lg border border-dashed border-black/10 text-xs dark:border-white/10"
								title="使用上方最近的右侧角色"
							>
								右 ↑
							</Button>
						</div>
					</div>
				))}
				{dialogPackage.dialogList.length === 0 && (
					<EmptyState
						title="暂无对话"
						description="点击上方按钮添加"
					/>
				)}
			</div>
		</div>
	);
});
