# 包形态、安装与卸载

官方技能 `cordis-plugin-development` 的 `references/host-plugin.md` 与 `templates/decoration/` 是 manifest 写法的权威来源。这里只补交付视角的形态选择和安装路径差异。

## 双面包（宿主 + 客户端）

UI 插件是**一个包两个半边**：

```
<plugin>/
  package.json          # dsh.bundle.patch + dsh.client + exports
  cordis.patch.yml      # 把插件挂进 profile
  lib/
    index.js            # 宿主半边：export const name / inject / apply
    client.js           # 客户端半边：window.__ModuleLoader__.load({id, factory})
```

`package.json` 的要点（`[已核实]`，对照 `dsh-web-ui-notify` 与内核校验代码）：

```json
{
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-slots"]
    }
  }
}
```

`exports["./client"]` 与 `dsh.bundle.patch` 缺一个都会让插件装不上或被内核拒绝（见 `references/pitfalls.md` 第 1/4 条）。

## 两种安装方式

| 方式 | 命令 | 适用 |
|---|---|---|
| `plugin_manager` | `action: install_bundle`，`target` = 包的绝对目录 | 交给 Agent 装进当前 profile（官方推荐） |
| 手工挂载 | profile 的 `package.json` 加 `dependencies: {"<name>": "link:<绝对路径>"}` + `dsh.profile.bundles` 加名字 | 本地开发、需要 junction 直连仓库 |

`[已核实]` 手工挂载的坑：`pnpm add link:...` 可能被 registry 的 dist-tag 缺陷挡住。可行路径是**先建 junction**（`<profile>/node_modules/<name>` → 仓库目录），再手工补 `dependencies` 与 `dsh.profile.bundles` 两个字段。改 profile 前**先备份** `package.json` 与 `pnpm-workspace.yaml`（本次留下 `*.bak-dshsd-<时间戳>`）。

## 卸载

移除 profile 的 bundle 条目和 `dependencies` 里的包名即可。**但要想想插件在磁盘上留下的状态**：本次插件的回收站里还留着被移动的目录，manifest 记着每条的原始路径，可以手工还原。交付时在 README 里写清这一点——用户删插件前需要知道什么留在盘上。

## README 的交付清单

写给别人看的 README 至少要有：

- **为什么存在**：上游到底缺什么 API，用具体类型/行号说明（本次：`SessionPersistence` 只有 `create/open/flush/stat/list`）。
- **UI 里在哪**：一张表列 slot 名 + order。**常驻入口要写明"无需悬停"**，因为那正是用户会踩的坑。
- **设计承诺**：哪些操作可逆、哪些不可逆、原子性怎么保证。本次写的是"默认走回收站，只有显式彻底删除才动字节"。
- **配置项**：字段、默认值、来源（`DSH_HOME` 等）。
- **磁盘状态**：插件在哪些路径留什么文件。
- **验证怎么跑**：命令 + 需要哪些环境变量（含凭据来自环境变量这一条）。
- **卸载后遗留什么**。
