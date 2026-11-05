'use client';

import { cn } from '@heroui/theme';
import { useEffect, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import { CoordinatedModal, pushOverlayChild } from '@/features/overlays/client';
import { ConfirmDialog } from '@/features/resourceEditor/client/components/confirm/ConfirmDialog';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import type { TWorkspaceImportResolution } from '@/features/resourceEditor/client/workspaces/contracts';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

export function WorkspaceDuplicateDialog() {
	const { duplicateIntent, resolveImport } = useResourceWorkspaces();
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);
	const [isReplaceConfirmationOpen, setIsReplaceConfirmationOpen] =
		useState(false);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<
		string | undefined
	>();
	const defaultCandidate = useMemo(
		() =>
			duplicateIntent?.candidates.find(
				(candidate) => candidate.matchStrength === 'exact'
			) ?? duplicateIntent?.candidates[0],
		[duplicateIntent]
	);
	useEffect(() => {
		setSelectedWorkspaceId(defaultCandidate?.workspace.id);
		setError(null);
		setIsReplaceConfirmationOpen(false);
	}, [defaultCandidate?.workspace.id, duplicateIntent]);

	if (!duplicateIntent) return null;
	const selectedCandidate =
		duplicateIntent.candidates.find(
			(candidate) => candidate.workspace.id === selectedWorkspaceId
		) ?? defaultCandidate;

	const runResolution = async (resolution: TWorkspaceImportResolution) => {
		setIsReplaceConfirmationOpen(false);
		setIsPending(true);
		setError(null);
		const result = await resolveImport(
			resolution,
			resolution === 'copy' || resolution === 'cancel'
				? undefined
				: selectedCandidate?.workspace.id
		);
		setIsPending(false);
		if (!result.isSuccess) {
			setError(result.error ?? '无法处理导入的资源包');
			return;
		}
	};

	const isExact = selectedCandidate?.matchStrength === 'exact';

	return (
		<>
			<CoordinatedModal
				coordination={{ id: 'workspace.duplicate' }}
				hideCloseButton
				isDismissable={false}
				isKeyboardDismissDisabled={isPending}
				isOpen
				size="lg"
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Heading as="h2" variant="dialog">
							发现可能重复的资源包
						</Heading>
						<p className={TYPOGRAPHY_STYLES.description}>
							{selectedCandidate
								? isExact
									? `本次导入与“${selectedCandidate.workspace.displayName}”的原始文件完全一致。`
									: `本次导入与“${selectedCandidate.workspace.displayName}”的资源包标识符（Label）和版本相同，但内容可能不同。`
								: '本地存储不可用，无法继续读取已有资源包。仍可将本次导入创建为临时副本。'}
						</p>
						{selectedCandidate &&
							duplicateIntent.candidates.length > 1 && (
								<Select<string>
									ariaLabel="选择已有资源包"
									value={selectedCandidate.workspace.id}
									items={duplicateIntent.candidates.map(
										(candidate) => ({
											description:
												candidate.matchStrength ===
												'exact'
													? `原始文件完全一致·工作区UUID：${candidate.workspace.id}`
													: `资源包标识符（Label）和版本相同·工作区UUID：${candidate.workspace.id}`,
											label: candidate.workspace
												.displayName,
											value: candidate.workspace.id,
										})
									)}
									onChange={setSelectedWorkspaceId}
								/>
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
					<div className="flex flex-wrap justify-end gap-2 border-t border-divider pt-4">
						<Button
							variant="light"
							isDisabled={isPending}
							onPress={() => void runResolution('cancel')}
						>
							取消
						</Button>
						{selectedCandidate && (
							<Button
								color="danger"
								variant="flat"
								isDisabled={isPending}
								onPress={() =>
									pushOverlayChild({
										childId: 'workspace.duplicate.replace',
										onOpenChild: () =>
											setIsReplaceConfirmationOpen(true),
										parentId: 'workspace.duplicate',
									})
								}
							>
								覆盖已有资源包
							</Button>
						)}
						<Button
							color={isExact ? 'default' : 'primary'}
							variant={isExact ? 'flat' : 'solid'}
							isDisabled={isPending}
							onPress={() => void runResolution('copy')}
						>
							创建副本
						</Button>
						{selectedCandidate && (
							<Button
								color={isExact ? 'primary' : 'default'}
								variant={isExact ? 'solid' : 'flat'}
								isLoading={isPending}
								onPress={() => void runResolution('open')}
							>
								打开已有资源包
							</Button>
						)}
					</div>
				</div>
			</CoordinatedModal>
			<ConfirmDialog
				coordinationId="workspace.duplicate.replace"
				isOpen={
					isReplaceConfirmationOpen && selectedCandidate !== undefined
				}
				title={`覆盖“${selectedCandidate?.workspace.displayName ?? ''}”？`}
				description="已有资源包的当前内容和本地恢复版本都会被本次导入的资源包替换。此操作不可撤销。"
				confirmLabel="确认覆盖"
				isPending={isPending}
				onCancel={() => setIsReplaceConfirmationOpen(false)}
				onConfirm={() => void runResolution('replace')}
			/>
		</>
	);
}
