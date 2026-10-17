"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const testDirectory = path.join(__dirname, "..", "out", "test");
  const files = fs
    .readdirSync(testDirectory)
    .filter((file) => file.endsWith(".test.js"))
    .sort();
  if (files.length === 0) {
    throw new Error("没有找到已编译的测试文件。");
  }
  for (const file of files) {
    await import(pathToFileURL(path.join(testDirectory, file)).href);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
