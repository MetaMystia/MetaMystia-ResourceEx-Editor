import type { ResourceEx } from '@/types/resource';
import {
	GAME_ID_MAX,
	UNMANAGED_ID_MIN,
	UNMANAGED_ID_MAX,
	verifyIdRange,
} from '@/lib/crypto';
import {
	isValidPackLabel,
	PACK_LABEL_ALLOWED_DESCRIPTION,
} from '@/lib/constants';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
	severity: IssueSeverity;
	category: string;
	message: string;
}

/**
 * 对整个资源包进行全面验证，返回所有问题列表。
 * 不依赖 React hooks，签名验证为异步操作。
 *
 * @param data 待校验的资源包数据。
 * @param availableAssetPaths 当前项目内已存在的资产路径集合（来自 DataContext.assetUrls）。
 *   传入后可校验 dialog action 等模块对 sprite 的引用是否实际存在。
 *   未传入时跳过资产存在性检查，保持向后兼容。
 */
export async function validateResourcePack(
	data: ResourceEx,
	availableAssetPaths?: Iterable<string>
): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];
	const assetSet = availableAssetPaths ? new Set(availableAssetPaths) : null;
	const packLabel = data.packInfo.label;
	const prefix = packLabel ? `_${packLabel}_` : '';

	// ── Pack Info ──────────────────────────────────────────
	if (!packLabel) {
		issues.push({
			severity: 'warning',
			category: '基础信息',
			message: '资源包 Label 未设置',
		});
	} else if (!isValidPackLabel(packLabel)) {
		issues.push({
			severity: 'error',
			category: '基础信息',
			message: `资源包 Label "${packLabel}" 含非法字符。${PACK_LABEL_ALLOWED_DESCRIPTION}。`,
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
				message: `版本号 "${version}" 不符合语义化版本规范 (SemVer)`,
			});
		}
	}

	// ── ID Signature ──────────────────────────────────────
	const { idRangeStart, idRangeEnd, idSignature } = data.packInfo;
	const hasIdRange = idRangeStart != null && idRangeEnd != null;

	if (hasIdRange) {
		if (!idSignature) {
			issues.push({
				severity: 'warning',
				category: '基础信息',
				message:
					'已设置 ID 分配段，但缺少签名，ID 合法性无法被游戏验证',
			});
		} else if (packLabel) {
			const ok = await verifyIdRange(
				packLabel,
				idRangeStart!,
				idRangeEnd!,
				idSignature
			);
			if (!ok) {
				issues.push({
					severity: 'error',
					category: '基础信息',
					message: `ID 段签名无效（Label: ${packLabel}, 分配段: ${idRangeStart}–${idRangeEnd}）`,
				});
			}
		}
	}

	// ── Helper: ID validation ─────────────────────────────

	function checkId(id: number, entityType: string, entityName: string): void {
		if (id < 0 || id > UNMANAGED_ID_MAX) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName} 的 ID (${id}) 超出有效范围`,
			});
		} else if (id <= GAME_ID_MAX) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName} 的 ID (${id}) 位于游戏保留段 (0–${GAME_ID_MAX})`,
			});
		} else if (
			id < UNMANAGED_ID_MIN &&
			hasIdRange &&
			(id < idRangeStart! || id > idRangeEnd!)
		) {
			issues.push({
				severity: 'error',
				category: entityType,
				message: `${entityName} 的 ID (${id}) 超出已分配的 ID 段 (${idRangeStart}–${idRangeEnd})`,
			});
		} else if (id >= UNMANAGED_ID_MIN) {
			issues.push({
				severity: 'warning',
				category: entityType,
				message: `${entityName} 的 ID (${id}) 位于不受管理区域`,
			});
		}
	}

	function checkIdDuplicate(
		ids: number[],
		entityType: string,
		getLabel: (index: number) => string
	): void {
		const seen = new Map<number, number>();
		ids.forEach((id, i) => {
			if (seen.has(id)) {
				issues.push({
					severity: 'error',
					category: entityType,
					message: `${getLabel(i)} 与 ${getLabel(seen.get(id)!)} 的 ID (${id}) 重复`,
				});
			} else {
				seen.set(id, i);
			}
		});
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
				message: `${entityName} 的标识 "${label}" 未以 "${prefix}" 开头`,
			});
		}
	}

	// ── Characters ────────────────────────────────────────
	const charNames = (i: number) =>
		data.characters[i]?.name || `角色#${i + 1}`;

	checkIdDuplicate(
		data.characters.map((c) => c.id),
		'角色',
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
				message: `${name} 的标签 "${char.label}" 必须以 _ 开头`,
			});
		}

		checkLabelPrefix(char.label, '角色', name);

		// Sprite set name
		if (char.characterSpriteSetCompact) {
			const spriteName = char.characterSpriteSetCompact.name;
			checkLabelPrefix(spriteName, '角色小人', `${name} 的小人名称`);
		}
	});

	// ── Dialog Packages ───────────────────────────────────
	const dialogNamesSeen = new Map<string, number>();
	data.dialogPackages.forEach((pkg, i) => {
		const displayName = pkg.name || `对话包#${i + 1}`;

		// Duplicate check
		if (pkg.name && dialogNamesSeen.has(pkg.name)) {
			issues.push({
				severity: 'error',
				category: '对话包',
				message: `${displayName} 与 对话包#${dialogNamesSeen.get(pkg.name)! + 1} 的名称重复`,
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
				const where = `${pkgName} 第 ${dlgIndex + 1} 条对话的动作 #${actIndex + 1}`;

				if (act.actionType === 'Sound') {
					if (!act.sound) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where} (Sound) 未设置 sound 路径`,
						});
						return;
					}
					if (!act.sound.startsWith('assets/Audio/')) {
						issues.push({
							severity: 'warning',
							category: '对话动作',
							message: `${where} 的 sound "${act.sound}" 未位于推荐目录 assets/Audio/`,
						});
					}
					if (!act.sound.toLowerCase().endsWith('.wav')) {
						issues.push({
							severity: 'warning',
							category: '对话动作',
							message: `${where} 的 sound "${act.sound}" 不是 .wav 文件，MOD 目前仅支持 .wav`,
						});
					}
					if (assetSet && !assetSet.has(act.sound)) {
						issues.push({
							severity: 'error',
							category: '对话动作',
							message: `${where} 引用的音频 "${act.sound}" 在当前项目中不存在`,
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
							message: `${where} (${act.actionType}) 标记为清空但仍带有 sprite 字段，导出时将会丢弃`,
						});
					}
					return;
				}

				if (!act.sprite) {
					issues.push({
						severity: 'error',
						category: '对话动作',
						message: `${where} (${act.actionType}) 既未设置 sprite 也未标记清空`,
					});
					return;
				}

				const expectedFolder =
					act.actionType === 'CG' ? 'assets/CG/' : 'assets/BG/';
				if (!act.sprite.startsWith(expectedFolder)) {
					issues.push({
						severity: 'warning',
						category: '对话动作',
						message: `${where} 的 sprite "${act.sprite}" 未位于推荐目录 ${expectedFolder}`,
					});
				}

				if (assetSet && !assetSet.has(act.sprite)) {
					issues.push({
						severity: 'error',
						category: '对话动作',
						message: `${where} 引用的资产 "${act.sprite}" 在当前项目中不存在`,
					});
				}
			});
		});
	});

	// ── Mission Nodes ─────────────────────────────────────
	data.missionNodes.forEach((mission, i) => {
		const displayName =
			mission.title || mission.debugLabel || `任务#${i + 1}`;

		checkLabelPrefix(mission.label, '任务节点', displayName);
	});

	// ── Event Nodes ───────────────────────────────────────
	(data.eventNodes || []).forEach((event, i) => {
		const displayName = event.debugLabel || `事件#${i + 1}`;

		checkLabelPrefix(event.label, '事件节点', displayName);
	});

	// ── Ingredients ───────────────────────────────────────
	const ingNames = (i: number) =>
		data.ingredients[i]?.name || `原料#${i + 1}`;
	checkIdDuplicate(
		data.ingredients.map((it) => it.id),
		'原料',
		ingNames
	);
	data.ingredients.forEach((it, i) => {
		checkId(it.id, '原料', it.name || `原料#${i + 1}`);
	});

	// ── Foods ─────────────────────────────────────────────
	const foodNames = (i: number) => data.foods[i]?.name || `料理#${i + 1}`;
	checkIdDuplicate(
		data.foods.map((f) => f.id),
		'料理',
		foodNames
	);
	data.foods.forEach((f, i) => {
		checkId(f.id, '料理', f.name || `料理#${i + 1}`);
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
		checkId(b.id, '酒水', b.name || `酒水#${i + 1}`);
	});

	// ── Recipes ───────────────────────────────────────────
	const recipeNames = (i: number) =>
		`菜谱#${i + 1}(ID:${data.recipes[i]?.id})`;
	checkIdDuplicate(
		data.recipes.map((r) => r.id),
		'菜谱',
		recipeNames
	);
	data.recipes.forEach((r, i) => {
		checkId(r.id, '菜谱', `菜谱#${i + 1}`);
	});

	// ── Clothes ───────────────────────────────────────────
	const clothesNames = (i: number) =>
		(data.clothes || [])[i]?.name || `服装#${i + 1}`;
	checkIdDuplicate(
		(data.clothes || []).map((c) => c.id),
		'服装',
		clothesNames
	);
	(data.clothes || []).forEach((c, i) => {
		checkId(c.id, '服装', c.name || `服装#${i + 1}`);
	});

	return issues;
}
