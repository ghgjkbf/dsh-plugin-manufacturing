# 26 条实测坑位

每条都来自一次真实交付。标 `[已核实]` 的附证据；标 `[待验证]` 的只作线索。

## 0. 技能目录被 patch 层覆盖（写插件前必须先查）

**0. 你自己那层 patch 可能把官方插件技能挤掉了** `[已核实，踩过整场]`

症状：会话里明明有 `cordis-plugin-development` 这个技能，`skill` 工具却不知道它；`skill cordis-plugin-development` 是盲调——命中与否全看运气。整场插件开发期间我**一次都没调用过官方技能**，直到事后才发现。

机制（`~/.dsh/cordis.patch.yml` × `dsh-web-app/presets/cordis.patch.yml`）：

- preset `cordis` 用 `skill-filesystem` 行把**官方技能目录**接进来，靠的是 `customSkillDirs`：
  ```yaml
  customSkillDirs:
    - !!js ....join(dirname(createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')
  ```
- 你自己的 `~/.dsh/cordis.patch.yml` 里写了**同一个 row id** `skill-filesystem`，而补丁层是**按 row id 后者覆盖前者**。
- 于是 preset 的 `customSkillDirs`（官方三件套）被整条替换掉，只剩你的两个目录：
  ```yaml
  customSkillDirs:
    - '<HUB>\skills'          # 你的聚合库
    - '<HOME>\.agents\skills' # npx skills add -g 的下载落点
  ```

**证据**：本会话（2314 帧 / 4054 事件**全解**）里 `cordis-plugin-development` 首次出现是 event **#3360**，类型 `tool/result`——那是事后扫文件系统的输出，不是目录注入。此前 **0 次**；真实的 `skill` 工具调用全场**仅 1 次**。而我确实调过别的技能，说明 `skill` 工具本身是通的，缺的就是官方那几个。

**注意顺序**：`includeDefaultRoots` 只补 `project/.dsh/skills`、`project/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills` 与 `bundledSkillDir`（`dsh-skill-filesystem/lib/index.js` L150-188），**不含 preset 目录**。而 `bundledSkillDir` 默认读环境变量 `DSH_BUNDLED_SKILL_DIR`——本机三级作用域**全为空**，所以那条兜底也没接上。

**做法**：在你那层 patch 的 `skill-filesystem` 行里**把 preset 目录补进去**，而不是只写自己的：

```yaml
- id: skill-filesystem
  disabled: false
  config:
    includeDefaultRoots: true
    customSkillDirs:
      - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')
      - '<HUB>\skills'
      - '<HOME>\.agents\skills'
```

**验证方式**（不必重启 GUI）：`dsh headless "<问一句技能目录里有哪些技能>"` 会在独立进程里启动一套配置并回话，比 dump 可靠——`--dump-config` 会把 `!!js` 表达式**原样打印源码**，既证明不了求值成功、也看不出最终目录。

**通用教训**：patch 层按 **row id** 覆盖，不是合并。你在自己那层写任何与上游同名的 row，都是在**整条替换**它。写插件、改配置前先查「这条 row 上游有没有」，有就别裸写。

## A. Manifest 与包形态

**1. 真实契约只有 `dsh.bundle` + `dsh.client`** `[已核实]`

内核只认这两个字段。`dsh.client` 的形状校验在 `dsh-client-modules/lib/index.js` L63-73：`platform` 必须字符串，`inject`/`external` 必须字符串数组，`immediately` 必须布尔。形状不对直接抛 `client-modules: <pkg> has a non-object dsh.client declaration`。

**2. 自造字段静默失效** `[已核实]`

`dsh.manifestVersion` 全库（`@deepseek-ai/*`）grep 计数 = **0**。自造字段不报错、无效果，只会让人以为写了配置。

**3. `dsh.client.inject` 是客户端模块依赖图，不是 cordis 服务列表** `[已核实]`

它列出的是"先物化哪些**客户端包**"，`arriveGraphRow` 会按它把每个包先造出来。`@deepseek-ai/dsh-client-ui-primitives` 是**种子**，不用列也能用。别照抄别的插件的 `inject`——`turn-rewind` 里写了已删除的 `settingsScope`，抄了就崩。

**4. 客户端半边入口是 `exports["./client"]`，路径任意** `[已核实]`

内核只要求该 subpath 存在，否则抛 `declares dsh.client but exports no "./client" bundle`（`clientExportOf`，接受字符串或 `{default: "…"}`）。文件名随意——官方 `templates/decoration/` 用的是裸 `client.js`。

**4b. `CLIENT_CHUNK` 只管按需路由，别把它当成全局命名限制** `[已核实，上一版写错过]`

`/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`（`dsh-client-modules/lib/index.js` L169）的注释写明是 **"Published package-local client chunk names accepted by the on-demand route"**。实测证据：真实页面 HTML 里所有插件用的都是**裸** `<pkg>/client.js`，包括本仓库的参考插件：

```
plugins/??…,dsh-purge/client.js,dsh-session-deleter/client.js,dsh-pocket/client.js,…&rev=b7f08a33401f
```

上一版本技能写成「裸 `client.js` 不匹配，文件名必须有第二段」——**错的**，混淆了 combo 路由与按需路由。教训：读到一条正则就去验证它守哪条路径，别从名字推断适用范围。

**4c. 所有插件的客户端包走同一条 combo 请求** `[已核实]`

形态 `/plugins/??<包A>/client.js,<包B>/client.js,…&rev=<rev>`。实测该请求一次带了 62 个 chunk（官方层）+ 13 个（第三方层）。推论：**一个插件的 `client.js` 语法错误可能影响整条 combo 的加载**——排查「我的插件没生效」时先看这条请求的状态码与完整性。

**5. 探测插件资源必须用真实 URL** `[已核实]`

必须与内核生成的 `chunkUrl` 逐字节一致，含真实 `rev` 与 `??` combo 形式。用猜的路径直接取会拿到**裸 404、无 content-type**——很容易误判成「插件坏了」。`rev` 在页面 HTML 的 `plugins/??…&rev=` 里，直接从那里取。（注意 HTML 里 `&` 被转义成 `&amp;`，解析时要还原。）

**7. rev 由文件元数据算出来** `[已核实]`

`artifactRevision(baseline)` = 对 `[mtimeMs, ctimeMs, size]` 做 `framedHash("plugin-artifact", …)`，取前 `HASH_REVISION_LENGTH = 12` 位（L162/L193）。所以改文件 → rev 变 → 客户端自动拿新版。**这也是客户端改动免重启的原因**。

**7b. 不得 `require` 任何 Harness Client 包** `[已核实，官方明令，我违反过]`

官方 `practices.md` §UI：`dsh.client.inject` 只排激活顺序，**不是**加载许可。参考插件 `dsh-session-deleter/lib/client.js` L25 违反此条，`primitives.*` 共 16 个调用点。它能跑，但那不是合规——上游改版会崩，且纯 JS 无类型检查，抛错会清空槽位（`slot entry crashed in '<slot>'`）。

正确做法：把原语 markup/CSS/行为抄进自己插件、改类名前缀、只留 `--dsw-alias-*` token。细节见 `authoring.md` §2。

**7c. 不得用新事件类型做「墓碑」** `[已核实，官方明令]`

官方 `practices.md` §Stability 与内核一致：`SessionEventMap` 是**封闭接口**，`ignorable?: true` 是只读标记而运行期 `Session.append()` 设不了它 ⇒ 会话下次拒绝打开。

实测 `SessionEventMap` 里已有 `compaction/prune`、`compaction/summary`，均带 `shadowedSeqs` / `shadowedRange` / `shadowedTokenCount`——**遮蔽早已是内核一等机制**。要遮蔽就用它，别自造墓碑类型。

## B. Slot 与 UI

**8. 遮蔽靠 priority，同 key 同 priority 抛错** `[已核实]`

`priority = options.priority ?? 0`，最低者渲染。same key + same priority 直接抛。**要遮蔽 shipped UI 必须 `priority: -1`**。

**9. 增量入口用「命名空间 id + order」，不要抢 key** `[已核实]`

新增菜单项/按钮用独立 `id`（如 `session-deleter.delete`）加 `order`（本次用 500/20/50/10），与 shipped 的条目共存。

**10. 悬停才出现的入口不算可见** `[已核实]`

真实反馈是「没有浮出」。以会话行为例：`...` 触发器只在鼠标移到**非当前**行时才有尺寸（静止 0×0，悬停后 16×16），**当前选中行根本没有该触发器**（实测 `{"text":"新会话","trigger":false}`）。只在悬停菜单里放入口 = 用户看不到。**交付可见性必须有不悬停也能看见的常驻入口。**

**10b. 第三方插件打不开 shell 的 Settings 面板，别把入口指向它** `[已核实，用户报障]`

现象：插件里两个「跳转管理页」按钮点了毫无反应（用户报「点击管理回收站和跳转管理页都无法正常跳转」）。

根因不是笔误，是**设计错误**。`ctx.layout.selectPanel(id)` 只接受注册在 `sidebar.panellist` 槽里的 id（该槽 catalog 原文：*"Global panel icons. Each list id addresses the matching main panel"*）；实测该槽 occupants 只有 `plugins`、`dsh-market` —— **`"settings"` 不是合法 id**，调用**抛错**，而错误被 `try{...}catch{}` 吞掉 ⇒ 静默 no-op。

而 Settings 面板本身是 **shell 拥有**的：`settings.section` 的 `declaredBy` 是 `sidebar.settings` 槽，开合状态是 `ui-settings-general` 组件内部的 `useState`，`openSettings` 只作为 props 向下传给 `settings.launcher` 的占用者。**全库 grep 确认没有任何客户端 Service 能让第三方插件打开它。**

判定方法（写码前先查，别写完再试）：

```
cordis_inspect_query platform=client provider=Slots method=listSubTree  input={"root":"sidebar.panellist"}
cordis_inspect_query platform=client provider=Slots method=listSubTree  input={"root":"sidebar.settings"}
```

看第一处 `occupants` 里有你要的 id 吗；看第二处 `declaredBy` 是不是 shell 的槽。**没有官方 open API 时，正确做法是渲染插件自己的 `shell.overlay` 覆盖层**，同一组件复用给 `settings.section`，两条路径共享一个 body 才不会漂移。可保留一次 `selectPanel("settings")` 作"万一将来注册了"的礼貌尝试，但**兜底必须是自己的覆盖层**——否则失败时按钮就是死的。

配套铁律：**`catch {}` 前先问「这里抛错会怎样」。** 本插件同一函数里既有 `catch {}` 吞掉真实错误，又有 `async` 函数里被裸 `.catch(() => undefined)` 吞掉的 `ReferenceError`（前一版另一起事故）。纯工具函数**绝不裸 catch**——把编程错误变成"静默空结果"是最贵的 bug 类型。

**10c. `t("key")` 引用了不存在的字典键 ⇒ 界面显示字面 key** `[已核实]`

本次验收时发现对话框取消按钮渲染成 **`dialog.cancel`**（不是「取消」）。该 key 在 zh/en **两份字典里都不存在**，而调用点一直存在（`git show HEAD` 确认是**历史遗留、非本轮引入**）。静态扫描一次即得：

```js
// 每个 t("...") 的 key 必须在两份字典里都存在；顺带查同字典内重复键
const used = new Set([...src.matchAll(/\bt\("([^"]+)"\)/g)].map(m => m[1]));
```

**扫描必须先把字典体按花括号切出来**：直接正则全文会把字典外的代码字面量也算成键（`? "timeout" : "network"` 会被误报成重复键），本次踩过。本插件已固化为 `tools/check-locale.mjs` 并接入 CI。

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
