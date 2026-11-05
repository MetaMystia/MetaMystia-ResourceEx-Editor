'use client';

import { cn } from '@heroui/theme';
import {
	type InputHTMLAttributes,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Switch from '@/design/ui/components/switch';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';

import { ComparisonFileMetadata } from './BinaryComparisonDetail';

interface IProps {
	isReferenceOnly?: boolean;
	leftUrl?: string;
	node: IAssetComparisonNode;
	rightUrl?: string;
}

interface IImageDimensions {
	height: number;
	width: number;
}

type TImageComparisonMode = 'side-by-side' | 'slider';
type TImageZoom = 'fit' | number;

interface IImageViewportAnchor {
	x: number;
	y: number;
}

interface IImageViewportDrag {
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startScrollLeft: number;
	startScrollTop: number;
}

const RANGE_CLASS_NAME =
	'absolute -left-1.5 top-0 h-3 w-[calc(100%+0.75rem)] cursor-pointer appearance-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-content1 disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary';
const RANGE_LABEL_CLASS_NAME = cn(
	TYPOGRAPHY_STYLES.compactDescription,
	'shrink-0 whitespace-nowrap tabular-nums'
);
const RANGE_ROW_CLASS_NAME = 'flex flex-col gap-2';
const SCROLLABLE_IMAGE_CLASS_NAME =
	'overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

type TImageComparisonRangeProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	'className' | 'type'
>;

function ImageComparisonRange(props: TImageComparisonRangeProps) {
	return (
		<div className="relative h-3">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-default-200"
			/>
			<input {...props} type="range" className={RANGE_CLASS_NAME} />
		</div>
	);
}

function PannableImageViewport({
	ariaLabel,
	children,
	className,
	isPanEnabled,
	viewKey,
}: {
	ariaLabel: string;
	children: ReactNode;
	className: string;
	isPanEnabled: boolean;
	viewKey: string;
}) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const anchorRef = useRef<IImageViewportAnchor>({ x: 0.5, y: 0.5 });
	const dragRef = useRef<IImageViewportDrag | null>(null);

	const updateAnchor = useCallback(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		anchorRef.current = {
			x:
				(viewport.scrollLeft + viewport.clientWidth / 2) /
				Math.max(viewport.scrollWidth, 1),
			y:
				(viewport.scrollTop + viewport.clientHeight / 2) /
				Math.max(viewport.scrollHeight, 1),
		};
	}, []);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		if (!isPanEnabled) {
			anchorRef.current = { x: 0.5, y: 0.5 };
			viewport.scrollLeft = 0;
			viewport.scrollTop = 0;
			return;
		}
		viewport.scrollLeft =
			viewport.scrollWidth * anchorRef.current.x -
			viewport.clientWidth / 2;
		viewport.scrollTop =
			viewport.scrollHeight * anchorRef.current.y -
			viewport.clientHeight / 2;
		updateAnchor();
	}, [isPanEnabled, updateAnchor, viewKey]);

	const finishDrag = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (dragRef.current?.pointerId !== event.pointerId) return;
			dragRef.current = null;
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		},
		[]
	);

	return (
		<div
			ref={viewportRef}
			aria-label={ariaLabel}
			role="region"
			className={cn(
				className,
				isPanEnabled && 'cursor-grab select-none active:cursor-grabbing'
			)}
			tabIndex={isPanEnabled ? 0 : undefined}
			onLostPointerCapture={() => {
				dragRef.current = null;
			}}
			onPointerCancel={finishDrag}
			onPointerDown={(event) => {
				if (
					!isPanEnabled ||
					event.pointerType === 'touch' ||
					event.button !== 0 ||
					(event.currentTarget.scrollWidth <=
						event.currentTarget.clientWidth &&
						event.currentTarget.scrollHeight <=
							event.currentTarget.clientHeight)
				) {
					return;
				}
				dragRef.current = {
					pointerId: event.pointerId,
					startClientX: event.clientX,
					startClientY: event.clientY,
					startScrollLeft: event.currentTarget.scrollLeft,
					startScrollTop: event.currentTarget.scrollTop,
				};
				event.currentTarget.setPointerCapture(event.pointerId);
				event.preventDefault();
			}}
			onPointerMove={(event) => {
				const drag = dragRef.current;
				if (!drag || drag.pointerId !== event.pointerId) return;
				event.currentTarget.scrollLeft =
					drag.startScrollLeft - (event.clientX - drag.startClientX);
				event.currentTarget.scrollTop =
					drag.startScrollTop - (event.clientY - drag.startClientY);
				updateAnchor();
				event.preventDefault();
			}}
			onPointerUp={finishDrag}
			onScroll={updateAnchor}
		>
			{children}
		</div>
	);
}

function ImagePreview({
	alt,
	className,
	dimensions,
	hasDecodeError,
	isCheckerboard,
	onError,
	onLoad,
	url,
	zoom,
}: {
	alt: string;
	className?: string;
	dimensions: IImageDimensions | undefined;
	hasDecodeError: boolean;
	isCheckerboard: boolean;
	onError: () => void;
	onLoad: (dimensions: IImageDimensions) => void;
	url: string | undefined;
	zoom: TImageZoom;
}) {
	if (!url) {
		return (
			<div
				className={cn(
					className ?? 'aspect-video',
					'flex items-center justify-center bg-content2/30'
				)}
			>
				<span className={TYPOGRAPHY_STYLES.subtleDescription}>
					此版本不存在
				</span>
			</div>
		);
	}
	if (hasDecodeError) {
		return (
			<div
				className={cn(
					className ?? 'aspect-video',
					'flex items-center justify-center bg-content2/30'
				)}
			>
				<span className={TYPOGRAPHY_STYLES.subtleDescription}>
					图片无法解码，请查看文件元数据
				</span>
			</div>
		);
	}
	const isFit = zoom === 'fit';
	return (
		<PannableImageViewport
			ariaLabel={`${alt}视图`}
			className={cn(
				className ?? 'aspect-video',
				isFit ? 'overflow-hidden' : SCROLLABLE_IMAGE_CLASS_NAME,
				isCheckerboard ? 'bg-checkerboard' : 'bg-content2/30'
			)}
			isPanEnabled={!isFit}
			viewKey={`${alt}:${zoom}:${dimensions?.width ?? 0}x${dimensions?.height ?? 0}`}
		>
			<div
				className={cn(
					'flex items-center justify-center',
					isFit ? 'h-full w-full' : 'min-h-full min-w-full'
				)}
				style={
					dimensions && !isFit
						? {
								height: `${(dimensions.height * zoom) / 100}px`,
								width: `${(dimensions.width * zoom) / 100}px`,
							}
						: undefined
				}
			>
				<img
					alt={alt}
					className={cn(
						'image-rendering-pixelated',
						isFit && 'h-full w-full object-contain'
					)}
					draggable={false}
					src={url}
					style={
						dimensions && !isFit
							? {
									height: `${(dimensions.height * zoom) / 100}px`,
									maxWidth: 'none',
									width: `${(dimensions.width * zoom) / 100}px`,
								}
							: undefined
					}
					onError={onError}
					onLoad={(event) =>
						onLoad({
							height: event.currentTarget.naturalHeight,
							width: event.currentTarget.naturalWidth,
						})
					}
				/>
			</div>
		</PannableImageViewport>
	);
}

export function ImageComparisonViewer({
	isReferenceOnly = false,
	leftUrl,
	node,
	rightUrl,
}: IProps) {
	const isReducedMotion = useReducedMotion();
	const sliderRangeId = useId();
	const zoomRangeId = useId();
	const [mode, setMode] = useState<TImageComparisonMode>('side-by-side');
	const [zoom, setZoom] = useState<TImageZoom>('fit');
	const [sliderPosition, setSliderPosition] = useState(50);
	const [isCheckerboard, setIsCheckerboard] = useState(true);
	const [isFlashPressed, setIsFlashPressed] = useState(false);
	const [flashSide, setFlashSide] = useState<'left' | 'right'>('left');
	const [leftDimensions, setLeftDimensions] = useState<IImageDimensions>();
	const [rightDimensions, setRightDimensions] = useState<IImageDimensions>();
	const [hasLeftDecodeError, setHasLeftDecodeError] = useState(false);
	const [hasRightDecodeError, setHasRightDecodeError] = useState(false);

	useEffect(() => {
		setMode('side-by-side');
		setZoom('fit');
		setSliderPosition(50);
		setIsFlashPressed(false);
		setFlashSide('left');
		setLeftDimensions(undefined);
		setRightDimensions(undefined);
		setHasLeftDecodeError(false);
		setHasRightDecodeError(false);
	}, [node.leftBlob, node.path, node.rightBlob]);

	useEffect(() => {
		if (!isFlashPressed || isReducedMotion || !leftUrl || !rightUrl) return;
		const interval = window.setInterval(() => {
			setFlashSide((current) => (current === 'left' ? 'right' : 'left'));
		}, 250);
		return () => window.clearInterval(interval);
	}, [isFlashPressed, isReducedMotion, leftUrl, rightUrl]);

	const canCompareBoth = Boolean(leftUrl && rightUrl);
	const canShowFlash = canCompareBoth && !isReducedMotion;
	const isRightReference = node.rightBlob !== undefined;
	const referenceUrl = isRightReference ? rightUrl : leftUrl;
	const referenceDimensions = isRightReference
		? rightDimensions
		: leftDimensions;
	const hasReferenceDecodeError = isRightReference
		? hasRightDecodeError
		: hasLeftDecodeError;
	const isFit = zoom === 'fit';
	const zoomPercent = isFit ? 100 : zoom;
	const sliderDimensions =
		leftDimensions || rightDimensions
			? {
					height: Math.max(
						leftDimensions?.height ?? 0,
						rightDimensions?.height ?? 0
					),
					width: Math.max(
						leftDimensions?.width ?? 0,
						rightDimensions?.width ?? 0
					),
				}
			: undefined;
	const sliderLayerStyle =
		sliderDimensions && !isFit
			? {
					height: `${(sliderDimensions.height * zoom) / 100}px`,
					width: `${(sliderDimensions.width * zoom) / 100}px`,
				}
			: undefined;
	const getSliderImageStyle = (dimensions: IImageDimensions | undefined) =>
		dimensions && !isFit
			? {
					height: `${(dimensions.height * zoom) / 100}px`,
					maxWidth: 'none',
					width: `${(dimensions.width * zoom) / 100}px`,
				}
			: undefined;
	const renderReference = () => (
		<div className="overflow-hidden rounded-medium border border-divider">
			<ImagePreview
				alt={`${node.path}参考图片`}
				dimensions={referenceDimensions}
				hasDecodeError={hasReferenceDecodeError}
				isCheckerboard={isCheckerboard}
				onError={() =>
					isRightReference
						? setHasRightDecodeError(true)
						: setHasLeftDecodeError(true)
				}
				onLoad={
					isRightReference ? setRightDimensions : setLeftDimensions
				}
				url={referenceUrl}
				zoom={zoom}
			/>
		</div>
	);
	const renderSideBySide = () => (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div className="overflow-hidden rounded-medium border border-divider">
				<ImagePreview
					alt={`${node.path}旧版`}
					dimensions={leftDimensions}
					hasDecodeError={hasLeftDecodeError}
					isCheckerboard={isCheckerboard}
					onError={() => setHasLeftDecodeError(true)}
					onLoad={setLeftDimensions}
					url={leftUrl}
					zoom={zoom}
				/>
			</div>
			<div className="overflow-hidden rounded-medium border border-divider">
				<ImagePreview
					alt={`${node.path}新版`}
					dimensions={rightDimensions}
					hasDecodeError={hasRightDecodeError}
					isCheckerboard={isCheckerboard}
					onError={() => setHasRightDecodeError(true)}
					onLoad={setRightDimensions}
					url={rightUrl}
					zoom={zoom}
				/>
			</div>
		</div>
	);

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<div className="flex flex-wrap items-end gap-4">
				{!isReferenceOnly && (
					<fieldset>
						<legend className={TYPOGRAPHY_STYLES.metadata}>
							对比方式
						</legend>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<Button
								color={
									mode === 'side-by-side'
										? 'primary'
										: 'default'
								}
								size="sm"
								variant={
									mode === 'side-by-side' ? 'flat' : 'light'
								}
								aria-pressed={mode === 'side-by-side'}
								onPress={() => setMode('side-by-side')}
							>
								并排
							</Button>
							<Button
								color={
									mode === 'slider' ? 'primary' : 'default'
								}
								size="sm"
								variant={mode === 'slider' ? 'flat' : 'light'}
								aria-pressed={mode === 'slider'}
								isDisabled={!canCompareBoth}
								onPress={() => setMode('slider')}
							>
								滑块
							</Button>
							<Button
								size="sm"
								variant="flat"
								isDisabled={!canCompareBoth || isReducedMotion}
								onPressChange={setIsFlashPressed}
							>
								按住闪烁
							</Button>
						</div>
					</fieldset>
				)}
				<fieldset>
					<legend className={TYPOGRAPHY_STYLES.metadata}>
						显示比例
					</legend>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Button
							color={isFit ? 'primary' : 'default'}
							size="sm"
							variant={isFit ? 'flat' : 'light'}
							aria-pressed={isFit}
							onPress={() => setZoom('fit')}
						>
							适应
						</Button>
						<Button
							color={zoom === 100 ? 'primary' : 'default'}
							size="sm"
							variant={zoom === 100 ? 'flat' : 'light'}
							aria-pressed={zoom === 100}
							onPress={() => setZoom(100)}
						>
							1:1
						</Button>
					</div>
				</fieldset>
				<Switch
					isSelected={isCheckerboard}
					onValueChange={setIsCheckerboard}
				>
					棋盘背景
				</Switch>
			</div>

			<div className={RANGE_ROW_CLASS_NAME}>
				<label htmlFor={zoomRangeId} className={RANGE_LABEL_CLASS_NAME}>
					缩放：{isFit ? '适应' : `${zoom}%`}
				</label>
				<ImageComparisonRange
					id={zoomRangeId}
					min="25"
					max="2000"
					step="5"
					value={zoomPercent}
					onChange={(event) => setZoom(Number(event.target.value))}
				/>
			</div>

			{isReferenceOnly ? (
				renderReference()
			) : (
				<div className="relative">
					<div
						aria-hidden={
							canShowFlash && isFlashPressed ? true : undefined
						}
						className={cn(
							canShowFlash && isFlashPressed && 'invisible'
						)}
					>
						{mode === 'slider' &&
						leftUrl &&
						rightUrl &&
						!hasLeftDecodeError &&
						!hasRightDecodeError ? (
							<div className="flex min-h-0 flex-col gap-3">
								<PannableImageViewport
									ariaLabel={`${node.path}滑块对比视图`}
									className={cn(
										'aspect-video rounded-medium border border-divider',
										isFit
											? 'overflow-hidden'
											: SCROLLABLE_IMAGE_CLASS_NAME,
										isCheckerboard
											? 'bg-checkerboard'
											: 'bg-content2/30'
									)}
									isPanEnabled={!isFit}
									viewKey={`${node.path}:${zoom}:${sliderDimensions?.width ?? 0}x${sliderDimensions?.height ?? 0}`}
								>
									<div
										className={cn(
											'flex items-center justify-center',
											isFit
												? 'h-full w-full'
												: 'min-h-full min-w-full'
										)}
										style={sliderLayerStyle}
									>
										<div
											className={cn(
												'relative shrink-0',
												isFit && 'h-full w-full'
											)}
											style={sliderLayerStyle}
										>
											<div className="absolute inset-0 flex items-center justify-center">
												<img
													alt={`${node.path}旧版滑块底图`}
													draggable={false}
													src={leftUrl}
													className={cn(
														'image-rendering-pixelated',
														isFit &&
															'h-full w-full object-contain'
													)}
													style={getSliderImageStyle(
														leftDimensions
													)}
													onError={() =>
														setHasLeftDecodeError(
															true
														)
													}
													onLoad={(event) =>
														setLeftDimensions({
															height: event
																.currentTarget
																.naturalHeight,
															width: event
																.currentTarget
																.naturalWidth,
														})
													}
												/>
											</div>
											<div
												className="absolute inset-0 overflow-hidden"
												style={{
													clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
												}}
											>
												<div className="flex h-full w-full items-center justify-center">
													<img
														alt={`${node.path}新版滑块覆盖图`}
														draggable={false}
														src={rightUrl}
														className={cn(
															'image-rendering-pixelated',
															isFit &&
																'h-full w-full object-contain'
														)}
														style={getSliderImageStyle(
															rightDimensions
														)}
														onError={() =>
															setHasRightDecodeError(
																true
															)
														}
														onLoad={(event) =>
															setRightDimensions({
																height: event
																	.currentTarget
																	.naturalHeight,
																width: event
																	.currentTarget
																	.naturalWidth,
															})
														}
													/>
												</div>
											</div>
											<div
												data-comparison-slider-boundary=""
												aria-hidden="true"
												className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-primary"
												style={{
													left: `${sliderPosition}%`,
												}}
											/>
										</div>
									</div>
								</PannableImageViewport>
								<div className={RANGE_ROW_CLASS_NAME}>
									<label
										htmlFor={sliderRangeId}
										className={RANGE_LABEL_CLASS_NAME}
									>
										新版覆盖{sliderPosition}%
									</label>
									<ImageComparisonRange
										id={sliderRangeId}
										min="0"
										max="100"
										step="0.5"
										value={sliderPosition}
										onChange={(event) =>
											setSliderPosition(
												Number(event.target.value)
											)
										}
									/>
								</div>
							</div>
						) : (
							renderSideBySide()
						)}
					</div>
					{canShowFlash && isFlashPressed && (
						<div
							className="absolute inset-0 overflow-hidden rounded-medium border border-divider"
							aria-live="polite"
						>
							<ImagePreview
								alt={`${node.path}${flashSide === 'left' ? '旧版' : '新版'}闪烁预览`}
								className="h-full"
								dimensions={
									flashSide === 'left'
										? leftDimensions
										: rightDimensions
								}
								hasDecodeError={
									flashSide === 'left'
										? hasLeftDecodeError
										: hasRightDecodeError
								}
								isCheckerboard={isCheckerboard}
								onError={() =>
									flashSide === 'left'
										? setHasLeftDecodeError(true)
										: setHasRightDecodeError(true)
								}
								onLoad={
									flashSide === 'left'
										? setLeftDimensions
										: setRightDimensions
								}
								url={flashSide === 'left' ? leftUrl : rightUrl}
								zoom={zoom}
							/>
						</div>
					)}
				</div>
			)}

			{isReferenceOnly ? (
				<div className="flex flex-col gap-2">
					<ComparisonFileMetadata
						analyzedFile={
							isRightReference
								? node.analysis?.right
								: node.analysis?.left
						}
						blob={isRightReference ? node.rightBlob : node.leftBlob}
						label="图片"
					/>
					{referenceDimensions && (
						<p className={TYPOGRAPHY_STYLES.metadata}>
							尺寸 {referenceDimensions.width} ×{' '}
							{referenceDimensions.height}
						</p>
					)}
				</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<ComparisonFileMetadata
							analyzedFile={node.analysis?.left}
							blob={node.leftBlob}
							label="旧版图片"
						/>
						{leftDimensions && (
							<p className={TYPOGRAPHY_STYLES.metadata}>
								尺寸 {leftDimensions.width} ×{' '}
								{leftDimensions.height}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<ComparisonFileMetadata
							analyzedFile={node.analysis?.right}
							blob={node.rightBlob}
							label="新版图片"
						/>
						{rightDimensions && (
							<p className={TYPOGRAPHY_STYLES.metadata}>
								尺寸 {rightDimensions.width} ×{' '}
								{rightDimensions.height}
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
