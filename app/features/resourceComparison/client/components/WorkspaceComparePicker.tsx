'use client';

import { cn } from '@heroui/theme';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';
import Popover, {
	PopoverContent,
	PopoverTrigger,
} from '@/design/ui/components/popover';
import Tooltip from '@/design/ui/components/tooltip';

import { CoordinatedModal } from '@/features/overlays/client';
import { publishComparisonStartupIntent } from '@/features/resourceComparison/client/comparisonStartupIntent';
import {
	createArchiveComparisonSnapshot,
	createWorkspaceComparisonSnapshot,
	getComparisonSnapshotLabel,
} from '@/features/resourceComparison/client/useComparisonSession';
import { readResourcePackArchive } from '@/features/resourceEditor/client/archive/readResourcePackArchive';
import type { IWorkspaceSummary } from '@/features/resourceEditor/client/workspaces/contracts';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

interface IProps {
	isDisabled: boolean;
	rightWorkspace: IWorkspaceSummary;
}

function getWorkspaceLabel(workspace: IWorkspaceSummary) {
	return workspace.label?.trim() ?? '';
}

export function matchesQuickComparisonSearch(
	workspace: IWorkspaceSummary,
	search: string
) {
	const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
	if (!normalizedSearch) return true;
	return [
		workspace.displayName,
		workspace.label,
		workspace.resourcePackName,
		workspace.version,
	]
		.filter((value): value is string => value !== undefined)
		.some((value) =>
			value.toLocaleLowerCase('zh-CN').includes(normalizedSearch)
		);
}

export function filterQuickComparisonCandidates(
	workspaces: readonly IWorkspaceSummary[],
	rightWorkspace: IWorkspaceSummary
) {
	const rightLabel = getWorkspaceLabel(rightWorkspace);
	if (!rightLabel) return [];
	return workspaces.filter(
		(workspace) =>
			workspace.id !== rightWorkspace.id &&
			getWorkspaceLabel(workspace) === rightLabel
	);
}

export function WorkspaceComparePicker({ isDisabled, rightWorkspace }: IProps) {
	const router = useRouter();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const requestGenerationRef = useRef(0);
	const { readWorkspaceSnapshot, workspaces } = useResourceWorkspaces();
	const [error, setError] = useState<string | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [pendingSource, setPendingSource] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const rightLabel = getWorkspaceLabel(rightWorkspace);
	const candidates = useMemo(
		() =>
			filterQuickComparisonCandidates(workspaces, rightWorkspace).filter(
				(workspace) => matchesQuickComparisonSearch(workspace, search)
			),
		[rightWorkspace, search, workspaces]
	);
	const isBusy = pendingSource !== null;
	const disabledReason = !rightLabel ? '请先填写资源包标识符（Label）' : null;
	useLayoutEffect(() => {
		requestGenerationRef.current += 1;
		setPendingSource(null);
		return () => {
			requestGenerationRef.current += 1;
		};
	}, [rightLabel, rightWorkspace.currentRevision, rightWorkspace.id]);

	const closePicker = () => {
		setIsModalOpen(false);
		setIsPopoverOpen(false);
	};
	const cancelPicker = () => {
		requestGenerationRef.current += 1;
		setPendingSource(null);
		closePicker();
	};

	const validateLeftLabel = (leftLabel: string) => {
		if (!leftLabel) return '旧版的资源包标识符（Label）为空';
		if (leftLabel !== rightLabel) {
			return `两侧资源包标识符（Label）不一致：${leftLabel}≠${rightLabel}`;
		}
		return null;
	};

	const startComparison = (
		left: Parameters<typeof publishComparisonStartupIntent>[0]['left']
	) => {
		publishComparisonStartupIntent({ left, rightWorkspace });
		closePicker();
		router.push('/compare');
	};

	const handleSelectWorkspace = async (workspaceId: string) => {
		if (isBusy) return;
		const requestGeneration = requestGenerationRef.current + 1;
		requestGenerationRef.current = requestGeneration;
		setError(null);
		setPendingSource(workspaceId);
		try {
			const loaded = await readWorkspaceSnapshot(workspaceId, 'current');
			if (requestGenerationRef.current !== requestGeneration) return;
			const snapshot = createWorkspaceComparisonSnapshot(loaded);
			const validationError = validateLeftLabel(
				getComparisonSnapshotLabel(snapshot)
			);
			if (validationError) {
				setError(validationError);
				return;
			}
			if (loaded.workspace.id === rightWorkspace.id) {
				setError('不能对比同一工作区');
				return;
			}
			startComparison({ snapshot, workspace: loaded.workspace });
		} catch (selectionError) {
			if (requestGenerationRef.current !== requestGeneration) return;
			setError(
				selectionError instanceof Error
					? selectionError.message
					: String(selectionError)
			);
		} finally {
			if (requestGenerationRef.current === requestGeneration) {
				setPendingSource(null);
			}
		}
	};

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file || isBusy) return;
		const requestGeneration = requestGenerationRef.current + 1;
		requestGenerationRef.current = requestGeneration;
		setError(null);
		setPendingSource('archive');
		try {
			const archive = await readResourcePackArchive(file);
			if (requestGenerationRef.current !== requestGeneration) return;
			const snapshot = createArchiveComparisonSnapshot(
				archive,
				file.name,
				crypto.randomUUID()
			);
			const validationError = validateLeftLabel(
				getComparisonSnapshotLabel(snapshot)
			);
			if (validationError) {
				setError(validationError);
				return;
			}
			startComparison({ snapshot });
		} catch (selectionError) {
			if (requestGenerationRef.current !== requestGeneration) return;
			setError(
				selectionError instanceof Error
					? selectionError.message
					: String(selectionError)
			);
		} finally {
			if (requestGenerationRef.current === requestGeneration) {
				setPendingSource(null);
			}
		}
	};

	const pickerContent = (
		<div className="space-y-4">
			<div className="space-y-2">
				<Heading as="h2" variant="dialog">
					选择旧版
				</Heading>
				<p className={TYPOGRAPHY_STYLES.description}>
					{`“${rightWorkspace.displayName}”已设为新版。请选择Label相同的旧版工作区，或上传旧版资源包。`}
				</p>
			</div>
			<Input
				aria-label="搜索旧版工作区"
				placeholder="按名称、Label或版本搜索"
				value={search}
				onValueChange={setSearch}
			/>
			<div className="max-h-[45dvh] space-y-2 overflow-y-auto pr-1">
				{candidates.length > 0 ? (
					candidates.map((workspace) => (
						<Button
							key={workspace.id}
							fullWidth
							variant="bordered"
							className="h-auto min-h-16 justify-start px-4 py-3 text-left"
							isDisabled={isBusy}
							isLoading={pendingSource === workspace.id}
							onPress={() =>
								void handleSelectWorkspace(workspace.id)
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
								<span className={TYPOGRAPHY_STYLES.caption}>
									Label：{getWorkspaceLabel(workspace)}
									{workspace.version
										? ` · 版本${workspace.version}`
										: ''}
								</span>
							</span>
						</Button>
					))
				) : (
					<p className={TYPOGRAPHY_STYLES.subtleDescription}>
						没有符合条件的旧版工作区，可改为上传资源包。
					</p>
				)}
			</div>
			{error && (
				<p
					role="alert"
					className={cn(TYPOGRAPHY_STYLES.body, 'text-danger')}
				>
					{error}
				</p>
			)}
			<div className="flex flex-col-reverse gap-2 border-t border-divider pt-4 sm:flex-row sm:justify-between">
				<Button
					variant="light"
					isDisabled={isBusy}
					onPress={cancelPicker}
				>
					取消
				</Button>
				<Button
					variant="flat"
					isDisabled={isBusy}
					isLoading={pendingSource === 'archive'}
					onPress={() => fileInputRef.current?.click()}
				>
					上传资源包
				</Button>
			</div>
		</div>
	);

	if (disabledReason) {
		return (
			<div className="col-span-2 sm:col-span-1">
				<Tooltip content={disabledReason}>
					<span
						tabIndex={0}
						aria-label={disabledReason}
						className="block"
					>
						<Button fullWidth variant="flat" isDisabled>
							对比
						</Button>
					</span>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="col-span-2 sm:col-span-1">
			<Popover
				isOpen={isPopoverOpen}
				placement="bottom-end"
				onOpenChange={(isOpen) => {
					setError(null);
					if (!isOpen) {
						requestGenerationRef.current += 1;
						setPendingSource(null);
					}
					setIsPopoverOpen(isOpen);
				}}
			>
				<PopoverTrigger>
					<Button
						fullWidth
						variant="flat"
						className="hidden sm:flex"
						isDisabled={isDisabled}
					>
						对比
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 max-w-[calc(100vw-1rem)] p-3">
					{pickerContent}
				</PopoverContent>
			</Popover>
			<Button
				fullWidth
				variant="flat"
				className="sm:hidden"
				isDisabled={isDisabled}
				onPress={() => {
					setError(null);
					setIsModalOpen(true);
				}}
			>
				对比
			</Button>

			<CoordinatedModal
				coordination={{ id: 'comparison.quick-source' }}
				isOpen={isModalOpen}
				size="2xl"
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						requestGenerationRef.current += 1;
						setPendingSource(null);
					}
					setIsModalOpen(isOpen);
				}}
			>
				{pickerContent}
			</CoordinatedModal>

			<input
				ref={fileInputRef}
				type="file"
				accept=".zip,application/zip"
				className="hidden"
				onChange={(event) => void handleFileChange(event)}
			/>
		</div>
	);
}
