import assert from "node:assert/strict";
import test from "node:test";
import { renderPatch } from "../core/patchTruncator";
import { FileSection } from "../core/types";

function section(path: string, diffText: string, binary = false): FileSection {
  return { path, status: "修改", binary, diffText };
}

test("预算充足时保留全部差异", () => {
  const result = renderPatch([section("a.txt", "+aaa\n"), section("b.txt", "+bbb\n")], 1000, 10000);
  assert.match(result, /\+aaa/);
  assert.match(result, /\+bbb/);
  assert.doesNotMatch(result, /已截断/);
});

test("单个文件超出上限时截断", () => {
  const result = renderPatch([section("big.txt", "+line\n".repeat(100))], 50, 10000);
  assert.match(result, /该文件差异已截断/);
  assert.ok(result.length < 500);
});

test("总预算不足时仍保留完整文件清单", () => {
  const result = renderPatch(
    [
      section("a.txt", "+a\n".repeat(50)),
      section("b.txt", "+b\n".repeat(50)),
      section("c.txt", "+c\n".repeat(50)),
    ],
    10000,
    120,
  );
  assert.match(result, /- a\.txt/);
  assert.match(result, /- b\.txt/);
  assert.match(result, /- c\.txt/);
  assert.match(result, /因超出长度上限被省略/);
});

test("二进制文件只出现在文件清单中", () => {
  const result = renderPatch([section("logo.png", "binary-data", true)], 1000, 10000);
  assert.match(result, /- logo\.png/);
  assert.doesNotMatch(result, /binary-data/);
});
