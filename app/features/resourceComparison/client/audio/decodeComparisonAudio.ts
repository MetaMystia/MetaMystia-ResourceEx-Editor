import 'client-only';

export interface IComparisonDecodedAudio {
	channelCount: number;
	duration: number;
	sampleRate: number;
	status: 'decoded';
	waveform: readonly number[];
}

export interface IComparisonAudioFallback {
	error: string;
	status: 'fallback';
}

export type TComparisonAudioDecodeResult =
	IComparisonAudioFallback | IComparisonDecodedAudio;

export interface IComparisonAudioDecoder {
	decode(
		blob: Blob,
		signal?: AbortSignal
	): Promise<TComparisonAudioDecodeResult>;
	dispose(): Promise<void>;
}

export interface IComparisonAudioDecoderOptions {
	createAudioContext?: () => AudioContext;
	waveformPoints?: number;
}

const DEFAULT_WAVEFORM_POINTS = 256;

function createAbortError() {
	return new DOMException('音频分析已取消', 'AbortError');
}

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function createWaveform(
	audioBuffer: AudioBuffer,
	waveformPoints: number
): readonly number[] {
	const waveform = Array.from({ length: waveformPoints }, (_, pointIndex) => {
		const startIndex = Math.floor(
			(pointIndex * audioBuffer.length) / waveformPoints
		);
		const endIndex = Math.max(
			startIndex + 1,
			Math.floor(((pointIndex + 1) * audioBuffer.length) / waveformPoints)
		);
		let peak = 0;
		for (
			let channelIndex = 0;
			channelIndex < audioBuffer.numberOfChannels;
			channelIndex += 1
		) {
			const samples = audioBuffer.getChannelData(channelIndex);
			for (
				let sampleIndex = startIndex;
				sampleIndex < Math.min(endIndex, samples.length);
				sampleIndex += 1
			) {
				peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
			}
		}
		return peak;
	});
	return Object.freeze(waveform);
}

export function createComparisonAudioDecoder(
	options: IComparisonAudioDecoderOptions = {}
): IComparisonAudioDecoder {
	const waveformPoints = options.waveformPoints ?? DEFAULT_WAVEFORM_POINTS;
	if (!Number.isSafeInteger(waveformPoints) || waveformPoints <= 0) {
		throw new Error('波形采样点数量必须是正整数。');
	}
	const createAudioContext =
		options.createAudioContext ?? (() => new AudioContext());
	let audioContext: AudioContext | null = null;
	let disposePromise: Promise<void> | null = null;
	let isDisposed = false;

	const readAudioContext = () => {
		if (isDisposed) throw createAbortError();
		audioContext ??= createAudioContext();
		return audioContext;
	};

	return {
		async decode(blob, signal) {
			if (isDisposed || signal?.aborted) throw createAbortError();
			try {
				const arrayBuffer = await blob.arrayBuffer();
				if (isDisposed || signal?.aborted) throw createAbortError();
				const decoded = await readAudioContext().decodeAudioData(
					arrayBuffer.slice(0)
				);
				if (isDisposed || signal?.aborted) throw createAbortError();
				return {
					channelCount: decoded.numberOfChannels,
					duration: decoded.duration,
					sampleRate: decoded.sampleRate,
					status: 'decoded',
					waveform: createWaveform(decoded, waveformPoints),
				};
			} catch (error) {
				if (isDisposed || signal?.aborted) throw createAbortError();
				return { error: describeError(error), status: 'fallback' };
			}
		},
		dispose() {
			if (disposePromise) return disposePromise;
			isDisposed = true;
			const context = audioContext;
			audioContext = null;
			disposePromise = context
				? context.close().catch(() => undefined)
				: Promise.resolve();
			return disposePromise;
		},
	};
}
