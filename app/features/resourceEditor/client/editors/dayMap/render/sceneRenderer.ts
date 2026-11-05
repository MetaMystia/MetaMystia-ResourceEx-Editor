import { type IMapView } from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';

import { MapTextureStore } from './mapTextureStore';
import {
	type ISceneGeometry,
	SCENE_BATCH_TEXTURE_LIMIT,
	SCENE_VERTEX_STRIDE_BYTES,
	SCENE_WHITE_TEXTURE,
} from './sceneGeometry';

export interface ISceneDrawItem {
	alpha: number;
	geometry: ISceneGeometry;
}

export interface ISceneFrame {
	height: number;
	items: readonly ISceneDrawItem[];
	pixelRatio: number;
	view: IMapView;
	width: number;
}

export interface ISceneRenderer {
	readonly kind: 'canvas' | 'webgl';
	readonly textureStore: MapTextureStore;
	dispose(): void;
	render(frame: ISceneFrame): void;
}

/** 视图中心对齐到设备像素，平移时像素画不会抖动。 */
export function snapViewToDevicePixels(
	view: IMapView,
	pixelRatio: number
): IMapView {
	const unit = view.scale * pixelRatio;
	return {
		scale: view.scale,
		x: Math.round(view.x * unit) / unit,
		y: Math.round(view.y * unit) / unit,
	};
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in vec4 a_color;
in float a_slot;
uniform vec4 u_view;
out vec2 v_uv;
out vec4 v_color;
flat out int v_slot;
void main() {
	v_uv = a_uv;
	v_color = a_color;
	v_slot = int(a_slot + 0.5);
	gl_Position = vec4(
		(a_position.x - u_view.x) * u_view.z,
		(a_position.y - u_view.y) * u_view.w,
		0.0,
		1.0
	);
}`;

function createFragmentShader(slotCount: number) {
	const branches = Array.from(
		{ length: slotCount },
		(_, slot) =>
			`if (slot == ${slot}) return textureGrad(u_textures[${slot}], uv, dx, dy);`
	).join('\n\t');
	return `#version 300 es
precision highp float;
uniform sampler2D u_textures[${slotCount}];
uniform float u_alpha;
in vec2 v_uv;
in vec4 v_color;
flat in int v_slot;
out vec4 outColor;
vec4 sampleSlot(int slot, vec2 uv, vec2 dx, vec2 dy) {
	${branches}
	return vec4(0.0);
}
void main() {
	vec2 dx = dFdx(v_uv);
	vec2 dy = dFdy(v_uv);
	vec4 texel = sampleSlot(v_slot, v_uv, dx, dy);
	float alpha = v_color.a * u_alpha;
	outColor = texel * vec4(v_color.rgb * alpha, alpha);
}`;
}

interface IGpuGeometry {
	frame: number;
	indexBuffer: WebGLBuffer;
	vao: WebGLVertexArrayObject;
	vertexBuffer: WebGLBuffer;
}

interface IGpuTexture {
	bitmap: ImageBitmap;
	texture: WebGLTexture;
}

const MIPMAP_MAX_SIZE_PX = 4096;

class WebGLSceneRenderer implements ISceneRenderer {
	public readonly kind = 'webgl';
	public readonly textureStore: MapTextureStore;
	private readonly canvas: HTMLCanvasElement;
	private frameId = 0;
	private readonly geometries = new Map<ISceneGeometry, IGpuGeometry>();
	private readonly gl: WebGL2RenderingContext;
	private readonly program: WebGLProgram;
	private readonly textures = new Map<string, IGpuTexture>();
	private readonly transparentTexture: WebGLTexture;
	private readonly uniformAlpha: WebGLUniformLocation | null;
	private readonly uniformView: WebGLUniformLocation | null;
	private readonly whiteTexture: WebGLTexture;

	public constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
		this.canvas = canvas;
		this.gl = gl;
		const maxSize: number = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		this.textureStore = new MapTextureStore({
			isFlipped: true,
			maxSize: Math.max(1024, maxSize),
		});
		this.program = this.createProgram();
		this.uniformView = gl.getUniformLocation(this.program, 'u_view');
		this.uniformAlpha = gl.getUniformLocation(this.program, 'u_alpha');
		gl.useProgram(this.program);
		gl.uniform1iv(
			gl.getUniformLocation(this.program, 'u_textures'),
			Array.from({ length: SCENE_BATCH_TEXTURE_LIMIT }, (_, i) => i)
		);
		this.whiteTexture = this.createSolidTexture([255, 255, 255, 255]);
		this.transparentTexture = this.createSolidTexture([0, 0, 0, 0]);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.disable(gl.DEPTH_TEST);
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
	}

	private createShader(type: number, source: string) {
		const { gl } = this;
		const shader = gl.createShader(type);
		if (!shader) throw new Error('无法创建着色器');
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw new Error(`着色器编译失败：${log ?? ''}`);
		}
		return shader;
	}

	private createProgram() {
		const { gl } = this;
		const program = gl.createProgram();
		const vertex = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
		const fragment = this.createShader(
			gl.FRAGMENT_SHADER,
			createFragmentShader(SCENE_BATCH_TEXTURE_LIMIT)
		);
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.bindAttribLocation(program, 0, 'a_position');
		gl.bindAttribLocation(program, 1, 'a_uv');
		gl.bindAttribLocation(program, 2, 'a_color');
		gl.bindAttribLocation(program, 3, 'a_slot');
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(
				`着色器链接失败：${gl.getProgramInfoLog(program) ?? ''}`
			);
		return program;
	}

	private createSolidTexture(color: readonly number[]) {
		const { gl } = this;
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array(color)
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		return texture;
	}

	private getGeometry(geometry: ISceneGeometry) {
		const existing = this.geometries.get(geometry);
		if (existing) {
			existing.frame = this.frameId;
			return existing;
		}
		const { gl } = this;
		const vao = gl.createVertexArray();
		const vertexBuffer = gl.createBuffer();
		const indexBuffer = gl.createBuffer();
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(
			0,
			2,
			gl.FLOAT,
			false,
			SCENE_VERTEX_STRIDE_BYTES,
			0
		);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(
			1,
			2,
			gl.FLOAT,
			false,
			SCENE_VERTEX_STRIDE_BYTES,
			8
		);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(
			2,
			4,
			gl.UNSIGNED_BYTE,
			true,
			SCENE_VERTEX_STRIDE_BYTES,
			16
		);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(
			3,
			1,
			gl.UNSIGNED_BYTE,
			false,
			SCENE_VERTEX_STRIDE_BYTES,
			20
		);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		gl.bufferData(
			gl.ELEMENT_ARRAY_BUFFER,
			geometry.indices,
			gl.STATIC_DRAW
		);
		gl.bindVertexArray(null);
		const entry = { frame: this.frameId, indexBuffer, vao, vertexBuffer };
		this.geometries.set(geometry, entry);
		return entry;
	}

	private getTexture(url: string) {
		if (url === SCENE_WHITE_TEXTURE) return this.whiteTexture;
		const entry = this.textureStore.request(url);
		if (!entry.bitmap) return this.transparentTexture;
		const existing = this.textures.get(url);
		if (existing?.bitmap === entry.bitmap) return existing.texture;
		const { gl } = this;
		if (existing) gl.deleteTexture(existing.texture);
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			entry.bitmap
		);
		const canMipmap =
			entry.bitmap.width <= MIPMAP_MAX_SIZE_PX &&
			entry.bitmap.height <= MIPMAP_MAX_SIZE_PX;
		if (canMipmap) gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MIN_FILTER,
			// 缩小时取最近一级 mipmap 做双线性采样，比三线性少一半取样，像素画观感相同。
			canMipmap ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.textures.set(url, { bitmap: entry.bitmap, texture });
		return texture;
	}

	public render(frame: ISceneFrame) {
		const { canvas, gl } = this;
		this.frameId += 1;
		const width = Math.max(1, Math.round(frame.width * frame.pixelRatio));
		const height = Math.max(1, Math.round(frame.height * frame.pixelRatio));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (gl.isContextLost()) return;
		const view = snapViewToDevicePixels(frame.view, frame.pixelRatio);
		gl.useProgram(this.program);
		gl.uniform4f(
			this.uniformView,
			view.x,
			view.y,
			(2 * view.scale) / frame.width,
			(2 * view.scale) / frame.height
		);
		for (const item of frame.items) {
			if (item.geometry.indexCount === 0 || item.alpha <= 0) continue;
			const gpu = this.getGeometry(item.geometry);
			gl.bindVertexArray(gpu.vao);
			gl.uniform1f(this.uniformAlpha, item.alpha);
			for (const range of item.geometry.ranges) {
				range.textures.forEach((url, slot) => {
					gl.activeTexture(gl.TEXTURE0 + slot);
					gl.bindTexture(gl.TEXTURE_2D, this.getTexture(url));
				});
				gl.drawElements(
					gl.TRIANGLES,
					range.indexCount,
					gl.UNSIGNED_INT,
					range.indexStart * 4
				);
			}
		}
		gl.bindVertexArray(null);
		for (const [geometry, gpu] of this.geometries) {
			if (gpu.frame === this.frameId) continue;
			gl.deleteVertexArray(gpu.vao);
			gl.deleteBuffer(gpu.vertexBuffer);
			gl.deleteBuffer(gpu.indexBuffer);
			this.geometries.delete(geometry);
		}
		for (const [url, texture] of this.textures) {
			const entry = this.textureStore.get(url);
			if (entry?.bitmap === texture.bitmap) continue;
			gl.deleteTexture(texture.texture);
			this.textures.delete(url);
		}
	}

	public dispose() {
		const { gl } = this;
		for (const gpu of this.geometries.values()) {
			gl.deleteVertexArray(gpu.vao);
			gl.deleteBuffer(gpu.vertexBuffer);
			gl.deleteBuffer(gpu.indexBuffer);
		}
		this.geometries.clear();
		for (const texture of this.textures.values())
			gl.deleteTexture(texture.texture);
		this.textures.clear();
		gl.deleteTexture(this.whiteTexture);
		gl.deleteTexture(this.transparentTexture);
		gl.deleteProgram(this.program);
		this.textureStore.dispose();
	}
}

/** WebGL 不可用时的回退：逐三角形仿射贴图，结果相同但大地图较慢。 */
class CanvasSceneRenderer implements ISceneRenderer {
	public readonly kind = 'canvas';
	public readonly textureStore = new MapTextureStore({
		isFlipped: false,
		maxSize: 16384,
	});

	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;

	public constructor(
		canvas: HTMLCanvasElement,
		context: CanvasRenderingContext2D
	) {
		this.canvas = canvas;
		this.context = context;
	}

	public render(frame: ISceneFrame) {
		const { canvas, context } = this;
		const width = Math.max(1, Math.round(frame.width * frame.pixelRatio));
		const height = Math.max(1, Math.round(frame.height * frame.pixelRatio));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, width, height);
		context.imageSmoothingEnabled = false;
		const view = snapViewToDevicePixels(frame.view, frame.pixelRatio);
		const scale = view.scale * frame.pixelRatio;
		const stride = SCENE_VERTEX_STRIDE_BYTES / 4;
		for (const item of frame.items) {
			const { geometry } = item;
			const floats = new Float32Array(geometry.vertices);
			const bytes = new Uint8Array(geometry.vertices);
			const readPoint = (id: number): readonly [number, number] => [
				width / 2 + ((floats[id * stride] ?? 0) - view.x) * scale,
				height / 2 - ((floats[id * stride + 1] ?? 0) - view.y) * scale,
			];
			for (const range of geometry.ranges) {
				const end = range.indexStart + range.indexCount;
				let i = range.indexStart;
				while (i + 2 < end) {
					const triangle = [
						geometry.indices[i] ?? 0,
						geometry.indices[i + 1] ?? 0,
						geometry.indices[i + 2] ?? 0,
					] as const;
					const byteOffset =
						triangle[0] * SCENE_VERTEX_STRIDE_BYTES + 16;
					const url =
						range.textures[bytes[byteOffset + 4] ?? 0] ??
						SCENE_WHITE_TEXTURE;
					const bitmap =
						url === SCENE_WHITE_TEXTURE
							? null
							: this.textureStore.request(url).bitmap;
					const readUv = (id: number): readonly [number, number] => [
						(floats[id * stride + 2] ?? 0) * (bitmap?.width ?? 1),
						(1 - (floats[id * stride + 3] ?? 0)) *
							(bitmap?.height ?? 1),
					];
					const matrix = getAffineMatrix(
						triangle.map(readUv),
						triangle.map(readPoint)
					);
					// 同一贴图映射的相邻三角形合成四边形一起裁切，避免对角线接缝。
					let outline: readonly number[] = triangle;
					const isPlaceholder = url === SCENE_WHITE_TEXTURE;
					if (i + 5 < end && (matrix || isPlaceholder)) {
						const next = [
							geometry.indices[i + 3] ?? 0,
							geometry.indices[i + 4] ?? 0,
							geometry.indices[i + 5] ?? 0,
						] as const;
						const quad = mergeTriangles(triangle, next, readPoint);
						const extra = quad?.find(
							(id) => !triangle.includes(id)
						);
						if (
							quad &&
							extra !== undefined &&
							(isPlaceholder ||
								(matrix &&
									matchesAffine(
										matrix,
										readUv(extra),
										readPoint(extra)
									)))
						)
							outline = quad;
					}
					i += outline.length === 4 ? 6 : 3;
					const alpha =
						((bytes[byteOffset + 3] ?? 255) / 255) * item.alpha;
					if (alpha <= 0 || (url !== SCENE_WHITE_TEXTURE && !bitmap))
						continue;
					context.save();
					context.globalAlpha = alpha;
					context.beginPath();
					outline.forEach((id, index) => {
						const [x, y] = readPoint(id);
						if (index) context.lineTo(x, y);
						else context.moveTo(x, y);
					});
					context.closePath();
					if (!bitmap) {
						const r = bytes[byteOffset] ?? 255;
						const g = bytes[byteOffset + 1] ?? 255;
						const b = bytes[byteOffset + 2] ?? 255;
						context.fillStyle = `rgb(${r} ${g} ${b})`;
						context.fill();
					} else if (matrix) {
						context.clip();
						context.transform(...matrix);
						context.drawImage(bitmap, 0, 0);
					}
					context.restore();
				}
			}
		}
	}

	public dispose() {
		this.textureStore.dispose();
	}
}

type TAffineMatrix = [number, number, number, number, number, number];

/** 求把贴图坐标映射到屏幕坐标的仿射矩阵；退化三角形返回空。 */
function getAffineMatrix(
	uv: readonly (readonly [number, number])[],
	points: readonly (readonly [number, number])[]
): TAffineMatrix | null {
	const [u0, v0] = uv[0] ?? [0, 0];
	const [u1, v1] = uv[1] ?? [0, 0];
	const [u2, v2] = uv[2] ?? [0, 0];
	const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
	if (Math.abs(det) < 1e-10) return null;
	const solve = (axis: 0 | 1) => {
		const p0 = points[0]?.[axis] ?? 0;
		const p1 = points[1]?.[axis] ?? 0;
		const p2 = points[2]?.[axis] ?? 0;
		const a = ((p1 - p0) * (v2 - v0) - (p2 - p0) * (v1 - v0)) / det;
		const b = ((u1 - u0) * (p2 - p0) - (u2 - u0) * (p1 - p0)) / det;
		return [a, b, p0 - a * u0 - b * v0] as const;
	};
	const [a, c, e] = solve(0);
	const [b, d, f] = solve(1);
	return [a, b, c, d, e, f];
}

function matchesAffine(
	[a, b, c, d, e, f]: TAffineMatrix,
	[u, v]: readonly [number, number],
	[x, y]: readonly [number, number]
) {
	return (
		Math.abs(a * u + c * v + e - x) < 0.5 &&
		Math.abs(b * u + d * v + f - y) < 0.5
	);
}

/** 共享一条边且位于两侧的三角形合并成四边形轮廓。 */
function mergeTriangles(
	first: readonly number[],
	second: readonly number[],
	readPoint: (id: number) => readonly [number, number]
): number[] | null {
	const shared = first.filter((id) => second.includes(id));
	const own = first.find((id) => !second.includes(id));
	const other = second.find((id) => !first.includes(id));
	const [p, q] = shared;
	if (shared.length !== 2 || own === undefined || other === undefined)
		return null;
	if (p === undefined || q === undefined) return null;
	const [px, py] = readPoint(p);
	const [qx, qy] = readPoint(q);
	const side = (id: number) => {
		const [x, y] = readPoint(id);
		return (qx - px) * (y - py) - (qy - py) * (x - px);
	};
	return side(own) * side(other) < 0 ? [own, p, other, q] : null;
}

export interface ISceneRendererHandle {
	canvas: HTMLCanvasElement;
	renderer: ISceneRenderer;
}

/** 优先 WebGL2；同一画布拿到 WebGL 上下文后不能再取 2D，因此回退时换新画布。 */
export function createSceneRenderer(): ISceneRendererHandle {
	const canvas = document.createElement('canvas');
	try {
		const gl = canvas.getContext('webgl2', {
			alpha: true,
			antialias: false,
			depth: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
			stencil: false,
		});
		if (gl) return { canvas, renderer: new WebGLSceneRenderer(canvas, gl) };
	} catch {
		// 回退到 Canvas 2D。
	}
	const fallbackCanvas = document.createElement('canvas');
	const context = fallbackCanvas.getContext('2d');
	if (!context) throw new Error('浏览器无法创建地图画布。');
	return {
		canvas: fallbackCanvas,
		renderer: new CanvasSceneRenderer(fallbackCanvas, context),
	};
}
