/**
 * 检查 ResourceEx 资源包目录：node scripts/checkResourcePack.ts <资源包目录>
 *
 * 复用编辑器导出时的校验规则。需要 Node.js 22.18 或更高版本。
 * 存在 error 时退出码为 1，warning 不影响退出码。
 * 在 GitHub Actions 中输出注释，并把完整列表写入运行摘要。
 */
import {
	appendFileSync,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIRECTORY = fileURLToPath(new URL('../app/', import.meta.url));

function isFile(filePath: string): boolean {
	return existsSync(filePath) && statSync(filePath).isFile();
}

// 编辑器源码使用 `@/` 别名、无扩展名导入、`client-only` 标记和 PEM 文本导入。
registerHooks({
	load(url, context, nextLoad) {
		if (!url.endsWith('.pem')) return nextLoad(url, context);
		const text = readFileSync(fileURLToPath(url), 'utf8');
		return {
			format: 'module',
			shortCircuit: true,
			source: `export default ${JSON.stringify(text)};`,
		};
	},
	resolve(specifier, context, nextResolve) {
		if (specifier === 'client-only') {
			return { shortCircuit: true, url: 'data:text/javascript,' };
		}
		const parentUrl = context.parentURL;
		const basePath = specifier.startsWith('@/')
			? path.join(APP_DIRECTORY, specifier.slice(2))
			: specifier.startsWith('.') && parentUrl?.startsWith('file:')
				? fileURLToPath(new URL(specifier, parentUrl))
				: null;
		const filePath =
			basePath === null
				? undefined
				: [
						basePath,
						`${basePath}.ts`,
						path.join(basePath, 'index.ts'),
					].find(isFile);
		return filePath
			? { shortCircuit: true, url: pathToFileURL(filePath).href }
			: nextResolve(specifier, context);
	},
});

const [
	{ verifyIdRange },
	{ normalizeResourcePack },
	{ validateResourcePackRules },
] = await Promise.all([
	import('../app/infrastructure/browser/crypto/idRangeSignature.ts'),
	import('../app/domain/resourcePack/normalization.ts'),
	import('../app/domain/resourcePack/validation.ts'),
]);

type TIssue = ReturnType<typeof validateResourcePackRules>[number];
type TItems = NonNullable<
	NonNullable<Parameters<typeof validateResourcePackRules>[1]>['items']
>;

function collectFiles(directory: string, root: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory()
			? collectFiles(entryPath, root)
			: [path.relative(root, entryPath).split(path.sep).join('/')];
	});
}

/** 编辑器模型尚未包含顶层 `items`，从原始 JSON 读取。 */
function readItems(raw: Record<string, unknown>, issues: TIssue[]): TItems {
	const value = raw['items'] ?? [];
	if (!Array.isArray(value)) {
		issues.push({
			category: '物品',
			message: 'items必须是数组',
			severity: 'error',
		});
		return [];
	}
	return value.flatMap((item: unknown, index) => {
		const record =
			typeof item === 'object' && item !== null
				? (item as Record<string, unknown>)
				: {};
		const id = record['id'];
		const name = record['name'];
		const description = record['description'] ?? '';
		const spritePath = record['spritePath'] ?? '';
		if (
			typeof id !== 'number' ||
			typeof name !== 'string' ||
			typeof description !== 'string' ||
			typeof spritePath !== 'string'
		) {
			issues.push({
				category: '物品',
				message: `items[${index}]须包含数字id和字符串name，description与spritePath须为字符串`,
				severity: 'error',
			});
			return [];
		}
		return [{ description, id, name, spritePath }];
	});
}

async function checkResourcePack(packDirectory: string): Promise<TIssue[]> {
	const issues: TIssue[] = [];
	let raw: unknown;
	try {
		raw = JSON.parse(
			readFileSync(path.join(packDirectory, 'ResourceEx.json'), 'utf8')
		);
	} catch (error) {
		return [
			{
				category: '资源包',
				message: `无法读取ResourceEx.json：${error instanceof Error ? error.message : String(error)}`,
				severity: 'error',
			},
		];
	}
	let resourcePack: ReturnType<typeof normalizeResourcePack>;
	try {
		resourcePack = normalizeResourcePack(raw);
	} catch (error) {
		return [
			{
				category: '资源包',
				message: `ResourceEx.json结构错误：${error instanceof Error ? error.message : String(error)}`,
				severity: 'error',
			},
		];
	}
	const rawRecord = raw as Record<string, unknown>;
	const items = readItems(rawRecord, issues);
	// 发布包只包含 assets/ 目录。
	const assetPaths = new Set(
		collectFiles(path.join(packDirectory, 'assets'), packDirectory)
	);

	// `characters[].avatar` 暂未被游戏和编辑器读取，需要显示头像时再启用。
	// const characters = rawRecord['characters'];
	// (Array.isArray(characters) ? characters : []).forEach(
	// 	(character: unknown, index) => {
	// 		const avatar = (character as Record<string, unknown> | null)?.[
	// 			'avatar'
	// 		];
	// 		if (typeof avatar === 'string' && avatar && !assetPaths.has(avatar))
	// 			issues.push({
	// 				category: '资产引用',
	// 				message: `角色#${index + 1}的头像“${avatar}”不存在`,
	// 				severity: 'error',
	// 			});
	// 	}
	// );

	const { idRangeEnd, idRangeStart, idSignature, label } =
		resourcePack.packInfo;
	const isIdSignatureValid =
		label && idRangeStart != null && idRangeEnd != null && idSignature
			? await verifyIdRange(label, idRangeStart, idRangeEnd, idSignature)
			: undefined;
	issues.push(
		...validateResourcePackRules(resourcePack, {
			availableAssetPaths: assetPaths,
			items,
			...(isIdSignatureValid === undefined ? {} : { isIdSignatureValid }),
		})
	);
	return issues;
}

function escapeCommandData(value: string): string {
	return value
		.replaceAll('%', '%25')
		.replaceAll('\r', '%0D')
		.replaceAll('\n', '%0A');
}

function escapeTableCell(value: string): string {
	return value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
}

const issues = (await checkResourcePack(path.resolve(process.argv[2] ?? '.')))
	.slice()
	.sort((a, b) =>
		a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1
	);
const errorCount = issues.filter(({ severity }) => severity === 'error').length;
const warningCount = issues.length - errorCount;
const isGitHubActions = process.env['GITHUB_ACTIONS'] === 'true';
const severityNames = { error: '错误', warning: '警告' } as const;

for (const { category, message, severity } of issues) {
	console.log(
		isGitHubActions
			? `::${severity} title=${escapeCommandData(category).replaceAll(':', '%3A').replaceAll(',', '%2C')}::${escapeCommandData(message)}`
			: `${severityNames[severity]} [${category}] ${message}`
	);
}
console.log(`资源包检查完成：${errorCount} 个错误，${warningCount} 个警告。`);

const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
if (summaryPath) {
	appendFileSync(
		summaryPath,
		[
			'## 资源包检查',
			'',
			`${errorCount} 个错误，${warningCount} 个警告。`,
			...(issues.length > 0
				? [
						'',
						'| 级别 | 类别 | 说明 |',
						'| --- | --- | --- |',
						...issues.map(
							({ category, message, severity }) =>
								`| ${severityNames[severity]} | ${escapeTableCell(category)} | ${escapeTableCell(message)} |`
						),
					]
				: []),
			'',
		].join('\n')
	);
}

process.exitCode = errorCount > 0 ? 1 : 0;
