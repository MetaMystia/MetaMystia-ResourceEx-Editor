import { cn } from '@heroui/theme';
import { memo, useCallback, useId, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Tooltip from '@/design/ui/components/tooltip';

import {
	IMAGE_ASSET_FILE_ACCEPT,
	isImageAssetPath,
	isWavAssetPath,
} from '@/domain/resourcePack/assetTypes';
import type {
	Dialog,
	DialogAction,
	DialogActionType,
	DialogBranchOption,
} from '@/domain/resourcePack/contracts/dialogue';

import { getAssetReferenceStatus } from '@/features/resourceEditor/client/assets/assetPaths';
import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import {
	Select,
	type SelectItem as SelectItemSpec,
} from '@/features/resourceEditor/client/components/select/Select';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { AssetPickerDialog } from '@/features/resourceEditor/client/editors/asset/AssetPickerDialog';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

const ACTION_TYPES: DialogActionType[] = [
	'CameraShake',
	'CG',
	'BG',
	'Sound',
	'Branch',
	'Goto',
	'End',
];

const ACTION_LABEL: Record<DialogActionType, string> = {
	CameraShake: '镜头抖动',
	CG: 'CG',
	BG: 'BG',
	Sound: '音效',
	Branch: '选项分支',
	Goto: '跳转',
	End: '结束',
};

const ACTION_FOLDER: Partial<Record<DialogActionType, string>> = {
	CG: 'assets/CG/',
	BG: 'assets/BG/',
	Sound: 'assets/Audio/',
};

type SpriteMode = 'set' | 'clear';

function getSpriteMode(action: DialogAction): SpriteMode {
	return action.shouldSet === false ? 'clear' : 'set';
}

function makeDefaultAction(type: DialogActionType): DialogAction {
	if (type === 'CameraShake') {
		return { actionType: type };
	}
	if (type === 'Sound') {
		return { actionType: type, sound: '' };
	}
	if (type === 'Branch') {
		return {
			actionType: type,
			options: [
				{ text: '', jump: 1 },
				{ text: '', jump: 1 },
			],
		};
	}
	if (type === 'Goto') {
		return { actionType: type, index: 1 };
	}
	if (type === 'End') {
		return { actionType: type, exitCode: 0 };
	}
	return { actionType: type, sprite: '' };
}

interface DialogActionsEditorProps {
	actions: DialogAction[] | undefined;
	dialogCount: number;
	onChange: (actions: DialogAction[] | undefined) => void;
}

export const DialogActionsEditor = memo<DialogActionsEditorProps>(
	function DialogActionsEditor({ actions, dialogCount, onChange }) {
		const list = actions ?? [];
		const actionListRef = useFocusOnItemAppend(list.length);

		const update = useCallback(
			(next: DialogAction[]) => {
				onChange(next.length > 0 ? next : undefined);
			},
			[onChange]
		);

		const handleAdd = useCallback(
			(type: DialogActionType) => {
				update([...list, makeDefaultAction(type)]);
			},
			[list, update]
		);

		const handleRemove = useCallback(
			(index: number) => {
				update(list.filter((_, i) => i !== index));
			},
			[list, update]
		);

		const handleUpdate = useCallback(
			(index: number, patch: Partial<DialogAction>) => {
				const next = list.map((act, i) =>
					i === index ? ({ ...act, ...patch } as DialogAction) : act
				);
				update(next);
			},
			[list, update]
		);

		const handleMove = useCallback(
			(from: number, to: number) => {
				if (to < 0 || to >= list.length) return;
				const next = [...list];
				const [moved] = next.splice(from, 1);
				if (!moved) return;
				next.splice(to, 0, moved);
				update(next);
			},
			[list, update]
		);

		return (
			<div className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content2/30 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className={TYPOGRAPHY_STYLES.compactTitle}>
						动作列表（{list.length}）
					</span>
					<div className="flex flex-wrap gap-1">
						{ACTION_TYPES.map((type) => (
							<SectionAddButton
								key={type}
								onPress={() => {
									handleAdd(type);
								}}
							>
								{ACTION_LABEL[type]}
							</SectionAddButton>
						))}
					</div>
				</div>

				{list.length === 0 ? (
					<EmptyState variant="text" title="无附加动作" />
				) : (
					<div ref={actionListRef} className="flex flex-col gap-2">
						{list.map((action, index) => (
							<DialogActionRow
								key={index}
								action={action}
								index={index}
								dialogCount={dialogCount}
								total={list.length}
								onRemove={() => {
									handleRemove(index);
								}}
								onUpdate={(patch) => {
									handleUpdate(index, patch);
								}}
								onMoveUp={() => {
									handleMove(index, index - 1);
								}}
								onMoveDown={() => {
									handleMove(index, index + 1);
								}}
							/>
						))}
					</div>
				)}
			</div>
		);
	}
);

interface DialogActionRowProps {
	action: DialogAction;
	index: number;
	dialogCount: number;
	total: number;
	onUpdate: (patch: Partial<DialogAction>) => void;
	onRemove: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
}

const DialogActionRow = memo<DialogActionRowProps>(function DialogActionRow({
	action,
	index,
	dialogCount,
	total,
	onUpdate,
	onRemove,
	onMoveUp,
	onMoveDown,
}) {
	const isSpriteAction =
		action.actionType === 'CG' || action.actionType === 'BG';
	const isSoundAction = action.actionType === 'Sound';
	const isBranchAction = action.actionType === 'Branch';
	const isGotoAction = action.actionType === 'Goto';
	const isEndAction = action.actionType === 'End';

	return (
		<div
			data-editor-appended-item
			className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/50 p-3"
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							TYPOGRAPHY_STYLES.metadata,
							'rounded-small bg-primary/15 px-2 py-1 text-primary-700 dark:text-primary'
						)}
					>
						#{index + 1}
					</span>
					<span className={TYPOGRAPHY_STYLES.compactLabel}>
						{ACTION_LABEL[action.actionType]}
					</span>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-1">
					<Button
						variant="light"
						size="sm"
						onPress={onMoveUp}
						isDisabled={index === 0}
						className="h-10 min-w-0 rounded-medium px-2 text-xs sm:h-8"
					>
						上移
					</Button>
					<Button
						variant="light"
						size="sm"
						onPress={onMoveDown}
						isDisabled={index === total - 1}
						className="h-10 min-w-0 rounded-medium px-2 text-xs sm:h-8"
					>
						下移
					</Button>
					<SectionDeleteButton
						confirmTitle="确定要删除这个对话动作吗？"
						onPress={onRemove}
					>
						删除动作
					</SectionDeleteButton>
				</div>
			</div>

			{isSpriteAction && (
				<SpriteActionFields action={action} onUpdate={onUpdate} />
			)}
			{isSoundAction && (
				<SoundActionFields action={action} onUpdate={onUpdate} />
			)}
			{isBranchAction && (
				<BranchActionFields
					action={action}
					dialogCount={dialogCount}
					onUpdate={onUpdate}
				/>
			)}
			{isGotoAction && (
				<GotoActionFields
					action={action}
					dialogCount={dialogCount}
					onUpdate={onUpdate}
				/>
			)}
			{isEndAction && (
				<EndActionFields action={action} onUpdate={onUpdate} />
			)}
		</div>
	);
});

interface SpriteActionFieldsProps {
	action: DialogAction;
	onUpdate: (patch: Partial<DialogAction>) => void;
}

const SpriteActionFields = memo<SpriteActionFieldsProps>(
	function SpriteActionFields({ action, onUpdate }) {
		const mode = getSpriteMode(action);
		const folder = ACTION_FOLDER[action.actionType] ?? 'assets/';
		const selectId = useId();

		const {
			assets: { urls: assetUrls },
			getAssetUrl,
		} = useResourceEditor();

		const availableAssets = useMemo(() => {
			return Object.keys(assetUrls)
				.filter(
					(path) => path.startsWith(folder) && isImageAssetPath(path)
				)
				.sort();
		}, [assetUrls, folder]);

		const previewUrl =
			mode === 'set' && action.sprite
				? getAssetUrl(action.sprite)
				: undefined;

		const spriteStatus = getAssetReferenceStatus(
			mode === 'set' ? action.sprite : undefined,
			assetUrls,
			folder,
			isImageAssetPath
		);
		const spriteIssueLabel = spriteStatus.isMissing
			? '缺失'
			: spriteStatus.isUnsupportedType
				? '格式不支持'
				: spriteStatus.isOutsideRecommendedFolder
					? '不在推荐目录'
					: null;
		const isSpriteInvalid =
			spriteStatus.isMissing || spriteStatus.isUnsupportedType;

		const spriteItems = useMemo<SelectItemSpec<string>[]>(() => {
			const items: SelectItemSpec<string>[] = [
				{ value: '', label: '请选择资产…' },
			];
			if (action.sprite && !availableAssets.includes(action.sprite)) {
				items.push({
					value: action.sprite,
					label: spriteIssueLabel
						? `${action.sprite}（${spriteIssueLabel}）`
						: action.sprite,
				});
			}
			for (const path of availableAssets) {
				items.push({ value: path, label: path.slice(folder.length) });
			}
			return items;
		}, [availableAssets, action.sprite, folder, spriteIssueLabel]);

		const [isPickerOpen, setIsPickerOpen] = useState(false);
		const handleModeChange = (next: SpriteMode) => {
			if (next === 'clear') {
				onUpdate({ sprite: undefined, shouldSet: false });
			} else {
				onUpdate({ shouldSet: undefined, sprite: action.sprite ?? '' });
			}
		};
		const shouldConfirmClear = mode === 'set' && Boolean(action.sprite);
		const clearButton = (
			<Button
				size="sm"
				color="primary"
				variant={mode === 'clear' ? 'flat' : 'bordered'}
				aria-pressed={mode === 'clear'}
				className="h-10 sm:h-8"
				{...(shouldConfirmClear
					? {}
					: { onPress: () => handleModeChange('clear') })}
			>
				清空图片
			</Button>
		);

		return (
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						color="primary"
						variant={mode === 'set' ? 'flat' : 'bordered'}
						aria-pressed={mode === 'set'}
						className="h-10 sm:h-8"
						onPress={() => handleModeChange('set')}
					>
						设置图片
					</Button>
					{shouldConfirmClear ? (
						<ConfirmPopover
							trigger={clearButton}
							title="确定要清空这个图片动作吗？"
							description="确认后会丢失当前图片设置，重新切回“设置图片”不会恢复。"
							confirmLabel="清空"
							color="warning"
							onConfirm={() => handleModeChange('clear')}
						/>
					) : (
						clearButton
					)}
				</div>

				{mode === 'set' && (
					<div className="flex flex-col gap-2 sm:flex-row">
						<div className="bg-checkerboard flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-medium border border-divider">
							{previewUrl ? (
								<img
									src={previewUrl}
									alt="预览"
									className="image-rendering-pixelated h-full w-full object-contain"
									draggable={false}
								/>
							) : (
								<span className={TYPOGRAPHY_STYLES.caption}>
									无预览
								</span>
							)}
						</div>
						<div className="flex flex-1 flex-col gap-1">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor={selectId} size="sm">
									资产路径（来自{folder}）
								</Label>
								{spriteIssueLabel && (
									<WarningBadge>
										{spriteStatus.isMissing
											? '资产未注册'
											: spriteStatus.isUnsupportedType
												? '图片格式不支持'
												: '不在推荐目录'}
									</WarningBadge>
								)}
							</div>
							<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
								<Select<string>
									id={selectId}
									ariaLabel="资产路径"
									size="sm"
									isInvalid={isSpriteInvalid}
									placeholder="请选择资产…"
									value={action.sprite ?? ''}
									onChange={(v) =>
										onUpdate({ sprite: v || undefined })
									}
									items={spriteItems}
									baseClassName="min-w-0 flex-1"
								/>
								<Button
									variant="bordered"
									size="sm"
									onPress={() => setIsPickerOpen(true)}
									className="h-10 shrink-0 rounded-medium px-3 sm:h-8"
								>
									浏览资产
								</Button>
							</div>
							{availableAssets.length === 0 && (
								<p className={TYPOGRAPHY_STYLES.caption}>
									{folder}下暂无资产，请前往「资产」页上传。
								</p>
							)}
						</div>
					</div>
				)}

				<AssetPickerDialog
					acceptedFileTypes={IMAGE_ASSET_FILE_ACCEPT}
					open={isPickerOpen}
					isFileAccepted={isImageAssetPath}
					onClose={() => setIsPickerOpen(false)}
					onSelect={(path) => onUpdate({ sprite: path })}
					initialFolder={folder}
				/>
			</div>
		);
	}
);

interface BranchActionFieldsProps {
	action: DialogAction;
	dialogCount: number;
	onUpdate: (patch: Partial<DialogAction>) => void;
}

const BranchActionFields = memo<BranchActionFieldsProps>(
	function BranchActionFields({ action, dialogCount, onUpdate }) {
		const options = action.options ?? [];
		const finishTarget = dialogCount + 1;
		const optionListRef = useFocusOnItemAppend(options.length);

		const updateOptions = (next: DialogBranchOption[]) => {
			onUpdate({ options: next.length > 0 ? next : undefined });
		};

		const updateOption = (
			optionIndex: number,
			patch: Partial<DialogBranchOption>
		) => {
			updateOptions(
				options.map((option, i) =>
					i === optionIndex ? { ...option, ...patch } : option
				)
			);
		};

		const removeOption = (optionIndex: number) => {
			updateOptions(options.filter((_, i) => i !== optionIndex));
		};

		const moveOption = (from: number, to: number) => {
			if (to < 0 || to >= options.length) return;
			const next = [...options];
			const [moved] = next.splice(from, 1);
			if (!moved) return;
			next.splice(to, 0, moved);
			updateOptions(next);
		};

		return (
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className={TYPOGRAPHY_STYLES.caption}>
						{`跳转目标使用左侧显示的对话编号，范围1～${finishTarget}，${finishTarget}表示结束当前对话包。`}
					</p>
					<SectionAddButton
						onPress={() =>
							updateOptions([...options, { text: '', jump: 1 }])
						}
					>
						添加选项
					</SectionAddButton>
				</div>
				{options.length === 0 ? (
					<p
						className={cn(
							TYPOGRAPHY_STYLES.compactBody,
							'rounded-medium border border-warning/30 bg-warning/10 px-3 py-2 text-warning-700 dark:text-warning-600'
						)}
					>
						Branch至少需要一个选项，否则运行时会被当作普通对话行。
					</p>
				) : (
					<div ref={optionListRef} className="flex flex-col gap-2">
						{options.map((option, optionIndex) => (
							<div
								key={optionIndex}
								data-editor-appended-item
								className="grid min-w-0 gap-3 rounded-medium border border-divider bg-content2/30 p-3 sm:grid-cols-[minmax(0,1fr)_112px_112px_auto]"
							>
								<div className="flex flex-col gap-1">
									<Label size="sm">选项文本</Label>
									<Input
										value={option.text}
										onChange={(e) =>
											updateOption(optionIndex, {
												text: e.target.value,
											})
										}
										placeholder="请输入选项文本…"
										size="sm"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<Label size="sm">跳转</Label>
									<Input
										type="number"
										min={1}
										max={finishTarget}
										value={
											option.jump === undefined
												? ''
												: String(option.jump)
										}
										onChange={(e) =>
											updateOption(optionIndex, {
												jump: numberOrOne(
													e.target.value
												),
											})
										}
										size="sm"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<Label size="sm">价格</Label>
									<Input
										type="number"
										min={0}
										value={
											option.price === undefined
												? ''
												: String(option.price)
										}
										onChange={(e) =>
											updateOption(optionIndex, {
												price: numberOrUndefined(
													e.target.value
												),
											})
										}
										size="sm"
									/>
								</div>
								<div className="flex items-end gap-1">
									<Tooltip content="上移选项">
										<Button
											variant="light"
											size="sm"
											onPress={() =>
												moveOption(
													optionIndex,
													optionIndex - 1
												)
											}
											isDisabled={optionIndex === 0}
											className="h-10 min-w-0 rounded-medium px-2 text-xs sm:h-8"
										>
											上移
										</Button>
									</Tooltip>
									<Tooltip content="下移选项">
										<Button
											variant="light"
											size="sm"
											onPress={() =>
												moveOption(
													optionIndex,
													optionIndex + 1
												)
											}
											isDisabled={
												optionIndex ===
												options.length - 1
											}
											className="h-10 min-w-0 rounded-medium px-2 text-xs sm:h-8"
										>
											下移
										</Button>
									</Tooltip>
									<SectionDeleteButton
										iconOnly
										confirmTitle="确定要删除这个分支选项吗？"
										onPress={() =>
											removeOption(optionIndex)
										}
									>
										删除选项
									</SectionDeleteButton>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		);
	}
);

interface GotoActionFieldsProps {
	action: DialogAction;
	dialogCount: number;
	onUpdate: (patch: Partial<DialogAction>) => void;
}

const GotoActionFields = memo<GotoActionFieldsProps>(function GotoActionFields({
	action,
	dialogCount,
	onUpdate,
}) {
	const finishTarget = dialogCount + 1;
	return (
		<div className="flex flex-col gap-1">
			<Label size="sm">跳转目标对话编号</Label>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-center">
				<Input
					type="number"
					min={1}
					max={finishTarget}
					value={String(action.index ?? 1)}
					onChange={(e) =>
						onUpdate({ index: numberOrOne(e.target.value) })
					}
					className="h-10 text-xs sm:h-8 sm:w-32"
				/>
				<p className={TYPOGRAPHY_STYLES.caption}>
					使用左侧显示的对话编号，范围1～{finishTarget}，
					{finishTarget}表示结束当前对话包。
				</p>
			</div>
		</div>
	);
});

interface EndActionFieldsProps {
	action: DialogAction;
	onUpdate: (patch: Partial<DialogAction>) => void;
}

const EndActionFields = memo<EndActionFieldsProps>(function EndActionFields({
	action,
	onUpdate,
}) {
	return (
		<div className="flex flex-col gap-1">
			<Label size="sm">退出码</Label>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-center">
				<Input
					type="number"
					value={String(action.exitCode ?? 0)}
					onChange={(e) =>
						onUpdate({ exitCode: numberOrZero(e.target.value) })
					}
					className="h-10 text-xs sm:h-8 sm:w-32"
				/>
				<p className={TYPOGRAPHY_STYLES.caption}>
					结束当前对话包。普通对话保持0即可，只有需要读取ExitCode的调用会使用这个值。
				</p>
			</div>
		</div>
	);
});

function numberOrOne(value: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return 1;
	return parsed;
}

function numberOrZero(value: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return 0;
	return parsed;
}

function numberOrUndefined(value: string): number | undefined {
	if (!value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : undefined;
}

// Helper to keep Dialog typing consistent for callers that pass `Partial<Dialog>`
export type DialogActionsPatch = Pick<Dialog, 'actions'>;

interface SoundActionFieldsProps {
	action: DialogAction;
	onUpdate: (patch: Partial<DialogAction>) => void;
}

const SoundActionFields = memo<SoundActionFieldsProps>(
	function SoundActionFields({ action, onUpdate }) {
		const folder = ACTION_FOLDER.Sound ?? 'assets/Audio/';
		const selectId = useId();
		const [isPickerOpen, setIsPickerOpen] = useState(false);

		const {
			assets: { urls: assetUrls },
			getAssetUrl,
		} = useResourceEditor();

		const availableAssets = useMemo(() => {
			return Object.keys(assetUrls)
				.filter(
					(path) => path.startsWith(folder) && isWavAssetPath(path)
				)
				.sort();
		}, [assetUrls, folder]);

		const previewUrl = action.sound ? getAssetUrl(action.sound) : undefined;

		const soundStatus = getAssetReferenceStatus(
			action.sound,
			assetUrls,
			folder,
			isWavAssetPath
		);
		const soundIssueLabel = soundStatus.isMissing
			? '缺失'
			: soundStatus.isUnsupportedType
				? '格式不支持'
				: soundStatus.isOutsideRecommendedFolder
					? '不在推荐目录'
					: null;
		const isSoundInvalid =
			soundStatus.isMissing || soundStatus.isUnsupportedType;

		const soundItems = useMemo<SelectItemSpec<string>[]>(() => {
			const items: SelectItemSpec<string>[] = [
				{ value: '', label: '请选择音频…' },
			];
			if (action.sound && !availableAssets.includes(action.sound)) {
				items.push({
					value: action.sound,
					label: soundIssueLabel
						? `${action.sound}（${soundIssueLabel}）`
						: action.sound,
				});
			}
			for (const path of availableAssets) {
				items.push({ value: path, label: path.slice(folder.length) });
			}
			return items;
		}, [availableAssets, action.sound, folder, soundIssueLabel]);

		return (
			<div className="flex flex-col gap-2">
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor={selectId} size="sm">
							音频路径（来自{folder}，仅支持.wav）
						</Label>
						{soundIssueLabel && (
							<WarningBadge>
								{soundStatus.isMissing
									? '资产未注册'
									: soundStatus.isUnsupportedType
										? '仅支持.wav'
										: '不在推荐目录'}
							</WarningBadge>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
						<Select<string>
							id={selectId}
							ariaLabel="音频路径"
							size="sm"
							isInvalid={isSoundInvalid}
							placeholder="请选择音频…"
							value={action.sound ?? ''}
							onChange={(v) =>
								onUpdate({ sound: v || undefined })
							}
							items={soundItems}
							baseClassName="min-w-0 flex-1"
						/>
						<Button
							variant="bordered"
							size="sm"
							onPress={() => setIsPickerOpen(true)}
							className="h-10 shrink-0 rounded-medium px-3 sm:h-8"
						>
							浏览资产
						</Button>
					</div>
					{availableAssets.length === 0 && (
						<p className={TYPOGRAPHY_STYLES.caption}>
							{folder}下暂无音频，请前往「资产」页上传.wav文件。
						</p>
					)}
				</div>
				{previewUrl && (
					<audio
						controls
						src={previewUrl}
						className="h-8 w-full"
						preload="none"
					/>
				)}

				<AssetPickerDialog
					acceptedFileTypes=".wav"
					open={isPickerOpen}
					isFileAccepted={isWavAssetPath}
					onClose={() => setIsPickerOpen(false)}
					onSelect={(path) => onUpdate({ sound: path })}
					initialFolder={folder}
				/>
			</div>
		);
	}
);
