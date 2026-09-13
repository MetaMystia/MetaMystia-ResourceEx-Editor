'use client';

import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import Button from '@/design/ui/components/button';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';

import {
	formatSlopeAngle,
	getLineCells,
	getMapBounds,
	type IMapPoint,
	type IMapView,
	paintMapCells,
	type TMapCanvasMode,
	type TMapCanvasTool,
} from './canvasHelpers';

interface IProps {
	map: IDayMap;
	assetUrls: Readonly<Record<string, string>>;
	packLabel: string;
	mode: TMapCanvasMode;
	tool: TMapCanvasTool;
	layerIndex: number;
	tileKey: string;
	slope: number;
	hiddenLayers: ReadonlySet<number>;
	selectedIndex: number | null;
	onSelect(index: number | null): void;
	onChange(map: IDayMap): void;
	onError(message: string): void;
	onUndo(): void;
	onRedo(): void;
	isReadOnly?: boolean;
}

interface IGesture {
	pointerId: number;
	base: IDayMap;
	start: IMapPoint;
	last: IMapPoint;
	client: IMapPoint;
	view: IMapView;
	cells: Map<string, IMapPoint>;
	isPan: boolean;
}

export default function DayMapCanvas(props: IProps) {
	const {
		map,
		assetUrls,
		packLabel,
		mode,
		tool,
		layerIndex,
		tileKey,
		slope,
		hiddenLayers,
		selectedIndex,
		onSelect,
		onChange,
		onError,
		onUndo,
		onRedo,
		isReadOnly = false,
	} = props;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const gestureRef = useRef<IGesture | null>(null);
	const draftRef = useRef<IDayMap | null>(null);
	const mapRef = useRef(map);
	mapRef.current = map;
	const [draft, setDraft] = useState<IDayMap | null>(null);
	const [view, setView] = useState<IMapView>({ x: 0, y: 0, scale: 32 });
	const [size, setSize] = useState({ width: 800, height: 480 });
	const [cursor, setCursor] = useState<IMapPoint>({ x: 0, y: 0 });
	const [isGridVisible, setIsGridVisible] = useState(true);
	const [images, setImages] = useState<ReadonlyMap<string, HTMLImageElement>>(
		new Map()
	);
	const [isGestureActive, setIsGestureActive] = useState(false);
	const [hasFocus, setHasFocus] = useState(false);
	const shownMap = draft ?? map;
	const heightCells = useMemo(
		() =>
			new Map(
				shownMap.height?.cells.map((cell) => [
					`${cell.x},${cell.y}`,
					cell.slope,
				])
			),
		[shownMap.height]
	);
	const cursorSlope =
		heightCells.get(`${Math.floor(cursor.x)},${Math.floor(cursor.y)}`) ?? 0;

	const cancelGesture = () => {
		gestureRef.current = null;
		draftRef.current = null;
		setDraft(null);
		setIsGestureActive(false);
	};
	useEffect(() => {
		cancelGesture();
	}, [map, mode, tool, layerIndex, tileKey, slope, isReadOnly]);
	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect)
				setSize({
					width: Math.max(1, rect.width),
					height: Math.max(1, rect.height),
				});
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	const imagePaths = [...new Set(map.tiles.map((tile) => tile.image))]
		.sort()
		.join('\n');
	useEffect(() => {
		let isActive = true;
		const next = new Map<string, HTMLImageElement>();
		for (const path of imagePaths.split('\n').filter(Boolean)) {
			const localPath = resolveDayMapAssetPath(path, packLabel);
			const url = localPath === null ? undefined : assetUrls[localPath];
			if (!url) continue;
			const image = new Image();
			image.onload = () => {
				if (isActive) {
					next.set(path, image);
					setImages(new Map(next));
				}
			};
			image.src = url;
		}
		setImages(new Map());
		return () => {
			isActive = false;
		};
	}, [imagePaths, assetUrls, packLabel]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(size.width * ratio);
		canvas.height = Math.round(size.height * ratio);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, size.width, size.height);
		context.imageSmoothingEnabled = false;
		const px = (x: number) => size.width / 2 + (x - view.x) * view.scale;
		const py = (y: number) => size.height / 2 - (y - view.y) * view.scale;
		const tiles = new Map(shownMap.tiles.map((tile) => [tile.key, tile]));
		const drawTile = (
			key: string,
			x: number,
			y: number,
			scaleX = 1,
			scaleY = 1
		) => {
			const tile = tiles.get(key);
			if (!tile) return;
			const [sx = 0, sy = 0, sw = 0, sh = 0] = tile.rect;
			const width = (sw / tile.pixelsPerUnit) * scaleX * view.scale;
			const height = (sh / tile.pixelsPerUnit) * scaleY * view.scale;
			const left = px(x) - width * (tile.pivot[0] ?? 0);
			const top = py(y) - height * (1 - (tile.pivot[1] ?? 0));
			if (
				![left, top, width, height].every(Number.isFinite) ||
				width <= 0 ||
				height <= 0 ||
				left > size.width ||
				top > size.height ||
				left + width < 0 ||
				top + height < 0
			)
				return;
			const image = images.get(tile.image);
			if (
				image &&
				sx >= 0 &&
				sy >= 0 &&
				sw > 0 &&
				sh > 0 &&
				sx + sw <= image.width &&
				sy + sh <= image.height
			)
				context.drawImage(
					image,
					sx,
					image.height - sy - sh,
					sw,
					sh,
					left,
					top,
					width,
					height
				);
			else {
				context.fillStyle = '#d946ef66';
				context.fillRect(left, top, width, height);
				context.strokeStyle = '#d946ef';
				context.strokeRect(left, top, width, height);
			}
		};
		const sortingRank = (layer: string) =>
			layer === 'Background'
				? 0
				: layer === 'Character'
					? 1
					: layer === 'Overlay'
						? 2
						: 1;
		const entries = [
			...shownMap.layers.flatMap((layer, index) =>
				hiddenLayers.has(index)
					? []
					: [
							{
								rank: sortingRank(layer.sortingLayer),
								order: layer.sortingOrder,
								draw: () =>
									layer.cells.forEach((cell) =>
										drawTile(cell.tile, cell.x, cell.y)
									),
							},
						]
			),
			...shownMap.objects.map((obj) => ({
				rank: sortingRank(obj.sortingLayer),
				order: obj.sortByY ? Math.trunc(-32 * obj.y) : obj.sortingOrder,
				draw: () =>
					drawTile(
						obj.tile,
						obj.x,
						obj.y,
						obj.scale[0],
						obj.scale[1]
					),
			})),
		];
		entries
			.sort((a, b) => a.rank - b.rank || a.order - b.order)
			.forEach((entry) => entry.draw());
		if (isGridVisible && view.scale >= 12) {
			context.strokeStyle = '#94a3b83b';
			context.lineWidth = 1;
			context.beginPath();
			for (
				let x = Math.ceil(view.x - size.width / 2 / view.scale);
				x <= view.x + size.width / 2 / view.scale;
				x++
			) {
				context.moveTo(px(x), 0);
				context.lineTo(px(x), size.height);
			}
			for (
				let y = Math.ceil(view.y - size.height / 2 / view.scale);
				y <= view.y + size.height / 2 / view.scale;
				y++
			) {
				context.moveTo(0, py(y));
				context.lineTo(size.width, py(y));
			}
			context.stroke();
		}
		context.strokeStyle = '#94a3b899';
		context.beginPath();
		context.moveTo(px(0), 0);
		context.lineTo(px(0), size.height);
		context.moveTo(0, py(0));
		context.lineTo(size.width, py(0));
		context.stroke();
		if (mode === 'height')
			shownMap.height?.cells.forEach((cell) => {
				const x = px(cell.x),
					y = py(cell.y + 1);
				if (
					x > size.width ||
					y > size.height ||
					x + view.scale < 0 ||
					y + view.scale < 0
				)
					return;
				context.fillStyle =
					cell.slope > 0
						? '#0ea5e980'
						: cell.slope < 0
							? '#f9731680'
							: '#64748b80';
				context.fillRect(x, y, view.scale, view.scale);
				context.fillStyle = '#fff';
				context.font = `${Math.min(16, view.scale * 0.45)}px sans-serif`;
				context.textAlign = 'center';
				context.fillText(
					cell.slope > 0 ? '↗' : cell.slope < 0 ? '↘' : '→',
					x + view.scale / 2,
					y + view.scale * (view.scale >= 28 ? 0.45 : 0.65)
				);
				if (view.scale >= 28) {
					context.font = `${Math.min(12, Math.max(8, view.scale * 0.22))}px sans-serif`;
					context.strokeStyle = '#0f172a';
					context.lineWidth = 2;
					const angle = formatSlopeAngle(cell.slope);
					context.strokeText(
						angle,
						x + view.scale / 2,
						y + view.scale * 0.85,
						view.scale - 4
					);
					context.fillText(
						angle,
						x + view.scale / 2,
						y + view.scale * 0.85,
						view.scale - 4
					);
				}
			});
		shownMap.collisions.forEach((box, index) => {
			const isSelected = mode === 'collision' && index === selectedIndex;
			context.fillStyle =
				mode === 'collision' ? '#ef444433' : '#ef444411';
			context.strokeStyle = isSelected ? '#fde047' : '#ef4444';
			context.lineWidth = isSelected ? 3 : 1;
			context.fillRect(
				px(box.x - box.width / 2),
				py(box.y + box.height / 2),
				box.width * view.scale,
				box.height * view.scale
			);
			context.strokeRect(
				px(box.x - box.width / 2),
				py(box.y + box.height / 2),
				box.width * view.scale,
				box.height * view.scale
			);
		});
		shownMap.spawnMarkers.forEach((point, index) => {
			context.fillStyle =
				mode === 'spawn' && index === selectedIndex
					? '#fde047'
					: '#22c55e';
			context.strokeStyle = '#052e16';
			context.lineWidth = 2;
			context.beginPath();
			context.arc(px(point.x), py(point.y), 6, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.fillStyle = '#fff';
			context.strokeStyle = '#111827';
			context.lineWidth = 3;
			context.font = '12px sans-serif';
			context.textAlign = 'left';
			context.strokeText(point.name, px(point.x) + 9, py(point.y) - 7);
			context.fillText(point.name, px(point.x) + 9, py(point.y) - 7);
		});
		if (mode === 'object')
			shownMap.objects.forEach((obj, index) => {
				context.strokeStyle =
					index === selectedIndex ? '#fde047' : '#c084fc';
				context.lineWidth = 2;
				context.strokeRect(px(obj.x) - 5, py(obj.y) - 5, 10, 10);
			});
		context.lineWidth = 1;
		const [minX, minY, maxX, maxY] = shownMap.camera.bounds;
		if (
			minX !== undefined &&
			minY !== undefined &&
			maxX !== undefined &&
			maxY !== undefined
		) {
			context.strokeStyle = '#38bdf8';
			context.setLineDash([6, 6]);
			context.strokeRect(
				px(minX),
				py(maxY),
				(maxX - minX) * view.scale,
				(maxY - minY) * view.scale
			);
			context.setLineDash([]);
		}
		if (hasFocus || isGestureActive) {
			context.strokeStyle = '#facc15';
			context.lineWidth = 2;
			context.strokeRect(
				px(Math.floor(cursor.x)),
				py(Math.floor(cursor.y) + 1),
				view.scale,
				view.scale
			);
		}
	}, [
		shownMap,
		images,
		size,
		view,
		hiddenLayers,
		isGridVisible,
		mode,
		selectedIndex,
		cursor,
		hasFocus,
		isGestureActive,
	]);

	const getWorld = (event: PointerEvent<HTMLCanvasElement>): IMapPoint => {
		const rect = event.currentTarget.getBoundingClientRect();
		return {
			x: Math.max(
				-4096,
				Math.min(
					4095.999,
					view.x +
						(event.clientX - rect.left - size.width / 2) /
							view.scale
				)
			),
			y: Math.max(
				-4096,
				Math.min(
					4095.999,
					view.y -
						(event.clientY - rect.top - size.height / 2) /
							view.scale
				)
			),
		};
	};
	const publishDraft = (value: IDayMap) => {
		draftRef.current = value;
		setDraft(value);
	};
	const paintGesture = (point: IMapPoint) => {
		const gesture = gestureRef.current;
		if (!gesture || gesture.isPan) return;
		if (mode === 'collision') {
			const left = Math.floor(Math.min(gesture.start.x, point.x)),
				bottom = Math.floor(Math.min(gesture.start.y, point.y));
			const width =
					Math.floor(Math.max(gesture.start.x, point.x)) - left + 1,
				height =
					Math.floor(Math.max(gesture.start.y, point.y)) - bottom + 1;
			publishDraft({
				...gesture.base,
				collisions: [
					...gesture.base.collisions,
					{
						name: `碰撞 ${gesture.base.collisions.length + 1}`,
						x: left + width / 2,
						y: bottom + height / 2,
						width,
						height,
					},
				],
			});
			return;
		}
		if (tool === 'rectangle') {
			const left = Math.floor(Math.min(gesture.start.x, point.x)),
				right = Math.floor(Math.max(gesture.start.x, point.x));
			const bottom = Math.floor(Math.min(gesture.start.y, point.y)),
				top = Math.floor(Math.max(gesture.start.y, point.y));
			if ((right - left + 1) * (top - bottom + 1) > 100000) {
				onError('单次填充不能超过 100000 格。');
				return;
			}
			gesture.cells.clear();
			for (let x = left; x <= right; x++)
				for (let y = bottom; y <= top; y++)
					gesture.cells.set(`${x},${y}`, { x, y });
		} else
			getLineCells(gesture.last, point).forEach((cell) =>
				gesture.cells.set(`${cell.x},${cell.y}`, cell)
			);
		gesture.last = point;
		const next = paintMapCells(
			gesture.base,
			gesture.cells,
			mode,
			layerIndex,
			tileKey,
			slope,
			tool === 'erase'
		);
		if (
			(mode === 'height'
				? (next.height?.cells.length ?? 0)
				: next.layers.reduce(
						(count, layer) => count + layer.cells.length,
						0
					)) > 100000
		) {
			onError('地图瓦片和坡度层分别最多 100000 格。');
			return;
		}
		publishDraft(next);
	};
	const findEntity = (point: IMapPoint): number => {
		if (mode === 'collision')
			return map.collisions.findLastIndex(
				(box) =>
					Math.abs(point.x - box.x) <= box.width / 2 &&
					Math.abs(point.y - box.y) <= box.height / 2
			);
		const entries = mode === 'spawn' ? map.spawnMarkers : map.objects;
		let best = -1,
			distance = Math.max(0.4, 12 / view.scale);
		entries.forEach((entry, index) => {
			const current = Math.hypot(entry.x - point.x, entry.y - point.y);
			if (current < distance) {
				best = index;
				distance = current;
			}
		});
		return best;
	};
	const eraseEntity = (index: number) => {
		if (index < 0) return;
		if (mode === 'collision')
			onChange({
				...map,
				collisions: map.collisions.filter((_, i) => i !== index),
			});
		if (mode === 'object')
			onChange({
				...map,
				objects: map.objects.filter((_, i) => i !== index),
			});
		if (mode === 'spawn') {
			const markers = map.spawnMarkers.filter((_, i) => i !== index);
			onChange({
				...map,
				spawnMarkers: markers,
				defaultSpawnMarker:
					map.spawnMarkers[index]?.name === map.defaultSpawnMarker
						? (markers[0]?.name ?? '')
						: map.defaultSpawnMarker,
			});
		}
		onSelect(null);
	};
	const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
		if (!event.isPrimary || gestureRef.current) return;
		if (event.button !== 0 && event.button !== 1) return;
		event.preventDefault();
		event.currentTarget.focus();
		const point = getWorld(event);
		setCursor(point);
		const isPan = mode === 'pan' || event.button === 1;
		if (!isPan && isReadOnly) return;
		if (
			!isPan &&
			(mode === 'spawn' || mode === 'object' || mode === 'collision')
		) {
			const hit = findEntity(point);
			if (tool === 'erase') {
				eraseEntity(hit);
				return;
			}
			if (hit >= 0 && !(mode === 'collision' && tool === 'rectangle')) {
				onSelect(hit);
				return;
			}
			if (mode === 'spawn') {
				const x = Math.round(point.x * 2) / 2,
					y = Math.round(point.y * 2) / 2;
				if (selectedIndex !== null && map.spawnMarkers[selectedIndex]) {
					onChange({
						...map,
						spawnMarkers: map.spawnMarkers.map((marker, i) =>
							i === selectedIndex ? { ...marker, x, y } : marker
						),
					});
					return;
				}
				if (map.spawnMarkers.length >= 256) {
					onError('一张地图最多 256 个出生点。');
					return;
				}
				let suffix = map.spawnMarkers.length + 1;
				while (
					map.spawnMarkers.some(
						(marker) => marker.name === `Spawn${suffix}`
					)
				)
					suffix++;
				const name = `Spawn${suffix}`;
				onChange({
					...map,
					spawnMarkers: [
						...map.spawnMarkers,
						{ name, x, y, rotation: 'Down' },
					],
					defaultSpawnMarker: map.defaultSpawnMarker || name,
				});
				onSelect(map.spawnMarkers.length);
				return;
			}
			if (mode === 'object') {
				if (Math.abs(Math.round(point.y * 2) / 2) > 1023) {
					onError(
						'按脚部 Y 排序的装饰，Y 坐标必须介于 -1023 和 1023。'
					);
					return;
				}
				if (!map.tiles.some((tile) => tile.key === tileKey)) {
					onError('请先选择一个瓦片。');
					return;
				}
				if (map.objects.length >= 4096) {
					onError('一张地图最多 4096 个装饰。');
					return;
				}
				onChange({
					...map,
					objects: [
						...map.objects,
						{
							name: `装饰 ${map.objects.length + 1}`,
							tile: tileKey,
							x: Math.round(point.x * 2) / 2,
							y: Math.round(point.y * 2) / 2,
							scale: [1, 1],
							sortByY: true,
							sortingLayer: 'Character',
							sortingOrder: 0,
						},
					],
				});
				onSelect(map.objects.length);
				return;
			}
			if (map.collisions.length >= 4096) {
				onError('一张地图最多 4096 个碰撞箱。');
				return;
			}
		}
		if (
			!isPan &&
			mode === 'tile' &&
			(!map.layers[layerIndex] ||
				hiddenLayers.has(layerIndex) ||
				(tool !== 'erase' &&
					!map.tiles.some((tile) => tile.key === tileKey)))
		) {
			onError('请先选择可见图层和有效瓦片。');
			return;
		}
		if (
			!isPan &&
			mode === 'height' &&
			(!Number.isFinite(slope) || Math.abs(slope) > 1)
		) {
			onError('坡度必须介于 -1 和 1。');
			return;
		}
		gestureRef.current = {
			pointerId: event.pointerId,
			base: map,
			start: point,
			last: point,
			client: { x: event.clientX, y: event.clientY },
			view,
			cells: new Map(),
			isPan,
		};
		setIsGestureActive(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		if (!isPan) paintGesture(point);
	};
	const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
		if (
			!event.isPrimary ||
			(gestureRef.current &&
				gestureRef.current.pointerId !== event.pointerId)
		)
			return;
		const point = getWorld(event);
		setCursor(point);
		const gesture = gestureRef.current;
		if (!gesture) return;
		if (gesture.isPan)
			setView({
				...gesture.view,
				x:
					gesture.view.x -
					(event.clientX - gesture.client.x) / gesture.view.scale,
				y:
					gesture.view.y +
					(event.clientY - gesture.client.y) / gesture.view.scale,
			});
		else paintGesture(point);
	};
	const finishGesture = () => {
		const gesture = gestureRef.current,
			next = draftRef.current;
		if (gesture && next && gesture.base === mapRef.current && !isReadOnly) {
			onChange(next);
			if (mode === 'collision') onSelect(next.collisions.length - 1);
		}
		cancelGesture();
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
		if (
			(event.ctrlKey || event.metaKey) &&
			['z', 'y'].includes(event.key.toLowerCase())
		) {
			event.preventDefault();
			cancelGesture();
			if (!isReadOnly) {
				if (event.key.toLowerCase() === 'y' || event.shiftKey) onRedo();
				else onUndo();
			}
			return;
		}
		if (event.key === 'Escape') {
			cancelGesture();
			onSelect(null);
			return;
		}
		const steps: Record<string, IMapPoint> = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: 1 },
			ArrowDown: { x: 0, y: -1 },
		};
		const step = steps[event.key];
		if (step) {
			event.preventDefault();
			setCursor((value) => ({
				x: Math.max(
					-4096,
					Math.min(4095, Math.floor(value.x) + step.x)
				),
				y: Math.max(
					-4096,
					Math.min(4095, Math.floor(value.y) + step.y)
				),
			}));
			return;
		}
		if (isReadOnly || ![' ', 'Delete', 'Backspace'].includes(event.key))
			return;
		event.preventDefault();
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			selectedIndex !== null &&
			['collision', 'spawn', 'object'].includes(mode)
		) {
			eraseEntity(selectedIndex);
			return;
		}
		if (mode !== 'tile' && mode !== 'height') return;
		const isErase = event.key !== ' ' || tool === 'erase';
		if (
			mode === 'tile' &&
			(!map.layers[layerIndex] ||
				hiddenLayers.has(layerIndex) ||
				(!isErase && !map.tiles.some((tile) => tile.key === tileKey)))
		) {
			onError('请先选择可见图层和有效瓦片。');
			return;
		}
		if (
			mode === 'height' &&
			(!Number.isFinite(slope) || Math.abs(slope) > 1)
		) {
			onError('坡度必须介于 -1 和 1。');
			return;
		}
		const point = { x: Math.floor(cursor.x), y: Math.floor(cursor.y) };
		const next = paintMapCells(
			map,
			new Map([[`${point.x},${point.y}`, point]]),
			mode,
			layerIndex,
			tileKey,
			slope,
			isErase
		);
		if (
			(mode === 'height'
				? (next.height?.cells.length ?? 0)
				: next.layers.reduce(
						(count, layer) => count + layer.cells.length,
						0
					)) > 100000
		) {
			onError('地图瓦片和坡度层分别最多 100000 格。');
			return;
		}
		onChange(next);
	};
	const fitMap = () => {
		const bounds = getMapBounds(map);
		setView({
			x: (bounds.minX + bounds.maxX) / 2,
			y: (bounds.minY + bounds.maxY) / 2,
			scale: Math.max(
				4,
				Math.min(
					96,
					(size.width - 64) / Math.max(1, bounds.maxX - bounds.minX),
					(size.height - 64) / Math.max(1, bounds.maxY - bounds.minY)
				)
			),
		});
	};
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="flat"
					onPress={() =>
						setView((value) => ({
							...value,
							scale: Math.max(4, value.scale / 1.25),
						}))
					}
					aria-label="缩小地图"
				>
					−
				</Button>
				<span className="min-w-14 text-center text-sm">
					{Math.round((view.scale / 48) * 100)}%
				</span>
				<Button
					size="sm"
					variant="flat"
					onPress={() =>
						setView((value) => ({
							...value,
							scale: Math.min(192, value.scale * 1.25),
						}))
					}
					aria-label="放大地图"
				>
					＋
				</Button>
				<Button size="sm" variant="flat" onPress={fitMap}>
					定位地图
				</Button>
				<Button
					size="sm"
					variant="flat"
					aria-pressed={isGridVisible}
					onPress={() => setIsGridVisible((value) => !value)}
				>
					网格{isGridVisible ? '开' : '关'}
				</Button>
			</div>
			<div
				ref={containerRef}
				className="relative h-[min(60vh,650px)] min-h-[420px] overflow-hidden rounded-xl border border-default-300 bg-default-100"
			>
				<canvas
					ref={canvasRef}
					tabIndex={0}
					role="application"
					aria-label="地图画布：方向键移动光标，空格绘制，Delete 擦除，Escape 取消；中键拖动平移"
					className="h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
					style={{
						cursor:
							mode === 'pan'
								? isGestureActive
									? 'grabbing'
									: 'grab'
								: 'crosshair',
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={(event) => {
						if (gestureRef.current?.pointerId === event.pointerId)
							finishGesture();
					}}
					onPointerCancel={(event) => {
						if (gestureRef.current?.pointerId === event.pointerId)
							cancelGesture();
					}}
					onLostPointerCapture={(event) => {
						if (gestureRef.current?.pointerId === event.pointerId)
							finishGesture();
					}}
					onKeyDown={handleKeyDown}
					onFocus={() => setHasFocus(true)}
					onBlur={() => {
						finishGesture();
						setHasFocus(false);
					}}
				/>
			</div>
			{mode === 'height' && (
				<p className="text-sm text-foreground" aria-live="off">
					光标格子 ({Math.floor(cursor.x)}, {Math.floor(cursor.y)}
					)：坡度 {cursorSlope}（约 {formatSlopeAngle(cursorSlope)}）
					{cursorSlope === 0
						? ' · 平地'
						: cursorSlope > 0
							? ' · 向右上坡'
							: ' · 向右下坡'}
				</p>
			)}
			<p className="text-xs text-default-600" aria-live="off">
				格子 ({Math.floor(cursor.x)}, {Math.floor(cursor.y)}) · 右为
				+X，上为 +Y · 中键平移 · 蓝色虚线为相机中心范围
			</p>
			<p className="text-xs text-default-500">
				预览展示美术排序与辅助标记；碰撞、坡度和相机范围不会显示在游戏画面中。选中画布后可用方向键、空格和
				Delete 编辑。
			</p>
		</div>
	);
}
