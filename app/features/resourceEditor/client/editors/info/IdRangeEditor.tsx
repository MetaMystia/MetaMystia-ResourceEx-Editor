'use client';

import { CheckIcon, CopyIcon } from '@heroui/shared-icons';
import { cn } from '@heroui/theme';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';
import Tooltip from '@/design/ui/components/tooltip';

import type { PackInfo } from '@/domain/resourcePack/contracts/resourceEx';

import { CoordinatedModal } from '@/features/overlays/client';
import { EditorField } from '@/features/resourceEditor/client/components/fields/EditorField';
import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { ErrorBadge } from '@/features/resourceEditor/client/components/status/ErrorBadge';
import { SuccessBadge } from '@/features/resourceEditor/client/components/status/SuccessBadge';

import { useIdRangeEditor } from './useIdRangeEditor';

interface IdRangeEditorProps {
	packInfo: PackInfo;
	onUpdate: (updates: Partial<PackInfo>) => void;
}

export function IdRangeEditor({ packInfo, onUpdate }: IdRangeEditorProps) {
	const [showKeyDialog, setShowKeyDialog] = useState(false);
	const [dialogMode, setDialogMode] = useState<'sign' | 'paste'>('sign');
	const [privateKey, setPrivateKey] = useState('');
	const [pastedSignature, setPastedSignature] = useState('');
	const [signing, setSigning] = useState(false);
	const [signError, setSignError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const isMountedRef = useRef(false);
	const openDialogTriggerRef = useRef<HTMLButtonElement>(null);
	const signingOperationIdRef = useRef(0);
	const { idRangeStart, idRangeEnd, idSignature, label } = packInfo;
	const {
		canSign,
		managedIdMax,
		managedIdMin,
		rangeError,
		sign,
		verifyStatus,
	} = useIdRangeEditor({ idRangeEnd, idRangeStart, idSignature, label });

	const invalidateSigning = useCallback(() => {
		signingOperationIdRef.current += 1;
		setSigning(false);
	}, []);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			signingOperationIdRef.current += 1;
		};
	}, []);

	useEffect(() => {
		invalidateSigning();
	}, [idRangeEnd, idRangeStart, invalidateSigning, label]);

	// Dialog management
	const openDialog = useCallback(() => {
		setSignError(null);
		setPrivateKey('');
		setPastedSignature('');
		setDialogMode('paste');
		setShowKeyDialog(true);
	}, []);

	const closeDialog = useCallback(() => {
		invalidateSigning();
		setShowKeyDialog(false);
		setPrivateKey('');
		setPastedSignature('');
		setSignError(null);
		requestAnimationFrame(() => openDialogTriggerRef.current?.focus());
	}, [invalidateSigning]);

	const handleDialogOpenChange = useCallback(
		(isOpen: boolean) => {
			if (!isOpen) {
				closeDialog();
			}
		},
		[closeDialog]
	);

	const handleSign = useCallback(async () => {
		const operationId = signingOperationIdRef.current + 1;
		signingOperationIdRef.current = operationId;
		setSigning(true);
		setSignError(null);
		try {
			const sig = await sign(privateKey);
			if (
				!isMountedRef.current ||
				signingOperationIdRef.current !== operationId
			) {
				return;
			}
			onUpdate({ idSignature: sig });
			closeDialog();
		} catch (e) {
			if (
				!isMountedRef.current ||
				signingOperationIdRef.current !== operationId
			) {
				return;
			}
			setSignError(
				'签名失败：' + (e instanceof Error ? e.message : String(e))
			);
		} finally {
			if (
				isMountedRef.current &&
				signingOperationIdRef.current === operationId
			) {
				setSigning(false);
			}
		}
	}, [closeDialog, onUpdate, privateKey, sign]);

	return (
		<EditorSection
			title="ID段分配（ID Range Allocation）"
			actions={
				<>
					{verifyStatus === 'valid' && (
						<SuccessBadge>签名验证通过</SuccessBadge>
					)}
					{verifyStatus === 'invalid' && (
						<ErrorBadge>签名无效</ErrorBadge>
					)}
				</>
			}
		>
			<p className={TYPOGRAPHY_STYLES.compactDescription}>
				请务必参考
				<a
					href="https://doc.meta-mystia.izakaya.cc/resource_ex/why_add_signature_check.html"
					target="_blank"
					rel="noopener noreferrer"
					className="font-medium text-primary-700 underline decoration-primary-400 underline-offset-2 transition-colors hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
				>
					有关ID签名校验机制的说明（资源包创作者请注意）
				</a>
			</p>

			{/* Start / End */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<EditorField label="ID段起始（Start，含）">
					<Input
						type="number"
						value={
							idRangeStart === undefined
								? ''
								: String(idRangeStart)
						}
						onChange={(e) => {
							const v = parseInt(e.target.value);
							onUpdate({
								idRangeStart: isNaN(v) ? undefined : v,
							});
						}}
						placeholder={`最小${managedIdMin}`}
						min={managedIdMin}
						max={managedIdMax}
						isInvalid={Boolean(rangeError)}
					/>
				</EditorField>

				<EditorField label="ID段结束（End，含）">
					<Input
						type="number"
						value={
							idRangeEnd === undefined ? '' : String(idRangeEnd)
						}
						onChange={(e) => {
							const v = parseInt(e.target.value);
							onUpdate({ idRangeEnd: isNaN(v) ? undefined : v });
						}}
						placeholder={`最大${managedIdMax}`}
						min={managedIdMin}
						max={managedIdMax}
						isInvalid={Boolean(rangeError)}
					/>
				</EditorField>
			</div>

			{rangeError && (
				<span className={cn(TYPOGRAPHY_STYLES.caption, 'text-danger')}>
					{rangeError}
				</span>
			)}

			{/* Signature */}
			<EditorField label="签名（Signature）">
				<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
					<Input
						value={idSignature || ''}
						readOnly
						placeholder="点击「设置签名」按钮进行签名…"
						className="font-mono text-xs"
					/>
					<Button
						ref={openDialogTriggerRef}
						color="primary"
						variant="flat"
						size="sm"
						onPress={openDialog}
						isDisabled={!canSign}
						className="h-10 shrink-0 rounded-medium px-4 text-xs font-medium"
					>
						设置签名
					</Button>
					<Tooltip content={copied ? '已复制' : '复制签名'}>
						<span className="inline-flex">
							<Button
								isIconOnly
								aria-label={copied ? '已复制签名' : '复制签名'}
								color={copied ? 'success' : 'default'}
								variant="flat"
								onPress={() => {
									if (!idSignature) return;
									navigator.clipboard
										.writeText(idSignature)
										.then(() => {
											setCopied(true);
											setTimeout(
												() => setCopied(false),
												2000
											);
										});
								}}
								isDisabled={!idSignature}
								className="h-10 w-10 shrink-0 rounded-medium"
							>
								{copied ? (
									<CheckIcon className="h-4 w-4" />
								) : (
									<CopyIcon className="h-4 w-4" />
								)}
							</Button>
						</span>
					</Tooltip>
				</div>
			</EditorField>

			{/* Signing dialog */}
			<CoordinatedModal
				coordination={{ id: 'resource.signature' }}
				isOpen={showKeyDialog}
				onOpenChange={handleDialogOpenChange}
				size="lg"
				classNames={{ body: 'gap-0 py-3' }}
			>
				<Heading as="h4" variant="dialog" className="mb-4">
					设置签名
				</Heading>

				{/* Tab switcher */}
				<div className="mb-4 flex gap-1 rounded-medium bg-default/30 p-1">
					<Button
						size="sm"
						color={dialogMode === 'paste' ? 'primary' : 'default'}
						variant={dialogMode === 'paste' ? 'flat' : 'light'}
						onPress={() => {
							invalidateSigning();
							setDialogMode('paste');
							setSignError(null);
						}}
						className="h-10 flex-1 rounded-medium px-3 text-xs font-medium sm:h-8"
					>
						直接输入签名
					</Button>
					<Button
						size="sm"
						color={dialogMode === 'sign' ? 'primary' : 'default'}
						variant={dialogMode === 'sign' ? 'flat' : 'light'}
						onPress={() => {
							invalidateSigning();
							setDialogMode('sign');
							setSignError(null);
						}}
						className="h-10 flex-1 rounded-medium px-3 text-xs font-medium sm:h-8"
					>
						使用私钥签名
					</Button>
				</div>

				{dialogMode === 'sign' ? (
					<>
						<p className={cn(TYPOGRAPHY_STYLES.caption, 'mb-2')}>
							待签名内容：{label}:{idRangeStart}-{idRangeEnd}
						</p>
						<p
							className={cn(
								TYPOGRAPHY_STYLES.caption,
								'mb-4 text-danger'
							)}
						>
							私钥仅用于本次签名，不会被保存！
						</p>
						<Textarea
							value={privateKey}
							onChange={(e) => setPrivateKey(e.target.value)}
							placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
							minRows={6}
							className="mb-4 font-mono text-xs"
						/>
					</>
				) : (
					<>
						<p className={cn(TYPOGRAPHY_STYLES.caption, 'mb-4')}>
							直接粘贴已有的Base64签名，提交后将自动验证。
						</p>
						<Textarea
							value={pastedSignature}
							onChange={(e) => setPastedSignature(e.target.value)}
							placeholder="粘贴Base64编码的签名"
							minRows={4}
							className="mb-4 font-mono text-xs"
						/>
					</>
				)}

				{signError && (
					<p
						className={cn(
							TYPOGRAPHY_STYLES.caption,
							'mb-4 text-danger'
						)}
					>
						{signError}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button
						variant="light"
						size="sm"
						onPress={closeDialog}
						className="h-10 rounded-medium px-4 text-sm sm:h-8"
					>
						取消
					</Button>
					{dialogMode === 'sign' ? (
						<Button
							variant="light"
							size="sm"
							onPress={handleSign}
							isDisabled={!privateKey.trim() || signing}
							className="h-10 px-4 text-sm sm:h-8"
						>
							{signing ? '签名中…' : '确认签名'}
						</Button>
					) : (
						<Button
							variant="light"
							size="sm"
							onPress={() => {
								const trimmed = pastedSignature.trim();
								if (!trimmed) return;
								onUpdate({ idSignature: trimmed });
								closeDialog();
							}}
							isDisabled={!pastedSignature.trim()}
							className="h-10 px-4 text-sm sm:h-8"
						>
							应用签名
						</Button>
					)}
				</div>
			</CoordinatedModal>
		</EditorSection>
	);
}
