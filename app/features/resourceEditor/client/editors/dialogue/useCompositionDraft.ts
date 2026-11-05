import {
	type ChangeEvent,
	type CompositionEvent,
	useRef,
	useState,
} from 'react';

type TDraftElement = HTMLInputElement | HTMLTextAreaElement;

interface ICompositionDraftProps {
	value: string;
	onBlur: () => void;
	onChange: (event: ChangeEvent<TDraftElement>) => void;
	onCompositionEnd: (event: CompositionEvent<TDraftElement>) => void;
	onCompositionStart: () => void;
}

/**
 * 输入法组合期间只更新本地草稿，组合结束或失焦时再提交，避免整树重渲染打断组合输入。
 */
export function useCompositionDraft(
	value: string,
	onCommit: (value: string) => void
): ICompositionDraftProps {
	const [draft, setDraft] = useState(value);
	const [syncedValue, setSyncedValue] = useState(value);
	const isComposingRef = useRef(false);
	const lastCommittedRef = useRef(value);

	// 外部修改（恢复、对比页应用等）在非组合状态下同步回草稿
	if (value !== syncedValue) {
		setSyncedValue(value);
		lastCommittedRef.current = value;
		if (!isComposingRef.current) {
			setDraft(value);
		}
	}

	const commit = (next: string) => {
		if (next === lastCommittedRef.current) {
			return;
		}
		lastCommittedRef.current = next;
		onCommit(next);
	};

	return {
		value: draft,
		onBlur: () => {
			isComposingRef.current = false;
			commit(draft);
		},
		onChange: (event) => {
			setDraft(event.target.value);
			if (!isComposingRef.current) {
				commit(event.target.value);
			}
		},
		onCompositionEnd: (event) => {
			isComposingRef.current = false;
			commit(event.currentTarget.value);
		},
		onCompositionStart: () => {
			isComposingRef.current = true;
		},
	};
}
