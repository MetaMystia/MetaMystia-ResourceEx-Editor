import type { INewsNode } from '@/domain/resourcePack/contracts/news';
import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { remapResourcePackLabelReferences } from '@/domain/resourcePack/entityReferences';

import { findNextAvailableSuffixedValue } from '@/features/resourceEditor/client/editorValueAllocation';

const DEFAULT_NEWS = {
	debugLabel: '新新闻',
	title: '',
	description: '',
} as const satisfies Partial<INewsNode>;

/** 在末尾追加一个带本包前缀标签的新闻，新闻下标为原长度。 */
export function appendNewsNode(resourcePack: ResourceEx): ResourceEx {
	const packLabel = resourcePack.packInfo.label;
	const labelPrefix = packLabel ? `_${packLabel}_` : '_';
	const newNews: INewsNode = {
		...DEFAULT_NEWS,
		rewards: [],
		postRewards: [],
		label: findNextAvailableSuffixedValue(
			resourcePack.newsNodes.map((newsNode) => newsNode.label),
			`${labelPrefix}News_`
		),
	};
	return { ...resourcePack, newsNodes: [...resourcePack.newsNodes, newNews] };
}

/** 合并新闻字段；标签变化时同步更新所有引用该新闻的奖励。 */
export function updateNewsNodeAt(
	resourcePack: ResourceEx,
	index: number,
	updates: Partial<INewsNode>
): ResourceEx {
	const previousNews = resourcePack.newsNodes[index];
	if (!previousNews) return resourcePack;
	const newsNodes = [...resourcePack.newsNodes];
	newsNodes[index] = { ...previousNews, ...updates };
	const nextResourcePack = { ...resourcePack, newsNodes };
	if (updates.label === undefined || updates.label === previousNews.label) {
		return nextResourcePack;
	}
	return remapResourcePackLabelReferences(
		nextResourcePack,
		'News',
		previousNews.label,
		updates.label
	);
}

export function removeNewsNodeAt(
	resourcePack: ResourceEx,
	index: number
): ResourceEx {
	return {
		...resourcePack,
		newsNodes: resourcePack.newsNodes.filter((_, i) => i !== index),
	};
}
