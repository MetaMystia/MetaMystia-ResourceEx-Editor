import { defaultBackgrounds } from '../colors/constants/backgroundColors';

export const COLOR_MAP = {
	DARK: defaultBackgrounds.dark,
	LIGHT: defaultBackgrounds.light,
	LIGHT_THEME: defaultBackgrounds.lightTheme,
} as const;

export const MEDIA = '(prefers-color-scheme: dark)';

export const THEME_MAP = {
	DARK: 'dark',
	LIGHT: 'light',
	SYSTEM: 'system',
} as const;

export const STORAGE_KEY = 'theme';

/** 让元素套用应用主题配色的类名；会自行添加 light/dark 类的第三方组件根节点也需要加上。 */
export const THEME_VARIANT_CLASS_NAME = 'light:izakaya dark:izakaya-dark';
