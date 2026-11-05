'use client';

import { useEffect, useMemo, useRef } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { type IResourcePackReferenceLocation } from '@/domain/resourcePack/referenceLocations';
import {
	createAssetEditorNavigationTarget,
	type IResourceEditorNavigationTarget,
} from '@/domain/resourcePack/editorNavigation';

import { AssetComparisonPreview } from '@/features/resourceComparison/client/components/AssetComparisonPreview';
import {
	type IAssetComparisonNode,
	type TAssetComparisonStatus,
} from '@/features/resourceComparison/client/files/assetComparisonTree';
import { type useAssetComparison } from '@/features/resourceComparison/client/useAssetComparison';
import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

type TAssetCommandKind = 'delete-added' | 'restore-removed';

interface IProps {
	comparison: ReturnType<typeof useAssetComparison>;
	fullEditorDisabledReason: string | null;
	isEditable: boolean;
	isReacquiringEditor: boolean;
	isRightObserving: boolean;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	onRequestCommand?: (kind: TAssetCommandKind, path: string) => void;
}

function AssetStatusBadge({ status }: { status: TAssetComparisonStatus }) {
	if (status === 'added' || status === 'unchanged') {
		return (
			<SuccessBadge>{status === 'added' ? '新增' : '相同'}</SuccessBadge>
		);
	}
	if (status === 'modified' || status === 'unknown') {
		return (
			<WarningBadge>
				{status === 'modified' ? '修改' : '待校验'}
			</WarningBadge>
		);
	}
	return <ErrorBadge>移除</ErrorBadge>;
}

function describeReference(reference: IResourcePackReferenceLocation) {
	const fieldPath = reference.fieldPath.map(String).join('.');
	return `${reference.ownerKind} ${reference.ownerKey}${fieldPath ? ` · ${fieldPath}` : ''}`;
}

function ReferenceList({
	label,
	references,
}: {
	label: string;
	references: readonly IResourcePackReferenceLocation[];
}) {
	return (
		<div className="rounded-medium border border-divider bg-content2/30 p-3">
			<p className={TYPOGRAPHY_STYLES.compactTitle}>{label}</p>
			{references.length > 0 ? (
				<ul className="mt-3 flex flex-col gap-2">
					{references.map((reference, index) => (
						<li
							key={`${reference.ownerKind}:${reference.ownerKey}:${reference.fieldPath.join('.')}:${index}`}
							className={TYPOGRAPHY_STYLES.metadata}
						>
							{describeReference(reference)}
						</li>
					))}
				</ul>
			) : (
				<p className={`${TYPOGRAPHY_STYLES.metadata} mt-3`}>没有引用</p>
			)}
		</div>
	);
}

function FolderSummary({ node }: { node: IAssetComparisonNode }) {
	return (
		<dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
			{(
				[
					['新增', node.counts.added],
					['修改', node.counts.modified],
					['移除', node.counts.removed],
					['待校验', node.counts.unknown],
					['相同', node.counts.unchanged],
				] as const
			).map(([label, count]) => (
				<div
					key={label}
					className="rounded-medium border border-divider bg-content2/30 p-3"
				>
					<dt className={TYPOGRAPHY_STYLES.metadata}>{label}</dt>
					<dd className={TYPOGRAPHY_STYLES.compactTitle}>{count}</dd>
				</div>
			))}
		</dl>
	);
}

export function AssetDifferenceDetail({
	comparison,
	fullEditorDisabledReason,
	isEditable,
	isReacquiringEditor,
	isRightObserving,
	onOpenFullEditor,
	onReacquireRightEditor,
	onRequestCommand,
}: IProps) {
	const isReducedMotion = useReducedMotion();
	const detailRef = useRef<HTMLDivElement>(null);
	const node = comparison.selectedNode;

	useEffect(() => {
		if (
			comparison.selectionRequestVersion === 0 ||
			window.matchMedia('(min-width: 1024px)').matches
		) {
			return;
		}
		const frame = requestAnimationFrame(() => {
			detailRef.current?.scrollIntoView({
				behavior: isReducedMotion ? 'auto' : 'smooth',
				block: 'start',
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [comparison.selectionRequestVersion, isReducedMotion]);

	const moves = useMemo(
		() =>
			node
				? comparison.potentialMoves.filter(
						(move) =>
							move.leftPath === node.path ||
							move.rightPath === node.path
					)
				: [],
		[comparison.potentialMoves, node]
	);

	if (!node) {
		return (
			<div ref={detailRef} className="min-w-0 scroll-mt-24">
				<EditorPanel className="min-h-0">
					<EmptyState
						description="请从资产差异列表中选择文件或目录。"
						title="尚未选择资产"
					/>
				</EditorPanel>
			</div>
		);
	}

	const command =
		node.status === 'removed'
			? ({ kind: 'restore-removed', label: '恢复到新版' } as const)
			: node.status === 'added'
				? ({ kind: 'delete-added', label: '从新版删除' } as const)
				: null;
	const navigationTarget = node.isRightPresent
		? createAssetEditorNavigationTarget(node.path)
		: null;
	return (
		<div ref={detailRef} className="min-w-0 scroll-mt-24">
			<EditorPanel className="flex min-h-0 flex-col gap-4">
				<EditorDetailHeader
					actions={
						<div className="flex flex-wrap gap-2">
							{navigationTarget && (
								<Button
									isDisabled={
										isRightObserving
											? isReacquiringEditor
											: fullEditorDisabledReason !== null
									}
									isLoading={
										isRightObserving && isReacquiringEditor
									}
									variant="flat"
									onPress={() => {
										if (isRightObserving) {
											onReacquireRightEditor();
											return;
										}
										onOpenFullEditor(navigationTarget);
									}}
								>
									{isRightObserving
										? isReacquiringEditor
											? '正在获取编辑权'
											: '重新获取编辑权'
										: '在完整编辑器中打开'}
								</Button>
							)}
							{command && (
								<ConfirmPopover
									color={
										command.kind === 'delete-added'
											? 'danger'
											: 'primary'
									}
									confirmLabel={
										command.kind === 'delete-added'
											? '确认删除'
											: '确认恢复'
									}
									description={
										command.kind === 'delete-added'
											? `确认后会从新版删除“${node.path}”。`
											: `确认后会将“${node.path}”恢复到新版。`
									}
									title={`${command.label}？`}
									trigger={
										<Button
											color={
												command.kind === 'delete-added'
													? 'danger'
													: 'primary'
											}
											isDisabled={
												!isEditable || !onRequestCommand
											}
											variant="flat"
										>
											{command.label}
										</Button>
									}
									onConfirm={() =>
										onRequestCommand?.(
											command.kind,
											node.path
										)
									}
								/>
							)}
						</div>
					}
					description={node.path}
					meta={<AssetStatusBadge status={node.status} />}
					title={node.name}
				/>
				{!isEditable && command && (
					<WarningNotice>
						当前没有新版编辑权，只能查看资产差异。
					</WarningNotice>
				)}
				{moves.map((move) => (
					<WarningNotice key={`${move.leftPath}:${move.rightPath}`}>
						可能移动或重命名：{move.leftPath} → {move.rightPath}
					</WarningNotice>
				))}
				{node.kind === 'folder' ? (
					<FolderSummary node={node} />
				) : (
					<AssetComparisonPreview
						audioDecoder={comparison.audioDecoder}
						node={node}
						objectUrlRegistry={comparison.objectUrlRegistry}
					/>
				)}
				{node.kind !== 'folder' && (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<ReferenceList
							label="旧版引用位置"
							references={comparison.leftReferences}
						/>
						<ReferenceList
							label="新版引用位置"
							references={comparison.rightReferences}
						/>
					</div>
				)}
			</EditorPanel>
		</div>
	);
}
