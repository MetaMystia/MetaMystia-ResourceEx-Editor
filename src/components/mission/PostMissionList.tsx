import { memo, useCallback } from 'react';
import { Button, Select } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { EditorField } from '@/components/common/EditorField';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import type { MissionNode } from '@/types/resource';

interface PostMissionListProps {
	postMissions: string[] | undefined;
	allMissions: MissionNode[];
	onUpdate: (postMissions: string[]) => void;
}

export const PostMissionList = memo<PostMissionListProps>(
	function PostMissionList({ postMissions, allMissions, onUpdate }) {
		const addPostMission = useCallback(() => {
			const newPostMissions = [...(postMissions || []), ''];
			onUpdate(newPostMissions);
		}, [postMissions, onUpdate]);

		const removePostMission = useCallback(
			(index: number) => {
				if (!postMissions) return;
				const newPostMissions = [...postMissions];
				newPostMissions.splice(index, 1);
				onUpdate(newPostMissions);
			},
			[postMissions, onUpdate]
		);

		const updatePostMission = useCallback(
			(index: number, value: string) => {
				if (!postMissions) return;
				const newPostMissions = [...postMissions];
				newPostMissions[index] = value;
				onUpdate(newPostMissions);
			},
			[postMissions, onUpdate]
		);

		return (
			<EditorField
				className="gap-4"
				label={`后继任务(postMissionsAfterPerformance) (${
					postMissions?.length || 0
				})`}
				actions={
					<SectionAddButton onPress={addPostMission}>
						添加后继任务
					</SectionAddButton>
				}
			>
				<div className="flex flex-col gap-3">
					{(postMissions || []).map((pm, index) => (
						<div
							key={index}
							className="flex flex-col gap-3 rounded-lg border border-black/5 bg-black/5 p-4 dark:border-white/5 dark:bg-white/5"
						>
							<div className="flex items-center justify-between gap-4">
								<div className="flex flex-1 flex-col gap-1">
									<label className="text-xs font-medium opacity-70">
										任务 Label
									</label>
									<Select<string>
										ariaLabel="任务 Label"
										placeholder="请选择任务..."
										value={pm}
										onChange={(v) =>
											updatePostMission(index, v)
										}
										items={allMissions.map((m, i) => ({
											value: m.label,
											label: `${m.title || m.label} (${m.label})`,
											textValue: `${m.label}-${i}`,
										}))}
									/>
								</div>
								<Button
									variant="light"
									size="sm"
									onPress={() => removePostMission(index)}
									className="text-xs text-danger hover:bg-danger/10"
								>
									删除
								</Button>
							</div>
						</div>
					))}
					{(!postMissions || postMissions.length === 0) && (
						<EmptyState variant="text" title="暂无后继任务配置" />
					)}
				</div>
			</EditorField>
		);
	}
);
