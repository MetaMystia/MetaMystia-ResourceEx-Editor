'use client';

import { useEffect, useState } from 'react';

import { type IComparisonAudioDecoder } from '@/features/resourceComparison/client/audio/decodeComparisonAudio';
import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';
import { type IComparisonObjectUrlRegistry } from '@/features/resourceComparison/client/files/comparisonObjectUrlRegistry';

import { AudioComparisonPlayer } from './AudioComparisonPlayer';
import { BinaryComparisonDetail } from './BinaryComparisonDetail';
import { ImageComparisonViewer } from './ImageComparisonViewer';

interface IProps {
	audioDecoder: IComparisonAudioDecoder | null;
	isReferenceOnly?: boolean;
	node: IAssetComparisonNode;
	objectUrlRegistry: IComparisonObjectUrlRegistry | null;
}

interface IPreviewUrls {
	left?: string;
	right?: string;
}

export function AssetComparisonPreview({
	audioDecoder,
	isReferenceOnly = false,
	node,
	objectUrlRegistry,
}: IProps) {
	const [previewUrls, setPreviewUrls] = useState<IPreviewUrls>({});
	const shouldUseReferenceImage = isReferenceOnly && node.kind === 'image';

	useEffect(() => {
		setPreviewUrls({});
		if (
			(node.kind !== 'audio' && node.kind !== 'image') ||
			!objectUrlRegistry
		) {
			return;
		}
		if (shouldUseReferenceImage) {
			const isRightReference = node.rightBlob !== undefined;
			const referenceBlob = node.rightBlob ?? node.leftBlob;
			const referenceLease = referenceBlob
				? objectUrlRegistry.acquire(referenceBlob)
				: undefined;
			setPreviewUrls(
				referenceLease
					? isRightReference
						? { right: referenceLease.url }
						: { left: referenceLease.url }
					: {}
			);
			return () => referenceLease?.release();
		}
		const leftLease = node.leftBlob
			? objectUrlRegistry.acquire(node.leftBlob)
			: undefined;
		const rightLease = node.rightBlob
			? objectUrlRegistry.acquire(node.rightBlob)
			: undefined;
		setPreviewUrls({
			...(leftLease ? { left: leftLease.url } : {}),
			...(rightLease ? { right: rightLease.url } : {}),
		});
		return () => {
			leftLease?.release();
			rightLease?.release();
		};
	}, [
		node.kind,
		node.leftBlob,
		node.rightBlob,
		objectUrlRegistry,
		shouldUseReferenceImage,
	]);

	if (node.kind === 'image') {
		return (
			<ImageComparisonViewer
				isReferenceOnly={shouldUseReferenceImage}
				{...(previewUrls.left ? { leftUrl: previewUrls.left } : {})}
				node={node}
				{...(previewUrls.right ? { rightUrl: previewUrls.right } : {})}
			/>
		);
	}
	if (node.kind === 'audio') {
		return (
			<AudioComparisonPlayer
				audioDecoder={audioDecoder}
				{...(previewUrls.left ? { leftUrl: previewUrls.left } : {})}
				node={node}
				{...(previewUrls.right ? { rightUrl: previewUrls.right } : {})}
			/>
		);
	}
	return <BinaryComparisonDetail node={node} />;
}
