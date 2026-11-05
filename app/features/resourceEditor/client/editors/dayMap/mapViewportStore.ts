'use client';

import { useSyncExternalStore } from 'react';

import { type IMapPoint } from './dayMapEditorModel';

export interface IMapViewportStatus {
	/** 光标所在世界坐标；离开画布时为空。 */
	cursor: IMapPoint | null;
	/** 光标下的内容说明，例如瓦片键、坡度或实体名称。 */
	detail: string;
	renderer: 'canvas' | 'webgl' | null;
	scale: number;
}

const INITIAL_STATUS: IMapViewportStatus = {
	cursor: null,
	detail: '',
	renderer: null,
	scale: 48,
};

/** 画布状态的外部存储：指针移动只重绘订阅它的状态栏，不重渲染整个编辑器。 */
export class MapViewportStore {
	private listeners = new Set<() => void>();
	private status: IMapViewportStatus = INITIAL_STATUS;

	public readonly getSnapshot = () => this.status;

	public readonly subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	public update(patch: Partial<IMapViewportStatus>) {
		const next = { ...this.status, ...patch };
		if (
			next.cursor?.x === this.status.cursor?.x &&
			next.cursor?.y === this.status.cursor?.y &&
			next.detail === this.status.detail &&
			next.renderer === this.status.renderer &&
			next.scale === this.status.scale
		)
			return;
		this.status = next;
		this.listeners.forEach((listener) => listener());
	}
}

export function useMapViewportStatus(store: MapViewportStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);
}
