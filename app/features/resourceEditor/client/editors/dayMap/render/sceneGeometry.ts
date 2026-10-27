import type {
	IDayMap,
	IDayMapImage,
	IDayMapObject,
	IDayMapPrefab,
} from '@/domain/resourcePack/contracts/dayMap';
import {
	DAY_MAP_CHUNK_SIZE_PX,
	getDayMapChunkPath,
	getDayMapChunkSize,
	resolveDayMapAssetPath,
} from '@/domain/resourcePack/dayMapAssets';
import { DAY_MAP_SORTING_LAYERS } from '@/domain/resourcePack/dayMapValidation';

import {
	getObjectPlacement,
	getPrefabIndex,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';

/** 位置 2×f32、UV 2×f32、颜色 4×u8、纹理槽 1×u8 与 3 字节对齐。 */
export const SCENE_VERTEX_STRIDE_BYTES = 24;
export const SCENE_BATCH_TEXTURE_LIMIT = 8;
/** 空字符串表示 1×1 白色纹理，用于缺图占位。 */
export const SCENE_WHITE_TEXTURE = '';
/** LayerSortingController.IsometricRangePerYUnit。 */
const SORT_STEP_PER_UNIT = 32;

export interface ISceneRange {
	indexCount: number;
	indexStart: number;
	textures: readonly string[];
}

export interface ISceneGeometry {
	indexCount: number;
	indices: Uint32Array;
	ranges: readonly ISceneRange[];
	vertexCount: number;
	vertices: ArrayBuffer;
}

/** 绘制顺序中连续的一段：一个图层，或相邻的一组物件（layerIndex 为 null）。 */
export interface ISceneSegment {
	geometry: ISceneGeometry;
	layerIndex: number | null;
}

export interface ISceneBuildInput {
	assetUrls: Readonly<Record<string, string>>;
	hiddenLayers: ReadonlySet<number>;
	map: IDayMap;
	packLabel: string;
}

export type TSceneDrawItem =
	{ index: number; kind: 'layer' } | { index: number; kind: 'object' };

const PLACEHOLDER_COLOR = [217, 70, 239, 102] as const;
const WHITE = [255, 255, 255, 255] as const;

class GeometryWriter {
	private bytes: Uint8Array;
	private floats: Float32Array;
	private indexData: Uint32Array;
	private rangeStart = 0;
	private rangeTextures: string[] = [];
	private readonly ranges: ISceneRange[] = [];
	private vertexBuffer: ArrayBuffer;
	public indexCount = 0;
	public vertexCount = 0;

	public constructor(quadCapacity: number) {
		this.vertexBuffer = new ArrayBuffer(
			Math.max(4, quadCapacity * 4) * SCENE_VERTEX_STRIDE_BYTES
		);
		this.floats = new Float32Array(this.vertexBuffer);
		this.bytes = new Uint8Array(this.vertexBuffer);
		this.indexData = new Uint32Array(Math.max(6, quadCapacity * 6));
	}

	private reserve(vertexCount: number, indexCount: number) {
		const neededVertices = this.vertexCount + vertexCount;
		if (
			neededVertices * SCENE_VERTEX_STRIDE_BYTES >
			this.vertexBuffer.byteLength
		) {
			const next = new ArrayBuffer(
				Math.max(
					neededVertices,
					(this.vertexBuffer.byteLength / SCENE_VERTEX_STRIDE_BYTES) *
						2
				) * SCENE_VERTEX_STRIDE_BYTES
			);
			new Uint8Array(next).set(this.bytes);
			this.vertexBuffer = next;
			this.floats = new Float32Array(next);
			this.bytes = new Uint8Array(next);
		}
		const neededIndices = this.indexCount + indexCount;
		if (neededIndices > this.indexData.length) {
			const next = new Uint32Array(
				Math.max(neededIndices, this.indexData.length * 2)
			);
			next.set(this.indexData);
			this.indexData = next;
		}
	}

	/** 返回纹理槽；当前批次已满时结束批次。 */
	private useTexture(texture: string) {
		const slot = this.rangeTextures.indexOf(texture);
		if (slot >= 0) return slot;
		if (this.rangeTextures.length >= SCENE_BATCH_TEXTURE_LIMIT)
			this.closeRange();
		this.rangeTextures.push(texture);
		return this.rangeTextures.length - 1;
	}

	/** 四个角依次为左下、右下、右上、左上，对应 UV (0,0)、(1,0)、(1,1)、(0,1)。 */
	public addQuad(
		corners: readonly (readonly [number, number])[],
		texture: string,
		color: readonly number[]
	) {
		this.reserve(4, 6);
		const slot = this.useTexture(texture);
		const base = this.vertexCount;
		const uvs = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		] as const;
		corners.forEach(([x, y], index) => {
			const offset = this.vertexCount * (SCENE_VERTEX_STRIDE_BYTES / 4);
			this.floats[offset] = x;
			this.floats[offset + 1] = y;
			this.floats[offset + 2] = uvs[index]?.[0] ?? 0;
			this.floats[offset + 3] = uvs[index]?.[1] ?? 0;
			const byteOffset =
				this.vertexCount * SCENE_VERTEX_STRIDE_BYTES + 16;
			this.bytes.set(
				[
					color[0] ?? 255,
					color[1] ?? 255,
					color[2] ?? 255,
					color[3] ?? 255,
					slot,
				],
				byteOffset
			);
			this.vertexCount += 1;
		});
		for (const index of [0, 1, 2, 0, 2, 3]) {
			this.indexData[this.indexCount] = base + index;
			this.indexCount += 1;
		}
	}

	private closeRange() {
		if (this.indexCount > this.rangeStart)
			this.ranges.push({
				indexCount: this.indexCount - this.rangeStart,
				indexStart: this.rangeStart,
				textures: this.rangeTextures,
			});
		this.rangeStart = this.indexCount;
		this.rangeTextures = [];
	}

	public finish(): ISceneGeometry {
		this.closeRange();
		return {
			indexCount: this.indexCount,
			indices: this.indexData.slice(0, this.indexCount),
			ranges: this.ranges,
			vertexCount: this.vertexCount,
			vertices: this.vertexBuffer.slice(
				0,
				this.vertexCount * SCENE_VERTEX_STRIDE_BYTES
			),
		};
	}
}

export function getSortingRank(sortingLayer: string) {
	return Math.max(
		0,
		(DAY_MAP_SORTING_LAYERS as readonly string[]).indexOf(sortingLayer)
	);
}

/** 与 LayerSortingController 一致：按 Y 排序时为 (int)(-32×Y)，否则用模板排序值。 */
export function getObjectSortingOrder(
	object: IDayMapObject,
	prefab: IDayMapPrefab | undefined
) {
	return (prefab?.sortByY ?? true)
		? Math.trunc(object.y * -SORT_STEP_PER_UNIT)
		: (prefab?.sortingOrder ?? 0);
}

/** 游戏中的绘制顺序：排序层优先，同层按排序值；同值时图层在物件之下，再按列表顺序。 */
export function getSceneDrawOrder(map: IDayMap): TSceneDrawItem[] {
	const prefabs = getPrefabIndex(map);
	const entries = [
		...map.layers.map((layer, index) => ({
			item: { index, kind: 'layer' } as const,
			key: [
				getSortingRank(layer.sortingLayer),
				layer.sortingOrder,
				0,
				index,
			],
		})),
		...map.objects.map((object, index) => {
			const prefab = prefabs.get(object.prefab);
			return {
				item: { index, kind: 'object' } as const,
				key: [
					getSortingRank(prefab?.sortingLayer ?? 'Character'),
					getObjectSortingOrder(object, prefab),
					1,
					index,
				],
			};
		}),
	];
	entries.sort((a, b) => {
		for (let i = 0; i < a.key.length; i++) {
			const difference = (a.key[i] ?? 0) - (b.key[i] ?? 0);
			if (difference !== 0) return difference;
		}
		return 0;
	});
	return entries.map((entry) => entry.item);
}

function toColorBytes(color: readonly number[] | undefined) {
	return color
		? color.map((value) =>
				Math.round(Math.min(1, Math.max(0, value)) * 255)
			)
		: WHITE;
}

/** 写入切块图片的每个图块；toWorld 把图片左下角为原点、Y 向上的像素坐标换算为世界坐标。 */
function appendImage(
	writer: GeometryWriter,
	image: IDayMapImage,
	toWorld: (x: number, y: number) => readonly [number, number],
	readUrl: (path: string) => string | null,
	color: readonly number[]
) {
	for (const chunk of image.chunks) {
		const size = getDayMapChunkSize(image, chunk);
		const left = (chunk[0] ?? 0) * DAY_MAP_CHUNK_SIZE_PX;
		const bottom =
			image.height -
			(chunk[1] ?? 0) * DAY_MAP_CHUNK_SIZE_PX -
			size.height;
		const corners = [
			toWorld(left, bottom),
			toWorld(left + size.width, bottom),
			toWorld(left + size.width, bottom + size.height),
			toWorld(left, bottom + size.height),
		];
		const url = readUrl(getDayMapChunkPath(image, chunk));
		if (url) writer.addQuad(corners, url, color);
		else writer.addQuad(corners, SCENE_WHITE_TEXTURE, PLACEHOLDER_COLOR);
	}
}

function buildScene({
	assetUrls,
	hiddenLayers,
	map,
	packLabel,
}: ISceneBuildInput): ISceneSegment[] {
	const readUrl = (path: string) => {
		const local = resolveDayMapAssetPath(path, packLabel);
		return local === null ? null : (assetUrls[local] ?? null);
	};
	const prefabs = getPrefabIndex(map);
	const ppu = map.pixelsPerUnit;
	const segments: ISceneSegment[] = [];
	let writer: GeometryWriter | null = null;
	let segmentLayer: number | null = null;
	const flush = () => {
		if (writer)
			segments.push({
				geometry: writer.finish(),
				layerIndex: segmentLayer,
			});
		writer = null;
	};
	for (const item of getSceneDrawOrder(map)) {
		if (item.kind === 'layer') {
			flush();
			const layer = map.layers[item.index];
			if (!layer || hiddenLayers.has(item.index)) continue;
			writer = new GeometryWriter(layer.image.chunks.length);
			segmentLayer = item.index;
			appendImage(
				writer,
				layer.image,
				(x, y) => [(layer.x + x) / ppu, (layer.y + y) / ppu],
				readUrl,
				toColorBytes(layer.color)
			);
			flush();
			continue;
		}
		const object = map.objects[item.index];
		const prefab = object && prefabs.get(object.prefab);
		if (!object || !prefab) continue;
		if (!writer) {
			writer = new GeometryWriter(64);
			segmentLayer = null;
		}
		const { scaleX, scaleY } = getObjectPlacement(object);
		const [pivotX = 0.5, pivotY = 0] = prefab.pivot;
		const { height, width } = prefab.image;
		const unit = prefab.pixelsPerUnit;
		appendImage(
			writer,
			prefab.image,
			(x, y) => [
				object.x + ((x - pivotX * width) / unit) * scaleX,
				object.y + ((y - pivotY * height) / unit) * scaleY,
			],
			readUrl,
			WHITE
		);
	}
	flush();
	return segments;
}

export type TSceneBuilder = (input: ISceneBuildInput) => ISceneSegment[];

/** 输入不变时复用上一次的几何体，平移缩放只更新视图。 */
export function createSceneBuilder(): TSceneBuilder {
	let last: { input: ISceneBuildInput; segments: ISceneSegment[] } | null =
		null;
	return (input) => {
		if (
			last &&
			last.input.map === input.map &&
			last.input.assetUrls === input.assetUrls &&
			last.input.hiddenLayers === input.hiddenLayers &&
			last.input.packLabel === input.packLabel
		)
			return last.segments;
		const segments = buildScene(input);
		last = { input, segments };
		return segments;
	};
}

/** 物件模板缩略图使用的图块 URL（只取第一块）。 */
export function getImagePreviewUrl(
	image: IDayMapImage,
	assetUrls: Readonly<Record<string, string>>,
	packLabel: string
) {
	const [first] = image.chunks;
	if (!first) return undefined;
	const local = resolveDayMapAssetPath(
		getDayMapChunkPath(image, first),
		packLabel
	);
	return local === null ? undefined : assetUrls[local];
}
