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
