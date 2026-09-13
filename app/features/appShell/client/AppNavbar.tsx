'use client';

import {
	Navbar as HeroUINavbar,
	NavbarBrand,
	NavbarContent,
	NavbarItem,
	NavbarMenu,
	NavbarMenuItem,
	NavbarMenuToggle,
} from '@heroui/navbar';
import { cn } from '@heroui/theme';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Dropdown, {
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
} from '@/design/ui/components/dropdown';
import Heading from '@/design/ui/components/heading';
import PressElement from '@/design/ui/components/pressElement';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { openAnnouncementModal } from '@/features/announcements/client/AnnouncementModal';
import { ConfirmDialog } from '@/features/resourceEditor/client/components/confirm/ConfirmDialog';
import { ExportValidationDialog } from '@/features/resourceEditor/client/components/export/ExportValidationDialog';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { subscribeEditorNavigationNotice } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';
import {
	type IResourcePackValidationIssue,
	validateResourcePackForExport,
} from '@/features/resourceEditor/client/validation/validateResourcePackForExport';
import { WorkspaceDuplicateDialog } from '@/features/resourceEditor/client/workspaces/components/WorkspaceDuplicateDialog';
import { WorkspaceLeaseConflictDialog } from '@/features/resourceEditor/client/workspaces/components/WorkspaceLeaseConflictDialog';
import { WorkspaceLeaseLossDialog } from '@/features/resourceEditor/client/workspaces/components/WorkspaceLeaseLossDialog';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

interface INavItem {
	readonly href: string;
	readonly label: string;
}

interface INavGroup {
	readonly items: readonly INavItem[];
	readonly label: string;
}

const NAV_GROUPS = [
	{
		label: '角色',
		items: [
			{ href: '/character', label: '稀客' },
			{ href: '/dialogue', label: '对话' },
			{ href: '/merchant', label: '商人' },
			{ href: '/gift', label: '礼物邮箱' },
		],
	},
	{
		label: '素材',
		items: [
			{ href: '/ingredient', label: '食材' },
			{ href: '/food', label: '料理' },
			{ href: '/recipe', label: '食谱' },
			{ href: '/beverage', label: '酒水' },
			{ href: '/clothes', label: '衣服' },
		],
	},
	{
		label: '场景与节点',
		items: [
			{ href: '/map', label: '白天地图' },
			{ href: '/mission', label: '任务节点' },
			{ href: '/event', label: '事件节点' },
		],
	},
] as const satisfies readonly INavGroup[];

const MOBILE_NAV_GROUPS: readonly INavGroup[] = [
	{ label: '资源包', items: [{ href: '/info', label: '基础信息' }] },
	...NAV_GROUPS,
	{ label: '资产', items: [{ href: '/asset', label: '资产管理' }] },
] as const;

const MOBILE_NAV_ITEMS = MOBILE_NAV_GROUPS.flatMap((group) => group.items);

const GITHUB_URL = 'https://github.com/MetaMystia/MetaMystia-ResourceEx-Editor';
const MOBILE_CARD_BASE_CLASS_NAME =
	'rounded-small border bg-content1/45 shadow-[0_1px_0_rgba(0,0,0,0.025)] transition-[background-color,border-color,box-shadow] motion-reduce:transition-none dark:bg-default-50/10 dark:shadow-none';
const MOBILE_CARD_ACTIVE_CLASS_NAME =
	'border-primary/40 text-primary-700 dark:text-primary';
const MOBILE_CARD_INACTIVE_CLASS_NAME =
	'border-default-200/75 text-foreground-700 data-[hover=true]:border-default-300 data-[hover=true]:bg-content1/65 dark:border-default-200/60 dark:data-[hover=true]:bg-default-50/15';
const MOBILE_CARD_CONTENT_CLASS_NAME =
	'group relative flex h-auto min-h-12 w-full min-w-0 items-center justify-start gap-3 overflow-hidden px-3 py-2.5';
const MOBILE_MENU_ID = 'app-navbar-mobile-menu';
const MOBILE_MENU_TOGGLE_ID = 'app-navbar-mobile-menu-toggle';

interface INavDropdownProps {
	label: string;
	items: readonly INavItem[];
}

const NavDropdown = memo<INavDropdownProps>(function NavDropdown({
	items,
	label,
}) {
	const pathname = usePathname();
	const router = useRouter();
	const isActive = items.some((item) => item.href === pathname);

	return (
		<Dropdown>
			<DropdownTrigger showArrow>
				<Button
					variant={isActive ? 'flat' : 'light'}
					color={isActive ? 'primary' : 'default'}
				>
					{label}
				</Button>
			</DropdownTrigger>
			<DropdownMenu
				aria-label={`“${label}”导航`}
				selectionMode="none"
				onAction={(key) => {
					const item = items.find(({ href }) => href === String(key));
					if (item) router.push(item.href);
				}}
			>
				{items.map((item) => (
					<DropdownItem
						key={item.href}
						textValue={item.label}
						className={pathname === item.href ? 'text-primary' : ''}
					>
						{item.label}
					</DropdownItem>
				))}
			</DropdownMenu>
		</Dropdown>
	);
});

interface INotice {
	title: string;
	description: string;
}

type TStatusBadgeTone = 'error' | 'success' | 'warning';

interface IWorkspaceStatusBadgesProps {
	badgeClassName?: string;
	className?: string;
	exportLabel: string;
	isExported: boolean;
	localSaveLabel: string;
	localSaveTone: TStatusBadgeTone;
}

function WorkspaceStatusBadges({
	badgeClassName = 'whitespace-nowrap px-2 py-1 text-xs',
	className,
	exportLabel,
	isExported,
	localSaveLabel,
	localSaveTone,
}: IWorkspaceStatusBadgesProps) {
	const LocalSaveBadge =
		localSaveTone === 'error'
			? ErrorBadge
			: localSaveTone === 'warning'
				? WarningBadge
				: SuccessBadge;
	const ExportBadge = isExported ? SuccessBadge : WarningBadge;

	return (
		<span className={cn('flex flex-wrap items-center gap-1.5', className)}>
			<LocalSaveBadge className={badgeClassName}>
				{localSaveLabel}
			</LocalSaveBadge>
			<ExportBadge className={badgeClassName}>{exportLabel}</ExportBadge>
		</span>
	);
}

export const AppNavbar = memo(function AppNavbar() {
	const pathname = usePathname();
	const router = useRouter();
	const isComparisonRoute = pathname === '/compare';
	const isReducedMotion = useReducedMotion();
	const activeExportTriggerRef = useRef<HTMLButtonElement | null>(null);
	const desktopExportTriggerRef = useRef<HTMLButtonElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const managerExportWorkspaceIdRef = useRef<string | null>(null);
	const mobileMenuFirstItemRef = useRef<HTMLButtonElement>(null);
	const {
		activeWorkspaceId,
		assets: { urls: assetUrls },
		exportStatus,
		exportArchive,
		isExporting,
		localSaveError,
		localSaveStatus,
		resourcePack,
		revision,
		storageMode,
	} = useResourceEditor();
	const {
		activeWorkspace,
		clearPendingWorkspaceExport,
		closeWorkspace,
		createWorkspace,
		importWorkspace,
		isRetryingStorage,
		lifecycleStatus,
		pendingExportWorkspaceId,
		retryPersistentStorage,
		storageError,
	} = useResourceWorkspaces();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [notice, setNotice] = useState<INotice | null>(null);
	const [validationResult, setValidationResult] = useState<{
		issues: IResourcePackValidationIssue[];
		revision: number;
	} | null>(null);
	useEffect(
		() =>
			subscribeEditorNavigationNotice((nextNotice) =>
				setNotice(nextNotice)
			),
		[]
	);
	const hasActiveWorkspace =
		activeWorkspace !== null &&
		activeWorkspace.workspace.id === activeWorkspaceId;
	const hasEditorNavigation = hasActiveWorkspace && !isComparisonRoute;
	const isFileOperationPending =
		isExporting ||
		isRetryingStorage ||
		(lifecycleStatus !== 'editing' && lifecycleStatus !== 'manager');

	useEffect(() => {
		if (!isMenuOpen) return;

		const focusFrame = requestAnimationFrame(() => {
			mobileMenuFirstItemRef.current?.focus({ preventScroll: true });
		});
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setIsMenuOpen(false);
				requestAnimationFrame(() =>
					document.getElementById(MOBILE_MENU_TOGGLE_ID)?.focus()
				);
				return;
			}

			if (event.key !== 'Tab') return;
			const menu = document.getElementById(MOBILE_MENU_ID);
			if (!menu) return;
			const focusableElements = Array.from(
				menu.querySelectorAll<HTMLElement>(
					'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			).filter((element) => element.getClientRects().length > 0);
			const firstElement = focusableElements[0];
			const lastElement = focusableElements.at(-1);
			if (!firstElement || !lastElement) return;

			if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (
				!event.shiftKey &&
				document.activeElement === lastElement
			) {
				event.preventDefault();
				firstElement.focus();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			cancelAnimationFrame(focusFrame);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isMenuOpen]);

	const showOperationError = useCallback((action: string, error?: string) => {
		setNotice({ title: `${action}失败`, description: error ?? '未知错误' });
	}, []);
	const finishManagerWorkspaceExport = useCallback(async () => {
		if (managerExportWorkspaceIdRef.current === null) return;
		const result = await closeWorkspace();
		clearPendingWorkspaceExport();
		managerExportWorkspaceIdRef.current = null;
		if (!result.isSuccess) {
			showOperationError('结束资源包导出', result.error);
		}
	}, [clearPendingWorkspaceExport, closeWorkspace, showOperationError]);
	const handleNavigate = useCallback(
		(href: string) => {
			setIsMenuOpen(false);
			router.push(href);
			requestAnimationFrame(() =>
				document.getElementById(MOBILE_MENU_TOGGLE_ID)?.focus()
			);
		},
		[router]
	);

	const runImport = useCallback(
		async (file: File) => {
			const result = await importWorkspace(file);
			if (!result.isSuccess) {
				if (result.isLeaseConflict) return;
				showOperationError('导入资源包', result.error);
				return;
			}
			if (result.resolution === 'cancel') return;
			if (result.workspaceId) {
				router.push(result.resolution === 'open' ? '/info' : '/');
			}
		},
		[importWorkspace, router, showOperationError]
	);

	const handleCreateBlank = useCallback(async () => {
		if (isFileOperationPending) return;
		const result = await createWorkspace();
		if (!result.isSuccess) {
			showOperationError('新建资源包', result.error);
			return;
		}
		if (result.workspaceId) router.push('/info');
	}, [createWorkspace, isFileOperationPending, router, showOperationError]);

	const handleRetryStorage = useCallback(async () => {
		const result = await retryPersistentStorage();
		if (!result.isSuccess) {
			showOperationError('重试本地存储', result.error);
		}
	}, [retryPersistentStorage, showOperationError]);

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			if (isFileOperationPending) return;
			const file = event.target.files?.[0];
			event.target.value = '';
			if (!file) return;
			void runImport(file);
		},
		[isFileOperationPending, runImport]
	);

	const handleExport = useCallback(async () => {
		if (isFileOperationPending) return;
		let isWaitingForValidation = false;
		try {
			const expectedRevision = revision;
			const issues = await validateResourcePackForExport(
				resourcePack,
				Object.keys(assetUrls),
				assetUrls
			);
			if (issues.length > 0) {
				isWaitingForValidation = true;
				setValidationResult({ issues, revision: expectedRevision });
				return;
			}
			const result = await exportArchive(expectedRevision);
			if (!result.isSuccess) {
				showOperationError('导出资源包', result.error);
			} else if (result.warning) {
				setNotice({
					description: result.warning,
					title: '资源包已导出',
				});
			}
		} catch (error) {
			showOperationError(
				'导出资源包',
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			if (!isWaitingForValidation) {
				await finishManagerWorkspaceExport();
			}
		}
	}, [
		assetUrls,
		exportArchive,
		finishManagerWorkspaceExport,
		isFileOperationPending,
		resourcePack,
		revision,
		showOperationError,
	]);

	const handleExportCancel = useCallback(() => {
		setValidationResult(null);
		void finishManagerWorkspaceExport();
		requestAnimationFrame(() => activeExportTriggerRef.current?.focus());
	}, [finishManagerWorkspaceExport]);

	const handleExportConfirm = useCallback(async () => {
		if (!validationResult) return;
		setValidationResult(null);
		try {
			const result = await exportArchive(validationResult.revision);
			if (!result.isSuccess) {
				showOperationError('导出资源包', result.error);
			} else if (result.warning) {
				setNotice({
					description: result.warning,
					title: '资源包已导出',
				});
			}
		} catch (error) {
			showOperationError(
				'导出资源包',
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			await finishManagerWorkspaceExport();
		}
	}, [
		exportArchive,
		finishManagerWorkspaceExport,
		showOperationError,
		validationResult,
	]);

	useEffect(() => {
		if (
			!pendingExportWorkspaceId ||
			pendingExportWorkspaceId !== activeWorkspaceId ||
			!hasActiveWorkspace ||
			isFileOperationPending ||
			managerExportWorkspaceIdRef.current === pendingExportWorkspaceId
		) {
			return;
		}
		managerExportWorkspaceIdRef.current = pendingExportWorkspaceId;
		void handleExport();
	}, [
		activeWorkspaceId,
		handleExport,
		hasActiveWorkspace,
		isFileOperationPending,
		pendingExportWorkspaceId,
	]);

	const openGitHub = useCallback(() => {
		window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
	}, []);
	const visibleMobileNavGroups = hasEditorNavigation ? MOBILE_NAV_GROUPS : [];
	const hasActiveMobileRoute = MOBILE_NAV_ITEMS.some(
		(item) => item.href === pathname
	);
	const isTemporaryStorage =
		storageMode === 'memory' || localSaveStatus === 'memory-only';
	const localSaveLabel = isTemporaryStorage
		? '仅临时保存'
		: localSaveStatus === 'saving'
			? '正在保存到本机'
			: localSaveStatus === 'error' || storageError !== null
				? '本地保存失败'
				: '已保存到本机';
	const exportStatusLabel =
		exportStatus === 'modified'
			? '有未导出的更改'
			: exportStatus === 'unexported'
				? '当前内容尚未导出'
				: '当前版本已导出';
	const localSaveTone: TStatusBadgeTone = isTemporaryStorage
		? 'warning'
		: localSaveStatus === 'saving'
			? 'warning'
			: localSaveStatus === 'error' || storageError !== null
				? 'error'
				: 'success';
	const resourcePackVersion = resourcePack.packInfo.version || '未设置';
	const resourcePackVersionLabel = resourcePack.packInfo.version
		? `v${resourcePack.packInfo.version}`
		: '版本未设置';
	const compactLocalSaveLabel = isTemporaryStorage
		? '临时保存'
		: localSaveStatus === 'saving'
			? '保存中'
			: localSaveStatus === 'error' || storageError !== null
				? '保存失败'
				: '已保存';
	const compactExportStatusLabel =
		exportStatus === 'modified'
			? '有修改'
			: exportStatus === 'unexported'
				? '尚未导出'
				: '已导出';
	const storageWarning = storageError ?? localSaveError;
	const mobileWorkspaceSummaryCard = hasEditorNavigation ? (
		<>
			<Button
				fullWidth
				variant="light"
				className={cn(
					MOBILE_CARD_CONTENT_CLASS_NAME,
					MOBILE_CARD_BASE_CLASS_NAME,
					MOBILE_CARD_INACTIVE_CLASS_NAME,
					'py-3'
				)}
				onPress={() => handleNavigate('/')}
			>
				<span className="flex w-full min-w-0 flex-col gap-2">
					<span className="flex min-w-0 items-baseline justify-between gap-3">
						<span
							title={activeWorkspace.workspace.displayName}
							className={cn(
								TYPOGRAPHY_STYLES.emphasizedText,
								'min-w-0 truncate'
							)}
						>
							{activeWorkspace.workspace.displayName}
						</span>
						<span
							className={cn(
								TYPOGRAPHY_STYLES.metadata,
								'shrink-0'
							)}
						>
							{resourcePackVersionLabel}
						</span>
					</span>
					<WorkspaceStatusBadges
						badgeClassName="whitespace-nowrap"
						exportLabel={compactExportStatusLabel}
						isExported={exportStatus === 'exported'}
						localSaveLabel={compactLocalSaveLabel}
						localSaveTone={localSaveTone}
					/>
				</span>
			</Button>
			{localSaveError && (
				<p
					className={cn(
						TYPOGRAPHY_STYLES.compactBody,
						'px-1 text-warning-700 dark:text-warning'
					)}
				>
					{localSaveError}
				</p>
			)}
		</>
	) : null;

	return (
		<>
			<HeroUINavbar
				isBordered
				isBlurred
				position="sticky"
				disableAnimation={isReducedMotion}
				isMenuOpen={isMenuOpen}
				onMenuOpenChange={setIsMenuOpen}
				shouldBlockScroll={false}
				classNames={{
					base: 'z-50',
					wrapper:
						'max-w-7xl 3xl:max-w-screen-2xl 4xl:max-w-screen-3xl',
				}}
			>
				<NavbarContent
					justify="start"
					className="min-w-0 flex-1 gap-5 xl:basis-1/5"
				>
					<NavbarBrand className="max-w-none shrink-0 grow-0 basis-auto">
						<PressElement
							className="inline-flex shrink-0 transform-gpu select-none rounded-small transition hover:brightness-95 data-[pressed=true]:scale-[0.98] data-[pressed=true]:brightness-90 motion-reduce:transition-none motion-reduce:data-[pressed=true]:scale-100"
							onPress={() => setIsMenuOpen(false)}
						>
							<Link
								href="/"
								aria-label={
									pathname === '/'
										? 'ResourceEx Editor首页'
										: '返回资源包管理页'
								}
								className="flex items-center gap-1"
							>
								<span
									aria-hidden
									className="image-rendering-pixelated h-9 w-9 shrink-0 rounded-full bg-logo bg-cover bg-no-repeat sm:h-10 sm:w-10"
								/>
								<span className="flex shrink-0 flex-col justify-center space-y-0.5 self-stretch whitespace-nowrap">
									<span className="text-[13px] font-bold leading-none sm:text-base sm:leading-none xl:text-lg xl:leading-none">
										ResourceEx Editor
									</span>
									{pathname !== '/' && (
										<span className="font-mono text-[9px] font-normal leading-none text-foreground-500 sm:text-[10px]">
											点此前往资源包管理
										</span>
									)}
								</span>
							</Link>
						</PressElement>
					</NavbarBrand>
					{hasEditorNavigation && (
						<nav className="hidden shrink-0 items-center gap-1 xl:flex">
							<NavbarItem>
								<Button
									as={Link}
									href="/info"
									variant={
										pathname === '/info' ? 'flat' : 'light'
									}
									color={
										pathname === '/info'
											? 'primary'
											: 'default'
									}
								>
									基础信息
								</Button>
							</NavbarItem>
							{NAV_GROUPS.map((group) => (
								<NavDropdown key={group.label} {...group} />
							))}
							<NavbarItem>
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
								>
									资产
								</Button>
							</NavbarItem>
						</nav>
					)}
				</NavbarContent>

				<NavbarContent justify="end" className="hidden gap-1 xl:flex">
					{pathname !== '/' && !isComparisonRoute && (
						<>
							{hasActiveWorkspace &&
								(isTemporaryStorage ||
									storageError !== null) && (
									<Button
										color="warning"
										variant="flat"
										isDisabled={isFileOperationPending}
										onPress={() =>
											void handleRetryStorage()
										}
									>
										重试本地存储
									</Button>
								)}
							<Button
								variant="light"
								isDisabled={isFileOperationPending}
								onPress={() => void handleCreateBlank()}
							>
								新建资源包
							</Button>
							<Button
								variant="light"
								isDisabled={isFileOperationPending}
								onPress={() => fileInputRef.current?.click()}
							>
								导入资源包
							</Button>
							<Button
								ref={desktopExportTriggerRef}
								variant="light"
								isDisabled={
									isFileOperationPending ||
									!hasActiveWorkspace
								}
								onPress={() => {
									activeExportTriggerRef.current =
										desktopExportTriggerRef.current;
									void handleExport();
								}}
							>
								导出资源包
							</Button>
						</>
					)}
					<NavbarItem className="ml-2">
						<Dropdown>
							<DropdownTrigger showArrow>
								<Button variant="light">更多</Button>
							</DropdownTrigger>
							<DropdownMenu
								aria-label="应用操作"
								selectionMode="none"
								onAction={(key) => {
									if (String(key) === 'announcement') {
										openAnnouncementModal();
									} else if (String(key) === 'github') {
										openGitHub();
									}
								}}
							>
								<DropdownItem key="announcement">
									公告
								</DropdownItem>
								<DropdownItem key="github">GitHub</DropdownItem>
							</DropdownMenu>
						</Dropdown>
					</NavbarItem>
				</NavbarContent>

				<NavbarContent
					justify="end"
					className="basis-auto pl-2 xl:hidden"
				>
					<div
						className={cn(
							'flex h-10 items-center gap-0.5 rounded-small border border-default-200/60 bg-default-100/45 p-0.5 text-foreground-600 transition-background motion-reduce:transition-none dark:bg-default-100/20',
							'bg-default/35 backdrop-blur'
						)}
					>
						<NavbarMenuToggle
							id={MOBILE_MENU_TOGGLE_ID}
							srOnlyText={isMenuOpen ? '收起菜单' : '打开菜单'}
							aria-label={isMenuOpen ? '收起菜单' : '打开菜单'}
							className={cn(
								'h-9 w-9 rounded-small transition-background motion-reduce:transition-none',
								isMenuOpen
									? 'bg-default/50'
									: 'data-[hover=true]:bg-default/40',
								'data-[hover=true]:bg-default/45'
							)}
						/>
					</div>
				</NavbarContent>

				<NavbarMenu
					id={MOBILE_MENU_ID}
					className="mobile-navbar-menu-scroll max-h-[calc(var(--safe-h-dvh)_-_var(--navbar-height))] gap-3.5 overflow-y-auto overflow-x-hidden px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-8"
				>
					{mobileWorkspaceSummaryCard && (
						<NavbarMenuItem className="w-full">
							{mobileWorkspaceSummaryCard}
						</NavbarMenuItem>
					)}
					{visibleMobileNavGroups.map((group, groupIndex) => (
						<NavbarMenuItem key={group.label} className="w-full">
							<section className="space-y-2">
								<Heading
									as="h2"
									variant="navigation"
									className="px-1"
								>
									{group.label}
								</Heading>
								<div className="grid grid-cols-2 gap-2">
									{group.items.map((item, itemIndex) => {
										const isCurrent =
											pathname === item.href;
										const isFallbackFirst =
											!hasActiveMobileRoute &&
											groupIndex === 0 &&
											itemIndex === 0;

										return (
											<Button
												key={item.href}
												{...(isCurrent ||
												isFallbackFirst
													? {
															ref: mobileMenuFirstItemRef,
														}
													: {})}
												fullWidth
												aria-current={
													isCurrent
														? 'page'
														: undefined
												}
												variant="light"
												className={cn(
													MOBILE_CARD_CONTENT_CLASS_NAME,
													MOBILE_CARD_BASE_CLASS_NAME,
													isCurrent
														? MOBILE_CARD_ACTIVE_CLASS_NAME
														: MOBILE_CARD_INACTIVE_CLASS_NAME
												)}
												onPress={() =>
													handleNavigate(item.href)
												}
											>
												<span
													className={cn(
														TYPOGRAPHY_STYLES.interactiveLabel,
														'min-w-0 truncate'
													)}
												>
													{item.label}
												</span>
											</Button>
										);
									})}
								</div>
							</section>
						</NavbarMenuItem>
					))}
					{pathname !== '/' && !isComparisonRoute && (
						<NavbarMenuItem className="w-full">
							<section className="space-y-2">
								<Heading
									as="h2"
									variant="navigation"
									className="px-1"
								>
									资源包操作
								</Heading>
								<div className="grid grid-cols-2 gap-2">
									<Button
										{...(!hasActiveWorkspace
											? { ref: mobileMenuFirstItemRef }
											: {})}
										fullWidth
										variant="light"
										className={cn(
											MOBILE_CARD_CONTENT_CLASS_NAME,
											MOBILE_CARD_BASE_CLASS_NAME,
											MOBILE_CARD_INACTIVE_CLASS_NAME
										)}
										isDisabled={isFileOperationPending}
										onPress={() => {
											setIsMenuOpen(false);
											void handleCreateBlank();
										}}
									>
										<span
											className={cn(
												TYPOGRAPHY_STYLES.interactiveLabel,
												'min-w-0 truncate'
											)}
										>
											新建资源包
										</span>
									</Button>
									{(isTemporaryStorage ||
										storageError !== null) && (
										<Button
											fullWidth
											color="warning"
											variant="flat"
											className={cn(
												MOBILE_CARD_CONTENT_CLASS_NAME,
												MOBILE_CARD_BASE_CLASS_NAME
											)}
											isDisabled={isFileOperationPending}
											onPress={() =>
												void handleRetryStorage()
											}
										>
											<span
												className={cn(
													TYPOGRAPHY_STYLES.interactiveLabel,
													'min-w-0 truncate'
												)}
											>
												重试本地存储
											</span>
										</Button>
									)}
									<Button
										fullWidth
										variant="light"
										className={cn(
											MOBILE_CARD_CONTENT_CLASS_NAME,
											MOBILE_CARD_BASE_CLASS_NAME,
											MOBILE_CARD_INACTIVE_CLASS_NAME
										)}
										isDisabled={isFileOperationPending}
										onPress={() => {
											setIsMenuOpen(false);
											fileInputRef.current?.click();
										}}
									>
										<span
											className={cn(
												TYPOGRAPHY_STYLES.interactiveLabel,
												'min-w-0 truncate'
											)}
										>
											导入资源包
										</span>
									</Button>
									<Button
										fullWidth
										variant="light"
										className={cn(
											MOBILE_CARD_CONTENT_CLASS_NAME,
											MOBILE_CARD_BASE_CLASS_NAME,
											MOBILE_CARD_INACTIVE_CLASS_NAME
										)}
										isDisabled={
											isFileOperationPending ||
											!hasActiveWorkspace
										}
										onPress={() => {
											activeExportTriggerRef.current =
												document.getElementById(
													MOBILE_MENU_TOGGLE_ID
												) as HTMLButtonElement | null;
											setIsMenuOpen(false);
											void handleExport();
										}}
									>
										<span
											className={cn(
												TYPOGRAPHY_STYLES.interactiveLabel,
												'min-w-0 truncate'
											)}
										>
											导出资源包
										</span>
									</Button>
								</div>
							</section>
						</NavbarMenuItem>
					)}
					{isComparisonRoute && (
						<NavbarMenuItem className="w-full">
							<section className="space-y-2">
								<Heading
									as="h2"
									variant="navigation"
									className="px-1"
								>
									版本对比
								</Heading>
								<Button
									ref={mobileMenuFirstItemRef}
									fullWidth
									variant="light"
									className={cn(
										MOBILE_CARD_CONTENT_CLASS_NAME,
										MOBILE_CARD_BASE_CLASS_NAME,
										MOBILE_CARD_INACTIVE_CLASS_NAME
									)}
									onPress={() => handleNavigate('/')}
								>
									<span
										className={cn(
											TYPOGRAPHY_STYLES.interactiveLabel,
											'min-w-0 truncate'
										)}
									>
										返回资源包管理
									</span>
								</Button>
							</section>
						</NavbarMenuItem>
					)}
					<NavbarMenuItem className="w-full">
						<section className="space-y-2">
							<Heading
								as="h2"
								variant="navigation"
								className="px-1"
							>
								更多
							</Heading>
							<div className="grid grid-cols-2 gap-2">
								<Button
									{...(!hasActiveWorkspace && pathname === '/'
										? { ref: mobileMenuFirstItemRef }
										: {})}
									fullWidth
									variant="light"
									className={cn(
										MOBILE_CARD_CONTENT_CLASS_NAME,
										MOBILE_CARD_BASE_CLASS_NAME,
										MOBILE_CARD_INACTIVE_CLASS_NAME
									)}
									onPress={() => {
										setIsMenuOpen(false);
										openAnnouncementModal();
									}}
								>
									<span
										className={cn(
											TYPOGRAPHY_STYLES.interactiveLabel,
											'min-w-0 truncate'
										)}
									>
										公告
									</span>
								</Button>
								<Button
									fullWidth
									variant="light"
									className={cn(
										MOBILE_CARD_CONTENT_CLASS_NAME,
										MOBILE_CARD_BASE_CLASS_NAME,
										MOBILE_CARD_INACTIVE_CLASS_NAME
									)}
									onPress={() => {
										setIsMenuOpen(false);
										openGitHub();
									}}
								>
									<span
										className={cn(
											TYPOGRAPHY_STYLES.interactiveLabel,
											'min-w-0 truncate'
										)}
									>
										本项目代码仓库
									</span>
								</Button>
							</div>
						</section>
					</NavbarMenuItem>
				</NavbarMenu>
			</HeroUINavbar>
			{pathname !== '/' && hasEditorNavigation && (
				<div className="hidden border-b border-divider bg-content1/40 shadow-sm backdrop-blur xl:block">
					<div className="mx-auto flex min-h-10 w-full max-w-7xl items-center gap-3 px-6 3xl:max-w-screen-2xl 4xl:max-w-screen-3xl">
						<Link
							href="/"
							aria-label="返回资源包管理页"
							className={cn(
								TYPOGRAPHY_STYLES.caption,
								'flex min-w-0 items-baseline gap-2 rounded-small transition-colors hover:text-foreground-700'
							)}
						>
							<span className="shrink-0">当前资源包</span>
							<span
								title={activeWorkspace.workspace.displayName}
								className={cn(
									TYPOGRAPHY_STYLES.emphasizedText,
									'truncate'
								)}
							>
								{activeWorkspace.workspace.displayName}
							</span>
						</Link>
						<span className="h-4 w-px shrink-0 bg-divider" />
						<span
							className={cn(
								TYPOGRAPHY_STYLES.metadata,
								'shrink-0'
							)}
						>
							版本：{resourcePackVersion}
						</span>
						<WorkspaceStatusBadges
							className="ml-auto shrink-0"
							exportLabel={exportStatusLabel}
							isExported={exportStatus === 'exported'}
							localSaveLabel={localSaveLabel}
							localSaveTone={localSaveTone}
						/>
					</div>
				</div>
			)}
			{pathname !== '/' &&
				hasEditorNavigation &&
				(isTemporaryStorage || storageError !== null) &&
				storageWarning && (
					<div
						role="alert"
						className={cn(
							TYPOGRAPHY_STYLES.body,
							'flex flex-col gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-warning-800 sm:flex-row sm:items-center sm:justify-between dark:text-warning'
						)}
					>
						<span>
							{isTemporaryStorage
								? `本地存储不可用：${storageWarning}。当前内容仅临时保留，刷新页面会丢失。`
								: `本地存储操作失败：${storageWarning}。警告会保留到重试成功。`}
						</span>
						<Button
							color="warning"
							variant="flat"
							isDisabled={isFileOperationPending}
							onPress={() => void handleRetryStorage()}
						>
							重试本地存储
						</Button>
					</div>
				)}

			<input
				ref={fileInputRef}
				type="file"
				accept=".zip"
				className="hidden"
				onChange={handleFileChange}
			/>

			{validationResult && (
				<ExportValidationDialog
					issues={validationResult.issues}
					onCancel={handleExportCancel}
					onConfirm={handleExportConfirm}
				/>
			)}
			<ConfirmDialog
				coordinationId="navbar.notice"
				isOpen={notice !== null}
				title={notice?.title ?? ''}
				description={notice?.description}
				confirmLabel="知道了"
				onConfirm={() => setNotice(null)}
			/>
			<WorkspaceDuplicateDialog />
			<WorkspaceLeaseConflictDialog />
			<WorkspaceLeaseLossDialog />
		</>
	);
});
