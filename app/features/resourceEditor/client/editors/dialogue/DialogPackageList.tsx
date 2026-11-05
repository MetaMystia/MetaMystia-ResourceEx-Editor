import { cn } from '@heroui/theme';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Tooltip from '@/design/ui/components/tooltip';

import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';
import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorCollectionPanel } from '@/features/resourceEditor/client/components/layout/EditorCollectionPanel';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { usePackLabelPrefix } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

// ─── Types ───────────────────────────────────────────────

interface PackageTreeItem {
	pkg: DialogPackage;
	index: number;
	displayName: string;
}

interface TreeNode {
	items: PackageTreeItem[];
	children: Map<string, TreeNode>;
}

// ─── Constants ───────────────────────────────────────────

const CONFORMING_KEY = '__conforming__';
const DIALOG_TREE_STICKY_TOP_CLASS_NAMES = [
	'top-24 lg:top-0',
	'top-[8.25rem] lg:top-9',
	'top-[10.5rem] lg:top-[4.5rem]',
] as const;
const OTHER_KEY = '__other__';

// ─── Tree helpers ────────────────────────────────────────

/**
 * 将对话包列表按命名规范构建为两层分组树。
 * 符合 `_{label}_` 前缀的，去掉前缀后按 `_` 分割，取前两段作为分组层级，余下部分作为显示名。
 * 不符合前缀的归入 nonConforming。
 */
function buildDialogTree(
	packages: DialogPackage[],
	prefix: string
): { conforming: TreeNode; nonConforming: PackageTreeItem[] } {
	const conforming: TreeNode = { items: [], children: new Map() };
	const nonConforming: PackageTreeItem[] = [];

	for (let index = 0; index < packages.length; index++) {
		const pkg = packages[index];
		if (!pkg) continue;

		if (prefix && prefix !== '_' && pkg.name.startsWith(prefix)) {
			const remaining = pkg.name.slice(prefix.length);
			const parts = remaining.split('_').filter(Boolean);

			let currentNode = conforming;
			const groupDepth = Math.min(2, parts.length);

			for (let i = 0; i < groupDepth; i++) {
				const part = parts[i]!;
				if (!currentNode.children.has(part)) {
					currentNode.children.set(part, {
						items: [],
						children: new Map(),
					});
				}
				currentNode = currentNode.children.get(part)!;
			}

			const tailParts = parts.slice(groupDepth);
			currentNode.items.push({
				pkg,
				index,
				displayName:
					tailParts.length > 0 ? tailParts.join('_') : pkg.name,
			});
		} else {
			nonConforming.push({ pkg, index, displayName: pkg.name });
		}
	}

	return { conforming, nonConforming };
}

function countTreeItems(node: TreeNode): number {
	let count = node.items.length;
	for (const child of node.children.values()) {
		count += countTreeItems(child);
	}
	return count;
}

/** 收集树中所有分组的路径（用 `/` 拼接），用于初始化展开状态 */
function collectAllGroupPaths(node: TreeNode, parentPath: string): string[] {
	const paths: string[] = [];
	for (const [key, child] of node.children) {
		const path = parentPath ? `${parentPath}/${key}` : key;
		paths.push(path);
		paths.push(...collectAllGroupPaths(child, path));
	}
	return paths;
}

/** 将一个完整路径拆成所有祖先路径（含自身） */
function pathToAncestors(fullPath: string): string[] {
	return fullPath.split('/').reduce<string[]>((acc, seg) => {
		const prev = acc.length > 0 ? acc[acc.length - 1] : '';
		acc.push(prev ? `${prev}/${seg}` : seg);
		return acc;
	}, []);
}

/** 在树中查找某个 index 所属的所有需要展开的路径 */
function findItemGroupPaths(
	node: TreeNode,
	targetIndex: number,
	parentPath: string
): string[] | null {
	if (node.items.some((item) => item.index === targetIndex)) {
		return parentPath ? pathToAncestors(parentPath) : [];
	}
	for (const [key, child] of node.children) {
		const path = parentPath ? `${parentPath}/${key}` : key;
		const result = findItemGroupPaths(child, targetIndex, path);
		if (result) return result;
	}
	return null;
}

// ─── Sub-components ──────────────────────────────────────

function GroupHeader({
	label,
	count,
	expanded,
	onToggle,
	isTopLevel,
	stickyDepth,
}: {
	label: string;
	count: number;
	expanded: boolean;
	onToggle: () => void;
	isTopLevel?: boolean;
	stickyDepth?: number;
}) {
	return (
		<Button
			variant="light"
			size="sm"
			onPress={onToggle}
			aria-expanded={expanded}
			className={cn(
				'h-auto min-h-10 w-full justify-start rounded-medium px-2 py-1.5 text-left sm:min-h-8',
				stickyDepth !== undefined &&
					'z-20 h-9 min-h-9 bg-content1/95 backdrop-blur',
				stickyDepth !== undefined &&
					DIALOG_TREE_STICKY_TOP_CLASS_NAMES[stickyDepth],
				stickyDepth !== undefined && 'sticky',
				isTopLevel
					? TYPOGRAPHY_STYLES.subsectionTitle
					: TYPOGRAPHY_STYLES.compactLabel
			)}
		>
			<ChevronRight
				className={cn(
					'h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
					expanded && 'rotate-90'
				)}
			/>
			<span title={label} className="truncate">
				{label}
			</span>
			<span className={cn(TYPOGRAPHY_STYLES.caption, 'ml-auto shrink-0')}>
				{count}
			</span>
		</Button>
	);
}

function DialogTreeItem({
	item,
	isSelected,
	isDuplicate,
	hasPrefixWarning,
	onSelect,
	onRemove,
}: {
	item: PackageTreeItem;
	isSelected: boolean;
	isDuplicate: boolean;
	hasPrefixWarning: boolean;
	onSelect: () => void;
	onRemove: () => void;
}) {
	const { resourcePack } = useResourceEditor();
	const giftTitles = (resourcePack.gifts ?? []).flatMap((gift, index) =>
		gift.dialogPackageName === item.pkg.name
			? [`${index + 1}. ${gift.title || '未命名礼物'}`]
			: []
	);
	return (
		<EditorCollectionItem
			isInvalid={isDuplicate}
			isSelected={isSelected}
			onSelect={onSelect}
			actions={
				<SectionDeleteButton
					iconOnly
					confirmTitle="确定要删除这个对话包吗？"
					confirmDescription={
						giftTitles.length > 0
							? `以下礼物仍绑定此对话：${giftTitles.join('、')}。删除后请修改对应礼物。`
							: undefined
					}
					onPress={onRemove}
				>
					删除对话包
				</SectionDeleteButton>
			}
		>
			<EditorCollectionItemTitle>
				{item.displayName === item.pkg.name ? (
					<span title={item.displayName} className="min-w-0 truncate">
						{item.displayName}
					</span>
				) : (
					<Tooltip content={item.pkg.name}>
						<span
							title={item.displayName}
							className="min-w-0 truncate"
						>
							{item.displayName}
						</span>
					</Tooltip>
				)}
				{isDuplicate && <ErrorBadge>命名重复</ErrorBadge>}
				{hasPrefixWarning && <WarningBadge>前缀不规范</WarningBadge>}
			</EditorCollectionItemTitle>
			<EditorCollectionItemMeta>
				{item.pkg.dialogList.length}条对话
			</EditorCollectionItemMeta>
		</EditorCollectionItem>
	);
}

function TreeGroup({
	node,
	parentPath,
	depth,
	expandedGroups,
	onToggleGroup,
	selectedIndex,
	isNameDuplicate,
	isNamePrefixInvalid,
	onSelect,
	onRemove,
}: {
	node: TreeNode;
	parentPath: string;
	depth: number;
	expandedGroups: Set<string>;
	onToggleGroup: (path: string) => void;
	selectedIndex: number | null;
	isNameDuplicate: (name: string, index: number) => boolean;
	isNamePrefixInvalid: (name: string) => boolean;
	onSelect: (index: number) => void;
	onRemove: (index: number) => void;
}) {
	const sortedChildren = Array.from(node.children.entries()).sort(
		([a], [b]) => a.localeCompare(b)
	);

	return (
		<div className="ml-3 flex min-w-0 flex-col gap-1 border-l border-divider pl-2">
			{sortedChildren.map(([key, childNode]) => {
				const path = parentPath ? `${parentPath}/${key}` : key;
				const isExpanded = expandedGroups.has(path);
				const count = countTreeItems(childNode);

				return (
					<div key={key} className="flex flex-col gap-1">
						<GroupHeader
							label={key}
							count={count}
							expanded={isExpanded}
							stickyDepth={Math.min(depth + 1, 2)}
							onToggle={() => {
								onToggleGroup(path);

								const firstItem = childNode.items[0];

								if (
									!isExpanded &&
									depth > 0 &&
									firstItem &&
									selectedIndex === null
								) {
									onSelect(firstItem.index);
								}
							}}
						/>
						{isExpanded && (
							<TreeGroup
								node={childNode}
								parentPath={path}
								depth={depth + 1}
								expandedGroups={expandedGroups}
								onToggleGroup={onToggleGroup}
								selectedIndex={selectedIndex}
								isNameDuplicate={isNameDuplicate}
								isNamePrefixInvalid={isNamePrefixInvalid}
								onSelect={onSelect}
								onRemove={onRemove}
							/>
						)}
					</div>
				);
			})}

			{node.items.map((item) => (
				<DialogTreeItem
					key={item.index}
					item={item}
					isSelected={selectedIndex === item.index}
					isDuplicate={isNameDuplicate(item.pkg.name, item.index)}
					hasPrefixWarning={isNamePrefixInvalid(item.pkg.name)}
					onSelect={() => onSelect(item.index)}
					onRemove={() => onRemove(item.index)}
				/>
			))}
		</div>
	);
}

// ─── Main component ──────────────────────────────────────

interface DialogPackageListProps {
	packages: DialogPackage[];
	selectedIndex: number | null;
	onSelect: (index: number) => void;
	onAdd: () => void;
	onRemove: (index: number) => void;
}

export const DialogPackageList = memo<DialogPackageListProps>(
	function DialogPackageList({
		packages,
		selectedIndex,
		onSelect,
		onAdd,
		onRemove,
	}) {
		const packLabelPrefix = usePackLabelPrefix();
		const hasPrefix = Boolean(packLabelPrefix && packLabelPrefix !== '_');

		const { conforming, nonConforming } = useMemo(
			() => buildDialogTree(packages, packLabelPrefix),
			[packages, packLabelPrefix]
		);

		// 追踪已知的分组路径，只对新增分组自动展开
		const knownPathsRef = useRef<Set<string>>(new Set());

		const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
			() => new Set([CONFORMING_KEY, OTHER_KEY])
		);

		// 仅对真正新出现的分组自动展开，已有折叠状态不受影响
		useEffect(() => {
			const currentPaths = new Set([
				CONFORMING_KEY,
				OTHER_KEY,
				...collectAllGroupPaths(conforming, ''),
			]);

			const newPaths: string[] = [];
			for (const path of currentPaths) {
				if (!knownPathsRef.current.has(path) && !path.includes('/')) {
					newPaths.push(path);
				}
			}

			knownPathsRef.current = currentPaths;

			if (newPaths.length > 0) {
				setExpandedGroups((prev) => {
					const next = new Set(prev);
					for (const path of newPaths) {
						next.add(path);
					}
					return next;
				});
			}

			// 清理已不存在的分组路径，避免状态堆积
			setExpandedGroups((prev) => {
				let changed = false;
				const next = new Set<string>();
				for (const path of prev) {
					if (currentPaths.has(path)) {
						next.add(path);
					} else {
						changed = true;
					}
				}
				return changed ? next : prev;
			});
		}, [conforming]);

		// 选中条目时自动展开其所在分组
		useEffect(() => {
			if (selectedIndex === null) return;

			const paths = findItemGroupPaths(conforming, selectedIndex, '');
			if (paths && paths.length > 0) {
				setExpandedGroups((prev) => {
					const next = new Set(prev);
					next.add(CONFORMING_KEY);
					for (const path of paths) {
						next.add(path);
					}
					if (
						next.size !== prev.size ||
						[...next].some((p) => !prev.has(p))
					) {
						return next;
					}
					return prev;
				});
			} else if (
				nonConforming.some((item) => item.index === selectedIndex)
			) {
				setExpandedGroups((prev) => {
					if (prev.has(OTHER_KEY)) return prev;
					const next = new Set(prev);
					next.add(OTHER_KEY);
					return next;
				});
			}
		}, [selectedIndex, conforming, nonConforming]);

		const toggleGroup = useCallback((path: string) => {
			setExpandedGroups((prev) => {
				const next = new Set(prev);
				if (next.has(path)) {
					next.delete(path);
				} else {
					next.add(path);
				}
				return next;
			});
		}, []);

		const isNameDuplicate = useCallback(
			(name: string, index: number) => {
				return packages.some(
					(p, i) => i !== index && p.name === name && name.length > 0
				);
			},
			[packages]
		);

		const isNamePrefixInvalid = useCallback(
			(name: string) => {
				if (!packLabelPrefix || packLabelPrefix === '_') return false;
				return !name.startsWith(packLabelPrefix);
			},
			[packLabelPrefix]
		);

		const hasConforming =
			conforming.items.length > 0 || conforming.children.size > 0;
		const hasNonConforming = nonConforming.length > 0;

		return (
			<EditorCollectionPanel
				allowsStickyContent
				title="对话包列表"
				addLabel="新建对话包"
				emptyTitle="暂无对话包"
				hasItems={packages.length > 0}
				onAdd={onAdd}
			>
				<div className="flex min-w-0 flex-col gap-1">
					{hasPrefix ? (
						<>
							{/* 符合命名规范的分组树 */}
							{hasConforming && (
								<div className="flex flex-col gap-1">
									<GroupHeader
										label={packLabelPrefix}
										count={countTreeItems(conforming)}
										expanded={expandedGroups.has(
											CONFORMING_KEY
										)}
										onToggle={() =>
											toggleGroup(CONFORMING_KEY)
										}
										isTopLevel
										stickyDepth={0}
									/>
									{expandedGroups.has(CONFORMING_KEY) && (
										<TreeGroup
											node={conforming}
											parentPath=""
											depth={0}
											expandedGroups={expandedGroups}
											onToggleGroup={toggleGroup}
											selectedIndex={selectedIndex}
											isNameDuplicate={isNameDuplicate}
											isNamePrefixInvalid={
												isNamePrefixInvalid
											}
											onSelect={onSelect}
											onRemove={onRemove}
										/>
									)}
								</div>
							)}

							{/* 不符合命名规范的条目 */}
							{hasNonConforming && (
								<div className="flex flex-col gap-1">
									{hasConforming && (
										<div className="my-1 border-t border-divider" />
									)}
									<GroupHeader
										label="其他"
										count={nonConforming.length}
										expanded={expandedGroups.has(OTHER_KEY)}
										onToggle={() => toggleGroup(OTHER_KEY)}
										isTopLevel
										stickyDepth={0}
									/>
									{expandedGroups.has(OTHER_KEY) && (
										<div className="ml-3 flex min-w-0 flex-col gap-1 border-l border-divider pl-2">
											{nonConforming.map((item) => (
												<DialogTreeItem
													key={item.index}
													item={item}
													isSelected={
														selectedIndex ===
														item.index
													}
													isDuplicate={isNameDuplicate(
														item.pkg.name,
														item.index
													)}
													hasPrefixWarning={isNamePrefixInvalid(
														item.pkg.name
													)}
													onSelect={() =>
														onSelect(item.index)
													}
													onRemove={() =>
														onRemove(item.index)
													}
												/>
											))}
										</div>
									)}
								</div>
							)}
						</>
					) : (
						/* 无前缀时保持扁平列表 */
						<div className="flex min-w-0 flex-col gap-2">
							{packages.map((pkg, index) => (
								<DialogTreeItem
									key={index}
									item={{ pkg, index, displayName: pkg.name }}
									isSelected={selectedIndex === index}
									isDuplicate={isNameDuplicate(
										pkg.name,
										index
									)}
									hasPrefixWarning={isNamePrefixInvalid(
										pkg.name
									)}
									onSelect={() => onSelect(index)}
									onRemove={() => onRemove(index)}
								/>
							))}
						</div>
					)}
				</div>
			</EditorCollectionPanel>
		);
	}
);
