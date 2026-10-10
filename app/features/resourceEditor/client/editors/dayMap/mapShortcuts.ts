import { getOverlayCoordinatorSnapshot } from '@/features/overlays/client/store';

export function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLSelectElement) return true;
	if (target instanceof HTMLInputElement)
		return ![
			'button',
			'checkbox',
			'color',
			'file',
			'radio',
			'range',
			'reset',
			'submit',
		].includes(target.type);
	return target.closest('[role="textbox"],[role="combobox"]') !== null;
}

export function isOverlayActive() {
	const snapshot = getOverlayCoordinatorSnapshot();
	return (
		snapshot.activeBlockerId !== null ||
		snapshot.pendingBlockerId !== null ||
		snapshot.passiveActiveId !== null ||
		snapshot.taskStack.length > 0
	);
}

/**
 * 编辑器快捷键只在焦点位于地图编辑器内或页面空白处时生效；
 * 输入框、弹出菜单和任何协调弹窗打开时都交还给它们。
 */
export function canHandleMapShortcut(
	event: KeyboardEvent,
	root: HTMLElement | null
) {
	if (!root || event.defaultPrevented || event.isComposing) return false;
	const { target } = event;
	if (isEditableTarget(target) || isOverlayActive()) return false;
	if (target === document.body || target === document.documentElement)
		return true;
	if (!(target instanceof Node) || !root.contains(target)) return false;
	return !(
		target instanceof Element &&
		target.closest('[role="menu"],[role="listbox"],[role="dialog"]')
	);
}
