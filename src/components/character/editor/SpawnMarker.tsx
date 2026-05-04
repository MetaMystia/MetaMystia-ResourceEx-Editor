import { memo } from 'react';
import { Select } from '@/design/ui/components';
import { DAYSCENEMAP } from '@/data/daySceneMap';
import type { SpawnMarker } from '@/types/resource';
import { cn } from '@/design/ui/utils';
import { Label } from '@/components/common/Label';

interface SpawnMarkerEditorProps {
	spawnMarker: SpawnMarker;
	onUpdate: (spawnMarker: SpawnMarker) => void;
}

export const SpawnMarkerEditor = memo<SpawnMarkerEditorProps>(
	function SpawnMarkerEditor({ spawnMarker, onUpdate }) {
		const inputClass = cn(
			'w-full rounded bg-transparent px-3 py-2 text-sm outline-none transition-all',
			'border border-black/10 placeholder:text-black/30',
			'focus:border-primary/50 focus:ring-4 focus:ring-primary/10',
			'dark:border-white/10 dark:text-white dark:placeholder:text-white/30',
			'dark:focus:border-primary/50 dark:focus:ring-primary/10'
		);

		return (
			<div className="flex flex-col gap-2">
				<Label tip={'稀客在白天的出没地点'}>
					出没地点 (Spawn Marker)
				</Label>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1">
						<Label
							size="sm"
							tip={
								'您可以自由选择地图，包括"舞台"等特殊地图，不过 MetaMiku 可不保证功能正常哦'
							}
						>
							地图 (Map)
						</Label>
						<Select<string>
							ariaLabel="地图"
							value={spawnMarker.mapLabel}
							onChange={(v) =>
								onUpdate({ ...spawnMarker, mapLabel: v })
							}
							items={DAYSCENEMAP.map((map) => ({
								value: map.label,
								label: `${map.name} (${map.label})`,
							}))}
						/>
					</div>
					<div className="flex gap-4">
						<div className="flex flex-1 flex-col gap-1">
							<Label size="sm" tip="朝向，上下左右">
								朝向 (Rotation)
							</Label>
							<Select<SpawnMarker['rotation']>
								ariaLabel="朝向"
								value={spawnMarker.rotation || 'Down'}
								onChange={(v) =>
									onUpdate({ ...spawnMarker, rotation: v })
								}
								items={[
									{ value: 'Down', label: '下 (Down)' },
									{ value: 'Up', label: '上 (Up)' },
									{ value: 'Left', label: '左 (Left)' },
									{ value: 'Right', label: '右 (Right)' },
								]}
							/>
						</div>
						<div className="flex flex-1 flex-col gap-1">
							<Label
								size="sm"
								tip="x坐标，可以在游戏中使用 /whereami 命令获取坐标"
							>
								X 坐标
							</Label>
							<input
								type="number"
								step="0.1"
								className={inputClass}
								value={spawnMarker.x}
								onChange={(e) =>
									onUpdate({
										...spawnMarker,
										x: parseFloat(e.target.value) || 0,
									})
								}
							/>
						</div>
						<div className="flex flex-1 flex-col gap-1">
							<Label
								size="sm"
								tip="y坐标，可以在游戏中使用 /whereami 命令获取坐标"
							>
								Y 坐标
							</Label>
							<input
								type="number"
								step="0.1"
								className={inputClass}
								value={spawnMarker.y}
								onChange={(e) =>
									onUpdate({
										...spawnMarker,
										y: parseFloat(e.target.value) || 0,
									})
								}
							/>
						</div>
					</div>
				</div>
			</div>
		);
	}
);
