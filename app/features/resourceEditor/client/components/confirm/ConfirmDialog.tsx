'use client';

import { cn } from '@heroui/theme';
import { memo, type ReactNode } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';

import { CoordinatedModal } from '@/features/overlays/client';
import type { TOverlayId } from '@/features/overlays/contracts';

interface IProps {
	coordinationId: TOverlayId;
	isOpen: boolean;
	title: ReactNode;
	description?: ReactNode;
	confirmLabel?: ReactNode;
	cancelLabel?: ReactNode;
	color?: 'danger' | 'primary' | 'warning';
	isConfirmDisabled?: boolean;
	isPending?: boolean;
	onCancel?: () => void;
	onConfirm: () => void;
}

export const ConfirmDialog = memo<IProps>(function ConfirmDialog({
	cancelLabel = '取消',
	color = 'danger',
	confirmLabel = '确认',
	coordinationId,
	description,
	isConfirmDisabled = false,
	isOpen,
	isPending = false,
	onCancel,
	onConfirm,
	title,
}) {
	const handleClose = onCancel ?? onConfirm;

	return (
		<CoordinatedModal
			coordination={{ id: coordinationId }}
			isOpen={isOpen}
			onClose={handleClose}
			isDismissable={!isPending}
			isKeyboardDismissDisabled={isPending}
			size="md"
		>
			<div className="flex flex-col gap-4">
				<div className="space-y-2">
					<Heading as="h2" variant="dialog" className="break-all">
						{title}
					</Heading>
					{description !== undefined && (
						<div
							className={cn(
								TYPOGRAPHY_STYLES.description,
								'whitespace-pre-line'
							)}
						>
							{description}
						</div>
					)}
				</div>
				<div className="flex justify-end gap-2 border-t border-divider pt-4">
					{onCancel !== undefined && (
						<Button
							variant="light"
							isDisabled={isPending}
							onPress={onCancel}
						>
							{cancelLabel}
						</Button>
					)}
					<Button
						color={color}
						isDisabled={isConfirmDisabled}
						isLoading={isPending}
						onPress={onConfirm}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</CoordinatedModal>
	);
});
