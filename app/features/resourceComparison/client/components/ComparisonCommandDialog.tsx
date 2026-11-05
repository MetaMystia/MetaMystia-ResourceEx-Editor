'use client';

import { useEffect, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import ScrollShadow from '@/design/ui/components/scrollShadow';
import Switch from '@/design/ui/components/switch';

import { CoordinatedModal, pushOverlayChild } from '@/features/overlays/client';
import { formatComparisonFileSize } from '@/features/resourceComparison/client/components/BinaryComparisonDetail';
import { type useComparisonCommand } from '@/features/resourceComparison/client/useComparisonCommand';
import {
	type IComparisonCommandChange,
	type IComparisonCommandConflict,
	type IComparisonReferenceImpact,
	type IComparisonSkippedFile,
	type TComparisonAssetConflictResolution,
} from '@/features/resourceComparison/domain/contracts';
import { ConfirmDialog } from '@/features/resourceEditor/client/components/confirm/ConfirmDialog';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

interface IProps {
	controller: ReturnType<typeof useComparisonCommand>;
}

const COMMAND_LABELS = {
	'delete-added': '从新版删除',
	'restore-removed': '恢复到新版',
} as const;

const CHANGE_LABELS = {
	'copy-file': '复制文件',
	'create-folder': '创建目录',
	'delete-field': '删除字段',
	'delete-file': '删除文件',
	'delete-folder': '删除目录',
	'delete-member': '删除成员',
	'restore-field': '恢复字段',
	'restore-member': '恢复成员',
	'set-field': '采用旧值',
} as const;

const SKIPPED_FILE_REASON_LABELS = {
	'kept-right': '保留新版文件',
	'same-content': '内容相同',
} as const;

function describeChange(change: IComparisonCommandChange) {
	const target =
		change.assetPath ?? change.fieldPath?.map(String).join(' › ') ?? '';
	return `${CHANGE_LABELS[change.kind]}${target ? ` · ${target}` : ''}`;
}

function describeReferenceImpact(impact: IComparisonReferenceImpact) {
	const fieldPath = impact.fieldPath.map(String).join(' › ');
	return `${impact.ownerKind} ${impact.ownerKey}${fieldPath ? ` · ${fieldPath}` : ''} → ${impact.referencedKind} ${impact.referencedValue}`;
}

function describeSkippedFile(file: IComparisonSkippedFile) {
	return `${file.path} · ${SKIPPED_FILE_REASON_LABELS[file.reason]} · ${formatComparisonFileSize(file.size)}`;
}

function canResolveAssetConflict(conflict: IComparisonCommandConflict) {
	return Boolean(
		conflict.isBlocking &&
		conflict.assetPath &&
		(conflict.kind === 'file-folder-collision' ||
			conflict.kind === 'path-content-mismatch')
	);
}

function ConflictResolutionButtons({
	conflict,
	disabled,
	onChange,
	value,
}: {
	conflict: IComparisonCommandConflict;
	disabled: boolean;
	onChange: (resolution: TComparisonAssetConflictResolution) => void;
	value: TComparisonAssetConflictResolution | undefined;
}) {
	if (!canResolveAssetConflict(conflict)) return null;
	return (
		<div className="mt-3 flex flex-wrap gap-2">
			<Button
				aria-pressed={value === 'keep-right'}
				color={value === 'keep-right' ? 'primary' : 'default'}
				isDisabled={disabled}
				size="sm"
				variant={value === 'keep-right' ? 'flat' : 'light'}
				onPress={() => onChange('keep-right')}
			>
				保留新版文件
			</Button>
			<Button
				aria-pressed={value === 'use-left'}
				color={value === 'use-left' ? 'primary' : 'default'}
				isDisabled={disabled}
				size="sm"
				variant={value === 'use-left' ? 'flat' : 'light'}
				onPress={() => onChange('use-left')}
			>
				使用旧版文件
			</Button>
		</div>
	);
}

export function ComparisonCommandDialog({ controller }: IProps) {
	const [isDangerConfirmationOpen, setIsDangerConfirmationOpen] =
		useState(false);
	const review = controller.review;
	const plan = review?.buildResult.plan;
	const isReviewOpen = review !== null && plan !== undefined;
	const isPending = controller.isExecuting || controller.isPlanning;
	const hasReferencedDelete = Boolean(
		plan?.conflicts.some(
			(conflict) => conflict.kind === 'referenced-delete'
		) || plan?.referenceImpacts.length
	);

	useEffect(() => {
		setIsDangerConfirmationOpen(false);
	}, [plan?.id]);

	const commandLabel = review
		? COMMAND_LABELS[review.request.commandKind]
		: '';
	const canIncludeReferencedAssets =
		review?.request.commandKind === 'restore-removed' &&
		review.request.targetNode.kind === 'entity';
	const runCommand = () => {
		setIsDangerConfirmationOpen(false);
		controller.executeReview();
	};
	const handleConfirm = () => {
		if (!hasReferencedDelete) {
			runCommand();
			return;
		}
		pushOverlayChild({
			childId: 'comparison.command.confirm',
			onOpenChild: () => setIsDangerConfirmationOpen(true),
			parentId: 'comparison.command',
		});
	};

	return (
		<>
			<CoordinatedModal
				coordination={{ id: 'comparison.command' }}
				isDismissable={!isPending}
				isKeyboardDismissDisabled={isPending}
				isOpen={isReviewOpen}
				onClose={controller.closeReview}
				size="lg"
			>
				{review && plan && (
					<div className="space-y-4">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Heading as="h2" variant="dialog">
									确认{commandLabel}
								</Heading>
								{plan.isApplicable ? (
									<SuccessBadge>可执行</SuccessBadge>
								) : (
									<ErrorBadge>需要处理</ErrorBadge>
								)}
							</div>
							<p className={TYPOGRAPHY_STYLES.description}>
								{review.request.targetNode.label} ·{' '}
								{review.request.targetAssetPath ??
									review.request.targetNode.fieldPath
										.map(String)
										.join(' › ')}
							</p>
						</div>

						<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<div>
								<dt className={TYPOGRAPHY_STYLES.metadata}>
									变更
								</dt>
								<dd className={TYPOGRAPHY_STYLES.compactTitle}>
									{plan.changes.length}
								</dd>
							</div>
							<div>
								<dt className={TYPOGRAPHY_STYLES.metadata}>
									冲突
								</dt>
								<dd className={TYPOGRAPHY_STYLES.compactTitle}>
									{plan.conflicts.length}
								</dd>
							</div>
							<div>
								<dt className={TYPOGRAPHY_STYLES.metadata}>
									新增文件
								</dt>
								<dd className={TYPOGRAPHY_STYLES.compactTitle}>
									{plan.addedFileCount}
								</dd>
							</div>
							<div>
								<dt className={TYPOGRAPHY_STYLES.metadata}>
									新增大小
								</dt>
								<dd className={TYPOGRAPHY_STYLES.compactTitle}>
									{formatComparisonFileSize(plan.addedBytes)}
								</dd>
							</div>
						</dl>

						{canIncludeReferencedAssets && (
							<Switch
								isDisabled={isPending}
								isSelected={review.includeReferencedAssets}
								onValueChange={
									controller.setIncludeReferencedAssets
								}
							>
								同时恢复缺失的直接引用资产
							</Switch>
						)}

						{plan.conflicts.length > 0 && (
							<section
								className="space-y-2"
								aria-label="冲突和风险"
							>
								<p className={TYPOGRAPHY_STYLES.compactTitle}>
									冲突和风险
								</p>
								{plan.conflicts.map((conflict, index) => (
									<WarningNotice
										key={`${conflict.kind}:${conflict.assetPath ?? conflict.fieldPath?.join('.') ?? index}`}
									>
										<div className="flex flex-wrap items-center gap-2">
											{conflict.isBlocking ? (
												<ErrorBadge>阻断</ErrorBadge>
											) : (
												<WarningBadge>
													需确认
												</WarningBadge>
											)}
											<p
												className={
													TYPOGRAPHY_STYLES.compactBody
												}
											>
												{conflict.message}
											</p>
										</div>
										{conflict.assetPath && (
											<ConflictResolutionButtons
												conflict={conflict}
												disabled={isPending}
												value={review.assetConflictResolutions.get(
													conflict.assetPath
												)}
												onChange={(resolution) =>
													conflict.assetPath &&
													controller.setAssetConflictResolution(
														conflict.assetPath,
														resolution
													)
												}
											/>
										)}
									</WarningNotice>
								))}
							</section>
						)}

						{plan.changes.length > 0 && (
							<section
								className="space-y-2"
								aria-label="将执行的变更"
							>
								<p className={TYPOGRAPHY_STYLES.compactTitle}>
									将执行的变更
								</p>
								<ScrollShadow className="max-h-64">
									<ul className="space-y-2 pr-2">
										{plan.changes.map((change, index) => (
											<li
												key={`${change.kind}:${change.assetPath ?? change.fieldPath?.join('.') ?? index}`}
												className={
													TYPOGRAPHY_STYLES.compactBody
												}
											>
												{describeChange(change)}
											</li>
										))}
									</ul>
								</ScrollShadow>
							</section>
						)}

						{plan.referenceImpacts.length > 0 && (
							<section
								className="space-y-2"
								aria-label="引用影响"
							>
								<p className={TYPOGRAPHY_STYLES.compactTitle}>
									引用影响 · {plan.referenceImpacts.length}处
								</p>
								<ScrollShadow className="max-h-64">
									<ul className="space-y-2 pr-2">
										{plan.referenceImpacts.map(
											(impact, index) => (
												<li
													key={`${impact.ownerKind}:${impact.ownerKey}:${impact.fieldPath.join('.')}:${index}`}
													className={
														TYPOGRAPHY_STYLES.compactBody
													}
												>
													{describeReferenceImpact(
														impact
													)}
												</li>
											)
										)}
									</ul>
								</ScrollShadow>
							</section>
						)}
						{plan.skippedFiles.length > 0 && (
							<section
								className="space-y-2"
								aria-label="跳过的文件"
							>
								<p className={TYPOGRAPHY_STYLES.compactTitle}>
									跳过的文件 · {plan.skippedFiles.length}个
								</p>
								<ScrollShadow className="max-h-64">
									<ul className="space-y-2 pr-2">
										{plan.skippedFiles.map((file) => (
											<li
												key={file.path}
												className={
													TYPOGRAPHY_STYLES.compactBody
												}
											>
												{describeSkippedFile(file)}
											</li>
										))}
									</ul>
								</ScrollShadow>
							</section>
						)}

						<div className="flex flex-wrap justify-end gap-2 border-t border-divider pt-4">
							<Button
								isDisabled={isPending}
								variant="light"
								onPress={controller.closeReview}
							>
								取消
							</Button>
							<Button
								color={
									review.request.commandKind ===
									'delete-added'
										? 'danger'
										: 'primary'
								}
								isDisabled={!plan.isApplicable || isPending}
								isLoading={controller.isExecuting}
								onPress={handleConfirm}
							>
								执行{commandLabel}
							</Button>
						</div>
					</div>
				)}
			</CoordinatedModal>

			<ConfirmDialog
				coordinationId="comparison.command.confirm"
				description={
					plan
						? `删除后仍有${plan.referenceImpacts.length}处引用。现有验证会继续提示这些问题。`
						: ''
				}
				confirmLabel="确认删除"
				isOpen={isReviewOpen && isDangerConfirmationOpen}
				isPending={controller.isExecuting}
				title="从新版删除仍被引用的内容？"
				onCancel={() => setIsDangerConfirmationOpen(false)}
				onConfirm={runCommand}
			/>
		</>
	);
}
