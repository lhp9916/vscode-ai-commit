import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "../core/promptBuilder";

test("中文 Conventional 提示词包含类型与正文要求", () => {
  const prompt = buildSystemPrompt("conventionalZh", "");
  assert.match(prompt, /中文/);
  assert.match(prompt, /Conventional Commits/);
  assert.match(prompt, /feat/);
  assert.match(prompt, /正文要点/);
  assert.match(prompt, /uploadFile/);
  assert.match(prompt, /BREAKING CHANGE/);
  assert.match(prompt, /100/);
});

test("纯描述风格不要求类型前缀", () => {
  const prompt = buildSystemPrompt("plainZh", "");
  assert.match(prompt, /不加类型前缀/);
  assert.doesNotMatch(prompt, /Conventional Commits/);
  assert.doesNotMatch(prompt, /正文要点/);
});

test("英文风格与附加要求被正确拼接", () => {
  const prompt = buildSystemPrompt("conventionalEn", "不要使用 emoji");
  assert.match(prompt, /英文/);
  assert.match(prompt, /不要使用 emoji/);
});

test("严格模式有明确标记", () => {
  assert.doesNotMatch(buildSystemPrompt("conventionalZh", ""), /严格模式/);
  assert.match(buildSystemPrompt("conventionalZh", "", true), /严格模式/);
});

test("用户提示词与修复提示词包含上下文", () => {
  assert.match(buildUserPrompt("diff-content"), /diff-content/);
  const repair = buildRepairPrompt("fix(uploadFile): 修复上传。", ["scope 应使用小写"]);
  assert.match(repair, /fix\(uploadFile\)/);
  assert.match(repair, /scope 应使用小写/);
  assert.match(repair, /只输出/);
});
