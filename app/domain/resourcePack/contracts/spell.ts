export interface ISpellCardConfig {
	name: string;
	description: string;
	portrait: string;
}

export interface ISpellConfig {
	id: number;
	implementation: string;
	vfxBundle?: string | null;
	positive: ISpellCardConfig;
	negative: ISpellCardConfig;
	portrayalPivot?: number[] | null;
}

export interface IBuffConfig {
	id: number;
	name: string;
	description: string;
	icon: string;
}

export interface IAssetBundleConfig {
	path: string;
}
