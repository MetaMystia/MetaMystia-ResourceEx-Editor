import { type PropsWithChildren } from 'react';
import { type Metadata } from 'next';
import { Noto_Sans, Noto_Sans_Mono, Noto_Sans_SC } from 'next/font/google';

import { ThemeScript } from '@/design/hooks';
import { cn } from '@/design/ui/components';
import { Navbar } from '@/components/common/Navbar';
import Providers from './providers';

import './globals.scss';

export const metadata: Metadata = { title: 'MetaMystia ResourceEx Editor' };

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
				'selection-custom light:izakaya dark:izakaya-dark'
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
						<Navbar />
						<main className="grow">{children}</main>
					</div>
				</Providers>
			</body>
		</html>
	);
}
