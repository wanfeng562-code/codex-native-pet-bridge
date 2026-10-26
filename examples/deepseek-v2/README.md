# Deepseek 酱 V2 示例

这是本仓库的双形态运行时素材包。原始角色是 [fightingshine 投稿的 deepseek酱](https://petdex.dev/pets/deepseek)，V2 增加了猛吃白饭、空盆哈气、炸盆扣头和戴盆待机。

![动作预览](preview.gif)

下载后打开 [preview.html](preview.html) 可离线交互预览。它不连接 Codex，播放代码是素材演示，并不代替原生桥接验收。

## 文件

| 文件 | 内容 |
| --- | --- |
| `assets/deepseek-normal.webp` | 普通形态九槽位图集，Failed 使用 V1 原帧 |
| `assets/deepseek-basin.webp` | 戴盆图集，待机和吃饭的盆子已烘焙在图片里 |
| `assets/deepseek-hissing.webp` | 第 0 行普通哈气，第 1 行戴盆哈气，其他行透明 |
| `assets/deepseek-transition.webp` | 第一行 8 帧炸盆扣头 |
| `assets/deepseek-helmet-texture.webp` | 给其他动作逐帧叠加的头盆纹理 |
| `assets/asset-data.mjs` | 帧数、时长、45 个头盆锚点与槽位映射 |
| `assets/manifest.json` | 五张图集的 SHA-256 |
| `pet.json` | 示例元数据，不含任何账号的原生宠物 ID |

图集几何固定为 1536×1872、8 列×9 行，每格 192×208。哈气和变身图集保留同样几何，方便原生覆盖层使用统一的 background-position 计算。

## 时序

- 炸盆：`250, 220, 140, 400, 100, 180, 280, 350 ms`，总计 1920ms。
- 猛吃：`90, 80, 90, 130, 90, 140, 150, 90 ms`，持续循环。
- 哈气：`240, 160, 200, 80, 130, 160, 160, 600 ms`，每次移入只播一次。
- Failed：`7 × 140ms + 240ms`，保留原 V1 动作与时序。

盆子状态不是一个原生槽位，而是与动作并行保存的 `form`。因此吃饭、走动、失败、完成等动作切换后仍保持戴盆。

`pet.json` 中的 spritesheetPath 可以用于识别普通图集，但本目录不是 Petdex 上传所需的扁平 ZIP，也不会自动向任何宠物库提交。变身行为需要运行桥接，不能靠单张图片文件实现。

## 修改素材

替换指定格子的图像并保持透明背景、网格尺寸和锚点对应关系。修改时长或其他动作的头部位置，编辑 `asset-data.mjs`。之后在仓库根目录执行：

```powershell
node tools/verify-assets.mjs --write
node tools/verify-assets.mjs
python tools/build-preview.py
```

预览构建工具需要 Pillow；桥接运行本身不依赖 Python、Pillow 或其他图像库。

## 授权边界

代码为 MIT，图集和派生预览**不属于 MIT 授权范围**。当前没有确认原图的独立开放授权；角色和原始素材权利保留给相应权利人。请阅读 [ASSET-LICENSE.md](ASSET-LICENSE.md) 与[第三方声明](../../THIRD_PARTY_NOTICES.md)，不要把本示例当成可以任意商业复用的免版权素材包。
