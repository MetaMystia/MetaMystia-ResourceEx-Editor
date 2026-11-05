'use client';

import { useEffect, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import { getAssetKind } from '@/domain/resourcePack/assetTypes';

import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';
import { type IAssetComparisonPreviewSource } from '@/features/resourceComparison/client/useAssetComparison';
import {
	type IComparisonNode,
	type IComparisonSnapshot,
	type IResourcePackComparison,
} from '@/features/resourceComparison/domain/contracts';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';

import { AssetComparisonPreview } from './AssetComparisonPreview';

interface IProps {
	assetPreviewSource: IAssetComparisonPreviewSource;
	comparison: IResourcePackComparison;
	isExpanded: boolean;
	left: IComparisonSnapshot;
	node: IComparisonNode;
	right: IComparisonSnapshot;
	onOpenAsset: (path: string) => void;
	onToggle: () => void;
}

interface IReferencedPathPair {
	key: string;
	leftPath?: string;
	rightPath?: string;
}

function collectMatchingAssetPaths(
	value: unknown,
	files: ReadonlyMap<string, Blob>,
	path: readonly (number | string)[] = [],
	results = new Map<string, string>()
): ReadonlyMap<string, string> {
	if (typeof value === 'string') {
		if (files.has(value)) results.set(path.join('.'), value);
		return results;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			collectMatchingAssetPaths(item, files, [...path, index], results)
		);
		return results;
	}
	if (typeof value !== 'object' || value === null) return results;
	for (const [key, item] of Object.entries(value)) {
		collectMatchingAssetPaths(item, files, [...path, key], results);
	}
	return results;
}

function collectReferencedPathPairs(
	comparison: IResourcePackComparison,
	node: IComparisonNode,
	left: IComparisonSnapshot,
	right: IComparisonSnapshot
): readonly IReferencedPathPair[] {
	let candidate: IComparisonNode | undefined = node;
	while (candidate) {
		const leftPaths = candidate.leftValue.isPresent
			? collectMatchingAssetPaths(candidate.leftValue.value, left.files)
			: new Map<string, string>();
		const rightPaths = candidate.rightValue.isPresent
			? collectMatchingAssetPaths(candidate.rightValue.value, right.files)
			: new Map<string, string>();
		const keys = [...new Set([...leftPaths.keys(), ...rightPaths.keys()])];
		if (keys.length > 0) {
			return Object.freeze(
				keys.map((key) => {
					const leftPath = leftPaths.get(key);
					const rightPath = rightPaths.get(key);
					return {
						key,
						...(leftPath ? { leftPath } : {}),
						...(rightPath ? { rightPath } : {}),
					};
				})
			);
		}
		candidate = candidate.parentId
			? comparison.nodesById.get(candidate.parentId)
			: undefined;
		if (candidate?.kind === 'collection' || candidate?.kind === 'root')
			break;
	}
	return Object.freeze([]);
}

function createPreviewNode(
	pair: IReferencedPathPair,
	left: IComparisonSnapshot,
	right: IComparisonSnapshot,
	assetPreviewSource: IAssetComparisonPreviewSource
): IAssetComparisonNode | null {
	if (pair.leftPath && pair.leftPath === pair.rightPath) {
		return assetPreviewSource.getNodeByPath(pair.leftPath) ?? null;
	}
	const path = pair.rightPath ?? pair.leftPath;
	if (!path) return null;
	const leftBlob = pair.leftPath ? left.files.get(pair.leftPath) : undefined;
	const rightBlob = pair.rightPath
		? right.files.get(pair.rightPath)
		: undefined;
	const leftAnalysis = pair.leftPath
		? assetPreviewSource.getNodeByPath(pair.leftPath)?.analysis?.left
		: undefined;
	const rightAnalysis = pair.rightPath
		? assetPreviewSource.getNodeByPath(pair.rightPath)?.analysis?.right
		: undefined;
	const leftKind = pair.leftPath ? getAssetKind(pair.leftPath) : undefined;
	const rightKind = pair.rightPath ? getAssetKind(pair.rightPath) : undefined;
	const kind =
		leftKind && rightKind && leftKind !== rightKind
			? 'file'
			: getAssetKind(path);
	const status = !leftBlob ? 'added' : !rightBlob ? 'removed' : 'modified';
	const analysis: IAssetComparisonNode['analysis'] =
		leftAnalysis || rightAnalysis
			? {
					isPotentialMove:
						leftAnalysis?.hashStatus === 'hashed' &&
						rightAnalysis?.hashStatus === 'hashed' &&
						leftAnalysis.hash === rightAnalysis.hash,
					...(leftAnalysis ? { left: leftAnalysis } : {}),
					reason:
						leftBlob && rightBlob
							? ('content' as const)
							: ('presence' as const),
					...(rightAnalysis ? { right: rightAnalysis } : {}),
					status,
				}
			: undefined;
	return {
		...(analysis ? { analysis } : {}),
		children: Object.freeze([]),
		counts: {
			added: status === 'added' ? 1 : 0,
			modified: status === 'modified' ? 1 : 0,
			removed: status === 'removed' ? 1 : 0,
			unchanged: 0,
			unknown: 0,
		},
		isLeftPresent: leftBlob !== undefined,
		isRightPresent: rightBlob !== undefined,
		kind,
		...(leftBlob ? { leftBlob } : {}),
		name: path.slice(path.lastIndexOf('/') + 1),
		parentPath: null,
		path:
			pair.leftPath && pair.rightPath
				? `${pair.leftPath} → ${pair.rightPath}`
				: path,
		...(rightBlob ? { rightBlob } : {}),
		status,
	};
}

export function FieldAssetPreview({
	assetPreviewSource,
	comparison,
	isExpanded,
	left,
	node,
	onOpenAsset,
	onToggle,
	right,
}: IProps) {
	const pairs = useMemo(
		() => collectReferencedPathPairs(comparison, node, left, right),
		[comparison, left, node, right]
	);
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => setSelectedIndex(0), [node.id]);

	const selectedPair = pairs[selectedIndex] ?? pairs[0];
	const selectedLeftPath = selectedPair?.leftPath;
	const selectedRightPath = selectedPair?.rightPath;

	useEffect(() => {
		if (!isExpanded) return;
		const paths = new Set(
			[selectedLeftPath, selectedRightPath].filter(
				(path): path is string => path !== undefined
			)
		);
		for (const path of paths) {
			assetPreviewSource.requestPathAnalysis(path);
		}
	}, [
		assetPreviewSource.requestPathAnalysis,
		isExpanded,
		selectedLeftPath,
		selectedRightPath,
	]);

	const previewNode = useMemo(
		() =>
			selectedPair
				? createPreviewNode(
						selectedPair,
						left,
						right,
						assetPreviewSource
					)
				: null,
		[
			assetPreviewSource,
			assetPreviewSource.analysisRevision,
			left,
			right,
			selectedPair,
		]
	);

	if (pairs.length === 0) return null;
	const targetPath = selectedPair?.rightPath ?? selectedPair?.leftPath;
	const isUnchangedAsset = previewNode?.status === 'unchanged';
	const isUnknownAsset = previewNode?.status === 'unknown';
	const hasHashFailure = previewNode?.analysis?.reason === 'hash-failed';

	return (
		<div className="flex flex-col gap-3">
			<Button size="sm" variant="flat" onPress={onToggle}>
				{isExpanded
					? '收起关联资产'
					: `预览关联资产（${pairs.length}）`}
			</Button>
			{isExpanded && previewNode && (
				<EditorSection>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							<p className={TYPOGRAPHY_STYLES.compactTitle}>
								关联资产
								{pairs.length > 1
									? `（${selectedIndex + 1}/${pairs.length}）`
									: ''}
							</p>
							<p
								className={`${TYPOGRAPHY_STYLES.metadata} break-all`}
							>
								{previewNode.path}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{pairs.length > 1 && (
								<>
									<Button
										size="sm"
										variant="light"
										isDisabled={selectedIndex === 0}
										onPress={() =>
											setSelectedIndex(
												(current) => current - 1
											)
										}
									>
										上一个
									</Button>
									<Button
										size="sm"
										variant="light"
										isDisabled={
											selectedIndex >= pairs.length - 1
										}
										onPress={() =>
											setSelectedIndex(
												(current) => current + 1
											)
										}
									>
										下一个
									</Button>
								</>
							)}
							<Button
								size="sm"
								variant="flat"
								isDisabled={!targetPath}
								onPress={() => {
									if (targetPath) onOpenAsset(targetPath);
								}}
							>
								在资产差异中查看
							</Button>
						</div>
					</div>
					{isUnchangedAsset || isUnknownAsset ? (
						<div className="mt-4 flex flex-wrap items-center gap-2">
							{isUnchangedAsset ? (
								<SuccessBadge>相同</SuccessBadge>
							) : (
								<WarningBadge>
									{hasHashFailure ? '无法确认' : '待校验'}
								</WarningBadge>
							)}
							<p className={TYPOGRAPHY_STYLES.compactDescription}>
								{isUnchangedAsset
									? '该字段引用的资产内容未变化'
									: hasHashFailure
										? '无法确认关联资产是否发生变化，请在资产差异中查看文件元数据。'
										: '正在确认关联资产是否发生变化'}
							</p>
						</div>
					) : (
						<div className="mt-4">
							<AssetComparisonPreview
								audioDecoder={assetPreviewSource.audioDecoder}
								node={previewNode}
								objectUrlRegistry={
									assetPreviewSource.objectUrlRegistry
								}
							/>
						</div>
					)}
					{isUnchangedAsset && previewNode.kind === 'image' && (
						<div className="mt-4">
							<AssetComparisonPreview
								isReferenceOnly
								audioDecoder={assetPreviewSource.audioDecoder}
								node={previewNode}
								objectUrlRegistry={
									assetPreviewSource.objectUrlRegistry
								}
							/>
						</div>
					)}
				</EditorSection>
			)}
		</div>
	);
}
