import type { IGiftConfig } from './contracts/gift';
import type { ResourceEx } from './contracts/resourceEx';
import { type IssueSeverity } from './validation';

export interface IGiftValidationIssue {
	field: keyof IGiftConfig;
	severity: IssueSeverity;
	message: string;
}

export function validateGift(
	gift: IGiftConfig,
	resourcePack: ResourceEx
): IGiftValidationIssue[] {
	const issues: IGiftValidationIssue[] = [];
	if (!gift.title.trim()) {
		issues.push({
			field: 'title',
			severity: 'error',
			message: '请填写礼物标题。',
		});
	}
	if (
		typeof gift.itemId !== 'number' ||
		!Number.isInteger(gift.itemId) ||
		gift.itemId < -2147483648 ||
		gift.itemId > 2147483647
	) {
		issues.push({
			field: 'itemId',
			severity: 'error',
			message:
				'Item ID必须是-2147483648～2147483647范围内的整数，不能留空。',
		});
	} else if (
		!resourcePack.clothes.some((clothes) => clothes.id === gift.itemId)
	) {
		issues.push({
			field: 'itemId',
			severity: 'warning',
			message: `Item ${gift.itemId}不在本包衣服中，请在游戏中确认它是已注册的Item。`,
		});
	}
	const dialogName = gift.dialogPackageName.trim();
	const dialog = resourcePack.dialogPackages.find(
		(item) => item.name === dialogName
	);
	if (!dialogName) {
		issues.push({
			field: 'dialogPackageName',
			severity: 'error',
			message: '请选择或填写绑定对话。',
		});
	} else if (dialog && dialog.dialogList.length === 0) {
		issues.push({
			field: 'dialogPackageName',
			severity: 'error',
			message: '绑定的对话包没有对话内容。',
		});
	} else if (!dialog) {
		const isLocalLabel = Boolean(
			resourcePack.packInfo.label &&
			dialogName.startsWith(`_${resourcePack.packInfo.label}_`)
		);
		issues.push({
			field: 'dialogPackageName',
			severity: isLocalLabel ? 'error' : 'warning',
			message: isLocalLabel
				? `本包对话“${dialogName}”不存在。`
				: `对话“${dialogName}”不在本包中，请确认提供它的ResourceEx包已加载。`,
		});
	}
	return issues;
}
