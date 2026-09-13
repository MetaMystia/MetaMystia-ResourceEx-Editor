/** 对齐 Mod 的 WAV 解码器：PCM 8/16/24/32 位或 IEEE float 32 位。 */
export function validateDayMapWav(buffer: ArrayBuffer): string | null {
	const view = new DataView(buffer);
	const text = (offset: number) =>
		String.fromCharCode(...new Uint8Array(buffer, offset, 4));
	if (buffer.byteLength < 44 || text(0) !== 'RIFF' || text(8) !== 'WAVE')
		return '文件不是有效 RIFF/WAVE。';
	let formatOffset = -1;
	for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
		const kind = text(offset);
		const size = view.getUint32(offset + 4, true);
		const start = offset + 8;
		if (start + size > buffer.byteLength) return 'WAV 数据块不完整。';
		if (kind === 'fmt ') {
			if (size < 16) return 'WAV 格式块不完整。';
			formatOffset = start;
		}
		if (kind === 'data') {
			if (formatOffset < 0) return 'WAV 缺少前置 fmt 块。';
			const format = view.getUint16(formatOffset, true);
			const channels = view.getUint16(formatOffset + 2, true);
			const rate = view.getUint32(formatOffset + 4, true);
			const bits = view.getUint16(formatOffset + 14, true);
			if (
				!(
					(format === 1 && [8, 16, 24, 32].includes(bits)) ||
					(format === 3 && bits === 32)
				)
			)
				return 'Mod 仅支持 PCM 8/16/24/32 位或 IEEE float 32 位 WAV。';
			const frameSize = (channels * bits) / 8;
			if (
				channels < 1 ||
				rate < 1 ||
				size < frameSize ||
				size % frameSize !== 0
			)
				return 'WAV 声道、采样率或样本长度无效。';
			return null;
		}
		offset = start + size + (size & 1);
	}
	return 'WAV 缺少 data 块。';
}
