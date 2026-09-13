import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import { type TComparisonDifferenceStatus } from '@/features/resourceComparison/domain/contracts';
import { Select } from '@/features/resourceEditor/client/components/select/Select';

interface IProps {
	hasIssuesOnly: boolean;
	includeUnchanged: boolean;
	query: string;
	resourceType: string;
	statuses: readonly TComparisonDifferenceStatus[];
	onHasIssuesOnlyChange: (value: boolean) => void;
	onIncludeUnchangedChange: (value: boolean) => void;
	onQueryChange: (value: string) => void;
	onResourceTypeChange: (value: string) => void;
	onToggleStatus: (status: TComparisonDifferenceStatus) => void;
}

const STATUS_OPTIONS = [
	{ label: '新增', value: 'added' },
	{ label: '修改', value: 'modified' },
	{ label: '移除', value: 'removed' },
	{ label: '无法匹配', value: 'ambiguous' },
] as const satisfies readonly {
	label: string;
	value: TComparisonDifferenceStatus;
}[];

const RESOURCE_TYPE_OPTIONS = [
	{ label: '全部资源类型', value: 'all' },
	{ label: '基础信息', value: 'packInfo' },
	{ label: '稀客', value: 'characters' },
	{ label: '对话包', value: 'dialogPackages' },
	{ label: '食材', value: 'ingredients' },
	{ label: '料理', value: 'foods' },
	{ label: '酒水', value: 'beverages' },
	{ label: '食谱', value: 'recipes' },
	{ label: '任务', value: 'missionNodes' },
	{ label: '商人', value: 'merchants' },
	{ label: '衣服', value: 'clothes' },
	{ label: '白天地图', value: 'dayMaps' },
	{ label: '礼物邮箱', value: 'gifts' },
	{ label: '事件', value: 'eventNodes' },
	{ label: 'License', value: 'license' },
];

export function ComparisonFilters({
	hasIssuesOnly,
	includeUnchanged,
	onHasIssuesOnlyChange,
	onIncludeUnchangedChange,
	onQueryChange,
	onResourceTypeChange,
	onToggleStatus,
	query,
	resourceType,
	statuses,
}: IProps) {
	return (
		<div className="flex flex-col gap-3">
			<Input
				aria-label="搜索差异"
				placeholder="搜索字段、路径或值"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
			/>
			<Select
				ariaLabel="资源类型"
				items={RESOURCE_TYPE_OPTIONS}
				value={resourceType}
				onChange={onResourceTypeChange}
			/>
			<div className="flex flex-wrap gap-2" aria-label="差异状态筛选">
				{STATUS_OPTIONS.map((option) => {
					const isSelected = statuses.includes(option.value);
					return (
						<Button
							key={option.value}
							aria-pressed={isSelected}
							color={isSelected ? 'primary' : 'default'}
							size="sm"
							variant={isSelected ? 'solid' : 'flat'}
							onPress={() => onToggleStatus(option.value)}
						>
							{option.label}
						</Button>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-6 gap-y-3">
				<Switch
					isSelected={includeUnchanged}
					onValueChange={onIncludeUnchangedChange}
				>
					<span className={TYPOGRAPHY_STYLES.compactBody}>
						显示相同项
					</span>
				</Switch>
				<Switch
					isSelected={hasIssuesOnly}
					onValueChange={onHasIssuesOnlyChange}
				>
					<span className={TYPOGRAPHY_STYLES.compactBody}>
						仅显示校验异常
					</span>
				</Switch>
			</div>
		</div>
	);
}
