import { cn } from '@heroui/theme';
import { memo, useEffect, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';

interface PortraitPreviewProps {
	portraitPath: string | null;
	characterId: number;
	charName: string;
	pid: number;
	portraitName: string;
}

export const PortraitPreview = memo<PortraitPreviewProps>(
	function PortraitPreview({
		portraitPath,
		characterId,
		charName,
		pid,
		portraitName,
	}) {
		const [isLoadError, setIsLoadError] = useState(false);

		useEffect(() => setIsLoadError(false), [portraitPath]);

		if (!portraitPath) {
			return (
				<EmptyState
					className="h-80"
					title="无立绘预览"
					description="选择角色和立绘后在此显示。"
				/>
			);
		}

		return (
			<div className="group flex flex-col gap-2">
				<div className="bg-checkerboard relative h-80 w-full overflow-hidden rounded-medium border border-divider">
					{isLoadError ? (
						<div
							className={cn(
								TYPOGRAPHY_STYLES.emphasizedText,
								'flex h-full w-full items-center justify-center bg-danger/10 p-4 text-center text-danger-700 dark:text-danger'
							)}
						>
							图片加载失败
						</div>
					) : (
						<img
							draggable="false"
							src={portraitPath}
							alt={`${charName} ${portraitName}立绘`}
							className="image-rendering-pixelated h-full w-full object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
							onError={() => setIsLoadError(true)}
						/>
					)}
				</div>
				<div className="rounded-medium bg-content2/50 px-2 py-1 text-center">
					<div className={TYPOGRAPHY_STYLES.compactLabel}>
						（{characterId}）{charName}&nbsp;&nbsp;（{pid}）
						{portraitName}
					</div>
				</div>
			</div>
		);
	}
);
