'use client';

import { cn } from '@heroui/theme';
import { useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Card from '@/design/ui/components/card';
import Heading from '@/design/ui/components/heading';

import {
	clearEditorNavigationIntent,
	readEditorNavigationIntent,
	type IEditorNavigationIntent,
} from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';
import { WorkspaceRecoveryDialog } from '@/features/resourceEditor/client/workspaces/components/WorkspaceRecoveryDialog';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

interface IRestoreFallback {
	error?: string;
}

export function ResourceEditorRouteGuard({ children }: PropsWithChildren) {
	const router = useRouter();
	const { activeWorkspaceId } = useResourceEditor();
	const {
		activeWorkspace,
		closeWorkspace,
		leaseConflict,
		leaseLoss,
		lifecycleStatus,
		openLastWorkspace,
		openWorkspace,
		pendingExportWorkspaceId,
		recoveryWorkspace,
		workspaces,
	} = useResourceWorkspaces();
	const attemptedRestoreRef = useRef(false);
	const navigationIntentRef = useRef<
		IEditorNavigationIntent | null | undefined
	>(undefined);
	const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(
		null
	);
	const [restoreFallback, setRestoreFallback] =
		useState<IRestoreFallback | null>(null);

	useEffect(() => {
		if (navigationIntentRef.current === undefined) {
			navigationIntentRef.current = readEditorNavigationIntent();
		}
		const navigationIntent = navigationIntentRef.current;
		const navigationWorkspaceId = navigationIntent?.workspaceId;
		if (leaseConflict || leaseLoss || recoveryWorkspace) return;
		if (!navigationWorkspaceId && activeWorkspace) {
			attemptedRestoreRef.current = true;
			return;
		}
		if (
			navigationWorkspaceId &&
			activeWorkspace?.workspace.id === navigationWorkspaceId &&
			activeWorkspaceId === navigationWorkspaceId
		) {
			attemptedRestoreRef.current = true;
			return;
		}
		if (attemptedRestoreRef.current) return;
		if (lifecycleStatus !== 'manager' && lifecycleStatus !== 'editing') {
			return;
		}
		attemptedRestoreRef.current = true;
		const openInitialWorkspace = async () => {
			const workspaceId = navigationIntent?.workspaceId;
			if (workspaceId) {
				setOpeningWorkspaceId(workspaceId);
				if (
					activeWorkspace &&
					activeWorkspace.workspace.id !== workspaceId
				) {
					const closeResult = await closeWorkspace();
					if (!closeResult.isSuccess) {
						setOpeningWorkspaceId(null);
						setRestoreFallback({
							error: closeResult.error ?? '无法结束当前资源包',
						});
						return;
					}
				}
				const result = await openWorkspace(workspaceId, {
					recoveryMode: navigationIntent?.continueCurrent
						? 'continue-current'
						: 'prompt',
				});
				setOpeningWorkspaceId(null);
				if (!result.isSuccess) {
					setRestoreFallback({
						error: result.isLeaseConflict
							? '目标资源包正由其他页面编辑'
							: (result.error ?? '无法打开目标资源包'),
					});
					if (!result.isLeaseConflict) {
						navigationIntentRef.current = null;
						clearEditorNavigationIntent();
					}
				}
				return;
			}
			const result = await openLastWorkspace();
			if (!result.isSuccess && !result.isLeaseConflict) {
				setRestoreFallback({});
			}
		};
		void openInitialWorkspace();
	}, [
		activeWorkspaceId,
		activeWorkspace,
		closeWorkspace,
		leaseConflict,
		leaseLoss,
		lifecycleStatus,
		openLastWorkspace,
		openWorkspace,
		recoveryWorkspace,
	]);

	const handleOpenWorkspace = async (workspaceId: string) => {
		navigationIntentRef.current = null;
		clearEditorNavigationIntent();
		setOpeningWorkspaceId(workspaceId);
		setRestoreFallback(null);
		const result = await openWorkspace(workspaceId);
		setOpeningWorkspaceId(null);
		if (!result.isSuccess && !result.isLeaseConflict) {
			setRestoreFallback({ error: result.error ?? '无法打开资源包' });
		}
	};

	const returnToManager = async () => {
		attemptedRestoreRef.current = true;
		const result = await closeWorkspace();
		if (result.isSuccess) router.replace('/');
		return result;
	};

	if (recoveryWorkspace) {
		return (
			<WorkspaceRecoveryDialog
				onContinue={() => undefined}
				onReturn={returnToManager}
			/>
		);
	}

	if (lifecycleStatus === 'manager' && restoreFallback) {
		return (
			<div className="mx-auto flex min-h-[50dvh] w-full max-w-3xl items-center justify-center px-4 py-12 sm:px-6">
				<Card
					shadow="none"
					className="w-full rounded-large border border-divider bg-content1/55 p-5 backdrop-blur sm:p-6"
				>
					{workspaces.length > 0 ? (
						<>
							<Heading variant="panel">
								选择要编辑的资源包
							</Heading>
							<p
								className={cn(
									TYPOGRAPHY_STYLES.subtleDescription,
									'mt-2'
								)}
							>
								这个标签页尚未选择工作区。选择后会留在当前页面继续打开。
							</p>
							{restoreFallback.error && (
								<p
									className={cn(
										TYPOGRAPHY_STYLES.body,
										'mt-3 text-danger'
									)}
								>
									{restoreFallback.error}
								</p>
							)}
							<div className="mt-5 grid gap-3 sm:grid-cols-2">
								{workspaces.map((workspace) => (
									<Button
										key={workspace.id}
										fullWidth
										variant="bordered"
										className="h-auto min-h-16 justify-start px-4 py-3 text-left"
										isDisabled={openingWorkspaceId !== null}
										isLoading={
											openingWorkspaceId === workspace.id
										}
										onPress={() =>
											void handleOpenWorkspace(
												workspace.id
											)
										}
									>
										<span className="flex min-w-0 flex-col items-start gap-0.5">
											<span
												title={workspace.displayName}
												className={cn(
													TYPOGRAPHY_STYLES.itemTitle,
													'max-w-full truncate'
												)}
											>
												{workspace.displayName}
											</span>
											<span
												title={`${workspace.resourcePackName || '资源包名称未设置'}${workspace.version ? ` · 版本${workspace.version}` : ''}`}
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'max-w-full truncate'
												)}
											>
												{workspace.resourcePackName ||
													'资源包名称未设置'}
												{workspace.version
													? `·${workspace.version}`
													: ''}
											</span>
										</span>
									</Button>
								))}
							</div>
						</>
					) : (
						<>
							<Heading variant="panel">
								当前浏览器中还没有资源包
							</Heading>
							<p
								className={cn(
									TYPOGRAPHY_STYLES.subtleDescription,
									'mt-2'
								)}
							>
								请先前往资源包管理页面新建或导入资源包。
							</p>
						</>
					)}
					<div className="mt-5 flex justify-end border-t border-divider pt-4">
						<Button variant="flat" onPress={() => router.push('/')}>
							前往资源包管理
						</Button>
					</div>
				</Card>
			</div>
		);
	}

	if (
		lifecycleStatus !== 'editing' ||
		!activeWorkspace ||
		pendingExportWorkspaceId !== null ||
		activeWorkspaceId !== activeWorkspace.workspace.id
	) {
		return (
			<div
				className={cn(
					TYPOGRAPHY_STYLES.subtleDescription,
					'mx-auto flex min-h-[50dvh] max-w-7xl items-center justify-center px-4 py-12'
				)}
			>
				正在读取本地资源包…
			</div>
		);
	}

	return children;
}
