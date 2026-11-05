'use client';

import { memo } from 'react';

import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import type { Character } from '@/domain/resourcePack/contracts/character';
import type {
	Beverage,
	Food,
	Ingredient,
	Recipe,
} from '@/domain/resourcePack/contracts/items';
import type { INewsNode } from '@/domain/resourcePack/contracts/news';

import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { EditorField } from '@/features/resourceEditor/client/components/fields/EditorField';
import { EditorDetailEmptyState } from '@/features/resourceEditor/client/components/layout/EditorDetailEmptyState';
import { EditorDetailHeader } from '@/features/resourceEditor/client/components/layout/EditorDetailHeader';
import { EditorDetailPanel } from '@/features/resourceEditor/client/components/layout/EditorDetailPanel';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { WarningBadge } from '@/features/resourceEditor/client/components/status/WarningBadge';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';
import { MissionRewardList } from '@/features/resourceEditor/client/editors/mission/MissionRewardList';
import { useRewardOptions } from '@/features/resourceEditor/client/editors/mission/useRewardOptions';
import { useLabelPrefixValidation } from '@/features/resourceEditor/client/hooks/useLabelPrefixValidation';

interface IProps {
	newsNode: INewsNode | null;
	allNews: INewsNode[];
	beverages: Beverage[];
	characters: Character[];
	foods: Food[];
	ingredients: Ingredient[];
	recipes: Recipe[];
	onRemove: () => void;
	onUpdate: (updates: Partial<INewsNode>) => void;
}

export default memo<IProps>(function NewsEditor({
	newsNode,
	allNews,
	beverages,
	characters,
	foods,
	ingredients,
	recipes,
	onRemove,
	onUpdate,
}) {
	const {
		allBeverages,
		allFoods,
		allIngredients,
		allRecipes,
		characterOptions,
	} = useRewardOptions({
		beverages,
		characters,
		foods,
		ingredients,
		recipes,
	});

	const {
		isValid: isLabelPrefixValid,
		prefix: expectedPrefix,
		hasPackLabel,
	} = useLabelPrefixValidation(newsNode?.label || '');
	const showPrefixWarning =
		hasPackLabel && newsNode && newsNode.label && !isLabelPrefixValid;
	const isLabelDuplicate =
		Boolean(newsNode?.label) &&
		allNews.some(
			(candidate) =>
				candidate !== newsNode && candidate.label === newsNode?.label
		);

	if (!newsNode) {
		return <EditorDetailEmptyState itemLabel="新闻节点" />;
	}

	return (
		<EditorDetailPanel>
			<EditorDetailHeader
				title="新闻节点编辑"
				actions={
					<SectionDeleteButton
						confirmTitle="确定要删除这个新闻节点吗？"
						onPress={onRemove}
					>
						删除新闻
					</SectionDeleteButton>
				}
			/>

			<EditorSection title="基本信息">
				<EditorField label="调试标签（Debug Label）">
					<Input
						type="text"
						value={newsNode.debugLabel}
						onChange={(e) =>
							onUpdate({ debugLabel: e.target.value })
						}
						placeholder="可留空"
					/>
				</EditorField>

				<EditorField
					label="标签（Label）"
					actions={
						isLabelDuplicate || showPrefixWarning ? (
							<div className="flex gap-2">
								{isLabelDuplicate && (
									<ErrorBadge>标签重复</ErrorBadge>
								)}
								{showPrefixWarning && (
									<WarningBadge>
										建议以{expectedPrefix}开头
									</WarningBadge>
								)}
							</div>
						) : undefined
					}
				>
					<Input
						type="text"
						value={newsNode.label}
						onChange={(e) => onUpdate({ label: e.target.value })}
						placeholder="游戏内唯一标识符"
						isInvalid={isLabelDuplicate}
					/>
				</EditorField>

				<EditorField label="标题（Title）">
					<Input
						type="text"
						value={newsNode.title}
						onChange={(e) => onUpdate({ title: e.target.value })}
						placeholder="新闻标题"
					/>
				</EditorField>

				<EditorField label="正文（Description）">
					<Textarea
						minRows={4}
						value={newsNode.description}
						onChange={(e) =>
							onUpdate({ description: e.target.value })
						}
						placeholder="新闻正文"
					/>
				</EditorField>

				<WarningNotice>
					由“计划新闻”奖励安排，在指定日期进入白天时发布。发布时依次发放奖励和后置奖励，不等待玩家阅读；重复发布会再次发放。正文不支持“$a”等占位符。
				</WarningNotice>
			</EditorSection>

			<MissionRewardList
				title="奖励（Rewards）"
				rewards={newsNode.rewards || []}
				characterOptions={characterOptions}
				allBeverages={allBeverages}
				allFoods={allFoods}
				allIngredients={allIngredients}
				allRecipes={allRecipes}
				allNews={allNews}
				onUpdate={(rewards) => onUpdate({ rewards })}
			/>

			<MissionRewardList
				title="后置奖励（Post Rewards）"
				rewards={newsNode.postRewards || []}
				characterOptions={characterOptions}
				allBeverages={allBeverages}
				allFoods={allFoods}
				allIngredients={allIngredients}
				allRecipes={allRecipes}
				allNews={allNews}
				onUpdate={(postRewards) => onUpdate({ postRewards })}
			/>
		</EditorDetailPanel>
	);
});
