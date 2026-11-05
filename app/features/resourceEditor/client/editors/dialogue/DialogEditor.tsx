import { memo, useCallback, useId } from 'react';

import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Tooltip from '@/design/ui/components/tooltip';

import type {
	Dialog,
	DialogPackage,
} from '@/domain/resourcePack/contracts/dialogue';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { useFocusOnItemInsert } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';
import { useLabelPrefixValidation } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

import { DialogItemWrapper } from './DialogItem';

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
	const { containerRef: dialogListRef, prepareFocusOnInsert } =
		useFocusOnItemInsert(
			dialogPackage?.dialogList.length ?? 0,
			'textarea:not([disabled])'
		);
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
	const handleAddDialog = useCallback(
		(
			insertIndex?: number,
			searchPosition?: Dialog['position'] | 'recent'
		) => {
			prepareFocusOnInsert(
				insertIndex ?? dialogPackage?.dialogList.length ?? 0
			);
			onAddDialog(insertIndex, searchPosition);
		},
		[dialogPackage?.dialogList.length, onAddDialog, prepareFocusOnInsert]
	);

	if (!dialogPackage) {
		return <EditorDetailEmptyState itemLabel="对话包" />;
	}

	return (
		<EditorDetailPanel>
			<EditorDetailHeader title="对话包编辑" />
			<EditorSection title="基本信息">
				<div className="flex items-center justify-between">
					<Label
						htmlFor={id}
						className="block w-full"
						tip={
							'必须保证全局唯一\n建议以_{资源包label}_开头\n例如：_MyPack_Kizuna_Daiyousei_LV1_001\n修改此名称需要对应修改引用此对话包的地方\n全局：游戏以及全部资源包'
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
								建议以{expectedPrefix}开头
							</WarningBadge>
						)}
					</div>
				</div>
				<Input
					id={id}
					type="text"
					value={dialogPackage.name}
					onChange={(e) => {
						onUpdate({ name: e.target.value });
					}}
					isInvalid={isNameDuplicate(
						dialogPackage.name,
						packageIndex
					)}
				/>
			</EditorSection>
			<EditorSection
				title={`对话列表（${dialogPackage.dialogList.length}）`}
				actions={
					<SectionAddButton
						onPress={() => {
							handleAddDialog();
						}}
					>
						添加对话
					</SectionAddButton>
				}
			>
				<div ref={dialogListRef} className="flex flex-col gap-2">
					{/* 在列表首位添加插入按钮 */}
					{dialogPackage.dialogList.length > 0 && (
						<Button
							variant="bordered"
							size="sm"
							onPress={() => {
								handleAddDialog(0);
							}}
							className="min-h-10 w-full text-xs sm:min-h-8"
						>
							在顶部插入对话
						</Button>
					)}
					{dialogPackage.dialogList.map((dialog, index) => (
						<div
							key={index}
							data-editor-appended-item
							className="flex flex-col gap-2"
						>
							<DialogItemWrapper
								dialog={dialog}
								dialogCount={dialogPackage.dialogList.length}
								index={index}
								onRemove={() => {
									onRemoveDialog(index);
								}}
								onUpdate={(updates) =>
									onUpdateDialog(index, updates)
								}
							/>
							<div className="flex w-full gap-1">
								<Tooltip content="使用上方最近的左侧角色">
									<Button
										variant="bordered"
										size="sm"
										onPress={() => {
											handleAddDialog(index + 1, 'Left');
										}}
										className="min-h-10 flex-1 px-2 text-xs sm:min-h-8"
									>
										沿用左侧角色
									</Button>
								</Tooltip>
								<Tooltip content="使用上方最近的对话">
									<Button
										variant="bordered"
										size="sm"
										onPress={() => {
											handleAddDialog(
												index + 1,
												'recent'
											);
										}}
										className="min-h-10 flex-[2] px-2 text-xs sm:min-h-8"
									>
										在此处插入对话
									</Button>
								</Tooltip>
								<Tooltip content="使用上方最近的右侧角色">
									<Button
										variant="bordered"
										size="sm"
										onPress={() => {
											handleAddDialog(index + 1, 'Right');
										}}
										className="min-h-10 flex-1 px-2 text-xs sm:min-h-8"
									>
										沿用右侧角色
									</Button>
								</Tooltip>
							</div>
						</div>
					))}
					{dialogPackage.dialogList.length === 0 && (
						<EmptyState
							title="暂无对话"
							description="使用“添加对话”创建第一项"
						/>
					)}
				</div>
			</EditorSection>
		</EditorDetailPanel>
	);
});
