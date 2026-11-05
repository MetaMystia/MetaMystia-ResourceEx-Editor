'use client';

import { cn } from '@heroui/theme';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Card from '@/design/ui/components/card';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';

import { CoordinatedModal } from '@/features/overlays/client';
import { WorkspaceComparePicker } from '@/features/resourceComparison/client/components/WorkspaceComparePicker';
import { ConfirmDialog } from '@/features/resourceEditor/client/components/confirm/ConfirmDialog';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import type {
	IWorkspaceSummary,
	TWorkspaceImportResolution,
} from '@/features/resourceEditor/client/workspaces/contracts';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
	dateStyle: 'medium',
	timeStyle: 'short',
	timeZone: 'Asia/Shanghai',
});
const CATALOG_STATUS_CARD_CLASS_NAME =
	'mt-8 min-h-40 items-center justify-center rounded-large border border-dashed border-divider bg-content1/35 px-5 py-10 text-center';

interface INotice {
	description: string;
	title: string;
}

export function WorkspaceManagerScreen() {
	const router = useRouter();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const {
		activeWorkspace,
		closeWorkspace,
		createWorkspace,
		duplicateWorkspace,
		importWorkspace,
		isRetryingStorage,
		lifecycleStatus,
		openWorkspace,
		pendingExportWorkspaceId,
		recoveryWorkspace,
		removeWorkspace,
		renameWorkspace,
		requestWorkspaceExport,
		retryPersistentStorage,
		saveStatus,
		storageError,
		storageMode,
		workspaces,
	} = useResourceWorkspaces();
	const currentWorkspaceId =
		activeWorkspace?.workspace.id ?? recoveryWorkspace?.id ?? null;
	const initialClosingWorkspaceId =
		activeWorkspace && pendingExportWorkspaceId === null
			? activeWorkspace.workspace.id
			: null;
	const workspaceIdToCloseOnEntryRef = useRef(initialClosingWorkspaceId);
	const [deleteTarget, setDeleteTarget] = useState<IWorkspaceSummary | null>(
		null
	);
	const [isPending, setIsPending] = useState(
		initialClosingWorkspaceId !== null
	);
	const [isForceDelete, setIsForceDelete] = useState(false);
	const [notice, setNotice] = useState<INotice | null>(null);
	const [renameTarget, setRenameTarget] = useState<IWorkspaceSummary | null>(
		null
	);
	const [renameValue, setRenameValue] = useState('');
	const isHydrating = lifecycleStatus === 'hydrating';
	const isWorkspaceOperationPending =
		isPending ||
		isRetryingStorage ||
		pendingExportWorkspaceId !== null ||
		(lifecycleStatus !== 'editing' && lifecycleStatus !== 'manager');

	useEffect(() => {
		const activeWorkspaceId = workspaceIdToCloseOnEntryRef.current;
		if (activeWorkspaceId === null) return;
		workspaceIdToCloseOnEntryRef.current = null;
		if (pendingExportWorkspaceId !== null) {
			setIsPending(false);
			return;
		}

		void closeWorkspace()
			.then((result) => {
				if (result.isSuccess) return;
				setNotice({
					description: result.error ?? '未知错误',
					title: '结束编辑失败',
				});
			})
			.catch((error) => {
				setNotice({
					description:
						error instanceof Error ? error.message : String(error),
					title: '结束编辑失败',
				});
			})
			.finally(() => {
				setIsPending(false);
			});
	}, [closeWorkspace, pendingExportWorkspaceId]);

	const openEditor = () => {
		router.push('/info');
	};

	const runWorkspaceOperation = async (
		operation: () => Promise<{
			error?: string;
			isLeaseConflict?: boolean;
			isSuccess: boolean;
			resolution?: TWorkspaceImportResolution;
			workspaceId?: string;
		}>,
		action: string,
		isEditorOpenExpected = false
	) => {
		if (isWorkspaceOperationPending) return;
		setIsPending(true);
		try {
			const result = await operation();
			if (!result.isSuccess) {
				if (result.isLeaseConflict) return;
				setNotice({
					description: result.error ?? '未知错误',
					title: `${action}失败`,
				});
				return;
			}
			if (
				result.workspaceId &&
				(isEditorOpenExpected || result.resolution === 'open')
			) {
				openEditor();
			}
		} catch (error) {
			setNotice({
				description:
					error instanceof Error ? error.message : String(error),
				title: `${action}失败`,
			});
		} finally {
			setIsPending(false);
		}
	};

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (isWorkspaceOperationPending) return;
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		void runWorkspaceOperation(() => importWorkspace(file), '导入资源包');
	};

	const handleRename = async () => {
		if (!renameTarget || isWorkspaceOperationPending) return;
		setIsPending(true);
		const result = await renameWorkspace(renameTarget.id, renameValue);
		setIsPending(false);
		if (!result.isSuccess) {
			setNotice({
				description: result.error ?? '未知错误',
				title: '重命名失败',
			});
			return;
		}
		setRenameTarget(null);
	};

	const handleDelete = async () => {
		if (!deleteTarget || isWorkspaceOperationPending) return;
		setIsPending(true);
		const result = await removeWorkspace(deleteTarget.id, isForceDelete);
		setIsPending(false);
		if (!result.isSuccess) {
			if (result.isLeaseConflict && !isForceDelete) {
				setIsForceDelete(true);
				return;
			}
			setDeleteTarget(null);
			setIsForceDelete(false);
			setNotice({
				description: result.error ?? '未知错误',
				title: '删除失败',
			});
			return;
		}
		setDeleteTarget(null);
		setIsForceDelete(false);
	};
	const isTemporaryStorage =
		storageMode === 'memory' || saveStatus === 'memory-only';

	return (
		<>
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
				<header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div className="space-y-2">
						<Heading variant="screen">资源包管理</Heading>
						<p
							className={cn(
								TYPOGRAPHY_STYLES.subtleDescription,
								'max-w-2xl'
							)}
						>
							资源包保存在当前浏览器中；重要版本仍建议及时导出。
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:flex">
						<Button
							variant="flat"
							className="col-span-2 sm:col-span-1"
							onPress={() => router.push('/compare')}
						>
							版本对比
						</Button>
						<Button
							variant="flat"
							isDisabled={isWorkspaceOperationPending}
							onPress={() => fileInputRef.current?.click()}
						>
							导入资源包
						</Button>
						<Button
							color="primary"
							isLoading={
								isPending && lifecycleStatus === 'opening'
							}
							isDisabled={isWorkspaceOperationPending}
							onPress={() =>
								void runWorkspaceOperation(
									createWorkspace,
									'新建资源包',
									true
								)
							}
						>
							新建资源包
						</Button>
					</div>
				</header>

				{!isHydrating &&
					(isTemporaryStorage || storageError !== null) && (
						<div className="mt-6 flex flex-col gap-3 rounded-large border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p
									className={cn(
										TYPOGRAPHY_STYLES.subsectionTitle,
										'text-warning-700 dark:text-warning'
									)}
								>
									{isTemporaryStorage
										? '临时编辑'
										: '本地存储异常'}
								</p>
								<p
									className={cn(
										TYPOGRAPHY_STYLES.description,
										'mt-1'
									)}
								>
									{isTemporaryStorage
										? storageError
											? `本地存储不可用，当前内容仅临时保留，刷新页面会丢失。原因：${storageError}`
											: '本地存储不可用，当前内容仅临时保留，刷新页面会丢失。'
										: `本地存储操作失败，警告会保留到重试成功。原因：${storageError ?? '未知错误'}`}
								</p>
							</div>
							<Button
								color="warning"
								variant="flat"
								isDisabled={isWorkspaceOperationPending}
								onPress={() =>
									void runWorkspaceOperation(
										retryPersistentStorage,
										'重试本地存储'
									)
								}
							>
								重试本地存储
							</Button>
						</div>
					)}

				{isHydrating ? (
					<Card
						role="status"
						aria-live="polite"
						shadow="none"
						className={CATALOG_STATUS_CARD_CLASS_NAME}
					>
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							正在读取本地资源包…
						</p>
					</Card>
				) : workspaces.length === 0 ? (
					<Card
						shadow="none"
						className={CATALOG_STATUS_CARD_CLASS_NAME}
					>
						<Heading as="h2" variant="card">
							还没有资源包
						</Heading>
						<p
							className={cn(
								TYPOGRAPHY_STYLES.subtleDescription,
								'mt-2'
							)}
						>
							新建空白资源包，或者导入已有资源包开始编辑
						</p>
					</Card>
				) : (
					<div className="mt-8 grid gap-4 lg:grid-cols-2">
						{workspaces.map((workspace) => {
							const hasUnexportedChanges =
								!workspace.isCurrentExported;
							const isActive =
								currentWorkspaceId === workspace.id;
							const isPendingExport =
								isActive &&
								pendingExportWorkspaceId === workspace.id;
							const activity = isPendingExport
								? 'exporting'
								: isActive && workspace.isEditing
									? 'current-editing'
									: !isActive && workspace.isEditing
										? 'external-editing'
										: null;
							const isTemporaryWorkspace =
								storageMode === 'memory';
							return (
								<Card
									key={workspace.id}
									shadow="none"
									className="rounded-large border border-divider bg-content1/55 p-5 backdrop-blur"
								>
									<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0">
											<Heading as="h2" variant="card">
												{workspace.displayName}
											</Heading>
											<p
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'mt-1'
												)}
											>
												{`最后编辑：${dateTimeFormatter.format(workspace.updatedAt)}`}
											</p>
										</div>
										<div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-nowrap sm:justify-end">
											{activity === 'exporting' && (
												<WarningBadge className="whitespace-nowrap px-2 py-1 text-xs">
													正在导出
												</WarningBadge>
											)}
											{activity === 'current-editing' && (
												<WarningBadge className="whitespace-nowrap px-2 py-1 text-xs">
													正在编辑
												</WarningBadge>
											)}
											{activity ===
												'external-editing' && (
												<WarningBadge className="whitespace-nowrap px-2 py-1 text-xs">
													其他页面编辑中
												</WarningBadge>
											)}
											{isTemporaryWorkspace ? (
												<WarningBadge className="whitespace-nowrap px-2 py-1 text-xs">
													仅临时保存
												</WarningBadge>
											) : (
												<SuccessBadge className="whitespace-nowrap px-2 py-1 text-xs">
													已保存到本机
												</SuccessBadge>
											)}
											{hasUnexportedChanges ? (
												<WarningBadge className="whitespace-nowrap px-2 py-1 text-xs">
													未导出
												</WarningBadge>
											) : (
												<SuccessBadge className="whitespace-nowrap px-2 py-1 text-xs">
													已导出
												</SuccessBadge>
											)}
										</div>
									</div>
									<div
										className={cn(
											TYPOGRAPHY_STYLES.body,
											'mt-4 grid grid-cols-2 gap-3 rounded-medium bg-content2/45 p-3'
										)}
									>
										<div className="col-span-2 min-w-0">
											<span
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'block'
												)}
											>
												资源包名称（Name）
											</span>
											<span
												className={cn(
													TYPOGRAPHY_STYLES.emphasizedText,
													'mt-1 block break-words'
												)}
											>
												{workspace.resourcePackName ||
													'未设置'}
											</span>
										</div>
										<div className="min-w-0">
											<span
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'block'
												)}
											>
												资源包标识符（Label）
											</span>
											<span
												title={
													workspace.label || '未设置'
												}
												className={cn(
													TYPOGRAPHY_STYLES.emphasizedText,
													'mt-1 block truncate'
												)}
											>
												{workspace.label || '未设置'}
											</span>
										</div>
										<div className="min-w-0">
											<span
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'block'
												)}
											>
												版本
											</span>
											<span
												title={
													workspace.version ||
													'未设置'
												}
												className={cn(
													TYPOGRAPHY_STYLES.emphasizedText,
													'mt-1 block truncate'
												)}
											>
												{workspace.version || '未设置'}
											</span>
										</div>
										<div className="col-span-2 min-w-0 border-t border-divider pt-3">
											<span
												className={cn(
													TYPOGRAPHY_STYLES.caption,
													'block'
												)}
											>
												工作区UUID
											</span>
											<span
												className={cn(
													TYPOGRAPHY_STYLES.metadata,
													'mt-1 block'
												)}
											>
												{workspace.id}
											</span>
										</div>
									</div>
									<div className="mt-5 space-y-2">
										<Button
											fullWidth
											color="primary"
											isDisabled={
												isWorkspaceOperationPending
											}
											onPress={() =>
												void runWorkspaceOperation(
													() =>
														openWorkspace(
															workspace.id
														),
													'打开资源包',
													true
												)
											}
										>
											打开资源包
										</Button>
										<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
											<WorkspaceComparePicker
												isDisabled={
													isWorkspaceOperationPending
												}
												rightWorkspace={workspace}
											/>
											<Button
												fullWidth
												variant="flat"
												isDisabled={
													isWorkspaceOperationPending
												}
												onPress={() =>
													void runWorkspaceOperation(
														() =>
															requestWorkspaceExport(
																workspace.id
															),
														'导出资源包'
													)
												}
											>
												导出
											</Button>
											<Button
												fullWidth
												variant="flat"
												isDisabled={
													isWorkspaceOperationPending
												}
												onPress={() =>
													void runWorkspaceOperation(
														() =>
															duplicateWorkspace(
																workspace.id
															),
														'复制资源包'
													)
												}
											>
												复制
											</Button>
											<Button
												fullWidth
												variant="flat"
												isDisabled={
													isWorkspaceOperationPending
												}
												onPress={() => {
													setRenameTarget(workspace);
													setRenameValue(
														workspace.displayName
													);
												}}
											>
												重命名
											</Button>
											<Button
												fullWidth
												color="danger"
												variant="flat"
												isDisabled={
													isWorkspaceOperationPending
												}
												onPress={() => {
													setIsForceDelete(false);
													setDeleteTarget(workspace);
												}}
											>
												删除
											</Button>
										</div>
									</div>
								</Card>
							);
						})}
					</div>
				)}
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept=".zip"
				disabled={isWorkspaceOperationPending}
				className="hidden"
				onChange={handleFileChange}
			/>

			<CoordinatedModal
				coordination={{ id: 'workspace.rename' }}
				isOpen={renameTarget !== null}
				onClose={() => setRenameTarget(null)}
				size="md"
			>
				<div className="space-y-4">
					<Heading as="h2" variant="dialog">
						重命名工作区
					</Heading>
					<p className={TYPOGRAPHY_STYLES.subtleDescription}>
						只修改用于本地识别的工作区名称，不会修改资源包内部名称（Name）。
					</p>
					<Input
						autoFocus
						label="工作区名称"
						value={renameValue}
						onValueChange={setRenameValue}
					/>
					<div className="flex justify-end gap-2 border-t border-divider pt-4">
						<Button
							variant="light"
							isDisabled={isWorkspaceOperationPending}
							onPress={() => setRenameTarget(null)}
						>
							取消
						</Button>
						<Button
							color="primary"
							isLoading={isPending}
							isDisabled={!renameValue.trim()}
							onPress={() => void handleRename()}
						>
							保存
						</Button>
					</div>
				</div>
			</CoordinatedModal>

			<ConfirmDialog
				coordinationId="workspace.delete"
				isOpen={deleteTarget !== null}
				title={
					isForceDelete
						? `强制删除“${deleteTarget?.displayName ?? ''}”？`
						: `删除“${deleteTarget?.displayName ?? ''}”？`
				}
				description={
					isForceDelete
						? '仍检测到其他页面的编辑状态。强制删除会立即移除本机内容，并使其他页面无法继续保存；此操作不可撤销。'
						: '该资源包保存在本机的内容和文件都会被删除，已导出的资源包不受影响。此操作不可撤销。'
				}
				confirmLabel={isForceDelete ? '仍然删除' : '删除资源包'}
				isPending={isPending}
				onCancel={() => {
					setDeleteTarget(null);
					setIsForceDelete(false);
				}}
				onConfirm={() => void handleDelete()}
			/>
			<ConfirmDialog
				coordinationId="workspace.notice"
				isOpen={notice !== null}
				title={notice?.title ?? ''}
				description={notice?.description}
				confirmLabel="知道了"
				onConfirm={() => setNotice(null)}
			/>
		</>
	);
}
