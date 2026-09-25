# 真机可见性验收

`[已核实]` 最有价值的一条教训：**注册成功 ≠ 用户看得见**。

一次交付里 `verify-client.mjs` 全绿（slot 注册、bundle 执行、CSS 注入全部断言通过），但用户的反馈是「没有浮出，前端无改变」。代码侧所有假设都被证伪了（CSS 全命名空间、无污染、冷缓存干净、零报错），真因是**入口只在悬停菜单里，而当前会话行根本没有那个触发器**。

所以验收分两层，缺一层都不算完：

| 层 | 证明什么 | 手段 |
|---|---|---|
| 注册层 | bundle 能执行、slot 注册成功、资源注入 | VM + stub loader 跑 `lib/client.js` |
| 可见层 | 用户在真页面里真的看得见、点得到 | 真浏览器 + DOM 查询 |

## 可见层必须断言的五件事

1. **几何**：`getBoundingClientRect()` 的宽高 > 0。`[已核实]` 悬停才出现的元素静止时是 `0×0`。
2. **可见性**：`getComputedStyle` 的 `display`/`visibility`/`opacity` 不隐藏。
3. **可点性**：`document.elementFromPoint(cx, cy)` 命中的就是目标元素（不被遮挡），本次实测 `hitTarget: "BUTTON.dshsd-foot-entry"`。
4. **不依赖悬停**：在**不派发任何鼠标事件**的状态下测上面三项。这是本次的核心教训。
5. **端到端走通**：真指针点击 → 目标事物出现 → 目标行为可执行。本次链路：常驻按钮 → picker 打开（25 行 + 管理按钮）→ 点某行 → 真删除计划弹出。

## 鉴权

GUI 是**授权绑定的签名 HttpOnly cookie**，不是登录表单：

- 名字 = `dsh-auth-` + `base64url(sha256(authority))`
- 值 = `v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, body))>`，payload 是 `{version, authority, issuedAt, expiresAt}`
- secret 在 `$DSH_HOME/.credentials.yaml` 的 `records: client-connection/browser-session`
- 不带 cookie 访问 `GET /` → `401 dsh web authentication required; reopen the URL printed by dsh web.`

**工具只能从环境变量读 cookie，绝不写进仓库**。模板 `templates/harness.mjs` 的 `cookiePair()` 已经这么做了：读 `DSH_COOKIE_NAME` / `DSH_COOKIE_VALUE`，缺失时返回 `null`，调用方据此退出并提示（本次用 `exit 2` 加一句明确说明）。

## 重启 vs 刷新（别搞混，会白等）

| 改动 | 生效方式 |
|---|---|
| 客户端半边（`lib/client.js`、CSS、slot 注册） | **刷新页面**即可，无需重启 `[已核实]` |
| 宿主半边（`lib/index.js`、路由、文件逻辑） | **必须重启进程** `[已核实]`。禁用/启用插件条目是空操作（Node ESM 缓存） |

`[已核实]` 客户端改动免重启的原因：每次页面加载都会重算 rev（`artifactRevision` 取 `[mtimeMs, ctimeMs, size]` 的哈希前 12 位），rev 变了就取新 bundle。

## 探针产物要留

只读探针（`tools/probe-*.mjs`）不要用完就删。它们回答的是"这条路成不成立"，是后续维护者对**为什么这么设计**的唯一证据来源。本次留了 12 个。

## 别做的

- **别为"没有浏览器控制"去找光栅化器、截图工具、DOM 模拟器**（官方 `cordis-plugin-development/references/verification.md` 明确禁止）。拿不到真机证据时，**如实报告"可见性未验证"**，不要用 mock 页面的截图冒充验收。
- **别在探针里靠函数跨边界**：`page.evaluate` 传函数时它会被序列化成文本，正则等字面量会变形。本次一个 ASCII `"` 与全角 `“ ”` 的差异导致修复正则失效——**把正则当字符串传进 `page.evaluate`**。
