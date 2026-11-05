import { cn } from '@heroui/theme';
import { memo, useCallback, useEffect, useRef } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Switch from '@/design/ui/components/switch';
import { useReducedMotion } from '@/design/ui/hooks/useReducedMotion';

import type {
	Character,
	CharacterPortrait,
	CharacterSpriteSet,
	GuestInfo,
	KizunaInfo,
	SpawnMarker,
} from '@/domain/resourcePack/contracts/character';
import type { DialogPackage } from '@/domain/resourcePack/contracts/dialogue';
import type { EventNode } from '@/domain/resourcePack/contracts/event';

import { CHARACTER_TYPE_LABELS } from '@/features/resourceEditor/client/characterTypeLabels';
import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { BasicInfo } from './editor/BasicInfo';
import { Descriptions } from './editor/Descriptions';
import { GuestInfoEditor } from './editor/GuestInfo';
import { KizunaInfoEditor } from './editor/KizunaInfo';
import { Portraits } from './editor/Portraits';
import { SpawnMarkerEditor } from './editor/SpawnMarker';
import { SpriteSetEditor } from './editor/SpriteSet';

interface CharacterEditorProps {
	character: Character | null;
	allEvents: EventNode[];
	allDialogPackages: DialogPackage[];
	isIdDuplicate: boolean;
	isLabelDuplicate: boolean;
	onRemove: () => void;
	onUpdate: (updates: Partial<Character>) => void;
}

export const CharacterEditor = memo<CharacterEditorProps>(
	function CharacterEditor({
		character,
		allEvents,
		allDialogPackages,
		isIdDuplicate,
		isLabelDuplicate,
		onRemove,
		onUpdate,
	}) {
		const { clearGuestDrafts } = useResourceEditor();
		const isReducedMotion = useReducedMotion();
		const shouldFocusSpawnMarkerRef = useRef(false);
		const spawnMarkerContainerRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (!character?.spawnMarker || !shouldFocusSpawnMarkerRef.current) {
				return;
			}
			shouldFocusSpawnMarkerRef.current = false;

			const frame = requestAnimationFrame(() => {
				const container = spawnMarkerContainerRef.current;
				if (!container) return;

				container
					.querySelector<HTMLElement>(
						'[data-slot="trigger"]:not([aria-disabled="true"])'
					)
					?.focus({ preventScroll: true });
				container.scrollIntoView({
					behavior: isReducedMotion ? 'auto' : 'smooth',
					block: 'nearest',
					inline: 'nearest',
				});
			});

			return () => cancelAnimationFrame(frame);
		}, [character?.spawnMarker, isReducedMotion]);

		const updateDescription = useCallback(
			(index: number, value: string) => {
				if (!character) {
					return;
				}
				const newDescriptions = [...(character.descriptions ?? [])];
				newDescriptions[index] = value;
				onUpdate({ descriptions: newDescriptions });
			},
			[character?.descriptions, onUpdate]
		);

		const updateSpawnMarker = useCallback(
			(spawnMarker: SpawnMarker) => {
				onUpdate({ spawnMarker });
			},
			[onUpdate]
		);

		const enableSpawnMarker = useCallback(() => {
			shouldFocusSpawnMarkerRef.current = true;
			updateSpawnMarker({
				mapLabel: 'BeastForest',
				x: 0,
				y: 0,
				rotation: 'Down',
			});
		}, [updateSpawnMarker]);

		const addPortrait = useCallback(() => {
			if (!character) {
				return;
			}
			const portraits = character.portraits ?? [];
			const nextPid =
				portraits.length > 0
					? Math.max(...portraits.map((p) => p.pid)) + 1
					: 0;

			const updates: Partial<Character> = {
				portraits: [
					...portraits,
					// Use standard path format consistent with Portraits.tsx
					{
						pid: nextPid,
						path: `assets/Character/${character.id}/Portrait/${nextPid}.png`,
					},
				],
			};

			if (!portraits.length) {
				updates.faceInNoteBook = nextPid;
			}

			onUpdate(updates);
		}, [character, onUpdate]);

		const removePortrait = useCallback(
			(index: number) => {
				if (!character) {
					return;
				}
				const portraits = [...(character.portraits ?? [])];
				const removedPortrait = portraits[index];
				if (!removedPortrait) return;

				portraits.splice(index, 1);

				const updates: Partial<Character> = { portraits };

				if (character.faceInNoteBook === removedPortrait.pid) {
					if (portraits.length > 0) {
						// Fallback to first available portrait, preferring 0
						const hasPid0 = portraits.some((p) => p.pid === 0);
						updates.faceInNoteBook = hasPid0
							? 0
							: portraits[0]?.pid;
					} else {
						updates.faceInNoteBook = undefined;
					}
				}

				onUpdate(updates);
			},
			[character?.portraits, character?.faceInNoteBook, onUpdate]
		);

		const updatePortrait = useCallback(
			(index: number, updates: Partial<CharacterPortrait>) => {
				if (!character) {
					return;
				}
				const portraits = [...(character.portraits ?? [])];
				const previousPortrait = portraits[index];
				if (!previousPortrait) return;
				portraits[index] = {
					...previousPortrait,
					...updates,
				} as CharacterPortrait;
				onUpdate({
					portraits,
					...(updates.pid !== undefined &&
					character.faceInNoteBook === previousPortrait.pid
						? { faceInNoteBook: updates.pid }
						: {}),
				});
			},
			[character, onUpdate]
		);

		const updateDefaultPortrait = useCallback(
			(pid: number) => {
				if (!character) {
					return;
				}
				onUpdate({ faceInNoteBook: pid });
			},
			[character, onUpdate]
		);

		const updateGuest = useCallback(
			(updates: Partial<GuestInfo>) => {
				if (!character) {
					return;
				}
				const defaultGuest: GuestInfo = {
					fundRangeLower: 0,
					fundRangeUpper: 0,
					evaluation: Array(9).fill(''),
					conversation: [],
					foodRequests: [],
					bevRequests: [],
					hateFoodTag: [],
					likeFoodTag: [],
					likeBevTag: [],
				};
				const guest = {
					...defaultGuest,
					...(character.guest ?? {}),
					...updates,
				};
				onUpdate({ guest });
			},
			[character?.guest, onUpdate]
		);

		const enableGuest = useCallback(() => {
			updateGuest({});
		}, [updateGuest]);

		const disableGuest = useCallback(() => {
			if (!character) return;
			clearGuestDrafts(character.id);
			onUpdate({ guest: undefined });
		}, [character, clearGuestDrafts, onUpdate]);

		const updateKizuna = useCallback(
			(updates: Partial<KizunaInfo>) => {
				if (!character) {
					return;
				}
				const currentKizuna = character.kizuna || {
					lv1UpgradePrerequisiteEvent: '',
					lv2UpgradePrerequisiteEvent: '',
					lv3UpgradePrerequisiteEvent: '',
					lv4UpgradePrerequisiteEvent: '',
					lv1Welcome: [],
					lv2Welcome: [],
					lv3Welcome: [],
					lv4Welcome: [],
					lv5Welcome: [],
					lv1ChatData: [],
					lv2ChatData: [],
					lv3ChatData: [],
					lv4ChatData: [],
					lv5ChatData: [],
					lv2InviteSucceed: [],
					lv2InviteFailed: [],
					lv3InviteSucceed: [],
					lv3InviteFailed: [],
					lv4InviteSucceed: [],
					lv4InviteFailed: [],
					lv5InviteSucceed: [],
					lv3RequestIngerdient: [],
					lv4RequestIngerdient: [],
					lv5RequestIngerdient: [],
					lv4RequestBeverage: [],
					lv5RequestBeverage: [],
					lv5Commision: [],
					lv5CommisionFinish: [],
					commisionAreaLabel: '',
				};
				onUpdate({ kizuna: { ...currentKizuna, ...updates } });
			},
			[character, onUpdate]
		);

		const enableKizuna = useCallback(() => {
			updateKizuna({});
		}, [updateKizuna]);

		const disableKizuna = useCallback(() => {
			onUpdate({ kizuna: undefined });
		}, [onUpdate]);

		const updateSpriteSet = useCallback(
			(updates: Partial<CharacterSpriteSet>) => {
				if (!character) {
					return;
				}
				const spriteSet = character.characterSpriteSetCompact ?? {
					name: character.label || '',
					mainSprite: Array(12).fill(''),
					eyeSprite: Array(24).fill(''),
				};
				onUpdate({
					characterSpriteSetCompact: { ...spriteSet, ...updates },
				});
			},
			[character, onUpdate]
		);

		const enableSpriteSet = useCallback(() => {
			if (!character) {
				return;
			}
			const { id, label } = character;
			const mainSprite = [];
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 3; col++) {
					mainSprite.push(
						`assets/Character/${id}/Sprite/Main_${row}, ${col}.png`
					);
				}
			}
			const eyeSprite = [];
			for (let row = 0; row < 6; row++) {
				for (let col = 0; col < 4; col++) {
					eyeSprite.push(
						`assets/Character/${id}/Sprite/Eyes_${row}, ${col}.png`
					);
				}
			}
			updateSpriteSet({ name: label, mainSprite, eyeSprite });
		}, [character, updateSpriteSet]);

		const disableSpriteSet = useCallback(() => {
			onUpdate({ characterSpriteSetCompact: undefined });
		}, [onUpdate]);

		const generateDefaultSprites = useCallback(() => {
			if (!character) {
				return;
			}
			const { id, label } = character;
			const mainSprite = [];
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 3; col++) {
					mainSprite.push(
						`assets/Character/${id}/Sprite/Main_${row}, ${col}.png`
					);
				}
			}
			const eyeSprite = [];
			for (let row = 0; row < 6; row++) {
				for (let col = 0; col < 4; col++) {
					eyeSprite.push(
						`assets/Character/${id}/Sprite/Eyes_${row}, ${col}.png`
					);
				}
			}
			updateSpriteSet({ name: label, mainSprite, eyeSprite });
		}, [character, updateSpriteSet]);

		if (!character) {
			return <EditorDetailEmptyState itemLabel="角色" />;
		}

		return (
			<EditorDetailPanel className="gap-8">
				<EditorDetailHeader
					title={
						<>
							<span className="hidden md:inline">编辑角色：</span>
							<span className="font-bold">
								{character.name || '未命名角色'}
							</span>
						</>
					}
					meta={
						<span
							className={cn(
								TYPOGRAPHY_STYLES.emphasizedText,
								'rounded-full bg-primary/20 px-3 py-1 text-primary'
							)}
						>
							{CHARACTER_TYPE_LABELS[character.type]}
						</span>
					}
					actions={
						<SectionDeleteButton
							confirmTitle="确定要删除这个角色吗？"
							onPress={onRemove}
						>
							删除角色
						</SectionDeleteButton>
					}
				/>

				<BasicInfo
					character={character}
					isIdDuplicate={isIdDuplicate}
					isLabelDuplicate={isLabelDuplicate}
					onUpdate={onUpdate}
				/>

				<Descriptions
					descriptions={character.descriptions ?? []}
					onUpdate={updateDescription}
				/>

				<div ref={spawnMarkerContainerRef}>
					{character.spawnMarker ? (
						<SpawnMarkerEditor
							spawnMarker={character.spawnMarker}
							onUpdate={updateSpawnMarker}
						/>
					) : (
						<EditorSection
							title="出没地点（Spawn Marker）"
							actions={
								<SectionAddButton onPress={enableSpawnMarker}>
									启用出没地点
								</SectionAddButton>
							}
						>
							<EmptyState
								variant="text"
								title="暂未配置白天出没地点"
							/>
						</EditorSection>
					)}
				</div>

				<EditorSection title="显示与分类">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="flex min-h-10 items-center justify-between gap-3 rounded-medium border border-divider bg-content1/50 px-3">
							<span className={TYPOGRAPHY_STYLES.controlLabel}>
								在图鉴中隐藏
							</span>
							<Switch
								size="sm"
								aria-label="在图鉴中隐藏"
								isSelected={character.hideInAlbum ?? false}
								onValueChange={(v) =>
									onUpdate({ hideInAlbum: v })
								}
							/>
						</div>
						<div className="flex min-h-10 items-center justify-between gap-3 rounded-medium border border-divider bg-content1/50 px-3">
							<span className={TYPOGRAPHY_STYLES.controlLabel}>
								是特殊客人
							</span>
							<Switch
								size="sm"
								aria-label="是特殊客人"
								isSelected={character.isParticular ?? false}
								onValueChange={(v) =>
									onUpdate({ isParticular: v })
								}
							/>
						</div>
						<div className="flex min-h-10 items-center justify-between gap-3 rounded-medium border border-divider bg-content1/50 px-3">
							<span className={TYPOGRAPHY_STYLES.controlLabel}>
								是联动客人
							</span>
							<Switch
								size="sm"
								aria-label="是联动客人"
								isSelected={
									character.isCollabCharacter ?? false
								}
								onValueChange={(v) =>
									onUpdate({ isCollabCharacter: v })
								}
							/>
						</div>
					</div>
				</EditorSection>

				<Portraits
					characterId={character.id}
					portraits={character.portraits ?? []}
					faceInNoteBook={character.faceInNoteBook}
					onAdd={addPortrait}
					onRemove={removePortrait}
					onUpdate={updatePortrait}
					onSetDefault={updateDefaultPortrait}
				/>

				<GuestInfoEditor
					characterId={character.id}
					guest={character.guest}
					onUpdate={updateGuest}
					onEnable={enableGuest}
					onDisable={disableGuest}
				/>

				<KizunaInfoEditor
					kizuna={character.kizuna}
					allEvents={allEvents}
					allDialogPackages={allDialogPackages}
					onUpdate={updateKizuna}
					onEnable={enableKizuna}
					onDisable={disableKizuna}
				/>

				<SpriteSetEditor
					characterId={character.id}
					spriteSet={character.characterSpriteSetCompact}
					label={character.label}
					onUpdate={updateSpriteSet}
					onEnable={enableSpriteSet}
					onDisable={disableSpriteSet}
					onGenerateDefaults={generateDefaultSprites}
				/>
			</EditorDetailPanel>
		);
	}
);
