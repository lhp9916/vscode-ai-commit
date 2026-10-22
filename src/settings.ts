import * as vscode from "vscode";
import { normalizeProvider } from "./core/providers";
import {
  normalizeMessageStyle,
  normalizeSettingsDraft,
  SettingsDraft,
} from "./core/settingsDraft";
import { CommitSettings, ProviderId } from "./core/types";

const SECTION = "aiCommit";
const API_KEY_PREFIX = "aiCommit.apiKey.";

export function readSettings(): CommitSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  return normalizeSettingsDraft({
    provider: normalizeProvider(config.get<string>("provider")),
    baseUrl: config.get<string>("baseUrl", ""),
    model: config.get<string>("model", ""),
    messageStyle: normalizeMessageStyle(config.get<string>("messageStyle")),
    strictMode: config.get<boolean>("strictMode", false),
    extraPrompt: config.get<string>("extraPrompt", ""),
    perFileChars: config.get<number>("perFileChars", 6000),
    totalChars: config.get<number>("totalChars", 24000),
    timeoutSeconds: config.get<number>("timeoutSeconds", 60),
    apiKey: "",
  });
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

export async function readSettingsDraft(context: vscode.ExtensionContext): Promise<SettingsDraft> {
  const settings = readSettings();
  return { ...settings, apiKey: await getApiKey(context, settings.provider) };
}

export async function pickModel(models: readonly string[], current: string): Promise<string | undefined> {
  const selected = await vscode.window.showQuickPick(
    models.map((model) => ({ label: model, picked: model === current })),
    { title: "选择模型", ignoreFocusOut: true, matchOnDescription: true },
  );
  return selected?.label;
}

