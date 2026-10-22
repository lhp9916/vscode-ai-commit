import { EndpointConfig, ModelOption } from "../core/types";

export class AiCommitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiCommitError";
  }
}

interface HttpResult {
  status: number;
  body: string;
}

/**
 * OpenAI 兼容协议的对话客户端。所有内置供应商都走 /chat/completions。
 */
export class OpenAiCompatibleClient {
  constructor(private readonly config: EndpointConfig) {}

  async complete(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(
      buildChatCompletionsUrl(this.config.baseUrl),
      "POST",
      apiKey,
      buildRequestBody(this.config.model, systemPrompt, userPrompt),
      signal,
    );
    if (response.body.trim() === "") {
      throw new AiCommitError("服务返回了空响应。");
    }
    return extractChatContent(response.body);
  }

  async listModels(apiKey: string, signal?: AbortSignal): Promise<ModelOption[]> {
    const response = await this.request(
      buildModelsUrl(this.config.baseUrl),
      "GET",
      apiKey,
      undefined,
      signal,
    );
    if (response.body.trim() === "") {
      throw new AiCommitError("服务返回了空响应。");
    }
    return extractModelOptions(response.body);
  }

  private async request(
    url: string,
    method: "GET" | "POST",
    apiKey: string,
    body: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<HttpResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutSeconds * 1000);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      throw translateNetworkError(error, signal, timedOut);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    }

    const responseBody = await response.text();
    if (!response.ok) {
      throw new AiCommitError(describeHttpStatus(response.status, responseBody));
    }
    return { status: response.status, body: responseBody };
  }
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  return appendPath(baseUrl, "/chat/completions");
}

export function buildModelsUrl(baseUrl: string): string {
  return appendPath(baseUrl, "/models");
}

function appendPath(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    throw new AiCommitError("尚未配置 Base URL，请在设置中填写。");
  }
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`;
}

function buildRequestBody(model: string, systemPrompt: string, userPrompt: string): string {
  return JSON.stringify({
    model,
    temperature: 0.3,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

function translateNetworkError(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  timedOut: boolean,
): AiCommitError {
  if (callerSignal?.aborted) {
    return new AiCommitError("生成已取消。", { cause: error });
  }
  if (timedOut) {
    return new AiCommitError("请求超时，请检查网络或在设置中增大超时时间。", { cause: error });
  }
  if (error instanceof AiCommitError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiCommitError(`网络请求失败：${message}`, { cause: error });
}

export function extractChatContent(responseBody: string): string {
  const root = parseJson(responseBody, "无法解析模型响应，返回内容不是合法 JSON。");
  if (isRecord(root)) {
    const choices = root.choices;
    if (Array.isArray(choices) && choices.length > 0 && isRecord(choices[0])) {
      const first = choices[0];
      if (isRecord(first.message) && isNonBlankString(first.message.content)) {
        return first.message.content;
      }
      if (isNonBlankString(first.text)) {
        return first.text;
      }
    }
  }
  const error = extractError(responseBody);
  if (error) {
    throw new AiCommitError(`模型返回错误：${error}`);
  }
  throw new AiCommitError("模型响应中没有可用的提交消息内容。");
}

export function extractModelOptions(responseBody: string): ModelOption[] {
  const root = parseJson(responseBody, "无法解析模型列表，返回内容不是合法 JSON。");
  const models = new Map<string, ModelOption>();
  if (isRecord(root)) {
    const data = root.data;
    const items = Array.isArray(data) ? data : isRecord(data) ? Object.values(data) : [];
    for (const item of items) {
      const model = modelOptionOf(item);
      if (model && !models.has(model.id)) {
        models.set(model.id, model);
      }
    }
  }
  if (models.size === 0) {
    const error = extractError(responseBody);
    if (error) {
      throw new AiCommitError(`获取模型列表失败：${error}`);
    }
    throw new AiCommitError("服务未返回任何模型，请检查 Base URL 与 API Key。");
  }
  return Array.from(models.values()).sort((left, right) => {
    const groupOrder = left.group.localeCompare(right.group);
    return groupOrder !== 0 ? groupOrder : left.id.localeCompare(right.id);
  });
}

export function describeHttpStatus(status: number, responseBody: string): string {
  let detail = extractError(responseBody);
  if (detail == null && responseBody.trim() !== "") {
    const trimmed = responseBody.trim();
    detail = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  }
  const suffix = detail == null ? "" : `（${detail}）`;
  switch (status) {
    case 400:
      return `请求被拒绝，请检查模型名称与 Base URL 是否正确。${suffix}`;
    case 401:
    case 403:
      return `API Key 无效或没有权限，请在设置中检查密钥。${suffix}`;
    case 404:
      return `接口地址不存在，请检查 Base URL 是否正确。${suffix}`;
    case 429:
      return `请求过于频繁或额度不足，请稍后重试。${suffix}`;
    default:
      return status >= 500
        ? `服务端返回错误（HTTP ${status}），请稍后重试。${suffix}`
        : `请求失败（HTTP ${status}）。${suffix}`;
  }
}

function extractError(responseBody: string): string | null {
  try {
    const root = JSON.parse(responseBody) as unknown;
    if (isRecord(root)) {
      if (isRecord(root.error) && isNonBlankString(root.error.message)) {
        return root.error.message;
      }
      if (isNonBlankString(root.error)) {
        return root.error;
      }
      if (isNonBlankString(root.message)) {
        return root.message;
      }
    }
  } catch {
    // 非 JSON 响应由调用方按原文处理。
  }
  return null;
}

function modelOptionOf(item: unknown): ModelOption | null {
  if (isNonBlankString(item)) {
    const id = item.trim();
    return { id, displayName: id, group: groupOf(id), contextLength: 0 };
  }
  if (!isRecord(item) || !isNonBlankString(item.id)) {
    return null;
  }
  const id = item.id.trim();
  return {
    id,
    displayName: isNonBlankString(item.display_name) ? item.display_name.trim() : id,
    group: isNonBlankString(item.owned_by) ? item.owned_by.trim() : groupOf(id),
    contextLength: finiteNumber(item.context_length) ?? finiteNumber(item.context_window) ?? 0,
  };
}

function groupOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "其他";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseJson(text: string, message: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (text.includes("\u0000")) {
      throw new AiCommitError("返回内容包含 NUL 字节，无法解析。", { cause: error });
    }
    throw new AiCommitError(message, { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
