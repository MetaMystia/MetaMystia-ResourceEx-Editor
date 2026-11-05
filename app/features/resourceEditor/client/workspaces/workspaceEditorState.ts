import type {
	LikeTag,
	SpawnConfig,
} from '@/domain/resourcePack/contracts/character';

export type TGuestLikeTagDraftField = 'likeBevTag' | 'likeFoodTag';

export interface IGuestLikeTagDraft {
	characterId: number;
	field: TGuestLikeTagDraftField;
	tag: LikeTag;
}

export interface IGuestSpawnDraft {
	characterId: number;
	spawn: SpawnConfig;
}

export interface IWorkspaceEditorState {
	guestLikeTagDrafts: readonly IGuestLikeTagDraft[];
	guestSpawnDrafts: readonly IGuestSpawnDraft[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

function readLikeTagDraft(value: unknown): IGuestLikeTagDraft | null {
	if (!isRecord(value) || !isRecord(value['tag'])) return null;
	const characterId = value['characterId'];
	const field = value['field'];
	const tagId = value['tag']['tagId'];
	const weight = value['tag']['weight'];
	if (
		!isSafeInteger(characterId) ||
		(field !== 'likeBevTag' && field !== 'likeFoodTag') ||
		!isSafeInteger(tagId) ||
		!isFiniteNumber(weight)
	) {
		return null;
	}
	return { characterId, field, tag: { tagId, weight } };
}

function readSpawnDraft(value: unknown): IGuestSpawnDraft | null {
	if (!isRecord(value) || !isRecord(value['spawn'])) return null;
	const characterId = value['characterId'];
	const izakayaId = value['spawn']['izakayaId'];
	const onlySpawnAfterUnlocking = value['spawn']['onlySpawnAfterUnlocking'];
	const onlySpawnWhenPlaceBeRecorded =
		value['spawn']['onlySpawnWhenPlaceBeRecorded'];
	const relativeProb = value['spawn']['relativeProb'];
	if (
		!isSafeInteger(characterId) ||
		!isSafeInteger(izakayaId) ||
		typeof onlySpawnAfterUnlocking !== 'boolean' ||
		typeof onlySpawnWhenPlaceBeRecorded !== 'boolean' ||
		!isFiniteNumber(relativeProb)
	) {
		return null;
	}
	return {
		characterId,
		spawn: {
			izakayaId,
			onlySpawnAfterUnlocking,
			onlySpawnWhenPlaceBeRecorded,
			relativeProb,
		},
	};
}

function sortLikeTagDrafts(drafts: IGuestLikeTagDraft[]) {
	return drafts.sort(
		(left, right) =>
			left.characterId - right.characterId ||
			left.field.localeCompare(right.field) ||
			left.tag.tagId - right.tag.tagId
	);
}

function sortSpawnDrafts(drafts: IGuestSpawnDraft[]) {
	return drafts.sort(
		(left, right) =>
			left.characterId - right.characterId ||
			left.spawn.izakayaId - right.spawn.izakayaId
	);
}

export function createEmptyWorkspaceEditorState(): IWorkspaceEditorState {
	return { guestLikeTagDrafts: [], guestSpawnDrafts: [] };
}

export function clearGuestDrafts(
	state: IWorkspaceEditorState,
	characterId: number
): IWorkspaceEditorState {
	const guestLikeTagDrafts = state.guestLikeTagDrafts.filter(
		(draft) => draft.characterId !== characterId
	);
	const guestSpawnDrafts = state.guestSpawnDrafts.filter(
		(draft) => draft.characterId !== characterId
	);
	if (
		guestLikeTagDrafts.length === state.guestLikeTagDrafts.length &&
		guestSpawnDrafts.length === state.guestSpawnDrafts.length
	) {
		return state;
	}
	return { guestLikeTagDrafts, guestSpawnDrafts };
}

export function cloneWorkspaceEditorState(
	state: IWorkspaceEditorState
): IWorkspaceEditorState {
	return {
		guestLikeTagDrafts: state.guestLikeTagDrafts.map((draft) => ({
			...draft,
			tag: { ...draft.tag },
		})),
		guestSpawnDrafts: state.guestSpawnDrafts.map((draft) => ({
			...draft,
			spawn: { ...draft.spawn },
		})),
	};
}

export function normalizeWorkspaceEditorState(
	value: unknown
): IWorkspaceEditorState {
	if (!isRecord(value)) return createEmptyWorkspaceEditorState();
	const likeTagDrafts = Array.isArray(value['guestLikeTagDrafts'])
		? value['guestLikeTagDrafts']
				.map(readLikeTagDraft)
				.filter((draft): draft is IGuestLikeTagDraft => draft !== null)
		: [];
	const spawnDrafts = Array.isArray(value['guestSpawnDrafts'])
		? value['guestSpawnDrafts']
				.map(readSpawnDraft)
				.filter((draft): draft is IGuestSpawnDraft => draft !== null)
		: [];
	return {
		guestLikeTagDrafts: sortLikeTagDrafts(likeTagDrafts),
		guestSpawnDrafts: sortSpawnDrafts(spawnDrafts),
	};
}

export function readGuestLikeTagDraft(
	state: IWorkspaceEditorState,
	characterId: number,
	field: TGuestLikeTagDraftField,
	tagId: number
): LikeTag | undefined {
	const draft = state.guestLikeTagDrafts.find(
		(candidate) =>
			candidate.characterId === characterId &&
			candidate.field === field &&
			candidate.tag.tagId === tagId
	);
	return draft ? { ...draft.tag } : undefined;
}

export function replaceGuestLikeTagDraft(
	state: IWorkspaceEditorState,
	characterId: number,
	field: TGuestLikeTagDraftField,
	tagId: number,
	tag: LikeTag | undefined
): IWorkspaceEditorState {
	const nextDrafts = state.guestLikeTagDrafts.filter(
		(draft) =>
			draft.characterId !== characterId ||
			draft.field !== field ||
			draft.tag.tagId !== tagId
	);
	if (tag) nextDrafts.push({ characterId, field, tag: { ...tag } });
	return { ...state, guestLikeTagDrafts: sortLikeTagDrafts(nextDrafts) };
}

export function readGuestSpawnDraft(
	state: IWorkspaceEditorState,
	characterId: number,
	izakayaId: number
): SpawnConfig | undefined {
	const draft = state.guestSpawnDrafts.find(
		(candidate) =>
			candidate.characterId === characterId &&
			candidate.spawn.izakayaId === izakayaId
	);
	return draft ? { ...draft.spawn } : undefined;
}

export function replaceGuestSpawnDraft(
	state: IWorkspaceEditorState,
	characterId: number,
	izakayaId: number,
	spawn: SpawnConfig | undefined
): IWorkspaceEditorState {
	const nextDrafts = state.guestSpawnDrafts.filter(
		(draft) =>
			draft.characterId !== characterId ||
			draft.spawn.izakayaId !== izakayaId
	);
	if (spawn) nextDrafts.push({ characterId, spawn: { ...spawn } });
	return { ...state, guestSpawnDrafts: sortSpawnDrafts(nextDrafts) };
}

export function replaceWorkspaceEditorStateCharacterId(
	state: IWorkspaceEditorState,
	previousCharacterId: number,
	nextCharacterId: number
): IWorkspaceEditorState {
	if (previousCharacterId === nextCharacterId) return state;
	return {
		guestLikeTagDrafts: sortLikeTagDrafts(
			state.guestLikeTagDrafts.map((draft) =>
				draft.characterId === previousCharacterId
					? { ...draft, characterId: nextCharacterId }
					: draft
			)
		),
		guestSpawnDrafts: sortSpawnDrafts(
			state.guestSpawnDrafts.map((draft) =>
				draft.characterId === previousCharacterId
					? { ...draft, characterId: nextCharacterId }
					: draft
			)
		),
	};
}
