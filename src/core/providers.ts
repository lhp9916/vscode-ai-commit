import { ProviderId } from "./types";

export interface ProviderPreset {
  id: ProviderId;
  displayName: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

// 默认值依据各供应商官方文档核对（2026-10）。模型可在设置中覆盖或在线拉取。
export const PROVIDERS: readonly ProviderPreset[] = [
  {
    id: "deepseek",
    displayName: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
  },
  {
    id: "dashscope",
    displayName: "通义千问 DashScope",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3.8-flash",
  },
  {
    id: "zhipu",
    displayName: "智谱 GLM",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.3-flash",
  },
  {
    id: "moonshot",
    displayName: "Kimi Moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2.6",
  },
  {
    id: "siliconflow",
    displayName: "硅基流动 SiliconFlow",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
  },
  {
    id: "custom",
    displayName: "自定义",
    defaultBaseUrl: "",
    defaultModel: "",
  },
];

export function getProvider(id: string | undefined): ProviderPreset {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export function effectiveBaseUrl(settings: { provider: ProviderId; baseUrl: string }): string {
  const value = settings.baseUrl.trim();
  return value || getProvider(settings.provider).defaultBaseUrl;
}

export function effectiveModel(settings: { provider: ProviderId; model: string }): string {
  const value = settings.model.trim();
  return value || getProvider(settings.provider).defaultModel;
}
