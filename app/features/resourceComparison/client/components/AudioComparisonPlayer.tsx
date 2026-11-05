'use client';

import {
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { TYPOGRAPHY_STYLES } from '@/design/theme/styles/typography';
import Button from '@/design/ui/components/button';
import Switch from '@/design/ui/components/switch';

import {
	type IComparisonAudioDecoder,
	type TComparisonAudioDecodeResult,
} from '@/features/resourceComparison/client/audio/decodeComparisonAudio';
import { type IAssetComparisonNode } from '@/features/resourceComparison/client/files/assetComparisonTree';
import { EmptyState } from '@/features/resourceEditor/client/components/layout/EmptyState';
import { WarningNotice } from '@/features/resourceEditor/client/components/status/WarningNotice';

import { ComparisonFileMetadata } from './BinaryComparisonDetail';

interface IProps {
	audioDecoder: IComparisonAudioDecoder | null;
	leftUrl?: string;
	node: IAssetComparisonNode;
	rightUrl?: string;
}

type TAudioSide = 'left' | 'right';

const RANGE_CLASS_NAME =
	'h-1 flex-1 cursor-pointer appearance-none rounded-full bg-default-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-content1 disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary';

function formatDuration(duration: number) {
	if (!Number.isFinite(duration) || duration < 0) return '未知';
	const minutes = Math.floor(duration / 60);
	const seconds = duration - minutes * 60;
	return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function Waveform({
	label,
	result,
}: {
	label: string;
	result: TComparisonAudioDecodeResult | undefined;
}) {
	if (!result) {
		return (
			<p className={TYPOGRAPHY_STYLES.subtleDescription}>正在分析波形…</p>
		);
	}
	if (result.status === 'fallback') {
		return <WarningNotice>无法生成波形：{result.error}</WarningNotice>;
	}
	const width = result.waveform.length;
	const height = 64;
	const upper = result.waveform.map(
		(amplitude, index) =>
			`${index},${height / 2 - amplitude * (height / 2 - 3)}`
	);
	const lower = [...result.waveform]
		.reverse()
		.map((amplitude, reverseIndex) => {
			const index = width - reverseIndex - 1;
			return `${index},${height / 2 + amplitude * (height / 2 - 3)}`;
		});
	return (
		<svg
			role="img"
			aria-label={`${label}波形`}
			viewBox={`0 0 ${Math.max(width - 1, 1)} ${height}`}
			className="aspect-[4/1] w-full rounded-medium border border-divider bg-content2/30 text-primary"
			preserveAspectRatio="none"
		>
			<polygon
				points={[...upper, ...lower].join(' ')}
				fill="currentColor"
				fillOpacity="0.45"
			/>
		</svg>
	);
}

function DecodedAudioMetadata({
	result,
}: {
	result: TComparisonAudioDecodeResult | undefined;
}) {
	if (!result || result.status === 'fallback') return null;
	return (
		<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
			<dt className={TYPOGRAPHY_STYLES.metadata}>时长</dt>
			<dd className={TYPOGRAPHY_STYLES.compactBody}>
				{formatDuration(result.duration)}
			</dd>
			<dt className={TYPOGRAPHY_STYLES.metadata}>采样率</dt>
			<dd className={TYPOGRAPHY_STYLES.compactBody}>
				{result.sampleRate.toLocaleString('zh-CN')} Hz
			</dd>
			<dt className={TYPOGRAPHY_STYLES.metadata}>声道</dt>
			<dd className={TYPOGRAPHY_STYLES.compactBody}>
				{result.channelCount}
			</dd>
		</dl>
	);
}

export function AudioComparisonPlayer({
	audioDecoder,
	leftUrl,
	node,
	rightUrl,
}: IProps) {
	const leftAudioRef = useRef<HTMLAudioElement>(null);
	const rightAudioRef = useRef<HTMLAudioElement>(null);
	const isSynchronizingRef = useRef(false);
	const seekRangeId = useId();
	const [leftDecode, setLeftDecode] =
		useState<TComparisonAudioDecodeResult>();
	const [rightDecode, setRightDecode] =
		useState<TComparisonAudioDecodeResult>();
	const [isSynchronized, setIsSynchronized] = useState(false);
	const [activeSide, setActiveSide] = useState<TAudioSide>('left');
	const [isLoopEnabled, setIsLoopEnabled] = useState(false);
	const [loopStart, setLoopStart] = useState(0);
	const [loopEnd, setLoopEnd] = useState(0);
	const [playbackError, setPlaybackError] = useState<string | null>(null);
	const [seekTime, setSeekTime] = useState(0);

	useLayoutEffect(() => {
		const audioElements = [leftAudioRef.current, rightAudioRef.current];
		return () => {
			for (const audio of audioElements) {
				if (!audio) continue;
				audio.pause();
				audio.removeAttribute('src');
				audio.load();
			}
		};
	}, [leftUrl, node.path, rightUrl]);

	useEffect(() => {
		setLeftDecode(undefined);
		setRightDecode(undefined);
		setActiveSide(node.leftBlob ? 'left' : 'right');
		setIsSynchronized(false);
		setIsLoopEnabled(false);
		setLoopStart(0);
		setLoopEnd(0);
		setPlaybackError(null);
		if (!audioDecoder) return;
		const controller = new AbortController();
		if (node.leftBlob) {
			void audioDecoder
				.decode(node.leftBlob, controller.signal)
				.then((result) => {
					if (!controller.signal.aborted) setLeftDecode(result);
				})
				.catch((error: unknown) => {
					if (
						!controller.signal.aborted &&
						!(
							error instanceof DOMException &&
							error.name === 'AbortError'
						)
					) {
						setLeftDecode({
							error:
								error instanceof Error
									? error.message
									: String(error),
							status: 'fallback',
						});
					}
				});
		}
		if (node.rightBlob) {
			void audioDecoder
				.decode(node.rightBlob, controller.signal)
				.then((result) => {
					if (!controller.signal.aborted) setRightDecode(result);
				})
				.catch((error: unknown) => {
					if (
						!controller.signal.aborted &&
						!(
							error instanceof DOMException &&
							error.name === 'AbortError'
						)
					) {
						setRightDecode({
							error:
								error instanceof Error
									? error.message
									: String(error),
							status: 'fallback',
						});
					}
				});
		}
		return () => controller.abort();
	}, [audioDecoder, node.leftBlob, node.path, node.rightBlob]);

	const availableDurations = useMemo(
		() =>
			[leftDecode, rightDecode]
				.filter(
					(
						result
					): result is Extract<
						TComparisonAudioDecodeResult,
						{ status: 'decoded' }
					> => result?.status === 'decoded'
				)
				.map((result) => result.duration)
				.filter((duration) => duration > 0),
		[leftDecode, rightDecode]
	);
	const timelineDuration =
		availableDurations.length > 1
			? Math.min(...availableDurations)
			: (availableDurations[0] ?? 0);

	useEffect(() => {
		setLoopStart(0);
		setLoopEnd(timelineDuration);
		setSeekTime(0);
	}, [node.path, timelineDuration]);

	const readAudio = (side: TAudioSide) =>
		side === 'left' ? leftAudioRef.current : rightAudioRef.current;
	const runSynchronized = async (
		sourceSide: TAudioSide,
		action: 'pause' | 'play' | 'seek'
	) => {
		if (!isSynchronized || isSynchronizingRef.current) return;
		const source = readAudio(sourceSide);
		const target = readAudio(sourceSide === 'left' ? 'right' : 'left');
		if (!source || !target) return;
		const sourceTime = source.currentTime;
		if (
			action === 'seek' &&
			Math.abs(target.currentTime - sourceTime) <= 0.01
		) {
			return;
		}
		isSynchronizingRef.current = true;
		try {
			if (Math.abs(target.currentTime - sourceTime) > 0.01) {
				target.currentTime = sourceTime;
			}
			if (action === 'play') await target.play();
			if (action === 'pause') target.pause();
		} catch (error) {
			setPlaybackError(
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			queueMicrotask(() => {
				isSynchronizingRef.current = false;
			});
		}
	};
	const playBoth = async () => {
		const leftAudio = leftAudioRef.current;
		const rightAudio = rightAudioRef.current;
		if (!leftAudio || !rightAudio) return;
		setPlaybackError(null);
		const targetTime =
			activeSide === 'left'
				? leftAudio.currentTime
				: rightAudio.currentTime;
		leftAudio.currentTime = targetTime;
		rightAudio.currentTime = targetTime;
		try {
			await Promise.all([leftAudio.play(), rightAudio.play()]);
		} catch (error) {
			setPlaybackError(
				error instanceof Error ? error.message : String(error)
			);
		}
	};
	const pauseBoth = () => {
		leftAudioRef.current?.pause();
		rightAudioRef.current?.pause();
	};
	const switchActiveSide = async () => {
		const source = readAudio(activeSide);
		const nextSide = activeSide === 'left' ? 'right' : 'left';
		const target = readAudio(nextSide);
		if (!source || !target) return;
		const shouldResume = !source.paused;
		target.currentTime = source.currentTime;
		source.pause();
		setActiveSide(nextSide);
		if (!shouldResume) return;
		try {
			await target.play();
		} catch (error) {
			setPlaybackError(
				error instanceof Error ? error.message : String(error)
			);
		}
	};
	const seekBoth = (time: number) => {
		setSeekTime(time);
		if (leftAudioRef.current) leftAudioRef.current.currentTime = time;
		if (rightAudioRef.current) rightAudioRef.current.currentTime = time;
	};
	const handleTimeUpdate = (side: TAudioSide) => {
		if (!isLoopEnabled || loopEnd <= loopStart) return;
		const audio = readAudio(side);
		if (!audio || audio.currentTime < loopEnd) return;
		audio.currentTime = loopStart;
		if (!audio.paused) void audio.play().catch(() => undefined);
	};

	const renderAudioSide = (
		side: TAudioSide,
		label: string,
		url: string | undefined,
		decode: TComparisonAudioDecodeResult | undefined
	) => {
		const ref = side === 'left' ? leftAudioRef : rightAudioRef;
		const blob = side === 'left' ? node.leftBlob : node.rightBlob;
		const analyzedFile =
			side === 'left' ? node.analysis?.left : node.analysis?.right;
		return (
			<div className="flex min-w-0 flex-col gap-3">
				<p className={TYPOGRAPHY_STYLES.compactTitle}>
					{label}
					{activeSide === side ? ' · 当前A/B' : ''}
				</p>
				{!blob ? (
					<EmptyState title="此版本不存在" variant="text" />
				) : url ? (
					<>
						<audio
							ref={ref}
							aria-label={`${label}音频`}
							controls
							preload="none"
							src={url}
							className="h-10 w-full"
							onPause={() => void runSynchronized(side, 'pause')}
							onPlay={() => void runSynchronized(side, 'play')}
							onSeeked={() => void runSynchronized(side, 'seek')}
							onTimeUpdate={() => handleTimeUpdate(side)}
						/>
						<Waveform label={label} result={decode} />
						<DecodedAudioMetadata result={decode} />
						<ComparisonFileMetadata
							analyzedFile={analyzedFile}
							blob={blob}
							label={`${label}文件`}
						/>
					</>
				) : (
					<p className={TYPOGRAPHY_STYLES.subtleDescription}>
						正在准备音频预览…
					</p>
				)}
			</div>
		);
	};

	const canControlBoth = Boolean(leftUrl && rightUrl);
	return (
		<div className="flex min-h-0 flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Switch
					isSelected={isSynchronized}
					onValueChange={setIsSynchronized}
					isDisabled={!canControlBoth}
				>
					同步控制
				</Switch>
				<Button
					size="sm"
					variant="flat"
					isDisabled={!canControlBoth}
					onPress={() => void playBoth()}
				>
					同步播放
				</Button>
				<Button
					size="sm"
					variant="light"
					isDisabled={!canControlBoth}
					onPress={pauseBoth}
				>
					同步暂停
				</Button>
				<Button
					size="sm"
					variant="flat"
					isDisabled={!canControlBoth}
					onPress={() => void switchActiveSide()}
				>
					A/B切换至{activeSide === 'left' ? '新版' : '旧版'}
				</Button>
				<Switch
					isSelected={isLoopEnabled}
					onValueChange={setIsLoopEnabled}
					isDisabled={timelineDuration <= 0}
				>
					循环片段
				</Switch>
			</div>

			<div className="flex flex-col gap-3 rounded-medium border border-divider bg-content2/30 p-3">
				<label
					htmlFor={seekRangeId}
					className={TYPOGRAPHY_STYLES.compactDescription}
				>
					同步定位 · 最长 {formatDuration(timelineDuration)}
				</label>
				<input
					id={seekRangeId}
					type="range"
					min="0"
					max={timelineDuration || 1}
					step="0.01"
					value={seekTime}
					disabled={!canControlBoth || timelineDuration <= 0}
					onChange={(event) => seekBoth(Number(event.target.value))}
					className={RANGE_CLASS_NAME}
				/>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label className={TYPOGRAPHY_STYLES.compactDescription}>
						循环起点 {formatDuration(loopStart)}
						<input
							type="range"
							aria-label="循环起点"
							min="0"
							max={timelineDuration || 1}
							step="0.01"
							value={loopStart}
							disabled={timelineDuration <= 0}
							onChange={(event) =>
								setLoopStart(
									Math.min(
										Number(event.target.value),
										loopEnd
									)
								)
							}
							className={`${RANGE_CLASS_NAME} mt-2 w-full`}
						/>
					</label>
					<label className={TYPOGRAPHY_STYLES.compactDescription}>
						循环终点 {formatDuration(loopEnd)}
						<input
							type="range"
							aria-label="循环终点"
							min="0"
							max={timelineDuration || 1}
							step="0.01"
							value={loopEnd}
							disabled={timelineDuration <= 0}
							onChange={(event) =>
								setLoopEnd(
									Math.max(
										Number(event.target.value),
										loopStart
									)
								)
							}
							className={`${RANGE_CLASS_NAME} mt-2 w-full`}
						/>
					</label>
				</div>
			</div>

			{playbackError && <WarningNotice>{playbackError}</WarningNotice>}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{renderAudioSide('left', '旧版', leftUrl, leftDecode)}
				{renderAudioSide('right', '新版', rightUrl, rightDecode)}
			</div>
		</div>
	);
}
