import { cn } from '@heroui/theme';
import {
	createContext,
	memo,
	type PropsWithChildren,
	useCallback,
	useContext,
	useState,
} from 'react';

type TEditorDetailKey = number | string | null | undefined;

const EditorDetailKeyContext = createContext<TEditorDetailKey>(undefined);

interface IProps {
	className?: string;
	contentClassName?: string;
	columns?: 1 | 2 | 3 | 4;
	detailKey?: TEditorDetailKey;
}

export const EditorWorkspace = memo<PropsWithChildren<IProps>>(
	function EditorWorkspace({
		children,
		className,
		columns = 3,
		contentClassName,
		detailKey,
	}) {
		return (
			<EditorDetailKeyContext.Provider value={detailKey}>
				<div className={cn('flex flex-col', className)}>
					<div
						className={cn(
							'container mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:py-8',
							columns === 1
								? 'max-w-4xl'
								: 'max-w-7xl 3xl:max-w-screen-2xl 4xl:max-w-screen-3xl'
						)}
					>
						<div
							className={cn(
								'grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:gap-8',
								columns === 2 && 'lg:grid-cols-2',
								columns === 3 && 'lg:grid-cols-3',
								columns === 4 && 'lg:grid-cols-4',
								contentClassName
							)}
						>
							{children}
						</div>
					</div>
				</div>
			</EditorDetailKeyContext.Provider>
		);
	}
);

export function useEditorDetailKey() {
	return useContext(EditorDetailKeyContext);
}

export function useEditorSelection() {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [detailRevision, setDetailRevision] = useState(0);

	const replaceSelection = useCallback((nextIndex: number | null) => {
		setDetailRevision((currentRevision) => currentRevision + 1);
		setSelectedIndex(nextIndex);
	}, []);

	return {
		detailKey:
			selectedIndex === null
				? null
				: `${selectedIndex}:${detailRevision}`,
		replaceSelection,
		selectedIndex,
		setSelectedIndex,
	};
}
