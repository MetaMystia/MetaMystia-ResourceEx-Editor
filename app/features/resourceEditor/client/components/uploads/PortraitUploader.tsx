'use client';

import { cn } from '@heroui/theme';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import type { IAssetMutationResult } from '@/features/resourceEditor/client/assets/contracts';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { readImageDimensions } from '@/infrastructure/browser/images/readImageDimensions';

interface IProps {
	spritePath: string;
	onUpload: (file: File) => IAssetMutationResult;
	width?: number;
	height?: number;
	className?: string;
}

export function PortraitUploader({
	className,
	height = 359,
	onUpload,
	spritePath,
	width = 256,
}: IProps) {
	const {
		assets: { generation: assetGeneration },
		getAssetUrl,
		isAssetGenerationCurrent,
	} = useResourceEditor();
	const [warning, setWarning] = useState('');
	const activeReadControllerRef = useRef<AbortController | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isMountedRef = useRef(false);
	const onUploadRef = useRef(onUpload);
	const operationIdRef = useRef(0);
	const spritePathRef = useRef(spritePath);
	onUploadRef.current = onUpload;
	spritePathRef.current = spritePath;
	const assetUrl = getAssetUrl(spritePath);

	const invalidateOperation = useCallback(() => {
		operationIdRef.current += 1;
		activeReadControllerRef.current?.abort();
		activeReadControllerRef.current = null;
	}, []);

	const isOperationActive = useCallback(
		(
			operationId: number,
			operationSpritePath: string,
			operationAssetGeneration: number
		) =>
			isMountedRef.current &&
			operationIdRef.current === operationId &&
			isAssetGenerationCurrent(operationAssetGeneration) &&
			spritePathRef.current === operationSpritePath,
		[isAssetGenerationCurrent]
	);

	const handleFile = useCallback(
		async (file: File | undefined) => {
			if (!file) return;
			invalidateOperation();
			if (file.type !== 'image/png') {
				setWarning('请选择PNG格式的立绘文件。');
				return;
			}
			const operationId = operationIdRef.current;
			const operationAssetGeneration = assetGeneration;
			const operationSpritePath = spritePath;
			const readController = new AbortController();
			activeReadControllerRef.current = readController;
			setWarning('');
			try {
				const dimensions = await readImageDimensions(
					file,
					readController.signal
				);
				if (
					!isOperationActive(
						operationId,
						operationSpritePath,
						operationAssetGeneration
					)
				)
					return;
				const result = onUploadRef.current(file);
				if (!result.isSuccess) {
					setWarning(result.error ?? '无法更新立绘资产。');
					return;
				}
				setWarning(
					dimensions.width === width && dimensions.height === height
						? ''
						: `当前尺寸${dimensions.width}×${dimensions.height}，期望${width}×${height}。`
				);
			} catch {
				if (
					isOperationActive(
						operationId,
						operationSpritePath,
						operationAssetGeneration
					)
				) {
					setWarning('无法读取图片尺寸。');
				}
			} finally {
				if (activeReadControllerRef.current === readController) {
					activeReadControllerRef.current = null;
				}
			}
		},
		[
			assetGeneration,
			height,
			invalidateOperation,
			isOperationActive,
			spritePath,
			width,
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
		setWarning('');
	}, [assetGeneration, invalidateOperation, spritePath]);

	return (
		<div
			className={cn('flex w-full flex-col gap-1', className)}
			style={{ maxWidth: `${width}px` }}
		>
			<div className="flex min-w-0 flex-col gap-1">
				<p className={TYPOGRAPHY_STYLES.compactLabel}>立绘预览</p>
				{warning && (
					<p
						className={cn(
							TYPOGRAPHY_STYLES.caption,
							'text-warning-700 dark:text-warning-600'
						)}
						role="status"
					>
						{warning}
					</p>
				)}
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/png"
				className="hidden"
				id={`upload-portrait-${spritePath}`}
				onChange={(event) => {
					void handleFile(event.target.files?.[0]);
					event.target.value = '';
				}}
			/>
			<div
				className={cn(
					'bg-checkerboard relative flex w-full flex-col items-center justify-center overflow-hidden rounded-medium border-2 border-dashed transition-colors hover:border-primary/50 motion-reduce:transition-none',
					warning ? 'border-warning/50' : 'border-divider'
				)}
				style={{ aspectRatio: `${width} / ${height}` }}
				onDragOver={(event) => event.preventDefault()}
				onDrop={(event) => {
					event.preventDefault();
					const file = event.dataTransfer.files?.[0];
					if (file) void handleFile(file);
				}}
			>
				{assetUrl ? (
					<>
						<img
							src={assetUrl}
							className="image-rendering-pixelated h-full w-full object-contain"
							alt="立绘预览"
						/>
						<Button
							size="sm"
							variant="flat"
							color="primary"
							className="absolute bottom-3"
							onPress={() => fileInputRef.current?.click()}
						>
							更换立绘
						</Button>
					</>
				) : (
					<div className="flex flex-col items-center gap-3 text-center">
						<p className={TYPOGRAPHY_STYLES.compactItemTitle}>
							暂无立绘
						</p>
						<p className={TYPOGRAPHY_STYLES.caption}>
							{width}×{height}
						</p>
						<Button
							size="sm"
							variant="flat"
							color="primary"
							onPress={() => fileInputRef.current?.click()}
						>
							选择立绘
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
