'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Tooltip from '@/design/ui/components/tooltip';

import {
	UNMANAGED_ID_MAX,
	UNMANAGED_ID_MIN,
} from '@/domain/resourcePack/constants';
import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import {
	findNextAvailableInteger,
	getEntityIdAllocationStart,
} from '@/features/resourceEditor/client/editorValueAllocation';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { DayMapEditor } from './DayMapEditor';
import { MapModeIcon, PlusIcon } from './MapIcons';

function createBlankMap(id: number): IDayMap {
	return {
		id,
		formatVersion: 1,
		name: '新地图',
		description: '',
		tiles: [],
		layers: [
			{
				name: '地面',
				sortingLayer: 'Background',
				sortingOrder: -2000,
				cells: [],
			},
		],
		height: { cells: [] },
		objects: [],
		collisions: [],
		spawnMarkers: [{ name: 'Entry', x: 0, y: 0, rotation: 'Down' }],
		defaultSpawnMarker: 'Entry',
		camera: {
			shouldFollow: true,
			bounds: [-4, -3, 4, 3],
			position: [0, 0, -10],
		},
		mapBGM: { intro: '', loop: '' },
	};
}

export function DayMapEditorScreen() {
	const {
		activeWorkspaceId,
		applyWorkspaceMutation,
		readCurrentWorkspaceSnapshot,
		resourcePack,
	} = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectionRevision, setSelectionRevision] = useState(0);
	const [error, setError] = useState('');
	const containerRef = useRef<HTMLDivElement>(null);
	const maps = resourcePack.dayMaps;

	// 宽屏时编辑器占满导航以下的窗口；导航下方的状态栏高度随屏宽和存储状态变化，按实际位置计算。
	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const query = window.matchMedia('(min-width: 1024px)');
		const update = () => {
			if (!query.matches) {
				element.style.height = '';
				return;
			}
			const top = element.getBoundingClientRect().top + window.scrollY;
			element.style.height = `${Math.max(560, Math.floor(window.innerHeight - top))}px`;
		};
		update();
		const observer = new ResizeObserver(update);
		for (
			let node = element.closest('main')?.previousElementSibling;
			node;
			node = node.previousElementSibling
		)
			observer.observe(node);
		window.addEventListener('resize', update);
		query.addEventListener('change', update);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', update);
			query.removeEventListener('change', update);
		};
	}, []);
	const index = Math.min(selectedIndex, Math.max(0, maps.length - 1));
	const map = maps[index];
	useEditorEntityNavigationIntent({
		entityKind: 'dayMap',
		getStableKey: (item) => item.id,
		items: maps,
		onSelect: setSelectedIndex,
	});

	function addMap() {
		const snapshot = readCurrentWorkspaceSnapshot();
		if (!snapshot) return;
		const pack = snapshot.resourcePack;
		const id = findNextAvailableInteger(
			pack.dayMaps.map((item) => item.id),
			getEntityIdAllocationStart(
				pack.packInfo.idRangeStart,
				UNMANAGED_ID_MIN
			)
		);
		if (id > (pack.packInfo.idRangeEnd ?? UNMANAGED_ID_MAX)) {
			setError('当前资源包声明的 ID 范围已用完。');
			return;
		}
		const result = applyWorkspaceMutation({
			expectedRevision: snapshot.revision,
			mutate: (current) => ({
				...current,
				resourcePack: {
					...current.resourcePack,
					dayMaps: [
						...current.resourcePack.dayMaps,
						createBlankMap(id),
					],
				},
			}),
		});
		if (result.isSuccess) {
			setSelectedIndex(pack.dayMaps.length);
			setSelectionRevision((value) => value + 1);
			setError('');
		} else setError(result.error ?? '创建失败');
	}

	function deleteMap() {
		const snapshot = readCurrentWorkspaceSnapshot();
		if (!snapshot || snapshot.resourcePack.dayMaps[index] !== map) {
			setError('地图已变化，请重新选择。');
			return;
		}
		const result = applyWorkspaceMutation({
			expectedRevision: snapshot.revision,
			mutate: (current) => ({
				...current,
				resourcePack: {
					...current.resourcePack,
					dayMaps: current.resourcePack.dayMaps.filter(
						(_, i) => i !== index
					),
				},
			}),
		});
		if (result.isSuccess) {
			setSelectedIndex(Math.max(0, index - 1));
			setSelectionRevision((value) => value + 1);
			setError('');
		} else setError(result.error ?? '删除失败');
	}

	const mapControls = map ? (
		<div className="flex min-w-0 items-center gap-1.5">
			<Select<number>
				baseClassName="w-56 min-w-0 max-w-full shrink"
				size="sm"
				ariaLabel="当前地图"
				value={index}
				items={maps.map((item, i) => ({
					value: i,
					label: item.name || '未命名地图',
					textValue: `${item.name} ${item.id}`,
					description: `ID ${item.id}${item.artOnly ? ' · 美术参考' : ''}`,
				}))}
				menuMaxHeight={360}
				onChange={(value) => {
					setSelectedIndex(value);
					setError('');
				}}
			/>
			<Tooltip content="新建地图">
				<Button
					isIconOnly
					size="sm"
					variant="flat"
					color="primary"
					aria-label="新建地图"
					className="h-10 w-10 min-w-10 shrink-0 text-base sm:h-8 sm:w-8 sm:min-w-8"
					onPress={addMap}
				>
					<PlusIcon />
				</Button>
			</Tooltip>
			<SectionDeleteButton
				iconOnly
				aria-label="删除地图"
				confirmTitle={`删除地图“${map.name}”？`}
				confirmDescription="地图引用的图片和音频仍保留在资产中。"
				onPress={deleteMap}
			>
				删除地图
			</SectionDeleteButton>
		</div>
	) : null;

	return (
		<div
			ref={containerRef}
			className="flex flex-col gap-3 px-2 py-3 sm:px-4"
		>
			{error && (
				<p
					role="alert"
					className="rounded-medium border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-500"
				>
					{error}
				</p>
			)}
			{map ? (
				<DayMapEditor
					key={`${activeWorkspaceId}:${index}:${selectionRevision}`}
					index={index}
					map={map}
					mapControls={mapControls}
				/>
			) : (
				<EditorPanel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-12 text-center">
					<span className="flex size-14 items-center justify-center rounded-large bg-primary/15 text-3xl text-primary-600 dark:text-primary">
						<MapModeIcon />
					</span>
					<div className="flex flex-col gap-1">
						<Heading as="h1" variant="panel">
							还没有白天地图
						</Heading>
						<p className={TYPOGRAPHY_STYLES.subtleDescription}>
							新建一张地图，导入 PNG
							切成瓦片后即可绘制；坡面、碰撞、出生点与相机各自独立编辑。
						</p>
					</div>
					<Button
						color="primary"
						variant="flat"
						startContent={<PlusIcon className="size-4" />}
						onPress={addMap}
					>
						新建地图
					</Button>
				</EditorPanel>
			)}
		</div>
	);
}
