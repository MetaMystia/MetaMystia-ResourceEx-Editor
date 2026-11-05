import type { Clothes, PixelFullConfig } from './contracts/items';

type TClothesSpriteField = keyof Omit<PixelFullConfig, 'name'>;

const CLOTHES_ASSET_ROOT = 'assets/Clothes';
const ICON_FILE = 'icon.png';
const PORTRAIT_FILE = 'portrait.png';

const SPRITE_LAYOUTS: Record<
	TClothesSpriteField,
	{ columns: number; count: number; prefix: string }
> = {
	mainSprite: { columns: 3, count: 12, prefix: 'Main' },
	eyeSprite: { columns: 4, count: 24, prefix: 'Eyes' },
	hairSprite: { columns: 3, count: 12, prefix: 'Hair' },
	backSprite: { columns: 3, count: 12, prefix: 'Back' },
};
const SPRITE_FIELDS = Object.keys(SPRITE_LAYOUTS) as TClothesSpriteField[];

function getSpriteFile(field: TClothesSpriteField, index: number): string {
	const { columns, prefix } = SPRITE_LAYOUTS[field];
	return `Sprite/${prefix}_${Math.floor(index / columns)}, ${index % columns}.png`;
}

function getClothesAssetPath(id: number, file: string): string {
	return `${CLOTHES_ASSET_ROOT}/${String(id)}/${file}`;
}

export function createClothesPixelFullConfigName(
	packLabel: string | undefined,
	id: number,
	name: string
): string {
	return `_${packLabel || 'ResourceExample'}_Clothes_${String(id)}_${name || 'Unnamed'}`;
}

export function createDefaultClothesSpritePaths(
	id: number
): Pick<PixelFullConfig, TClothesSpriteField> {
	const paths = {} as Pick<PixelFullConfig, TClothesSpriteField>;
	for (const field of SPRITE_FIELDS) {
		paths[field] = Array.from(
			{ length: SPRITE_LAYOUTS[field].count },
			(_, index) => getClothesAssetPath(id, getSpriteFile(field, index))
		);
	}
	return paths;
}

export function createDefaultClothesAssetPaths(id: number) {
	return {
		portraitPath: getClothesAssetPath(id, PORTRAIT_FILE),
		spritePath: getClothesAssetPath(id, ICON_FILE),
	};
}

function readDefaultFolderId(path: string, file: string): number | null {
	const prefix = `${CLOTHES_ASSET_ROOT}/`;
	const suffix = `/${file}`;
	if (!path.startsWith(prefix) || !path.endsWith(suffix)) return null;
	const folder = path.slice(prefix.length, path.length - suffix.length);
	return /^-?\d+$/.test(folder) ? Number(folder) : null;
}

export interface IClothesDefaultsFollow {
	clothes: Clothes;
	/** Asset paths that moved, keyed by their previous path. */
	pathMoves: ReadonlyMap<string, string>;
}

/**
 * Carries the ID/name-derived defaults of `previous` over to `updated`.
 * Values that were customized (not the default for an unclaimed ID) are kept.
 */
export function followClothesDefaults(
	previous: Clothes,
	updated: Clothes,
	others: readonly Clothes[],
	packLabel: string | undefined
): IClothesDefaultsFollow {
	const pathMoves = new Map<string, string>();
	const isIdChanged = updated.id !== previous.id;
	if (!isIdChanged && updated.name === previous.name) {
		return { clothes: updated, pathMoves };
	}

	let pixelFullConfig = updated.pixelFullConfig;
	if (
		previous.pixelFullConfig.name ===
		createClothesPixelFullConfigName(packLabel, previous.id, previous.name)
	) {
		pixelFullConfig = {
			...pixelFullConfig,
			name: createClothesPixelFullConfigName(
				packLabel,
				updated.id,
				updated.name
			),
		};
	}

	const claimedIds = new Set(others.map(({ id }) => id));
	if (!isIdChanged || claimedIds.has(updated.id)) {
		return { clothes: { ...updated, pixelFullConfig }, pathMoves };
	}

	const follow = (path: string, file: string): string => {
		const folderId = readDefaultFolderId(path, file);
		if (folderId === null || claimedIds.has(folderId)) return path;
		const next = getClothesAssetPath(updated.id, file);
		if (next !== path) pathMoves.set(path, next);
		return next;
	};
	for (const field of SPRITE_FIELDS) {
		pixelFullConfig = {
			...pixelFullConfig,
			[field]: pixelFullConfig[field].map((path, index) =>
				follow(path, getSpriteFile(field, index))
			),
		};
	}
	return {
		clothes: {
			...updated,
			pixelFullConfig,
			portraitPath: follow(updated.portraitPath, PORTRAIT_FILE),
			spritePath: follow(updated.spritePath, ICON_FILE),
		},
		pathMoves,
	};
}
