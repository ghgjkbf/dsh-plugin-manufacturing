# shipping-dsh-plugins

**给 DSH（DeepSeek harness）插件作者的交付与开源技能。**

官方技能 `cordis-plugin-development` 管「怎么写、怎么装」。本技能管它没管的另一半：**装完之后怎么证明它真的能用、怎么让别人也能装上、怎么开源**。

A skill for shipping and open-sourcing DSH (DeepSeek harness) plugins: real-browser acceptance, portability, credential hygiene, and publication.

## 这个技能解决什么问题

插件的失败模式不是"写不出来"，而是**以为写完了**。一次真实交付（一个会话删除插件）里：

- `verify-client` 套件全绿——bundle 能执行、slot 注册成功、CSS 注入正常、零报错——但用户的实际反馈是「没有浮出，前端无改变」。
- 真因不是 bug，是**唯一入口挂在悬停菜单里**，而当前选中的会话行根本没有那个触发器。代码侧一切正确，用户侧什么都看不到。
- 按官方文档验收与按"用户能不能看见"验收，是两件事。

本技能把这类教训固化成流程和清单，附 **20 条实测坑位**（每条带 `文件:行号` 或命令输出证据）。

## 安装

作为技能装进你的 Agent：

```bash
npx skills add ghgjkbf/shipping-dsh-plugins -g
```

或者直接把本仓库克隆到你的技能目录。

## 五阶段流程

1. **探针先关可行性**——写代码之前用只读探针回答"这条路成不成立"。
2. **宿主端验收**——跑真文件系统/真 HTTP，别 mock 自己的逻辑。
3. **真机可见性验收**——在真浏览器里用 DOM 查询证明元素存在、可见、可点，**且不依赖悬停**。
4. **可移植化**——机器路径、凭据、绝对路径全部清出仓库。
5. **开源发布**——`.gitignore` / `.gitattributes` / LICENSE / CI，然后发布。

## 目录

```
SKILL.md                    主入口：流程、铁律、关键事实速查
references/pitfalls.md      20 条实测坑位（manifest / slot / 主题 / 事件 / Windows 文件系统）
references/verification.md  真机可见性验收：该断言什么、鉴权怎么过、重启 vs 刷新
references/packaging.md     包形态、manifest 契约、两种安装方式、README 交付清单
references/open-source.md   开源前清洗：密钥扫描、可移植化、CI、发布命令与陷阱
templates/harness.mjs       运行期路径解析器（浏览器/依赖/cookie/URL，全环境变量可覆盖）
templates/verify.yml        无浏览器 CI 工作流（含密钥与机器路径的门禁扫描）
tools/validate.mjs          本技能的自我校验器
```

## 三条最有价值的结论

**注册成功 ≠ 用户看得见。** 可见性必须在真浏览器里用 `getBoundingClientRect` + `elementFromPoint` 证明，且在**不派发任何鼠标事件**的状态下测。悬停才出现的入口不算交付。

**宿主改动必须重启进程；客户端改动刷新即可。** `lib/index.js` 在进程启动时 `require` 一次，禁用再启用插件条目**不会**重载（Node ESM 缓存）。别在宿主改动上"刷新页面看看"——那是空等。

**自造 manifest 字段静默失效。** 真实契约只有 `dsh.bundle` + `dsh.client`。实测 `dsh.manifestVersion` 在安装里 **0 个消费者**（全库 grep 计数 = 0）。不报错，也不生效。

## 证据标准

技能里每条结论标了状态：

- `[已核实]`——附 `文件:行号` 或本次会话真机输出，可复现。
- `[待验证]`——只作线索，别当事实传播。

这是刻意的：写给 Agent 的技能如果混入"听起来对"的推测，会被下游当成事实继续传播。

## 校验

```bash
node tools/validate.mjs .
```

检查 frontmatter、描述触发窗口（前 57 字符，Hermes 只渲染这么多）、引用完整性、凭据与机器路径泄漏，以及关键事实是否仍在文中。CI 每次推送都会跑。

## 相关

- 官方技能 `cordis-plugin-development`（随 DSH 分发）——插件写法的权威来源：manifest 形态、slot 注册、`plugin_manager install_bundle`。冲突时以官方为准。
- 官方技能 `cordis-composition-reference`——patch 层方言与可装插件清单。

## 许可

MIT
