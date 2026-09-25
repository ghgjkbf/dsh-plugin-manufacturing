# 20 条实测坑位

每条都来自一次真实交付。标 `[已核实]` 的附证据；标 `[待验证]` 的只作线索。

## A. Manifest 与包形态

**1. 真实契约只有 `dsh.bundle` + `dsh.client`** `[已核实]`

内核只认这两个字段。`dsh.client` 的形状校验在 `dsh-client-modules/lib/index.js` L63-73：`platform` 必须字符串，`inject`/`external` 必须字符串数组，`immediately` 必须布尔。形状不对直接抛 `client-modules: <pkg> has a non-object dsh.client declaration`。

**2. 自造字段静默失效** `[已核实]`

`dsh.manifestVersion` 全库（`@deepseek-ai/*`）grep 计数 = **0**。自造字段不报错、无效果，只会让人以为写了配置。

**3. `dsh.client.inject` 是客户端模块依赖图，不是 cordis 服务列表** `[已核实]`

它列出的是"先物化哪些**客户端包**"，`arriveGraphRow` 会按它把每个包先造出来。`@deepseek-ai/dsh-client-ui-primitives` 是**种子**，不用列也能用。别照抄别的插件的 `inject`——`turn-rewind` 里写了已删除的 `settingsScope`，抄了就崩。

**4. 客户端 chunk 名有格式要求** `[已核实]`

按需路由只接受 `/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`（L169，"Published package-local client chunk names accepted by the on-demand route"）。裸 `client.js` 不匹配。同时 `exports["./client"]` 必须存在，否则抛 `declares dsh.client but exports no "./client" bundle`。

**5. 所有插件的客户端包走同一次 combo 请求** `[已核实]`

形态是 `/plugins/??<包A>/client.js,<包B>/client.js,…,&rev=<rev>`。实测这一条 URL 里一次性带了十几个插件的 client。推论：**一个插件的 `client.js` 语法错误可能影响整条 combo 的加载**——排查"我的插件没生效"时先看这条请求的状态码和数据完整性。

**6. 探测插件资源必须用真实 URL，不能用猜的路径** `[已核实]`

必须与内核生成的 `chunkUrl` 逐字节一致，含真实 `rev`，且用 `??` combo 形式。用 `/plugins/<name>/client.js` 直接取会拿到**裸 404、无 content-type**——很容易误判成"插件坏了"。

**7. rev 由文件元数据算出来** `[已核实]`

`artifactRevision(baseline)` = 对 `[mtimeMs, ctimeMs, size]` 做 `framedHash("plugin-artifact", …)`，取前 `HASH_REVISION_LENGTH = 12` 位（L162/L193）。所以改文件 → rev 变 → 客户端自动拿新版。**这也是客户端改动免重启的原因**。

## B. Slot 与 UI

**8. 遮蔽靠 priority，同 key 同 priority 抛错** `[已核实]`

`priority = options.priority ?? 0`，最低者渲染。same key + same priority 直接抛。**要遮蔽 shipped UI 必须 `priority: -1`**。

**9. 增量入口用「命名空间 id + order」，不要抢 key** `[已核实]`

新增菜单项/按钮用独立 `id`（如 `session-deleter.delete`）加 `order`（本次用 500/20/50/10），与 shipped 的条目共存。

**10. 悬停才出现的入口不算可见** `[已核实]`

真实反馈是「没有浮出」。以会话行为例：`...` 触发器只在鼠标移到**非当前**行时才有尺寸（静止 0×0，悬停后 16×16），**当前选中行根本没有该触发器**（实测 `{"text":"新会话","trigger":false}`）。只在悬停菜单里放入口 = 用户看不到。**交付可见性必须有不悬停也能看见的常驻入口。**

**11. 主题 token 在 `body` 上** `[已核实]`

`--dsw-alias-*` 声明在 `body`，不在 `:root`。`getComputedStyle(document.documentElement)` 读出来是空串。用 `body` 读。实测可用：`--dsw-alias-label-primary` `#0f1115`、`--dsw-alias-label-secondary` `#61666b`、`--dsw-alias-label-tertiary` `#81858c`、`--dsw-alias-border-l2` `#0000001a`。

**12. 图标组件不收 props** `[已核实]`

官方图标组件**不接受 `size` 等任何 props**。传 `{size: 14}` 无效；要调尺寸用 CSS。调用形式就是 `j(IconTrashOutlineRegular, {})`。

**13. CSS 必须自带命名空间** `[已核实]`

所有类名加插件前缀（本次 `.dshsd-`）。这既避免污染别的插件，也让"样式没生效"的排查变简单——直接数自己前缀的 tag 在不在。

**14. locale 注册的两种形态** `[已核实]`

`ctx.locale.register(ns, localeOrDicts, dict)`：第二参是对象时走 `Object.entries(...)`，所以 `register(NS, {zh, en})` 是对的写法。

## C. 事件与运行期

**15. 客户端 require 有白名单** `[已核实]`

可用的：`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-slots`。非基线依赖要在 `dsh.client.external` 里声明。

**16. 手写客户端 bundle 时用 `window.__ModuleLoader__.load({id, factory})`，不能有构建步骤** `[已核实]`

`id` 等于包名，`factory(require)` 里返回 exports。没有 JSX 语法，元素用 `react/jsx-runtime` 的 `jsx/jsxs` 显式构造。factory 保持无副作用，资源注册放 `apply` 里并返回 cleanup。

**17. 宿主模块在进程启动时 `require` 一次，禁用再启用不会重载** `[已核实]`

`@deepseek-ai/dsh-hmr` 是活跃的，但对已经进 Node 模块缓存的宿主模块，`include:` 的禁用/启用是空操作。**改宿主的唯一路径是重启进程。** 客户端半边刷新页面即生效。

**18. 「归档但不删」这类闸门可以复用，别自造** `[设计推论，M1 待实测]`

`WorkspaceRegistry.archiveSession(id, {stopActivity})` 在活动上报有活时不放行；`ArchivedSessionGate` 拦截 archived 会话及其子代理血统的 `agent/pre-step`。要"删除前先停活动"应复用这一对事件。

## D. Windows 与文件系统

**19. Windows `rename` 对占用中的目录返回 `EPERM`** `[已核实]`

POSIX 直觉（`ENOTEMPTY`/`EBUSY`）不适用。原子替换的实现要按 `EPERM` 处理目标占用。

**20. 同秒备份名会撞** `[已核实]`

按时间戳生成备份名时，同一秒内的两次操作会互相覆盖。加随机后缀（`randomBytes(3)`）或计数器。

## E. 别做的

- **别把纯函数包进裸 `.catch(() => undefined)`**——会把真实 `ReferenceError` 吞成空结果（本次踩过，`inventory()` 返回 0 行）。
- **别让 `setBusy(false)` 依赖 `try` 内完成**——`response.text()` 在 `try` 外失败会让 UI 永久"处理中"。包装函数做全函数，清理放 `finally`。
- **别在仓库里写死机器绝对路径**——见 `error-handling` 之外的 `references/open-source.md`。
