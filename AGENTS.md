# VS Code AI Commit Message

VS Code 扩展：读取已暂存的 Git 变更，调用 OpenAI 兼容接口生成提交消息并写入源代码管理面板的提交框。

## 目录结构

- `src/core/`：提示词、截断、清洗、Conventional Commits 校验与生成流程，保持不依赖 VS Code API
- `src/git/`：暂存区读取与 `git diff` 解析
- `src/llm/`：OpenAI 兼容 HTTP 客户端与响应解析
- `src/settings.ts`：设置读取、`SecretStorage` 密钥与设置入口
- `src/extension.ts`：命令注册、Git 集成与进度反馈
- `src/test/`：纯逻辑与本地 HTTP 测试
- `src/integration/`：VS Code 扩展宿主集成测试
- `scripts/`：测试启动脚本

## 开发与验证

```powershell
npm install
npm run compile
npm test
npm run lint
npm run test:integration
npm run package
```

- `npm test` 运行编译后的 26 项纯逻辑测试，包括本地模拟模型服务的完整生成流程。
- `npm run test:integration` 启动 VS Code 扩展宿主，使用临时 Git 仓库与本地模拟模型服务，验证命令注册、暂存差异读取和提交框回填。
- `npm run package` 产出 `vscode-ai-commit-<version>.vsix`。
- 本机 npm 可能被环境变量 `NPM_CONFIG_OFFLINE` 设为离线；需要下载依赖时，在单次命令中覆盖为 `false`，不要修改全局配置。

## 约束

- 只分析已暂存变更，不读取未暂存内容。
- API Key 只能经 `context.secrets` 保存，禁止写入 `settings.json`、日志或提交内容。
- `core/`、`git/`、`llm/` 不依赖 VS Code API，便于单测。
- 修改平台 API、命令或配置项后，必须同时更新 `README.md` 与集成测试。
- 新增纯逻辑必须补单测；不要保留只定义未使用的导出、参数或调试命令。
- 发布前确认 VSIX 不包含 `src/`、`out/test/`、`out/integration/`、`.npm-cache/`、`.vscode-test/`。
