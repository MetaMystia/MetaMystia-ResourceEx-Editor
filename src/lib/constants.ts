export const KNOWN_DEPENDENCIES = [
	'CORE',
	'DLC1',
	'DLC2',
	'DLC3',
	'DLC4',
	'DLC5',
	'DLCMUSIC',
] as const;

/**
 * 资源包唯一标识符 (packInfo.label) 的允许字符集。
 *
 * - 仅允许：字母、数字、下划线、加号 (+)、减号 (-)、点 (.)、空格
 * - 不允许空字符串
 * - 该 label 会被嵌入到所有实体 label 的前缀中 (`_{packLabel}_xxx`)，
 *   并参与文件名、ID 签名等场景，因此对字符集做强约束以避免转义/路径问题。
 */
export const PACK_LABEL_ALLOWED_PATTERN = /^[A-Za-z0-9_+\-. ]+$/;

export const PACK_LABEL_ALLOWED_DESCRIPTION = '仅允许字母、数字、_+-. 和空格';

export function isValidPackLabel(label: string | undefined | null): boolean {
	if (!label) return false;
	return PACK_LABEL_ALLOWED_PATTERN.test(label);
}
