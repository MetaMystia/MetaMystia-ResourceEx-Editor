import { collectResourcePackAssetReferences } from './assetReferences';
import { isImageAssetPath } from './assetTypes';
import {
	GAME_ID_MAX,
	isValidPackLabel,
	KNOWN_DEPENDENCIES,
	MANAGED_ID_MAX,
	MANAGED_ID_MIN,
	PACK_LABEL_ALLOWED_DESCRIPTION,
	UNMANAGED_ID_MAX,
	UNMANAGED_ID_MIN,
} from './constants';
import type { EventData, EventNodeTrigger } from './contracts/event';
import type { MissionReward } from './contracts/mission';
import type { ResourceEx } from './contracts/resourceEx';
import { resolveDayMapAssetPath } from './dayMapAssets';
import { validateDayMap } from './dayMapValidation';
import { validateGift } from './giftValidation';

export type IssueSeverity = 'error' | 'warning';

export interface IResourcePackValidationIssue {
	severity: IssueSeverity;
	category: string;
	message: string;
}

export interface IValidateResourcePackRulesOptions {
	availableAssetPaths?: ReadonlySet<string>;
	isIdSignatureValid?: boolean;
}

/**
 * 对整个资源包进行全面验证，返回所有问题列表。
 * 只执行同步领域规则；签名验证结果由 feature orchestration 预先计算。
 *
 * @param data 待校验的资源包数据。
 * @param options 可选资产路径集合与预先计算的签名有效性。
 */
export function validateResourcePackRules(
	data: ResourceEx,
	options: IValidateResourcePackRulesOptions = {}
): IResourcePackValidationIssue[] {
	const issues: IResourcePackValidationIssue[] = [];
	const assetSet = options.availableAssetPaths ?? null;
	const checkedAssetReferences = new Set<string>();
	const packLabel = data.packInfo.label;
	const prefix = packLabel ? `_${packLabel}_` : '';

	(data.gifts ?? []).forEach((gift, index) => {
		for (const issue of validateGift(gift, data)) {
			issues.push({
				severity: issue.severity,
				category: '礼物邮箱',
				message: `礼物#${index + 1}“${gift.title || '未命名礼物'}”：${issue.message}`,
			});
		}
	});

	// ── Pack Info ──────────────────────────────────────────
	if (!packLabel) {
		issues.push({
			severity: 'warning',
			category: '基础信息',
			message: '资源包标识符（Label）未设置',
		});
	} else if (
		KNOWN_DEPENDENCIES.some((dependency) => dependency === packLabel)
	) {
		issues.push({
			severity: 'error',
			category: '基础信息',
			message: `资源包标识符（Label）不能使用保留关键字“${packLabel}”`,
		});
	} else if (!isValidPackLabel(packLabel)) {
		issues.push({
			severity: 'error',
			category: '基础信息',
			message: `资源包标识符（Label）“${packLabel}”含非法字符。${PACK_LABEL_ALLOWED_DESCRIPTION}。`,
		});
	}

	const version = data.packInfo.version;
	if (version) {
		const semVerRegex =
			/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
		if (!semVerRegex.test(version)) {
			issues.push({
				severity: 'warning',
				category: '基础信息',
				message: `版本号“${version}”不符合语义化版本规范（SemVer）`,
			});
		}
	}

	// ── ID Signature ──────────────────────────────────────
	const { idRangeStart, idRangeEnd, idSignature } = data.packInfo;
	const hasIdRange = idRangeStart != null && idRangeEnd != null;
	const hasIdRangeStart = idRangeStart != null;
	const hasIdRangeEnd = idRangeEnd != null;

	if (hasIdRangeStart !== hasIdRangeEnd) {
		issues.push({
			severity: 'error',
			category: '基础信息',
			message: 'ID段请同时填写起始和结束',
		});
	} else if (hasIdRange) {
		if (
			!Number.isInteger(idRangeStart) ||
			!Number.isInteger(idRangeEnd) ||
			idRangeStart < MANAGED_ID_MIN ||
			idRangeEnd > MANAGED_ID_MAX ||
			idRangeStart > idRangeEnd
		) {
			issues.push({
				severity: 'error',
				category: '基础信息',
				message: `ID段必须是${MANAGED_ID_MIN}～${MANAGED_ID_MAX}内起始不大于结束的整数范围`,
			});
		}
	}

	if (hasIdRange) {
		if (!idSignature) {
			issues.push({
				severity: 'warning',
				category: '基础信息',
				message: '已设置ID分配段，但缺少签名，ID合法性无法被游戏验证',
			});
		} else if (packLabel) {
			if (options.isIdSignatureValid === false) {
				issues.push({
					severity: 'error',
					category: '基础信息',
					message: `ID段签名无效（资源包标识符（Label）：${packLabel}，分配段：${idRangeStart}～${idRangeEnd}）`,
				});
			}
		}
	}

	// ── Helper: ID validation ─────────────────────────────

	function checkId(id: number, entityType: string, entityName: string): void {
		if (!Number.isFinite(id) || !Number.isInteger(id)) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的ID必须是有限整数`,
			});
		} else if (id < 0 || id > UNMANAGED_ID_MAX) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的ID（${id}）超出有效范围`,
			});
		} else if (id <= GAME_ID_MAX) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的ID（${id}）位于游戏保留段（0～${GAME_ID_MAX}）`,
			});
		} else if (
			id < UNMANAGED_ID_MIN &&
			hasIdRange &&
			(id < idRangeStart! || id > idRangeEnd!)
		) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的ID（${id}）超出已分配的ID段（${idRangeStart}～${idRangeEnd}）`,
			});
		} else if (id >= UNMANAGED_ID_MIN) {
			issues.push({
				severity: 'warning',
				category: entityType,
				message: `${entityName}的ID（${id}）位于不受管理区域`,
			});
		}
	}

	function checkIdDuplicate(
		ids: number[],
		entityType: string,
		getLabel: (index: number) => string,
		valueName = 'ID'
	): void {
		const seen = new Map<number, number>();
		ids.forEach((id, i) => {
			if (seen.has(id)) {
				issues.push({
					severity: 'error',
					category: entityType,
					message: `${getLabel(i)}与${getLabel(seen.get(id)!)}的${valueName}（${id}）重复`,
				});
			} else {
				seen.set(id, i);
			}
		});
	}

	function checkStringDuplicate(
		values: readonly string[],
		entityType: string,
		valueName: string,
		getLabel: (index: number) => string
	): void {
		const seen = new Map<string, number>();
		values.forEach((value, index) => {
			if (!value) return;
			const previousIndex = seen.get(value);
			if (previousIndex !== undefined) {
				issues.push({
					severity: 'error',
					category: entityType,
					message: `${getLabel(index)}与${getLabel(previousIndex)}的${valueName}“${value}”重复`,
				});
				return;
			}
			seen.set(value, index);
		});
	}

	function checkNonNegativeInteger(
		value: number,
		entityType: string,
		valueName: string
	): void {
		if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${valueName}必须是非负整数`,
			});
		}
	}

	function checkPositiveInteger(
		value: number,
		entityType: string,
		valueName: string
	): void {
		if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${valueName}必须是正整数`,
			});
		}
	}

	// ── Helper: string label/name prefix validation ───────
	function checkLabelPrefix(
		label: string,
		entityType: string,
		entityName: string
	): void {
		if (!prefix) return; // no pack label to check
		if (!label) return;
		if (!label.startsWith(prefix)) {
			issues.push({
				severity: 'warning',
				category: entityType,
				message: `${entityName}的标识“${label}”未以“${prefix}”开头`,
			});
		}
	}

	function checkAssetPath(
		path: string,
		entityType: string,
		entityName: string,
		assetPathName: string
	): void {
		if (!path.trim()) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的${assetPathName}不能为空`,
			});
			return;
		}
		if (!isImageAssetPath(path)) {
			issues.push({
				severity: 'warning',
				category: entityType,
				message: `${entityName}的${assetPathName}“${path}”不是受支持的图片文件`,
			});
		}
	}

	function checkAssetPaths(
		paths: readonly string[],
		expectedCount: number,
		entityType: string,
		entityName: string,
		assetName: string
	): void {
		if (paths.length !== expectedCount) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName}的${assetName}应为${expectedCount}张，当前为${paths.length}张`,
			});
		}
		paths.forEach((path, index) =>
			checkAssetPath(
				path,
				entityType,
				entityName,
				`${assetName}#${index + 1}路径`
			)
		);
	}

	const mapNames = (index: number) =>
		data.dayMaps[index]?.name || `地图#${index + 1}`;
	checkIdDuplicate(
		data.dayMaps.map((map) => map.id),
		'白天地图',
		mapNames
	);
	data.dayMaps.forEach((map, index) => {
		checkId(map.id, '白天地图', mapNames(index));
		if (
			map.id >= MANAGED_ID_MIN &&
			map.id <= MANAGED_ID_MAX &&
			(!hasIdRange || !idSignature)
		)
			issues.push({
				severity: 'error',
				category: '白天地图',
				message: `${mapNames(index)}使用受管理 ID，需要分配段和有效签名。`,
			});
		for (const message of validateDayMap(map))
			issues.push({
				severity: 'error',
				category: '白天地图',
				message: `${mapNames(index)}：${message}`,
			});
		for (const path of [
			...map.tiles.map((tile) => tile.image),
			map.mapBGM.intro,
			map.mapBGM.loop,
		]) {
			if (
				path.startsWith('rex://') &&
				resolveDayMapAssetPath(path, packLabel) === null
			) {
				checkedAssetReferences.add(path);
				issues.push({
					severity: 'warning',
					category: '白天地图',
					message: `${mapNames(index)}引用外部资源 ${path}，需要在游戏中核验依赖包。`,
				});
			}
		}
	});
	// ── Characters ────────────────────────────────────────
	const charNames = (i: number) =>
		data.characters[i]?.name || `角色#${i + 1}`;

	checkIdDuplicate(
		data.characters.map((c) => c.id),
		'角色',
		charNames
	);
	checkStringDuplicate(
		data.characters.map((character) => character.label),
		'角色',
		'标签',
		charNames
	);

	data.characters.forEach((char, i) => {
		const name = char.name || `角色#${i + 1}`;

		checkId(char.id, '角色', name);

		// Label must start with _
		if (!char.label.startsWith('_')) {
			issues.push({
				severity: 'error',
				category: '角色',
				message: `${name}的标签“${char.label}”必须以_开头`,
			});
		}

		checkLabelPrefix(char.label, '角色', name);
		const portraitPids = (char.portraits ?? []).map(({ pid }) => pid);
		checkIdDuplicate(
			portraitPids,
			'角色立绘',
			(portraitIndex) => `${name}的立绘#${portraitIndex + 1}`,
			'PID'
		);
		portraitPids.forEach((pid, portraitIndex) =>
			checkNonNegativeInteger(
				pid,
				'角色立绘',
				`${name}的立绘#${portraitIndex + 1}的PID`
			)
		);
		if (
			char.faceInNoteBook !== undefined &&
			!portraitPids.includes(char.faceInNoteBook)
		) {
			issues.push({
				severity: 'error',
				category: '角色立绘',
				message: `${name}的图鉴立绘PID（${char.faceInNoteBook}）不存在`,
			});
		}
		char.portraits?.forEach((portrait, portraitIndex) =>
			checkAssetPath(
				portrait.path,
				'角色',
				name,
				`立绘#${portraitIndex + 1}路径`
			)
		);

		// Sprite set name
		if (char.characterSpriteSetCompact) {
			const {
				eyeSprite,
				mainSprite,
				name: spriteName,
			} = char.characterSpriteSetCompact;
			checkLabelPrefix(spriteName, '角色小人', `${name}的小人名称`);
			checkAssetPaths(mainSprite, 12, '角色小人', name, '主身体贴图');
			checkAssetPaths(eyeSprite, 24, '角色小人', name, '眼睛贴图');
		}

		if (char.guest) {
			const { fundRangeLower, fundRangeUpper } = char.guest;
			checkNonNegativeInteger(
				fundRangeLower,
				'角色顾客配置',
				`${name}的携带金钱下限`
			);
			checkNonNegativeInteger(
				fundRangeUpper,
				'角色顾客配置',
				`${name}的携带金钱上限`
			);
			if (fundRangeLower > fundRangeUpper) {
				issues.push({
					severity: 'error',
					category: '角色顾客配置',
					message: `${name}的携带金钱下限不能大于上限`,
				});
			}
		}
	});

	// ── Dialog Packages ───────────────────────────────────
	const dialogNamesSeen = new Map<string, number>();
	data.dialogPackages.forEach((pkg, i) => {
		const displayName = pkg.name || `对话包#${i + 1}`;
		if (!pkg.name) {
			issues.push({
				severity: 'error',
				category: '对话包',
				message: `${displayName}的名称不能为空`,
			});
		}

		// Duplicate check
		if (pkg.name && dialogNamesSeen.has(pkg.name)) {
			issues.push({
				severity: 'error',
				category: '对话包',
				message: `${displayName}与对话包#${dialogNamesSeen.get(pkg.name)! + 1}的名称重复`,
			});
		} else if (pkg.name) {
			dialogNamesSeen.set(pkg.name, i);
		}

		checkLabelPrefix(pkg.name, '对话包', displayName);
	});

	// ── Dialog Action Sprites ─────────────────────────────
	data.dialogPackages.forEach((pkg, pkgIndex) => {
		const pkgName = pkg.name || `对话包#${pkgIndex + 1}`;
		pkg.dialogList.forEach((dlg, dlgIndex) => {
			(dlg.actions ?? []).forEach((act, actIndex) => {
				const where = `${pkgName}第${dlgIndex + 1}条对话的动作#${actIndex + 1}`;
				const maxJump = pkg.dialogList.length + 1;

				if (act.actionType === 'Branch') {
					if (!act.options || act.options.length === 0) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where}（Branch）至少需要一个选项`,
						});
						return;
					}

					act.options.forEach((option, optionIndex) => {
						const optionWhere = `${where}（Branch）选项#${optionIndex + 1}`;
						const jump = option.jump ?? 1;
						if (!option.text?.trim()) {
							issues.push({
								severity: 'error',
								category: '对话动作',
								message: `${optionWhere}未设置选项文字`,
							});
						}
						if (
							!Number.isInteger(jump) ||
							jump < 1 ||
							jump > maxJump
						) {
							issues.push({
								severity: 'error',
								category: '对话动作',
								message: `${optionWhere}的跳转目标${jump}无效，应为1～${maxJump}`,
							});
						}
						if (
							option.price !== undefined &&
							(!Number.isInteger(option.price) ||
								option.price < 0)
						) {
							issues.push({
								severity: 'error',
								category: '对话动作',
								message: `${optionWhere}的价格必须为空或非负整数`,
							});
						}
					});
					return;
				}

				if (act.actionType === 'Goto') {
					if (
						!Number.isInteger(act.index) ||
						(act.index ?? -1) < 1 ||
						(act.index ?? -1) > maxJump
					) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where}（Goto）的跳转目标${act.index ?? '未设置'}无效，应为1～${maxJump}`,
						});
					}
					return;
				}

				if (act.actionType === 'End') {
					if (
						act.exitCode !== undefined &&
						!Number.isInteger(act.exitCode)
					) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where}（End）的退出码必须是整数或留空`,
						});
					}
					return;
				}

				if (act.actionType === 'Sound') {
					if (!act.sound) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where}（Sound）未设置音频路径（sound）`,
						});
						return;
					}
					if (!act.sound.startsWith('assets/Audio/')) {
						issues.push({
							severity: 'warning',
							category: '对话动作',
							message: `${where}的音频路径（sound）“${act.sound}”未位于推荐目录assets/Audio/`,
						});
					}
					if (!act.sound.toLowerCase().endsWith('.wav')) {
						issues.push({
							severity: 'warning',
							category: '对话动作',
							message: `${where}的音频路径（sound）“${act.sound}”不是.wav文件，MOD目前仅支持.wav`,
						});
					}
					checkedAssetReferences.add(act.sound);
					if (assetSet && !assetSet.has(act.sound)) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where}引用的音频“${act.sound}”在当前项目中不存在`,
						});
					}
					return;
				}

				const isSpriteAction =
					act.actionType === 'CG' || act.actionType === 'BG';
				if (!isSpriteAction) return;

				const isClearing = act.shouldSet === false;
				if (isClearing) {
					if (act.sprite) {
						issues.push({
							severity: 'warning',
							category: '对话动作',
							message: `${where}（${act.actionType}）标记为清空但仍带有贴图路径（sprite）字段，导出时将会丢弃`,
						});
					}
					return;
				}

				if (!act.sprite) {
					issues.push({
						severity: 'error',
						category: '对话动作',
						message: `${where}（${act.actionType}）既未设置贴图路径（sprite）也未标记清空`,
					});
					return;
				}

				const expectedFolder =
					act.actionType === 'CG' ? 'assets/CG/' : 'assets/BG/';
				if (!act.sprite.startsWith(expectedFolder)) {
					issues.push({
						severity: 'warning',
						category: '对话动作',
						message: `${where}的贴图路径（sprite）“${act.sprite}”未位于推荐目录${expectedFolder}`,
					});
				}
				if (!isImageAssetPath(act.sprite)) {
					issues.push({
						severity: 'warning',
						category: '对话动作',
						message: `${where}的贴图路径（sprite）“${act.sprite}”不是受支持的图片文件`,
					});
				}
				if (assetSet && !assetSet.has(act.sprite)) {
					checkedAssetReferences.add(act.sprite);
					issues.push({
						severity: 'error',
						category: '对话动作',
						message: `${where}引用的资产“${act.sprite}”在当前项目中不存在`,
					});
				}
			});
		});
	});

	// ── Mission Nodes ─────────────────────────────────────
	checkStringDuplicate(
		data.missionNodes.map((mission) => mission.label),
		'任务节点',
		'标签',
		(index) =>
			data.missionNodes[index]?.title ||
			data.missionNodes[index]?.debugLabel ||
			`任务#${index + 1}`
	);
	data.missionNodes.forEach((mission, i) => {
		const displayName =
			mission.title || mission.debugLabel || `任务#${i + 1}`;
		if (!mission.label) {
			issues.push({
				severity: 'error',
				category: '任务节点',
				message: `${displayName}的标签不能为空`,
			});
		}

		checkLabelPrefix(mission.label, '任务节点', displayName);
	});

	// ── Event Nodes ───────────────────────────────────────
	checkStringDuplicate(
		data.eventNodes.map((event) => event.label),
		'事件节点',
		'标签',
		(index) => data.eventNodes[index]?.debugLabel || `事件#${index + 1}`
	);
	(data.eventNodes || []).forEach((event, i) => {
		const displayName = event.debugLabel || `事件#${i + 1}`;
		if (!event.label) {
			issues.push({
				severity: 'error',
				category: '事件节点',
				message: `${displayName}的标签不能为空`,
			});
		}

		checkLabelPrefix(event.label, '事件节点', displayName);
	});

	// ── Ingredients ───────────────────────────────────────
	const ingNames = (i: number) =>
		data.ingredients[i]?.name || `食材#${i + 1}`;
	checkIdDuplicate(
		data.ingredients.map((it) => it.id),
		'食材',
		ingNames
	);
	data.ingredients.forEach((it, i) => {
		const name = it.name || `食材#${i + 1}`;
		checkId(it.id, '食材', name);
		if (!Number.isInteger(it.level) || it.level < 1 || it.level > 5) {
			issues.push({
				severity: 'error',
				category: '食材',
				message: `${name}的等级必须是1～5的整数`,
			});
		}
		checkNonNegativeInteger(it.baseValue, '食材', `${name}的价格`);
		checkAssetPath(it.spritePath, '食材', name, '贴图路径（spritePath）');
	});

	// ── Foods ─────────────────────────────────────────────
	const foodNames = (i: number) => data.foods[i]?.name || `料理#${i + 1}`;
	checkIdDuplicate(
		data.foods.map((f) => f.id),
		'料理',
		foodNames
	);
	data.foods.forEach((f, i) => {
		const name = f.name || `料理#${i + 1}`;
		checkId(f.id, '料理', name);
		if (!Number.isInteger(f.level) || f.level < 1 || f.level > 5) {
			issues.push({
				severity: 'error',
				category: '料理',
				message: `${name}的等级必须是1～5的整数`,
			});
		}
		checkNonNegativeInteger(f.baseValue, '料理', `${name}的价格`);
		checkAssetPath(f.spritePath, '料理', name, '贴图路径（spritePath）');
	});

	// ── Beverages ─────────────────────────────────────────
	const bevNames = (i: number) =>
		(data.beverages || [])[i]?.name || `酒水#${i + 1}`;
	checkIdDuplicate(
		(data.beverages || []).map((b) => b.id),
		'酒水',
		bevNames
	);
	(data.beverages || []).forEach((b, i) => {
		const name = b.name || `酒水#${i + 1}`;
		checkId(b.id, '酒水', name);
		if (!Number.isInteger(b.level) || b.level < 1 || b.level > 5) {
			issues.push({
				severity: 'error',
				category: '酒水',
				message: `${name}的等级必须是1～5的整数`,
			});
		}
		checkNonNegativeInteger(b.baseValue, '酒水', `${name}的价格`);
		checkAssetPath(b.spritePath, '酒水', name, '贴图路径（spritePath）');
	});

	// ── Recipes ───────────────────────────────────────────
	const recipeNames = (i: number) =>
		`食谱#${i + 1}（ID：${data.recipes[i]?.id}）`;
	checkIdDuplicate(
		data.recipes.map((r) => r.id),
		'食谱',
		recipeNames
	);
	data.recipes.forEach((r, i) => {
		checkId(r.id, '食谱', `食谱#${i + 1}`);
		if (r.ingredients.length > 5) {
			issues.push({
				severity: 'error',
				category: '食谱',
				message: `食谱#${i + 1}最多只能包含5个食材`,
			});
		}
		checkPositiveInteger(r.cookTime, '食谱', `食谱#${i + 1}的烹饪时间`);
	});

	// ── Merchants ─────────────────────────────────────────
	checkStringDuplicate(
		data.merchants.map((merchant) => merchant.key),
		'商人',
		'Key',
		(index) => `商人#${index + 1}`
	);
	data.merchants.forEach((merchant, merchantIndex) => {
		const name = merchant.key || `商人#${merchantIndex + 1}`;
		if (!merchant.key) {
			issues.push({
				severity: 'error',
				category: '商人',
				message: `${name}未选择角色`,
			});
		}
		if (
			!Number.isFinite(merchant.priceMultiplierMin) ||
			merchant.priceMultiplierMin < 0 ||
			!Number.isFinite(merchant.priceMultiplierMax) ||
			merchant.priceMultiplierMax < merchant.priceMultiplierMin
		) {
			issues.push({
				severity: 'error',
				category: '商人',
				message: `${name}的价格倍率范围无效`,
			});
		}
		checkPositiveInteger(
			merchant.leastSellNum,
			'商人',
			`${name}的最低出售数量`
		);
		merchant.merchandise.forEach((merchandise, merchandiseIndex) => {
			const merchandiseName = `${name}的商品#${merchandiseIndex + 1}`;
			checkNonNegativeInteger(
				merchandise.itemAmountMin,
				'商人',
				`${merchandiseName}的数量下界`
			);
			checkNonNegativeInteger(
				merchandise.itemAmountMax,
				'商人',
				`${merchandiseName}的数量上界`
			);
			if (merchandise.itemAmountMin > merchandise.itemAmountMax) {
				issues.push({
					severity: 'error',
					category: '商人',
					message: `${merchandiseName}的数量下界不能大于上界`,
				});
			}
			if (
				!Number.isFinite(merchandise.sellProbability) ||
				merchandise.sellProbability < 0 ||
				merchandise.sellProbability > 1
			) {
				issues.push({
					severity: 'error',
					category: '商人',
					message: `${merchandiseName}的出售概率必须在0～1之间`,
				});
			}
			checkNonNegativeInteger(
				merchandise.item.productId,
				'商人',
				`${merchandiseName}的商品ID`
			);
			checkPositiveInteger(
				merchandise.item.productAmount,
				'商人',
				`${merchandiseName}的商品数量`
			);
		});
	});

	// ── Clothes ───────────────────────────────────────────
	const clothesNames = (i: number) =>
		(data.clothes || [])[i]?.name || `衣服#${i + 1}`;
	checkIdDuplicate(
		(data.clothes || []).map((c) => c.id),
		'衣服',
		clothesNames
	);
	(data.clothes || []).forEach((c, i) => {
		const name = c.name || `衣服#${i + 1}`;
		checkId(c.id, '衣服', name);
		checkAssetPath(c.spritePath, '衣服', name, '图标路径（spritePath）');
		checkAssetPath(
			c.portraitPath,
			'衣服',
			name,
			'立绘路径（portraitPath）'
		);
		checkAssetPaths(
			c.pixelFullConfig.mainSprite,
			12,
			'衣服小人',
			name,
			'主身体贴图'
		);
		checkAssetPaths(
			c.pixelFullConfig.eyeSprite,
			24,
			'衣服小人',
			name,
			'眼睛贴图'
		);
		checkAssetPaths(
			c.pixelFullConfig.hairSprite,
			12,
			'衣服小人',
			name,
			'头发贴图'
		);
		checkAssetPaths(
			c.pixelFullConfig.backSprite,
			12,
			'衣服小人',
			name,
			'背部贴图'
		);
	});

	// ── Entity references ─────────────────────────────────
	const itemIdSets = {
		Beverage: new Set(data.beverages.map(({ id }) => id)),
		Food: new Set(data.foods.map(({ id }) => id)),
		Ingredient: new Set(data.ingredients.map(({ id }) => id)),
		Recipe: new Set(data.recipes.map(({ id }) => id)),
	};
	const characterIdsByType = new Set(
		data.characters.map(({ id, type }) => `${type}:${id}`)
	);
	const localCharactersByTypeAndId = new Map(
		data.characters.map((character) => [
			`${character.type}:${character.id}`,
			character,
		])
	);
	const characterLabels = new Set(
		data.characters.map(({ label }) => label.trim())
	);
	const dialogPackageNames = new Set(
		data.dialogPackages.map(({ name }) => name.trim())
	);
	const eventLabels = new Set(
		data.eventNodes.map(({ label }) => label.trim())
	);
	const missionLabels = new Set(
		data.missionNodes.map(({ label }) => label.trim())
	);
	const checkedEntityReferences = new Set<string>();

	function reportDanglingReference(message: string): void {
		if (checkedEntityReferences.has(message)) return;
		checkedEntityReferences.add(message);
		issues.push({ severity: 'error', category: '实体引用', message });
	}

	function checkItemReference(
		kind: keyof typeof itemIdSets,
		id: number,
		owner: string
	): void {
		const isBuiltInIngredientId = kind === 'Ingredient' && id === -1;
		if (
			!Number.isFinite(id) ||
			!Number.isInteger(id) ||
			(id < 0 && !isBuiltInIngredientId)
		) {
			reportDanglingReference(`${owner}引用了无效的${kind} ID（${id}）`);
			return;
		}
		if (id <= GAME_ID_MAX || itemIdSets[kind].has(id)) return;
		if (!hasIdRange || id < idRangeStart! || id > idRangeEnd!) {
			return;
		}
		reportDanglingReference(`${owner}引用了不存在的${kind} ID（${id}）`);
	}

	function checkLocalLabelReference(
		label: string | undefined,
		availableLabels: ReadonlySet<string>,
		entityType: string,
		owner: string
	): void {
		const normalizedLabel = label?.trim();
		if (
			!normalizedLabel ||
			!prefix ||
			!normalizedLabel.startsWith(prefix)
		) {
			return;
		}
		if (availableLabels.has(normalizedLabel)) return;
		reportDanglingReference(
			`${owner}引用了不存在的${entityType}“${normalizedLabel}”`
		);
	}

	function checkRewardReferences(
		rewards: readonly MissionReward[] | undefined,
		owner: string
	): void {
		rewards?.forEach((reward) => {
			if (reward.rewardType === 'UpgradeKizunaLevel') {
				if (!reward.rewardId?.trim()) {
					reportDanglingReference(`${owner}的羁绊奖励未选择目标角色`);
					return;
				}
				checkLocalLabelReference(
					reward.rewardId,
					characterLabels,
					'角色',
					owner
				);
			}
			if (reward.rewardType === 'GiveItem') {
				const objectType = reward.objectType;
				if (!objectType) {
					reportDanglingReference(`${owner}的物品奖励未选择物品类型`);
				} else if (
					objectType === 'Beverage' ||
					objectType === 'Food' ||
					objectType === 'Ingredient' ||
					objectType === 'Recipe'
				) {
					reward.rewardIntArray?.forEach((id) =>
						checkItemReference(objectType, id, owner)
					);
				}
				if (!reward.rewardIntArray?.length) {
					reportDanglingReference(`${owner}的物品奖励未添加物品`);
				}
			}
		});
	}

	function checkCharacterTriggerReference(
		trigger: EventNodeTrigger | undefined,
		owner: string
	): void {
		if (
			trigger?.triggerType !== 'KizunaCheckPoint' &&
			trigger?.triggerType !== 'OnTalkWithCharacter'
		) {
			return;
		}
		if (!trigger.triggerId?.trim()) {
			reportDanglingReference(`${owner}未选择目标角色`);
			return;
		}
		checkLocalLabelReference(
			trigger.triggerId,
			characterLabels,
			'角色',
			owner
		);
	}

	function checkEventData(
		eventData: EventData | undefined,
		owner: string
	): void {
		if (eventData?.eventType !== 'Dialog') return;
		if (!eventData.dialogPackageName?.trim()) {
			reportDanglingReference(`${owner}的对话事件未选择对话包`);
			return;
		}
		checkLocalLabelReference(
			eventData.dialogPackageName,
			dialogPackageNames,
			'对话包',
			owner
		);
	}

	function checkRequiredNonNegativeInteger(
		value: number | undefined,
		valueName: string,
		owner: string
	): void {
		if (
			value === undefined ||
			!Number.isFinite(value) ||
			!Number.isInteger(value) ||
			value < 0
		) {
			reportDanglingReference(`${owner}的${valueName}必须是非负整数`);
		}
	}

	function checkRequiredPositiveInteger(
		value: number | undefined,
		valueName: string,
		owner: string
	): void {
		if (
			value === undefined ||
			!Number.isFinite(value) ||
			!Number.isInteger(value) ||
			value < 1
		) {
			reportDanglingReference(`${owner}的${valueName}必须是正整数`);
		}
	}

	function checkRequiredInteger(
		value: number | undefined,
		valueName: string,
		owner: string
	): void {
		if (
			value === undefined ||
			!Number.isFinite(value) ||
			!Number.isInteger(value)
		) {
			reportDanglingReference(`${owner}的${valueName}必须是整数`);
		}
	}

	function checkMissionCondition(
		condition: ResourceEx['missionNodes'][number]['finishConditions'][number],
		owner: string
	): void {
		switch (condition.conditionType) {
			case 'SubmitItem':
				if (!condition.productType?.trim()) {
					reportDanglingReference(`${owner}未选择物品类型`);
				}
				if (condition.productId === undefined) {
					reportDanglingReference(`${owner}未选择物品`);
				}
				checkRequiredPositiveInteger(
					condition.productAmount,
					'数量',
					owner
				);
				break;
			case 'ServeInWork':
				if (!condition.sellableType?.trim()) {
					reportDanglingReference(`${owner}未选择可交付类型`);
				}
				if (!condition.label?.trim()) {
					reportDanglingReference(`${owner}未选择目标角色`);
				}
				if (condition.amount === undefined) {
					reportDanglingReference(`${owner}未选择指定料理`);
				}
				break;
			case 'SubmitByTag':
				if (!condition.sellableType?.trim()) {
					reportDanglingReference(`${owner}未选择可交付类型`);
				}
				checkRequiredInteger(condition.tag, '标签', owner);
				checkRequiredNonNegativeInteger(
					condition.amount,
					'数量',
					owner
				);
				break;
			case 'SubmitByTags':
			case 'SubmitByAnyOneTag':
				if (!condition.sellableType?.trim()) {
					reportDanglingReference(`${owner}未选择可交付类型`);
				}
				if (!condition.tags?.length) {
					reportDanglingReference(`${owner}未选择标签`);
				}
				checkRequiredNonNegativeInteger(
					condition.amount,
					'数量',
					owner
				);
				break;
			case 'SubmitByIngredients':
				if (!condition.tags?.length) {
					reportDanglingReference(`${owner}未选择食材`);
				}
				checkRequiredNonNegativeInteger(
					condition.amount,
					'数量',
					owner
				);
				break;
			case 'ReachTargetCharacterKisunaLevel':
				if (!condition.label?.trim()) {
					reportDanglingReference(`${owner}未选择目标角色`);
				}
				if (
					condition.amount === undefined ||
					!Number.isInteger(condition.amount) ||
					condition.amount < 0 ||
					condition.amount > 5
				) {
					reportDanglingReference(
						`${owner}的羁绊等级必须是0～5的整数`
					);
				}
				break;
			case 'BillRepayment':
				checkRequiredPositiveInteger(
					condition.amount,
					'偿还金额',
					owner
				);
				break;
			case 'TalkWithCharacter':
				if (!condition.label?.trim()) {
					reportDanglingReference(`${owner}未选择目标角色`);
				}
				break;
		}
	}

	data.recipes.forEach((recipe) => {
		const owner = `食谱ID（${recipe.id}）`;
		checkItemReference('Food', recipe.foodId, owner);
		recipe.ingredients.forEach((id) =>
			checkItemReference('Ingredient', id, owner)
		);
	});

	data.dialogPackages.forEach((dialogPackage) =>
		dialogPackage.dialogList.forEach((dialog) => {
			const characterKey = `${dialog.characterType}:${dialog.characterId}`;
			if (
				hasIdRange &&
				dialog.characterId >= idRangeStart! &&
				dialog.characterId <= idRangeEnd! &&
				!characterIdsByType.has(
					`${dialog.characterType}:${dialog.characterId}`
				)
			) {
				reportDanglingReference(
					`对话包“${dialogPackage.name}”引用了不存在的角色（${dialog.characterType}:${dialog.characterId}）`
				);
			}
			const localCharacter = localCharactersByTypeAndId.get(characterKey);
			if (
				localCharacter &&
				!(localCharacter.portraits ?? []).some(
					(portrait) => portrait.pid === dialog.pid
				)
			) {
				reportDanglingReference(
					`对话包“${dialogPackage.name}”引用了${localCharacter.name}不存在的立绘PID（${dialog.pid}）`
				);
			}
		})
	);

	data.merchants.forEach((merchant) => {
		checkLocalLabelReference(
			merchant.key,
			characterLabels,
			'角色',
			`商人“${merchant.key}”`
		);
		[
			...merchant.welcomeDialogPackageNames,
			...merchant.nullDialogPackageNames,
		].forEach((name) =>
			checkLocalLabelReference(
				name,
				dialogPackageNames,
				'对话包',
				`商人“${merchant.key}”`
			)
		);
		merchant.merchandise.forEach(({ item }) => {
			if (
				item.productType === 'Beverage' ||
				item.productType === 'Food' ||
				item.productType === 'Ingredient' ||
				item.productType === 'Recipe'
			) {
				checkItemReference(
					item.productType,
					item.productId,
					`商人“${merchant.key}”`
				);
			}
		});
	});

	data.characters.forEach((character) => {
		Object.entries(character.kizuna ?? {}).forEach(([field, value]) => {
			if (Array.isArray(value)) {
				value.forEach((name) => {
					if (typeof name !== 'string') return;
					checkLocalLabelReference(
						name,
						dialogPackageNames,
						'对话包',
						`角色“${character.name}”的${field}`
					);
				});
			} else if (
				typeof value === 'string' &&
				field.endsWith('PrerequisiteEvent')
			) {
				checkLocalLabelReference(
					value,
					eventLabels,
					'事件',
					`角色“${character.name}”的${field}`
				);
			}
		});
	});

	data.missionNodes.forEach((mission) => {
		const owner = `任务“${mission.label}”`;
		[mission.sender, mission.reciever].forEach((label) =>
			checkLocalLabelReference(label, characterLabels, '角色', owner)
		);
		mission.finishConditions.forEach((condition, conditionIndex) => {
			const conditionOwner = `${owner}的完成条件#${conditionIndex + 1}`;
			checkMissionCondition(condition, conditionOwner);
			if (
				condition.conditionType === 'SubmitItem' &&
				condition.productId !== undefined &&
				(condition.productType === 'Beverage' ||
					condition.productType === 'Food' ||
					condition.productType === 'Ingredient' ||
					condition.productType === 'Recipe')
			) {
				checkItemReference(
					condition.productType,
					condition.productId,
					owner
				);
			}
			if (
				condition.conditionType === 'ServeInWork' &&
				condition.amount !== undefined
			) {
				checkItemReference('Food', condition.amount, owner);
			}
			if (condition.conditionType === 'SubmitByIngredients') {
				condition.tags?.forEach((id) =>
					checkItemReference('Ingredient', id, owner)
				);
			}
			if (
				condition.conditionType === 'TalkWithCharacter' ||
				condition.conditionType === 'ReachTargetCharacterKisunaLevel' ||
				condition.conditionType === 'ServeInWork'
			) {
				checkLocalLabelReference(
					condition.label,
					characterLabels,
					'角色',
					owner
				);
			}
		});
		const hasBillRepayment = mission.finishConditions.some(
			(condition) => condition.conditionType === 'BillRepayment'
		);
		if (hasBillRepayment) {
			if (!mission.isTimedMission) {
				reportDanglingReference(`${owner}的还债任务必须启用限时任务`);
			}
			if (mission.reciever !== '') {
				reportDanglingReference(`${owner}的还债任务接收者必须留空`);
			}
			if (!mission.missionTimeLimit?.time) {
				reportDanglingReference(`${owner}缺少任务时限`);
			} else {
				const { time } = mission.missionTimeLimit;
				if (mission.missionTimeLimit.triggerType !== 'OnWorkEnd') {
					reportDanglingReference(
						`${owner}的任务时限触发类型必须是OnWorkEnd`
					);
				}
				if (time.dayCalcType === 'Constant') {
					checkRequiredNonNegativeInteger(
						time.day,
						'任务时限天数',
						owner
					);
				} else {
					checkRequiredNonNegativeInteger(
						time.dayRangeMin,
						'任务时限最小天数',
						owner
					);
					checkRequiredNonNegativeInteger(
						time.dayRangeMax,
						'任务时限最大天数',
						owner
					);
					if (
						time.dayRangeMin !== undefined &&
						time.dayRangeMax !== undefined &&
						time.dayRangeMin > time.dayRangeMax
					) {
						reportDanglingReference(
							`${owner}的任务时限最小天数不能大于最大天数`
						);
					}
				}
			}
		}
		checkRewardReferences(mission.rewards, owner);
		checkRewardReferences(mission.postRewards, owner);
		mission.postMissionsAfterPerformance?.forEach((label, index) => {
			if (!label) {
				reportDanglingReference(
					`${owner}的后继任务#${index + 1}未选择任务`
				);
				return;
			}
			checkLocalLabelReference(label, missionLabels, '任务', owner);
		});
		mission.postEvents?.forEach((label, index) => {
			if (!label) {
				reportDanglingReference(
					`${owner}的后继事件#${index + 1}未选择事件`
				);
				return;
			}
			checkLocalLabelReference(label, eventLabels, '事件', owner);
		});
		[mission.missionFinishEvent, mission.missionFailedEvent].forEach(
			(eventData) => checkEventData(eventData, owner)
		);
		checkCharacterTriggerReference(mission.missionTimeLimit, owner);
	});

	data.eventNodes.forEach((eventNode) => {
		const owner = `事件“${eventNode.label}”`;
		checkRewardReferences(eventNode.rewards, owner);
		checkRewardReferences(eventNode.postRewards, owner);
		eventNode.postMissionsAfterPerformance?.forEach((label, index) => {
			if (!label) {
				reportDanglingReference(
					`${owner}的后继任务#${index + 1}未选择任务`
				);
				return;
			}
			checkLocalLabelReference(label, missionLabels, '任务', owner);
		});
		eventNode.postEvents?.forEach((label, index) => {
			if (!label) {
				reportDanglingReference(
					`${owner}的后继事件#${index + 1}未选择事件`
				);
				return;
			}
			checkLocalLabelReference(label, eventLabels, '事件', owner);
		});
		checkEventData(eventNode.scheduledEvent?.eventData, owner);
		checkCharacterTriggerReference(
			eventNode.scheduledEvent?.trigger,
			owner
		);
	});

	if (assetSet) {
		for (const path of collectResourcePackAssetReferences(data)) {
			if (checkedAssetReferences.has(path) || assetSet.has(path))
				continue;
			issues.push({
				severity: 'error',
				category: '资产引用',
				message: `引用的资产“${path}”在当前项目中不存在`,
			});
		}
	}

	return issues;
}
