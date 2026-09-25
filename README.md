# dsh-plugin-manufacturing

**造 DSH（DeepSeek harness）插件的全流程技能：从探针到开源。**

官方技能 `cordis-plugin-development` 管「怎么写、怎么装」。本技能把它串成一条**六阶段流水线**，补上官方没覆盖的**交付、真机验收、开源**，并附 **26 条实测坑位**。

A skill for the entire DSH plugin lifecycle: feasibility probes, authoring guardrails, real-browser acceptance, packaging, and open-source release.

## 为什么需要它

插件的失败模式不是「写不出来」，而是**以为写完了**。一次真实交付里：

- `verify-client` 套件全绿——bundle 能执行、slot 注册成功、CSS 注入正常、零报错——用户反馈仍是「没有浮出，前端无改变」。
- 真因不是 bug：**唯一入口挂在悬停菜单里**，而当前选中的会话行根本没有那个触发器。代码侧一切正确，用户侧什么都看不到。
- 按官方文档验收与按「用户能不能看见」验收，是两件事。

## 它补上的两个官方禁令盲区

这两条是官方 `practices.md` 明令禁止、但很容易违反的：

**不得 `require` 任何 Harness Client 包。** `dsh.client.inject` 只排激活顺序，不是加载许可。理由：上游无预告变更、纯 JS 无类型检查、组件抛错会**清空你的槽位**（`slot entry crashed in '<slot>'`）。做法是把原语 markup/CSS/行为抄进自己插件、改类名前缀、只留 `--dsw-alias-*` token。

**不得用新事件类型追加会话事件。** `SessionEventMap` 是封闭接口，`ignorable: true` 是只读标记而运行期 `Session.append()` 设不了它 ⇒ 会话下次拒绝打开。「写墓碑事件来遮蔽内容」这条路是死的；内核已有 `compaction/prune`（带 `shadowedSeqs`/`shadowedRange`）可做遮蔽。

## 六阶段流水线

1. **探针定可行性**——写码之前用只读探针回答「这条路成不成立」。
2. **选渲染面**——UI 一致性由渲染面决定，选错了后续调样式救不回来。
3. **实现 + 宿主端验收**——真文件系统/真 HTTP，别 mock 自己的逻辑。
4. **真机可见性验收**——在不派发任何鼠标事件的状态下证明元素有尺寸、可见、可点。
5. **打包与安装**——manifest 契约、安装方式、卸载遗留。
6. **开源发布**——可移植化 → 密钥扫描 → CI → 发布。

每阶段都有「必须满足才许进入下一阶段」的判据。

## 目录

```
SKILL.md                    主入口：六阶段流水线、六条铁律、关键事实速查
references/authoring.md     官方「会被咬的规则」按「何时咬到你」重排 + 必查清单
references/pitfalls.md      26 条实测坑位（manifest/slot/主题/事件/客户端路由/Windows）
references/verification.md  真机可见性验收：断言什么、鉴权怎么过、重启 vs 刷新
references/packaging.md     包形态、manifest、安装、卸载遗留、README 清单
references/open-source.md   开源前清洗与发布（含发布命令的三个陷阱）
templates/harness.mjs       运行期路径解析（浏览器/依赖/cookie/URL，全可覆盖）
templates/verify.yml        无浏览器 CI（含密钥与机器路径门禁）
tools/validate.mjs          本技能的自我校验器
```

## 安装

```bash
npx skills add ghgjkbf/dsh-plugin-manufacturing -g
```

## 证据标准

技能里每条结论标了状态：

- `[已核实]`——附 `文件:行号` 或本次会话真机输出，可复现。
- `[待验证]`——只作线索，别当事实传播。

这是刻意的：写给 Agent 的技能如果混入「听起来对」的推测，会被下游当成事实继续传播。本技能自己就修正过一条——早期版本错误地声称裸 `client.js` 不被接受，实测页面 HTML 证明相反（`CLIENT_CHUNK` 只管按需路由，不管 combo 路由）。

## 校验

```bash
node tools/validate.mjs .
```

检查 frontmatter、描述触发窗口（前 57 字符，Hermes 只渲染这么多）、引用完整性、凭据与作者路径泄漏，以及关键事实是否仍在文中。CI 每次推送都会跑。

## 相关

- 官方技能 `cordis-plugin-development`（随 DSH 分发）——插件写法的权威来源。**冲突时以官方为准。**
- 官方技能 `cordis-composition-reference`——patch 层方言与可装插件清单。

## 许可

MIT
