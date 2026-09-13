'use client';

import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';
import Textarea from '@/design/ui/components/textarea';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { Select } from '@/features/resourceEditor/client/components/select/Select';

import { MapNumber, MapSection, MapVector } from './MapFields';

interface IProps {
	map: IDayMap;
	mode: string;
	layerIndex: number;
	selectedIndex: number | null;
	assetUrls: Readonly<Record<string, string>>;
	onChange(map: IDayMap): void;
	onSelect(index: number | null): void;
	onUploadAudio(file: File): void;
}

export function DayMapInspector({
	map,
	mode,
	layerIndex,
	selectedIndex,
	assetUrls,
	onChange,
	onSelect,
	onUploadAudio,
}: IProps) {
	const layer = map.layers[layerIndex];
	const spawn =
		selectedIndex === null ? undefined : map.spawnMarkers[selectedIndex];
	const box =
		selectedIndex === null ? undefined : map.collisions[selectedIndex];
	const object =
		selectedIndex === null ? undefined : map.objects[selectedIndex];
	const audioPaths = Array.from(
		new Set([
			...Object.keys(assetUrls).filter((path) => /\.wav$/i.test(path)),
			map.mapBGM.intro,
			map.mapBGM.loop,
		])
	).filter(Boolean);
	const sortingOptions = ['Background', 'Character', 'Overlay'].map(
		(value) => ({ value, label: value })
	);
	function patchLayer(updates: Partial<NonNullable<typeof layer>>) {
		onChange({
			...map,
			layers: map.layers.map((item, i) =>
				i === layerIndex ? { ...item, ...updates } : item
			),
		});
	}
	function patchSpawn(updates: Partial<NonNullable<typeof spawn>>) {
		onChange({
			...map,
			defaultSpawnMarker:
				spawn?.name === map.defaultSpawnMarker &&
				updates.name !== undefined
					? updates.name
					: map.defaultSpawnMarker,
			spawnMarkers: map.spawnMarkers.map((item, i) =>
				i === selectedIndex ? { ...item, ...updates } : item
			),
		});
	}
	function patchBox(updates: Partial<NonNullable<typeof box>>) {
		onChange({
			...map,
			collisions: map.collisions.map((item, i) =>
				i === selectedIndex ? { ...item, ...updates } : item
			),
		});
	}
	function patchObject(updates: Partial<NonNullable<typeof object>>) {
		onChange({
			...map,
			objects: map.objects.map((item, i) =>
				i === selectedIndex ? { ...item, ...updates } : item
			),
		});
	}
	return (
		<aside className="min-w-0 space-y-3">
			{mode === 'tile' && layer && (
				<MapSection title="图层属性">
					<Input
						labelPlacement="outside"
						label="图层名称"
						size="sm"
						value={layer.name}
						onValueChange={(name) => patchLayer({ name })}
					/>
					<Select
						ariaLabel="图层排序层"
						value={layer.sortingLayer}
						items={sortingOptions}
						onChange={(sortingLayer) =>
							patchLayer({ sortingLayer })
						}
					/>
					<MapNumber
						label="图层排序顺序"
						value={layer.sortingOrder}
						min={-32768}
						max={32767}
						onChange={(sortingOrder) =>
							patchLayer({ sortingOrder })
						}
					/>
					<p className="text-xs text-foreground-500">
						同一排序层内，顺序大的覆盖在前。需要与角色交错的树木请放在装饰中。
					</p>
				</MapSection>
			)}
			{mode === 'spawn' && (
				<MapSection title="出生点">
					<Select
						ariaLabel="选择出生点"
						value={selectedIndex ?? undefined}
						items={map.spawnMarkers.map((item, i) => ({
							value: i,
							label: item.name,
						}))}
						onChange={onSelect}
					/>
					{spawn ? (
						<>
							<Input
								labelPlacement="outside"
								label="出生点名称"
								size="sm"
								value={spawn.name}
								onValueChange={(name) => patchSpawn({ name })}
							/>
							<MapVector
								labels={['出生点 X', '出生点 Y']}
								values={[spawn.x, spawn.y]}
								min={-4096}
								max={4096}
								onChange={([x = 0, y = 0]) =>
									patchSpawn({ x, y })
								}
							/>
							<Select
								ariaLabel="出生朝向"
								value={spawn.rotation}
								items={[
									{ value: 'Down', label: '朝下' },
									{ value: 'Up', label: '朝上' },
									{ value: 'Left', label: '朝左' },
									{ value: 'Right', label: '朝右' },
								]}
								onChange={(rotation) =>
									patchSpawn({ rotation })
								}
							/>
							<Switch
								size="sm"
								isSelected={
									map.defaultSpawnMarker === spawn.name
								}
								onValueChange={(enabled) => {
									if (enabled)
										onChange({
											...map,
											defaultSpawnMarker: spawn.name,
										});
								}}
							>
								默认出生点
							</Switch>
							<SectionDeleteButton
								onPress={() => {
									const spawnMarkers =
										map.spawnMarkers.filter(
											(_, i) => i !== selectedIndex
										);
									onChange({
										...map,
										spawnMarkers,
										defaultSpawnMarker:
											map.defaultSpawnMarker ===
											spawn.name
												? (spawnMarkers[0]?.name ?? '')
												: map.defaultSpawnMarker,
									});
									onSelect(null);
								}}
							>
								删除出生点
							</SectionDeleteButton>
						</>
					) : (
						<p className="text-xs text-foreground-500">
							在画布上点击放置新出生点，或选择已有点修改坐标。
						</p>
					)}
				</MapSection>
			)}
			{mode === 'collision' && (
				<MapSection title="碰撞框">
					<Select
						ariaLabel="选择碰撞框"
						value={selectedIndex ?? undefined}
						items={map.collisions.map((item, i) => ({
							value: i,
							label: item.name || `碰撞 ${i + 1}`,
						}))}
						onChange={onSelect}
					/>
					{box ? (
						<>
							<Input
								labelPlacement="outside"
								label="碰撞框名称"
								size="sm"
								value={box.name}
								onValueChange={(name) => patchBox({ name })}
							/>
							<MapVector
								labels={['碰撞中心 X', '碰撞中心 Y']}
								values={[box.x, box.y]}
								min={-4096}
								max={4096}
								onChange={([x = 0, y = 0]) =>
									patchBox({ x, y })
								}
							/>
							<MapVector
								labels={['碰撞宽度', '碰撞高度']}
								values={[box.width, box.height]}
								min={0.01}
								onChange={([width = 1, height = 1]) =>
									patchBox({ width, height })
								}
							/>
							<SectionDeleteButton
								onPress={() => {
									onChange({
										...map,
										collisions: map.collisions.filter(
											(_, i) => i !== selectedIndex
										),
									});
									onSelect(null);
								}}
							>
								删除碰撞框
							</SectionDeleteButton>
						</>
					) : (
						<p className="text-xs text-foreground-500">
							拖出矩形创建碰撞，点击已有框选择。图片不会自动生成碰撞。
						</p>
					)}
				</MapSection>
			)}
			{mode === 'object' && (
				<MapSection title="装饰属性">
					<Select
						ariaLabel="选择装饰"
						value={selectedIndex ?? undefined}
						items={map.objects.map((item, i) => ({
							value: i,
							label: item.name || `装饰 ${i + 1}`,
						}))}
						onChange={onSelect}
					/>
					{object ? (
						<>
							<Input
								labelPlacement="outside"
								label="装饰名称"
								size="sm"
								value={object.name}
								onValueChange={(name) => patchObject({ name })}
							/>
							<Select
								ariaLabel="装饰切片"
								value={object.tile}
								items={map.tiles.map((item) => ({
									value: item.key,
									label: item.key,
								}))}
								onChange={(tile) => patchObject({ tile })}
							/>
							<div className="grid grid-cols-2 gap-2">
								<MapNumber
									label="装饰 X"
									value={object.x}
									min={-4096}
									max={4096}
									step={0.1}
									onChange={(x) => patchObject({ x })}
								/>
								<MapNumber
									label="装饰 Y"
									value={object.y}
									min={object.sortByY ? -1023 : -4096}
									max={object.sortByY ? 1023 : 4096}
									step={0.1}
									onChange={(y) => patchObject({ y })}
								/>
							</div>
							<MapVector
								labels={['缩放 X', '缩放 Y']}
								values={object.scale}
								min={0.01}
								onChange={(scale) => patchObject({ scale })}
							/>
							<Switch
								size="sm"
								isSelected={object.sortByY}
								onValueChange={(sortByY) =>
									patchObject({ sortByY })
								}
							>
								按脚部 Y 排序
							</Switch>
							<Select
								ariaLabel="装饰排序层"
								value={object.sortingLayer}
								items={sortingOptions}
								onChange={(sortingLayer) =>
									patchObject({ sortingLayer })
								}
							/>
							{!object.sortByY && (
								<MapNumber
									label="装饰排序顺序"
									value={object.sortingOrder}
									min={-32768}
									max={32767}
									onChange={(sortingOrder) =>
										patchObject({ sortingOrder })
									}
								/>
							)}
							<SectionDeleteButton
								onPress={() => {
									onChange({
										...map,
										objects: map.objects.filter(
											(_, i) => i !== selectedIndex
										),
									});
									onSelect(null);
								}}
							>
								删除装饰
							</SectionDeleteButton>
						</>
					) : (
						<p className="text-xs text-foreground-500">
							选好瓦片后点击画布摆放装饰。锚点应位于图片脚部。
						</p>
					)}
				</MapSection>
			)}
			<details
				className="rounded-medium border border-divider bg-content1 p-3"
				open={mode === 'pan'}
			>
				<summary className="cursor-pointer text-sm font-semibold">
					地图、相机与音乐
				</summary>
				<div className="mt-3 space-y-3">
					<Input
						labelPlacement="outside"
						label="地图名称"
						size="sm"
						value={map.name}
						onValueChange={(name) => onChange({ ...map, name })}
					/>
					<MapNumber
						label="地图 ID"
						value={map.id}
						min={9000}
						max={2147483647}
						onChange={(id) => onChange({ ...map, id })}
					/>
					<Textarea
						label="地图描述"
						size="sm"
						value={map.description}
						onValueChange={(description) =>
							onChange({ ...map, description })
						}
					/>
					<Select
						ariaLabel="默认出生点"
						value={map.defaultSpawnMarker}
						items={map.spawnMarkers.map((item) => ({
							value: item.name,
							label: item.name,
						}))}
						onChange={(defaultSpawnMarker) =>
							onChange({ ...map, defaultSpawnMarker })
						}
					/>
					<Switch
						size="sm"
						isSelected={map.camera.shouldFollow}
						onValueChange={(shouldFollow) =>
							onChange({
								...map,
								camera: { ...map.camera, shouldFollow },
							})
						}
					>
						相机跟随玩家
					</Switch>
					<MapVector
						labels={[
							'相机最小 X',
							'相机最小 Y',
							'相机最大 X',
							'相机最大 Y',
						]}
						values={map.camera.bounds}
						min={-4096}
						max={4096}
						onChange={(bounds) =>
							onChange({
								...map,
								camera: { ...map.camera, bounds },
							})
						}
					/>
					{!map.camera.shouldFollow && (
						<MapVector
							labels={['相机位置 X', '相机位置 Y', '相机位置 Z']}
							values={map.camera.position}
							min={-4096}
							max={4096}
							onChange={(position) =>
								onChange({
									...map,
									camera: { ...map.camera, position },
								})
							}
						/>
					)}
					<p className="text-xs text-foreground-500">
						边界限制相机中心，需要考虑游戏视口，不等于美术外框。画布是编辑预览，游戏中的遮挡与相机效果仍需检查。
					</p>
					{(['intro', 'loop'] as const).map((key) => (
						<div key={key} className="space-y-1">
							<p className="text-xs">
								{key === 'intro' ? '音乐前奏' : '循环音乐'}
							</p>
							<Select
								ariaLabel={
									key === 'intro' ? '音乐前奏' : '循环音乐'
								}
								value={map.mapBGM[key]}
								items={audioPaths.map((value) => ({
									value,
									label: value,
								}))}
								onChange={(value) =>
									onChange({
										...map,
										mapBGM: { ...map.mapBGM, [key]: value },
									})
								}
							/>
						</div>
					))}
					<label className="block text-xs">
						导入 WAV（自动用于前奏与循环）
						<input
							className="mt-2 block w-full text-xs"
							type="file"
							accept=".wav,audio/wav"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = '';
								if (file) onUploadAudio(file);
							}}
						/>
					</label>
					<p className="text-xs text-foreground-500">
						音乐为必填，可以重复选择同一个
						WAV。更多资产管理请使用顶部“资产”。
					</p>
				</div>
			</details>
		</aside>
	);
}
