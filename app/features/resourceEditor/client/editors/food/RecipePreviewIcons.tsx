import type { CSSProperties } from 'react';

import Tooltip from '@/design/ui/components/tooltip';

import { COOKER_TYPE_NAMES } from '@/domain/data/cookerTypes';
import { INGREDIENT_NAMES } from '@/domain/data/ingredients';
import type {
	CookerType,
	Ingredient,
} from '@/domain/resourcePack/contracts/items';

const DISPLAY_SIZE = 32;
const SPRITES_PER_ROW = 10;

// Upstream's atlas follows its own release order, which differs from the
// resource editor's ID/name list. Keep this mapping explicit to avoid icons
// drifting whenever either list is reordered.
const INGREDIENT_ATLAS_INDEX: Record<number, number> = {
	[-1]: 61,
	0: 0,
	1: 1,
	2: 2,
	3: 3,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 10,
	11: 11,
	12: 12,
	13: 13,
	14: 14,
	15: 15,
	16: 16,
	17: 17,
	18: 18,
	19: 19,
	20: 20,
	21: 21,
	22: 22,
	23: 23,
	24: 24,
	25: 25,
	26: 26,
	27: 27,
	28: 28,
	29: 29,
	30: 30,
	31: 31,
	32: 32,
	33: 33,
	34: 34,
	35: 35,
	36: 36,
	1000: 37,
	1001: 38,
	1002: 39,
	1003: 40,
	1004: 41,
	1005: 42,
	2000: 43,
	2001: 44,
	2002: 45,
	3000: 46,
	3001: 47,
	3002: 48,
	3003: 49,
	4000: 50,
	4001: 51,
	4002: 52,
	4003: 53,
	4004: 54,
	5000: 55,
	5001: 56,
	5002: 57,
	5003: 58,
	5004: 59,
	5005: 60,
};

const COOKER_INDEX: Record<CookerType, number> = {
	Pot: 0,
	Grill: 1,
	Fryer: 2,
	Steamer: 3,
	CuttingBoard: 4,
};

function AtlasIcon({
	sprite,
	index,
	label,
}: {
	sprite: 'cooker' | 'ingredient';
	index: number;
	label: string;
}) {
	const x = (index % SPRITES_PER_ROW) * DISPLAY_SIZE;
	const y = Math.floor(index / SPRITES_PER_ROW) * DISPLAY_SIZE;
	const style = {
		backgroundImage: `url('/assets/sprites/${sprite}.png')`,
		backgroundPosition: `-${x}px -${y}px`,
		backgroundSize: `${SPRITES_PER_ROW * DISPLAY_SIZE}px auto`,
		height: DISPLAY_SIZE,
		width: DISPLAY_SIZE,
	} satisfies CSSProperties;

	return (
		<Tooltip content={label}>
			<span
				aria-label={label}
				role="img"
				className="image-rendering-pixelated inline-block shrink-0"
				style={style}
			/>
		</Tooltip>
	);
}

export function CookerPreviewIcon({ cookerType }: { cookerType: CookerType }) {
	const name = COOKER_TYPE_NAMES[cookerType];
	return (
		<AtlasIcon
			sprite="cooker"
			index={COOKER_INDEX[cookerType]}
			label={name}
		/>
	);
}

export function IngredientPreviewIcon({
	id,
	ingredient,
	spriteUrl,
}: {
	id: number;
	ingredient?: Ingredient | undefined;
	spriteUrl?: string | undefined;
}) {
	const atlasIndex = INGREDIENT_ATLAS_INDEX[id];
	const builtinIndex = INGREDIENT_NAMES.findIndex((item) => item.id === id);
	const name =
		ingredient?.name ??
		INGREDIENT_NAMES[builtinIndex]?.name ??
		`未知食材（${id}）`;

	if (spriteUrl) {
		return (
			<Tooltip content={name}>
				<img
					src={spriteUrl}
					alt={name}
					className="image-rendering-pixelated h-8 w-8 shrink-0 object-contain"
				/>
			</Tooltip>
		);
	}

	if (atlasIndex !== undefined) {
		return (
			<AtlasIcon sprite="ingredient" index={atlasIndex} label={name} />
		);
	}

	return (
		<Tooltip content={name}>
			<span
				aria-label={name}
				role="img"
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-medium border border-divider text-xs text-foreground/40"
			>
				?
			</span>
		</Tooltip>
	);
}
