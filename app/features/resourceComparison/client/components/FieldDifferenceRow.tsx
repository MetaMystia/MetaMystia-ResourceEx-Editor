'use client';

import { cn } from '@heroui/theme';
import { memo, useEffect, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';
import Textarea from '@/design/ui/components/textarea';

import { BEVERAGE_TAGS, FOOD_TAGS } from '@/domain/data/tags';
import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

import { type TComparisonReviewCommandKind } from '@/features/resourceComparison/client/useComparisonCommand';
import { type IAssetComparisonPreviewSource } from '@/features/resourceComparison/client/useAssetComparison';
import {
	type IComparisonNode,
	type IComparisonSnapshot,
	type IResourcePackComparison,
	type TComparisonDifferenceStatus,
} from '@/features/resourceComparison/domain/contracts';
import {
	getComparisonFieldDescriptor,
	type IComparisonFieldDescriptor,
} from '@/features/resourceComparison/domain/fieldComparison';
import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { TagSelector } from '@/features/resourceEditor/client/components/tags/TagSelector';
import { AssetPickerDialog } from '@/features/resourceEditor/client/editors/asset/AssetPickerDialog';

import { FieldAssetPreview } from './FieldAssetPreview';

interface IProps {
	assetPreviewSource: IAssetComparisonPreviewSource;
	comparison: IResourcePackComparison;
	displayLabel: string;
	fullEditorDisabledReason: string | null;
	isEditable: boolean;
	isAssetPreviewExpanded: boolean;
	isReacquiringEditor: boolean;
	isRightObserving: boolean;
	left: IComparisonSnapshot;
	node: IComparisonNode;
	onAdoptOld: (node: IComparisonNode) => void;
	onCommit: (node: IComparisonNode, value: unknown) => void;
	onOpenAsset: (path: string) => void;
	onOpenFullEditor: (target: IResourceEditorNavigationTarget) => void;
	onReacquireRightEditor: () => void;
	onRemove: (node: IComparisonNode) => boolean;
	onRequestCommand: (
		node: IComparisonNode,
		commandKind: TComparisonReviewCommandKind
	) => void;
	onToggleAssetPreview: (nodeId: string) => void;
	right: IComparisonSnapshot;
}

function ComparisonStatusBadge({
	status,
}: {
	status: TComparisonDifferenceStatus;
}) {
	if (status === 'added' || status === 'unchanged') {
		return (
			<SuccessBadge>{status === 'added' ? '新增' : '相同'}</SuccessBadge>
		);
	}
	if (status === 'modified') return <WarningBadge>修改</WarningBadge>;
	return (
		<ErrorBadge>{status === 'removed' ? '移除' : '无法匹配'}</ErrorBadge>
	);
}

function formatComparisonValue(node: IComparisonNode, side: 'left' | 'right') {
	const comparisonValue = side === 'left' ? node.leftValue : node.rightValue;
	if (!comparisonValue.isPresent) return '（不存在）';
	const value = comparisonValue.value;
	if (value === '') return '（空字符串）';
	if (value === undefined) return '（undefined）';
	if (value === null) return 'null';
	if (typeof value === 'string') return value;
	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return String(value);
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function formatFieldControlValue(
	descriptor: IComparisonFieldDescriptor | null,
	node: IComparisonNode,
	side: 'left' | 'right'
) {
	const comparisonValue = side === 'left' ? node.leftValue : node.rightValue;
	if (
		descriptor?.kind === 'string-list' &&
		comparisonValue.isPresent &&
		Array.isArray(comparisonValue.value)
	) {
		return comparisonValue.value
			.filter((value): value is string => typeof value === 'string')
			.join('\n');
	}
	return formatComparisonValue(node, side);
}

function getNumberSet(value: unknown): number[] {
	return Array.isArray(value)
		? value.filter((item): item is number => typeof item === 'number')
		: [];
}

export const FieldDifferenceRow = memo(function FieldDifferenceRow({
	assetPreviewSource,
	comparison,
	displayLabel,
	fullEditorDisabledReason,
	isEditable,
	isAssetPreviewExpanded,
	isReacquiringEditor,
	isRightObserving,
	left,
	node,
	onAdoptOld,
	onCommit,
	onOpenAsset,
	onOpenFullEditor,
	onReacquireRightEditor,
	onRemove,
	onRequestCommand,
	onToggleAssetPreview,
	right,
}: IProps) {
	const descriptor = getComparisonFieldDescriptor(node);
	const leftText = formatFieldControlValue(descriptor, node, 'left');
	const rightText = formatFieldControlValue(descriptor, node, 'right');
	const [draft, setDraft] = useState(rightText);
	const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
	const [isRawContentExpanded, setIsRawContentExpanded] = useState(false);
	const reviewCommand = node.editCapabilities.includes('delete-added')
		? ({ kind: 'delete-added', label: '从新版删除' } as const)
		: node.editCapabilities.includes('restore-removed')
			? ({ kind: 'restore-removed', label: '恢复到新版' } as const)
			: null;
	const canAdoptOld = Boolean(
		descriptor && node.status === 'modified' && node.leftValue.isPresent
	);
	const navigationTarget =
		node.kind === 'entity' && !node.rightValue.isPresent
			? undefined
			: node.navigationTarget;

	useEffect(() => {
		setDraft(rightText);
		setIsRawContentExpanded(false);
	}, [node.id, rightText]);

	const commitDraft = () => {
		if (!descriptor) return;
		if (draft === rightText) return;
		if (descriptor.kind === 'number') {
			if (!draft.trim()) {
				if (!descriptor.isOptional || !onRemove(node)) {
					setDraft(rightText);
				}
				return;
			}
			const value = Number(draft);
			if (Number.isFinite(value)) onCommit(node, value);
			else setDraft(rightText);
			return;
		}
		if (descriptor.kind === 'string-list') {
			onCommit(node, draft.split(/\r?\n/u));
			return;
		}
		onCommit(node, draft);
	};

	const renderValueControl = (side: 'left' | 'right') => {
		const isRight = side === 'right';
		const comparisonValue = isRight ? node.rightValue : node.leftValue;
		const isControlEditable =
			isRight && isEditable && comparisonValue.isPresent;
		const value = comparisonValue.isPresent
			? comparisonValue.value
			: undefined;
		const text = isRight ? rightText : leftText;
		const ariaLabel = `${isRight ? '新版' : '旧版'}${displayLabel}`;

		if (!descriptor) {
			if (node.children.length > 0 && !isRawContentExpanded) {
				return (
					<p className={TYPOGRAPHY_STYLES.subtleDescription}>
						{comparisonValue.isPresent
							? `包含${node.children.length}项内容`
							: '此版本不存在'}
					</p>
				);
			}
			return (
				<pre className="whitespace-pre-wrap break-words font-sans">
					{text}
				</pre>
			);
		}
		if (
			descriptor.kind === 'multiline' ||
			descriptor.kind === 'license' ||
			descriptor.kind === 'string-list'
		) {
			const minRows = descriptor.kind === 'license' ? 8 : 3;
			if (isControlEditable) {
				return (
					<Textarea
						aria-label={ariaLabel}
						minRows={minRows}
						value={draft}
						onBlur={commitDraft}
						onChange={(event) => setDraft(event.target.value)}
					/>
				);
			}
			return (
				<Textarea
					aria-label={ariaLabel}
					isReadOnly
					minRows={minRows}
					value={text}
				/>
			);
		}
		if (descriptor.kind === 'boolean') {
			return (
				<Switch
					aria-label={ariaLabel}
					isDisabled={!isControlEditable}
					isSelected={comparisonValue.isPresent && Boolean(value)}
					onValueChange={(nextValue) => {
						if (isControlEditable) onCommit(node, nextValue);
					}}
				>
					{comparisonValue.isPresent
						? Boolean(value)
							? '是'
							: '否'
						: '不存在'}
				</Switch>
			);
		}
		if (descriptor.kind === 'literal') {
			return (
				<Select
					ariaLabel={ariaLabel}
					isDisabled={!isControlEditable}
					items={[...(descriptor.options ?? [])]}
					placeholder={
						comparisonValue.isPresent ? '请选择…' : '（不存在）'
					}
					value={typeof value === 'string' ? value : undefined}
					onChange={(nextValue) => {
						if (isControlEditable) onCommit(node, nextValue);
					}}
				/>
			);
		}
		if (descriptor.kind === 'number-set') {
			const tagPool =
				descriptor.setKind === 'beverage-tags'
					? BEVERAGE_TAGS
					: FOOD_TAGS;
			const numberSet = getNumberSet(value);
			return (
				<TagSelector
					isReadOnly={!isControlEditable}
					tagPool={tagPool}
					tags={numberSet}
					onToggle={(tagId) => {
						if (!isControlEditable) return;
						const next = numberSet.includes(tagId)
							? numberSet.filter((id) => id !== tagId)
							: [...numberSet, tagId].sort((a, b) => a - b);
						onCommit(node, next);
					}}
				/>
			);
		}
		if (descriptor.kind === 'asset-path') {
			return (
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						isReadOnly
						aria-label={`${ariaLabel}路径`}
						value={text}
					/>
					<Button
						isDisabled={!isControlEditable}
						variant="flat"
						onPress={() => {
							if (isControlEditable) setIsAssetPickerOpen(true);
						}}
					>
						选择资产
					</Button>
				</div>
			);
		}
		const inputType =
			descriptor.kind === 'number' && comparisonValue.isPresent
				? 'number'
				: 'text';
		if (isControlEditable) {
			return (
				<Input
					aria-label={ariaLabel}
					type={inputType}
					value={draft}
					onBlur={commitDraft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
				/>
			);
		}
		return (
			<Input
				aria-label={ariaLabel}
				isReadOnly
				type={inputType}
				value={text}
			/>
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className={TYPOGRAPHY_STYLES.sectionTitle}>
							{displayLabel}
						</h3>
						<ComparisonStatusBadge status={node.status} />
					</div>
					<p
						className={cn(
							TYPOGRAPHY_STYLES.microLabel,
							'break-all text-foreground-500'
						)}
					>
						{node.fieldPath.join(' › ')}
					</p>
				</div>
				{(canAdoptOld || reviewCommand || navigationTarget) && (
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
						{canAdoptOld && (
							<ConfirmPopover
								color="primary"
								confirmLabel="确认采用"
								description={`确认后会将“${displayLabel}”的旧版值写入新版。`}
								title="采用旧值？"
								trigger={
									<Button
										isDisabled={!isEditable}
										variant="flat"
									>
										采用旧值
									</Button>
								}
								onConfirm={() => onAdoptOld(node)}
							/>
						)}
						{reviewCommand && (
							<ConfirmPopover
								color={
									reviewCommand.kind === 'delete-added'
										? 'danger'
										: 'primary'
								}
								confirmLabel={
									reviewCommand.kind === 'delete-added'
										? '确认删除'
										: '确认恢复'
								}
								description={
									reviewCommand.kind === 'delete-added'
										? `确认后会从新版删除“${displayLabel}”。`
										: `确认后会将“${displayLabel}”恢复到新版。`
								}
								title={`${reviewCommand.label}？`}
								trigger={
									<Button
										color={
											reviewCommand.kind ===
											'delete-added'
												? 'danger'
												: 'primary'
										}
										isDisabled={!isEditable}
										variant="flat"
									>
										{reviewCommand.label}
									</Button>
								}
								onConfirm={() =>
									onRequestCommand(node, reviewCommand.kind)
								}
							/>
						)}
					</div>
				)}
			</div>

			<div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
				<div className="min-w-0">
					<p className={TYPOGRAPHY_STYLES.microLabel}>旧版（只读）</p>
					<div className="mt-2">{renderValueControl('left')}</div>
				</div>
				<div className="min-w-0">
					<p className={TYPOGRAPHY_STYLES.microLabel}>
						新版{isEditable ? '（可编辑）' : '（观察中）'}
					</p>
					<div className="mt-2">{renderValueControl('right')}</div>
				</div>
			</div>

			<FieldAssetPreview
				assetPreviewSource={assetPreviewSource}
				comparison={comparison}
				isExpanded={isAssetPreviewExpanded}
				left={left}
				node={node}
				onOpenAsset={onOpenAsset}
				onToggle={() => onToggleAssetPreview(node.id)}
				right={right}
			/>

			{!descriptor && node.children.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className={TYPOGRAPHY_STYLES.subtleDescription}>
						此内容需要在完整编辑器中查看和修改
					</p>
					<Button
						size="sm"
						variant="light"
						onPress={() =>
							setIsRawContentExpanded((current) => !current)
						}
					>
						{isRawContentExpanded ? '收起原始内容' : '查看原始内容'}
					</Button>
				</div>
			)}

			{node.issues.length > 0 && (
				<div className="flex flex-col gap-2">
					{node.issues.map((issue, index) => (
						<p
							key={`${issue.message}-${index}`}
							className={cn(
								TYPOGRAPHY_STYLES.compactBody,
								issue.severity === 'error'
									? 'text-danger'
									: 'text-warning'
							)}
						>
							{issue.category}：{issue.message}
						</p>
					))}
				</div>
			)}

			{node.referenceImpacts.length > 0 && (
				<p className={TYPOGRAPHY_STYLES.subtleDescription}>
					此字段有{node.referenceImpacts.length}处引用。
				</p>
			)}

			{isAssetPickerOpen && (
				<AssetPickerDialog
					initialFolder="assets/"
					open
					onClose={() => setIsAssetPickerOpen(false)}
					onSelect={(path) => onCommit(node, path)}
				/>
			)}
		</div>
	);
});
