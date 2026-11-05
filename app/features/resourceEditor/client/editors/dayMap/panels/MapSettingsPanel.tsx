'use client';

import { cn } from '@heroui/theme';
import { useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Switch from '@/design/ui/components/switch';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';
import { resolveDayMapAssetPath } from '@/domain/resourcePack/dayMapAssets';

import { AssetPickerDialog } from '@/features/resourceEditor/client/editors/asset/AssetPickerDialog';
import { type IMapViewOptions } from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	fitCameraBoundsToArt,
	getMapArtRect,
	isRectFinite,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapSpatial';
import {
	MapHint,
	MapNumber,
	MapPanel,
	MapProperty,
	MapTextField,
	MapVector,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import {
	CameraIcon,
	ImageIcon,
	MapModeIcon,
	MusicIcon,
	UploadIcon,
	WandIcon,
} from '@/features/resourceEditor/client/editors/dayMap/MapIcons';
import { type TMapAudioTarget } from '@/features/resourceEditor/client/editors/dayMap/useMapAssetImport';
import type { IResourceEditorOperationResult } from '@/features/resourceEditor/client/state/contracts';

interface IProps {
	assetUrls: Readonly<Record<string, string>>;
	isImporting: boolean;
	isReadOnly: boolean;
	map: IDayMap;
	onCommit(next: IDayMap): IResourceEditorOperationResult;
	onNotice(message: string, tone?: 'error' | 'info'): void;
	onUploadAudio(file: File, target: TMapAudioTarget): void;
	onViewOptionsChange(options: IMapViewOptions): void;
	packLabel: string;
	viewOptions: IMapViewOptions;
}

export function MapSettingsPanel({
	assetUrls,
	isImporting,
	isReadOnly,
	map,
	onCommit,
	onNotice,
	onUploadAudio,
	onViewOptionsChange,
	packLabel,
	viewOptions,
}: IProps) {
	const [pickerTarget, setPickerTarget] = useState<TMapAudioTarget | null>(
		null
	);
	const [uploadTarget, setUploadTarget] = useState<TMapAudioTarget>('both');
	const inputRef = useRef<HTMLInputElement>(null);
	const isNativeBgm = map.mapBGM.native !== undefined;
	const { intro } = map.mapBGM;

	function fitCamera() {
		const art = getMapArtRect(map);
		if (!isRectFinite(art)) {
			onNotice('地图还没有美术内容，无法推算相机范围。', 'error');
			return;
		}
		const result = fitCameraBoundsToArt(art);
		const next = {
			...map,
			camera: { ...map.camera, bounds: result.bounds },
		};
		if (!onCommit(next).isSuccess) return;
		onNotice(
			result.isSmallerThanViewport
				? '地图小于游戏视口，相机已收拢到中心；画面边缘会露出地图外。'
				: '已按美术范围和 16:9 视口推算相机中心范围。',
			result.isSmallerThanViewport ? 'error' : 'info'
		);
	}

	return (
		<>
			<MapPanel title="地图信息" icon={<MapModeIcon />}>
				<MapTextField
					label="地图名称"
					value={map.name}
					isDisabled={isReadOnly}
					validate={(value) =>
						value.trim() ? null : '地图名称不能为空'
					}
					onChange={(name) => onCommit({ ...map, name })}
				/>
				<MapNumber
					label="地图 ID"
					value={map.id}
					min={0}
					max={2147483647}
					isDisabled={isReadOnly}
					description="参与资源包 ID 范围与签名校验。"
					onChange={(id) => onCommit({ ...map, id })}
				/>
				<MapTextField
					label="描述"
					value={map.description}
					isMultiline
					isDisabled={isReadOnly}
					onChange={(description) =>
						onCommit({ ...map, description })
					}
				/>
				<div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-medium bg-default/25 p-2">
					<MapProperty label="格式版本" value={map.formatVersion} />
					<MapProperty label="每单位像素" value={map.pixelsPerUnit} />
				</div>
				<Switch
					size="sm"
					isSelected={map.hideClock === true}
					isDisabled={isReadOnly}
					onValueChange={(hideClock) => {
						const next: IDayMap = { ...map, hideClock };
						if (!hideClock) delete next.hideClock;
						onCommit(next);
					}}
				>
					<span className="flex flex-col">
						<span className={TYPOGRAPHY_STYLES.controlLabel}>
							隐藏时钟
						</span>
						<span className={TYPOGRAPHY_STYLES.caption}>
							对应原版 DaySceneMap.hideClock，如博丽大祭。
						</span>
					</span>
				</Switch>
			</MapPanel>
			<MapPanel
				title="相机"
				icon={<CameraIcon />}
				tip="相机范围限制的是相机中心，不是美术外框。画布中青色虚线为中心范围，外侧点线为玩家能看到的范围。"
			>
				<Switch
					size="sm"
					isSelected={map.camera.shouldFollow}
					isDisabled={isReadOnly}
					onValueChange={(shouldFollow) =>
						onCommit({
							...map,
							camera: { ...map.camera, shouldFollow },
						})
					}
				>
					<span className={TYPOGRAPHY_STYLES.controlLabel}>
						相机跟随玩家
					</span>
				</Switch>
				<MapHint>
					相机中心范围是多边形，共 {map.camera.bounds.length}{' '}
					个顶点。在画布上用选择工具拖动顶点或整体，双击边插入顶点；也可用多边形或矩形工具重画。
				</MapHint>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="flat"
						color="primary"
						isDisabled={isReadOnly}
						startContent={<WandIcon className="size-4" />}
						onPress={fitCamera}
					>
						按美术范围推算
					</Button>
				</div>
				{!map.camera.shouldFollow && (
					<MapVector
						labels={['位置 X', '位置 Y', '位置 Z']}
						values={map.camera.position}
						min={-4096}
						max={4096}
						isDisabled={isReadOnly}
						onChange={(position) =>
							onCommit({
								...map,
								camera: { ...map.camera, position },
							})
						}
					/>
				)}
				<Switch
					size="sm"
					isSelected={viewOptions.shouldShowViewportPreview}
					onValueChange={(shouldShowViewportPreview) =>
						onViewOptionsChange({
							...viewOptions,
							shouldShowViewportPreview,
						})
					}
				>
					<span className="flex flex-col">
						<span className={TYPOGRAPHY_STYLES.controlLabel}>
							游戏画面预览
						</span>
						<span className={TYPOGRAPHY_STYLES.caption}>
							光标处显示 26.7×15 格的 16:9
							视口，限制在相机范围内。
						</span>
					</span>
				</Switch>
				<MapHint>
					推算按 16:9、正交半高 7.5、相机 Y 偏移 +0.5
					计算，其他画幅仍需在游戏中检查四边和四角。
				</MapHint>
			</MapPanel>
			<MapPanel
				title="背景音乐"
				icon={<MusicIcon />}
				tip="包内音乐仅支持 PCM 8/16/24/32 位或 IEEE float 32 位 WAV，前奏与循环可以使用同一个文件。原版音乐填写游戏中 LoopedBGMPackage 的 Addressables 地址，需要玩家拥有对应 DLC。"
			>
				<div
					role="radiogroup"
					aria-label="音乐来源"
					className="grid grid-cols-2 gap-1"
				>
					{[
						{ isNative: false, label: '包内音频' },
						{ isNative: true, label: '原版音乐' },
					].map((option) => (
						<Button
							key={option.label}
							role="radio"
							aria-checked={isNativeBgm === option.isNative}
							size="sm"
							variant={
								isNativeBgm === option.isNative
									? 'flat'
									: 'light'
							}
							color={
								isNativeBgm === option.isNative
									? 'primary'
									: 'default'
							}
							isDisabled={isReadOnly}
							onPress={() => {
								if (isNativeBgm === option.isNative) return;
								onCommit({
									...map,
									mapBGM: option.isNative
										? { native: '' }
										: {},
								});
							}}
						>
							{option.label}
						</Button>
					))}
				</div>
				{isNativeBgm && (
					<MapTextField
						label="原版音乐地址"
						value={map.mapBGM.native ?? ''}
						placeholder="例如 DLC3_HakureiFestival"
						isDisabled={isReadOnly}
						validate={(value) =>
							value.trim() ? null : '地址不能为空'
						}
						onChange={(native) =>
							onCommit({
								...map,
								mapBGM: { ...map.mapBGM, native },
							})
						}
					/>
				)}
				{!isNativeBgm &&
					(['intro', 'loop'] as const).map((key) => {
						const path = map.mapBGM[key];
						const localPath = path
							? resolveDayMapAssetPath(path, packLabel)
							: null;
						const url =
							localPath === null
								? undefined
								: assetUrls[localPath];
						return (
							<div
								key={key}
								className="flex flex-col gap-2 rounded-medium border border-divider bg-content1/20 p-2"
							>
								<div className="flex items-center justify-between gap-2">
									<span
										className={
											TYPOGRAPHY_STYLES.compactTitle
										}
									>
										{key === 'intro' ? '前奏' : '循环'}
									</span>
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="light"
											isDisabled={isReadOnly}
											startContent={
												<ImageIcon className="size-3.5" />
											}
											className="h-7 min-w-0 px-2 text-xs"
											onPress={() => setPickerTarget(key)}
										>
											选择
										</Button>
										<Button
											size="sm"
											variant="light"
											isDisabled={
												isReadOnly || isImporting
											}
											startContent={
												<UploadIcon className="size-3.5" />
											}
											className="h-7 min-w-0 px-2 text-xs"
											onPress={() => {
												setUploadTarget(key);
												inputRef.current?.click();
											}}
										>
											上传
										</Button>
									</div>
								</div>
								<p
									title={path}
									className={cn(
										TYPOGRAPHY_STYLES.metadata,
										'truncate',
										!path && 'text-danger-600'
									)}
								>
									{path || '未设置'}
								</p>
								{path && !url && localPath !== null && (
									<p className="text-xs text-danger">
										包内找不到这个文件。
									</p>
								)}
								{path && localPath === null && (
									<p className="text-xs text-warning-700 dark:text-warning">
										引用其他资源包，需在游戏中核验。
									</p>
								)}
								{url && (
									<audio
										controls
										preload="none"
										src={url}
										className="h-8 w-full"
										aria-label={
											key === 'intro'
												? '试听前奏'
												: '试听循环'
										}
									/>
								)}
							</div>
						);
					})}
				{!isNativeBgm && (
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="flat"
							isDisabled={isReadOnly || isImporting}
							isLoading={isImporting && uploadTarget === 'both'}
							startContent={<UploadIcon className="size-4" />}
							onPress={() => {
								setUploadTarget('both');
								inputRef.current?.click();
							}}
						>
							上传 WAV 同时用于两者
						</Button>
						{intro && map.mapBGM.loop !== intro && (
							<Button
								size="sm"
								variant="light"
								isDisabled={isReadOnly}
								onPress={() =>
									onCommit({
										...map,
										mapBGM: { ...map.mapBGM, loop: intro },
									})
								}
							>
								循环使用前奏
							</Button>
						)}
					</div>
				)}
				<input
					ref={inputRef}
					hidden
					type="file"
					accept=".wav,audio/wav"
					aria-label="上传 WAV"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = '';
						if (file) onUploadAudio(file, uploadTarget);
					}}
				/>
			</MapPanel>
			<AssetPickerDialog
				open={pickerTarget !== null}
				onClose={() => setPickerTarget(null)}
				onSelect={(path) => {
					const target = pickerTarget;
					if (!target) return;
					onCommit({
						...map,
						mapBGM: {
							...map.mapBGM,
							...(target === 'loop' ? {} : { intro: path }),
							...(target === 'intro' ? {} : { loop: path }),
						},
					});
				}}
				initialFolder={
					Object.keys(assetUrls).some((path) =>
						path.startsWith(`assets/maps/${map.id}/`)
					)
						? `assets/maps/${map.id}/`
						: 'assets/'
				}
				acceptedFileTypes=".wav"
				isFileAccepted={(path) => path.toLowerCase().endsWith('.wav')}
			/>
		</>
	);
}
