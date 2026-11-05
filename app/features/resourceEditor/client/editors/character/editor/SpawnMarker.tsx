import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Input from '@/design/ui/components/input';

import { DAY_SCENE_MAP } from '@/domain/data/daySceneMap';
import type {
	SpawnMarker,
	TSpawnMarkerRotation,
} from '@/domain/resourcePack/contracts/character';

import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { Select } from '@/features/resourceEditor/client/components/select/Select';

interface SpawnMarkerEditorProps {
	spawnMarker: SpawnMarker;
	onUpdate: (spawnMarker: SpawnMarker) => void;
}

export const SpawnMarkerEditor = memo<SpawnMarkerEditorProps>(
	function SpawnMarkerEditor({ spawnMarker, onUpdate }) {
		return (
			<EditorSection title="出没地点（Spawn Marker）">
				<p className={TYPOGRAPHY_STYLES.description}>
					稀客在白天的出没地点
				</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
					<div className="flex flex-col gap-1 sm:col-span-2 xl:col-span-1">
						<Label
							size="sm"
							tip={
								'您可以自由选择地图，包括“舞台”等特殊地图，不过MetaMiku不能保证功能正常。'
							}
						>
							地图（Map）
						</Label>
						<Select<string>
							ariaLabel="地图"
							value={spawnMarker.mapLabel}
							onChange={(v) =>
								onUpdate({ ...spawnMarker, mapLabel: v })
							}
							items={DAY_SCENE_MAP.map((map) => ({
								value: map.label,
								label: `${map.name}（${map.label}）`,
							}))}
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<Label size="sm" tip="朝向，包括上、下、左、右。">
							朝向（Rotation）
						</Label>
						<Select<TSpawnMarkerRotation>
							ariaLabel="朝向"
							value={spawnMarker.rotation ?? 'Down'}
							onChange={(v) =>
								onUpdate({ ...spawnMarker, rotation: v })
							}
							items={[
								{ value: 'Down', label: '下（Down）' },
								{ value: 'Up', label: '上（Up）' },
								{ value: 'Left', label: '左（Left）' },
								{ value: 'Right', label: '右（Right）' },
							]}
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<Label
							size="sm"
							tip="X坐标，可以在游戏中使用/whereami命令获取坐标。"
						>
							X坐标
						</Label>
						<Input
							type="number"
							step="0.1"
							value={String(spawnMarker.x)}
							onChange={(e) =>
								onUpdate({
									...spawnMarker,
									x: parseFloat(e.target.value) || 0,
								})
							}
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<Label
							size="sm"
							tip="Y坐标，可以在游戏中使用/whereami命令获取坐标。"
						>
							Y坐标
						</Label>
						<Input
							type="number"
							step="0.1"
							value={String(spawnMarker.y)}
							onChange={(e) =>
								onUpdate({
									...spawnMarker,
									y: parseFloat(e.target.value) || 0,
								})
							}
						/>
					</div>
				</div>
			</EditorSection>
		);
	}
);
