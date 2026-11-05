import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import {
	getDayMapChunkPath,
	getDayMapChunkSize,
	resolveDayMapAssetPath,
} from '@/domain/resourcePack/dayMapAssets';
import { validateDayMapWav } from '@/domain/resourcePack/dayMapWav';
import { type IResourcePackValidationIssue } from '@/domain/resourcePack/validation';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

/** 只读 PNG 头部的宽高，与 Mod 的校验方式一致，不解码整张图。 */
async function readPngSize(blob: Blob) {
	const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
	if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value))
		return null;
	const view = new DataView(bytes.buffer);
	return { height: view.getUint32(20), width: view.getUint32(16) };
}

export async function validateDayMapAssetFiles(
	resourcePack: ResourceEx,
	assetUrls: Readonly<Record<string, string>>
): Promise<IResourcePackValidationIssue[]> {
	const issues: IResourcePackValidationIssue[] = [];
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
	const label = resourcePack.packInfo.label;
	for (const map of resourcePack.dayMaps) {
		const images = [
			...map.layers.map((layer) => ({
				image: layer.image,
				owner: `图层${layer.name}`,
			})),
			...map.prefabs.map((prefab) => ({
				image: prefab.image,
				owner: `物件模板${prefab.key}`,
			})),
		];
		for (const { image, owner } of images)
			for (const chunk of image.chunks) {
				const reference = getDayMapChunkPath(image, chunk);
				const path = resolveDayMapAssetPath(reference, label);
				if (!path) continue;
				if (!assetUrls[path]) {
					report(`${map.name}：${owner}缺少图块${path}。`);
					continue;
				}
				const expected = getDayMapChunkSize(image, chunk);
				let size: Awaited<ReturnType<typeof readPngSize>> = null;
				try {
					size = await readPngSize(await readBlob(path));
				} catch {
					// 读取失败按无效 PNG 报告。
				}
				if (!size)
					report(`${map.name}：${owner}的图块${path}不是有效 PNG。`);
				else if (
					size.width !== expected.width ||
					size.height !== expected.height
				)
					report(
						`${map.name}：${owner}的图块${path}应为${expected.width}×${expected.height}像素，实际为${size.width}×${size.height}。`
					);
			}
		for (const reference of [map.mapBGM.intro, map.mapBGM.loop]) {
			if (!reference) continue;
			const path = resolveDayMapAssetPath(reference, label);
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
				if (error) report(`音频${path}：${error}`);
			}
		}
	}
	return issues;
}
