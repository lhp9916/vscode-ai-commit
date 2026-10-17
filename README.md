# AI Commit Message

VS Code 扩展：根据已暂存的 Git 变更调用大模型生成提交消息，并直接写入源代码管理面板的提交框。

配套的 JetBrains 插件：[ide-ai-commit](https://github.com/lhp9916/ide-ai-commit)。

## 功能

- 只分析已暂存（staged）的变更，不会把未暂存内容发给模型。
- 支持 DeepSeek、通义千问 DashScope、智谱 GLM、Kimi Moonshot、硅基流动 SiliconFlow 与自定义 OpenAI 兼容接口。
- 支持中文 Conventional Commits、中文纯描述、英文 Conventional Commits 三种风格。
- 严格模式会按 Conventional Commits 1.0.0 校验结果，不合规时把问题回喂给模型重写一次。
- 差异按文件与总量限制截断，文件清单始终完整保留。
- API Key 存入 VS Code `SecretStorage`，不会写入 `settings.json`。
- 支持测试连接、在线拉取模型列表，以及使用 `Ctrl+Z` 撤销写入的提交消息。

## 使用

1. 在 VS Code 扩展视图中搜索 `AI Commit Message`，或在扩展市场页面安装。
2. 执行命令 `AI Commit Message: 打开设置`，选择供应商并填写 API Key。
3. 在源代码管理面板暂存要提交的文件。
4. 点击源代码管理标题栏的 AI 图标，或执行 `AI Commit Message: AI 生成提交消息`。
5. 生成结果会写入提交消息框，可直接编辑或撤销。

也可从 [GitHub Releases](https://github.com/lhp9916/vscode-ai-commit/releases) 下载 VSIX 离线安装。

## 设置

在 VS Code 设置中搜索 `AI Commit Message`：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `aiCommit.provider` | `deepseek` | 供应商 |
| `aiCommit.baseUrl` | 空 | 留空时使用供应商默认地址 |
| `aiCommit.model` | 空 | 留空时使用供应商默认模型 |
| `aiCommit.messageStyle` | `conventionalZh` | 提交消息风格 |
| `aiCommit.strictMode` | `false` | 是否按规范校验并重写一次 |
| `aiCommit.extraPrompt` | 空 | 追加到系统提示词的要求 |
| `aiCommit.perFileChars` | `6000` | 单文件差异上限 |
| `aiCommit.totalChars` | `24000` | 总差异上限 |
| `aiCommit.timeoutSeconds` | `60` | 请求超时 |

API Key 不在设置页中，执行 `AI Commit Message: 打开设置` 输入。每个供应商的 Key 独立保存，切换供应商不会互相覆盖。

## 内置供应商

均为 OpenAI 兼容的 `/chat/completions` 协议，Base URL 与模型可覆盖。

| 供应商 | 默认 Base URL | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` |
| 通义千问 DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3-flash` |
| Kimi Moonshot | `https://api.moonshot.cn/v1` | `kimi-k2.6` |
| 硅基流动 SiliconFlow | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V4-Flash` |
| 自定义 | 自行填写 | 自行填写 |

模型名称迭代较快，建议执行 `AI Commit Message: 获取模型列表` 从供应商的 `GET /models` 接口拉取后再选择。

## 开发

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run compile
npm test
npm run lint
npm run test:integration
```

`test:integration` 会启动 VS Code 扩展宿主，使用临时 Git 仓库和本地模拟模型服务，验证命令注册、暂存差异读取、模型请求与提交框回填。

若本机 npm 被配置为离线模式，可临时覆盖：

```powershell
$env:NPM_CONFIG_OFFLINE='false'
npm install
```

调试：在 VS Code 中打开本目录，按 `F5` 启动扩展开发宿主，并打开一个已暂存变更的 Git 仓库。

## 打包

```powershell
npm run package
```

产物为 `vscode-ai-commit-<version>.vsix`。安装：

```powershell
code --install-extension vscode-ai-commit-0.1.0.vsix
```

## 持续集成与发布

工作流位于 `.github/workflows/`：

| 工作流 | 触发条件 | 行为 |
| --- | --- | --- |
| `build.yml` | push 任意分支、PR、手动 | 编译、单元测试、Lint、扩展宿主集成测试，上传 VSIX |
| `release.yml` | 推送 `v*` tag | 由 tag 派生版本号，创建 GitHub Release 并附带 VSIX |
| `publish-marketplace.yml` | 手动触发 | 使用仓库 Secret `VSCE_PAT` 发布到 VS Code Marketplace |

发布新版本：

```powershell
git tag -a v0.2.0 -m "release: v0.2.0"
git push origin v0.2.0
```

`release.yml` 会产出 `vscode-ai-commit-0.2.0.vsix` 并挂到 Release 附件。

### 发布到 VS Code Marketplace

1. 用 Microsoft 账号登录 [Azure DevOps](https://dev.azure.com)，创建一个组织（个人使用可任意命名）。
2. 打开 [Marketplace 管理页](https://marketplace.visualstudio.com/manage)，创建发布者，发布者 ID 必须与
   `package.json` 中的 `publisher` 一致（当前为 `lhp9916`）。
3. 在 Azure DevOps 的 `User settings > Personal access tokens` 创建 PAT：
   - Organization 选择 `All accessible organizations`
   - Scopes 选择 `Custom defined`，只勾选 `Marketplace > Manage`
   - 记录有效期，过期后需要重新生成并更新 Secret
4. 在 GitHub 仓库的 `Settings > Secrets and variables > Actions` 新增 Repository secret
   `VSCE_PAT`，值为上一步的 PAT。
5. 打开仓库的 `Actions > Publish to Marketplace > Run workflow`，填写与发布版本一致的版本号，
   例如 `0.1.0`。

工作流会依次编译、跑单元测试与集成测试、Lint、打包 VSIX，再调用
`vsce publish --packagePath ... --pat "$VSCE_PAT"` 上传。首次发布通常需要几分钟才能在扩展市场搜索到。

本地发布也可执行 `npm run publish`，但需要先在本机完成 `npx vsce login <publisher>`。
不要将 PAT 写入仓库、脚本或日志。

## 说明

- 扩展依赖 VS Code 内置 Git 扩展读取仓库信息，但差异通过系统 `git diff --cached` 获取。
- 仅支持 Git 仓库；与 IDEA 插件不同，不覆盖其他 VCS。
- 生成操作会发送暂存区差异到配置的模型服务，请勿在敏感仓库中使用未经审查的第三方服务。
