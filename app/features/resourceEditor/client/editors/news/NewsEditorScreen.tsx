'use client';

import { useCallback, useState } from 'react';

import type { INewsNode } from '@/domain/resourcePack/contracts/news';

import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { useEditorEntityNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import NewsEditor from './NewsEditor';
import { NewsList } from './NewsList';
import {
	appendNewsNode,
	removeNewsNodeAt,
	updateNewsNodeAt,
} from './newsNodeEdits';

export function NewsEditorScreen() {
	const { resourcePack: data, updateResourcePack } = useResourceEditor();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	useEditorEntityNavigationIntent({
		entityKind: 'news',
		getStableKey: (newsNode) => newsNode.label,
		items: data.newsNodes,
		onSelect: setSelectedIndex,
	});

	const newsCount = data.newsNodes.length;
	const addNews = useCallback(() => {
		updateResourcePack(appendNewsNode);
		setSelectedIndex(newsCount);
	}, [newsCount, updateResourcePack]);

	const updateNews = useCallback(
		(index: number | null, updates: Partial<INewsNode>) => {
			if (index === null) return;
			updateResourcePack((current) =>
				updateNewsNodeAt(current, index, updates)
			);
		},
		[updateResourcePack]
	);

	const removeNews = useCallback(
		(index: number | null) => {
			if (index === null) return;
			updateResourcePack((current) => removeNewsNodeAt(current, index));
			setSelectedIndex(null);
		},
		[updateResourcePack]
	);

	const selectedNews =
		selectedIndex === null ? null : (data.newsNodes[selectedIndex] ?? null);

	return (
		<EditorWorkspace detailKey={selectedIndex}>
			<NewsList
				newsNodes={data.newsNodes}
				selectedIndex={selectedIndex}
				onAdd={addNews}
				onSelect={setSelectedIndex}
			/>

			<div className="lg:col-span-2">
				<NewsEditor
					newsNode={selectedNews}
					allNews={data.newsNodes}
					beverages={data.beverages}
					characters={data.characters}
					foods={data.foods}
					ingredients={data.ingredients}
					recipes={data.recipes}
					onRemove={() => removeNews(selectedIndex)}
					onUpdate={(updates) => updateNews(selectedIndex, updates)}
				/>
			</div>
		</EditorWorkspace>
	);
}
