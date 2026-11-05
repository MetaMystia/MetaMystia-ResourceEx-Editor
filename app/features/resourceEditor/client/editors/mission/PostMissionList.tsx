import { memo, useCallback } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';

import type { MissionNode } from '@/domain/resourcePack/contracts/mission';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';

interface PostMissionListProps {
	postMissions: string[] | undefined;
	allMissions: MissionNode[];
	onUpdate: (postMissions: string[]) => void;
}

export const PostMissionList = memo<PostMissionListProps>(
	function PostMissionList({ postMissions, allMissions, onUpdate }) {
		const postMissionListRef = useFocusOnItemAppend(
			postMissions?.length ?? 0
		);
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
			<EditorSection
				title={`后继任务（postMissionsAfterPerformance）（${
					postMissions?.length || 0
				}）`}
				actions={
					<SectionAddButton onPress={addPostMission}>
						添加后继任务
					</SectionAddButton>
				}
			>
				<div ref={postMissionListRef} className="flex flex-col gap-3">
					{(postMissions || []).map((pm, index) => (
						<div
							key={index}
							data-editor-appended-item
							className="flex min-w-0 flex-col gap-3 rounded-medium border border-divider bg-content1/40 p-3 sm:p-4"
						>
							<div className="flex flex-col gap-1">
								<p className={TYPOGRAPHY_STYLES.compactLabel}>
									任务标签（Label）
								</p>
								<div className="flex min-w-0 items-center gap-3">
									<Select<string>
										baseClassName="flex-1"
										ariaLabel="任务标签（Label）"
										placeholder="请选择任务…"
										value={pm}
										onChange={(v) =>
											updatePostMission(index, v)
										}
										items={allMissions.map((m) => ({
											value: m.label,
											label: `${m.title || m.label}（${m.label}）`,
										}))}
									/>
									<SectionDeleteButton
										iconOnly
										className="shrink-0 sm:h-10 sm:w-10"
										aria-label="删除后继任务"
										onPress={() => removePostMission(index)}
									/>
								</div>
							</div>
						</div>
					))}
					{(!postMissions || postMissions.length === 0) && (
						<EmptyState variant="text" title="暂无后继任务配置" />
					)}
				</div>
			</EditorSection>
		);
	}
);
