import { heroui } from '@heroui/theme';
import { type Config } from 'tailwindcss';

import PACKAGE from './package.json';

import {
	fontFamily,
	getExtendConfig,
	semanticColors,
} from './app/design/theme';

const herouiComponents = [
	...Object.keys(PACKAGE.dependencies)
		.filter(
			(dependency) =>
				dependency.startsWith('@heroui/') &&
				dependency !== '@heroui/system' &&
				dependency !== '@heroui/theme'
		)
		.map((dependency) => dependency.replace('@heroui/', '')),
	'spinner', // For `@heroui/button` loading states.
	'toggle', // For `@heroui/switch`.
];

const config: Config = {
	content: [
		'./app/**/*.{ts,tsx}',
		`./node_modules/@heroui/theme/dist/components/(${herouiComponents.join('|')}).js`,
	],
	darkMode: 'selector',
	future: { hoverOnlyWhenSupported: true },
	theme: { extend: getExtendConfig(), fontFamily },
	plugins: [
		heroui({
			themes: {
				'izakaya-dark': { extend: 'dark', colors: semanticColors.dark },
				izakaya: { extend: 'light', colors: semanticColors.light },
			},
		}),
	],
};

export default config;
