'use client';

import { cn } from '@heroui/theme';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import type { IAssetMutationResult } from '@/features/resourceEditor/client/assets/contracts';
import { ConfirmDialog } from '@/features/resourceEditor/client/components/confirm/ConfirmDialog';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { readImageDimensions } from '@/infrastructure/browser/images/readImageDimensions';

interface IProps {
	spriteUrl: string | null;
	spritePath: string;
	recommendedSize?: { width: number; height: number };
	onUpload: (blob: Blob) => IAssetMutationResult;
	className?: string;
}

interface IPendingUpload {
	actualSize: { width: number; height: number };
	assetGeneration: number;
	file: File;
	operationId: number;
	onUpload: (blob: Blob) => IAssetMutationResult;
	recommendedSize: { width: number; height: number };
	spritePath: string;
}

export const SpriteUploader = memo<IProps>(function SpriteUploader({
	className,
	onUpload,
	recommendedSize = { width: 26, height: 26 },
	spritePath,
	spriteUrl,
}) {
	const {
		assets: { generation: assetGeneration },
		isAssetGenerationCurrent,
	} = useResourceEditor();
	const [error, setError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const [pendingUpload, setPendingUpload] = useState<IPendingUpload | null>(
		null
	);
	const activeReadControllerRef = useRef<AbortController | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isMountedRef = useRef(false);
	const operationIdRef = useRef(0);
	const spritePathRef = useRef(spritePath);
	spritePathRef.current = spritePath;

	const isOperationActive = useCallback(
		(operation: IPendingUpload) => {
			return (
				isMountedRef.current &&
				operationIdRef.current === operation.operationId &&
				isAssetGenerationCurrent(operation.assetGeneration) &&
				spritePathRef.current === operation.spritePath
			);
		},
		[isAssetGenerationCurrent]
	);

	const invalidateOperation = useCallback(() => {
		operationIdRef.current += 1;
		activeReadControllerRef.current?.abort();
		activeReadControllerRef.current = null;
	}, []);

	const uploadFile = useCallback(
		async (operation: IPendingUpload) => {
			try {
				const arrayBuffer = await operation.file.arrayBuffer();
				if (!isOperationActive(operation)) return;
				const blob = new Blob([arrayBuffer], {
					type: operation.file.type,
				});
				if (!isOperationActive(operation)) return;
				const result = operation.onUpload(blob);
				if (!result.isSuccess) {
					setError(result.error ?? '无法更新贴图资产。');
				}
			} catch {
				if (isOperationActive(operation)) {
					setError('无法读取图片文件，请选择有效的图片。');
				}
			}
		},
		[isOperationActive]
	);

	const processFile = useCallback(
		async (file: File) => {
			invalidateOperation();
			if (file.type !== 'image/png') {
				setError('请选择PNG格式的贴图文件。');
				setPendingUpload(null);
				return;
			}
			const operationId = operationIdRef.current;
			const readController = new AbortController();
			const operation: IPendingUpload = {
				actualSize: { height: 0, width: 0 },
				assetGeneration,
				file,
				onUpload,
				operationId,
				recommendedSize: { ...recommendedSize },
				spritePath,
			};
			activeReadControllerRef.current = readController;
			setError('');
			setPendingUpload(null);
			try {
				const dimensions = await readImageDimensions(
					file,
					readController.signal
				);
				if (!isOperationActive(operation)) return;
				if (
					dimensions.width !== recommendedSize.width ||
					dimensions.height !== recommendedSize.height
				) {
					setPendingUpload({ ...operation, actualSize: dimensions });
					return;
				}
				await uploadFile(operation);
			} catch {
				if (isOperationActive(operation)) {
					setError('无法读取图片尺寸，请选择有效的图片文件。');
				}
			} finally {
				if (activeReadControllerRef.current === readController) {
					activeReadControllerRef.current = null;
				}
			}
		},
		[
			assetGeneration,
			invalidateOperation,
			isOperationActive,
			onUpload,
			recommendedSize,
			spritePath,
			uploadFile,
		]
	);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			invalidateOperation();
		};
	}, [invalidateOperation]);

	useEffect(() => {
		invalidateOperation();
		setError('');
		setPendingUpload(null);
	}, [assetGeneration, invalidateOperation, spritePath]);

	const visiblePendingUpload =
		pendingUpload?.assetGeneration === assetGeneration &&
		pendingUpload.spritePath === spritePath
			? pendingUpload
			: null;

	return (
		<>
			<div className={cn('flex flex-col gap-4 md:flex-row', className)}>
				<div className="flex flex-col gap-2">
					<div
						onDrop={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setIsDragging(false);
							const file = event.dataTransfer.files?.[0];
							if (file) void processFile(file);
						}}
						onDragOver={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setIsDragging(true);
						}}
						onDragLeave={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setIsDragging(false);
						}}
						className={cn(
							'bg-checkerboard relative flex h-32 w-32 shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-medium border-2 border-dashed transition-colors motion-reduce:transition-none',
							isDragging
								? 'border-primary bg-primary/10'
								: spriteUrl
									? 'border-primary/30 hover:border-primary/50'
									: 'border-divider hover:border-foreground/30'
						)}
					>
						{spriteUrl ? (
							<img
								src={spriteUrl}
								alt="贴图预览"
								className="image-rendering-pixelated h-16 w-16 object-contain"
								draggable={false}
							/>
						) : (
							<p className={TYPOGRAPHY_STYLES.compactLabel}>
								暂无贴图
							</p>
						)}
						<Button
							size="sm"
							variant="flat"
							color="primary"
							onPress={() => fileInputRef.current?.click()}
						>
							{spriteUrl ? '更换贴图' : '选择贴图'}
						</Button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void processFile(file);
								event.target.value = '';
							}}
						/>
					</div>
					{error && <WarningNotice>{error}</WarningNotice>}
				</div>
				<div className="flex min-w-0 flex-col justify-end gap-1 pb-1">
					<p className={TYPOGRAPHY_STYLES.compactLabel}>
						{`贴图建议尺寸：${recommendedSize.width}×${recommendedSize.height}像素`}
					</p>
					<p className={TYPOGRAPHY_STYLES.metadata}>
						资产路径：{spritePath}
					</p>
				</div>
			</div>
			<ConfirmDialog
				coordinationId="sprite.size-confirm"
				isOpen={visiblePendingUpload !== null}
				title="图片尺寸与建议尺寸不一致"
				description={
					visiblePendingUpload === null
						? undefined
						: `当前图片尺寸为${visiblePendingUpload.actualSize.width}×${visiblePendingUpload.actualSize.height}，建议尺寸为${visiblePendingUpload.recommendedSize.width}×${visiblePendingUpload.recommendedSize.height}像素。是否继续上传？`
				}
				color="warning"
				confirmLabel="继续上传"
				onCancel={() => {
					invalidateOperation();
					setPendingUpload(null);
				}}
				onConfirm={() => {
					const operation = visiblePendingUpload;
					setPendingUpload(null);
					if (operation && isOperationActive(operation)) {
						void uploadFile(operation);
					}
				}}
			/>
		</>
	);
});
