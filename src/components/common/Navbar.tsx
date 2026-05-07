'use client';

import { memo, useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

import {
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
} from '@/design/ui/components';
import { useData } from '@/components/context/DataContext';
import { validateResourcePack } from './validateResourcePack';
import { ExportValidationDialog } from './ExportValidationDialog';
import { openAnnouncementModal } from './AnnouncementModal';
import type { ValidationIssue } from './validateResourcePack';

interface NavDropdownProps {
	label: string;
	active: boolean;
	items: { href: string; label: string }[];
}

const NavDropdown = memo(function NavDropdown({
	label,
	active,
	items,
}: NavDropdownProps) {
	const pathname = usePathname();

	return (
		<Dropdown>
			<DropdownTrigger>
				<Button
					variant={active ? 'flat' : 'light'}
					color={active ? 'primary' : 'default'}
					size="md"
				>
					{label}
				</Button>
			</DropdownTrigger>
			<DropdownMenu
				aria-label={`${label} navigation`}
				selectionMode="none"
			>
				{items.map((item) => (
					<DropdownItem
						key={item.href}
						as={Link}
						href={item.href}
						className={pathname === item.href ? 'text-primary' : ''}
						textValue={item.label}
					>
						{item.label}
					</DropdownItem>
				))}
			</DropdownMenu>
		</Dropdown>
	);
});

export const Navbar = memo(function Navbar() {
	const pathname = usePathname();
	const { data, assetUrls, createBlank, loadResourcePack, saveResourcePack } =
		useData();
	const [validationIssues, setValidationIssues] = useState<
		ValidationIssue[] | null
	>(null);

	const handleExport = useCallback(async () => {
		const issues = await validateResourcePack(data, Object.keys(assetUrls));
		if (issues.length > 0) {
			setValidationIssues(issues);
		} else {
			saveResourcePack();
		}
	}, [data, assetUrls, saveResourcePack]);

	const handleExportConfirm = useCallback(() => {
		setValidationIssues(null);
		saveResourcePack();
	}, [saveResourcePack]);

	const handleExportCancel = useCallback(() => {
		setValidationIssues(null);
	}, []);

	const isItemsActive = [
		'/ingredient',
		'/food',
		'/recipe',
		'/beverage',
		'/clothes',
	].includes(pathname);
	const isNodesActive = ['/mission', '/event'].includes(pathname);
	const isCharacterActive = ['/character', '/dialogue', '/merchant'].includes(
		pathname
	);

	return (
		<>
			<header className="sticky top-0 z-50 border-b border-default-200 bg-background/80 backdrop-blur-lg">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 3xl:max-w-screen-2xl 4xl:max-w-screen-3xl">
					<div className="flex items-center gap-4">
						<div className="hidden items-center gap-1 md:flex">
							<span className="image-rendering-pixelated h-10 w-10 shrink-0 rounded-full bg-logo bg-cover bg-no-repeat" />
							<span className="whitespace-nowrap text-lg font-bold">
								ResourceEx Editor
							</span>
						</div>
						<nav className="flex items-center gap-1">
							<Button
								as={Link}
								href="/info"
								variant={
									pathname === '/info' ? 'flat' : 'light'
								}
								color={
									pathname === '/info' ? 'primary' : 'default'
								}
								size="md"
							>
								基础信息
							</Button>

							<NavDropdown
								label="角色"
								active={isCharacterActive}
								items={[
									{ href: '/character', label: '稀客' },
									{ href: '/dialogue', label: '对话' },
									{ href: '/merchant', label: '商人' },
								]}
							/>

							<NavDropdown
								label="素材"
								active={isItemsActive}
								items={[
									{ href: '/ingredient', label: '原料' },
									{ href: '/food', label: '料理' },
									{ href: '/recipe', label: '菜谱' },
									{ href: '/beverage', label: '酒水' },
									{ href: '/clothes', label: '服装' },
								]}
							/>

							<NavDropdown
								label="节点"
								active={isNodesActive}
								items={[
									{ href: '/mission', label: '任务节点' },
									{ href: '/event', label: '事件节点' },
								]}
							/>

							<Button
								as={Link}
								href="/asset"
								variant={
									pathname === '/asset' ? 'flat' : 'light'
								}
								color={
									pathname === '/asset'
										? 'primary'
										: 'default'
								}
								size="md"
							>
								资产
							</Button>
						</nav>
					</div>
					<div className="flex items-center gap-1">
						<a
							href="https://github.com/MetaMystia/MetaMystia-ResourceEx-Editor"
							target="_blank"
							rel="noreferrer noopener"
							aria-label="GitHub"
						>
							<Button isIconOnly variant="light" size="lg">
								<svg
									viewBox="0 0 24 24"
									className="h-6 w-6"
									fill="currentColor"
								>
									<path d="M12 .5C5.73.5.79 5.44.79 11.71c0 4.94 3.2 9.13 7.64 10.61.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.11-3.11.68-3.77-1.32-3.77-1.32-.51-1.29-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.63 1.22 3.27.94.1-.73.39-1.22.71-1.5-2.49-.28-5.11-1.25-5.11-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.99 0 0 .94-.3 3.09 1.15.9-.25 1.86-.37 2.82-.38.96.01 1.92.13 2.82.38 2.15-1.45 3.09-1.15 3.09-1.15.61 1.56.23 2.71.11 2.99.72.79 1.16 1.79 1.16 3.02 0 4.31-2.62 5.27-5.12 5.55.4.34.76 1.02.76 2.05 0 1.48-.01 2.67-.01 3.04 0 .3.2.65.78.54 4.43-1.49 7.62-5.67 7.62-10.61C23.21 5.44 18.27.5 12 .5z" />
								</svg>
							</Button>
						</a>
						<Button
							variant="light"
							size="md"
							onPress={openAnnouncementModal}
						>
							公告
						</Button>
						<Button variant="light" size="md" onPress={createBlank}>
							全新创建
						</Button>
						<Button
							variant="light"
							size="md"
							onPress={() => {
								const input = document.createElement('input');
								input.type = 'file';
								input.accept = '.zip';
								input.onchange = (e) => {
									const file = (e.target as HTMLInputElement)
										.files?.[0];
									if (file) loadResourcePack(file);
								};
								input.click();
							}}
						>
							上传资源包(ZIP)
						</Button>
						<Button
							variant="solid"
							color="primary"
							size="md"
							onPress={handleExport}
						>
							导出资源包(ZIP)
						</Button>
					</div>
				</div>
			</header>

			{validationIssues && (
				<ExportValidationDialog
					issues={validationIssues}
					onConfirm={handleExportConfirm}
					onCancel={handleExportCancel}
				/>
			)}
		</>
	);
});
