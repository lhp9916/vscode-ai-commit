import * as vscode from "vscode";
import { generateCommitMessage } from "./core/commitMessageGenerator";
import { buildConnectionTestPrompt } from "./core/promptBuilder";
import { CommitSettings, EndpointConfig, ModelOption } from "./core/types";
import { collectStagedChanges } from "./git/changeCollector";
import { AiCommitError, OpenAiCompatibleClient } from "./llm/openAiCompatibleClient";
import {
  getApiKey,
  getConfiguredProvider,
  pickModel,
  readSettings,
  setApiKey,
} from "./settings";
import { SettingsPanel } from "./settingsPanel";

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: {
    value: string;
  };
}

interface GitApi {
  repositories: GitRepository[];
}

interface GitExtension {
  getAPI(version: 1): GitApi;
}

interface RepositoryQuickPickItem extends vscode.QuickPickItem {
  repository: GitRepository;
}

export function activate(context: vscode.ExtensionContext): void {
  const settingsPanel = new SettingsPanel(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCommit.generateMessage", () => generate(context)),
    vscode.commands.registerCommand("aiCommit.openSettings", () => settingsPanel.show()),
    vscode.commands.registerCommand("aiCommit.testConnection", () => testConnection(context)),
    vscode.commands.registerCommand("aiCommit.fetchModels", () => fetchModels(context)),
    vscode.commands.registerCommand("aiCommit.runConnectionTest", (input: unknown) =>
      testConnectionWithInput(input)),
    vscode.commands.registerCommand("aiCommit.listModels", (input: unknown) =>
      fetchModelsWithInput(input)),
    // 旧版升级过程中，已打开的设置页仍可能调用这两个命令名。
    vscode.commands.registerCommand("aiCommit._test.connection", (input: unknown) =>
      testConnectionWithInput(input)),
    vscode.commands.registerCommand("aiCommit._test.fetchModels", (input: unknown) =>
      fetchModelsWithInput(input)),
  );
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand("aiCommit._test.setApiKey", async (apiKey: string) => {
        await setApiKey(context, getConfiguredProvider(), apiKey);
      }),
    );
  }
}

export function deactivate(): void {
  // 无需释放资源。
}

async function generate(context: vscode.ExtensionContext): Promise<void> {
  const repository = await pickRepository();
  if (!repository) {
    return;
  }

  const settings = readSettings();
  const provider = getConfiguredProvider();
  const apiKey = await getApiKey(context, provider);
  if (!apiKey) {
    const configure = await vscode.window.showWarningMessage(
      "尚未配置 API Key，是否现在打开设置？",
      "打开设置",
    );
    if (configure) {
      await vscode.commands.executeCommand("aiCommit.openSettings");
    }
    return;
  }

  try {
    const sections = await collectStagedChanges(repository);
    if (sections.length === 0) {
      void vscode.window.showWarningMessage("没有可分析的暂存变更，请先在源代码管理中暂存要提交的文件。");
      return;
    }

    const message = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title: "AI 生成提交消息",
        cancellable: true,
      },
      async (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        return generateCommitMessage({
          settings,
          sections,
          apiKey,
          signal: controller.signal,
          progress: { report: (text) => _progress.report({ message: text }) },
        });
      },
    );
    repository.inputBox.value = message;
  } catch (error) {
    await showError(error);
  }
}

async function testConnection(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const apiKey = await getApiKey(context, settings.provider);
  if (!apiKey) {
    void vscode.window.showWarningMessage("尚未配置 API Key，请先打开设置填写。");
    return;
  }

  try {
    const reply = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "测试 AI 服务连接", cancellable: true },
      async (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        const client = new OpenAiCompatibleClient(toEndpoint(settings));
        return client.complete(
          apiKey,
          "你是一个用于连通性测试的助手，请严格按要求回复。",
          buildConnectionTestPrompt(),
          controller.signal,
        );
      },
    );
    void vscode.window.showInformationMessage(`连接成功，模型回复：${reply}`);
  } catch (error) {
    await showError(error);
  }
}

async function testConnectionWithInput(input: unknown): Promise<void> {
  const request = normalizeEndpointRequest(input);
  const reply = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "测试 AI 服务连接" },
    async () => new OpenAiCompatibleClient(toEndpoint(request.settings)).complete(
      request.apiKey,
      "你是一个用于连通性测试的助手，请严格按要求回复。",
      buildConnectionTestPrompt(),
    ),
  );
  void vscode.window.showInformationMessage(`连接成功，模型回复：${reply}`);
}

async function fetchModels(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const apiKey = await getApiKey(context, settings.provider);
  if (!apiKey) {
    void vscode.window.showWarningMessage("获取模型列表需要 API Key，请先打开设置填写。");
    return;
  }

  try {
    const models = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "获取模型列表", cancellable: true },
      async (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        return new OpenAiCompatibleClient(toEndpoint(settings)).listModels(apiKey, controller.signal);
      },
    );
    const selected = await pickModel(models.map((model) => model.id), settings.model);
    if (selected) {
      await vscode.workspace
        .getConfiguration("aiCommit")
        .update("model", selected, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`模型已设置为 ${selected}`);
    }
  } catch (error) {
    await showError(error);
  }
}

/**
 * 设置面板尚未保存时也要能拉取模型，因此这里直接使用面板传进来的当前值。
 */
async function fetchModelsWithInput(input: unknown): Promise<ModelOption[]> {
  const request = normalizeEndpointRequest(input);
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "获取模型列表" },
    async () => new OpenAiCompatibleClient(toEndpoint(request.settings)).listModels(request.apiKey),
  );
}

function toEndpoint(settings: CommitSettings): EndpointConfig {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutSeconds: settings.timeoutSeconds,
  };
}

interface EndpointRequest {
  settings: CommitSettings;
  apiKey: string;
}

function normalizeEndpointRequest(value: unknown): EndpointRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("请求参数无效。");
  }
  const record = value as Record<string, unknown>;
  const settings = record.settings;
  if (typeof settings !== "object" || settings === null) {
    throw new Error("请求参数缺少模型设置。");
  }
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (!apiKey) {
    throw new Error("请先填写 API Key。");
  }
  return { settings: settings as CommitSettings, apiKey };
}

async function pickRepository(): Promise<GitRepository | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    void vscode.window.showErrorMessage("未找到 VS Code 内置 Git 扩展，无法读取暂存变更。");
    return undefined;
  }
  const gitExtension = extension.isActive ? extension.exports : await extension.activate();
  const git = gitExtension.getAPI(1);
  if (git.repositories.length === 0) {
    void vscode.window.showErrorMessage("当前工作区没有可用的 Git 仓库。");
    return undefined;
  }
  if (git.repositories.length === 1) {
    return git.repositories[0];
  }

  const selected = await vscode.window.showQuickPick<RepositoryQuickPickItem>(
    git.repositories.map((repository) => ({
      label: vscode.workspace.asRelativePath(repository.rootUri),
      description: repository.rootUri.fsPath,
      repository,
    })),
    { title: "选择 Git 仓库", ignoreFocusOut: true },
  );
  return selected?.repository;
}

async function showError(error: unknown): Promise<void> {
  if (error instanceof AiCommitError) {
    void vscode.window.showErrorMessage(error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  void vscode.window.showErrorMessage(`AI 生成提交消息失败：${message}`);
}


