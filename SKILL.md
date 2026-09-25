---
name: shipping-dsh-plugins
description: 写完 dsh/cordis 插件、要发布开源、或排查「装了却没反应」时触发：真机验收 → 可移植化 → 安全清洗 → GitHub 开源，附 20 条实测坑位。写插件本身先用官方 cordis-plugin-development。
---

# 交付并开源 dsh 插件

官方技能 `cordis-plugin-development` 管**写与装**（manifest 形态、slot 注册、`plugin_manager install_bundle`）。本技能管它没管的另一半：**装完之后怎么证明它真的能用、怎么让它能被别人装、怎么开源**。两者串起来用，别重复读官方那份。

本技能全部结论来自一次真实交付（`dsh-session-deleter`：会话删除插件，从探针到公开仓库）。凡标 `[已核实]` 的都有 `文件:行号` 或命令输出证据；标 `[待验证]` 的别当事实传播。

## 五阶段流程

插件的失败模式不是"写不出来"，而是**以为写完了**。按顺序收口：

1. **探针先关可行性**（写代码之前）。用只读探针回答"这条路成不成立"，而不是先设计再发现不可行。一次交付里两个探针都给了否定答案，提前省掉整条错路。探针产物留在 `tools/probe-*.mjs`。
2. **实现 + 宿主端验收**：纯逻辑套件跑真文件系统/真 HTTP，别 mock 自己的逻辑。
3. **真机可见性验收**：`[已核实]` **注册成功 ≠ 用户看得见**。必须在真浏览器里用 DOM 查询证明元素存在、可见、可点。这是最容易漏的一环，详见 `references/verification.md`。
4. **可移植化**：把机器路径、凭据、绝对路径全部清出仓库。详见 `references/open-source.md`。
5. **开源发布**：`.gitignore` / `.gitattributes` / LICENSE / CI，然后 `gh repo create --push`。

## 铁律（违反过，代价记在案）

- **宿主改动必须重启进程**。`lib/index.js` 在进程启动时 `require` 一次；禁用再启用插件条目**不会**重载（Node ESM 缓存）。客户端改动刷新页面即可生效，无需重启。别在宿主改动上"刷新页面看看"——那是空等。
- **别把纯函数包在裸 `.catch(() => undefined)` 里**。一次交付里这个写法把 `ReferenceError` 吞成"0 条数据"，排查了很久。要么让它抛，要么只捕获自己明确的那类错误。
- **`apiJson` 之类的包装必须是全函数（never reject）**，且 `setBusy(false)` 放 `finally`。`response.text()` 写在 `try` 外会让 UI 永久卡在"处理中"。
- **悬停才出现的入口不算"前端能看到"**。用户的原话就是「没有浮出」。交付可见性 = 不悬停也能看见的常驻入口。
- **仓库里永不出现 bearer 凭据**。工具从环境变量读，缺了就跳过并明说，别硬编码。

## 读什么

| 任务 | 文件 |
|---|---|
| 20 条实测坑位（manifest / slot / 主题 / 事件 / Windows 文件系统） | `references/pitfalls.md` |
| 真机可见性验收：DOM 查询、产物直连、鉴权、重启 vs 刷新 | `references/verification.md` |
| 包形态、manifest 契约、两种安装方式、卸载 | `references/packaging.md` |
| 开源前清洗：可移植化、密钥扫描、CI、发布命令 | `references/open-source.md` |
| 可移植路径解析器（直接抄进 `tools/harness.mjs`） | `templates/harness.mjs` |
| 无浏览器 CI 工作流 | `templates/verify.yml` |

官方技能 `cordis-plugin-development` 及其 `references/{host-plugin,ui-plugin,practices,verification,mcp-bundle}.md`、`templates/decoration/` 仍是插件写法的权威来源——本技能不复制它们，冲突时以官方为准。

## 关键事实速查（都验证过）

- **Manifest 真实契约只有 `dsh.bundle` + `dsh.client`** `[已核实]`。`dsh.client.platform` 必须是字符串，`inject`/`external` 是字符串数组，`immediately` 是布尔；形状不合会直接抛错（`dsh-client-modules/lib/index.js` L63-73）。
- **别自造字段**：`dsh.manifestVersion` 在安装里 **0 个消费者** `[已核实]`（全库 grep `manifestVersion` 计数 = 0）。自造字段不会报错，只会静默无效果。
- **客户端 chunk 名必须匹配 `/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`** `[已核实]`（L169）。裸 `client.js` 不匹配——文件名里必须有第二段。
- **`exports["./client"]` 是客户端半边的唯一入口**，接受字符串或 `{default: "…"}` `[已核实]`（`clientExportOf`）。
- **主题 token 声明在 `body` 上，不在 `:root`** `[已核实]`。`getComputedStyle(document.documentElement)` 读 `--dsw-alias-*` 返回空串，探针据此误判过"token 不存在"。

细则和证据见 `references/pitfalls.md`。
