import { useState } from 'react';
import { Switch } from '@/design/ui/components';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionAddButton } from '@/components/common/SectionAddButton';
import { GuestInfo, Request, SpawnConfig } from '@/types/resource';
import {
	BEVERAGE_TAGS,
	FOOD_TAGS,
	FOOD_TAG_MAP,
	BEVERAGE_TAG_MAP,
} from '@/data/tags';
import { IZAKAYAS } from '@/data/izakayas';
import { cn } from '@/design/ui/utils';
import { ChevronRight } from '@/components/icons/ChevronRight';
import { Label } from '@/components/common/Label';
import { InfoTip } from '@/components/common/InfoTip';

interface GuestInfoProps {
	guest: GuestInfo | undefined;
	onUpdate: (updates: Partial<GuestInfo>) => void;
	onEnable: () => void;
	onDisable: () => void;
}

export function GuestInfoEditor({
	guest,
	onUpdate,
	onEnable,
	onDisable,
}: GuestInfoProps) {
	const [isExpanded, setIsExpanded] = useState(false);

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
			newTags = currentTags.filter((t) => t.tagId !== tagId);
		} else {
			newTags = [...currentTags, { tagId, weight: 1 }];
			if (field === 'likeFoodTag') {
				const existingReq = newFoodRequests.find(
					(r) => r.tagId === tagId
				);
				if (!existingReq) {
					newFoodRequests.push({ tagId, request: '', enable: true });
				}
			}
			// Beverage requests are "closed" by default, so we don't add them to bevRequests here
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
			newSpawns = currentSpawns.filter((s) => s.izakayaId !== izakayaId);
		} else {
			newSpawns = [
				...currentSpawns,
				{
					izakayaId,
					relativeProb: 0,
					onlySpawnAfterUnlocking: false,
					onlySpawnWhenPlaceBeRecorded: false,
				},
			];
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
		<div className="flex flex-col gap-4">
			<div className="ml-1 flex items-center justify-between">
				<div
					className="flex cursor-pointer select-none items-center gap-2"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<ChevronRight
						className={cn(
							'transition-transform duration-200',
							isExpanded && 'rotate-90'
						)}
					/>
					<label className="cursor-pointer font-semibold">
						顾客配置（Guest Info）
					</label>
					<InfoTip>
						为角色配置夜间顾客相关信息，包括喜好标签、闲聊文本等
					</InfoTip>
				</div>
				<div className="flex items-center gap-2">
					<span className="whitespace-nowrap text-xs font-medium">
						{guest ? '已启用顾客配置' : '启用顾客配置'}
					</span>
					<Switch
						size="sm"
						isSelected={Boolean(guest)}
						onValueChange={(v) => {
							if (v) {
								onEnable();
							} else if (
								confirm(
									'关闭顾客配置将丢失已填写的所有顾客数据（喜好、闲聊、评价等），且不可恢复。\n\n确定要关闭吗？'
								)
							) {
								onDisable();
							}
						}}
					/>
				</div>
			</div>

			{isExpanded && guest && (
				<div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-6 rounded-2xl border border-white/5 bg-black/5 p-6 duration-200">
					{guest.likeFoodTag.some((lt) =>
						guest?.hateFoodTag.includes(lt.tagId)
					) && (
						<div className="flex animate-pulse items-center gap-3 rounded-xl border border-danger/50 bg-danger/20 p-3 text-xs font-bold text-danger">
							<span className="text-lg">⚠️</span>
							检测到标签冲突：某些料理标签同时存在于“喜爱”和“厌恶”列表中。
						</div>
					)}
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<label className="ml-1 text-sm font-bold opacity-70">
								携带金钱下限 (Lower)
							</label>
							<input
								type="number"
								value={guest.fundRangeLower}
								onChange={(e) =>
									onUpdate({
										fundRangeLower:
											parseInt(e.target.value) || 0,
									})
								}
								className="rounded-xl border border-white/10 bg-black/10 p-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label className="ml-1 text-sm font-bold opacity-70">
								携带金钱上限 (Upper)
							</label>
							<input
								type="number"
								value={guest.fundRangeUpper}
								onChange={(e) =>
									onUpdate({
										fundRangeUpper:
											parseInt(e.target.value) || 0,
									})
								}
								className="rounded-xl border border-white/10 bg-black/10 p-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<label className="ml-1 text-sm font-bold opacity-70">
							评价文本 (Evaluations)
						</label>
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
										<label className="ml-1 text-[10px] font-bold opacity-50">
											{label}
											{tips[i] && (
												<InfoTip>{tips[i]}</InfoTip>
											)}
										</label>
										<input
											type="text"
											value={guest?.evaluation[i] || ''}
											onChange={(e) =>
												updateEvaluation(
													i,
													e.target.value
												)
											}
											placeholder={`请输入${label}文本...`}
											className="rounded-lg border border-white/10 bg-black/10 p-2 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary/50"
										/>
									</div>
								);
							})}
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<div className="ml-1 flex items-center justify-between">
							<Label
								className="text-sm font-bold opacity-70"
								tip="稀客在等餐时的闲聊文本，可以自由添加多条，也可以重复以控制各文本出现概率"
							>
								闲聊文本 (Conversations)
							</Label>
							<SectionAddButton onPress={addConversation}>
								添加闲聊
							</SectionAddButton>
						</div>
						<div className="flex flex-col gap-2">
							{guest?.conversation?.map((conv, i) => (
								<div key={i} className="flex gap-2">
									<input
										type="text"
										value={conv}
										onChange={(e) =>
											updateConversation(
												i,
												e.target.value
											)
										}
										placeholder="请输入闲聊文本..."
										className="flex-1 rounded-lg border border-white/10 bg-black/10 p-2 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-primary/50"
									/>
									<button
										onClick={() => removeConversation(i)}
										className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger/20 bg-danger/10 text-danger transition-all hover:bg-danger/20"
									>
										×
									</button>
								</div>
							))}
							{(guest?.conversation?.length || 0) === 0 && (
								<div className="rounded-xl border border-dashed border-white/5 py-4 text-center text-xs opacity-30">
									暂无闲聊文本
								</div>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-3">
							<div className="ml-1 flex items-center justify-between">
								<Label
									className="text-sm font-bold opacity-70"
									tip="稀客喜爱的料理tag,在下方选择具体标签，并稍后编写点单请求文本。建议选择 4-8 个"
								>
									喜爱料理标签 (Like Food Tags)
								</Label>
							</div>
							<div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/10 p-4">
								{FOOD_TAGS.map((tag) => {
									const isSelected = guest?.likeFoodTag.some(
										(t) => t.tagId === tag.id
									);
									const isConflict =
										isSelected &&
										guest?.hateFoodTag.includes(tag.id);
									return (
										<button
											key={tag.id}
											onClick={() =>
												toggleLikeTag(
													'likeFoodTag',
													tag.id
												)
											}
											className={cn(
												'relative flex items-center border px-1.5 py-0.5 text-[11px] font-bold transition-all',
												isSelected
													? isConflict
														? 'border-danger bg-danger/40 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'
														: 'border-[#9d5437] bg-[#e6b4a6] text-[#830000]'
													: 'border-white/20 bg-white/10 hover:bg-white/20'
											)}
											title={
												isConflict
													? '冲突：该标签同时存在于喜爱和厌恶列表中'
													: ''
											}
										>
											<span
												className={cn(
													'mr-1 transition-opacity',
													isSelected
														? 'opacity-100'
														: 'opacity-40'
												)}
											>
												⦁
											</span>
											{tag.name}
											{isConflict && (
												<span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-danger text-[10px] text-white shadow-lg">
													!
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<Label
								className="ml-1 text-sm font-bold text-danger opacity-70"
								tip="稀客厌恶的料理tag,请谨慎选择，避免与喜爱标签冲突。"
							>
								厌恶料理标签 (Hate Food Tags)
							</Label>
							<div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/10 p-4">
								{FOOD_TAGS.map((tag) => {
									const isSelected =
										guest?.hateFoodTag.includes(tag.id);
									const isConflict =
										isSelected &&
										guest?.likeFoodTag.some(
											(t) => t.tagId === tag.id
										);
									return (
										<button
											key={tag.id}
											onClick={() =>
												toggleHateTag(tag.id)
											}
											className={cn(
												'relative flex items-center border px-1.5 py-0.5 text-[11px] font-bold transition-all',
												isSelected
													? isConflict
														? 'border-danger bg-danger/40 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'
														: 'border-danger bg-danger/10 text-danger'
													: 'border-white/20 bg-white/10 hover:bg-white/20'
											)}
											title={
												isConflict
													? '冲突：该标签同时存在于喜爱和厌恶列表中'
													: ''
											}
										>
											{tag.name}
											<span
												className={cn(
													'ml-1 transition-opacity',
													isSelected
														? 'opacity-100'
														: 'opacity-40'
												)}
											>
												✘
											</span>
											{isConflict && (
												<span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-danger text-[10px] text-white shadow-lg">
													!
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<Label
								className="ml-1 text-sm font-bold text-primary opacity-70"
								tip="稀客喜爱的酒水tag,在下方选择具体标签，并稍后选择编写酒水点单请求文本"
							>
								喜爱酒水标签 (Like Beverage Tags)
							</Label>
							<div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/10 p-4">
								{BEVERAGE_TAGS.map((tag) => {
									const isSelected = guest?.likeBevTag.some(
										(t) => t.tagId === tag.id
									);
									return (
										<button
											key={tag.id}
											onClick={() =>
												toggleLikeTag(
													'likeBevTag',
													tag.id
												)
											}
											className={cn(
												'relative flex items-center border px-1.5 py-0.5 text-[11px] font-bold transition-all',
												isSelected
													? 'border-[#6f929b] bg-[#b0cfd7] text-[#a45c22]'
													: 'border-white/20 bg-white/10 hover:bg-white/20'
											)}
										>
											<span
												className={cn(
													'mr-1 transition-opacity',
													isSelected
														? 'opacity-100'
														: 'opacity-40'
												)}
											>
												⦁
											</span>
											{tag.name}
										</button>
									);
								})}
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<div className="ml-1 flex items-center justify-between">
							<Label
								className="text-sm font-bold opacity-70"
								tip={
									'根据上方喜爱料理自动同步，在下方为每个标签编写具体的点单请求文本，也可以禁用某些标签的点单请求，游戏会使用默认文本如：“请给我辣的料理”'
								}
							>
								料理点单请求 (Food Requests)
							</Label>
							<span className="text-[10px] italic opacity-40">
								根据上方喜爱料理自动同步
							</span>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{(guest?.likeFoodTag || [])
								.sort((a, b) => a.tagId - b.tagId)
								.map((tag) => {
									const req = guest?.foodRequests?.find(
										(r) => r.tagId === tag.tagId
									);
									const isEnabled = req?.enable ?? false;
									return (
										<div
											key={tag.tagId}
											className={cn(
												'flex items-center gap-3 rounded-xl border p-3 transition-all',
												isEnabled
													? 'border-white/5 bg-black/10'
													: 'border-transparent bg-black/5 opacity-60'
											)}
										>
											<div className="flex shrink-0 items-center gap-3">
												<input
													type="checkbox"
													checked={isEnabled}
													onChange={(e) => {
														toggleRequest(
															'foodRequests',
															tag.tagId,
															e.target.checked
														);
													}}
													className="h-4 w-4 rounded border-white/10 bg-black/10 text-primary focus:ring-primary/50"
												/>
												<div
													className={cn(
														'border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
														isEnabled
															? 'border-[#9d5437] bg-[#e6b4a6] text-[#830000]'
															: 'border-black/10 bg-black/5 text-black/40 dark:border-white/10 dark:bg-white/5 dark:text-white/40'
													)}
												>
													<span className="mr-1">
														⦁
													</span>
													{FOOD_TAG_MAP[tag.tagId] ||
														tag.tagId}
												</div>
											</div>
											<div className="flex flex-1 flex-col gap-1">
												<input
													type="text"
													value={req?.request || ''}
													disabled={!isEnabled}
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
													className="rounded-lg border border-white/10 bg-black/10 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
													placeholder={
														!isEnabled
															? '已禁用'
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
						<div className="ml-1 flex items-center justify-between">
							<Label
								className="text-sm font-bold opacity-70"
								tip="根据上方喜爱酒水自动同步，默认为“关闭”状态，形如“请给我清酒的饮料“，也可以启用并自定义文本，为酒水也编写点单请求"
							>
								酒水点单请求 (Beverage Requests)
							</Label>
							<span className="text-[10px] italic opacity-40">
								根据上方喜爱酒水自动同步
							</span>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{(guest?.likeBevTag || [])
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
												'flex items-center gap-3 rounded-xl border p-3 transition-all',
												isEnabled
													? 'border-white/5 bg-black/10'
													: 'border-transparent bg-black/5 opacity-60'
											)}
										>
											<div className="flex shrink-0 items-center gap-3">
												<input
													type="checkbox"
													checked={isEnabled}
													onChange={(e) => {
														toggleRequest(
															'bevRequests',
															tag.tagId,
															e.target.checked
														);
													}}
													className="h-4 w-4 rounded border-white/10 bg-black/10 text-primary focus:ring-primary/50"
												/>
												<div
													className={cn(
														'border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
														isEnabled
															? 'border-[#6f929b] bg-[#b0cfd7] text-[#a45c22]'
															: 'border-black/10 bg-black/5 text-black/40 dark:border-white/10 dark:bg-white/5 dark:text-white/40'
													)}
												>
													{
														BEVERAGE_TAG_MAP[
															tag.tagId
														]
													}
												</div>
											</div>
											<div className="flex flex-1 flex-col gap-1">
												<input
													type="text"
													value={req?.request || ''}
													disabled={!isEnabled}
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
													className="rounded-lg border border-white/10 bg-black/10 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
													placeholder={
														!isEnabled
															? '已禁用'
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
						<Label
							className="ml-1 text-sm font-bold opacity-70"
							tip="出没地点是指稀客夜间可能出现的地点，您可以选择多个地点并设置其相对概率，有一些地图的备注可能让您疑惑，如“神社雀食堂”和“[客流量加倍的]神社雀酒屋”，难以区分时可以都选择"
						>
							出没地点 (Spawn Locations)
						</Label>
						<div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/10 p-4">
							<div className="flex flex-wrap gap-2">
								{IZAKAYAS.map((izakaya) => {
									const isSelected = guest?.spawn?.some(
										(s) => s.izakayaId === izakaya.id
									);
									return (
										<button
											key={izakaya.id}
											onClick={() =>
												toggleSpawn(izakaya.id)
											}
											className={cn(
												'flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all',
												isSelected
													? 'border-primary bg-primary/20 shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]'
													: 'border-white/10 bg-white/5 hover:bg-white/10'
											)}
										>
											<span className="mr-1.5 opacity-50">
												({izakaya.id})
											</span>
											{izakaya.name}
										</button>
									);
								})}
							</div>

							{guest?.spawn && guest.spawn.length > 0 && (
								<div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
									{guest.spawn.map((spawn) => {
										const izakaya = IZAKAYAS.find(
											(i) => i.id === spawn.izakayaId
										);
										return (
											<div
												key={spawn.izakayaId}
												className="flex w-full flex-wrap items-center gap-4 rounded-lg border border-white/5 bg-white/5 p-3"
											>
												<div className="w-32 shrink-0 text-[11px] font-bold">
													<span className="mr-1 opacity-50">
														({spawn.izakayaId})
													</span>
													{izakaya?.name}
												</div>
												<div className="flex w-full flex-1 flex-wrap items-center gap-6">
													<div className="flex flex-1 flex-col gap-1">
														<div className="flex items-center justify-between">
															<Label
																className="text-[10px] opacity-70"
																tip={
																	'并不是某个地图中稀客出现的概率，而是与全部可能稀客出没地点的相对概率。所有地点的相对概率之和不必为 1，游戏会自动归一化处理。因此与其说是相对概率，倒不如说是“权重”更合适一些，数值也不必小于 1。建议取值 0.05-0.30，较高的取值会允许稀客更早地出现'
																}
															>
																相对概率
															</Label>
															<span className="text-[10px] opacity-50">
																{
																	spawn.relativeProb
																}
															</span>
														</div>
														<div className="flex items-center gap-2">
															<input
																type="range"
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
																className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-white/10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
															/>
															<input
																type="number"
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
																className="w-12 rounded border border-white/10 bg-black/10 px-1 py-0.5 text-center text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
															/>
														</div>
													</div>
													<div className="flex gap-4">
														<div className="flex flex-col items-center gap-1">
															<Label
																className="whitespace-nowrap text-[10px] opacity-70"
																tip="默认为关闭，不过MetaMiku 还没有测试过具体含义哦"
															>
																解锁后出现
															</Label>
															<input
																type="checkbox"
																checked={
																	spawn.onlySpawnAfterUnlocking
																}
																onChange={(e) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			onlySpawnAfterUnlocking:
																				e
																					.target
																					.checked,
																		}
																	)
																}
																className="rounded border-white/20 bg-black/20 text-primary focus:ring-0"
															/>
														</div>
														<div className="flex flex-col items-center gap-1">
															<Label
																className="whitespace-nowrap text-[10px] opacity-70"
																tip="默认为关闭，不过MetaMiku 还没有测试过具体含义哦"
															>
																记录后出现
															</Label>
															<input
																type="checkbox"
																checked={
																	spawn.onlySpawnWhenPlaceBeRecorded
																}
																onChange={(e) =>
																	updateSpawn(
																		spawn.izakayaId,
																		{
																			onlySpawnWhenPlaceBeRecorded:
																				e
																					.target
																					.checked,
																		}
																	)
																}
																className="rounded border-white/20 bg-black/20 text-primary focus:ring-0"
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
					description="点击右侧开关启用"
				/>
			)}
		</div>
	);
}
