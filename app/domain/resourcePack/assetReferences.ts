import type { ResourceEx } from './contracts/resourceEx';
import { resolveDayMapAssetPath } from './dayMapAssets';
import { collectResourcePackReferenceLocations } from './referenceLocations';

export function collectResourcePackAssetReferences(
	resourcePack: ResourceEx
): ReadonlySet<string> {
	return new Set(
		collectResourcePackReferenceLocations(resourcePack).flatMap(
			(location) =>
				location.referencedKind === 'asset' &&
				typeof location.referencedValue === 'string'
					? [location.referencedValue]
					: []
		)
	);
}

export function remapResourcePackAssetReferences(
	resourcePack: ResourceEx,
	pathMap: ReadonlyMap<string, string>
): ResourceEx {
	let hasChanged = false;
	const remapPath = (path: string) => {
		const remapped = pathMap.get(path) ?? path;
		if (remapped !== path) hasChanged = true;
		return remapped;
	};
	const remapPaths = (paths: string[]) => {
		const remapped = paths.map(remapPath);
		return remapped.some((path, index) => path !== paths[index])
			? remapped
			: paths;
	};

	const ingredients = resourcePack.ingredients.map((ingredient) => {
		const spritePath = remapPath(ingredient.spritePath);
		return spritePath === ingredient.spritePath
			? ingredient
			: { ...ingredient, spritePath };
	});
	const foods = resourcePack.foods.map((food) => {
		const spritePath = remapPath(food.spritePath);
		return spritePath === food.spritePath ? food : { ...food, spritePath };
	});
	const beverages = resourcePack.beverages.map((beverage) => {
		const spritePath = remapPath(beverage.spritePath);
		return spritePath === beverage.spritePath
			? beverage
			: { ...beverage, spritePath };
	});
	const clothes = resourcePack.clothes.map((item) => {
		const spritePath = remapPath(item.spritePath);
		const portraitPath = remapPath(item.portraitPath);
		const pixelFullConfig = item.pixelFullConfig
			? {
					...item.pixelFullConfig,
					backSprite: remapPaths(item.pixelFullConfig.backSprite),
					eyeSprite: remapPaths(item.pixelFullConfig.eyeSprite),
					hairSprite: remapPaths(item.pixelFullConfig.hairSprite),
					mainSprite: remapPaths(item.pixelFullConfig.mainSprite),
				}
			: item.pixelFullConfig;
		if (
			spritePath === item.spritePath &&
			portraitPath === item.portraitPath &&
			pixelFullConfig?.backSprite === item.pixelFullConfig?.backSprite &&
			pixelFullConfig?.eyeSprite === item.pixelFullConfig?.eyeSprite &&
			pixelFullConfig?.hairSprite === item.pixelFullConfig?.hairSprite &&
			pixelFullConfig?.mainSprite === item.pixelFullConfig?.mainSprite
		) {
			return item;
		}
		return { ...item, pixelFullConfig, portraitPath, spritePath };
	});
	const characters = resourcePack.characters.map((character) => {
		const portraits = character.portraits?.map((portrait) => {
			const path = remapPath(portrait.path);
			return path === portrait.path ? portrait : { ...portrait, path };
		});
		const characterSpriteSetCompact = character.characterSpriteSetCompact
			? {
					...character.characterSpriteSetCompact,
					eyeSprite: remapPaths(
						character.characterSpriteSetCompact.eyeSprite
					),
					mainSprite: remapPaths(
						character.characterSpriteSetCompact.mainSprite
					),
				}
			: undefined;
		const hasPortraitChange = portraits?.some(
			(portrait, index) => portrait !== character.portraits?.[index]
		);
		const hasSpriteChange =
			characterSpriteSetCompact?.eyeSprite !==
				character.characterSpriteSetCompact?.eyeSprite ||
			characterSpriteSetCompact?.mainSprite !==
				character.characterSpriteSetCompact?.mainSprite;
		if (!hasPortraitChange && !hasSpriteChange) return character;
		return {
			...character,
			...(portraits === undefined ? {} : { portraits }),
			...(characterSpriteSetCompact === undefined
				? {}
				: { characterSpriteSetCompact }),
		};
	});
	const dialogPackages = resourcePack.dialogPackages.map((dialogPackage) => ({
		...dialogPackage,
		dialogList: dialogPackage.dialogList.map((dialog) => ({
			...dialog,
			...(dialog.actions === undefined
				? {}
				: {
						actions: dialog.actions.map((action) => {
							const sprite = action.sprite
								? remapPath(action.sprite)
								: action.sprite;
							const sound = action.sound
								? remapPath(action.sound)
								: action.sound;
							return sprite === action.sprite &&
								sound === action.sound
								? action
								: { ...action, sound, sprite };
						}),
					}),
		})),
	}));

	const remapMapPath = (path: string) => {
		const localPath = resolveDayMapAssetPath(
			path,
			resourcePack.packInfo.label
		);
		if (localPath === null) return path;
		const next = remapPath(localPath);
		return next === localPath
			? path
			: path.startsWith('rex://')
				? `rex://${resourcePack.packInfo.label}/${next}`
				: next;
	};
	const dayMaps = (resourcePack.dayMaps ?? []).map((map) => ({
		...map,
		tiles: map.tiles.map((tile) => ({
			...tile,
			image: remapMapPath(tile.image),
		})),
		mapBGM: {
			...map.mapBGM,
			intro: remapMapPath(map.mapBGM.intro),
			loop: remapMapPath(map.mapBGM.loop),
		},
	}));
	if (!hasChanged) return resourcePack;
	return {
		...resourcePack,
		dayMaps,
		beverages,
		characters,
		clothes,
		dialogPackages,
		foods,
		ingredients,
	};
}
