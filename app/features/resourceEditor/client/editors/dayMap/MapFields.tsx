'use client';

import { cn } from '@heroui/theme';
import { type ReactNode, useEffect, useId, useState } from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Heading from '@/design/ui/components/heading';
import Input from '@/design/ui/components/input';
import Textarea from '@/design/ui/components/textarea';

import { InfoTip } from '@/features/resourceEditor/client/components/fields/InfoTip';
import { EditorPanel } from '@/features/resourceEditor/client/components/layout/EditorPanel';

import { formatMapNumber } from './dayMapEditorModel';

interface IMapPanelProps {
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	icon?: ReactNode;
	meta?: ReactNode;
	tip?: ReactNode;
	title: ReactNode;
}

/** 侧栏面板，沿用编辑器通用面板外观。 */
export function MapPanel({
	actions,
	children,
	className,
	icon,
	meta,
	tip,
	title,
}: IMapPanelProps) {
	const titleId = useId();
	return (
		<EditorPanel
			className={cn(
				'flex min-w-0 shrink-0 flex-col gap-3 p-3',
				className
			)}
		>
			<div className="flex min-h-8 min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					{icon !== undefined && (
						<span className="flex size-7 shrink-0 items-center justify-center rounded-medium bg-default/40 text-base text-foreground-600">
							{icon}
						</span>
					)}
					<Heading
						as="h3"
						id={titleId}
						variant="subsection"
						className="min-w-0 truncate"
					>
						{title}
					</Heading>
					{meta !== undefined && (
						<span
							className={cn(
								TYPOGRAPHY_STYLES.metadata,
								'shrink-0'
							)}
						>
							{meta}
						</span>
					)}
					{tip !== undefined && <InfoTip>{tip}</InfoTip>}
				</div>
				{actions !== undefined && (
					<div className="flex shrink-0 items-center gap-1">
						{actions}
					</div>
				)}
			</div>
			{children}
		</EditorPanel>
	);
}

export function MapHint({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p className={cn(TYPOGRAPHY_STYLES.caption, 'break-normal', className)}>
			{children}
		</p>
	);
}

interface IMapNumberProps {
	description?: ReactNode;
	endContent?: ReactNode;
	isDisabled?: boolean;
	label: string;
	max?: number;
	min?: number;
	onChange(value: number): void;
	step?: number;
	value: number;
}

/** 输入时只改草稿，失焦或回车后提交一次；Esc 还原。 */
export function MapNumber({
	description,
	endContent,
	isDisabled,
	label,
	max,
	min,
	onChange,
	step = 1,
	value,
}: IMapNumberProps) {
	const [draft, setDraft] = useState(() => formatMapNumber(value, 6));
	const [isInvalid, setIsInvalid] = useState(false);
	useEffect(() => {
		setDraft(formatMapNumber(value, 6));
		setIsInvalid(false);
	}, [value]);
	function commit() {
		const next = Number(draft);
		const invalid =
			!draft.trim() ||
			!Number.isFinite(next) ||
			(min !== undefined && next < min) ||
			(max !== undefined && next > max) ||
			(step === 1 && !Number.isInteger(next));
		setIsInvalid(invalid);
		if (!invalid && next !== value) onChange(next);
	}
	const rangeText =
		min !== undefined && max !== undefined
			? `范围 ${formatMapNumber(min)} 至 ${formatMapNumber(max)}`
			: min !== undefined
				? `不小于 ${formatMapNumber(min)}`
				: max !== undefined
					? `不大于 ${formatMapNumber(max)}`
					: '';
	return (
		<Input
			labelPlacement="outside"
			label={label}
			size="sm"
			type="number"
			inputMode="decimal"
			value={draft}
			step={step}
			{...(min === undefined ? {} : { min })}
			{...(max === undefined ? {} : { max })}
			{...(isDisabled === undefined ? {} : { isDisabled })}
			{...(endContent === undefined ? {} : { endContent })}
			{...(description === undefined ? {} : { description })}
			classNames={{ input: 'font-mono text-xs tabular-nums' }}
			isInvalid={isInvalid}
			errorMessage={
				isInvalid
					? step === 1
						? `请输入整数${rangeText ? `，${rangeText}` : ''}`
						: `请输入有效数值${rangeText ? `，${rangeText}` : ''}`
					: undefined
			}
			onValueChange={setDraft}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
				if (event.key === 'Escape') {
					event.stopPropagation();
					setDraft(formatMapNumber(value, 6));
					setIsInvalid(false);
				}
			}}
		/>
	);
}

interface IMapVectorProps {
	isDisabled?: boolean;
	labels: readonly string[];
	max?: number;
	min?: number;
	onChange(value: number[]): void;
	step?: number;
	values: readonly number[];
}

export function MapVector({
	isDisabled,
	labels,
	max,
	min,
	onChange,
	step = 0.1,
	values,
}: IMapVectorProps) {
	return (
		<div className="grid grid-cols-2 gap-x-2 gap-y-3">
			{labels.map((label, index) => (
				<MapNumber
					key={label}
					label={label}
					value={values[index] ?? 0}
					{...(min === undefined ? {} : { min })}
					{...(max === undefined ? {} : { max })}
					{...(isDisabled === undefined ? {} : { isDisabled })}
					step={step}
					onChange={(value) =>
						onChange(
							labels.map((_, i) =>
								i === index ? value : (values[i] ?? 0)
							)
						)
					}
				/>
			))}
		</div>
	);
}

interface IMapTextFieldProps {
	description?: ReactNode;
	isDisabled?: boolean;
	isMultiline?: boolean;
	label: string;
	onChange(value: string): void;
	placeholder?: string;
	validate?: (value: string) => string | null;
	value: string;
}

/** 文本同样失焦提交，避免每个字符都占用一步撤销。 */
export function MapTextField({
	description,
	isDisabled,
	isMultiline = false,
	label,
	onChange,
	placeholder,
	validate,
	value,
}: IMapTextFieldProps) {
	const [draft, setDraft] = useState(value);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		setDraft(value);
		setError(null);
	}, [value]);
	function commit() {
		const message = validate?.(draft) ?? null;
		setError(message);
		if (!message && draft !== value) onChange(draft);
	}
	const shared = {
		label,
		value: draft,
		...(placeholder === undefined ? {} : { placeholder }),
		...(isDisabled === undefined ? {} : { isDisabled }),
		...(description === undefined ? {} : { description }),
		isInvalid: error !== null,
		...(error === null ? {} : { errorMessage: error }),
		onBlur: commit,
		onValueChange: (next: string) => {
			setDraft(next);
			if (error) setError(validate?.(next) ?? null);
		},
	};
	if (isMultiline)
		return (
			<Textarea
				{...shared}
				labelPlacement="outside"
				size="sm"
				minRows={2}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						event.stopPropagation();
						setDraft(value);
						setError(null);
					}
				}}
			/>
		);
	return (
		<Input
			{...shared}
			labelPlacement="outside"
			size="sm"
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
				if (event.key === 'Escape') {
					event.stopPropagation();
					setDraft(value);
					setError(null);
				}
			}}
		/>
	);
}

/** 只读的键值行，用于展示原始数据。 */
export function MapProperty({
	label,
	value,
}: {
	label: ReactNode;
	value: ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-baseline justify-between gap-3">
			<span className={cn(TYPOGRAPHY_STYLES.compactLabel, 'shrink-0')}>
				{label}
			</span>
			<span
				className={cn(
					TYPOGRAPHY_STYLES.metadata,
					'min-w-0 truncate text-right text-foreground-600'
				)}
			>
				{value}
			</span>
		</div>
	);
}
