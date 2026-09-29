import type { CharacterType } from './character';

export type DialogActionType =
	'CameraShake' | 'CG' | 'BG' | 'Sound' | 'Branch' | 'Goto' | 'End';

export interface DialogBranchOption {
	text: string;
	/** 1-based dialog number; missing legacy values serialize as 1. */
	jump?: number | undefined;
	/** Optional paid choice cost. Omit for normal free choices. */
	price?: number | undefined;
}

export interface DialogAction {
	actionType: DialogActionType;
	sprite?: string | undefined;
	shouldSet?: boolean | undefined;
	sound?: string | undefined;
	options?: DialogBranchOption[] | undefined;
	index?: number | undefined;
	exitCode?: number | undefined;
}

export interface Dialog {
	characterId: number;
	characterType: CharacterType;
	pid: number;
	position: 'Left' | 'Right';
	text: string;
	actions?: DialogAction[] | undefined;
}

export interface DialogPackage {
	name: string;
	dialogList: Dialog[];
}
