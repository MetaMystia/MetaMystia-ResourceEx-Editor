import Button from '@/design/ui/components/button';
import Input from '@/design/ui/components/input';
import Switch from '@/design/ui/components/switch';
import Textarea from '@/design/ui/components/textarea';

import type { ISpellConfig } from '@/domain/resourcePack/contracts/spell';

import { EditorSection } from '@/features/resourceEditor/client/components/layout/EditorSection';
import { Select } from '@/features/resourceEditor/client/components/select/Select';
import { parseIntegerInput } from '@/features/resourceEditor/client/editorValueAllocation';
import { useResourceEditor } from '@/features/resourceEditor/client/state/useResourceEditor';

import { SpellAssetField } from './SpellAssetField';

interface IProps {
	spell: ISpellConfig;
	onUpdate(spell: ISpellConfig): void;
}

export function SpellEditor({ spell, onUpdate }: IProps) {
	const { resourcePack } = useResourceEditor();
	return (
		<>
			<EditorSection title="所属角色与实现">
				<Input
					label="所属角色 ID"
					type="number"
					value={String(spell.id)}
					onValueChange={(raw) => {
						const id = parseIntegerInput(raw);
						if (id !== null) onUpdate({ ...spell, id });
					}}
				/>
				<Select<number>
					ariaLabel="选择所属角色"
					value={spell.id}
					items={resourcePack.characters.map((character) => ({
						value: character.id,
						label: `[${character.id}] ${character.name}`,
					}))}
					onChange={(id) => onUpdate({ ...spell, id })}
				/>
				<Input
					label="符卡实现名"
					description="填写 Mod 已注册的实现名，例如 Mai。符卡效果由 Mod 代码决定。"
					value={spell.implementation}
					onValueChange={(implementation) =>
						onUpdate({ ...spell, implementation })
					}
				/>
			</EditorSection>
			{(['positive', 'negative'] as const).map((kind) => {
				const card = spell[kind];
				const label =
					kind === 'positive'
						? '奖励符卡（红卡）'
						: '惩罚符卡（黑卡）';
				return (
					<EditorSection key={kind} title={label}>
						<Input
							label={`${label}名称`}
							value={card.name}
							onValueChange={(name) =>
								onUpdate({
									...spell,
									[kind]: { ...card, name },
								})
							}
						/>
						<Textarea
							label={`${label}说明`}
							value={card.description}
							onValueChange={(description) =>
								onUpdate({
									...spell,
									[kind]: { ...card, description },
								})
							}
						/>
						<SpellAssetField
							label={`${label}立绘路径`}
							path={card.portrait}
							isImage
							onChange={(portrait) =>
								onUpdate({
									...spell,
									[kind]: { ...card, portrait },
								})
							}
						/>
					</EditorSection>
				);
			})}
			<EditorSection title="宣言立绘锚点">
				<Switch
					isSelected={spell.portrayalPivot != null}
					onValueChange={(enabled) => {
						const { portrayalPivot, ...rest } = spell;
						onUpdate(
							enabled
								? {
										...rest,
										portrayalPivot: portrayalPivot ?? [
											0.497, 0.644,
										],
									}
								: rest
						);
					}}
				>
					自定义锚点
				</Switch>
				{spell.portrayalPivot != null && (
					<div className="grid grid-cols-2 gap-3">
						{['X', 'Y'].map((axis, index) => (
							<Input
								key={axis}
								label={`锚点 ${axis}`}
								type="number"
								min={0}
								max={1}
								step={0.001}
								value={String(
									spell.portrayalPivot?.[index] ?? ''
								)}
								onValueChange={(raw) => {
									if (!raw.trim()) return;
									const value = Number(raw);
									if (Number.isFinite(value))
										onUpdate({
											...spell,
											portrayalPivot: [
												index === 0
													? value
													: (spell
															.portrayalPivot?.[0] ??
														0.497),
												index === 1
													? value
													: (spell
															.portrayalPivot?.[1] ??
														0.644),
											],
										});
								}}
							/>
						))}
					</div>
				)}
				<p className="text-sm text-foreground-500">
					关闭时使用 Mod 默认锚点；坐标范围为 0～1。
				</p>
			</EditorSection>
			<EditorSection title="特效包（可选）">
				<SpellAssetField
					label="特效包路径"
					path={spell.vfxBundle ?? ''}
					onChange={(vfxBundle) => {
						const { vfxBundle: previous, ...rest } = spell;
						void previous;
						onUpdate(vfxBundle ? { ...rest, vfxBundle } : rest);
					}}
				/>
				<p className="text-sm text-foreground-500">
					选择文件后，需在「特效包」中声明同一路径。无特效的实现可留空，Mai
					需要特效包和 Buff 11002、11003。
				</p>
				{spell.vfxBundle &&
					!resourcePack.assetBundles.some(
						(bundle) => bundle.path === spell.vfxBundle
					) && <DeclareBundle path={spell.vfxBundle} />}
			</EditorSection>
		</>
	);
}

function DeclareBundle({ path }: { path: string }) {
	const { updateResourcePack } = useResourceEditor();
	return (
		<Button
			variant="flat"
			onPress={() =>
				updateResourcePack((current) =>
					current.assetBundles.some((bundle) => bundle.path === path)
						? current
						: {
								...current,
								assetBundles: [
									...current.assetBundles,
									{ path },
								],
							}
				)
			}
		>
			添加特效包声明
		</Button>
	);
}
