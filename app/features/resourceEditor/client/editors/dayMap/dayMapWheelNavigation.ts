import { type IMapPoint } from './dayMapEditorModel';

const LINE_HEIGHT_PX = 16;
const PINCH_EXPONENT = 0.01;
const WHEEL_AXIS_WINDOW_MS = 32;
const WHEEL_GESTURE_IDLE_MS = 150;
const WHEEL_ZOOM_EPSILON = 0.001;
const WHEEL_ZOOM_EXPONENT = Math.log(1.3);
const WHEEL_ZOOM_INTERVAL_MS = 80;
const WHEEL_ZOOM_SMOOTHING_MS = 80;

interface IMapWheelNavigationHandlers {
	getScale(): number;
	isReducedMotion(): boolean;
	onPan(deltaX: number, deltaY: number, event: WheelEvent): void;
	onZoom(factor: number, anchor: IMapPoint): void;
}

export interface IMapWheelNavigation {
	cancel(): void;
	dispose(): void;
}

function readGestureScale(event: Event) {
	const scale: unknown = Reflect.get(event, 'scale');
	return typeof scale === 'number' && Number.isFinite(scale) && scale > 0
		? scale
		: null;
}

/**
 * 滚轮与触控板导航。不猜测输入设备：纵向滚动按固定步长缩放，
 * Ctrl/⌘ 滚轮（Chromium、Firefox 的捏合）和 WebKit 手势连续缩放，
 * 带横向分量的滚动在本次手势内平移。规则取自小助手地图的 useViewportNavigation。
 */
export function createMapWheelNavigation(
	container: HTMLElement,
	{ getScale, isReducedMotion, onPan, onZoom }: IMapWheelNavigationHandlers
): IMapWheelNavigation {
	let axisMode: 'pan' | 'zoom' | null = null;
	let axisTimeout: ReturnType<typeof setTimeout> | null = null;
	let gestureStartScale: number | null = null;
	let lastWheelAt = Number.NEGATIVE_INFINITY;
	let lastZoomFrameAt: number | null = null;
	let nextZoomAt = Number.NEGATIVE_INFINITY;
	let pendingAxis: {
		anchor: IMapPoint;
		deltaY: number;
		direction: -1 | 1;
		time: number;
	} | null = null;
	let pendingZoomLog = 0;
	let zoomAnchor: IMapPoint | null = null;
	let zoomFrame: number | null = null;

	function clearZoom() {
		if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
		lastZoomFrameAt = null;
		pendingZoomLog = 0;
		zoomAnchor = null;
		zoomFrame = null;
	}

	function clearPendingAxis() {
		if (axisTimeout !== null) clearTimeout(axisTimeout);
		axisTimeout = null;
		pendingAxis = null;
	}

	function clearAxis() {
		clearPendingAxis();
		axisMode = null;
		nextZoomAt = Number.NEGATIVE_INFINITY;
	}

	function cancel() {
		clearAxis();
		clearZoom();
	}

	function flushZoom(now: number) {
		zoomFrame = null;
		const anchor = zoomAnchor;
		if (!anchor) {
			clearZoom();
			return;
		}
		const elapsedMs = Math.max(0, now - (lastZoomFrameAt ?? now));
		lastZoomFrameAt = now;
		const progress = 1 - Math.exp(-elapsedMs / WHEEL_ZOOM_SMOOTHING_MS);
		const remainingLog = pendingZoomLog * (1 - progress);
		if (Math.abs(remainingLog) <= WHEEL_ZOOM_EPSILON) {
			onZoom(Math.exp(pendingZoomLog), anchor);
			clearZoom();
			return;
		}
		onZoom(Math.exp(pendingZoomLog - remainingLog), anchor);
		pendingZoomLog = remainingLog;
		zoomFrame = requestAnimationFrame(flushZoom);
	}

	function queueZoom(direction: -1 | 1, anchor: IMapPoint, now: number) {
		if (now < nextZoomAt) return;
		nextZoomAt = now + WHEEL_ZOOM_INTERVAL_MS;
		if (isReducedMotion()) {
			onZoom(Math.exp(-direction * WHEEL_ZOOM_EXPONENT), anchor);
			return;
		}
		pendingZoomLog -= direction * WHEEL_ZOOM_EXPONENT;
		zoomAnchor = anchor;
		lastZoomFrameAt ??= now;
		zoomFrame ??= requestAnimationFrame(flushZoom);
	}

	function readAnchor(event: { clientX?: unknown; clientY?: unknown }) {
		const rect = container.getBoundingClientRect();
		return {
			x:
				typeof event.clientX === 'number'
					? event.clientX - rect.left
					: rect.width / 2,
			y:
				typeof event.clientY === 'number'
					? event.clientY - rect.top
					: rect.height / 2,
		};
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const now = performance.now();
		if (now - lastWheelAt > WHEEL_GESTURE_IDLE_MS) clearAxis();
		lastWheelAt = now;
		const unit =
			event.deltaMode === WheelEvent.DOM_DELTA_LINE
				? LINE_HEIGHT_PX
				: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? container.getBoundingClientRect().height
					: 1;
		const deltaX = event.deltaX * unit;
		const deltaY = event.deltaY * unit;
		if (deltaX === 0 && deltaY === 0) return;
		if (event.ctrlKey || event.metaKey) {
			clearAxis();
			clearZoom();
			if (deltaY !== 0)
				onZoom(Math.exp(-deltaY * PINCH_EXPONENT), readAnchor(event));
			return;
		}
		if (event.shiftKey) {
			clearPendingAxis();
			clearZoom();
			onPan(deltaX === 0 ? deltaY : deltaX, 0, event);
			return;
		}
		if (deltaX !== 0 || axisMode === 'pan') {
			const pendingDeltaY = pendingAxis?.deltaY ?? 0;
			clearPendingAxis();
			clearZoom();
			axisMode = 'pan';
			onPan(deltaX, deltaY + pendingDeltaY, event);
			return;
		}
		const direction = deltaY < 0 ? -1 : 1;
		if (axisMode === 'zoom') {
			queueZoom(direction, readAnchor(event), now);
			return;
		}
		// 短暂等待横向分量，避免把触控板的斜向滑动开头当成缩放。
		if (pendingAxis) {
			pendingAxis.deltaY += deltaY;
			return;
		}
		pendingAxis = {
			anchor: readAnchor(event),
			deltaY,
			direction,
			time: now,
		};
		axisTimeout = setTimeout(() => {
			axisTimeout = null;
			const pending = pendingAxis;
			pendingAxis = null;
			if (!pending) return;
			axisMode = 'zoom';
			// 限频按实际滚动时刻计算，等待窗口不占用下一格的间隔。
			queueZoom(pending.direction, pending.anchor, pending.time);
		}, WHEEL_AXIS_WINDOW_MS);
	}

	function handleGestureStart(event: Event) {
		event.preventDefault();
		cancel();
		gestureStartScale = getScale();
	}

	function handleGestureChange(event: Event) {
		event.preventDefault();
		const scale = readGestureScale(event);
		if (scale === null) return;
		gestureStartScale ??= getScale();
		onZoom(
			(gestureStartScale * scale) / getScale(),
			readAnchor({
				clientX: Reflect.get(event, 'clientX'),
				clientY: Reflect.get(event, 'clientY'),
			})
		);
	}

	function handleGestureEnd(event: Event) {
		event.preventDefault();
		gestureStartScale = null;
	}

	const options = { passive: false };
	container.addEventListener('wheel', handleWheel, options);
	container.addEventListener('gesturestart', handleGestureStart, options);
	container.addEventListener('gesturechange', handleGestureChange, options);
	container.addEventListener('gestureend', handleGestureEnd, options);

	return {
		cancel,
		dispose() {
			cancel();
			container.removeEventListener('wheel', handleWheel);
			container.removeEventListener('gesturestart', handleGestureStart);
			container.removeEventListener('gesturechange', handleGestureChange);
			container.removeEventListener('gestureend', handleGestureEnd);
		},
	};
}
