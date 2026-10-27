import type { IDayMap, IDayMapImage } from './contracts/dayMap';

/** 地图大图的切块边长；与 Mod 的 DayMapRegistry.ChunkSize 一致。 */
export const DAY_MAP_CHUNK_SIZE_PX = 1024;

export interface IDayMapAssetReference {
	fieldPath: (number | string)[];
	kind: 'audio' | 'image';
	path: string;
}

/** 返回当前包中的路径；跨包 URI 没有本地文件。 */
export function resolveDayMapAssetPath(
	path: string,
	packLabel: string | undefined
): string | null {
	if (!path.startsWith('rex://')) return path;
	const separator = path.indexOf('/', 6);
	if (separator < 0 || path.slice(6, separator) !== packLabel) return null;
	return path.slice(separator + 1);
}

export function getDayMapChunkPath(
	image: IDayMapImage,
	[column = 0, row = 0]: readonly number[]
) {
	return `${image.dir}/${column}_${row}.png`;
}

/** 块 [列,行] 自图片左上角起算；末列末行可能小于切块边长。 */
export function getDayMapChunkSize(
	image: IDayMapImage,
	[column = 0, row = 0]: readonly number[]
) {
	return {
		height: Math.min(
			DAY_MAP_CHUNK_SIZE_PX,
			image.height - row * DAY_MAP_CHUNK_SIZE_PX
		),
		width: Math.min(
			DAY_MAP_CHUNK_SIZE_PX,
			image.width - column * DAY_MAP_CHUNK_SIZE_PX
		),
	};
}

/** 地图引用的全部资源：图层与物件模板的图块、包内音乐。 */
export function getDayMapAssetReferences(
	map: IDayMap
): IDayMapAssetReference[] {
	const references: IDayMapAssetReference[] = [];
	const addImage = (image: IDayMapImage, fieldPath: (number | string)[]) =>
		image.chunks.forEach((chunk, index) =>
			references.push({
				fieldPath: [...fieldPath, 'image', 'chunks', index],
				kind: 'image',
				path: getDayMapChunkPath(image, chunk),
			})
		);
	map.layers.forEach((layer, index) =>
		addImage(layer.image, ['layers', index])
	);
	map.prefabs.forEach((prefab, index) =>
		addImage(prefab.image, ['prefabs', index])
	);
	for (const key of ['intro', 'loop'] as const) {
		const path = map.mapBGM[key];
		if (path)
			references.push({
				fieldPath: ['mapBGM', key],
				kind: 'audio',
				path,
			});
	}
	return references;
}

/** 按路径映射改写图块目录与音乐；目录随其中任一图块的新路径整体移动。 */
export function remapDayMapAssetPaths(
	map: IDayMap,
	remap: (path: string) => string
): IDayMap {
	const remapImage = (image: IDayMapImage): IDayMapImage => {
		const [first] = image.chunks;
		if (!first) return image;
		const path = getDayMapChunkPath(image, first);
		const next = remap(path);
		if (next === path) return image;
		const suffix = path.slice(image.dir.length);
		return next.endsWith(suffix)
			? { ...image, dir: next.slice(0, -suffix.length) }
			: image;
	};
	const layers = map.layers.map((layer) => {
		const image = remapImage(layer.image);
		return image === layer.image ? layer : { ...layer, image };
	});
	const prefabs = map.prefabs.map((prefab) => {
		const image = remapImage(prefab.image);
		return image === prefab.image ? prefab : { ...prefab, image };
	});
	const intro = map.mapBGM.intro && remap(map.mapBGM.intro);
	const loop = map.mapBGM.loop && remap(map.mapBGM.loop);
	const isChanged =
		layers.some((layer, index) => layer !== map.layers[index]) ||
		prefabs.some((prefab, index) => prefab !== map.prefabs[index]) ||
		intro !== map.mapBGM.intro ||
		loop !== map.mapBGM.loop;
	if (!isChanged) return map;
	return {
		...map,
		layers,
		prefabs,
		mapBGM: {
			...map.mapBGM,
			...(intro === undefined ? {} : { intro }),
			...(loop === undefined ? {} : { loop }),
		},
	};
}
