import { cn } from '@heroui/theme';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import type { IAssetMutationResult } from '@/features/resourceEditor/client/assets/contracts';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { readImageDimensions } from '@/infrastructure/browser/images/readImageDimensions';

interface SpriteGridProps {
	label: string;
	tip: string;
	cols: number;
	prefix: string;
	paths: string[];
	basePath: string;
	onUpload: (index: number, path: string, file: File) => IAssetMutationResult;
}

export const SpriteGrid = memo<SpriteGridProps>(function SpriteGrid({
	label,
	tip,
	cols,
	prefix,
	paths,
	basePath,
	onUpload,
}) {
	const {
		assets: { generation: assetGeneration },
		getAssetUrl,
		isAssetGenerationCurrent,
	} = useResourceEditor();
	const [uploadError, setUploadError] = useState<string | null>(null);
	const activeReadControllersRef = useRef(new Map<number, AbortController>());
	const basePathRef = useRef(basePath);
	const isMountedRef = useRef(false);
	const onUploadRef = useRef(onUpload);
	basePathRef.current = basePath;
	onUploadRef.current = onUpload;

	const invalidateUploads = useCallback(() => {
		activeReadControllersRef.current.forEach((controller) =>
			controller.abort()
		);
		activeReadControllersRef.current.clear();
	}, []);

	const isUploadActive = useCallback(
		(
			index: number,
			controller: AbortController,
			operationAssetGeneration: number,
			operationBasePath: string
		) =>
			isMountedRef.current &&
			activeReadControllersRef.current.get(index) === controller &&
			isAssetGenerationCurrent(operationAssetGeneration) &&
			basePathRef.current === operationBasePath,
		[isAssetGenerationCurrent]
	);

	const handleUpload = useCallback(
		async (index: number, file: File) => {
			activeReadControllersRef.current.get(index)?.abort();
			if (file.type !== 'image/png') {
				activeReadControllersRef.current.delete(index);
				setUploadError('请选择PNG格式的衣服小人贴图。');
				return;
			}
			const operationAssetGeneration = assetGeneration;
			const operationBasePath = basePath;
			const readController = new AbortController();
			activeReadControllersRef.current.set(index, readController);
			setUploadError(null);
			let dimensions;
			try {
				dimensions = await readImageDimensions(
					file,
					readController.signal
				);
			} catch {
				if (
					isUploadActive(
						index,
						readController,
						operationAssetGeneration,
						operationBasePath
					)
				) {
					setUploadError('无法读取衣服小人贴图尺寸。');
					activeReadControllersRef.current.delete(index);
				}
				return;
			}
			if (
				!isUploadActive(
					index,
					readController,
					operationAssetGeneration,
					operationBasePath
				)
			)
				return;
			if (dimensions.width !== 64 || dimensions.height !== 64) {
				setUploadError(
					`错误：衣服小人贴图尺寸必须为64×64，当前为${dimensions.width}×${dimensions.height}。`
				);
				activeReadControllersRef.current.delete(index);
				return;
			}
			setUploadError(null);

			const row = Math.floor(index / cols);
			const col = index % cols;
			const filename = `${prefix}_${row}, ${col}.png`;
			const path = `${operationBasePath}/${filename}`;
			const result = onUploadRef.current(index, path, file);
			if (!result.isSuccess) {
				setUploadError(result.error ?? '无法更新衣服小人贴图。');
			}
			if (
				activeReadControllersRef.current.get(index) === readController
			) {
				activeReadControllersRef.current.delete(index);
			}
		},
		[assetGeneration, basePath, cols, isUploadActive, prefix]
	);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			invalidateUploads();
		};
	}, [invalidateUploads]);

	useEffect(() => {
		invalidateUploads();
		setUploadError(null);
	}, [assetGeneration, basePath, invalidateUploads]);

	return (
		<div className="flex flex-col gap-4">
			<Label tip={tip} wrapperClassName="ml-1">
				{label}
			</Label>
			{uploadError !== null && (
				<WarningNotice>{uploadError}</WarningNotice>
			)}
			<div
				className="grid gap-3"
				style={{
					gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
				}}
			>
				{paths.map((path, i) => (
					<div
						key={i}
						className="group relative flex flex-col gap-2 rounded-medium border border-divider bg-content1/50 p-2 transition-colors hover:bg-default/30"
					>
						<label
							className="bg-checkerboard relative aspect-square cursor-pointer overflow-hidden rounded-medium border border-divider transition-colors hover:border-primary/50"
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								const file = e.dataTransfer.files?.[0];
								if (file) void handleUpload(i, file);
							}}
						>
							<span
								className={cn(
									TYPOGRAPHY_STYLES.microLabel,
									'absolute left-1 top-1 z-10 rounded-small bg-content1/80 px-1 text-foreground-700'
								)}
							>
								{i}
							</span>
							{getAssetUrl(path) ? (
								<img
									src={getAssetUrl(path)}
									className="image-rendering-pixelated h-full w-full object-contain"
									alt=""
								/>
							) : (
								<div className="flex h-full w-full flex-col items-center justify-center text-foreground-500">
									<span
										className={
											TYPOGRAPHY_STYLES.compactInteractiveLabel
										}
									>
										上传
									</span>
								</div>
							)}
							<div className="absolute inset-0 flex items-center justify-center bg-background/75 opacity-0 transition-opacity group-hover:opacity-100">
								<span
									className={TYPOGRAPHY_STYLES.compactTitle}
								>
									更换
								</span>
							</div>
							<input
								type="file"
								accept="image/png"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) void handleUpload(i, file);
									e.target.value = '';
								}}
							/>
						</label>
						<p
							title={path.split('/').pop()}
							className={cn(
								TYPOGRAPHY_STYLES.caption,
								'truncate text-center'
							)}
						>
							{path.split('/').pop()}
						</p>
					</div>
				))}
			</div>
		</div>
	);
});
