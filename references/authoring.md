# 官方规则分类速查（会被咬的那些）

官方 `cordis-plugin-development/references/practices.md` 把规则按主题平铺，共 38 行。这份文件把它们**按「什么时候会咬到你」重排**，并标出我实际踩过的雷。

冲突时以官方原文为准——本文件只是索引与补充，不是替代。

## 一、选渲染面之前必读（决定成败，事后再改没用）

官方 §6 与 §UI 的核心：**UI 一致性由渲染面决定**。

- 插件 UI 是 Harness UI 的一部分，用户看到一个应用 ⇒ 必须用宿主的主题 token、locale、布局模式。
- **不要**用 Host 提供 HTML 页面再 iframe 嵌入：iframe 拿不到主题 token、明暗切换、`ctx.locale`。
- 页面/面板渲染成 slot 里的 React 组件。
- 用 `cordis_inspect_query` `Theme` 列出的 `--dsw-alias-*` token；字面色只用于插画。
- 从同类宿主页面抄间距/字号/行式样；管理列表参照 Plugin Manager 页。

**顺序不可逆**：先把渲染面选对，再写视图。错了之后在错的面上调样式救不回来。

## 二、那颗地雷：不得 `require` 任何 Harness Client 包

官方 `practices.md` §UI 第 3 条原文：

> Do not `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package as a module; `dsh.client.inject` entries only order activation and stay allowed.

**这是官方明令禁止的**，理由有三：上游会无预告变更、纯 JS 插件没有类型检查、组件抛错会**清空你的槽位**（控制台：`slot entry crashed in '<slot>'`）。

**我违反过。** 参考插件 `dsh-session-deleter` 的 `lib/client.js` L25 `require("@deepseek-ai/dsh-client-ui-primitives")`，共 16 个调用点：

```
primitives.Button                    ×11
primitives.Modal                      ×2
primitives.IconTrashOutlineRegular    ×2
primitives.MenuItemButton             ×1
```

它**测下来能跑**——那是我上一版技能里漏掉了这条规则，不是规则错了。能跑 ≠ 合规：这颗地雷在下次上游升版时引爆，而且没有类型检查兜底。

**正确做法**（官方给的路径）：

1. 把原语的 markup、CSS、行为**抄进自己插件**。
2. 抄哪里：DSH 源码 checkout 的 `src/*.tsx` 和 `*.module.css`，或安装包里的 `lib/index.js` 与 `lib/**/*.css`。
3. 抄完**改类名到你自己的前缀**下。
4. **只保留 `--dsw-alias-*` token 引用**，不带字面色。
5. 保住用户依赖的行为：Modal 的焦点管理与 Escape、`role="switch"` + `aria-checked`、Tooltip 定位。

这样 token 成为唯一的共享样式依赖，上游改动最多让外观退化，不会让渲染崩溃。

## 三、事件与会话日志（三条硬约束）

1. **不得用新 `type` 追加会话事件**（§Stability）。读者只在信封带 `ignorable: true` 时接受未知存盘事件，而运行期 `Session.append()` **设不了**这个标记 ⇒ 会话下次会拒绝打开。要插件自有数据就放进 inspection 找到的 storage 服务。
   - 实测：`SessionEventMap` 是封闭接口（`dsh-typert-registry` 与 `dsh-api-session-controller` 里的声明），`ignorable?: true` 是只读字段。**「写墓碑事件遮蔽内容」这条路是死的。**
   - 要遮蔽用内核已有机制：`compaction/prune`、`compaction/summary` 都带 `shadowedSeqs` / `shadowedRange` / `shadowedTokenCount`——遮蔽早已是一等机制，别自造。
2. **会话日志是唯一真值**（§1）。模型能看见的一切都必须能从已提交事件重建；插件记忆是派生缓存。
3. **瀑布监听器不属于该决策就必须 `return next()`**（§Stability）。改写 `agent/pre-step` 决策时要 spread（`{...decision, messages}`），否则 `startsRequestSeries` 之类字段会丢。

## 四、用最弱的机制（§4，最容易被忽略的一条）

扩展点是共享的，从弱到强：

```
ctx.tools.restrict()      只能移除工具
ctx.tools.guard()         只能拒绝
waterfall 监听器          能改写，依赖注册顺序
system-prompt/assemble    替换整个装配
```

**越强，你要负责保留的别人的贡献就越多。** 能用 restrict 就别用 guard，能用 guard 就别用 assemble。

补充（§Stability）：必须无视顺序都成立的拒绝用 `guard()`；需要 await（例如问用户）的决策从 `tools/pre-execute` 返回 `ask`。只对某个 agent 隐藏工具用该 agent 上下文上的 `restrict()`。最终工具结果看 `tools/result`，`tools/post-execute` 只用于变换结果。**不要**监听 `system-prompt/assemble` 去增删工具或文本。

## 五、注册与所有权（§2）

注册是被上下文拥有的效果。插件卸载、agent 销毁、slot 塌陷、profile 补丁都会移除对应上下上下文上注册的东西。

- **选对拥有者上下文。**
- 注册到别的上下文（如 `agent.ctx`，在 `agent/created` 里拿到）时它**有两个所有者**：你自己的 effect 里也要留 disposer，按 agent 键存好，这样任一 teardown 都能移除。**卸载插件本身不会销毁 `agent.ctx` 上的注册。**

## 六、性能（§Performance）

- 每会话派生状态放 `ctx.sessionProjections` 单元，别订阅 `session/event` 再重扫。`apply(state, event)` 纯且同步，对忽略的事件返回同一引用 ⇒ 下游零成本。用 `stateOf()` 读。
- 状态保持纯 JSON；字段或折叠语义变了就**递增 `stateVersion`**，投影缓存据此作废重放。
- 等耐久事件（`turn/end`、`assistant/message`、`tool/result`）；实时 token 从 `agent/assistant-stream` 渲染。**别轮询 `agent/status`**。
- 定时器里要唤醒 agent 用 `agent.followup()`；`agent.inject()` **不**唤醒，注入的上下文可能在收件箱里等到别的输入才被看到。

## 七、可升级性

- 可调值放插件的 `Config`，让用户在 `cordis.patch.yml` 里改；用户的补丁层能熬过升级。
- 可选服务放 `inject` 或 `ctx.inject([...], ...)`，让插件在没有该服务的 profile 里保持不激活，而不是抛错。
- 别人和别的 Harness 版本会读你写的数据：未知事件类型、旧读者、旧缓存都会遇到 ⇒ 按 Harness 提供的信封字段与版本声明兼容性。

## 八、客户端半边

- 浏览器产物注册一个惰性工厂，**`id` 等于包名**，`exports["./client"]` 指向它。
- React 来自浏览器模块表；**不需要**重复安装 React、CDN script 或 UMD 搜索。
- factory 保持**无副作用**；样式、定时器、监听器在 `apply` 里用 `ctx.effect`/`ctx.on` 注册并返回 cleanup。
- 组件级样式可作为 React 元素渲染，卸载即移除。
- 通过 slot 贡献：`ctx.slots.inject(ownerKey, () => ctx.slots.register(...))`。回调里的注册在拥有该声明的槽位塌陷时销毁、回来时重装。
- 读会话数据走 slot props 的选择器钩子，订阅最小切片。
- **不要**在自己的组件外写 DOM，**不要**往 `document.body` 追加。
- 加 Chat 行：`ctx.uiConversation.events.register()` 注册事件定义 + 在 `conversation.chat.node` 槽下以定义的 `kind` 为 key 注册视图。
- 客户端要会话派生值：在 Host 投影上声明 `wire.view`，值算好再送到客户端；**客户端不要自己折叠会话事件**。
- 可见 UI 文本走客户端 locale 服务。

## 九、验证底线（官方 `references/verification.md`）

- 优先用已连上 Harness 的**已鉴权页面**。
- **不要**：从 shell 启动独立浏览器、改 `HOME`、翻个人浏览器 profile、搜认证 token、改 keychain 去换一张截图。
- 没有浏览器控制时，视觉类请求的验证只做到语法、manifest 校验、活 slot 注册，然后**如实报告视觉验证不可得**。
- **不要**为了补偿去找光栅化器、调 Quick Look、把 SVG 抽成预览文件、模拟 React/DOM、自写渲染器。**mock 页面的截图不是运行中插件的验证。**
- 测试子进程与临时资源用唯一自有的目录、限时执行、记得清理。
- 可选预览失败不得演变成环境修复，也不得阻塞安装。

> 这条与阶段 4 不矛盾：阶段 4 要的是**真实页面**的 DOM 证据。拿不到就别声称验过——这正是官方要求的诚实报告。
