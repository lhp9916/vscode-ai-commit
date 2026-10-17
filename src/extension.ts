import * as vscode from "vscode";
import { generateCommitMessage } from "./core/commitMessageGenerator";
import { buildConnectionTestPrompt } from "./core/promptBuilder";
import { CommitSettings, EndpointConfig } from "./core/types";
import { collectStagedChanges } from "./git/changeCollector";
import { AiCommitError, OpenAiCompatibleClient } from "./llm/openAiCompatibleClient";
import {
  getApiKey,
  getConfiguredProvider,
  openSettings,
  pickModel,
  readSettings,
  setApiKey,
} from "./settings";

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
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCommit.generateMessage", () => generate(context)),
    vscode.commands.registerCommand("aiCommit.openSettings", () => openSettings(context)),
    vscode.commands.registerCommand("aiCommit.testConnection", () => testConnection(context)),
    vscode.commands.registerCommand("aiCommit.fetchModels", () => fetchModels(context)),
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
      await openSettings(context);
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
    const selected = await pickModel(models, settings.model);
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

function toEndpoint(settings: CommitSettings): EndpointConfig {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutSeconds: settings.timeoutSeconds,
  };
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

