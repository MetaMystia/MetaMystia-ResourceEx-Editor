'use client';

import { memo, useCallback } from 'react';

import { CoordinatedModal } from '@/features/overlays/client';
import type { IAssetPathOperation } from '@/features/resourceEditor/client/assets/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { AssetFileManager } from './AssetFileManager';

interface AssetPickerDialogProps {
	open: boolean;
	onClose: () => void;
	onSelect: (path: string) => void;
	initialFolder: string;
	acceptedFileTypes?: string;
	isFileAccepted?: (path: string) => boolean;
}

/**
 * 资产选择弹窗。用 `AssetFileManager` 的 select 模式让用户浏览并选择一个资产文件。
 *
 * - 打开后显示指定目录（如 `assets/CG/`）的文件管理器视图
 * - 支持上传文件/目录和新建文件夹，方便在选文件前就地添加缺失资产
 * - 用户单击高亮后点「确定选择」按钮、双击文件、或点击悬停时的「选择」按钮均可完成选择
 * - 隐藏删除/移动/复制等破坏性操作
 */
export const AssetPickerDialog = memo<AssetPickerDialogProps>(
	function AssetPickerDialog({
		acceptedFileTypes,
		initialFolder,
		isFileAccepted,
		onClose,
		onSelect,
		open,
	}) {
		const {
			resourcePack,
			assets: {
				folders: assetFolders,
				generation: assetGeneration,
				urls: assetUrls,
			},
			updateAsset,
			updateAssets,
			createAssetFolder,
		} = useResourceEditor();
		const packLabel = resourcePack.packInfo.label;

		const handleSelect = useCallback(
			(path: string) => {
				onSelect(path);
				onClose();
			},
			[onSelect, onClose]
		);

		// 隐藏的破坏性操作传空函数满足类型签名
		const noopRemove = useCallback((_paths: string[]) => {}, []);
		const noopAssetOps = useCallback(
			(_operations: IAssetPathOperation[]) => {},
			[]
		);

		return (
			<CoordinatedModal
				coordination={{ id: 'asset.picker' }}
				isOpen={open}
				onClose={onClose}
				size="4xl"
				classNames={{ content: 'min-h-[50dvh]' }}
			>
				<div className="flex flex-col gap-0">
					<AssetFileManager
						key={assetGeneration}
						selectionMode="select"
						assetUrls={assetUrls}
						assetFolders={assetFolders}
						packLabel={packLabel}
						root="assets/"
						initialFolder={initialFolder}
						onUpload={updateAsset}
						onUploadMany={updateAssets}
						onRemove={noopRemove}
						onCreateFolder={createAssetFolder}
						onMove={noopAssetOps}
						onCopy={noopAssetOps}
						onSelectFile={handleSelect}
						{...(acceptedFileTypes === undefined
							? {}
							: { acceptedFileTypes })}
						{...(isFileAccepted === undefined
							? {}
							: { isFileAccepted })}
					/>
				</div>
			</CoordinatedModal>
		);
	}
);
