export const KNOWN_DEPENDENCIES = [
	'CORE',
	'DLC1',
	'DLC2',
	'DLC3',
	'DLC4',
	'DLC5',
	'DLCMUSIC',
] as const;

export const GIFT_PRODUCT_TYPES = [
	'Item',
	'Recipe',
	'Food',
	'Beverage',
	'Ingredient',
] as const;

export const PACK_LABEL_ALLOWED_PATTERN = /^[A-Za-z0-9_+\-. ]+$/;

export const PACK_LABEL_ALLOWED_DESCRIPTION = '仅允许字母、数字、_+-. 和空格';

export const GAME_ID_MAX = 8999;
export const MANAGED_ID_MIN = 9000;
export const MANAGED_ID_MAX = 1073741823;
export const UNMANAGED_ID_MIN = 1073741824;
export const UNMANAGED_ID_MAX = 2147483647;

export function isValidPackLabel(label: string | undefined | null): boolean {
	if (!label) return false;
	return PACK_LABEL_ALLOWED_PATTERN.test(label);
}
