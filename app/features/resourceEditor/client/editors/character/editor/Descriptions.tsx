import { cn } from '@heroui/theme';
import { memo } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Textarea from '@/design/ui/components/textarea';

import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';

interface DescriptionsProps {
	descriptions: string[];
	onUpdate: (index: number, value: string) => void;
}

export const Descriptions = memo<DescriptionsProps>(function Descriptions({
	descriptions,
	onUpdate,
}) {
	return (
		<EditorSection title="角色图鉴描述">
			<p className={TYPOGRAPHY_STYLES.description}>
				稀客羁绊分别提升至LV1、LV3、LV5时，显示在小碎骨的笔记本图鉴中。
			</p>
			{descriptions.map((desc, i) => (
				<div key={i} className="flex min-w-0 items-start gap-3">
					<span
						className={cn(
							TYPOGRAPHY_STYLES.badgeLabel,
							'mt-2 shrink-0 rounded-medium bg-primary/15 px-2 py-1 text-primary-700 dark:text-primary'
						)}
					>
						LV{2 * i + 1}
					</span>
					<Textarea
						placeholder={`请输入第${i + 1}条描述...`}
						value={desc}
						onChange={(e) => {
							onUpdate(i, e.target.value);
						}}
						minRows={2}
						className="min-w-0"
					/>
				</div>
			))}
		</EditorSection>
	);
});
