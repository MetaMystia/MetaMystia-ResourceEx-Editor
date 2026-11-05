import type {
	IOverlayDefinition,
	TOverlayId,
} from '@/features/overlays/contracts';

export const MODAL_DEFAULT_EXIT_DELAY_MS = 300;

export const OVERLAY_DEFINITION_MAP = {
	announcement: {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'passive',
	},
	'asset.operation-confirm': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'asset.picker': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'asset.picker.operation-confirm': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'comparison.command': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'comparison.command.confirm': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'comparison.left-source': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'comparison.quick-source': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'comparison.right-source': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'navbar.export-validation': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'navbar.notice': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'passive',
	},
	'resource.signature': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'sprite.size-confirm': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.delete': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.duplicate': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.duplicate.replace': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.lease-conflict': {
		blockingRank: 100,
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'blocking',
	},
	'workspace.lease-loss': {
		blockingRank: 110,
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'blocking',
	},
	'workspace.notice': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'passive',
	},
	'workspace.recovery': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.recovery.discard': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
	'workspace.rename': {
		exitDelayMs: MODAL_DEFAULT_EXIT_DELAY_MS,
		priority: 'task',
	},
} as const satisfies Record<TOverlayId, IOverlayDefinition>;
