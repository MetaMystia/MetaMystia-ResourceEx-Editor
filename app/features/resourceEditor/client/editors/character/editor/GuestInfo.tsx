import { cn } from '@heroui/theme';
import { useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';

import { IZAKAYAS, IZAKAYA_GROUPS } from '@/domain/data/izakayas';
import {
	BEVERAGE_TAG_MAP,
	BEVERAGE_TAGS,
	FOOD_TAG_MAP,
	FOOD_TAGS,
} from '@/domain/data/tags';
import type {
	GuestInfo,
	LikeTag,
	Request,
	SpawnConfig,
} from '@/domain/resourcePack/contracts/character';

import { SectionAddButton } from '@/features/resourceEditor/client/components/actions/SectionAddButton';
import { SectionDeleteButton } from '@/features/resourceEditor/client/components/actions/SectionDeleteButton';
import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';
import { InfoTip } from '@/features/resourceEditor/client/components/fields/InfoTip';
import { Label } from '@/features/resourceEditor/client/components/fields/Label';
import { ChevronRight } from '@/features/resourceEditor/client/components/icons/ChevronRight';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import {
	TagBadge,
	TagButton,
} from '@/features/resourceEditor/client/components/tags/TagButton';
import { useFocusOnItemAppend } from '@/features/resourceEditor/client/hooks/useFocusOnItemAppend';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

interface GuestInfoProps {
	characterId: number;
	guest: GuestInfo | undefined;
	onUpdate: (updates: Partial<GuestInfo>) => void;
	onEnable: () => void;
	onDisable: () => void;
}

export function GuestInfoEditor({
	characterId,
	guest,
	onUpdate,
	onEnable,
	onDisable,
}: GuestInfoProps) {
	const {
		getGuestLikeTagDraft,
		getGuestSpawnDraft,
		replaceGuestLikeTagDraft,
		replaceGuestSpawnDraft,
	} = useResourceEditor();
	const [isExpanded, setIsExpanded] = useState(false);
	const conversationListRef = useFocusOnItemAppend(
		guest?.conversation?.length ?? 0
	);
	const [isDisableConfirmationOpen, setIsDisableConfirmationOpen] =
		useState(false);
	const isFundRangeInvalid = Boolean(
		guest &&
		(!Number.isInteger(guest.fundRangeLower) ||
			guest.fundRangeLower < 0 ||
			!Number.isInteger(guest.fundRangeUpper) ||
			guest.fundRangeUpper < guest.fundRangeLower)
	);

	const toggleLikeTag = (
		field: 'likeFoodTag' | 'likeBevTag',
		tagId: number
	) => {
		if (!guest) return;

		const currentTags = guest[field] || [];
		const exists = currentTags.find((t) => t.tagId === tagId);

		let newTags;
		let newFoodRequests = [...(guest.foodRequests || [])];
		let newBevRequests = [...(guest.bevRequests || [])];

		if (exists) {
			replaceGuestLikeTagDraft(characterId, field, tagId, exists);
			newTags = currentTags.filter((t) => t.tagId !== tagId);
		} else {
			const draft = getGuestLikeTagDraft(characterId, field, tagId);
			newTags = [...currentTags, draft ?? { tagId, weight: 1 }];
			replaceGuestLikeTagDraft(characterId, field, tagId, undefined);
			const newRequest = {
				tagId,
				request: '',
				enable: field === 'likeFoodTag',
			};
			if (field === 'likeFoodTag') {
				newFoodRequests = newFoodRequests.some(
					(request) => request.tagId === tagId
				)
					? newFoodRequests.map((request) =>
							request.tagId === tagId
								? { ...request, enable: true }
								: request
						)
					: [...newFoodRequests, newRequest];
			} else {
				newBevRequests = newBevRequests.some(
					(request) => request.tagId === tagId
				)
					? newBevRequests.map((request) =>
							request.tagId === tagId
								? { ...request, enable: false }
								: request
						)
					: [...newBevRequests, newRequest];
			}
		}

		newTags.sort((a, b) => a.tagId - b.tagId);
		newFoodRequests.sort((a, b) => a.tagId - b.tagId);
		newBevRequests.sort((a, b) => a.tagId - b.tagId);

		onUpdate({
			[field]: newTags,
			foodRequests: newFoodRequests,
			bevRequests: newBevRequests,
		});
	};

	const updateLikeTagWeight = (
		field: 'likeFoodTag' | 'likeBevTag',
		tagId: number,
		weight: number
	) => {
		if (!guest) return;
		const nextTags = guest[field].map(
			(tag): LikeTag => (tag.tagId === tagId ? { ...tag, weight } : tag)
		);
		onUpdate({ [field]: nextTags });
	};

	const toggleHateTag = (tagId: number) => {
		if (!guest) return;

		const currentTags = guest.hateFoodTag || [];
		const exists = currentTags.includes(tagId);

		let newTags;
		if (exists) {
			newTags = currentTags.filter((id) => id !== tagId);
		} else {
			newTags = [...currentTags, tagId];
		}

		newTags.sort((a, b) => a - b);

		onUpdate({ hateFoodTag: newTags });
	};

	const updateFoodRequest = (tagId: number, updates: Partial<Request>) => {
		if (!guest) return;
		const newRequests = [...(guest.foodRequests || [])];
		const index = newRequests.findIndex((r) => r.tagId === tagId);
		if (index !== -1) {
			newRequests[index] = {
				...newRequests[index],
				...updates,
			} as Request;
			onUpdate({ foodRequests: newRequests });
		}
	};

	const toggleRequest = (
		field: 'foodRequests' | 'bevRequests',
		tagId: number,
		enabled: boolean
	) => {
		if (!guest) return;
		const currentRequests = [...(guest[field] || [])];
		const index = currentRequests.findIndex((r) => r.tagId === tagId);

		if (index === -1) {
			currentRequests.push({ tagId, request: '', enable: enabled });
		} else {
			currentRequests[index] = {
				...currentRequests[index],
				enable: enabled,
			} as Request;
		}

		currentRequests.sort((a, b) => a.tagId - b.tagId);

		onUpdate({ [field]: currentRequests });
	};

	const updateBevRequest = (tagId: number, updates: Partial<Request>) => {
		if (!guest) return;
		const newRequests = [...(guest.bevRequests || [])];
		const index = newRequests.findIndex((r) => r.tagId === tagId);

		if (index !== -1) {
			newRequests[index] = {
				...newRequests[index],
				...updates,
			} as Request;
			onUpdate({ bevRequests: newRequests });
		}
	};

	const updateEvaluation = (evalIndex: number, value: string) => {
		const currentEval = guest?.evaluation || Array(9).fill('');
		const newEval = [...currentEval];
		newEval[evalIndex] = value;
		onUpdate({ evaluation: newEval });
	};

	const addConversation = () => {
		if (!guest) return;
		const newConv = [...(guest.conversation || []), ''];
		onUpdate({ conversation: newConv });
	};

	const updateConversation = (convIndex: number, value: string) => {
		if (!guest || !guest.conversation) return;
		const newConv = [...guest.conversation];
		newConv[convIndex] = value;
		onUpdate({ conversation: newConv });
	};

	const removeConversation = (convIndex: number) => {
		if (!guest || !guest.conversation) return;
		const newConv = [...guest.conversation];
		newConv.splice(convIndex, 1);
		onUpdate({ conversation: newConv });
	};

	const toggleSpawn = (izakayaId: number) => {
		if (!guest) return;

		const currentSpawns = guest.spawn || [];
		const exists = currentSpawns.find((s) => s.izakayaId === izakayaId);

		let newSpawns;
		if (exists) {
			replaceGuestSpawnDraft(characterId, izakayaId, exists);
			newSpawns = currentSpawns.filter((s) => s.izakayaId !== izakayaId);
		} else {
			const draft = getGuestSpawnDraft(characterId, izakayaId);
			newSpawns = [
				...currentSpawns,
				draft ?? {
					izakayaId,
					relativeProb: 0,
					onlySpawnAfterUnlocking: false,
					onlySpawnWhenPlaceBeRecorded: false,
				},
			];
			replaceGuestSpawnDraft(characterId, izakayaId, undefined);
		}

		newSpawns.sort((a, b) => a.izakayaId - b.izakayaId);

		onUpdate({ spawn: newSpawns });
	};

	const updateSpawn = (izakayaId: number, updates: Partial<SpawnConfig>) => {
		if (!guest?.spawn) return;

		const newSpawns = guest.spawn.map((s) =>
			s.izakayaId === izakayaId ? { ...s, ...updates } : s
		);

		onUpdate({ spawn: newSpawns });
	};

	return (
		<EditorSection
			title={
				<div className="flex min-w-0 items-center gap-1">
					<Button
						variant="light"
						size="sm"
						aria-expanded={isExpanded}
						className={cn(
							TYPOGRAPHY_STYLES.sectionTitle,
							'-ml-2 h-10 px-2 sm:h-8'
						)}
						startContent={
							<ChevronRight
								className={cn(
									'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
									isExpanded && 'rotate-90'
								)}
							/>
						}
						onPress={() => setIsExpanded((value) => !value)}
					>
						顾客配置（Guest Info）
					</Button>
					<InfoTip>
						为角色配置夜间顾客相关信息，包括喜好标签、闲聊文本等
					</InfoTip>
				</div>
			}
			actions={
				<div className="flex items-center gap-2">
					<span
						className={cn(
							TYPOGRAPHY_STYLES.compactLabel,
							'whitespace-nowrap'
						)}
					>
						{guest ? '已启用顾客配置' : '启用顾客配置'}
					</span>
					{guest ? (
						<ConfirmPopover
							title="确定要关闭顾客配置吗？"
							description="关闭后将丢失已填写的所有顾客数据（喜好、闲聊、评价等），且不可恢复。"
							confirmLabel="确认关闭"
							isOpen={isDisableConfirmationOpen}
							onConfirm={onDisable}
							onOpenChange={setIsDisableConfirmationOpen}
							trigger={
								<Switch
									aria-label="关闭顾客配置"
									isSelected
									onValueChange={(isSelected) => {
										if (!isSelected) {
											setIsDisableConfirmationOpen(true);
										}
									}}
									size="sm"
								/>
							}
						/>
					) : (
						<Switch
							aria-label="启用顾客配置"
							size="sm"
							isSelected={false}
							onValueChange={(isSelected) => {
								if (!isSelected) return;
								setIsExpanded(true);
								onEnable();
							}}
						/>
					)}
				</div>
			}
		>
			{isExpanded && guest && (
				<div className="flex min-w-0 flex-col gap-6">
					{guest.likeFoodTag.some((lt) =>
						guest?.hateFoodTag.includes(lt.tagId)
					) && (
						<div
							className={cn(
								TYPOGRAPHY_STYLES.body,
								'rounded-medium border border-danger/40 bg-danger/10 p-3 text-danger-700 dark:text-danger'
							)}
							role="alert"
						>
							<span className="font-semibold">标签冲突：</span>
							某些料理标签同时存在于“喜爱”和“厌恶”列表中。
						</div>
					)}
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label>携带金钱下限（Lower）</Label>
							<Input
								type="number"
								min={0}
								value={String(guest.fundRangeLower)}
								isInvalid={isFundRangeInvalid}
								onChange={(e) =>
									onUpdate({
										fundRangeLower:
											parseInt(e.target.value) || 0,
									})
								}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>携带金钱上限（Upper）</Label>
							<Input
								type="number"
								min={0}
								value={String(guest.fundRangeUpper)}
								isInvalid={isFundRangeInvalid}
								onChange={(e) =>
									onUpdate({
										fundRangeUpper:
											parseInt(e.target.value) || 0,
									})
								}
							/>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<Label>评价文本（Evaluations）</Label>
						<div className="grid grid-cols-1 gap-3">
							{[
								'黑评',
								'紫评',
								'绿评',
								'橙评',
								'粉评',
								'大额爆预算',
								'小额爆预算',
								'被驱赶',
								'评价驱赶',
							].map((label, i) => {
								const tips = [
									'',
									'',
									'',
									'',
									'',
									'',
									'',
									'',
									'稀客在排队时若小碎骨驱赶其他顾客会掉耐心值，耐心归零时的评价文本',
								];
								return (
									<div
										key={i}
										className="flex flex-col gap-1"
									>
										<Label
											size="sm"
											{...(tips[i]
												? { tip: tips[i] }
												: {})}
										>
											{label}
										</Label>
										<Input
											type="text"
											value={guest?.evaluation[i] || ''}
											onChange={(e) =>
												updateEvaluation(
													i,
													e.target.value
												)
											}
											placeholder={`请输入${label}文本...`}
										/>
									</div>
								);
							})}
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<div className="ml-1 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
							<Label tip="稀客在等餐时的闲聊文本，可以自由添加多条，也可以重复以控制各文本出现概率">
								闲聊文本（Conversations）
							</Label>
							<SectionAddButton onPress={addConversation}>
								添加闲聊
							</SectionAddButton>
						</div>
						<div
							ref={conversationListRef}
							className="flex flex-col gap-2"
						>
							{guest?.conversation?.map((conv, i) => (
								<div
									key={i}
									data-editor-appended-item
									className="flex min-w-0 items-center gap-2"
								>
									<Input
										type="text"
										value={conv}
										onChange={(e) =>
											updateConversation(
												i,
												e.target.value
											)
										}
										placeholder="请输入闲聊文本…"
										className="min-w-0 flex-1"
									/>
									<SectionDeleteButton
										iconOnly
										className="h-10 w-10 shrink-0 sm:h-10 sm:w-10"
										confirmTitle="确定要删除这条闲聊文本吗？"
										onPress={() => removeConversation(i)}
									>
										删除闲聊文本
									</SectionDeleteButton>
								</div>
							))}
							{(guest?.conversation?.length || 0) === 0 && (
								<EmptyState
									variant="text"
									title="暂无闲聊文本"
								/>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-3">
							<div className="ml-1 flex items-center justify-between">
								<Label tip="稀客喜爱的料理tag，在下方选择具体标签，并稍后编写点单请求文本。建议选择4～8个">
									喜爱料理标签（Like Food Tags）
								</Label>
							</div>
							<div className="flex flex-wrap gap-2 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4">
								{FOOD_TAGS.map((tag) => {
									const isSelected = guest?.likeFoodTag.some(
										(t) => t.tagId === tag.id
									);
									const isConflict =
										isSelected &&
										guest?.hateFoodTag.includes(tag.id);
									return (
										<TagButton
											key={tag.id}
											tag={tag}
											isSelected={isSelected}
											isInvalid={isConflict}
											tone="positive"
											onClick={() =>
												toggleLikeTag(
													'likeFoodTag',
													tag.id
												)
											}
											{...(isConflict
												? {
														title: '冲突：该标签同时存在于喜爱和厌恶列表中',
													}
												: {})}
										/>
									);
								})}
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<Label tip="稀客厌恶的料理标签，请谨慎选择，避免与喜爱标签冲突。">
								厌恶料理标签（Hate Food Tags）
							</Label>
							<div className="flex flex-wrap gap-2 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4">
								{FOOD_TAGS.map((tag) => {
									const isSelected =
										guest?.hateFoodTag.includes(tag.id);
									const isConflict =
										isSelected &&
										guest?.likeFoodTag.some(
											(t) => t.tagId === tag.id
										);
									return (
										<TagButton
											key={tag.id}
											tag={tag}
											isSelected={isSelected}
											isInvalid={isConflict}
											tone="negative"
											onClick={() =>
												toggleHateTag(tag.id)
											}
											{...(isConflict
												? {
														title: '冲突：该标签同时存在于喜爱和厌恶列表中',
													}
												: {})}
										/>
									);
								})}
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<Label tip="稀客喜爱的酒水标签，在下方选择具体标签，并稍后编写酒水点单请求文本">
								喜爱酒水标签（Like Beverage Tags）
							</Label>
							<div className="flex flex-wrap gap-2 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4">
								{BEVERAGE_TAGS.map((tag) => {
									const isSelected = guest?.likeBevTag.some(
										(t) => t.tagId === tag.id
									);
									return (
										<TagButton
											key={tag.id}
											tag={tag}
											isSelected={isSelected}
											tone="beverage"
											onClick={() =>
												toggleLikeTag(
													'likeBevTag',
													tag.id
												)
											}
										/>
									);
								})}
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<div className="ml-1 flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
							<Label
								wrapperClassName="min-w-0"
								tip="根据上方喜爱料理自动同步。选择标签后默认开启自定义请求文案；关闭开关后将使用游戏默认请求文案。"
							>
								料理点单请求（Food Requests）
							</Label>
							<span className={TYPOGRAPHY_STYLES.caption}>
								根据上方喜爱料理自动同步
							</span>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{[...(guest?.likeFoodTag || [])]
								.sort((a, b) => a.tagId - b.tagId)
								.map((tag) => {
									const req = guest?.foodRequests?.find(
										(r) => r.tagId === tag.tagId
									);
									const isEnabled = req?.enable ?? true;
									return (
										<div
											key={tag.tagId}
											className={cn(
												'flex min-w-0 flex-col gap-3 rounded-medium border p-3 sm:flex-row sm:items-center',
												isEnabled
													? 'border-divider bg-content1/50'
													: 'border-divider bg-content2/30'
											)}
										>
											<div className="flex shrink-0 items-center gap-3 sm:w-40">
												<Switch
													size="sm"
													aria-label={`使用${FOOD_TAG_MAP[tag.tagId] || tag.tagId}料理自定义请求文案`}
													isSelected={isEnabled}
													onValueChange={(
														isSelected
													) => {
														toggleRequest(
															'foodRequests',
															tag.tagId,
															isSelected
														);
													}}
												/>
												<TagBadge tone="positive">
													{FOOD_TAG_MAP[tag.tagId] ||
														tag.tagId}
												</TagBadge>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<span
													className={
														TYPOGRAPHY_STYLES.compactLabel
													}
												>
													权重
												</span>
												<Input
													type="number"
													min={0}
													step="0.1"
													aria-label={`${FOOD_TAG_MAP[tag.tagId] || tag.tagId}喜好权重`}
													value={String(tag.weight)}
													onChange={(event) =>
														updateLikeTagWeight(
															'likeFoodTag',
															tag.tagId,
															Number(
																event.target
																	.value
															)
														)
													}
													className="w-20"
												/>
											</div>
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<Input
													type="text"
													value={req?.request || ''}
													isDisabled={!isEnabled}
													onChange={(e) => {
														updateFoodRequest(
															tag.tagId,
															{
																request:
																	e.target
																		.value,
															}
														);
													}}
													placeholder={
														!isEnabled
															? '使用游戏默认请求文案'
															: `请输入对“${
																	FOOD_TAG_MAP[
																		tag
																			.tagId
																	]
																}”的请求文本...`
													}
												/>
											</div>
										</div>
									);
								})}
							{(!guest?.likeFoodTag ||
								guest.likeFoodTag.length === 0) && (
								<EmptyState
									variant="text"
									title="请先在上方选择喜爱料理标签"
								/>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<div className="ml-1 flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
							<Label
								wrapperClassName="min-w-0"
								tip="根据上方喜爱酒水自动同步。选择标签后默认使用游戏请求文案；开启开关后可填写自定义请求文案。"
							>
								酒水点单请求（Beverage Requests）
							</Label>
							<span className={TYPOGRAPHY_STYLES.caption}>
								根据上方喜爱酒水自动同步
							</span>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{[...(guest?.likeBevTag || [])]
								.sort((a, b) => a.tagId - b.tagId)
								.map((tag) => {
									const req = guest?.bevRequests?.find(
										(r) => r.tagId === tag.tagId
									);
									const isEnabled = req?.enable ?? false;
									return (
										<div
											key={tag.tagId}
											className={cn(
												'flex min-w-0 flex-col gap-3 rounded-medium border p-3 sm:flex-row sm:items-center',
												isEnabled
													? 'border-divider bg-content1/50'
													: 'border-divider bg-content2/30'
											)}
										>
											<div className="flex shrink-0 items-center gap-3 sm:w-40">
												<Switch
													size="sm"
													aria-label={`使用${BEVERAGE_TAG_MAP[tag.tagId] || tag.tagId}酒水自定义请求文案`}
													isSelected={isEnabled}
													onValueChange={(
														isSelected
													) => {
														toggleRequest(
															'bevRequests',
															tag.tagId,
															isSelected
														);
													}}
												/>
												<TagBadge tone="beverage">
													{
														BEVERAGE_TAG_MAP[
															tag.tagId
														]
													}
												</TagBadge>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<span
													className={
														TYPOGRAPHY_STYLES.compactLabel
													}
												>
													权重
												</span>
												<Input
													type="number"
													min={0}
													step="0.1"
													aria-label={`${BEVERAGE_TAG_MAP[tag.tagId] || tag.tagId}喜好权重`}
													value={String(tag.weight)}
													onChange={(event) =>
														updateLikeTagWeight(
															'likeBevTag',
															tag.tagId,
															Number(
																event.target
																	.value
															)
														)
													}
													className="w-20"
												/>
											</div>
											<div className="flex min-w-0 flex-1 flex-col gap-1">
												<Input
													type="text"
													value={req?.request || ''}
													isDisabled={!isEnabled}
													onChange={(e) => {
														updateBevRequest(
															tag.tagId,
															{
																request:
																	e.target
																		.value,
															}
														);
													}}
													placeholder={
														!isEnabled
															? '使用游戏默认请求文案'
															: `请输入对“${
																	BEVERAGE_TAG_MAP[
																		tag
																			.tagId
																	]
																}”的请求文本...`
													}
												/>
											</div>
										</div>
									);
								})}
							{(!guest?.likeBevTag ||
								guest.likeBevTag.length === 0) && (
								<EmptyState
									variant="text"
									title="请先在上方选择喜爱酒水标签"
								/>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<Label tip="出没地点是指稀客夜间可能出现的地点，您可以选择多个地点并设置其相对概率，有一些地图的备注可能让您疑惑，如“神社雀食堂”和“[客流量加倍的]神社雀酒屋”，难以区分时可以都选择">
							出没地点（Spawn Locations）
						</Label>
						<div className="flex flex-col gap-4 rounded-medium border border-divider bg-content2/30 p-3 sm:p-4">
							<div className="flex flex-col gap-2">
								{IZAKAYA_GROUPS.map((group) => (
									<section
										key={group.name}
										className="flex flex-col gap-2 rounded-medium bg-content1/40 p-3 sm:flex-row sm:items-start"
									>
										<Heading
											as="h3"
											variant="subsection"
											className="shrink-0 sm:w-24 sm:pt-2"
										>
											{group.name}
										</Heading>
										<div className="flex min-w-0 flex-1 flex-wrap gap-2">
											{group.locations.map((izakaya) => {
												const isSelected = Boolean(
													guest?.spawn?.some(
														(spawn) =>
															spawn.izakayaId ===
															izakaya.id
													)
												);
												const locationButton = (
													<Button
														key={izakaya.id}
														size="sm"
														color={
															isSelected
																? 'primary'
																: 'default'
														}
														variant={
															isSelected
																? 'flat'
																: 'bordered'
														}
														aria-pressed={
															isSelected
														}
														className={cn(
															'h-10 rounded-medium px-3 text-left text-xs font-medium sm:h-8',
															isSelected
																? 'font-semibold'
																: 'text-foreground-700'
														)}
														onPress={() =>
															toggleSpawn(
																izakaya.id
															)
														}
													>
														<span className="inline-flex items-baseline gap-1">
															<span className="opacity-70">
																（{izakaya.id}）
															</span>
															<span>
																{izakaya.name}
															</span>
														</span>
													</Button>
												);
												return locationButton;
											})}
										</div>
									</section>
								))}
							</div>

							{guest?.spawn && guest.spawn.length > 0 && (
								<div className="mt-4 flex flex-col gap-3 border-t border-divider pt-4">
									{guest.spawn.map((spawn) => {
										const izakaya = IZAKAYAS.find(
											(i) => i.id === spawn.izakayaId
										);
										return (
											<div
												key={spawn.izakayaId}
												className="flex w-full flex-col gap-2 rounded-medium border border-divider bg-content1/50 p-3"
											>
												<Heading
													as="h4"
													variant="subsection"
													className="w-full"
												>
													<span className="mr-1 text-foreground-500">
														（{spawn.izakayaId}）
													</span>
													{izakaya?.name}
												</Heading>
												<div className="flex w-full flex-wrap items-center gap-6">
													<div className="flex flex-1 flex-col gap-1">
														<div className="flex items-center justify-between">
															<Label
																size="sm"
																tip={
																	'并不是某个地图中稀客出现的概率，而是与全部可能稀客出没地点的相对概率。所有地点的相对概率之和不必为1，游戏会自动归一化处理。因此与其说是相对概率，倒不如说是“权重”更合适一些，数值也不必小于1。建议取值0.05～0.30，较高的取值会允许稀客更早地出现'
																}
															>
																相对概率
															</Label>
															<span
																className={
																	TYPOGRAPHY_STYLES.caption
																}
															>
																{
																	spawn.relativeProb
																}
															</span>
														</div>
														<div className="flex items-center gap-2">
															<input
																type="range"
																aria-label={`${izakaya?.name || spawn.izakayaId}相对概率`}
																min="0"
																max="1"
																step="0.01"
																value={
																	spawn.relativeProb
																}
																onChange={(e) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			relativeProb:
																				parseFloat(
																					e
																						.target
																						.value
																				) ||
																				0,
																		}
																	)
																}
																className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-default-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-content1 disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
															/>
															<Input
																type="number"
																size="sm"
																aria-label={`${izakaya?.name || spawn.izakayaId}相对概率数值`}
																step="0.01"
																value={String(
																	spawn.relativeProb
																)}
																onChange={(e) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			relativeProb:
																				parseFloat(
																					e
																						.target
																						.value
																				) ||
																				0,
																		}
																	)
																}
																className="w-20 shrink-0"
															/>
														</div>
													</div>
													<div className="flex gap-4">
														<div className="flex flex-col items-center gap-1">
															<Label
																size="sm"
																className="whitespace-nowrap"
																tip="仅在该稀客的夜间生成状态已解锁后出现"
															>
																解锁后出现
															</Label>
															<Switch
																size="sm"
																aria-label={`${izakaya?.name || spawn.izakayaId}解锁后出现`}
																isSelected={
																	spawn.onlySpawnAfterUnlocking
																}
																onValueChange={(
																	isSelected
																) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			onlySpawnAfterUnlocking:
																				isSelected,
																		}
																	)
																}
															/>
														</div>
														<div className="flex flex-col items-center gap-1">
															<Label
																size="sm"
																className="whitespace-nowrap"
																tip="仅在剧情奖励已将该雀食堂加入角色的许可列表后出现"
															>
																按店铺许可后出现
															</Label>
															<Switch
																size="sm"
																aria-label={`${izakaya?.name || spawn.izakayaId}记录后出现`}
																isSelected={
																	spawn.onlySpawnWhenPlaceBeRecorded
																}
																onValueChange={(
																	isSelected
																) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			onlySpawnWhenPlaceBeRecorded:
																				isSelected,
																		}
																	)
																}
															/>
														</div>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			)}
			{isExpanded && !guest && (
				<EmptyState
					title="暂未启用顾客配置"
					description="可使用右侧开关启用顾客配置。"
				/>
			)}
		</EditorSection>
	);
}
