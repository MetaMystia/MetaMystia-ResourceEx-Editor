import type { ResourceEx } from './contracts/resourceEx';
import { resolveDayMapAssetPath } from './dayMapAssets';
import { type IResourcePackValidationIssue } from './validation';

export function validateSpellResources(
	data: ResourceEx,
	assetSet?: ReadonlySet<string>
): IResourcePackValidationIssue[] {
	const issues: IResourcePackValidationIssue[] = [];
	const report = (
		category: string,
		message: string,
		severity: 'error' | 'warning' = 'error'
	) => issues.push({ category, message, severity });
	const resolve = (path: string) =>
		resolveDayMapAssetPath(path, data.packInfo.label);
	function checkPath(
		path: string,
		category: string,
		owner: string,
		isImage = false
	) {
		const local = resolve(path);
		const relative = /^rex:\/\//i.test(path)
			? path.slice(path.indexOf('/', 6) + 1)
			: path;
		if (
			!relative.trim() ||
			relative.startsWith('/') ||
			relative.includes('\\') ||
			relative.includes(':') ||
			relative
				.split('/')
				.some((part) => !part || part === '.' || part === '..')
		) {
			report(category, `${owner}的资源路径无效：${path}`);
			return;
		}
		if (isImage && !path.toLowerCase().endsWith('.png'))
			report(category, `${owner}建议使用 PNG 图片。`, 'warning');
		if (local === null)
			report(
				category,
				`${owner}引用外部资源 ${path}，需在游戏中核验依赖包。`,
				'warning'
			);
		else if (assetSet && !assetSet.has(local))
			report(category, `${owner}引用的文件不存在：${path}`);
	}
	const bundlePaths = data.assetBundles.map(
		(bundle) => resolve(bundle.path) ?? bundle.path
	);
	data.assetBundles.forEach((bundle, index) => {
		checkPath(bundle.path, '特效包', `特效包#${index + 1}`);
		if (bundlePaths.indexOf(bundlePaths[index] ?? '') !== index)
			report('特效包', `特效包重复声明：${bundle.path}`);
	});
	data.spells.forEach((spell) => {
		const owner = `符卡 ${spell.id}`;
		if (
			!data.characters.some(
				(character) =>
					character.id === spell.id && character.label.trim()
			)
		)
			report('符卡', `${owner}找不到本包中具有标识符的所属角色。`);
		if (!spell.implementation.trim())
			report('符卡', `${owner}未填写实现名。`);
		else if (spell.implementation !== 'Mai')
			report(
				'符卡',
				`${owner}的实现“${spell.implementation}”需确认已在目标 Mod 中注册。`,
				'warning'
			);
		for (const kind of ['positive', 'negative'] as const) {
			const card = spell[kind];
			const label = kind === 'positive' ? '红卡' : '黑卡';
			if (!card.name.trim() || !card.description.trim())
				report('符卡', `${owner}的${label}名称与说明不能为空。`);
			checkPath(card.portrait, '符卡', `${owner}${label}立绘`, true);
		}
		if (
			spell.portrayalPivot != null &&
			(spell.portrayalPivot.length !== 2 ||
				spell.portrayalPivot.some(
					(value) => !Number.isFinite(value) || value < 0 || value > 1
				))
		)
			report('符卡', `${owner}的锚点须为两个 0～1 的有限数值。`);
		if (spell.vfxBundle) {
			checkPath(spell.vfxBundle, '符卡', `${owner}特效包`);
			if (
				!bundlePaths.includes(
					resolve(spell.vfxBundle) ?? spell.vfxBundle
				)
			)
				report('符卡', `${owner}的特效包未在 assetBundles 中声明。`);
		}
		if (spell.implementation === 'Mai') {
			if (!spell.vfxBundle?.trim())
				report('符卡', `${owner}的 Mai 实现需要特效包。`);
			for (const id of [11002, 11003]) {
				if (
					!data.buffs.some(
						(buff) =>
							buff.id === id &&
							buff.name.trim() &&
							buff.description.trim() &&
							buff.icon.trim()
					)
				)
					report(
						'符卡',
						`${owner}的 Mai 实现需要完整的 Buff ${id}；若由依赖包提供，需在游戏中核验。`,
						'warning'
					);
			}
		}
	});
	data.buffs.forEach((buff) => {
		if (!buff.name.trim() || !buff.description.trim())
			report('Buff', `Buff ${buff.id}的名称与说明不能为空。`);
		checkPath(buff.icon, 'Buff', `Buff ${buff.id}图标`, true);
	});
	return issues;
}
