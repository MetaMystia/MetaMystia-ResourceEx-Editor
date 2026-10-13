import { cn } from '@heroui/theme';
import { type Metadata } from 'next';
import { Noto_Sans, Noto_Sans_Mono, Noto_Sans_SC } from 'next/font/google';
import { type PropsWithChildren } from 'react';

import { THEME_VARIANT_CLASS_NAME } from './design/theme/runtime/constants';
import ThemeScript from './design/theme/runtime/themeScript';
import { AppNavbar } from './features/appShell/client/AppNavbar';
import { BackToTop } from './features/appShell/client/BackToTop';
import Providers from './providers';

import './globals.scss';

export const metadata: Metadata = {
	icons: { icon: '/assets/icon.png' },
	title: 'MetaMystia ResourceEx Editor',
};

const notoSans = Noto_Sans({
	subsets: ['latin'],
	variable: '--font-noto-sans',
	weight: 'variable',
});

const notoSansMono = Noto_Sans_Mono({
	subsets: ['latin'],
	variable: '--font-noto-sans-mono',
	weight: 'variable',
});

const notoSansSC = Noto_Sans_SC({
	subsets: ['latin'],
	variable: '--font-noto-sans-sc',
	weight: 'variable',
});

export default function RootLayout({ children }: PropsWithChildren) {
	return (
		<html
			suppressHydrationWarning
			lang="zh-CN"
			className={cn(
				notoSans.variable,
				notoSansMono.variable,
				notoSansSC.variable,
				'selection-custom',
				THEME_VARIANT_CLASS_NAME
			)}
		>
			<head>
				<ThemeScript />
			</head>
			<body
				suppressHydrationWarning
				className="text-autospace bg-blend-mystia-pseudo antialiased"
			>
				<Providers>
					<div className="flex min-h-dvh-safe flex-col">
						<AppNavbar />
						<main className="grow">
							<div id="modal-portal-container" />
							{children}
						</main>
					</div>
					<BackToTop />
				</Providers>
			</body>
		</html>
	);
}
