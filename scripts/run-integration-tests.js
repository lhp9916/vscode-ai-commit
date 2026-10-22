"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.join(extensionDevelopmentPath, "out", "integration", "index.js");
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "ai-commit-integration-"));
  prepareRepository(workspacePath);

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    timeout: 60_000,
    launchArgs: [
      workspacePath,
      "--disable-extensions",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
}

function prepareRepository(workspacePath) {
  fs.mkdirSync(workspacePath, { recursive: true });
  if (!fs.existsSync(path.join(workspacePath, ".git"))) {
    runGit(workspacePath, ["init", "-q"]);
    runGit(workspacePath, ["config", "user.email", "test@example.com"]);
    runGit(workspacePath, ["config", "user.name", "Integration Test"]);
  }
  fs.writeFileSync(path.join(workspacePath, "staged.txt"), "staged\n", "utf8");
  runGit(workspacePath, ["add", "staged.txt"]);
}

function runGit(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
