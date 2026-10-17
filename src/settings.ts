import * as vscode from "vscode";
import {
  effectiveBaseUrl,
  effectiveModel,
  getProvider,
  PROVIDERS,
} from "./core/providers";
import { CommitSettings, MessageStyle, ProviderId } from "./core/types";

const SECTION = "aiCommit";
const API_KEY_PREFIX = "aiCommit.apiKey.";

export function readSettings(): CommitSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    provider: normalizeProvider(config.get<string>("provider")),
    baseUrl: effectiveBaseUrl({
      provider: normalizeProvider(config.get<string>("provider")),
      baseUrl: config.get<string>("baseUrl", ""),
    }),
    model: effectiveModel({
      provider: normalizeProvider(config.get<string>("provider")),
      model: config.get<string>("model", ""),
    }),
    messageStyle: normalizeStyle(config.get<string>("messageStyle")),
    strictMode: config.get<boolean>("strictMode", false),
    extraPrompt: config.get<string>("extraPrompt", ""),
    perFileChars: positiveInteger(config.get<number>("perFileChars"), 6000),
    totalChars: positiveInteger(config.get<number>("totalChars"), 24000),
    timeoutSeconds: Math.max(5, positiveInteger(config.get<number>("timeoutSeconds"), 60)),
  };
}

export function getConfiguredProvider(): ProviderId {
  return normalizeProvider(vscode.workspace.getConfiguration(SECTION).get<string>("provider"));
}

export async function getApiKey(context: vscode.ExtensionContext, provider: ProviderId): Promise<string> {
  return (await context.secrets.get(API_KEY_PREFIX + provider)) ?? "";
}

export async function setApiKey(
  context: vscode.ExtensionContext,
  provider: ProviderId,
  apiKey: string,
): Promise<void> {
  const value = apiKey.trim();
  if (value) {
    await context.secrets.store(API_KEY_PREFIX + provider, value);
  } else {
    await context.secrets.delete(API_KEY_PREFIX + provider);
  }
}

/**
 * 统一设置入口。供应商与模型使用 QuickPick，敏感信息只写入 SecretStorage。
 */
export async function openSettings(context: vscode.ExtensionContext): Promise<void> {
  const provider = await pickProvider();
  if (!provider) {
    return;
  }

  const config = vscode.workspace.getConfiguration(SECTION);
  const previousProvider = normalizeProvider(config.get<string>("provider"));
  const currentBaseUrl = config.get<string>("baseUrl", "");
  const currentModel = config.get<string>("model", "");
  const previous = getProvider(previousProvider);

  await config.update("provider", provider.id, vscode.ConfigurationTarget.Global);
  if (!currentBaseUrl.trim() || currentBaseUrl.trim() === previous.defaultBaseUrl) {
    await config.update("baseUrl", provider.defaultBaseUrl, vscode.ConfigurationTarget.Global);
  }
  if (!currentModel.trim() || currentModel.trim() === previous.defaultModel) {
    await config.update("model", provider.defaultModel, vscode.ConfigurationTarget.Global);
  }

  const existingKey = await getApiKey(context, provider.id);
  const apiKey = await vscode.window.showInputBox({
    title: `AI Commit Message - ${provider.displayName}`,
    prompt: "API Key 会存入 VS Code 加密凭据库，不会写入 settings.json",
    password: true,
    ignoreFocusOut: true,
    value: existingKey,
  });
  if (apiKey !== undefined) {
    await setApiKey(context, provider.id, apiKey);
  }

  const action = await vscode.window.showQuickPick(
    [
      { label: "打开完整设置", description: "配置风格、严格模式、差异上限与超时", action: "settings" },
      { label: "测试连接", description: `使用 ${provider.displayName} 当前配置测试`, action: "test" },
      { label: "获取模型列表", description: "从供应商在线拉取并选择模型", action: "models" },
    ],
    { title: `AI Commit Message - ${provider.displayName}`, ignoreFocusOut: true },
  );

  if (action?.action === "settings") {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:peng.vscode-ai-commit");
  } else if (action?.action === "test") {
    await vscode.commands.executeCommand("aiCommit.testConnection");
  } else if (action?.action === "models") {
    await vscode.commands.executeCommand("aiCommit.fetchModels");
  }
}

export async function pickProvider(): Promise<(typeof PROVIDERS)[number] | undefined> {
  const selected = await vscode.window.showQuickPick(
    PROVIDERS.map((provider) => ({
      label: provider.displayName,
      description: provider.defaultBaseUrl || "自行填写 Base URL",
      provider,
    })),
    { title: "选择模型供应商", ignoreFocusOut: true },
  );
  return selected?.provider;
}

export async function pickModel(models: readonly string[], current: string): Promise<string | undefined> {
  const selected = await vscode.window.showQuickPick(
    models.map((model) => ({ label: model, picked: model === current })),
    { title: "选择模型", ignoreFocusOut: true, matchOnDescription: true },
  );
  return selected?.label;
}

export function normalizeProvider(value: string | undefined): ProviderId {
  return PROVIDERS.some((provider) => provider.id === value)
    ? (value as ProviderId)
    : "deepseek";
}

export function normalizeStyle(value: string | undefined): MessageStyle {
  switch (value) {
    case "plainZh":
    case "conventionalEn":
      return value;
    default:
      return "conventionalZh";
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}
