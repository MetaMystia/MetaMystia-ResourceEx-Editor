'use client';

import { cn } from '@heroui/theme';
import { memo, useCallback, useEffect, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import {
	ANNOUNCEMENT_SECTIONS,
	ANNOUNCEMENT_SUMMARY,
	ANNOUNCEMENT_TITLE,
	ANNOUNCEMENT_VERSION,
} from '@/features/announcements/data/announcement';
import { CoordinatedModal } from '@/features/overlays/client';
import { useResourceWorkspaces } from '@/features/resourceEditor/client/workspaces/useResourceWorkspaces';

import { safeStorage } from '@/infrastructure/browser/storage/safeStorage';

import { useHydrated } from '@/shared/react/useHydrated';

const STORAGE_KEY = 'mm-rex-announcement-seen';
const OPEN_EVENT = 'mm-rex-open-announcement';
const ANNOUNCEMENT_SEEN_VALUE = `${ANNOUNCEMENT_VERSION}:confirmed`;

export function openAnnouncementModal() {
	window.dispatchEvent(new Event(OPEN_EVENT));
}

export const AnnouncementModal = memo(function AnnouncementModal() {
	const isHydrated = useHydrated();
	const { lifecycleStatus } = useResourceWorkspaces();
	const [isRequested, setIsRequested] = useState(false);
	const isWorkspaceStateStable =
		lifecycleStatus !== 'hydrating' &&
		lifecycleStatus !== 'importing' &&
		lifecycleStatus !== 'opening' &&
		lifecycleStatus !== 'recovering';

	useEffect(() => {
		if (!isHydrated) return;
		if (safeStorage.getItem(STORAGE_KEY) !== ANNOUNCEMENT_SEEN_VALUE) {
			setIsRequested(true);
		}
	}, [isHydrated]);

	useEffect(() => {
		if (!isHydrated) return;
		const handleOpen = () => setIsRequested(true);
		window.addEventListener(OPEN_EVENT, handleOpen);
		return () => window.removeEventListener(OPEN_EVENT, handleOpen);
	}, [isHydrated]);

	const handleClose = useCallback(() => {
		safeStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_SEEN_VALUE);
		setIsRequested(false);
	}, []);

	if (!isHydrated) return null;

	return (
		<CoordinatedModal
			coordination={{ id: 'announcement' }}
			isOpen={isRequested && isWorkspaceStateStable}
			onClose={handleClose}
			size="2xl"
		>
			<div className="flex flex-col gap-4">
				<div className="border-b border-divider pb-3">
					<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<Heading as="h2" variant="dialog">
							{ANNOUNCEMENT_TITLE}
						</Heading>
						<p className={TYPOGRAPHY_STYLES.caption}>
							版本{ANNOUNCEMENT_VERSION}
						</p>
					</div>
					<p className={cn(TYPOGRAPHY_STYLES.description, 'mt-2')}>
						{ANNOUNCEMENT_SUMMARY}
					</p>
				</div>
				<div className="flex flex-col gap-3">
					{ANNOUNCEMENT_SECTIONS.map((section) => (
						<section
							key={section.title}
							className="rounded-medium border border-divider bg-content1/40 p-4 text-justify sm:last:col-span-2"
						>
							<Heading as="h3" variant="subsection">
								{section.title}
							</Heading>
							<ul
								className={cn(
									TYPOGRAPHY_STYLES.description,
									'mt-2 flex list-disc flex-col gap-2 pl-5 marker:text-primary'
								)}
							>
								{section.items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</section>
					))}
				</div>
				<div className="flex justify-end pt-2">
					<Button color="primary" onPress={handleClose}>
						我已了解
					</Button>
				</div>
			</div>
		</CoordinatedModal>
	);
});
