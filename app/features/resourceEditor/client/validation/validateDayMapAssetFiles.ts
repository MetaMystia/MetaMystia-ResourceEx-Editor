import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';
import { validateDayMapWav } from '@/domain/resourcePack/dayMapWav';
import { type IResourcePackValidationIssue } from '@/domain/resourcePack/validation';

export async function validateDayMapAssetFiles(
	resourcePack: ResourceEx,
	assetUrls: Readonly<Record<string, string>>
): Promise<IResourcePackValidationIssue[]> {
	const issues: IResourcePackValidationIssue[] = [];
	const images = new Map<
		string,
		Promise<{ width: number; height: number } | null>
	>();
	const sounds = new Map<string, Promise<string | null>>();
	const report = (message: string) =>
		issues.push({ severity: 'error', category: '白天地图', message });
	const readBlob = async (path: string) => {
		const url = assetUrls[path];
		if (!url?.startsWith('blob:'))
			throw new Error('不是当前工作区的本地资源');
		const response = await fetch(url, {
			signal: AbortSignal.timeout(10000),
		});
		if (!response.ok) throw new Error('无法读取本地资源');
		return response.blob();
	};
	const readImage = (path: string) => {
		let result = images.get(path);
		if (!result) {
			result = (async () => {
				try {
					const bitmap = await createImageBitmap(
						await readBlob(path)
					);
					const dimensions = {
						width: bitmap.width,
						height: bitmap.height,
					};
					bitmap.close();
					return dimensions;
				} catch {
					report(`图片 ${path} 无法解码，请重新导入有效图片。`);
					return null;
				}
			})();
			images.set(path, result);
		}
		return result;
	};
	for (const map of resourcePack.dayMaps) {
		for (const tile of map.tiles) {
			const path = resolveDayMapAssetPath(
				tile.image,
				resourcePack.packInfo.label
			);
			if (!path || !assetUrls[path]) continue;
			const dimensions = await readImage(path);
			const [x = 0, y = 0, width = 0, height = 0] = tile.rect;
			if (
				dimensions &&
				(x + width > dimensions.width || y + height > dimensions.height)
			)
				report(
					`${map.name}：瓦片 ${tile.key} 超出图片 ${path} 的 ${dimensions.width}×${dimensions.height} 像素边界。`
				);
		}
		for (const reference of [map.mapBGM.intro, map.mapBGM.loop]) {
			const path = resolveDayMapAssetPath(
				reference,
				resourcePack.packInfo.label
			);
			if (!path || !assetUrls[path]) continue;
			let result = sounds.get(path);
			if (!result) {
				result = (async () => {
					try {
						return validateDayMapWav(
							await (await readBlob(path)).arrayBuffer()
						);
					} catch {
						return '无法读取本地音频。';
					}
				})();
				sounds.set(path, result);
				const error = await result;
				if (error) report(`音频 ${path}：${error}`);
			}
		}
	}
	return issues;
}
