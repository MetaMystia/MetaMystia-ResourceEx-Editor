export const ANNOUNCEMENT_VERSION = 'v0.9.2-2026-05-07';

export const ANNOUNCEMENT_TITLE =
	'MetaMystia ResourceEx Editor 公告 / Announcements';

export interface AnnouncementSection {
	/** 节段标题。 */
	title: string;
	/** 该节段下的条目，纯文本，自上而下展示。 */
	items: string[];
}

export const ANNOUNCEMENT_SECTIONS: AnnouncementSection[] = [
	{
		title: '重构通知 / Refactor Notice',
		items: [
			'MetaMiku 最近全面重构了此编辑器，使用时请多导出，如果您发现有任何 bug，请及时反馈。',
			'MetaMiku recently rebuilt this editor in depth. Please export your resource pack frequently, and report any bugs you find.',
			'此外，所有资源路径(如 assets/Beverage/11001.png) 将在未来被替换为 res://{Package Label}/path (如 res://ResourceExample/assets/Beverage/11001.png)，以支持资源包间的相互依赖引用。',
			'In addition, asset paths such as assets/Beverage/11001.png will later be replaced with res://{Package Label}/path, such as res://ResourceExample/assets/Beverage/11001.png, to support cross-package dependency references.',
		],
	},
	{
		title: '近期更新 / Recent Updates',
		items: [
			'新增顶部公告按钮，可从 GitHub 按钮旁随时重新打开公告。 / Added a top-bar announcement button next to GitHub so announcements can be reopened at any time.',
			'修复设计系统运行时导出问题，稳定 cn、Dropdown、Popover 在生产构建中的行为。 / Fixed runtime exports in the design UI layer so cn, Dropdown, and Popover work reliably in production builds.',
			'将多个原生下拉框替换为统一 Select 组件，改善深色主题下的选择体验。 / Replaced several native select controls with the unified Select component for a better themed dropdown experience.',
			'抽取通用标签组件 TagButton、TagSelector、TagsField，复用到酒水、料理、原料和任务条件编辑。 / Extracted reusable TagButton, TagSelector, and TagsField components for beverage, food, ingredient, and mission editors.',
			'公告弹窗已支持按版本首次访问自动展示，关闭后会记录已读版本。 / Announcements are now version-gated and shown on first visit, with the seen version recorded after closing.',
			'导航下拉项改用 Next Link，切换页面时不再清空已加载资源包数据。 / Navigation dropdown items now use Next Link so loaded resource pack data is preserved while changing pages.',
			'资源包 Label 会校验合法字符，并在导出前阻止无效 Label。 / Resource pack Label values are validated and invalid labels are blocked before export.',
		],
	},
];
