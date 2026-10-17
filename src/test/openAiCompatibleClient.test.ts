import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatCompletionsUrl,
  buildModelsUrl,
  describeHttpStatus,
  extractChatContent,
  extractModelIds,
} from "../llm/openAiCompatibleClient";

test("拼接对话与模型地址", () => {
  assert.equal(
    buildChatCompletionsUrl("https://api.deepseek.com/"),
    "https://api.deepseek.com/chat/completions",
  );
  assert.equal(
    buildModelsUrl("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
  );
});

test("解析对话响应与错误", () => {
  assert.equal(
    extractChatContent('{"choices":[{"message":{"content":"fix: 修复超时"}}]}'),
    "fix: 修复超时",
  );
  assert.throws(
    () => extractChatContent('{"error":{"message":"invalid key"}}'),
    /invalid key/,
  );
});

test("模型列表去重并排序", () => {
  assert.deepEqual(
    extractModelIds('{"data":[{"id":"b"},{"id":"a"},{"id":"b"}]}'),
    ["a", "b"],
  );
});

test("HTTP 状态码转换为中文提示", () => {
  assert.match(describeHttpStatus(401, '{"error":{"message":"bad key"}}'), /API Key 无效/);
  assert.match(describeHttpStatus(429, ""), /请求过于频繁/);
});
