import { GAME_ID_MAX } from './constants';
import type { GiftProductType, IGiftConfig } from './contracts/gift';
import type { ResourceEx } from './contracts/resourceEx';
import { type IssueSeverity } from './validation';

export const MAX_GIFT_AMOUNT = 99999;

export const GIFT_PRODUCT_TYPE_LABELS = {
	Beverage: '酒水',
	Food: '料理',
	Ingredient: '食材',
	Item: '物品',
	Recipe: '食谱',
} as const satisfies Record<GiftProductType, string>;

export function getLocalGiftProductIds(
	resourcePack: ResourceEx,
	productType: GiftProductType
): number[] {
	switch (productType) {
		case 'Beverage':
			return resourcePack.beverages.map(({ id }) => id);
		case 'Food':
			return resourcePack.foods.map(({ id }) => id);
		case 'Ingredient':
			return resourcePack.ingredients.map(({ id }) => id);
		case 'Item':
			return resourcePack.clothes.map(({ id }) => id);
		case 'Recipe':
			return resourcePack.recipes.map(({ id }) => id);
	}
}

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
	const label = GIFT_PRODUCT_TYPE_LABELS[gift.productType];
	const localIds = getLocalGiftProductIds(resourcePack, gift.productType);
	if (
		typeof gift.productId !== 'number' ||
		!Number.isInteger(gift.productId) ||
		gift.productId < -2147483648 ||
		gift.productId > 2147483647
	) {
		issues.push({
			field: 'productId',
			severity: 'error',
			message: `${label}ID必须是-2147483648～2147483647范围内的整数，不能留空。`,
		});
	} else if (
		!localIds.includes(gift.productId) &&
		(gift.productType === 'Item' || gift.productId > GAME_ID_MAX)
	) {
		issues.push({
			field: 'productId',
			severity: 'warning',
			message:
				gift.productType === 'Item'
					? `Item ${gift.productId}不在本包衣服中，请在游戏中确认它是已注册的Item。`
					: `${label}${gift.productId}不在本包中，请确认提供它的ResourceEx包已加载。`,
		});
	}
	if (
		!Number.isInteger(gift.productAmount) ||
		gift.productAmount < 1 ||
		gift.productAmount > MAX_GIFT_AMOUNT
	) {
		issues.push({
			field: 'productAmount',
			severity: 'error',
			message: `数量必须是1～${MAX_GIFT_AMOUNT}的整数。`,
		});
	} else if (
		gift.productAmount !== 1 &&
		(gift.productType === 'Recipe' ||
			(gift.productType === 'Item' &&
				localIds.includes(gift.productId ?? NaN)))
	) {
		issues.push({
			field: 'productAmount',
			severity: 'warning',
			message: '食谱和衣服不能叠加，请把数量保持为1。',
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
