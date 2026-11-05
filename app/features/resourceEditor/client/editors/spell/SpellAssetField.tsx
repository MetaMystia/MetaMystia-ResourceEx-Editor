'use client';

import { useState } from 'react';

import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';

import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';

import { AssetPickerDialog } from '@/features/resourceEditor/client/editors/asset/AssetPickerDialog';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface IProps {
	label: string;
	path: string;
	isImage?: boolean;
	onChange(path: string): void;
}

export function SpellAssetField({
	label,
	path,
	isImage = false,
	onChange,
}: IProps) {
	const [isOpen, setIsOpen] = useState(false);
	const { getAssetUrl, resourcePack } = useResourceEditor();
	const localPath = resolveDayMapAssetPath(path, resourcePack.packInfo.label);
	const url = localPath === null ? undefined : getAssetUrl(localPath);
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Input label={label} value={path} onValueChange={onChange} />
			<Button variant="flat" onPress={() => setIsOpen(true)}>
				选择或上传{isImage ? '图片' : '文件'}
			</Button>
			{isImage && url && (
				<img
					src={url}
					alt={label}
					className="bg-checkerboard max-h-80 max-w-full rounded-medium object-contain"
				/>
			)}
			{isImage && path && !url && (
				<p className="text-sm text-warning-700 dark:text-warning">
					图片未在本包中找到，外部包图片需在游戏中核验。
				</p>
			)}
			<AssetPickerDialog
				open={isOpen}
				onClose={() => setIsOpen(false)}
				onSelect={onChange}
				initialFolder={
					localPath?.includes('/')
						? localPath.slice(0, localPath.lastIndexOf('/') + 1)
						: 'assets/'
				}
				{...(isImage
					? {
							acceptedFileTypes: '.png',
							isFileAccepted: (value: string) =>
								value.toLowerCase().endsWith('.png'),
						}
					: {})}
			/>
		</div>
	);
}
