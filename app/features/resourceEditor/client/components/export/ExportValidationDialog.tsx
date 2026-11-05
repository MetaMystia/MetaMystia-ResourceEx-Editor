'use client';

import { InfoIcon, WarningIcon } from '@heroui/shared-icons';
import { cn } from '@heroui/theme';
import { memo, useMemo, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import { CoordinatedModal } from '@/features/overlays/client';
import { type IResourcePackValidationIssue } from '@/features/resourceEditor/client/validation/validateResourcePackForExport';

interface IProps {
	issues: IResourcePackValidationIssue[];
	onConfirm: () => void;
	onCancel: () => void;
}

function groupByCategory(items: IResourcePackValidationIssue[]) {
	const groups: Record<string, IResourcePackValidationIssue[]> = {};
	for (const item of items) {
		(groups[item.category] ??= []).push(item);
	}
	return groups;
}

function IssueGroup({
	category,
	items,
	severity,
}: {
	category: string;
	items: IResourcePackValidationIssue[];
	severity: 'error' | 'warning';
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						'h-2 w-2 rounded-full',
						severity === 'error' ? 'bg-danger' : 'bg-warning'
					)}
				/>
				<span className={TYPOGRAPHY_STYLES.subsectionTitle}>
					{category}
				</span>
				<span className={TYPOGRAPHY_STYLES.caption}>
					（{items.length}）
				</span>
			</div>
			<ul className="ml-8 flex list-disc flex-col gap-0.5">
				{items.map((item, index) => (
					<li
						key={`${item.message}-${index}`}
						className={cn(
							TYPOGRAPHY_STYLES.body,
							severity === 'error'
								? 'text-danger'
								: 'text-warning-600 dark:text-warning-400'
						)}
					>
						{item.message}
					</li>
				))}
			</ul>
		</div>
	);
}

export const ExportValidationDialog = memo<IProps>(
	function ExportValidationDialog({ issues, onCancel, onConfirm }) {
		const [filter, setFilter] = useState<'all' | 'error' | 'warning'>(
			'all'
		);
		const errors = useMemo(
			() => issues.filter((issue) => issue.severity === 'error'),
			[issues]
		);
		const warnings = useMemo(
			() => issues.filter((issue) => issue.severity === 'warning'),
			[issues]
		);
		const groupedErrors = useMemo(() => groupByCategory(errors), [errors]);
		const groupedWarnings = useMemo(
			() => groupByCategory(warnings),
			[warnings]
		);

		return (
			<CoordinatedModal
				coordination={{ id: 'navbar.export-validation' }}
				isOpen
				onClose={onCancel}
				size="2xl"
			>
				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-3">
						{errors.length > 0 ? (
							<WarningIcon className="h-6 w-6 shrink-0 text-danger" />
						) : (
							<InfoIcon className="h-6 w-6 shrink-0 text-warning" />
						)}
						<div className="space-y-1">
							<Heading as="h2" variant="dialog">
								资源包导出检查
							</Heading>
							<p className={TYPOGRAPHY_STYLES.description}>
								{errors.length > 0
									? '存在以下问题，建议修正后再导出'
									: '存在部分建议项，可确认后继续导出'}
							</p>
						</div>
					</div>
					<div className="flex gap-3">
						{errors.length > 0 && (
							<Button
								size="sm"
								color={
									filter === 'error' ? 'danger' : 'default'
								}
								variant={filter === 'error' ? 'solid' : 'flat'}
								onPress={() =>
									setFilter((current) =>
										current === 'error' ? 'all' : 'error'
									)
								}
							>
								{errors.length}个错误
							</Button>
						)}
						{warnings.length > 0 && (
							<Button
								size="sm"
								color={
									filter === 'warning' ? 'warning' : 'default'
								}
								variant={
									filter === 'warning' ? 'solid' : 'flat'
								}
								onPress={() =>
									setFilter((current) =>
										current === 'warning'
											? 'all'
											: 'warning'
									)
								}
							>
								{warnings.length}个警告
							</Button>
						)}
					</div>
					<div className="flex flex-col gap-4">
						{filter !== 'warning' &&
							Object.entries(groupedErrors).map(
								([category, items]) => (
									<IssueGroup
										key={`error-${category}`}
										category={category}
										items={items}
										severity="error"
									/>
								)
							)}
						{filter !== 'error' &&
							Object.entries(groupedWarnings).map(
								([category, items]) => (
									<IssueGroup
										key={`warning-${category}`}
										category={category}
										items={items}
										severity="warning"
									/>
								)
							)}
					</div>
					<div className="flex justify-end gap-3 border-t border-divider pt-4">
						<Button variant="light" onPress={onCancel}>
							返回修改
						</Button>
						<Button
							color={errors.length > 0 ? 'danger' : 'primary'}
							onPress={onConfirm}
						>
							{errors.length > 0
								? '忽略问题，仍然导出'
								: '确认导出'}
						</Button>
					</div>
				</div>
			</CoordinatedModal>
		);
	}
);
