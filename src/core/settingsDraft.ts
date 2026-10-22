import {
  effectiveBaseUrl,
  effectiveModel,
  getProvider,
  normalizeProvider,
} from "./providers";
import { CommitSettings, MessageStyle, ProviderId } from "./types";

export interface SettingsDraft extends CommitSettings {
  apiKey: string;
}

export interface MessageStyleOption {
  id: MessageStyle;
  label: string;
  description: string;
  example: string;
}

/**
 * 这里的中文名称会同时用于设置面板和原生设置说明，避免两处文案逐渐不一致。
 */
export const MESSAGE_STYLE_OPTIONS: readonly MessageStyleOption[] = [
  {
    id: "conventionalZh",
    label: "中文 Conventional Commits",
    description: "生成带类型前缀的中文提交消息，适合遵循 Conventional Commits 的团队。",
    example: "feat(upload): 添加上传文件日志",
  },
  {
    id: "plainZh",
    label: "中文纯描述",
    description: "只生成一句中文说明，不带 feat、fix 等类型前缀。",
    example: "添加上传文件日志",
  },
  {
    id: "conventionalEn",
    label: "English Conventional Commits",
    description: "生成带类型前缀的英文提交消息，适合英文提交规范。",
    example: "feat(upload): add upload logging",
  },
];

export function normalizeMessageStyle(value: string | undefined): MessageStyle {
  return MESSAGE_STYLE_OPTIONS.some((option) => option.id === value)
    ? (value as MessageStyle)
    : "conventionalZh";
}

/**
 * 端点配置只要求 Base URL 可用，模型允许为空。
 * “获取模型列表”发生在选定模型之前，不能复用完整的保存校验。
 */
export function normalizeEndpointDraft(draft: SettingsDraft): CommitSettings {
  const provider = normalizeProvider(draft.provider);
  const rawBaseUrl = (draft.baseUrl ?? "").trim();
  const baseUrl = effectiveBaseUrl({ provider, baseUrl: draft.baseUrl });
  const model = effectiveModel({ provider, model: draft.model });
  if (!rawBaseUrl && !baseUrl.trim()) {
    throw new Error("请填写 Base URL。");
  }

  return {
    provider,
    baseUrl,
    model,
    messageStyle: normalizeMessageStyle(draft.messageStyle),
    strictMode: Boolean(draft.strictMode),
    extraPrompt: draft.extraPrompt ?? "",
    perFileChars: positiveInteger(draft.perFileChars, "单文件差异上限"),
    totalChars: positiveInteger(draft.totalChars, "总差异上限"),
    timeoutSeconds: timeoutSeconds(draft.timeoutSeconds),
  };
}

/**
 * 保存或生成前必须已有模型，避免后续请求把空模型发送给服务端。
 */
export function normalizeSettingsDraft(draft: SettingsDraft): CommitSettings {
  const settings = normalizeEndpointDraft(draft);
  if (!settings.model.trim()) {
    throw new Error("请填写模型名称。");
  }
  return settings;
}

/**
 * 切换供应商时只覆盖仍是上一供应商默认值或为空的内容，保留用户手填的地址和模型。
 */
export function resolveProviderDefaults(
  previous: ProviderId,
  next: ProviderId,
  baseUrl: string,
  model: string,
): { baseUrl: string; model: string } {
  const previousProvider = getProvider(previous);
  const nextProvider = getProvider(next);
  return {
    baseUrl: isUntouched(baseUrl, previousProvider.defaultBaseUrl)
      ? nextProvider.defaultBaseUrl
      : baseUrl,
    model: isUntouched(model, previousProvider.defaultModel)
      ? nextProvider.defaultModel
      : model,
  };
}

function isUntouched(value: string, previousDefault: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === previousDefault;
}

function positiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName}必须为正整数。`);
  }
  return value;
}

function timeoutSeconds(value: number): number {
  const parsed = positiveInteger(value, "请求超时");
  if (parsed < 5) {
    throw new Error("请求超时不能小于 5 秒。");
  }
  return parsed;
}
