'use client';

import { useData } from '@/components/context/DataContext';
import { EditorField } from '@/components/common/EditorField';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import { TextInput } from '@/components/common/TextInput';
import { TextArea } from '@/components/common/TextArea';
import { ArrayFieldEditor } from '@/components/common/ArrayFieldEditor';
import { useVersionValidation } from '@/components/common/useVersionValidation';
import { IdRangeEditor } from '@/components/info/IdRangeEditor';
import { DependencySelector } from '@/components/info/DependencySelector';
import type { PackInfo } from '@/types/resource';
import {
	KNOWN_DEPENDENCIES,
	PACK_LABEL_ALLOWED_DESCRIPTION,
	PACK_LABEL_ALLOWED_PATTERN,
} from '@/lib/constants';

export default function InfoPage() {
	const { data, setData, setHasUnsavedChanges } = useData();
	const packInfo = data.packInfo || {};
	const isVersionValid = useVersionValidation(packInfo.version);
	const labelValue = packInfo.label || '';
	const isLabelReserved = KNOWN_DEPENDENCIES.includes(labelValue as any);
	const hasInvalidLabelChars =
		labelValue.length > 0 && !PACK_LABEL_ALLOWED_PATTERN.test(labelValue);
	const isLabelInvalid = isLabelReserved || hasInvalidLabelChars;

	// Update handler
	const updatePackInfo = (updates: Partial<PackInfo>) => {
		setData({ ...data, packInfo: { ...packInfo, ...updates } });
		setHasUnsavedChanges(true);
	};

	// Array field handlers
	const authorsHandlers = {
		onAdd: () =>
			updatePackInfo({ authors: [...(packInfo.authors || []), ''] }),
		onUpdate: (index: number, value: string) => {
			const newAuthors = [...(packInfo.authors || [])];
			newAuthors[index] = value;
			updatePackInfo({ authors: newAuthors });
		},
		onRemove: (index: number) => {
			const newAuthors = [...(packInfo.authors || [])];
			newAuthors.splice(index, 1);
			updatePackInfo({ authors: newAuthors });
		},
	};

	return (
		<div className="flex flex-col">
			<div className="container mx-auto w-full max-w-4xl px-6 py-8">
				<div className="flex flex-col gap-6 rounded-lg bg-white/10 p-6 shadow-md backdrop-blur">
					<div className="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/5">
						<h2 className="text-2xl font-bold">
							资源包基础信息 (Pack Info)
						</h2>
					</div>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						{/* Name */}
						<EditorField label="资源包名称 (Name)">
							<TextInput
								value={packInfo.name || ''}
								onChange={(e) =>
									updatePackInfo({ name: e.target.value })
								}
								placeholder="例如: MetaMystia 示例资源包"
							/>
						</EditorField>

						{/* Label */}
						<EditorField
							label="资源包唯一标识符 (Label)"
							actions={
								isLabelInvalid && (
									<span className="text-[10px] text-danger">
										{isLabelReserved
											? '不能使用保留关键字 (如 CORE, DLC1 等)'
											: PACK_LABEL_ALLOWED_DESCRIPTION}
									</span>
								)
							}
						>
							<TextInput
								value={packInfo.label || ''}
								onChange={(e) =>
									updatePackInfo({ label: e.target.value })
								}
								placeholder="例如: ResourceEx"
								error={isLabelInvalid}
							/>
						</EditorField>
					</div>

					{/* Version */}
					<EditorField
						label="版本 (Version)"
						actions={
							!isVersionValid && (
								<span className="text-[10px] text-danger">
									版本格式不符合语义化版本规范 (例如: 1.0.0)
								</span>
							)
						}
					>
						<TextInput
							value={packInfo.version || ''}
							onChange={(e) =>
								updatePackInfo({ version: e.target.value })
							}
							placeholder="例如: 1.0.0"
							error={!isVersionValid}
						/>
					</EditorField>

					{/* Authors */}
					<EditorField
						label="作者列表 (Authors)"
						actions={
							<SectionAddButton onPress={authorsHandlers.onAdd}>
								添加作者
							</SectionAddButton>
						}
					>
						<ArrayFieldEditor
							items={packInfo.authors || []}
							{...authorsHandlers}
							placeholder="Author Name"
							emptyMessage="暂无作者"
						/>
					</EditorField>

					{/* ID Range Allocation */}
					<IdRangeEditor
						packInfo={packInfo}
						onUpdate={updatePackInfo}
					/>

					{/* Dependencies */}
					<EditorField label="依赖 (Dependencies)">
						<DependencySelector
							value={packInfo.dependencies || []}
							onChange={(deps) =>
								updatePackInfo({ dependencies: deps })
							}
						/>
					</EditorField>

					{/* Description */}
					<EditorField label="描述 (Description)">
						<TextArea
							value={packInfo.description || ''}
							onChange={(e) =>
								updatePackInfo({ description: e.target.value })
							}
							placeholder="资源包的详细描述..."
						/>
					</EditorField>

					{/* License */}
					<EditorField label="许可证 (License)">
						<TextArea
							value={packInfo.license || ''}
							onChange={(e) =>
								updatePackInfo({ license: e.target.value })
							}
							placeholder="在此处粘贴许可证文本..."
							autoResize
						/>
					</EditorField>
				</div>
			</div>
		</div>
	);
}
