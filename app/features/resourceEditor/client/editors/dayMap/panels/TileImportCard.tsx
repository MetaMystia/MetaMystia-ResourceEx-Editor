'use client';

import { cn } from '@heroui/theme';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Switch from '@/design/ui/components/switch';

import { AssetPickerDialog } from '@/features/resourceEditor/client/editors/asset/AssetPickerDialog';
import {
	type ITileImportSettings,
	planTileSlices,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEdits';
import {
	MapHint,
	MapNumber,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	CloseIcon,
	ImageIcon,
	UploadIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import {
	type IImageSize,
	loadMapImage,
} from '@/features/resourceEditor/client/editors/dayMap/tileImages';

type TImportSource =
	| { file: File; kind: 'file'; url: string }
	| { kind: 'asset'; path: string; url: string };

interface IProps {
	assetUrls: Readonly<Record<string, string>>;
	existingTileCount: number;
	initialFile: File | null;
	isImporting: boolean;
	onCancel(): void;
	onImport(source: File | string, settings: ITileImportSettings): void;
}

const PREVIEW_MAX_HEIGHT_PX = 220;

export function TileImportCard({
	assetUrls,
	existingTileCount,
	initialFile,
	isImporting,
	onCancel,
	onImport,
}: IProps) {
	const [source, setSource] = useState<TImportSource | null>(null);
	const [imageSize, setImageSize] = useState<IImageSize | null>(null);
	const [loadError, setLoadError] = useState('');
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const [settings, setSettings] = useState<ITileImportSettings>({
		height: 48,
		isWholeImage: false,
		pixelsPerUnit: 48,
		width: 48,
	});
	const inputRef = useRef<HTMLInputElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const objectUrlRef = useRef<string | null>(null);

	function replaceSource(next: TImportSource) {
		if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		objectUrlRef.current = next.kind === 'file' ? next.url : null;
		setSource(next);
	}

	function acceptFile(file: File) {
		replaceSource({ file, kind: 'file', url: URL.createObjectURL(file) });
	}

	useEffect(() => {
		if (initialFile) acceptFile(initialFile);
		// 只在打开卡片或拖入新文件时接收文件。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialFile]);

	useEffect(
		() => () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		},
		[]
	);

	useEffect(() => {
		setImageSize(null);
		setLoadError('');
		if (!source) return;
		let isActive = true;
		loadMapImage(source.url).then(
			(image) => {
				if (isActive)
					setImageSize({
						height: image.naturalHeight,
						width: image.naturalWidth,
					});
			},
			() => {
				if (isActive) setLoadError('图片无法解码，请选择有效的 PNG。');
			}
		);
		return () => {
			isActive = false;
		};
	}, [source]);

	const plan = useMemo(
		() =>
			imageSize
				? planTileSlices(
						imageSize.width,
						imageSize.height,
						settings,
						existingTileCount
					)
				: null,
		[existingTileCount, imageSize, settings]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		const frame = frameRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !frame || !context || !source || !imageSize) return;
		let isActive = true;
		void loadMapImage(source.url).then((image) => {
			if (!isActive) return;
			const width = frame.clientWidth;
			const scale = Math.min(
				width / imageSize.width,
				PREVIEW_MAX_HEIGHT_PX / imageSize.height,
				8
			);
			const displayWidth = imageSize.width * scale;
			const displayHeight = imageSize.height * scale;
			const ratio = window.devicePixelRatio || 1;
			canvas.width = Math.round(displayWidth * ratio);
			canvas.height = Math.round(displayHeight * ratio);
			canvas.style.width = `${displayWidth}px`;
			canvas.style.height = `${displayHeight}px`;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.imageSmoothingEnabled = scale < 1;
			context.clearRect(0, 0, displayWidth, displayHeight);
			context.drawImage(image, 0, 0, displayWidth, displayHeight);
			if (plan && !plan.error && !settings.isWholeImage) {
				const stepX = plan.tileWidth * scale;
				const stepY = plan.tileHeight * scale;
				if (stepX >= 3 && stepY >= 3) {
					context.strokeStyle = 'rgba(250, 204, 21, 0.85)';
					context.lineWidth = 1;
					context.beginPath();
					for (let x = stepX; x < displayWidth - 0.5; x += stepX) {
						context.moveTo(Math.round(x) + 0.5, 0);
						context.lineTo(Math.round(x) + 0.5, displayHeight);
					}
					for (let y = stepY; y < displayHeight - 0.5; y += stepY) {
						context.moveTo(0, Math.round(y) + 0.5);
						context.lineTo(displayWidth, Math.round(y) + 0.5);
					}
					context.stroke();
				}
			}
			context.strokeStyle = 'rgba(250, 204, 21, 0.95)';
			context.strokeRect(0.5, 0.5, displayWidth - 1, displayHeight - 1);
		});
		return () => {
			isActive = false;
		};
	}, [imageSize, plan, settings.isWholeImage, source]);

	const sliceCount = plan && !plan.error ? plan.columns * plan.rows : 0;
	const fileName =
		source?.kind === 'file'
			? source.file.name
			: source?.kind === 'asset'
				? source.path
				: '';

	return (
		<section
			aria-label="导入图片"
			className="flex flex-col gap-3 rounded-medium border border-primary/40 bg-primary/5 p-3"
		>
			<div className="flex items-center justify-between gap-2">
				<p className={TYPOGRAPHY_STYLES.subsectionTitle}>
					导入图片到瓦片库
				</p>
				<Button
					isIconOnly
					size="sm"
					variant="light"
					aria-label="关闭导入"
					className="h-7 w-7 min-w-7"
					onPress={onCancel}
				>
					<CloseIcon />
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button
					size="sm"
					variant="flat"
					startContent={<UploadIcon className="size-4" />}
					onPress={() => inputRef.current?.click()}
				>
					选择 PNG
				</Button>
				<Button
					size="sm"
					variant="flat"
					startContent={<ImageIcon className="size-4" />}
					onPress={() => setIsPickerOpen(true)}
				>
					从资产选择
				</Button>
				<input
					ref={inputRef}
					hidden
					type="file"
					accept=".png,image/png"
					aria-label="选择地图 PNG"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) acceptFile(file);
					}}
				/>
			</div>
			<div
				ref={frameRef}
				className={cn(
					'bg-checkerboard flex min-h-24 items-center justify-center overflow-hidden rounded-medium border border-divider',
					!source && 'border-dashed'
				)}
			>
				{source && imageSize ? (
					<canvas
						ref={canvasRef}
						aria-label={`${fileName} 切分预览`}
					/>
				) : (
					<MapHint className="px-4 py-6 text-center">
						{loadError ||
							(source
								? '正在读取图片…'
								: '选择 PNG，或把文件拖到画布上。')}
					</MapHint>
				)}
			</div>
			{source && imageSize && (
				<p className={cn(TYPOGRAPHY_STYLES.metadata, 'break-all')}>
					{fileName} · {imageSize.width}×{imageSize.height}
				</p>
			)}
			<Switch
				size="sm"
				isSelected={settings.isWholeImage}
				onValueChange={(isWholeImage) =>
					setSettings({ ...settings, isWholeImage })
				}
			>
				<span className={TYPOGRAPHY_STYLES.controlLabel}>
					整张图片作为一个切片
				</span>
			</Switch>
			<div className="grid grid-cols-3 gap-2">
				<MapNumber
					label="切片宽"
					value={settings.width}
					min={1}
					step={1}
					isDisabled={settings.isWholeImage}
					endContent={
						<span className="text-[10px] text-foreground-400">
							px
						</span>
					}
					onChange={(width) => setSettings({ ...settings, width })}
				/>
				<MapNumber
					label="切片高"
					value={settings.height}
					min={1}
					step={1}
					isDisabled={settings.isWholeImage}
					endContent={
						<span className="text-[10px] text-foreground-400">
							px
						</span>
					}
					onChange={(height) => setSettings({ ...settings, height })}
				/>
				<MapNumber
					label="每格像素"
					value={settings.pixelsPerUnit}
					min={0.01}
					step={0.1}
					onChange={(pixelsPerUnit) =>
						setSettings({ ...settings, pixelsPerUnit })
					}
				/>
			</div>
			{plan?.error ? (
				<p role="alert" className="text-xs text-danger">
					{plan.error}
				</p>
			) : plan ? (
				<MapHint>
					将生成 {sliceCount} 块（{plan.columns} 列 × {plan.rows}{' '}
					行），每块 {plan.tileWidth}×{plan.tileHeight}{' '}
					像素，在地图上占{' '}
					{Number(
						(plan.tileWidth / settings.pixelsPerUnit).toFixed(3)
					)}
					×
					{Number(
						(plan.tileHeight / settings.pixelsPerUnit).toFixed(3)
					)}{' '}
					格。
				</MapHint>
			) : (
				<MapHint>
					默认 48×48 像素为一格；切片按图片从左到右、从上到下编号。
				</MapHint>
			)}
			<div className="flex justify-end gap-2">
				<Button size="sm" variant="light" onPress={onCancel}>
					取消
				</Button>
				<Button
					size="sm"
					color="primary"
					variant="flat"
					isLoading={isImporting}
					isDisabled={!source || !plan || plan.error !== null}
					onPress={() => {
						if (!source) return;
						onImport(
							source.kind === 'file' ? source.file : source.path,
							settings
						);
					}}
				>
					{sliceCount > 0 ? `导入 ${sliceCount} 块` : '导入'}
				</Button>
			</div>
			<AssetPickerDialog
				open={isPickerOpen}
				onClose={() => setIsPickerOpen(false)}
				onSelect={(path) => {
					const url = assetUrls[path];
					if (url) replaceSource({ kind: 'asset', path, url });
				}}
				initialFolder="assets/"
				acceptedFileTypes=".png"
				isFileAccepted={(path) => path.toLowerCase().endsWith('.png')}
			/>
		</section>
	);
}
