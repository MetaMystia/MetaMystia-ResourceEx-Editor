import { type ReactNode, type SVGProps } from 'react';

import { type TMapMode, type TMapTool } from './dayMapEditorModel';

type TIconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: TIconProps & { children: ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="1em"
			height="1em"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	);
}

export function SelectIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M6 3.5l11.5 9.6-5.2.6 2.9 6.2-2.4 1.1-2.9-6.2L6 18.4z" />
		</Icon>
	);
}

export function BrushIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M18.6 3.6a2.1 2.1 0 0 1 3 3L13.4 14.8l-3-3z" />
			<path d="M10.2 12.1l1.9 1.9c.2 3.4-2.1 5.6-6.4 5.6-1.1 0-2.1-.3-2.9-.9 1.8-.6 2.4-1.9 2.4-3.4 0-2.1 2.4-3.8 5-3.2z" />
		</Icon>
	);
}

export function RectangleIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="4" y="5.5" width="16" height="13" rx="1.5" />
			<path d="M4 9h16" opacity="0.45" />
		</Icon>
	);
}

export function FillIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M4.6 11.3l6.7-6.7 7.8 7.8-6.7 6.7a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8z" />
			<path d="M4.3 12.5h14.5" />
			<path d="M20.5 15.8s1.6 1.8 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1.2 1.6-3 1.6-3z" />
		</Icon>
	);
}

export function EraserIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M14.2 4.3l5.5 5.5-9 9H6l-2.8-2.8a1.6 1.6 0 0 1 0-2.3z" />
			<path d="M8.6 9.9l5.5 5.5" />
			<path d="M11 20h9" />
		</Icon>
	);
}

export function PickerIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M15.7 3.8a2.3 2.3 0 0 1 3.2 0l1.3 1.3a2.3 2.3 0 0 1 0 3.2l-2.4 2.4-4.5-4.5z" />
			<path d="M13.9 7.6l-8.7 8.7a2 2 0 0 0-.5.9L4 20l2.8-.7a2 2 0 0 0 .9-.5l8.7-8.7" />
			<path d="M12.2 5.9l5.9 5.9" />
		</Icon>
	);
}

export function PlaceIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="3.5" y="3.5" width="17" height="17" rx="4" />
			<path d="M12 8v8M8 12h8" />
		</Icon>
	);
}

export function HandIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12" />
			<path d="M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5" />
			<path d="M14 6.5a1.5 1.5 0 0 1 3 0V12" />
			<path d="M17 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8l-2.3-3.1a1.6 1.6 0 0 1 2.4-2.1L8 15" />
		</Icon>
	);
}

export function TileModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="4" y="4" width="7" height="7" rx="1.2" />
			<rect x="13" y="4" width="7" height="7" rx="1.2" />
			<rect x="4" y="13" width="7" height="7" rx="1.2" />
			<rect x="13" y="13" width="7" height="7" rx="1.2" />
		</Icon>
	);
}

export function ObjectModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 3l5 6.5h-2.6L18 15H6l3.6-5.5H7z" />
			<path d="M12 15v5.5" />
			<path d="M8.5 20.5h7" />
		</Icon>
	);
}

export function SlopeModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M3.5 19.5h17V7.5z" />
			<path d="M8 17.5l8-5.5" opacity="0.5" />
		</Icon>
	);
}

export function CollisionModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<path d="M4 13l9-9M9.5 20L20 9.5M4 20l16-16" opacity="0.5" />
		</Icon>
	);
}

export function SpawnModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
			<circle cx="12" cy="10" r="2.4" />
		</Icon>
	);
}

export function MapModeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M3.5 6.2l5.5-2 6 2 5.5-2v13.6l-5.5 2-6-2-5.5 2z" />
			<path d="M9 4.2v13.6M15 6.2v13.6" />
		</Icon>
	);
}

export function UndoIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M9 14L4 9l5-5" />
			<path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
		</Icon>
	);
}

export function RedoIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M15 14l5-5-5-5" />
			<path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
		</Icon>
	);
}

export function EyeIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z" />
			<circle cx="12" cy="12" r="2.8" />
		</Icon>
	);
}

export function EyeOffIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17.4 17.4 0 0 1-2.4 3.4" />
			<path d="M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.3 9.3 0 0 0 5.4-1.6" />
			<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
			<path d="M3 3l18 18" />
		</Icon>
	);
}

export function PlusIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 5v14M5 12h14" />
		</Icon>
	);
}

export function MinusIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M5 12h14" />
		</Icon>
	);
}

export function LayersIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 3.5l8.5 4.6-8.5 4.6-8.5-4.6z" />
			<path d="M3.5 12.4l8.5 4.6 8.5-4.6" />
			<path d="M3.5 16.4l8.5 4.6 8.5-4.6" opacity="0.5" />
		</Icon>
	);
}

export function FitIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
			<rect x="9" y="9" width="6" height="6" rx="1" opacity="0.5" />
		</Icon>
	);
}

export function GridIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="3.5" y="3.5" width="17" height="17" rx="2" />
			<path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
		</Icon>
	);
}

export function MagnetIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M5 4h4v7a3 3 0 0 0 6 0V4h4v7a7 7 0 0 1-14 0z" />
			<path d="M5 8h4M15 8h4" />
		</Icon>
	);
}

export function SlidersIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
			<circle cx="16" cy="7" r="2" />
			<circle cx="10" cy="17" r="2" />
		</Icon>
	);
}

export function AlertIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M10.3 4.6L2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z" />
			<path d="M12 9.5v4M12 17v.01" />
		</Icon>
	);
}

export function CheckIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</Icon>
	);
}

export function ImageIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<circle cx="9" cy="10" r="1.8" />
			<path d="M21 16l-5-5-9 9" />
		</Icon>
	);
}

export function UploadIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
			<path d="M4 15.5v3a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-3" />
		</Icon>
	);
}

export function SearchIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<circle cx="11" cy="11" r="6.5" />
			<path d="M16 16l4.5 4.5" />
		</Icon>
	);
}

export function CloseIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M6 6l12 12M18 6L6 18" />
		</Icon>
	);
}

export function CopyIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
			<path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
		</Icon>
	);
}

export function KeyboardIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<rect x="2.5" y="6" width="19" height="12" rx="2" />
			<path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" />
		</Icon>
	);
}

export function StarIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
		</Icon>
	);
}

export function LocateIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="6.5" />
			<circle cx="12" cy="12" r="1.5" />
			<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
		</Icon>
	);
}

export function ChevronDownIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M6 9l6 6 6-6" />
		</Icon>
	);
}

export function MusicIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M9 18V5.5l11-2v12.5" />
			<circle cx="6.5" cy="18" r="2.5" />
			<circle cx="17.5" cy="16" r="2.5" />
		</Icon>
	);
}

export function CameraIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z" />
			<circle cx="12" cy="13" r="3.2" />
		</Icon>
	);
}

export function WandIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M4 20L15.5 8.5" />
			<path d="M14 7l3 3" />
			<path d="M18 2.5v3M16.5 4h3M20.5 9v2M19.5 10h2M10 3v2M9 4h2" />
		</Icon>
	);
}

export function ArrowIcon(props: TIconProps) {
	return (
		<Icon {...props}>
			<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
		</Icon>
	);
}

export const MAP_TOOL_ICONS = {
	brush: BrushIcon,
	eraser: EraserIcon,
	fill: FillIcon,
	hand: HandIcon,
	picker: PickerIcon,
	place: PlaceIcon,
	rectangle: RectangleIcon,
	select: SelectIcon,
} as const satisfies Record<TMapTool, (props: TIconProps) => ReactNode>;

export const MAP_MODE_ICONS = {
	collision: CollisionModeIcon,
	height: SlopeModeIcon,
	map: MapModeIcon,
	object: ObjectModeIcon,
	spawn: SpawnModeIcon,
	tile: TileModeIcon,
} as const satisfies Record<TMapMode, (props: TIconProps) => ReactNode>;
