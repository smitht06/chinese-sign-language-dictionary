# Chinese Sign Language Dictionary (Derivative Dataset)

> **English:** [README.en.md](./README.en.md) · **中文:** 本文档

中国通用手语词典的结构化数据集 — 从《国家通用手语词典（全四册）》抽取，整理为 SQLite 数据库 + 手势图片集合。


## ⚠️ 版权声明 · License & Disclaimer

**本仓库仅供学习、研究与无障碍技术开发等非商业用途使用。**

- 本数据集为《国家通用手语词典（全四册）》的衍生作品。原书及其图文内容的版权归原出版方、编制单位及相关权利人所有。
- 本仓库**不包含**原书 EPUB / PDF 文件，仅包含经程序抽取并结构化的数据和图片。
- **禁止**将本数据集用于任何商业用途（包括但不限于付费 App、商业培训、再销售等）。
- 如果您是版权方，认为本仓库内容侵犯了您的合法权益，请通过 GitHub issue 或 [@WishingCat](https://github.com/WishingCat) 联系，我会在收到通知后**立即删除**相关内容。

**This repository is for non-commercial use only** (research, education, accessibility tooling). The data is derived from *National Common Chinese Sign Language Dictionary*; all rights to the original content belong to its publishers and compilers. Raw source books are NOT included. Commercial use is not permitted. Copyright holders may request takedown via issue or by contacting [@WishingCat](https://github.com/WishingCat).

## 内容 · Contents

| 文件 / 目录 | 说明 |
|---|---|
| `signs.db` | SQLite 数据库，2.0 MB，两张表（`signs`, `meanings`） |
| `sign_themed.db` | 衍生库：增加 `signs.theme` 列 + `themes` 难度表 |
| `images/` | 6699 张手势图（PNG/JPG），~350 MB |
| `scripts/extract_epub.py` | 抽取管线，Python 3 stdlib，无外部依赖 |
| `scripts/translate_en.py` | 用 DeepSeek API 为全部词条/打法添加英文翻译 |
| `scripts/build_asl_videos.py` | 独立工具：将 ASL-LEX 视频转码为 H.264 并按英文词匹配到手势（App 不使用） |
| `mobile/` | Expo React Native 离线 App（搜索 / 字母浏览 / 主题浏览） |
| `CLAUDE.md` | 架构文档：schema、数据形态、解析决策、常用查询 |


## 数据规模

- 手势条目（signs）: **6699**
- 中文释义（meanings）: **8687**
- 首字母分区: 24（A-F / G-M / N-X / Y Z #；无 I/U/V，符合拼音实际）
- 带变体 ①②/❶❷ 的手势: 806

## Schema 速览

```
signs    (id, image_path, description, source_entry, letter, volume)
meanings (id, sign_id → signs.id, text, variant_index, order_in_entry)
```

详细列级说明、三类典型数据形态（多释义同图 / 同词多打法 / 变体+多义混合）、以及常用查询，见 [`CLAUDE.md`](./CLAUDE.md)。

## 快速上手

```bash
# 按中文词查手势图与打法描述
sqlite3 signs.db "
  SELECT s.image_path, s.description
  FROM meanings m JOIN signs s ON s.id = m.sign_id
  WHERE m.text = '妻子';
"
```

## 重建数据（需要你自备 EPUB 源文件）

本仓库不含源书。如果你合法持有 4 册 EPUB，可放入 `DictionaryBook/Volume 1..4.epub`，然后：

```bash
python3 scripts/extract_epub.py
```

约 10 秒产出 `signs.db` 与 `images/`。管线细节见 `CLAUDE.md`。

## 英文翻译（DeepSeek API）

为全部 8687 个中文释义与 6699 条打法描述添加英文翻译，写入 `sign_themed.db`：

```bash
export DEEPSEEK_API_KEY=sk-...
python3 scripts/translate_en.py            # 翻译全部（可断点续跑）
python3 scripts/translate_en.py --only meanings   # 只翻译词条
python3 scripts/translate_en.py --only descriptions  # 只翻译打法
```

- 新增列：`meanings.en_text`、`signs.en_description`，以及 `translations` 审计表。
- 脚本可续跑：只翻译目标列为 NULL 的行，中断后重跑即可继续。
- 原中文列保持不变，英文为增量补充。

## 移动端 App（Expo React Native，离线）

`mobile/` 是一个完全离线的 Expo App，打包全部 6699 张手势图 + 数据 + 英文翻译。

**功能：**
- **搜索** — 按中文词或英文翻译搜索
- **字母浏览** — A–Z + # 分区
- **主题浏览** — 按 `sign_themed.db` 的难度分级（入门→高级）
- **手势详情** — 大图、中文词、英文翻译、打法描述（中英）、同义词、同词不同打法
- **ASL 图片（可选）** — 将美国手语（ASL）图片放入 `asl_images/`，App 会为匹配的手势显示 ASL 图（带 "ASL" 角标），否则回退到中文手语图

**构建与运行：**

```bash
# 1. 打包数据（复制 DB + 全部图片 + 生成资源映射）
python3 mobile/scripts/build_data.py

# 2. 启动 App
cd mobile
npm install
npx expo start
```

> 打包后的数据（`mobile/assets/data/` 与 `mobile/app/assets.ts`）由构建脚本生成，已加入 `.gitignore`，不提交到仓库。
>
> 注意：App 只在**首次启动**时把内置数据库复制到本地，数据更新后需要卸载重装 App 才会生效。

### 添加 ASL 手势图片

App 支持在某个手势有 ASL 图片时显示它，否则回退到中文手语（CSL）图片。

1. 在仓库根目录创建 `asl_images/` 文件夹。
2. 放入 ASL 图片，文件名与手势现有图片文件名一致。例如 `image_path` 为 `images/v1_txt005_2.jpg` 的手势，其 ASL 图片为 `asl_images/v1_txt005_2.jpg`。
3. 重新运行构建脚本：

```bash
python3 mobile/scripts/build_data.py
```

构建脚本会把 ASL 图片复制进 App 资源包、为匹配的手势写入 `signs.asl_image_path`，并重新生成资源映射。手势详情页随后会显示带 "ASL" 角标的 ASL 图。无需改动 App 代码。

### ASL 手势视频（独立工具，App 不使用）

`scripts/build_asl_videos.py` 作为独立工具保留：把 [ASL-LEX](https://asl-lex.org/) 数据集的 `.webm` 视频转码为 H.264 `.mp4` 并按英文词匹配到 `sign_themed.db` 的手势，产出 `build/asl_videos.json` 与审计日志 `build/asl_videos_match.log`。App 内曾集成视频播放，后按用户偏好移除（改为 ASL 图片方案），脚本留作以后使用。

```bash
python3 scripts/build_asl_videos.py   # 需要 ffmpeg + ASL Data/ 数据集
```


