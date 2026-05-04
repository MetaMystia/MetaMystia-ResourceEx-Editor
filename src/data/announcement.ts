export const ANNOUNCEMENT_VERSION = 'v0.9.1-2026-05-04';

export const ANNOUNCEMENT_TITLE = 'MetaMystia ResourceEx Editor 公告';

export interface AnnouncementSection {
	/** 节段标题。 */
	title: string;
	/** 该节段下的条目，纯文本，自上而下展示。 */
	items: string[];
}

export const ANNOUNCEMENT_SECTIONS: AnnouncementSection[] = [
	{
		title: '重构通知',
		items: [
			'MetaMiku 最近全面重构了此编辑器，使用时请多导出，如果您发现有任何 bug，请及时反馈。',
			'此外，所有资源路径(如 assets/Beverage/11001.png) 将在未来被替换为 res://{Package Label}/path (如 res://ResourceExample/assets/Beverage/11001.png)，以支持资源包间的相互依赖引用。',
		],
	},
];
