const IMAGE_ASSET_EXTENSIONS = [
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.svg',
] as const;

const AUDIO_ASSET_EXTENSIONS = ['.flac', '.mp3', '.ogg', '.wav'] as const;

export type TAssetKind = 'audio' | 'file' | 'folder' | 'image';

export const IMAGE_ASSET_FILE_ACCEPT = IMAGE_ASSET_EXTENSIONS.join(',');

export function isImageAssetPath(path: string): boolean {
	const lowerPath = path.toLowerCase();
	return IMAGE_ASSET_EXTENSIONS.some((extension) =>
		lowerPath.endsWith(extension)
	);
}

export function isWavAssetPath(path: string): boolean {
	return path.toLowerCase().endsWith('.wav');
}

export function getAssetKind(path: string): TAssetKind {
	if (path.endsWith('/')) return 'folder';
	if (isImageAssetPath(path)) return 'image';
	const lowerPath = path.toLowerCase();
	return AUDIO_ASSET_EXTENSIONS.some((extension) =>
		lowerPath.endsWith(extension)
	)
		? 'audio'
		: 'file';
}
