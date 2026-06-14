# pi-checkpoint

为 [Pi coding agent](https://github.com/earendil-works/pi) 写的**工作区快照 + 一键文件回滚**扩展（借鉴 opencode `snapshot/`）。

agent **每轮自动**给工作区拍一个 git 影子快照（只对改了文件的轮生成），你可以在「检查点」面板查看每个快照的文件 diff，并**一键把工作区文件回滚**到任一快照。**只回退文件，不动对话**。

## 能力

| 类型 | 名称 | 说明 |
|---|---|---|
| 自动快照 | `before_agent_start` 钩子 | 每轮拍一次；git 无变化则跳过（只对「改了文件的轮」生成 checkpoint） |
| 命令 | `/checkpoint list` | 列出检查点 |
| 命令 | `/checkpoint create [label]` | 手动打点 |
| 命令 | `/checkpoint diff <id>` | 查看某检查点→当前的 diff |
| 命令 | `/checkpoint revert <id>` | 把工作区文件回滚到该检查点 |
| 命令 | `/checkpoint clear` | 清空元数据（git 对象保留） |

## 实现

独立 git 影子仓库：`git --git-dir <cwd>/.pi/snapshots/git --work-tree <cwd> ...`，**不碰用户的 `.git`**。`track` 暂存改动+未跟踪文件（尊重源仓 `.gitignore`、跳过 >2MB、排除 `.pi`/`.git`），`write-tree`+`commit-tree` 得到快照 hash 并更新 `refs/heads/snapshots`；`restore` 用 `read-tree`+`checkout-index` 还原跟踪文件，并删除该快照之后新增的文件。Windows 安全 flag：`core.autocrlf=false`、`core.longpaths=true`、`core.quotepath=false`、`core.symlinks=true`。

元数据（id、hash、label、kind、files、createdAt）存 `<cwd>/.pi/snapshots/meta.db`（`bun:sqlite`/`node:sqlite`）。

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `CHECKPOINT` | `1`（开启） | 设 `0` 关闭整个扩展 |

## 存储

`<cwd>/.pi/snapshots/`：`git/`（影子仓库）+ `meta.db`（元数据）。**建议把 `.pi/` 加入 `.gitignore`**。

## 文件结构

```text
checkpoint/
├── index.ts       # before_agent_start 自动快照 + /checkpoint 命令
├── snapshot.ts    # git 影子仓库封装（track/diff/restore）
├── store.ts       # 元数据（sqlite）
├── package.json
└── README.md
```

## 非目标

- 只回退**文件**，不回退对话（对话时间旅行留待后续）。
- v1 不做单文件选择性回滚（整快照还原）。
- 不引入 Monaco 并排 diff（GUI 用 shiki unified diff；Monaco 留作后续可选增强）。
- 无自动 prune（可后续加 7 天/容量上限）。
