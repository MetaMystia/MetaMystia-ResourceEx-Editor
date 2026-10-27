# 原版地图镜像

原版白天地图可由 MetaMystia 仓库的 `tools/day-map-art/mirror` 从游戏 Addressables 转换为画布地图资源包，在编辑器中按普通地图打开和编辑。镜像包只供本地参考，不随编辑器分发。

转换对应关系：

- 使用默认材质的 Tilemap（含 `BinaryTilemapDecompressor` 解压的格子）各成一张图层，保留排序层与排序值。原版地面本就是整张手绘图切成 48×48 的格子，转换后还原为整图。
- 不在 `SortingGroup` 内的 `SpriteRenderer` 与最外层 `SortingGroup` 成为物件；组内按原排序合成一张图，带 `LayerSortingController` 的按 Y 排序。单张精灵只有平移和翻转时直接使用原图、原锚点与原像素密度，翻转写进物件缩放，重复的精灵共用模板。
- `CompositeCollider2D`（Outlines）的轮廓成为闭合折线；独立的实心碰撞成为物件模板碰撞或地图碰撞；`CameraCollider` 成为相机多边形。
- `HEIGHT_MAP` 成为坡度格，`SpawnMarker` 成为出生点，`hideClock` 保留，音乐引用原版 `LoopedBGMPackage` 地址。

特殊材质（光照、阴影滤镜）、角色、出口与剧情演出不转换，数量写在转换报告中。碰撞成员是否并入合成轮廓按 Unity 规则判断：`usedByComposite` 但所在刚体没有 `CompositeCollider2D` 的碰撞不生效，也不转换。

博丽大祭镜像：2 个图层（地面 4529×4071、地面装饰 2089×1559），70 个模板 89 个物件，13 条合成轮廓与 1 个实心多边形，2 个模板碰撞，41 个坡度格，1 个出生点；跳过 Shadow_Floor 区域滤镜层与 98 个光照、滤镜精灵。
