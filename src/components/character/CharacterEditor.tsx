import { memo, useCallback, useEffect } from 'react';

import { SectionDeleteButton } from '@/components/common/SectionDeleteButton';
import { BasicInfo } from './editor/BasicInfo';
import { Descriptions } from './editor/Descriptions';
import { SpawnMarkerEditor } from './editor/SpawnMarker';
import { GuestInfoEditor } from './editor/GuestInfo';
import { KizunaInfoEditor } from './editor/KizunaInfo';
import { Portraits } from './editor/Portraits';
import { SpriteSetEditor } from './editor/SpriteSet';

import type {
	Character,
	CharacterPortrait,
	CharacterSpriteSet,
	DialogPackage,
	EventNode,
	GuestInfo,
	KizunaInfo,
	SpawnMarker,
} from '@/types/resource';

interface CharacterEditorProps {
	character: Character | null;
	allEvents: EventNode[];
	allDialogPackages: DialogPackage[];
	isIdDuplicate: boolean;
	onRemove: () => void;
	onUpdate: (updates: Partial<Character>) => void;
}

export const CharacterEditor = memo<CharacterEditorProps>(
	function CharacterEditor({
		character,
		allEvents,
		allDialogPackages,
		isIdDuplicate,
		onRemove,
		onUpdate,
	}) {
		// Ensure default portrait is set if portraits exist
		useEffect(() => {
			const portraits = character?.portraits;
			if (
				portraits &&
				portraits.length > 0 &&
				character?.faceInNoteBook === undefined
			) {
				const hasPid0 = portraits.some((p) => p.pid === 0);
				const targetPid = hasPid0 ? 0 : portraits[0]!.pid;
				onUpdate({ faceInNoteBook: targetPid });
			}
		}, [
			character?.portraits,
			character?.faceInNoteBook,
			onUpdate,
			character?.id,
		]);

		// Ensure spawnMarker exists
		useEffect(() => {
			if (character && !character.spawnMarker) {
				onUpdate({
					spawnMarker: {
						mapLabel: 'BeastForest',
						x: 0,
						y: 0,
						rotation: 'Down',
					},
				});
			}
		}, [character?.spawnMarker, onUpdate, character]);

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
				portraits[index] = {
					...portraits[index],
					...updates,
				} as CharacterPortrait;
				onUpdate({ portraits });
			},
			[character?.portraits, onUpdate]
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
			onUpdate({ guest: undefined });
		}, [onUpdate]);

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
					lv1InviteSucceed: [],
					lv1InviteFailed: [],
					lv2InviteSucceed: [],
					lv2InviteFailed: [],
					lv3InviteSucceed: [],
					lv3InviteFailed: [],
					lv4InviteSucceed: [],
					lv4InviteFailed: [],
					lv5InviteSucceed: [],
					lv5InviteFailed: [],
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
			const label = character.label || 'Unknown';
			const mainSprite = [];
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 3; col++) {
					mainSprite.push(
						`assets/Character/${label}/Sprite/Main_${row}, ${col}.png`
					);
				}
			}
			const eyeSprite = [];
			for (let row = 0; row < 6; row++) {
				for (let col = 0; col < 4; col++) {
					eyeSprite.push(
						`assets/Character/${label}/Sprite/Eyes_${row}, ${col}.png`
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
			const label = character.label || 'Unknown';
			const mainSprite = [];
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 3; col++) {
					mainSprite.push(
						`assets/Character/${label}/Sprite/Main_${row}, ${col}.png`
					);
				}
			}
			const eyeSprite = [];
			for (let row = 0; row < 6; row++) {
				for (let col = 0; col < 4; col++) {
					eyeSprite.push(
						`assets/Character/${label}/Sprite/Eyes_${row}, ${col}.png`
					);
				}
			}
			updateSpriteSet({ name: label, mainSprite, eyeSprite });
		}, [character, updateSpriteSet]);

		if (!character) {
			return (
				<div className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-4 shadow-md backdrop-blur lg:col-span-2">
					<div className="flex items-center justify-center text-center font-semibold italic opacity-30">
						请从左侧选择一个角色进行编辑，或点击 + 按钮添加新角色
					</div>
				</div>
			);
		}

		return (
			<div className="flex flex-col gap-8 overflow-y-auto rounded-lg bg-white/10 p-4 shadow-md backdrop-blur lg:col-span-2">
				<div className="flex items-center justify-between border-b border-white/10 pb-4">
					<div className="flex items-center gap-2">
						<h2 className="text-xl font-semibold">
							<span className="hidden md:inline">编辑角色：</span>
							<span className="font-bold">
								{character.name || '未命名角色'}
							</span>
						</h2>
						<span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-medium text-primary">
							{character.type || '未知类型'}
						</span>
					</div>
					<SectionDeleteButton onPress={onRemove}>
						删除角色
					</SectionDeleteButton>
				</div>

				<BasicInfo
					character={character}
					isIdDuplicate={isIdDuplicate}
					onUpdate={onUpdate}
				/>

				<Descriptions
					descriptions={character.descriptions ?? []}
					onUpdate={updateDescription}
				/>

				<SpawnMarkerEditor
					spawnMarker={
						character.spawnMarker ?? {
							mapLabel: 'BeastForest',
							x: 0,
							y: 0,
							rotation: 'Down',
						}
					}
					onUpdate={updateSpawnMarker}
				/>

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
			</div>
		);
	}
);
