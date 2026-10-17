export type MessageStyle = "conventionalZh" | "plainZh" | "conventionalEn";

export type ProviderId =
  | "deepseek"
  | "dashscope"
  | "zhipu"
  | "moonshot"
  | "siliconflow"
  | "custom";

export interface FileSection {
  path: string;
  status: string;
  binary: boolean;
  diffText: string;
}

export interface CommitSettings {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  messageStyle: MessageStyle;
  strictMode: boolean;
  extraPrompt: string;
  perFileChars: number;
  totalChars: number;
  timeoutSeconds: number;
}

export interface EndpointConfig {
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}
