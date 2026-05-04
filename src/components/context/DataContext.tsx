'use client';

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useRef,
	type PropsWithChildren,
} from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
	KNOWN_DEPENDENCIES,
	isValidPackLabel,
	PACK_LABEL_ALLOWED_DESCRIPTION,
} from '@/lib/constants';

import type { ResourceEx } from '@/types/resource';
import type { Dialog, DialogAction } from '@/types/resource';
import { sortValues, trimCRLF } from './utils';

interface DataContextType {
	data: ResourceEx;
	setData: (data: ResourceEx) => void;

	// Asset management
	assetUrls: Record<string, string>;
	updateAsset: (path: string, blob: Blob) => void;
	removeAsset: (path: string) => void;
	getAssetUrl: (path: string) => string | undefined;

	// File operations
	loadResourcePack: (file: File) => Promise<void>;
	saveResourcePack: (filename?: string) => Promise<void>;
	createBlank: () => void;

	hasUnsavedChanges: boolean;
	setHasUnsavedChanges: (value: boolean) => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: PropsWithChildren) {
	const [data, setData] = useState<ResourceEx>({
		packInfo: {
			name: 'New Resource Pack',
			label: 'NewPack',
			authors: [],
			description: '',
			version: '1.0.0',
		},
		characters: [],
		dialogPackages: [],
		ingredients: [],
		foods: [],
		beverages: [],
		recipes: [],
		missionNodes: [],
		eventNodes: [],
		merchants: [],
		clothes: [],
	});
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

	// Store blobs in a Ref to avoid re-renders on every small change
	const assetsRef = useRef<Map<string, Blob>>(new Map());
	// Store URLs in state for UI rendering
	const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

	// Track all URLs for cleanup
	const allGeneratedUrls = useRef<Set<string>>(new Set());

	const registerUrl = useCallback((url: string) => {
		allGeneratedUrls.current.add(url);
		return url;
	}, []);

	const revokeUrl = useCallback((url: string | undefined) => {
		if (url) {
			URL.revokeObjectURL(url);
			allGeneratedUrls.current.delete(url);
		}
	}, []);

	useEffect(() => {
		return () => {
			// Cleanup all URLs on unmount
			allGeneratedUrls.current.forEach((url) => URL.revokeObjectURL(url));
		};
	}, []);

	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges) {
				e.preventDefault();
				e.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	}, [hasUnsavedChanges]);

	const updateAsset = useCallback(
		(path: string, blob: Blob) => {
			assetsRef.current.set(path, blob);

			setAssetUrls((prev) => {
				if (prev[path]) revokeUrl(prev[path]);
				const newUrl = registerUrl(URL.createObjectURL(blob));
				return { ...prev, [path]: newUrl };
			});
			setHasUnsavedChanges(true);
		},
		[registerUrl, revokeUrl]
	);

	const removeAsset = useCallback(
		(path: string) => {
			assetsRef.current.delete(path);
			setAssetUrls((prev) => {
				if (prev[path]) revokeUrl(prev[path]);
				const next = { ...prev };
				delete next[path];
				return next;
			});
			setHasUnsavedChanges(true);
		},
		[revokeUrl]
	);

	const getAssetUrl = useCallback(
		(path: string) => {
			return assetUrls[path];
		},
		[assetUrls]
	);

	const loadResourcePack = useCallback(
		async (file: File) => {
			if (
				hasUnsavedChanges &&
				!confirm(
					'当前有未保存的更改，导入新资源包将丢失这些更改，确定要继续吗？'
				)
			) {
				return;
			}
			try {
				const zip = await JSZip.loadAsync(file);

				// Load ResourceEx.json
				const jsonFile = zip.file('ResourceEx.json');
				if (!jsonFile) {
					alert('压缩包中未找到 ResourceEx.json');
					return;
				}
				const jsonStr = await jsonFile.async('string');
				let jsonData = JSON.parse(jsonStr) as ResourceEx;

				// Load LICENSE.md if exists
				const licenseFile = zip.file('LICENSE.md');
				let licenseContent = '';
				if (licenseFile) {
					licenseContent = await licenseFile.async('string');
				}

				// Data migration / normalization
				if (jsonData.characters) {
					jsonData.characters = jsonData.characters.map((char) => ({
						...char,
						descriptions: char.descriptions
							? [...char.descriptions, '', '', ''].slice(0, 3)
							: ['', '', ''],
						guest: char.guest
							? {
									...char.guest,
									evaluation: char.guest.evaluation
										? [
												...char.guest.evaluation,
												...Array(9).fill(''),
											].slice(0, 9)
										: Array(9).fill(''),
									foodRequests: (
										char.guest.foodRequests || []
									)
										.map((r: any) => ({
											...r,
											enable: r.enable ?? true,
										}))
										.sort(
											(a: any, b: any) =>
												a.tagId - b.tagId
										),
									bevRequests: (char.guest.bevRequests || [])
										.map((r: any) => ({
											...r,
											enable: r.enable ?? true,
										}))
										.sort(
											(a: any, b: any) =>
												a.tagId - b.tagId
										),
									likeFoodTag: [
										...(char.guest.likeFoodTag || []),
									].sort(
										(a: any, b: any) => a.tagId - b.tagId
									),
									likeBevTag: [
										...(char.guest.likeBevTag || []),
									].sort(
										(a: any, b: any) => a.tagId - b.tagId
									),
									hateFoodTag: [
										...(char.guest.hateFoodTag || []),
									].sort((a: number, b: number) => a - b),
									spawn: [...(char.guest.spawn || [])].sort(
										(a: any, b: any) =>
											a.izakayaId - b.izakayaId
									),
								}
							: undefined,
					}));
				}

				// Clear old assets
				assetsRef.current.forEach((_, path) => {
					if (assetUrls[path]) revokeUrl(assetUrls[path]);
				});
				assetsRef.current = new Map();

				const newAssetUrls: Record<string, string> = {};

				// Load new assets
				const entries = Object.keys(zip.files)
					.map((name) => zip.files[name])
					.filter((entry) => entry !== undefined);
				for (const entry of entries) {
					if (
						!entry.dir &&
						entry.name !== 'ResourceEx.json' &&
						!entry.name.startsWith('__MACOSX')
					) {
						const blob = await entry.async('blob');
						assetsRef.current.set(entry.name, blob);
						newAssetUrls[entry.name] = registerUrl(
							URL.createObjectURL(blob)
						);
					}
				}

				setAssetUrls(newAssetUrls);
				// Migration for flat properties to packInfo
				const packInfo = jsonData.packInfo || {
					name: (jsonData as any).name,
					label: (jsonData as any).label,
					authors: (jsonData as any).authors,
					description: (jsonData as any).description,
					version: (jsonData as any).version,
				};
				// Override license with LICENSE.md content if exists
				if (licenseContent) {
					packInfo.license = licenseContent;
				}
				setData({
					packInfo,
					characters: jsonData.characters || [],
					dialogPackages: jsonData.dialogPackages || [],
					ingredients: jsonData.ingredients || [],
					foods: (jsonData.foods || []).map((f: any) => ({
						...f,
						tags: [...(f.tags || [])].sort(
							(a: number, b: number) => a - b
						),
						banTags: [...(f.banTags || [])].sort(
							(a: number, b: number) => a - b
						),
					})),
					beverages: (jsonData.beverages || []).map((b: any) => ({
						...b,
						tags: [...(b.tags || [])].sort(
							(a: number, b: number) => a - b
						),
					})),
					recipes: jsonData.recipes || [],
					missionNodes: (jsonData.missionNodes || []).map(
						(node: any) => {
							const { name, ...rest } = node;
							return {
								...rest,
								title: node.title ?? node.name ?? '',
								rewards: node.rewards || [],
								finishConditions: node.finishConditions || [],
								postMissionsAfterPerformance:
									node.postMissionsAfterPerformance || [],
								postEvents: node.postEvents || [],
								label:
									node.label ?? node.title ?? node.name ?? '',
								description: node.description ?? '',
								sender: node.sender ?? '',
								reciever: node.reciever ?? node.receiver ?? '',
							};
						}
					),
					merchants: jsonData.merchants || [],
					clothes: (jsonData.clothes || []).map((c: any) => ({
						...c,
						pixelFullConfig: c.pixelFullConfig || {
							name: `_ResourceExample_Clothes_${c.id}`,
							mainSprite: Array(12)
								.fill('')
								.map(
									(_: string, i: number) =>
										`assets/Clothes/${c.id}/Sprite/Main_${Math.floor(i / 3)}, ${i % 3}.png`
								),
							eyeSprite: Array(24)
								.fill('')
								.map(
									(_: string, i: number) =>
										`assets/Clothes/${c.id}/Sprite/Eyes_${Math.floor(i / 4)}, ${i % 4}.png`
								),
							hairSprite: Array(12)
								.fill('')
								.map(
									(_: string, i: number) =>
										`assets/Clothes/${c.id}/Sprite/Hair_${Math.floor(i / 3)}, ${i % 3}.png`
								),
							backSprite: Array(12)
								.fill('')
								.map(
									(_: string, i: number) =>
										`assets/Clothes/${c.id}/Sprite/Back_${Math.floor(i / 3)}, ${i % 3}.png`
								),
						},
					})),
					eventNodes: (jsonData.eventNodes || []).map(
						(node: any) => ({
							label: node.label || '',
							debugLabel: node.debugLabel || '',
							scheduledEvent: node.scheduledEvent || {
								trigger: node.trigger, // Backward compatibility or migration if needed
								eventData: node.eventData,
							},
							rewards: node.rewards || [],
							postRewards: node.postRewards || [],
							postMissionsAfterPerformance:
								node.postMissionsAfterPerformance || [],
							postEvents: node.postEvents || [],
						})
					),
				});
				setHasUnsavedChanges(false);
			} catch (e) {
				console.error(e);
				alert(
					'读取资源包失败: ' +
						(e instanceof Error ? e.message : String(e))
				);
			}
		},
		[hasUnsavedChanges, assetUrls, registerUrl, revokeUrl]
	);

	const saveResourcePack = useCallback(
		async (filename?: string) => {
			if (
				data.packInfo?.label &&
				KNOWN_DEPENDENCIES.includes(data.packInfo.label as any)
			) {
				alert(
					`导出失败: 资源包标识符 (Label) 不能使用保留关键字 "${data.packInfo.label}"`
				);
				return;
			}

			if (
				data.packInfo?.label &&
				!isValidPackLabel(data.packInfo.label)
			) {
				alert(
					`导出失败: 资源包标识符 (Label) "${data.packInfo.label}" 含非法字符。${PACK_LABEL_ALLOWED_DESCRIPTION}。`
				);
				return;
			}

			const zip = new JSZip();

			// Sanitize data before export
			const exportData = {
				...data,
				dialogPackages: data.dialogPackages.map((pkg) => ({
					...pkg,
					dialogList: pkg.dialogList.map((dlg): Dialog => {
						const cleanedActions: DialogAction[] = (
							dlg.actions ?? []
						).map((act) => {
							// Drop sprite when explicitly clearing (shouldSet=false)
							// or for actions that don't carry a sprite.
							if (act.actionType === 'CameraShake') {
								return { actionType: act.actionType };
							}
							if (act.actionType === 'Sound') {
								return {
									actionType: act.actionType,
									...(act.sound ? { sound: act.sound } : {}),
								};
							}
							if (act.shouldSet === false) {
								return {
									actionType: act.actionType,
									shouldSet: false,
								};
							}
							return {
								actionType: act.actionType,
								...(act.sprite ? { sprite: act.sprite } : {}),
							};
						});
						const { actions: _omit, ...rest } = dlg;
						void _omit;
						if (cleanedActions.length === 0) {
							return rest;
						}
						return { ...rest, actions: cleanedActions };
					}),
				})),
				characters: data.characters.map((char) => {
					if (!char.guest) {
						return char;
					}
					const activeLikeFoodTagIds = char.guest.likeFoodTag.map(
						(t) => t.tagId
					);
					const activeLikeBevTagIds = char.guest.likeBevTag.map(
						(t) => t.tagId
					);
					return {
						...char,
						guest: {
							...char.guest,
							foodRequests: char.guest.foodRequests
								.filter(({ tagId }) =>
									activeLikeFoodTagIds.includes(tagId)
								)
								.sort((a, b) => a.tagId - b.tagId),
							bevRequests: (char.guest.bevRequests || [])
								.filter(({ tagId }) =>
									activeLikeBevTagIds.includes(tagId)
								)
								.sort((a, b) => a.tagId - b.tagId),
							likeFoodTag: [...char.guest.likeFoodTag].sort(
								(a, b) => a.tagId - b.tagId
							),
							likeBevTag: [...char.guest.likeBevTag].sort(
								(a, b) => a.tagId - b.tagId
							),
							hateFoodTag: [...char.guest.hateFoodTag].sort(
								(a, b) => a - b
							),
							spawn: char.guest.spawn
								? [...char.guest.spawn].sort(
										(a, b) => a.izakayaId - b.izakayaId
									)
								: undefined,
						},
					};
				}),
			};

			// Sort object values for consistency
			sortValues(exportData);

			// Trim strings and replace CRLF with LF
			trimCRLF(exportData);

			zip.file(
				'ResourceEx.json',
				`${JSON.stringify(exportData, null, 2)}\n`
			);

			// Add LICENSE.md if license exists
			if (data.packInfo?.license) {
				zip.file('LICENSE.md', data.packInfo.license);
			}

			// Collect all used asset paths
			const usedPaths = new Set<string>();

			// 1. Ingredients
			exportData.ingredients.forEach((ing) => {
				if (ing.spritePath) usedPaths.add(ing.spritePath);
			});

			// 1.5 Foods
			exportData.foods?.forEach((food) => {
				if (food.spritePath) usedPaths.add(food.spritePath);
			});

			// 1.6 Beverages
			exportData.beverages?.forEach((bev) => {
				if (bev.spritePath) usedPaths.add(bev.spritePath);
			});

			// 1.7 Clothes
			exportData.clothes?.forEach((clothes) => {
				if (clothes.spritePath) usedPaths.add(clothes.spritePath);
				if (clothes.portraitPath) usedPaths.add(clothes.portraitPath);
				if (clothes.pixelFullConfig) {
					clothes.pixelFullConfig.mainSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
					clothes.pixelFullConfig.eyeSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
					clothes.pixelFullConfig.hairSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
					clothes.pixelFullConfig.backSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
				}
			});

			// 2. Characters
			exportData.characters.forEach((char) => {
				// Portraits
				char.portraits?.forEach((p) => {
					if (p.path) usedPaths.add(p.path);
				});

				// Sprite Sets
				if (char.characterSpriteSetCompact) {
					char.characterSpriteSetCompact.mainSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
					char.characterSpriteSetCompact.eyeSprite.forEach((p) => {
						if (p) usedPaths.add(p);
					});
				}
			});

			// 3. Dialog action sprites (CG/BG) and audio (Sound)
			exportData.dialogPackages.forEach((pkg) => {
				pkg.dialogList.forEach((dlg) => {
					dlg.actions?.forEach((act) => {
						if (act.sprite) usedPaths.add(act.sprite);
						if (act.sound) usedPaths.add(act.sound);
					});
				});
			});

			// Add only used assets
			assetsRef.current.forEach((blob, path) => {
				if (usedPaths.has(path)) {
					zip.file(path, blob);
				}
			});

			const content = await zip.generateAsync({ type: 'blob' });

			let finalName = filename;
			if (!finalName) {
				const label = data.packInfo?.label || 'ResourceEx';
				const version = data.packInfo?.version || '1.0.0';
				finalName = `${label}-v${version}.zip`;
			}

			saveAs(content, finalName);
			setHasUnsavedChanges(false);
		},
		[data]
	);

	const createBlank = useCallback(() => {
		if (
			hasUnsavedChanges &&
			!confirm('当前有未保存的更改，确定要清空吗？')
		) {
			return;
		}
		// Clear data
		setData({
			packInfo: {
				name: 'New Resource Pack',
				label: 'NewPack',
				authors: [],
				description: '',
				version: '1.0.0',
			},
			characters: [],
			dialogPackages: [],
			ingredients: [],
			foods: [],
			beverages: [],
			recipes: [],
			missionNodes: [],
			eventNodes: [],
			merchants: [],
			clothes: [],
		});
		// Clear assets
		Object.values(assetUrls).forEach((url) => revokeUrl(url));
		assetsRef.current = new Map();
		setAssetUrls({});
		setHasUnsavedChanges(false);
	}, [hasUnsavedChanges, assetUrls, revokeUrl]);

	return (
		<DataContext.Provider
			value={{
				data,
				setData,
				assetUrls,
				updateAsset,
				removeAsset,
				getAssetUrl,
				loadResourcePack,
				saveResourcePack,
				createBlank,
				hasUnsavedChanges,
				setHasUnsavedChanges,
			}}
		>
			{children}
		</DataContext.Provider>
	);
}

export function useData() {
	const context = useContext(DataContext);

	if (!context) {
		throw new Error('useData must be used within a DataProvider');
	}

	return context;
}
