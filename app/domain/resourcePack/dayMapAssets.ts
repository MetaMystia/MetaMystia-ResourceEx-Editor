/** 返回当前包中的路径；跨包 URI 没有本地文件。 */
export function resolveDayMapAssetPath(
	path: string,
	packLabel: string | undefined
): string | null {
	if (!path.startsWith('rex://')) return path;
	const separator = path.indexOf('/', 6);
	if (separator < 0 || path.slice(6, separator) !== packLabel) return null;
	return path.slice(separator + 1);
}

/** 包内相对路径或 rex:// URI 的路径部分不得为空、绝对或含 `.`、`..` 段。 */
export function isValidAssetPath(path: string): boolean {
	const relative = /^rex:\/\//i.test(path)
		? path.slice(path.indexOf('/', 6) + 1)
		: path;
	return (
		Boolean(relative.trim()) &&
		!relative.startsWith('/') &&
		!relative.includes('\\') &&
		!relative.includes(':') &&
		relative
			.split('/')
			.every((part) => part && part !== '.' && part !== '..')
	);
}
