import { AiCommitError, OpenAiCompatibleClient } from "../llm/openAiCompatibleClient";
import { sanitizeMessage } from "./messageSanitizer";
import { renderPatch } from "./patchTruncator";
import {
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "./promptBuilder";
import { CommitSettings, FileSection } from "./types";
import { validateCommitMessage } from "./validator";

export interface ProgressReporter {
  report(message: string): void;
}

export interface GenerateOptions {
  settings: CommitSettings;
  sections: readonly FileSection[];
  apiKey: string;
  signal?: AbortSignal;
  progress?: ProgressReporter;
}

/**
 * 串联「截断变更 -> 组装提示词 -> 调用模型 -> 清洗与校验」的完整流程。
 */
export async function generateCommitMessage(options: GenerateOptions): Promise<string> {
  const { settings, sections, apiKey, signal, progress } = options;
  if (apiKey.trim() === "") {
    throw new AiCommitError("尚未配置 API Key，请在「AI Commit Message: 打开设置」中填写。");
  }
  if (settings.baseUrl.trim() === "" || settings.model.trim() === "") {
    throw new AiCommitError("尚未配置 Base URL 或模型名称，请先补全设置。");
  }
  if (sections.length === 0) {
    throw new AiCommitError("没有可分析的暂存变更。");
  }

  progress?.report("正在分析暂存变更…");
  const summary = renderPatch(sections, settings.perFileChars, settings.totalChars);
  const client = new OpenAiCompatibleClient({
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutSeconds: settings.timeoutSeconds,
  });
  const strict = settings.strictMode && settings.messageStyle !== "plainZh";

  progress?.report("正在请求模型…");
  const raw = await client.complete(
    apiKey,
    buildSystemPrompt(settings.messageStyle, settings.extraPrompt, strict),
    buildUserPrompt(summary),
    signal,
  );
  const message = sanitizeOrThrow(raw);
  if (!strict) {
    return message;
  }

  const problems = validateCommitMessage(message);
  if (problems.length === 0) {
    return message;
  }

  progress?.report("正在按规范修正提交消息…");
  try {
    const rawRetry = await client.complete(
      apiKey,
      buildSystemPrompt(settings.messageStyle, settings.extraPrompt, true),
      buildRepairPrompt(message, problems),
      signal,
    );
    const retry = sanitizeOrThrow(rawRetry);
    return validateCommitMessage(retry).length <= problems.length ? retry : message;
  } catch (error) {
    // 重写失败不应让整个生成失败，保留首次结果。
    if (signal?.aborted) {
      throw error;
    }
    return message;
  }
}

function sanitizeOrThrow(raw: string): string {
  const message = sanitizeMessage(raw);
  if (message === "") {
    throw new AiCommitError("模型返回了空的提交消息。");
  }
  return message;
}
