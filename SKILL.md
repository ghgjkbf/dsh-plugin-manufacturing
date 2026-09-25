---
name: dsh-plugin-manufacturing
description: 造 dsh/cordis 插件全流程触发：探针定可行性→写码→真机验收→打包→开源；含 22 条实测坑位与官方规则冲突警告。写码细节以官方 cordis-plugin-development 为准。
---

# dsh 插件制造全流程

**一条流水线，六个阶段，每阶段有硬闸门。** 官方技能覆盖其中「怎么写」和「怎么装」；本技能把它们串成端到端流程，并补上官方没写的**交付与开源**，以及**实测出来的坑**。

插件真正的失败模式不是「写不出来」，而是**以为写完了**。本技能按「证据到哪一步」切阶段，每阶段给出必须满足才许进入下一阶段的判据。

## 权威来源（先认清边界，别读重复的）

| 层面 | 权威 | 本技能的关系 |
|---|---|---|
| 插件怎么写、怎么装 | 官方 `cordis-plugin-development`（+ `templates/decoration/`、`references/{host-plugin,ui-plugin,practices,mcp-bundle}.md`） | **不复制**，只指出会被咬的规则并补实测补充 |
| patch 层语法、可装插件清单 | 官方 `cordis-composition-reference` | 只引用 |
| 交付、验收、开源 | 本技能 | 官方没覆盖 |

冲突时**以官方为准**。本技能里与官方不一致的条目，都在 `references/pitfalls.md` 标了实测证据。

## 六阶段流水线

### 阶段 1：探针定可行性（写码之前）

用只读探针回答「这条路成不成立」。**先设计再发现不可行是最大的浪费源**——一次交付里两个探针都给出否定答案，直接省掉整条错路。

闸门：每个关键假设都有一个只读探针输出，且你不依赖未经探测的假设。

### 阶段 2：选渲染面（写任何视图之前）

官方 `practices.md` §6 的硬前提：**UI 一致性由渲染面决定，选错了后续怎么调样式都救不回来**。先 `cordis_inspect_query` `Slots.listSubTree` 拿到真实槽位与 props，再写视图。

判据：`references/authoring.md` 的「会被咬的规则」逐条对上号，特别是那颗地雷——**不得 `require` 任何 Harness Client 包**。

### 阶段 3：实现 + 宿主端验收

纯逻辑套件跑真文件系统/真 HTTP，别 mock 自己的逻辑。

闸门：宿主套件全绿，且失败路径（越界 id、占用目标、超大 body）都有断言。

### 阶段 4：真机可见性验收（最容易跳过的一环）

**注册成功 ≠ 用户看得见。** 一次交付里注册层断言全绿——bundle 执行、slot 注册、CSS 注入、零报错——用户反馈仍是「没有浮出」。真因不是 bug：唯一入口挂在悬停菜单里，而当前会话行根本没那个触发器。

闸门：在**不派发任何鼠标事件**的状态下，用 DOM 查询证明元素有尺寸、可见、可点、命中自身，并端到端走通一次。详见 `references/verification.md`。

### 阶段 5：打包与安装

manifest 契约、两种安装方式、卸载后的遗留状态。见 `references/packaging.md`。

闸门：`plugin_manager` 返回 `application: applied`，且**重启后仍生效**（宿主改动必须重启，见坑位 16）。

### 阶段 6：开源发布

可移植化 → 密钥扫描 → LICENSE/CI → 发布。见 `references/open-source.md`。

闸门：仓库里零凭据、零作者绝对路径，`tools/validate.mjs` 与 CI 全绿。

## 六条铁律（都违反过，代价记在案）

1. **不得 `require` 任何 Harness Client 包**（官方 `practices.md` L35）。我现在维护的参考插件违反此条 16 次（`primitives.Button` ×11 等）。`dsh.client.inject` 只排激活顺序，不是许可。后果：上游改版即崩，纯 JS 无类型检查，抛错会**清空你的槽位**（`slot entry crashed in '<slot>'`）。做法：把原语 markup/CSS/行为**抄进自己插件**并改类名前缀。
2. **不得用新事件类型追加会话事件**（官方 `practices.md` L21）。`SessionEventMap` 是封闭接口，`ignorable: true` 是只读标记而 `Session.append()` 设不了它 ⇒ 会话下次拒绝打开。「写墓碑事件来遮蔽」这条路**是死的**；要遮蔽就用内核已有的 `compaction/prune`（`shadowedSeqs`/`shadowedRange`）或面层替换。
3. **宿主改动必须重启进程；客户端改动刷新页面即可。** `lib/index.js` 进程启动时 `require` 一次，禁用/启用插件条目是空操作（Node ESM 缓存）。替换已装包需要重启加载新的模块世代。
4. **注册即效果，必须活在 `apply` 里并返回 cleanup**（`ctx.effect`/`ctx.on`）。注册到别的上下文（如 `agent.ctx`）时它有两个所有者，你自己的 effect 也要留 disposer。
5. **别自造 manifest 字段**。真实契约只有 `dsh.bundle` + `dsh.client`；实测 `dsh.manifestVersion` 全库消费者 = **0**，不报错也不生效。
6. **仓库里永不出现 bearer 凭据**；工具从环境变量读，缺了就跳过并明说。

## 读什么

| 任务 | 文件 |
|---|---|
| 官方「会被咬的规则」+ 必查清单（含我踩过的那颗雷） | `references/authoring.md` |
| 22 条实测坑位（manifest / slot / 主题 / 事件 / 客户端路由 / Windows 文件系统） | `references/pitfalls.md` |
| 真机可见性验收：断言什么、鉴权怎么过、重启 vs 刷新 | `references/verification.md` |
| 包形态、manifest、安装、卸载遗留、README 清单 | `references/packaging.md` |
| 开源前清洗与发布（含发布命令的三个陷阱） | `references/open-source.md` |
| 运行期路径解析（浏览器/依赖/cookie/URL，全可覆盖） | `templates/harness.mjs` |
| 无浏览器 CI（含密钥与机器路径门禁） | `templates/verify.yml` |

## 关键事实速查

- **客户端半边入口是 `exports["./client"]`**，路径任意。`clients` 只要存在即被组合进那**一条** combo 请求（`/plugins/??a/client.js,b/client.js&rev=…`）——所以一个插件的语法错误可能拖垮整条请求，排查时先看这条请求的完整性。
- **combo 路由接受裸 `client.js`**（实测页面 HTML 里就是 `<pkg>/client.js`）。`CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` 只守**按需路由**，两条路径别混。
- **rev 由文件元数据算出**（`[mtimeMs, ctimeMs, size]` 的哈希前 12 位），改文件即变 ⇒ 客户端改动免重启。
- **主题 token 声明在 `body` 上，不在 `:root`**；`getComputedStyle(document.documentElement)` 读 `--dsw-alias-*` 返回空串，探针据此误判过「token 不存在」。
- **遮蔽靠 `priority`**：同 key 同 priority 抛错，最低者渲染；遮蔽官方 UI 用 `priority: -1`。增量入口用命名空间 `id` + `order`。

细则与证据见 `references/`。
