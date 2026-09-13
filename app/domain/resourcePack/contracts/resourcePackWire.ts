import type { Character } from './character';
import type { IDayMap } from './dayMap';
import type { DialogPackage } from './dialogue';
import type { EventNode } from './event';
import type { IGiftConfig } from './gift';
import type { Beverage, Clothes, Food, Ingredient, Recipe } from './items';
import type { MerchantConfig } from './merchant';
import type { MissionNode } from './mission';
import type { PackInfo } from './resourceEx';

export interface IResourcePackWire {
	packInfo?: PackInfo;
	name?: string;
	label?: string;
	authors?: string[];
	description?: string;
	version?: string;
	characters?: Character[] | null;
	dayMaps?: IDayMap[] | null;
	dialogPackages?: DialogPackage[] | null;
	gifts?: IGiftConfig[] | null;
	ingredients?: Ingredient[] | null;
	foods?: Food[] | null;
	beverages?: Beverage[] | null;
	recipes?: Recipe[] | null;
	missionNodes?: MissionNode[] | null;
	eventNodes?: EventNode[] | null;
	merchants?: MerchantConfig[] | null;
	clothes?: Clothes[] | null;
}
