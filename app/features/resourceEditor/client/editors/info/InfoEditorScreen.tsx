'use client';

import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import {
	KNOWN_DEPENDENCIES,
	PACK_LABEL_ALLOWED_DESCRIPTION,
	PACK_LABEL_ALLOWED_PATTERN,
} from '@/domain/resourcePack/constants';
import type { PackInfo } from '@/domain/resourcePack/contracts/resourceEx';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { ArrayFieldEditor } from '@/features/resourceEditor/client/components/fields/ArrayFieldEditor';
import { EditorField } from '@/features/resourceEditor/client/components/fields/EditorField';
import { EditorHeader } from '@/features/resourceEditor/client/components/layout/EditorHeader';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import { EditorWorkspace } from '@/features/resourceEditor/client/components/layout/EditorWorkspace';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { useEditorPageNavigationIntent } from '@/features/resourceEditor/client/navigation/editorNavigationIntent';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { DependencySelector } from './DependencySelector';
import { IdRangeEditor } from './IdRangeEditor';
import { useVersionValidation } from './useVersionValidation';

const INFO_EDITOR_ENTITY_KINDS = ['pack-info', 'license'] as const;

export function InfoEditorScreen() {
	const {
		license,
		replaceLicense,
		resourcePack: data,
		updateResourcePack,
	} = useResourceEditor();
	useEditorPageNavigationIntent({ entityKinds: INFO_EDITOR_ENTITY_KINDS });
	const packInfo = data.packInfo || {};
	const isVersionValid = useVersionValidation(packInfo.version);
	const labelValue = packInfo.label || '';
	const isLabelReserved = KNOWN_DEPENDENCIES.includes(labelValue as any);
	const hasInvalidLabelChars =
		labelValue.length > 0 && !PACK_LABEL_ALLOWED_PATTERN.test(labelValue);
	const isLabelInvalid = isLabelReserved || hasInvalidLabelChars;

	// Update handler
	const updatePackInfo = (updates: Partial<PackInfo>) => {
		updateResourcePack(() => ({
			...data,
			packInfo: { ...packInfo, ...updates },
		}));
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
		<EditorWorkspace columns={1} contentClassName="flex flex-col">
			<EditorHeader title="资源包基础信息（Pack Info）" />
			<EditorPanel className="flex flex-col gap-6">
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
					{/* Name */}
					<EditorField label="资源包名称（Name）">
						<Input
							value={packInfo.name || ''}
							onChange={(e) =>
								updatePackInfo({ name: e.target.value })
							}
							placeholder="例如：MetaMystia示例资源包"
						/>
					</EditorField>

					{/* Label */}
					<EditorField
						label="资源包唯一标识符（Label）"
						actions={
							isLabelInvalid && (
								<ErrorBadge>
									{isLabelReserved
										? '不能使用保留关键字（如CORE、DLC1等）'
										: PACK_LABEL_ALLOWED_DESCRIPTION}
								</ErrorBadge>
							)
						}
					>
						<Input
							value={packInfo.label || ''}
							onChange={(e) =>
								updatePackInfo({ label: e.target.value })
							}
							placeholder="例如：ResourceEx"
							isInvalid={isLabelInvalid}
						/>
					</EditorField>
				</div>

				{/* Version */}
				<EditorField
					label="版本（Version）"
					actions={
						!isVersionValid && (
							<ErrorBadge>
								版本格式不符合语义化版本规范（例如：1.0.0）
							</ErrorBadge>
						)
					}
				>
					<Input
						value={packInfo.version || ''}
						onChange={(e) =>
							updatePackInfo({ version: e.target.value })
						}
						placeholder="例如：1.0.0"
						isInvalid={!isVersionValid}
					/>
				</EditorField>

				{/* Authors */}
				<EditorField
					label="作者列表（Authors）"
					actions={
						<SectionAddButton
							className="w-24"
							onPress={authorsHandlers.onAdd}
						>
							添加作者
						</SectionAddButton>
					}
				>
					<ArrayFieldEditor
						items={packInfo.authors || []}
						{...authorsHandlers}
						placeholder="作者名称"
						emptyMessage="暂无作者"
					/>
				</EditorField>

				{/* ID Range Allocation */}
				<IdRangeEditor packInfo={packInfo} onUpdate={updatePackInfo} />

				{/* Dependencies */}
				<EditorField label="依赖（Dependencies）">
					<DependencySelector
						value={packInfo.dependencies || []}
						onChange={(deps) =>
							updatePackInfo({ dependencies: deps })
						}
					/>
				</EditorField>

				{/* Description */}
				<EditorField label="描述（Description）">
					<Textarea
						minRows={5}
						value={packInfo.description || ''}
						onChange={(e) =>
							updatePackInfo({ description: e.target.value })
						}
						placeholder="资源包的详细描述…"
					/>
				</EditorField>

				{/* License */}
				<EditorField label="许可证（License）">
					<Textarea
						minRows={5}
						value={license}
						onChange={(e) => replaceLicense(e.target.value)}
						placeholder="在此处粘贴许可证文本，将单独保存为LICENSE.md…"
					/>
				</EditorField>
			</EditorPanel>
		</EditorWorkspace>
	);
}
