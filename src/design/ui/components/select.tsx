'use client';

import {
	type Key,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react';

import { DropdownSection } from '@heroui/dropdown';

import Dropdown, {
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
} from './dropdown';
import { cn } from '@/design/ui/utils';

export type SelectValue = string | number;

export interface ISelectOption<V extends SelectValue = SelectValue> {
	value: V;
	label: ReactNode;
	/** 用于无障碍和键盘搜索；默认使用 String(label)。 */
	textValue?: string;
	description?: ReactNode;
	isDisabled?: boolean;
}

export interface ISelectSection<V extends SelectValue = SelectValue> {
	section: string;
	options: ISelectOption<V>[];
}

export type SelectItem<V extends SelectValue = SelectValue> =
	| ISelectOption<V>
	| ISelectSection<V>;

export interface ISelectProps<V extends SelectValue = SelectValue> {
	value: V | undefined;
	onChange: (value: V) => void;
	items: SelectItem<V>[];
	/** 未选中时显示的占位文本。 */
	placeholder?: string;
	/** 无障碍标签；当没有外部 <label htmlFor> 关联时强烈建议传入。 */
	ariaLabel?: string;
	size?: 'sm' | 'md';
	/** 触发器额外类名，会与默认表单输入风格合并。 */
	className?: string;
	/** 完全覆盖触发器类名；提供时不再附加默认风格。 */
	classNameOverride?: string;
	isInvalid?: boolean;
	isDisabled?: boolean;
	id?: string;
	/** 弹出菜单的最大高度（Tailwind 类，默认 max-h-80）。 */
	menuMaxHeightClass?: string;
}

function isSection<V extends SelectValue>(
	item: SelectItem<V>
): item is ISelectSection<V> {
	return (item as ISelectSection<V>).section !== undefined;
}

function flattenOptions<V extends SelectValue>(
	items: SelectItem<V>[]
): ISelectOption<V>[] {
	const out: ISelectOption<V>[] = [];
	for (const it of items) {
		if (isSection(it)) out.push(...it.options);
		else out.push(it);
	}
	return out;
}

const ChevronIcon = () => (
	<svg
		viewBox="0 0 20 20"
		fill="currentColor"
		className="h-4 w-4 shrink-0 opacity-60"
		aria-hidden="true"
	>
		<path
			fillRule="evenodd"
			d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
			clipRule="evenodd"
		/>
	</svg>
);

/**
 * 受控的下拉选择组件，基于 HeroUI Dropdown 实现，避免原生 <select>/<option>
 * 在浏览器原生菜单层无法继承应用主题颜色的问题（夜间模式下白底白字）。
 *
 * - 支持扁平选项与分组（optgroup → ISelectSection）。
 * - value/onChange 完全受控；支持 string / number。
 * - 触发器默认沿用项目通用的表单输入风格，可通过 className 微调或
 *   classNameOverride 完全替换。
 */
export function Select<V extends SelectValue = SelectValue>({
	value,
	onChange,
	items,
	placeholder = '请选择...',
	ariaLabel,
	size = 'md',
	className,
	classNameOverride,
	isInvalid,
	isDisabled,
	id,
	menuMaxHeightClass = 'max-h-80',
}: ISelectProps<V>) {
	const fallbackId = useId();
	const buttonId = id ?? fallbackId;

	const lookup = useMemo(() => {
		const map = new Map<string, ISelectOption<V>>();
		for (const opt of flattenOptions(items)) {
			map.set(String(opt.value), opt);
		}
		return map;
	}, [items]);

	const selectedKey = value !== undefined ? String(value) : undefined;
	const selectedOption = selectedKey ? lookup.get(selectedKey) : undefined;

	const disabledKeys = useMemo(() => {
		const keys: string[] = [];
		for (const opt of flattenOptions(items)) {
			if (opt.isDisabled) keys.push(String(opt.value));
		}
		return keys;
	}, [items]);

	const handleAction = useCallback(
		(key: Key) => {
			const entry = lookup.get(String(key));
			if (entry && !entry.isDisabled) onChange(entry.value);
		},
		[lookup, onChange]
	);

	const sizeClass =
		size === 'sm' ? 'h-8 px-2 text-xs gap-1' : 'h-9 px-3 text-sm gap-2';

	const defaultTriggerClass = cn(
		'flex w-full items-center justify-between rounded-lg border bg-white/40 py-2 text-foreground outline-none transition-all dark:bg-black/10',
		'focus:border-black/30 focus:ring-2 focus:ring-black/10 dark:focus:border-white/30 dark:focus:ring-white/10',
		'disabled:cursor-not-allowed disabled:opacity-50',
		sizeClass,
		isInvalid
			? 'border-danger focus:border-danger'
			: 'border-black/10 dark:border-white/10'
	);

	const triggerClass =
		classNameOverride ?? cn(defaultTriggerClass, className);

	const menuAriaLabel =
		ariaLabel ?? (typeof placeholder === 'string' ? placeholder : 'Select');

	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const [menuMinWidth, setMenuMinWidth] = useState<number | undefined>(
		undefined
	);
	useEffect(() => {
		const el = triggerRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const update = () => setMenuMinWidth(el.getBoundingClientRect().width);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<Dropdown {...(isDisabled ? { isDisabled: true } : {})}>
			<DropdownTrigger>
				<button
					ref={triggerRef}
					id={buttonId}
					type="button"
					disabled={isDisabled}
					aria-label={ariaLabel}
					className={triggerClass}
				>
					<span
						className={cn(
							'min-w-0 flex-1 truncate text-left',
							!selectedOption && 'text-foreground/40'
						)}
					>
						{selectedOption ? selectedOption.label : placeholder}
					</span>
					<ChevronIcon />
				</button>
			</DropdownTrigger>
			<DropdownMenu
				aria-label={menuAriaLabel}
				selectionMode="single"
				selectedKeys={
					selectedKey ? new Set([selectedKey]) : new Set<string>()
				}
				disabledKeys={new Set(disabledKeys)}
				onAction={handleAction}
				className={cn(menuMaxHeightClass, 'overflow-y-auto')}
				style={
					menuMinWidth !== undefined
						? { minWidth: menuMinWidth }
						: undefined
				}
			>
				{items.map((item, idx) => {
					if (isSection(item)) {
						return (
							<DropdownSection
								key={`__section_${idx}`}
								title={item.section}
								showDivider={idx < items.length - 1}
							>
								{item.options.map((opt) => (
									<DropdownItem
										key={String(opt.value)}
										textValue={
											opt.textValue ??
											(typeof opt.label === 'string'
												? opt.label
												: String(opt.value))
										}
										description={opt.description}
									>
										{opt.label}
									</DropdownItem>
								))}
							</DropdownSection>
						);
					}
					return (
						<DropdownItem
							key={String(item.value)}
							textValue={
								item.textValue ??
								(typeof item.label === 'string'
									? item.label
									: String(item.value))
							}
							description={item.description}
						>
							{item.label}
						</DropdownItem>
					);
				})}
			</DropdownMenu>
		</Dropdown>
	);
}

export default Select;
