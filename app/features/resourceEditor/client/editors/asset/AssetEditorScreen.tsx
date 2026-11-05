'use client';

import { cn } from '@heroui/theme';
import { useCallback, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import { collectResourcePackAssetReferences } from '@/domain/resourcePack/assetReferences';

import {
	collectAssetFolders,
	getAssetParentFolder,
} from '@/features/resourceEditor/client/assets/assetPaths';
import type { IAssetPathOperation } from '@/features/resourceEditor/client/assets/contracts';
import { EditorCollapsiblePanel } from '@/features/resourceEditor/client/components/layout/EditorCollapsiblePanel';
import {
	EditorCollectionItem,
	EditorCollectionItemMeta,
	EditorCollectionItemTitle,
} from '@/features/resourceEditor/client/components/layout/EditorCollectionItem';
import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorPageNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { AssetFileManager } from './AssetFileManager';

const QUICK_FOLDERS = [
	{
		label: '全部资产',
		path: 'assets/',
		description: '资源包内assets/下的所有文件。',
	},
	{ label: 'CG', path: 'assets/CG/', description: '对话动作CG推荐目录。' },
	{ label: 'BG', path: 'assets/BG/', description: '对话动作BG推荐目录。' },
	{
		label: '音频',
		path: 'assets/Audio/',
		description: '对话动作Sound推荐目录，Mod目前仅支持.wav。',
	},
	{
		label: '自定义',
		path: 'assets/Custom/',
		description: '自由管理额外资源，按需要在JSON中引用。',
	},
] as const;

const ASSET_EDITOR_ENTITY_KINDS = ['asset'] as const;

export function AssetEditorScreen() {
	const {
		resourcePack: data,
		assets: {
			folders: assetFolders,
			generation: assetGeneration,
			urls: assetUrls,
		},
		updateAsset,
		updateAssets,
		removeAssets,
		createAssetFolder,
		removeAssetFolders,
		moveAssets,
		copyAssets,
	} = useResourceEditor();
	const [navigation, setNavigation] = useState(() => ({
		folder: 'assets/',
		generation: assetGeneration,
	}));
	const [isCollapsed, setIsCollapsed] = useState(false);
	const activeFolder =
		navigation.generation === assetGeneration
			? navigation.folder
			: 'assets/';
	const handleFolderChange = useCallback(
		(folder: string) =>
			setNavigation({ folder, generation: assetGeneration }),
		[assetGeneration]
	);
	const handleNavigationTarget = useCallback(
		(target: { stableKey: number | string }) => {
			if (typeof target.stableKey !== 'string') return false;
			const path = target.stableKey;
			const knownFolders = new Set([
				...collectAssetFolders(Object.keys(assetUrls)),
				...assetFolders,
			]);
			if (path.endsWith('/')) {
				if (!knownFolders.has(path)) return false;
				handleFolderChange(path);
			} else {
				if (!Object.hasOwn(assetUrls, path)) return false;
				handleFolderChange(getAssetParentFolder(path));
			}
			setIsCollapsed(true);
			return true;
		},
		[assetFolders, assetUrls, handleFolderChange]
	);
	useEditorPageNavigationIntent({
		entityKinds: ASSET_EDITOR_ENTITY_KINDS,
		onTarget: handleNavigationTarget,
	});

	const referencedPaths = useMemo(
		() => collectResourcePackAssetReferences(data),
		[data]
	);

	const handleMove = useCallback(
		(operations: IAssetPathOperation[]) => {
			moveAssets(operations);
		},
		[moveAssets]
	);

	const handleCopy = useCallback(
		(operations: IAssetPathOperation[]) => {
			copyAssets(operations);
		},
		[copyAssets]
	);

	return (
		<EditorWorkspace columns={4}>
			<EditorCollapsiblePanel
				isCollapsed={isCollapsed}
				onCollapsedChange={setIsCollapsed}
				title="资产目录"
			>
				<div className="flex min-h-0 flex-col gap-2">
					{QUICK_FOLDERS.map((folder) => (
						<EditorCollectionItem
							key={folder.path}
							isSelected={activeFolder === folder.path}
							onSelect={() => {
								handleFolderChange(folder.path);
								setIsCollapsed(true);
							}}
							className="shrink-0"
						>
							<EditorCollectionItemTitle>
								{folder.label}
							</EditorCollectionItemTitle>
							<EditorCollectionItemMeta>
								{folder.path}
							</EditorCollectionItemMeta>
							<p
								className={cn(
									TYPOGRAPHY_STYLES.compactDescription,
									'mt-1'
								)}
							>
								{folder.description}
							</p>
						</EditorCollectionItem>
					))}

					<div
						className={cn(
							TYPOGRAPHY_STYLES.compactDescription,
							'mt-4 shrink-0 rounded-medium border border-dashed border-divider bg-content2/20 p-3 text-justify'
						)}
					>
						<p>
							此页按资源包内真实路径管理文件。复制、移动、删除会直接修改导出的ZIP内容，移动时会同步更新ResourceEx.json中的资产引用。
						</p>
						<p className="mt-2">
							导出会保留导入压缩包中的任意文件，包括
							<code className="rounded-small bg-default/40 px-1 font-mono">
								assets/
							</code>
							外的额外内容。
						</p>
					</div>
				</div>
			</EditorCollapsiblePanel>

			<section className="lg:col-span-3">
				<AssetFileManager
					key={assetGeneration}
					assetUrls={assetUrls}
					assetFolders={assetFolders}
					packLabel={data.packInfo?.label}
					root="assets/"
					initialFolder={activeFolder}
					onUpload={updateAsset}
					onUploadMany={updateAssets}
					onRemove={removeAssets}
					onCreateFolder={createAssetFolder}
					onRemoveFolders={removeAssetFolders}
					onMove={handleMove}
					onCopy={handleCopy}
					onFolderChange={handleFolderChange}
					referencedPaths={referencedPaths}
				/>
			</section>
		</EditorWorkspace>
	);
}
