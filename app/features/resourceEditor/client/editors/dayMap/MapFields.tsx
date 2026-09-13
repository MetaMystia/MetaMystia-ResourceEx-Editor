'use client';

import { type ReactNode, useEffect, useState } from 'react';

import Input from '@/design/ui/components/input';

export function MapSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3 rounded-medium border border-divider bg-content1 p-3">
			<h3 className="text-sm font-semibold">{title}</h3>
			{children}
		</section>
	);
}

export function MapNumber({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
}: {
	label: string;
	value: number;
	onChange(value: number): void;
	min?: number;
	max?: number;
	step?: number;
}) {
	const [draft, setDraft] = useState(String(value));
	const [isInvalid, setIsInvalid] = useState(false);
	useEffect(() => {
		setDraft(String(value));
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
	return (
		<Input
			labelPlacement="outside"
			label={label}
			size="sm"
			type="number"
			value={draft}
			step={step}
			{...(min === undefined ? {} : { min })}
			{...(max === undefined ? {} : { max })}
			isInvalid={isInvalid}
			errorMessage={isInvalid ? '请输入范围内的有效数值' : undefined}
			onValueChange={setDraft}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
				if (event.key === 'Escape') {
					setDraft(String(value));
					setIsInvalid(false);
				}
			}}
		/>
	);
}

export function MapVector({
	labels,
	values,
	onChange,
	min,
	max,
	step = 0.1,
}: {
	labels: string[];
	values: number[];
	onChange(value: number[]): void;
	min?: number;
	max?: number;
	step?: number;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{labels.map((label, index) => (
				<MapNumber
					key={label}
					label={label}
					value={values[index] ?? 0}
					{...(min === undefined ? {} : { min })}
					{...(max === undefined ? {} : { max })}
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
