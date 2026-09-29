import { useId } from 'react';

import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import type { IGiftConfig } from '@/domain/resourcePack/contracts/gift';
import { validateGift } from '@/domain/resourcePack/giftValidation';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IProps {
	gift: IGiftConfig | null;
	onUpdate: (updates: Partial<IGiftConfig>) => void;
}

export function GiftEditor({ gift, onUpdate }: IProps) {
	const titleId = useId();
	const itemId = useId();
	const dialogId = useId();
	const { resourcePack } = useResourceEditor();
	if (!gift) return <EditorDetailEmptyState itemLabel="礼物" />;
	const issues = validateGift(gift, resourcePack);
	const isInvalid = (field: keyof IGiftConfig) =>
		issues.some(
			(issue) => issue.field === field && issue.severity === 'error'
		);
	const localClothes = resourcePack.clothes.find(
		(clothes) => clothes.id === gift.itemId
	);
	const localDialog = resourcePack.dialogPackages.find(
		(dialog) => dialog.name === gift.dialogPackageName
	);

	return (
		<EditorDetailPanel>
			<EditorDetailHeader
				title="礼物编辑"
				description="游戏中显示对话，结束后发放一件物品。列表顺序就是邮箱中的显示顺序。"
			/>
			<EditorSection title="基本信息">
				<div className="flex flex-col gap-1">
					<Label htmlFor={titleId}>礼物标题（title）</Label>
					<Input
						id={titleId}
						value={gift.title}
						isInvalid={isInvalid('title')}
						onChange={(event) =>
							onUpdate({ title: event.target.value })
						}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<Label
							htmlFor={itemId}
							tip="只接受Item及其派生类，不接受食材、料理或酒水。原版与外部资源包的Item可手填ID。"
						>
							Item ID
						</Label>
						<Input
							id={itemId}
							type="number"
							step={1}
							value={
								gift.itemId == null ? '' : String(gift.itemId)
							}
							isInvalid={isInvalid('itemId')}
							onChange={(event) => {
								const raw = event.target.value;
								const value = raw === '' ? null : Number(raw);
								if (value === null || Number.isFinite(value))
									onUpdate({ itemId: value });
							}}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label>从本包衣服中选择</Label>
						<Select<number>
							ariaLabel="从本包衣服中选择"
							value={localClothes?.id}
							items={resourcePack.clothes.map((clothes) => ({
								value: clothes.id,
								label: `[${clothes.id}] ${clothes.name}`,
							}))}
							isDisabled={resourcePack.clothes.length === 0}
							onChange={(value) => onUpdate({ itemId: value })}
						/>
					</div>
				</div>
				<Switch
					isSelected={gift.allowRepeat}
					onValueChange={(allowRepeat) => onUpdate({ allowRepeat })}
				>
					允许重复领取
				</Switch>
				<WarningNotice>
					关闭时，当前已持有同一Item就不再发放；物品移除后可重新领取。衣服、装饰和唱片即使开启重复领取，仍按游戏规则去重。
				</WarningNotice>
			</EditorSection>
			<EditorSection title="绑定对话">
				<Select<string>
					ariaLabel="选择本包对话"
					value={localDialog?.name}
					items={resourcePack.dialogPackages.map((dialog) => ({
						value: dialog.name,
						label: dialog.name,
						description: `${dialog.dialogList.length}条对话`,
					}))}
					placeholder="选择本包对话"
					isDisabled={resourcePack.dialogPackages.length === 0}
					onChange={(dialogPackageName) =>
						onUpdate({ dialogPackageName })
					}
				/>
				<div className="flex flex-col gap-1">
					<Label
						htmlFor={dialogId}
						tip="填写dialogPackages中的name。引用外部对话时，需确保对应ResourceEx包已加载。"
					>
						对话包名称（dialogPackageName）
					</Label>
					<Input
						id={dialogId}
						value={gift.dialogPackageName}
						isInvalid={isInvalid('dialogPackageName')}
						onChange={(event) =>
							onUpdate({ dialogPackageName: event.target.value })
						}
					/>
				</div>
			</EditorSection>
			{issues.length > 0 && (
				<EditorSection title="配置检查">
					<ul className="space-y-2 text-sm">
						{issues.map((issue, index) => (
							<li
								key={index}
								className={
									issue.severity === 'error'
										? 'text-danger'
										: 'text-warning-700 dark:text-warning'
								}
							>
								{issue.message}
							</li>
						))}
					</ul>
				</EditorSection>
			)}
		</EditorDetailPanel>
	);
}
