import type { ResourceEx } from './contracts/resourceEx';

export function createBlankResourcePack(): ResourceEx {
	return {
		packInfo: {
			name: 'New Resource Pack',
			label: 'NewPack',
			authors: [],
			description: '',
			version: '1.0.0',
		},
		characters: [],
		dialogPackages: [],
		gifts: [],
		dayMaps: [],
		ingredients: [],
		foods: [],
		beverages: [],
		recipes: [],
		missionNodes: [],
		eventNodes: [],
		merchants: [],
		clothes: [],
	};
}
