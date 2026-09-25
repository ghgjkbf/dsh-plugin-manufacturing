# 开源前清洗与发布

一次真实发布（`dsh-session-deleter` → GitHub）的完整清单。**顺序很重要：先清洗，再 init。**

## 1. 密钥扫描（必做，会真的中）

本次扫出一个**完整可用的 GUI 会话 cookie**，硬编码在 `tools/restart-and-verify.ps1` 里——那是 bearer 凭据，拿到就能冒充用户访问 GUI。不是理论风险。

扫描时**别用 `-SimpleMatch` 配 `|`**（那会把 `|` 当字面量，等于没扫）。用正则：

```powershell
Select-String -Path (Get-ChildItem -Recurse -File -Include *.js,*.mjs,*.ps1,*.md,*.json,*.yml) `
  -Pattern 'gho_|ghp_|dsh-auth-|eyJ2ZXJzaW9u|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=]\s*["''][A-Za-z0-9_\-]{16,}'
```

修复原则：**凭据只从环境变量读**，缺失时跳过该步骤并明确说明，不要留硬编码默认值。同时**清掉 git 历史里可能已有的**（本次是首次提交，无历史负担；有历史就要用 `filter-repo`）。

## 2. 可移植化（别人 clone 下来要能跑）

本次有 15 个工具文件散布 `C:\Users\Administrator\...` 绝对路径，别人一行都跑不了。做法：

- 建 `tools/harness.mjs` 集中解析运行期路径：浏览器可执行文件、`puppeteer-core`、输出目录、GUI URL、cookie。**每个值都有环境变量覆盖**（`DSH_CHROME`、`DSH_PUPPETEER_CORE`、`DSH_SHOTS_DIR`、`DSH_URL`、`DSH_SESSIONS_DIR`、`DSH_HOME`）。
- 用 `$PSScriptRoot` / `$env:` 把脚本里的绝对路径换掉，而不是写死。
- 定义域内**允许存在**的默认值只能有一处（本次只剩 `harness.mjs` 里解析器的默认值），其余全部走覆盖。

**批量替换的教训**：本次用脚本改路径时只把函数**别名导入而没调用**（`const X = X_PATH;`），产出 `file:///${函数体源码}` 这种垃圾路径，14 个文件全废。**改完一定先跑一次 `node --check` 加一轮真实验证**，别信替换脚本的自述。改之前先备份（本次备份到 `%TEMP%`）。

## 3. 私人内容

判断标准：**这条信息对项目有用，还是只对作者本人有用？**

本次没上传 `MEMORY.md`——它是跨会话工作账本，含机器绝对路径、内部会话 id、重启 PID。加了 `.gitignore` 条目留在本地。**不是所有文档都该公开**；技术内容想公开就摘出来另写。

## 4. 必需文件

- **`.gitignore`**：`node_modules/`、日志、截图输出目录、`.env*`、`*.credentials.yaml`、工作账本。
- **`.gitattributes`**：`* text=auto eol=lf`，`*.ps1 text eol=crlf`，二进制类型标 `binary`。不加的话 Windows 工作副本会把每个文件改成 CRLF，diff 全是噪声，git 也会对每个文件刷 warning。
- **`LICENSE`**：MIT 模板即可（`package.json` 里 `license` 字段要一致）。
- **CI**：只跑**无浏览器、无凭据**的套件（`templates/verify.yml`）。浏览器套件需要运行中的 GUI + 签名 cookie + 真 Chrome，干净 runner 上没有——留在本地验收，并在 README 里说明。
- **README**：见 `references/packaging.md` 的交付清单。

## 5. 发布命令

```powershell
git init -b main
git add -A
git status --short          # 看一眼 staged 里有没有不该有的
git commit -F <消息文件>     # 见下方陷阱
gh repo create <name> --public --source . --remote origin --push
```

**陷阱一：多行 commit message 别直接写在命令行里。** PowerShell 会把消息里的 `/session-deleter` 之类当成路径参数，报 `is outside repository`。写进文件用 `git commit -F`。

**陷阱二：`gh` 返回非零不代表失败。** 推送成功时 `gh` 仍可能退出 1，因为 git 的进度输出走了 stderr。**以远端实际状态为准**验证：

```powershell
gh api repos/<owner>/<repo>/contents --jq '.[].name'
git rev-parse HEAD; git rev-parse origin/main   # 两个 SHA 必须相同
```

**陷阱三：`github.com:443` 可能不稳定。** 本次出现过连接重置，重试即可。`gh` 已装并已鉴权时**不要重复安装**——先 `gh auth status` 确认，装之前先查。

## 6. 开源后可选

- GitHub 上的 `gh repo edit --add-topic` 补标签。
- 若技能要给别人 `npx skills add` 安装，仓库布局必须是 **`skills/<技能名>/SKILL.md`**（`[已核实]`：`skills` CLI 的 `prioritySearchDirs` 依次找 `searchPath`、`searchPath/skills`、`skills/.curated`、`skills/.experimental`、`skills/.system`）。放在仓库根的 `SKILL.md` 也认，但只能有一个。
