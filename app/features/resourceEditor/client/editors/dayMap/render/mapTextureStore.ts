export type TMapImageStatus = 'error' | 'loaded' | 'loading';

export interface IMapImageEntry {
	/** 已解码图片；WebGL 使用时已上下翻转并预乘透明度。 */
	bitmap: ImageBitmap | null;
	/** 原图尺寸。超过显卡上限时位图会缩小，UV 仍按原图计算。 */
	height: number;
	status: TMapImageStatus;
	url: string;
	width: number;
}

interface IMapTextureStoreOptions {
	isFlipped: boolean;
	maxSize: number;
}

/** 按 blob URL 解码地图图集，图片就绪后批量通知画布重建。 */
export class MapTextureStore {
	private readonly entries = new Map<string, IMapImageEntry>();
	private readonly listeners = new Set<() => void>();
	private isDisposed = false;
	private isNotifyScheduled = false;
	private readonly options: IMapTextureStoreOptions;
	private version = 0;

	public constructor(options: IMapTextureStoreOptions) {
		this.options = options;
	}

	public getVersion() {
		return this.version;
	}

	public get(url: string) {
		return this.entries.get(url);
	}

	public request(url: string): IMapImageEntry {
		const existing = this.entries.get(url);
		if (existing) return existing;
		const entry: IMapImageEntry = {
			bitmap: null,
			height: 0,
			status: 'loading',
			url,
			width: 0,
		};
		this.entries.set(url, entry);
		void this.load(entry);
		return entry;
	}

	public subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** 释放当前地图不再引用的位图。 */
	public retain(urls: ReadonlySet<string>) {
		for (const [url, entry] of this.entries) {
			if (urls.has(url)) continue;
			entry.bitmap?.close();
			entry.bitmap = null;
			this.entries.delete(url);
		}
	}

	public dispose() {
		this.isDisposed = true;
		for (const entry of this.entries.values()) entry.bitmap?.close();
		this.entries.clear();
		this.listeners.clear();
	}

	private async load(entry: IMapImageEntry) {
		try {
			const response = await fetch(entry.url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const blob = await response.blob();
			const premultiplyAlpha = this.options.isFlipped
				? 'premultiply'
				: 'default';
			let bitmap = await createImageBitmap(blob, {
				colorSpaceConversion: 'none',
				imageOrientation: this.options.isFlipped
					? 'flipY'
					: 'from-image',
				premultiplyAlpha,
			});
			const { height, width } = bitmap;
			const ratio = Math.min(
				1,
				this.options.maxSize / Math.max(width, height)
			);
			if (ratio < 1) {
				// 源位图已翻转，缩放时保持当前方向。
				const resized = await createImageBitmap(bitmap, {
					imageOrientation: 'from-image',
					premultiplyAlpha,
					resizeHeight: Math.max(1, Math.floor(height * ratio)),
					resizeQuality: 'high',
					resizeWidth: Math.max(1, Math.floor(width * ratio)),
				});
				bitmap.close();
				bitmap = resized;
			}
			if (this.isDisposed || this.entries.get(entry.url) !== entry) {
				bitmap.close();
				return;
			}
			entry.bitmap = bitmap;
			entry.width = width;
			entry.height = height;
			entry.status = 'loaded';
		} catch {
			if (this.isDisposed || this.entries.get(entry.url) !== entry)
				return;
			entry.status = 'error';
		}
		this.scheduleNotify();
	}

	private scheduleNotify() {
		if (this.isNotifyScheduled) return;
		this.isNotifyScheduled = true;
		requestAnimationFrame(() => {
			this.isNotifyScheduled = false;
			if (this.isDisposed) return;
			this.version += 1;
			this.listeners.forEach((listener) => listener());
		});
	}
}
