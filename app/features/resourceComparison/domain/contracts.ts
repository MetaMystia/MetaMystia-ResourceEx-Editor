import type { ResourceEx } from '@/domain/resourcePack/contracts/resourceEx';
import { type IResourceEditorNavigationTarget } from '@/domain/resourcePack/editorNavigation';

export type TComparisonDifferenceStatus =
	'added' | 'ambiguous' | 'modified' | 'removed' | 'unchanged';

export type TComparisonNodeKind =
	| 'asset'
	| 'collection'
	| 'entity'
	| 'field'
	| 'folder'
	| 'license'
	| 'member'
	| 'root';

export type TComparisonPathSegment = number | string;

export type TComparisonValue =
	{ isPresent: false } | { isPresent: true; value: unknown };

export type TComparisonEditCapability =
	| 'adopt-old'
	| 'delete-added'
	| 'edit-lightweight'
	| 'open-full-editor'
	| 'restore-removed';

export type IComparisonNavigationTarget = IResourceEditorNavigationTarget;

export interface IComparisonIssueAttachment {
	category: string;
	code?: string;
	fieldPath?: readonly TComparisonPathSegment[];
	message: string;
	severity: 'error' | 'warning';
}

export interface IComparisonDifferenceCounts {
	added: number;
	ambiguous: number;
	modified: number;
	removed: number;
	unchanged: number;
}

export interface IComparisonNode {
	children: readonly IComparisonNode[];
	counts: IComparisonDifferenceCounts;
	editCapabilities: readonly TComparisonEditCapability[];
	fieldPath: readonly TComparisonPathSegment[];
	id: string;
	issues: readonly IComparisonIssueAttachment[];
	kind: TComparisonNodeKind;
	label: string;
	leftValue: TComparisonValue;
	navigationTarget?: IComparisonNavigationTarget;
	parentId: string | null;
	rawFieldName: string | null;
	referenceImpacts: readonly IComparisonReferenceImpact[];
	rightValue: TComparisonValue;
	status: TComparisonDifferenceStatus;
}

export interface IComparisonSearchEntry {
	nodeId: string;
	searchText: string;
}

export interface IResourcePackComparison {
	nodesById: ReadonlyMap<string, IComparisonNode>;
	root: IComparisonNode;
	searchIndex: readonly IComparisonSearchEntry[];
}

export interface IResourcePackComparisonOptions {
	includeUnchanged?: boolean;
}

export type TComparisonSource =
	| { fileName: string; kind: 'archive'; sourceId: string }
	| { kind: 'workspace'; workspaceId: string };

export interface IComparisonContentSnapshot {
	files: ReadonlyMap<string, Blob>;
	folders: readonly string[];
	hasLicenseFile: boolean;
	license: string;
	resourcePack: ResourceEx;
}

export interface IComparisonSnapshot extends IComparisonContentSnapshot {
	revision: number | null;
	source: TComparisonSource;
}

export type TComparisonReferenceKind =
	| 'asset'
	| 'beverage'
	| 'character'
	| 'character-portrait'
	| 'dialog-package'
	| 'dialogue'
	| 'event'
	| 'food'
	| 'ingredient'
	| 'item'
	| 'mission'
	| 'recipe';

export interface IComparisonReferenceImpact {
	fieldPath: readonly TComparisonPathSegment[];
	ownerKey: number | string;
	ownerKind: string;
	referencedKind: TComparisonReferenceKind;
	referencedValue: number | string;
}

export type TComparisonCommandKind =
	'adopt-old' | 'delete-added' | 'restore-removed' | 'undo';

export type TComparisonExecutableCommandKind = Exclude<
	TComparisonCommandKind,
	'undo'
>;

export type TComparisonAssetConflictResolution = 'keep-right' | 'use-left';

export interface IComparisonAssetHashPair {
	leftHash?: string;
	rightHash?: string;
}

export type TComparisonCommandChangeKind =
	| 'copy-file'
	| 'create-folder'
	| 'delete-field'
	| 'delete-file'
	| 'delete-folder'
	| 'delete-member'
	| 'restore-field'
	| 'restore-member'
	| 'set-field';

export interface IComparisonCommandChange {
	assetPath?: string;
	byteSize?: number;
	fieldPath?: readonly TComparisonPathSegment[];
	kind: TComparisonCommandChangeKind;
	nodeId: string;
}

export type TComparisonCommandConflictKind =
	| 'duplicate-key'
	| 'file-folder-collision'
	| 'label-mismatch'
	| 'missing-source'
	| 'path-content-mismatch'
	| 'referenced-delete'
	| 'stale-assets'
	| 'stale-revision'
	| 'unsupported-target'
	| 'workspace-mismatch';

export interface IComparisonCommandConflict {
	assetPath?: string;
	fieldPath?: readonly TComparisonPathSegment[];
	kind: TComparisonCommandConflictKind;
	message: string;
	isBlocking: boolean;
}

export interface IComparisonSkippedFile {
	path: string;
	reason: 'kept-right' | 'same-content';
	size: number;
}

export interface IComparisonCommandPlan {
	addedBytes: number;
	addedFileCount: number;
	changes: readonly IComparisonCommandChange[];
	commandKind: TComparisonCommandKind;
	conflicts: readonly IComparisonCommandConflict[];
	expectedAssetGeneration: number;
	expectedLabel: string;
	expectedRevision: number;
	expectedWorkspaceId: string;
	id: string;
	isApplicable: boolean;
	referenceImpacts: readonly IComparisonReferenceImpact[];
	skippedFiles: readonly IComparisonSkippedFile[];
	targetNodeId: string;
}

export interface IComparisonInverseCommand {
	before: IComparisonContentSnapshot;
	expectedAssetGeneration: number;
	expectedLabel: string;
	expectedRevision: number;
	expectedWorkspaceId: string;
	id: string;
	targetNodeId: string;
}

export interface IBuildComparisonCommandInput {
	assetConflictResolutions?: ReadonlyMap<
		string,
		TComparisonAssetConflictResolution
	>;
	assetHashes?: ReadonlyMap<string, IComparisonAssetHashPair>;
	commandKind: TComparisonExecutableCommandKind;
	expectedAssetGeneration: number;
	includeReferencedAssets?: boolean;
	left: IComparisonSnapshot;
	right: IComparisonSnapshot;
	targetAssetPath?: string;
	targetNode: IComparisonNode;
}

export interface IComparisonCommand {
	next: IComparisonContentSnapshot;
	plan: IComparisonCommandPlan;
}

export interface IComparisonCommandBuildResult {
	command?: IComparisonCommand;
	plan: IComparisonCommandPlan;
}

export interface IComparisonCommandApplicationContext {
	assetGeneration: number;
	current: IComparisonSnapshot;
}

export interface IComparisonCommandApplicationResult {
	conflict?: IComparisonCommandConflict;
	inverse?: IComparisonInverseCommand;
	isSuccess: boolean;
	next?: IComparisonContentSnapshot;
}
