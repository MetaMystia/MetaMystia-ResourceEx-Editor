'use client';

import { cn } from '@heroui/theme';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';

import { CoordinatedModal } from '@/features/overlays/client';
import type { TOverlayId } from '@/features/overlays/contracts';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';
import type { IWorkspaceSummary } from '@/features/resourceEditor/client/workspaces/contracts';

interface IProps {
	candidates: readonly IWorkspaceSummary[];
	children: ReactNode;
	description: string;
	disabledReason?: string | null;
	isBusy?: boolean;
	isDisabled?: boolean;
	isSelected: boolean;
	overlayId: TOverlayId;
	selectLabel: string;
	secondaryAction?: ReactNode;
	title: string;
	onSelectArchive(file: File): Promise<void>;
	onSelectWorkspace(workspaceId: string): Promise<void>;
}

export function ComparisonSourceSelector({
	candidates,
	children,
	description,
	disabledReason,
	isBusy = false,
	isDisabled = false,
	isSelected,
	overlayId,
	selectLabel,
	secondaryAction,
	title,
	onSelectArchive,
	onSelectWorkspace,
}: IProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState('');
	const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
	const visibleCandidates = useMemo(
		() =>
			candidates.filter((workspace) => {
				if (!normalizedSearch) return true;
				return [
					workspace.displayName,
					workspace.label,
					workspace.resourcePackName,
					workspace.version,
				]
					.filter((value): value is string => value !== undefined)
					.some((value) =>
						value
							.toLocaleLowerCase('zh-CN')
							.includes(normalizedSearch)
					);
			}),
		[candidates, normalizedSearch]
	);

	useEffect(() => {
		if (disabledReason || isDisabled) setIsOpen(false);
	}, [disabledReason, isDisabled]);

	const selectWorkspace = (workspaceId: string) => {
		setIsOpen(false);
		void onSelectWorkspace(workspaceId);
	};

	return (
		<>
			<EditorPanel className="flex min-w-0 flex-col">
				<div className="flex-1">{children}</div>
				<div className="mt-5 space-y-2">
					{secondaryAction}
					{disabledReason && (
						<p
							role="status"
							className={cn(
								TYPOGRAPHY_STYLES.compactDescription,
								'text-warning-700 dark:text-warning'
							)}
						>
							{disabledReason}
						</p>
					)}
					<Button
						fullWidth
						color={isSelected ? 'default' : 'primary'}
						variant={isSelected ? 'flat' : 'solid'}
						isDisabled={
							Boolean(disabledReason) || isBusy || isDisabled
						}
						isLoading={isBusy}
						onPress={() => setIsOpen(true)}
					>
						{isSelected
							? `更换${selectLabel}`
							: `选择${selectLabel}`}
					</Button>
				</div>
			</EditorPanel>

			<CoordinatedModal
				coordination={{ id: overlayId }}
				isOpen={isOpen}
				size="2xl"
				onOpenChange={setIsOpen}
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<Heading as="h2" variant="dialog">
							{title}
						</Heading>
						<p className={TYPOGRAPHY_STYLES.description}>
							{description}
						</p>
					</div>
					<Input
						aria-label="搜索工作区"
						placeholder="按名称、Label或版本搜索"
						value={search}
						onValueChange={setSearch}
					/>
					<div className="max-h-[45dvh] space-y-2 overflow-y-auto pr-1">
						{visibleCandidates.length > 0 ? (
							visibleCandidates.map((workspace) => (
								<Button
									key={workspace.id}
									fullWidth
									variant="bordered"
									className="h-auto min-h-16 justify-start px-4 py-3 text-left"
									onPress={() =>
										selectWorkspace(workspace.id)
									}
								>
									<span className="flex min-w-0 flex-col items-start gap-0.5">
										<span
											title={workspace.displayName}
											className={cn(
												TYPOGRAPHY_STYLES.itemTitle,
												'max-w-full truncate'
											)}
										>
											{workspace.displayName}
										</span>
										<span
											className={
												TYPOGRAPHY_STYLES.caption
											}
										>
											Label：
											{workspace.label?.trim() ||
												'未设置'}
											{workspace.version
												? ` · 版本${workspace.version}`
												: ''}
										</span>
									</span>
								</Button>
							))
						) : (
							<p className={TYPOGRAPHY_STYLES.subtleDescription}>
								没有符合条件的工作区。
							</p>
						)}
					</div>
					<div className="flex flex-col-reverse gap-2 border-t border-divider pt-4 sm:flex-row sm:justify-between">
						<Button
							variant="light"
							onPress={() => setIsOpen(false)}
						>
							取消
						</Button>
						<Button
							variant="flat"
							onPress={() => fileInputRef.current?.click()}
						>
							上传资源包
						</Button>
					</div>
				</div>
			</CoordinatedModal>

			<input
				ref={fileInputRef}
				type="file"
				accept=".zip,application/zip"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = '';
					if (!file) return;
					setIsOpen(false);
					void onSelectArchive(file);
				}}
			/>
		</>
	);
}
