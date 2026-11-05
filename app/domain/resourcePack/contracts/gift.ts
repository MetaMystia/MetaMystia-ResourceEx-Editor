import type { ProductType } from './merchant';

export type GiftProductType = Extract<
	ProductType,
	'Beverage' | 'Food' | 'Ingredient' | 'Item' | 'Recipe'
>;

export interface IGiftConfig {
	productType: GiftProductType;
	productId?: number | null;
	productAmount: number;
	allowRepeat: boolean;
	title: string;
	dialogPackageName: string;
}
