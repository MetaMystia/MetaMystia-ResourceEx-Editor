export type TOverlayId =
	| 'announcement'
	| 'asset.operation-confirm'
	| 'asset.picker'
	| 'asset.picker.operation-confirm'
	| 'comparison.command'
	| 'comparison.command.confirm'
	| 'comparison.left-source'
	| 'comparison.quick-source'
	| 'comparison.right-source'
	| 'navbar.export-validation'
	| 'navbar.notice'
	| 'resource.signature'
	| 'sprite.size-confirm'
	| 'workspace.delete'
	| 'workspace.duplicate'
	| 'workspace.duplicate.replace'
	| 'workspace.lease-conflict'
	| 'workspace.lease-loss'
	| 'workspace.notice'
	| 'workspace.recovery'
	| 'workspace.recovery.discard'
	| 'workspace.rename';

export type TOverlayPriority = 'blocking' | 'passive' | 'task';

export type TOverlayPresentationState =
	'active' | 'closed' | 'closing' | 'covered' | 'opening' | 'queued';

export type TOverlayCloseReason = 'coordinator' | 'escape';

export type TOverlayRequestResult =
	| { status: 'activated' }
	| { status: 'queued' }
	| {
			reason:
				| 'blocking-active'
				| 'parent-inactive'
				| 'task-active'
				| 'transition-active'
				| 'tutorial-active';
			status: 'rejected';
	  }
	| { status: 'stale' };

export interface IOverlayDefinition {
	blockingRank?: number;
	exitDelayMs: number;
	preserveChildBackdropBlur?: boolean;
	priority: TOverlayPriority;
}

export interface IOverlayRegistration {
	canActivate?: () => boolean;
	dismissable?: () => boolean;
	exitDelayMs?: number;
	getRootElement?: () => HTMLElement | null;
	id: TOverlayId;
	onRequestClose?: (reason: TOverlayCloseReason) => void;
	requestOwnership?: 'component' | 'external';
	shortcuts?: ReadonlyArray<IOverlayShortcutDefinition>;
}

export interface IOverlayShortcutDefinition {
	canHandle?: (event: KeyboardEvent) => boolean;
	matches: (event: KeyboardEvent) => boolean;
	onTrigger: () => void;
}

export interface IOverlayCoordinatorSnapshot {
	activeBlockerId: null | TOverlayId;
	isBlockingTransition: boolean;
	isTaskTransition: boolean;
	isTutorialActive: boolean;
	passiveActiveId: null | TOverlayId;
	passiveQueue: TOverlayId[];
	pendingBlockerId: null | TOverlayId;
	pendingTaskId: null | TOverlayId;
	taskStack: TOverlayId[];
}

export interface IOverlayOpenOptions {
	onActivate?: () => void;
}

export interface IOverlayHandoffOptions {
	fromId: TOverlayId;
	isValid?: () => boolean;
	onCloseSource: () => void;
	onOpenTarget: () => void;
	toId: TOverlayId;
}

export interface IOverlayPushChildOptions {
	childId: TOverlayId;
	onOpenChild: () => void;
	parentId: TOverlayId;
}

export interface ITutorialLease {
	release: () => void;
}

export interface ITutorialLeaseOptions {
	onPreempt?: () => void;
}
