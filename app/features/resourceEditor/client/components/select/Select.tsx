'use client';

import {
	Select as HeroUISelect,
	SelectItem,
	SelectSection,
} from '@heroui/select';
import { cn } from '@heroui/theme';
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';

import { ConfirmPopover } from '@/features/resourceEditor/client/components/confirm/ConfirmPopover';

export type TSelectValue = string | number;

export interface ISelectOption<V extends TSelectValue = TSelectValue> {
	value: V;
	label: ReactNode;
	textValue?: string;
	description?: ReactNode;
	isDisabled?: boolean;
}

export interface ISelectSection<V extends TSelectValue = TSelectValue> {
	section: string;
	options: ISelectOption<V>[];
}

export type TSelectItem<V extends TSelectValue = TSelectValue> =
	ISelectOption<V> | ISelectSection<V>;

export type SelectValue = TSelectValue;
export type SelectItem<V extends TSelectValue = TSelectValue> = TSelectItem<V>;

export interface ISelectChangeConfirmation {
	confirmLabel?: string;
	description: string;
	title: string;
}

export interface ISelectProps<V extends TSelectValue = TSelectValue> {
	value: V | undefined;
	onChange: (value: V) => void;
	items: TSelectItem<V>[];
	placeholder?: string;
	ariaLabel?: string;
	size?: 'sm' | 'md';
	/** HeroUI base/root layout classes, such as width or flex sizing. */
	baseClassName?: string;
	/** Additional trigger appearance classes. */
	className?: string;
	/** Complete trigger appearance override. */
	classNameOverride?: string;
	isInvalid?: boolean;
	isDisabled?: boolean;
	id?: string;
	menuMaxHeight?: number;
	getChangeConfirmation?: (
		nextValue: V,
		currentValue: V | undefined
	) => ISelectChangeConfirmation | null;
}

interface IPendingSelectChange<V extends TSelectValue> {
	confirmation: ISelectChangeConfirmation;
	value: V;
}

function isSection<V extends TSelectValue>(
	item: TSelectItem<V>
): item is ISelectSection<V> {
	return 'section' in item;
}

function getOptionTextValue<V extends TSelectValue>(option: ISelectOption<V>) {
	return (
		option.textValue ??
		(typeof option.label === 'string' ? option.label : String(option.value))
	);
}

export function Select<V extends TSelectValue = TSelectValue>({
	ariaLabel,
	baseClassName,
	className,
	classNameOverride,
	getChangeConfirmation,
	id,
	isDisabled,
	isInvalid,
	items,
	menuMaxHeight = 240,
	onChange,
	placeholder = '请选择…',
	size = 'md',
	value,
}: ISelectProps<V>) {
	const [pendingChange, setPendingChange] =
		useState<IPendingSelectChange<V> | null>(null);

	useEffect(() => {
		setPendingChange(null);
	}, [value]);

	const optionsByKey = useMemo(() => {
		const options = new Map<string, ISelectOption<V>>();
		for (const item of items) {
			if (isSection(item)) {
				for (const option of item.options) {
					options.set(String(option.value), option);
				}
			} else {
				options.set(String(item.value), item);
			}
		}
		return options;
	}, [items]);

	const disabledKeys = useMemo(
		() =>
			new Set(
				Array.from(optionsByKey.entries())
					.filter(([, option]) => option.isDisabled)
					.map(([key]) => key)
			),
		[optionsByKey]
	);

	const handleSelectionChange = useCallback(
		(keys: 'all' | Set<React.Key>) => {
			if (keys === 'all') return;
			const selectedKey = keys.values().next().value;
			if (selectedKey === undefined) return;
			const option = optionsByKey.get(String(selectedKey));
			if (!option || option.isDisabled || option.value === value) return;
			const confirmation = getChangeConfirmation?.(option.value, value);
			if (!confirmation) {
				onChange(option.value);
				return;
			}

			setPendingChange({ confirmation, value: option.value });
		},
		[getChangeConfirmation, onChange, optionsByKey, value]
	);

	const selectedKey = value === undefined ? undefined : String(value);
	const selectedKeys =
		selectedKey !== undefined && optionsByKey.has(selectedKey)
			? new Set([selectedKey])
			: new Set<string>();
	const triggerClassName =
		classNameOverride ??
		cn(
			'w-full min-w-0 bg-default/40 backdrop-blur',
			size === 'sm' ? 'h-10 min-h-10 sm:h-8 sm:min-h-8' : 'h-10 min-h-10',
			className
		);

	const selectControl = (
		<HeroUISelect
			{...(id === undefined ? {} : { id })}
			aria-label={ariaLabel ?? placeholder}
			placeholder={placeholder}
			selectedKeys={selectedKeys}
			disabledKeys={disabledKeys}
			selectionMode="single"
			size={size}
			radius="md"
			isVirtualized={false}
			{...(isDisabled === undefined ? {} : { isDisabled })}
			{...(isInvalid === undefined ? {} : { isInvalid })}
			listboxProps={{
				itemClasses: {
					description:
						'overflow-visible whitespace-normal break-all text-clip',
					title: 'overflow-visible whitespace-normal break-all text-clip',
				},
			}}
			popoverProps={{ shouldCloseOnScroll: false }}
			maxListboxHeight={menuMaxHeight}
			showScrollIndicators
			classNames={{
				base: cn(
					'w-full min-w-0',
					getChangeConfirmation ? undefined : baseClassName
				),
				trigger: triggerClassName,
				value: 'truncate',
				popoverContent: 'max-w-[min(420px,90vw)]',
			}}
			onSelectionChange={handleSelectionChange}
		>
			{items.map((item, index) =>
				isSection(item) ? (
					<SelectSection
						key={`section-${index}-${item.section}`}
						title={item.section}
					>
						{item.options.map((option) => (
							<SelectItem
								key={String(option.value)}
								textValue={getOptionTextValue(option)}
								description={option.description}
							>
								{option.label}
							</SelectItem>
						))}
					</SelectSection>
				) : (
					<SelectItem
						key={String(item.value)}
						textValue={getOptionTextValue(item)}
						description={item.description}
					>
						{item.label}
					</SelectItem>
				)
			)}
		</HeroUISelect>
	);

	if (!getChangeConfirmation) return selectControl;

	return (
		<div className={cn('relative w-full min-w-0', baseClassName)}>
			{selectControl}
			{/* Anchor the controlled confirmation without nesting two interactive triggers. */}
			<ConfirmPopover
				trigger={
					<button
						type="button"
						tabIndex={-1}
						aria-hidden
						className="pointer-events-none absolute right-4 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
					/>
				}
				isOpen={pendingChange !== null}
				title={pendingChange?.confirmation.title ?? ''}
				description={pendingChange?.confirmation.description}
				confirmLabel={
					pendingChange?.confirmation.confirmLabel ?? '确认更改'
				}
				color="warning"
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingChange(null);
				}}
				onConfirm={() => {
					const nextChange = pendingChange;
					setPendingChange(null);
					if (nextChange) onChange(nextChange.value);
				}}
			/>
		</div>
	);
}
