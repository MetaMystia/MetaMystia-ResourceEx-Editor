'use client';

import { cn } from '@heroui/theme';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import { CoordinatedModal } from '@/features/overlays/client';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

export function WorkspaceLeaseLossDialog() {
	const pathname = usePathname();
	const router = useRouter();
	const {
		consumeLeaseLossResolution,
		discardLeaseLossChanges,
		dismissResolvedLeaseLoss,
		leaseLoss,
		saveLeaseLossAsCopy,
	} = useResourceWorkspaces();
	const [error, setError] = useState<string | null>(null);
	const [pendingAction, setPendingAction] = useState<
		'discard' | 'save-copy' | null
	>(null);

	useEffect(() => {
		setError(null);
		setPendingAction(null);
	}, [leaseLoss?.workspace.id]);

	useEffect(() => {
		if (!leaseLoss?.isResolved) return;
		if (pathname === '/compare') {
			dismissResolvedLeaseLoss();
			return;
		}
		if (pathname === '/') {
			consumeLeaseLossResolution();
			dismissResolvedLeaseLoss();
			return;
		}
		router.replace('/');
	}, [
		consumeLeaseLossResolution,
		dismissResolvedLeaseLoss,
		leaseLoss?.isResolved,
		pathname,
		router,
	]);

	if (!leaseLoss) return null;
	const isComparisonRoute = pathname === '/compare';

	const runAction = async (action: 'discard' | 'save-copy') => {
		setPendingAction(action);
		setError(null);
		const result =
			action === 'save-copy'
				? await saveLeaseLossAsCopy()
				: await discardLeaseLossChanges();
		if (!result.isSuccess) {
			setPendingAction(null);
			setError(result.error ?? '无法处理当前修改');
		}
	};

	return (
		<CoordinatedModal
			coordination={{ id: 'workspace.lease-loss' }}
			hideCloseButton
			isDismissable={false}
			isKeyboardDismissDisabled
			isOpen
			size="md"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Heading as="h2" variant="dialog">
						编辑权已被其他页面接管
					</Heading>
					{leaseLoss.isResolved ? (
						<p className={TYPOGRAPHY_STYLES.description}>
							{isComparisonRoute
								? '正在恢复对比页…'
								: '正在返回资源包管理…'}
						</p>
					) : leaseLoss.hasChanges ? (
						<div
							className={cn(
								TYPOGRAPHY_STYLES.description,
								'space-y-2'
							)}
						>
							{leaseLoss.hasUnsavedChanges ? (
								<p>
									当前页面还有未保存到“
									{leaseLoss.workspace.displayName}
									”的额外修改。不保存副本将丢失这部分修改。
								</p>
							) : (
								<p>
									当前编辑内容已经自动保存到“
									{leaseLoss.workspace.displayName}
									”，新接管页面会继续使用这些内容。
								</p>
							)}
							<p>
								如需另外保留当前版本，可以选择“保存为副本”以创建新工作区“
								{leaseLoss.copyDisplayName}
								”，创建后
								{isComparisonRoute
									? '可继续在对比页选择该副本。'
									: '将自动返回资源包管理。'}
							</p>
						</div>
					) : (
						<p className={TYPOGRAPHY_STYLES.description}>
							{isComparisonRoute
								? '当前页面没有需要另行保留的修改。继续后可查看其他页面保存的最新内容。'
								: '当前页面没有需要另行保留的修改，返回资源包管理后可查看最新状态。'}
						</p>
					)}
					{error && (
						<p
							className={cn(
								TYPOGRAPHY_STYLES.body,
								'text-danger'
							)}
						>
							{error}
						</p>
					)}
				</div>
				{!leaseLoss.isResolved && (
					<div className="flex flex-wrap justify-end gap-2 border-t border-divider pt-4">
						{leaseLoss.hasChanges && (
							<Button
								color={
									leaseLoss.hasUnsavedChanges
										? 'danger'
										: 'default'
								}
								variant="flat"
								isDisabled={pendingAction === 'save-copy'}
								isLoading={pendingAction === 'discard'}
								onPress={() => void runAction('discard')}
							>
								{leaseLoss.hasUnsavedChanges
									? '放弃未保存的修改'
									: '不创建副本'}
							</Button>
						)}
						<Button
							color={leaseLoss.hasChanges ? 'primary' : 'default'}
							variant={leaseLoss.hasChanges ? 'solid' : 'flat'}
							isDisabled={pendingAction === 'discard'}
							isLoading={
								pendingAction ===
								(leaseLoss.hasChanges ? 'save-copy' : 'discard')
							}
							onPress={() =>
								void runAction(
									leaseLoss.hasChanges
										? 'save-copy'
										: 'discard'
								)
							}
						>
							{leaseLoss.hasChanges
								? '保存为副本'
								: isComparisonRoute
									? '继续观察'
									: '返回资源包管理'}
						</Button>
					</div>
				)}
			</div>
		</CoordinatedModal>
	);
}
