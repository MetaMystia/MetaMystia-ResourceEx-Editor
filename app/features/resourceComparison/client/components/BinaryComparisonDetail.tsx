import { cn } from '@heroui/theme';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';
import { type IComparisonAnalyzedFile } from '@/features/resourceComparison/client/files/comparisonFileAnalysis';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';

interface IProps {
	node: IAssetComparisonNode;
}

interface IFileMetadataProps {
	analyzedFile: IComparisonAnalyzedFile | undefined;
	blob: Blob | undefined;
	label: string;
}

export function formatComparisonFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ComparisonFileMetadata({
	analyzedFile,
	blob,
	label,
}: IFileMetadataProps) {
	if (!blob) {
		return (
			<div>
				<p className={TYPOGRAPHY_STYLES.compactTitle}>{label}</p>
				<EmptyState title="此版本不存在" variant="text" />
			</div>
		);
	}

	const hashText =
		analyzedFile?.hashStatus === 'hashed'
			? analyzedFile.hash
			: analyzedFile?.hashStatus === 'failed'
				? `无法确认：${analyzedFile.hashError ?? '未知错误'}`
				: '待分析';
	return (
		<div className="rounded-medium border border-divider bg-content2/30 p-3">
			<p className={TYPOGRAPHY_STYLES.compactTitle}>{label}</p>
			<dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
				<dt className={TYPOGRAPHY_STYLES.metadata}>大小</dt>
				<dd className={TYPOGRAPHY_STYLES.compactBody}>
					{formatComparisonFileSize(blob.size)}
				</dd>
				<dt className={TYPOGRAPHY_STYLES.metadata}>类型</dt>
				<dd className={TYPOGRAPHY_STYLES.compactBody}>
					{analyzedFile?.mimeType || blob.type || '未知'}
				</dd>
				<dt className={TYPOGRAPHY_STYLES.metadata}>SHA-256</dt>
				<dd
					className={cn(
						TYPOGRAPHY_STYLES.metadata,
						'min-w-0 break-all font-mono'
					)}
				>
					{hashText}
				</dd>
			</dl>
		</div>
	);
}

export function BinaryComparisonDetail({ node }: IProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<ComparisonFileMetadata
				analyzedFile={node.analysis?.left}
				blob={node.leftBlob}
				label="旧版"
			/>
			<ComparisonFileMetadata
				analyzedFile={node.analysis?.right}
				blob={node.rightBlob}
				label="新版"
			/>
		</div>
	);
}
