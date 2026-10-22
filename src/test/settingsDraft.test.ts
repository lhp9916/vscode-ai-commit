import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_STYLE_OPTIONS,
  normalizeEndpointDraft,
  normalizeMessageStyle,
  normalizeSettingsDraft,
  resolveProviderDefaults,
  SettingsDraft,
} from "../core/settingsDraft";

function draft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    provider: "deepseek",
    baseUrl: "",
    model: "",
    apiKey: "",
    messageStyle: "conventionalZh",
    strictMode: false,
    extraPrompt: "",
    perFileChars: 6000,
    totalChars: 24000,
    timeoutSeconds: 60,
    ...overrides,
  };
}

test("空地址和模型使用供应商默认值", () => {
  const settings = normalizeSettingsDraft(draft());
  assert.equal(settings.baseUrl, "https://api.deepseek.com");
  assert.equal(settings.model, "deepseek-flash");
});

test("自定义供应商获取模型时允许模型为空", () => {
  const settings = normalizeEndpointDraft(draft({
    provider: "custom",
    baseUrl: "http://127.0.0.1:3425/v1",
    model: "",
  }));
  assert.equal(settings.baseUrl, "http://127.0.0.1:3425/v1");
  assert.equal(settings.model, "");
  assert.throws(
    () => normalizeSettingsDraft(draft({
      provider: "custom",
      baseUrl: "http://127.0.0.1:3425/v1",
      model: "",
    })),
    /模型名称/,
  );
});

test("非法数字与过短超时被拒绝", () => {
  assert.throws(() => normalizeSettingsDraft(draft({ perFileChars: 0 })), /正整数/);
  assert.throws(() => normalizeSettingsDraft(draft({ totalChars: 1.5 })), /正整数/);
  assert.throws(() => normalizeSettingsDraft(draft({ timeoutSeconds: 4 })), /5 秒/);
});

test("未知风格回退到中文 Conventional Commits", () => {
  assert.equal(normalizeMessageStyle("unknown"), "conventionalZh");
  assert.equal(normalizeMessageStyle("plainZh"), "plainZh");
});

test("切换供应商只覆盖未自定义的地址与模型", () => {
  const untouched = resolveProviderDefaults(
    "deepseek",
    "dashscope",
    "https://api.deepseek.com",
    "deepseek-flash",
  );
  assert.equal(untouched.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(untouched.model, "qwen3.8-flash");

  const customized = resolveProviderDefaults(
    "deepseek",
    "dashscope",
    "https://example.com/v1",
    "my-model",
  );
  assert.equal(customized.baseUrl, "https://example.com/v1");
  assert.equal(customized.model, "my-model");
});

test("每个消息风格都有中文说明和示例", () => {
  assert.equal(MESSAGE_STYLE_OPTIONS.length, 3);
  for (const option of MESSAGE_STYLE_OPTIONS) {
    assert.ok(option.label.length > 0);
    assert.ok(option.description.length > 0);
    assert.ok(option.example.length > 0);
  }
});
