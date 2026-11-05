import { TagButton, type TTagTone } from './TagButton';

interface IProps {
	isReadOnly?: boolean;
	tags: number[];
	tagPool: { id: number; name: string }[];
	onToggle: (tagId: number) => void;
	tone?: TTagTone;
}

export function TagSelector({
	isReadOnly = false,
	onToggle,
	tagPool,
	tags,
	tone = 'neutral',
}: IProps) {
	return (
		<div className="flex flex-wrap gap-2 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4">
			{tagPool.map((tag) => (
				<TagButton
					key={tag.id}
					tag={tag}
					isDisabled={isReadOnly}
					isSelected={tags.includes(tag.id)}
					onClick={() => onToggle(tag.id)}
					tone={tone}
				/>
			))}
		</div>
	);
}
