import type { MissionReward } from './mission';

/** 文文新闻节点；由 `ScheduleNews` 奖励安排发布，发布时依次执行 rewards、postRewards。 */
export interface INewsNode {
	label: string;
	debugLabel: string;
	title: string;
	description: string;
	rewards?: MissionReward[];
	postRewards?: MissionReward[];
}
