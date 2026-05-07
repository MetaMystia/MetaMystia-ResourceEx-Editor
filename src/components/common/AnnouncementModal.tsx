'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { Button, Modal } from '@/design/ui/components';
import { useMounted } from '@/hooks';
import { safeStorage } from '@/utilities';
import {
	ANNOUNCEMENT_SECTIONS,
	ANNOUNCEMENT_TITLE,
	ANNOUNCEMENT_VERSION,
} from '@/data/announcement';

/**
 * localStorage 中记录"用户已读公告版本"的键。
 *
 * 若已读版本与当前 {@link ANNOUNCEMENT_VERSION} 不一致，则在下次访问时自动弹窗。
 * 用户关闭弹窗后将版本号写回，避免重复弹出。
 */
const STORAGE_KEY = 'mm-rex-announcement-seen';
const OPEN_EVENT = 'mm-rex-open-announcement';

export function openAnnouncementModal() {
	window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * 站点公告自动弹窗。挂载在全局 `Providers` 中，每个页面访问时执行一次检查。
 *
 * 行为：
 * - 仅在客户端挂载完成后访问 storage，避免 SSR/hydration 不匹配。
 * - storage 读取失败（隐私模式 / 已禁用）时由 {@link safeStorage} 退化到内存，
 *   弹窗本次会话仍会展示一次。
 */
export const AnnouncementModal = memo(function AnnouncementModal() {
	const isMounted = useMounted();
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		if (!isMounted) return;
		const seen = safeStorage.getItem(STORAGE_KEY);
		if (seen !== ANNOUNCEMENT_VERSION) {
			setIsOpen(true);
		}
	}, [isMounted]);

	useEffect(() => {
		if (!isMounted) return;
		const handleOpen = () => setIsOpen(true);
		window.addEventListener(OPEN_EVENT, handleOpen);
		return () => window.removeEventListener(OPEN_EVENT, handleOpen);
	}, [isMounted]);

	const handleClose = useCallback(() => {
		safeStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_VERSION);
		setIsOpen(false);
	}, []);

	if (!isMounted) return null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			size="2xl"
			classNames={{ content: 'gap-4' }}
		>
			{(onClose) => (
				<div className="flex flex-col gap-5">
					<div className="flex items-center gap-3 border-b border-default-200 pb-3">
						<span className="text-2xl">📢</span>
						<div>
							<h2 className="text-xl font-bold">
								{ANNOUNCEMENT_TITLE}
							</h2>
							<p className="text-xs text-foreground/60">
								版本 {ANNOUNCEMENT_VERSION}
							</p>
						</div>
					</div>

					<div className="flex flex-col gap-5">
						{ANNOUNCEMENT_SECTIONS.map((section) => (
							<section
								key={section.title}
								className="flex flex-col gap-2"
							>
								<h3 className="text-base font-semibold text-primary">
									{section.title}
								</h3>
								<ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground/85">
									{section.items.map((item, index) => (
										<li key={index}>{item}</li>
									))}
								</ul>
							</section>
						))}
					</div>

					<div className="flex justify-end pt-2">
						<Button
							color="primary"
							variant="solid"
							onPress={() => {
								handleClose();
								onClose();
							}}
						>
							我已了解
						</Button>
					</div>
				</div>
			)}
		</Modal>
	);
});
