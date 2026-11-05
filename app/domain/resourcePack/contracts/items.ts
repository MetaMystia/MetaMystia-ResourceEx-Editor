export interface Ingredient {
	id: number;
	name: string;
	description: string;
	level: number;
	prefix: number;
	isFish: boolean;
	isMeat: boolean;
	isVeg: boolean;
	baseValue: number;
	tags: number[];
	spritePath: string;
}

export interface Food {
	id: number;
	name: string;
	description: string;
	level: number;
	baseValue: number;
	tags: number[];
	banTags: number[];
	spritePath: string;
}

export interface Beverage {
	id: number;
	name: string;
	description: string;
	level: number;
	baseValue: number;
	tags: number[];
	spritePath: string;
	modRoot?: string;
}

/** 顶层 `items` 声明的普通物品；编辑器模型尚未包含该数组。 */
export interface IItemConfig {
	id: number;
	name: string;
	description: string;
	spritePath: string;
}

export interface PixelFullConfig {
	name: string;
	mainSprite: string[];
	eyeSprite: string[];
	hairSprite: string[];
	backSprite: string[];
}

export interface Clothes {
	id: number;
	name: string;
	description: string;
	spritePath: string;
	portraitPath: string;
	pixelFullConfig: PixelFullConfig;
	izakayaSkinIndex?: number;
	izkayaHorizontalOffset?: number;
	notebookHorizontalOffset?: number;
	notebookVerticalOffset?: number;
	notebookUITitleHorizontalOffset?: number;
	notebookUITitleVerticalOffset?: number;
}

export type CookerType = 'Pot' | 'Grill' | 'Fryer' | 'Steamer' | 'CuttingBoard';

export interface Recipe {
	id: number;
	foodId: number;
	ingredients: number[];
	cookTime: number;
	cookerType: CookerType;
}
