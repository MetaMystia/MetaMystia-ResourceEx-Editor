import type {
	IDayMap,
	IDayMapCell,
	IDayMapLayer,
	IDayMapObject,
	IDayMapPlacement,
	IDayMapTile,
} from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';

import { hasSpecialShader } from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import { getCachedTileVertices } from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';

import { type MapTextureStore } from './mapTextureStore';

/** 位置 2×f32、UV 2×f32、颜色 4×u8、纹理槽 1×u8 与 3 字节对齐。 */
export const SCENE_VERTEX_STRIDE_BYTES = 24;
export const SCENE_BATCH_TEXTURE_LIMIT = 8;
/** 空字符串表示 1×1 白色纹理，用于缺图占位。 */
export const SCENE_WHITE_TEXTURE = '';

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

export interface ISceneSegment {
	geometry: ISceneGeometry;
	layerIndex: number | null;
}

export interface ISceneItem {
	placement?: IDayMapPlacement;
	scaleX?: number;
	scaleY?: number;
	tile: string;
	x: number;
	y: number;
}

export interface ISceneBuildInput {
	assetUrls: Readonly<Record<string, string>>;
	hiddenLayers: ReadonlySet<number>;
	map: IDayMap;
	packLabel: string;
	shouldShowMaterialSources: boolean;
	textureStore: MapTextureStore;
}

const QUAD_TRIANGLES = [0, 1, 2, 0, 2, 3] as const;
const PLACEHOLDER_COLOR = [217, 70, 239, 102] as const;

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

	public constructor(vertexCapacity: number, indexCapacity: number) {
		this.vertexBuffer = new ArrayBuffer(
			Math.max(4, vertexCapacity) * SCENE_VERTEX_STRIDE_BYTES
		);
		this.floats = new Float32Array(this.vertexBuffer);
		this.bytes = new Uint8Array(this.vertexBuffer);
		this.indexData = new Uint32Array(Math.max(6, indexCapacity));
	}

	public reserve(vertexCount: number, indexCount: number) {
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
	public useTexture(texture: string) {
		const slot = this.rangeTextures.indexOf(texture);
		if (slot >= 0) return slot;
		if (this.rangeTextures.length >= SCENE_BATCH_TEXTURE_LIMIT) {
			this.closeRange();
		}
		this.rangeTextures.push(texture);
		return this.rangeTextures.length - 1;
	}

	public addVertex(
		x: number,
		y: number,
		u: number,
		v: number,
		color: readonly number[],
		slot: number
	) {
		const offset = this.vertexCount * (SCENE_VERTEX_STRIDE_BYTES / 4);
		this.floats[offset] = x;
		this.floats[offset + 1] = y;
		this.floats[offset + 2] = u;
		this.floats[offset + 3] = v;
		const byteOffset = this.vertexCount * SCENE_VERTEX_STRIDE_BYTES + 16;
		this.bytes[byteOffset] = color[0] ?? 255;
		this.bytes[byteOffset + 1] = color[1] ?? 255;
		this.bytes[byteOffset + 2] = color[2] ?? 255;
		this.bytes[byteOffset + 3] = color[3] ?? 255;
		this.bytes[byteOffset + 4] = slot;
		this.vertexCount += 1;
	}

	public addIndex(index: number) {
		this.indexData[this.indexCount] = index;
		this.indexCount += 1;
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

interface IItemContext {
	readImage: (path: string) => {
		height: number;
		status: 'error' | 'loaded' | 'loading' | 'missing';
		url: string;
		width: number;
	};
	shouldShowMaterialSources: boolean;
}

function toColorByte(value: number) {
	return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

const colorBytes: number[] = [255, 255, 255, 255];

function appendPlaceholder(
	writer: GeometryWriter,
	tile: IDayMapTile,
	x: number,
	y: number,
	scaleX: number,
	scaleY: number,
	placement: IDayMapPlacement | undefined,
	alpha: number
) {
	const vertices = getCachedTileVertices(tile);
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const [vx = 0, vy = 0] of vertices) {
		minX = Math.min(minX, vx);
		minY = Math.min(minY, vy);
		maxX = Math.max(maxX, vx);
		maxY = Math.max(maxY, vy);
	}
	if (!(maxX - minX > 0) || !(maxY - minY > 0)) {
		minX = 0;
		minY = 0;
		maxX = 1;
		maxY = 1;
	}
	const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] =
		placement?.transform ?? [];
	const slot = writer.useTexture(SCENE_WHITE_TEXTURE);
	const base = writer.vertexCount;
	writer.reserve(4, 6);
	const color = [
		PLACEHOLDER_COLOR[0],
		PLACEHOLDER_COLOR[1],
		PLACEHOLDER_COLOR[2],
		Math.round(PLACEHOLDER_COLOR[3] * alpha),
	];
	for (const [vx, vy] of [
		[minX, minY],
		[maxX, minY],
		[maxX, maxY],
		[minX, maxY],
	] as const) {
		const px = vx * scaleX;
		const py = vy * scaleY;
		writer.addVertex(
			x + a * px + c * py + tx,
			y + b * px + d * py + ty,
			0.5,
			0.5,
			color,
			slot
		);
	}
	for (const index of QUAD_TRIANGLES) writer.addIndex(base + index);
}

function appendItem(
	writer: GeometryWriter,
	context: IItemContext,
	tile: IDayMapTile,
	x: number,
	y: number,
	scaleX: number,
	scaleY: number,
	placement: IDayMapPlacement | undefined,
	color: readonly number[] | undefined,
	alpha: number
) {
	if (placement?.active === false) return;
	if (
		!context.shouldShowMaterialSources &&
		placement &&
		hasSpecialShader(placement)
	)
		return;
	const image = context.readImage(tile.image);
	const mesh = tile.mesh;
	let uvs: readonly (readonly number[])[];
	if (mesh) {
		if (image.status === 'missing' || image.status === 'error') {
			appendPlaceholder(
				writer,
				tile,
				x,
				y,
				scaleX,
				scaleY,
				placement,
				alpha
			);
			return;
		}
		uvs = mesh.uvs;
	} else {
		if (image.status === 'loading') return;
		const [left = 0, bottom = 0, width = 0, height = 0] = tile.rect;
		if (
			image.status !== 'loaded' ||
			!(width > 0) ||
			!(height > 0) ||
			left < 0 ||
			bottom < 0 ||
			left + width > image.width ||
			bottom + height > image.height
		) {
			appendPlaceholder(
				writer,
				tile,
				x,
				y,
				scaleX,
				scaleY,
				placement,
				alpha
			);
			return;
		}
		const u0 = left / image.width;
		const u1 = (left + width) / image.width;
		const v0 = bottom / image.height;
		const v1 = (bottom + height) / image.height;
		uvs = [
			[u0, v0],
			[u1, v0],
			[u1, v1],
			[u0, v1],
		];
	}
	const vertices = getCachedTileVertices(tile);
	const triangles: readonly number[] = mesh?.triangles ?? QUAD_TRIANGLES;
	if (vertices.length < 3 || triangles.length < 3) return;
	const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] =
		placement?.transform ?? [];
	colorBytes[0] = toColorByte(color?.[0] ?? 1);
	colorBytes[1] = toColorByte(color?.[1] ?? 1);
	colorBytes[2] = toColorByte(color?.[2] ?? 1);
	colorBytes[3] = toColorByte((color?.[3] ?? 1) * alpha);
	const slot = writer.useTexture(image.url);
	const base = writer.vertexCount;
	writer.reserve(vertices.length, triangles.length);
	for (let i = 0; i < vertices.length; i++) {
		const vertex = vertices[i];
		const uv = uvs[i];
		const px = (vertex?.[0] ?? 0) * scaleX;
		const py = (vertex?.[1] ?? 0) * scaleY;
		writer.addVertex(
			x + a * px + c * py + tx,
			y + b * px + d * py + ty,
			uv?.[0] ?? 0,
			uv?.[1] ?? 0,
			colorBytes,
			slot
		);
	}
	for (const index of triangles)
		writer.addIndex(
			base + (index >= 0 && index < vertices.length ? index : 0)
		);
}

function multiplyColors(
	cell: readonly number[] | undefined,
	layer: readonly number[] | undefined
) {
	if (!layer) return cell;
	const base = cell ?? [1, 1, 1, 1];
	return base.map((value, index) => value * (layer[index] ?? 1));
}

function getSortingRank(layer: string) {
	return layer === 'Background'
		? 0
		: layer === 'Character'
			? 1
			: layer === 'Overlay'
				? 2
				: 1;
}

/** 与原画布一致的绘制顺序：排序层优先，同层按排序顺序；按 Y 排序的装饰用 -32×Y。 */
export function getSceneDrawOrder(map: IDayMap) {
	const entries: {
		index: number;
		kind: 'layer' | 'object';
		order: number;
		rank: number;
	}[] = [];
	map.layers.forEach((layer, index) =>
		entries.push({
			index,
			kind: 'layer',
			order: layer.sortingOrder,
			rank: layer.sortingValue ?? getSortingRank(layer.sortingLayer),
		})
	);
	map.objects.forEach((object, index) =>
		entries.push({
			index,
			kind: 'object',
			order: object.sortByY
				? Math.trunc(-32 * object.y)
				: object.sortingOrder,
			rank: object.sortingValue ?? getSortingRank(object.sortingLayer),
		})
	);
	return entries.sort((a, b) => a.rank - b.rank || a.order - b.order);
}

interface IContextKey {
	assetUrls: Readonly<Record<string, string>>;
	packLabel: string;
	shouldShowMaterialSources: boolean;
	textureVersion: number;
	tiles: readonly IDayMapTile[];
}

function isSameContext(a: IContextKey, b: IContextKey) {
	return (
		a.assetUrls === b.assetUrls &&
		a.packLabel === b.packLabel &&
		a.shouldShowMaterialSources === b.shouldShowMaterialSources &&
		a.textureVersion === b.textureVersion &&
		a.tiles === b.tiles
	);
}

const tileIndexCache = new WeakMap<
	readonly IDayMapTile[],
	ReadonlyMap<string, IDayMapTile>
>();

export function getTileIndex(tiles: readonly IDayMapTile[]) {
	let index = tileIndexCache.get(tiles);
	if (!index) {
		const next = new Map<string, IDayMapTile>();
		for (const tile of tiles)
			if (!next.has(tile.key)) next.set(tile.key, tile);
		index = next;
		tileIndexCache.set(tiles, index);
	}
	return index;
}

export function resolveMapImageUrl(
	path: string,
	packLabel: string,
	assetUrls: Readonly<Record<string, string>>
) {
	const localPath = resolveDayMapAssetPath(path, packLabel);
	return localPath === null ? null : (assetUrls[localPath] ?? null);
}

/** 分块边界由格子坐标决定，增删格子只影响附近的块，块内保持原数组顺序。 */
const LAYER_BLOCK_MAX_CELLS = 2048;

function isLayerBlockBoundary(cell: IDayMapCell) {
	const hash =
		Math.imul(cell.x | 0, 73856093) ^ Math.imul(cell.y | 0, 19349663);
	return (hash & 255) === 0;
}

interface ILayerBlockEntry {
	cells: readonly IDayMapCell[];
	context: IContextKey;
	geometry: ISceneGeometry;
	layer: IDayMapPlacement & { color?: number[] };
}

/** 每个视口持有一份缓存：未变化的图层与格子块直接复用顶点数据。 */
export function createSceneBuilder() {
	// 只保留当前地图的图层；历史记录中的旧图层不占用顶点内存。
	const layerCache = new Map<
		IDayMapLayer,
		{ context: IContextKey; geometries: ISceneGeometry[] }
	>();
	// 以块首格为键：绘制时只有被改动的块重建，其余块沿用。
	const blockCache = new WeakMap<IDayMapCell, ILayerBlockEntry>();
	let objectCache: {
		context: IContextKey;
		objects: readonly IDayMapObject[];
		runs: Map<string, ISceneGeometry>;
	} | null = null;
	let urlCache: {
		assetUrls: Readonly<Record<string, string>>;
		packLabel: string;
		urls: Map<string, string | null>;
	} | null = null;
	// 平移和缩放时输入不变，直接复用上一帧的分段。
	let lastBuild: {
		context: IContextKey;
		hiddenLayers: ReadonlySet<number>;
		map: IDayMap;
		segments: ISceneSegment[];
	} | null = null;

	function createItemContext(input: ISceneBuildInput): IItemContext {
		if (
			urlCache?.assetUrls !== input.assetUrls ||
			urlCache.packLabel !== input.packLabel
		)
			urlCache = {
				assetUrls: input.assetUrls,
				packLabel: input.packLabel,
				urls: new Map(),
			};
		const urls = urlCache.urls;
		return {
			readImage(path) {
				let url = urls.get(path);
				if (url === undefined) {
					url = resolveMapImageUrl(
						path,
						input.packLabel,
						input.assetUrls
					);
					urls.set(path, url);
				}
				if (url === null)
					return { height: 0, status: 'missing', url: '', width: 0 };
				const entry = input.textureStore.request(url);
				return {
					height: entry.height,
					status: entry.status,
					url,
					width: entry.width,
				};
			},
			shouldShowMaterialSources: input.shouldShowMaterialSources,
		};
	}

	function buildBlock(
		layer: IDayMapLayer,
		cells: readonly IDayMapCell[],
		tiles: ReadonlyMap<string, IDayMapTile>,
		context: IItemContext
	) {
		const writer = new GeometryWriter(cells.length * 4, cells.length * 6);
		const layerPlacement: IDayMapPlacement = layer;
		for (const cell of cells) {
			const tile = tiles.get(cell.tile);
			if (!tile) continue;
			const placement =
				layerPlacement.shader === undefined &&
				layerPlacement.transform === undefined
					? cell
					: {
							...(layerPlacement.shader === undefined
								? {}
								: { shader: layerPlacement.shader }),
							...(layerPlacement.transform === undefined
								? {}
								: { transform: layerPlacement.transform }),
							...cell,
						};
			appendItem(
				writer,
				context,
				tile,
				cell.x,
				cell.y,
				1,
				1,
				placement,
				multiplyColors(cell.color, layer.color),
				1
			);
		}
		return writer.finish();
	}

	function isSameBlock(
		entry: ILayerBlockEntry | undefined,
		layer: IDayMapLayer,
		cells: readonly IDayMapCell[],
		contextKey: IContextKey
	) {
		if (
			!entry ||
			entry.cells.length !== cells.length ||
			entry.layer.color !== layer.color ||
			entry.layer.shader !== layer.shader ||
			entry.layer.transform !== layer.transform ||
			!isSameContext(entry.context, contextKey)
		)
			return false;
		for (let i = 0; i < cells.length; i++)
			if (entry.cells[i] !== cells[i]) return false;
		return true;
	}

	function buildLayerGeometries(
		layer: IDayMapLayer,
		tiles: ReadonlyMap<string, IDayMapTile>,
		context: IItemContext,
		contextKey: IContextKey
	) {
		const geometries: ISceneGeometry[] = [];
		let start = 0;
		const flush = (end: number) => {
			if (end <= start) return;
			const cells = layer.cells.slice(start, end);
			const first = cells[0];
			start = end;
			if (!first) return;
			const cached = blockCache.get(first);
			if (isSameBlock(cached, layer, cells, contextKey) && cached) {
				geometries.push(cached.geometry);
				return;
			}
			const geometry = buildBlock(layer, cells, tiles, context);
			blockCache.set(first, {
				cells,
				context: contextKey,
				geometry,
				layer: {
					...(layer.color === undefined
						? {}
						: { color: layer.color }),
					...(layer.shader === undefined
						? {}
						: { shader: layer.shader }),
					...(layer.transform === undefined
						? {}
						: { transform: layer.transform }),
				},
			});
			geometries.push(geometry);
		};
		layer.cells.forEach((cell, index) => {
			if (
				isLayerBlockBoundary(cell) ||
				index + 1 - start >= LAYER_BLOCK_MAX_CELLS
			)
				flush(index + 1);
		});
		flush(layer.cells.length);
		return geometries;
	}

	function buildObjects(
		objects: readonly IDayMapObject[],
		indices: readonly number[],
		tiles: ReadonlyMap<string, IDayMapTile>,
		context: IItemContext
	) {
		const writer = new GeometryWriter(
			indices.length * 4,
			indices.length * 6
		);
		for (const index of indices) {
			const object = objects[index];
			const tile = object && tiles.get(object.tile);
			if (!object || !tile) continue;
			appendItem(
				writer,
				context,
				tile,
				object.x,
				object.y,
				object.scale[0] ?? 1,
				object.scale[1] ?? 1,
				object,
				object.color,
				1
			);
		}
		return writer.finish();
	}

	return {
		build(input: ISceneBuildInput): ISceneSegment[] {
			const { map } = input;
			const contextKey: IContextKey = {
				assetUrls: input.assetUrls,
				packLabel: input.packLabel,
				shouldShowMaterialSources: input.shouldShowMaterialSources,
				textureVersion: input.textureStore.getVersion(),
				tiles: map.tiles,
			};
			if (
				lastBuild?.map === map &&
				lastBuild.hiddenLayers === input.hiddenLayers &&
				isSameContext(lastBuild.context, contextKey)
			)
				return lastBuild.segments;
			const context = createItemContext(input);
			const tiles = getTileIndex(map.tiles);
			if (
				!objectCache ||
				objectCache.objects !== map.objects ||
				!isSameContext(objectCache.context, contextKey)
			)
				objectCache = {
					context: contextKey,
					objects: map.objects,
					runs: new Map(),
				};
			const segments: ISceneSegment[] = [];
			let run: number[] = [];
			const flushRun = () => {
				if (run.length === 0 || !objectCache) return;
				const key = run.join(',');
				let geometry = objectCache.runs.get(key);
				if (!geometry) {
					geometry = buildObjects(map.objects, run, tiles, context);
					objectCache.runs.set(key, geometry);
				}
				segments.push({ geometry, layerIndex: null });
				run = [];
			};
			for (const entry of getSceneDrawOrder(map)) {
				if (entry.kind === 'object') {
					run.push(entry.index);
					continue;
				}
				flushRun();
				const layer = map.layers[entry.index];
				if (
					!layer ||
					layer.active === false ||
					input.hiddenLayers.has(entry.index)
				)
					continue;
				const cached = layerCache.get(layer);
				let geometries = cached?.geometries;
				if (!cached || !isSameContext(cached.context, contextKey)) {
					geometries = buildLayerGeometries(
						layer,
						tiles,
						context,
						contextKey
					);
					layerCache.set(layer, { context: contextKey, geometries });
				}
				for (const geometry of geometries ?? [])
					segments.push({ geometry, layerIndex: entry.index });
			}
			flushRun();
			if (layerCache.size > map.layers.length) {
				const current = new Set(map.layers);
				for (const layer of layerCache.keys())
					if (!current.has(layer)) layerCache.delete(layer);
			}
			lastBuild = {
				context: contextKey,
				hiddenLayers: input.hiddenLayers,
				map,
				segments,
			};
			return segments;
		},
		buildItems(
			input: ISceneBuildInput,
			items: readonly ISceneItem[],
			alpha: number
		): ISceneGeometry {
			const context = createItemContext(input);
			const tiles = getTileIndex(input.map.tiles);
			const writer = new GeometryWriter(
				items.length * 4,
				items.length * 6
			);
			for (const item of items) {
				const tile = tiles.get(item.tile);
				if (!tile) continue;
				appendItem(
					writer,
					{ ...context, shouldShowMaterialSources: true },
					tile,
					item.x,
					item.y,
					item.scaleX ?? 1,
					item.scaleY ?? 1,
					item.placement,
					item.placement?.color,
					alpha
				);
			}
			return writer.finish();
		},
	};
}

export type TSceneBuilder = ReturnType<typeof createSceneBuilder>;
