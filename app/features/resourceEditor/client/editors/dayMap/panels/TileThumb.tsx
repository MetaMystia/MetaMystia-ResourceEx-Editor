'use client';

import { cn } from '@heroui/theme';
import { memo, useEffect, useRef } from 'react';

import type { IDayMapTile } from '@/domain/resourcePack/contracts/dayMap';

import { getCachedTileVertices } from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';
import { drawMapTile } from '@/features/resourceEditor/client/editors/dayMap/drawMapTile';
import {
	getTileSourceRect,
	isSimpleTile,
	loadMapImage,
	useImageSize,
} from '@/features/resourceEditor/client/editors/dayMap/tileImages';

interface IProps {
	className?: string;
	size?: number;
	tile: IDayMapTile;
	url: string | undefined;
}

function MeshThumb({ size, tile, url }: Required<Omit<IProps, 'className'>>) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !url) return;
		let isActive = true;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(size * ratio);
		canvas.height = Math.round(size * ratio);
		loadMapImage(url).then(
			(image) => {
				if (!isActive) return;
				const points = getCachedTileVertices(tile);
				const xs = points.map((point) => point[0] ?? 0);
				const ys = points.map((point) => point[1] ?? 0);
				const minX = Math.min(...xs);
				const maxX = Math.max(...xs);
				const minY = Math.min(...ys);
				const maxY = Math.max(...ys);
				const scale = Math.min(
					size / (maxX - minX || 1),
					size / (maxY - minY || 1)
				);
				context.setTransform(ratio, 0, 0, ratio, 0, 0);
				context.clearRect(0, 0, size, size);
				context.imageSmoothingEnabled = false;
				drawMapTile(
					context,
					image,
					tile,
					size / 2 - ((minX + maxX) * scale) / 2,
					size / 2 + ((minY + maxY) * scale) / 2,
					scale
				);
			},
			() => undefined
		);
		return () => {
			isActive = false;
		};
	}, [size, tile, url]);
	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			style={{ height: size, width: size }}
		/>
	);
}

/** 切片缩略图：矩形与四顶点网格用 CSS 背景裁切，复杂网格才使用画布。 */
export const TileThumb = memo(function TileThumb({
	className,
	size = 44,
	tile,
	url,
}: IProps) {
	const imageSize = useImageSize(url);
	const frame = cn(
		'flex shrink-0 items-center justify-center overflow-hidden',
		className
	);
	if (!url || imageSize === null)
		return (
			<span
				className={cn(
					frame,
					'rounded-small border border-dashed border-danger/50 bg-danger/10 text-[10px] text-danger'
				)}
				style={{ height: size, width: size }}
				title="图片缺失或无法读取"
			>
				缺图
			</span>
		);
	if (imageSize === undefined)
		return (
			<span
				className={cn(
					frame,
					'animate-pulse rounded-small bg-default/40 motion-reduce:animate-none'
				)}
				style={{ height: size, width: size }}
			/>
		);
	if (!isSimpleTile(tile))
		return (
			<span className={frame} style={{ height: size, width: size }}>
				<MeshThumb size={size} tile={tile} url={url} />
			</span>
		);
	const rect = getTileSourceRect(tile, imageSize);
	if (!rect)
		return (
			<span
				className={cn(
					frame,
					'rounded-small border border-dashed border-warning/60 bg-warning/10 text-[10px] text-warning-700'
				)}
				style={{ height: size, width: size }}
				title="切片超出图片范围"
			>
				越界
			</span>
		);
	const scale = Math.min(size / rect.width, size / rect.height);
	return (
		<span className={frame} style={{ height: size, width: size }}>
			<span
				aria-hidden
				className="block bg-no-repeat"
				style={{
					backgroundImage: `url("${url}")`,
					backgroundPosition: `${-rect.left * scale}px ${-rect.top * scale}px`,
					backgroundSize: `${imageSize.width * scale}px ${imageSize.height * scale}px`,
					height: rect.height * scale,
					imageRendering: scale >= 1 ? 'pixelated' : 'auto',
					width: rect.width * scale,
				}}
			/>
		</span>
	);
});
