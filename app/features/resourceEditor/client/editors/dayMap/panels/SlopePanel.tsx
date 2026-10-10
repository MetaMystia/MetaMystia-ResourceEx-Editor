'use client';

import { cn } from '@heroui/theme';
import { memo, useMemo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';

import type { IDayMap } from '@/domain/resourcePack/contracts/dayMap';

import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import {
	formatMapNumber,
	formatSlopeAngle,
	MAP_LIMITS,
	SLOPE_PRESETS,
} from '@/features/resourceEditor/client/editors/dayMap/dayMapEditorModel';
import {
	MapHint,
	MapNumber,
	MapPanel,
} from '@/features/resourceEditor/client/editors/dayMap/MapFields';
import { SlopeModeIcon } from '@/features/resourceEditor/client/editors/dayMap/MapIcons';

interface IProps {
	map: IDayMap;
	onSlopeChange(slope: number): void;
	slope: number;
}

/** 示意图：方格中的白线就是向右行走时的实际方向。 */
function SlopeDiagram({ slope }: { slope: number }) {
	const size = 64;
	const centerY = 40;
	const rise = (slope * size) / 2;
	const color = slope > 0 ? '#0ea5e9' : slope < 0 ? '#f97316' : '#94a3b8';
	const angle = (Math.atan(slope) * 180) / Math.PI;
	return (
		<svg
			viewBox="0 0 120 80"
			className="h-20 w-[120px] shrink-0"
			role="img"
			aria-label={`向右移动一格，纵向${slope >= 0 ? '升高' : '降低'} ${formatMapNumber(Math.abs(slope))} 格`}
		>
			<rect
				x="28"
				y="8"
				width={size}
				height={size}
				rx="4"
				fill={color}
				fillOpacity="0.18"
				stroke={color}
				strokeOpacity="0.6"
			/>
			<line
				x1="20"
				y1={centerY}
				x2="100"
				y2={centerY}
				stroke="currentColor"
				strokeOpacity="0.25"
				strokeDasharray="3 3"
			/>
			<line
				x1="28"
				y1={centerY + rise}
				x2={28 + size}
				y2={centerY - rise}
				stroke={color}
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<polygon
				points="0,-5 9,0 0,5"
				fill={color}
				transform={`translate(${28 + size + 2} ${centerY - rise}) rotate(${-angle})`}
			/>
			<text
				x="60"
				y="76"
				textAnchor="middle"
				fontSize="9"
				fill="currentColor"
				fillOpacity="0.6"
			>
				向右 →
			</text>
		</svg>
	);
}

export const SlopePanel = memo(function SlopePanel({
	map,
	onSlopeChange,
	slope,
}: IProps) {
	const stats = useMemo(() => {
		let up = 0;
		let down = 0;
		for (const cell of map.height?.cells ?? []) {
			if (cell.slope > 0) up += 1;
			else if (cell.slope < 0) down += 1;
		}
		return { down, up };
	}, [map.height]);
	const hasNativeHeight = map.layers.some((layer) => layer.isHeight);
	return (
		<MapPanel
			title="坡面画笔"
			meta={`${stats.up + stats.down} 格`}
			icon={<SlopeModeIcon />}
			tip="坡度只修正左右移动：向右走 1 格，纵向变化 slope 格；上下移动不受影响。它不会移动图片、生成碰撞或改变遮挡。"
		>
			{hasNativeHeight && (
				<WarningNotice>
					这张地图带有原始高度层，标量坡度画笔已停用；原始贴图会原样保留。
				</WarningNotice>
			)}
			<div className="flex items-center gap-3 rounded-medium bg-default/25 p-2 text-foreground">
				<SlopeDiagram slope={slope} />
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-mono text-2xl font-semibold tabular-nums leading-8">
						{formatMapNumber(slope)}
					</span>
					<span className={TYPOGRAPHY_STYLES.compactDescription}>
						约 {formatSlopeAngle(slope)} ·{' '}
						{slope > 0
							? '向右上坡'
							: slope < 0
								? '向右下坡'
								: '平地（擦除）'}
					</span>
				</div>
			</div>
			<input
				type="range"
				min={-1}
				max={1}
				step={0.01}
				value={slope}
				aria-label="坡度"
				aria-valuetext={`${formatMapNumber(slope)}，约 ${formatSlopeAngle(slope)}`}
				className="w-full accent-primary"
				onChange={(event) => onSlopeChange(Number(event.target.value))}
			/>
			<div className="flex flex-col gap-1.5">
				{([1, -1] as const).map((sign) => (
					<div
						key={sign}
						className="flex flex-wrap items-center gap-1"
					>
						<span
							className={cn(
								TYPOGRAPHY_STYLES.compactLabel,
								'w-12 shrink-0'
							)}
						>
							{sign > 0 ? '右上坡' : '右下坡'}
						</span>
						{SLOPE_PRESETS.map((preset) => {
							const value = preset.value * sign;
							const isActive = Math.abs(slope - value) < 1e-9;
							return (
								<Button
									key={value}
									size="sm"
									variant={isActive ? 'flat' : 'light'}
									color={isActive ? 'primary' : 'default'}
									title={preset.label}
									className="h-7 min-w-0 px-2 font-mono text-xs tabular-nums"
									onPress={() => onSlopeChange(value)}
								>
									{formatMapNumber(value)}
								</Button>
							);
						})}
					</div>
				))}
			</div>
			<div className="grid grid-cols-[1fr_auto] items-end gap-2">
				<MapNumber
					label="精确数值"
					value={slope}
					min={-1}
					max={1}
					step={0.01}
					onChange={onSlopeChange}
				/>
				<Button
					size="sm"
					variant={slope === 0 ? 'flat' : 'light'}
					className="h-10 sm:h-8"
					onPress={() => onSlopeChange(0)}
				>
					平地
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-2 text-center">
				<div className="rounded-medium bg-[#0ea5e9]/10 px-2 py-1.5">
					<p className="font-mono text-sm font-semibold tabular-nums text-[#0284c7] dark:text-[#38bdf8]">
						{stats.up}
					</p>
					<p className={TYPOGRAPHY_STYLES.caption}>上坡格</p>
				</div>
				<div className="rounded-medium bg-[#f97316]/10 px-2 py-1.5">
					<p className="font-mono text-sm font-semibold tabular-nums text-[#c2410c] dark:text-[#fb923c]">
						{stats.down}
					</p>
					<p className={TYPOGRAPHY_STYLES.caption}>下坡格</p>
				</div>
			</div>
			<MapHint>
				阶梯从右下通往左上时，向右走是下降，坡度为负。拱桥常用左半
				+0.5、右半 −0.5。坡度格最多 {MAP_LIMITS.heightCellCount} 格。
			</MapHint>
		</MapPanel>
	);
});
