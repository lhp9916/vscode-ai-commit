import * as vscode from "vscode";
import { PROVIDERS, getProvider } from "./core/providers";
import {
  MESSAGE_STYLE_OPTIONS,
  normalizeEndpointDraft,
  normalizeSettingsDraft,
  resolveProviderDefaults,
  SettingsDraft,
} from "./core/settingsDraft";
import { MessageStyle, ModelOption, ProviderId } from "./core/types";
import { readSettingsDraft, setApiKey } from "./settings";

export class SettingsPanel {
  private panel: vscode.WebviewPanel | undefined;
  private draft: SettingsDraft | undefined;
  private isSaving = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this.draft = await readSettingsDraft(this.context);
    const panel = vscode.window.createWebviewPanel(
      "aiCommit.settings",
      "AI Commit Message 设置",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel = panel;
    panel.webview.html = this.render();
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }
    switch (message.type) {
      case "ready":
        this.postState();
        return;
      case "providerChanged":
        this.onProviderChanged(message.provider, message.draft);
        return;
      case "save":
        await this.save(message.draft);
        return;
      case "testConnection":
        await this.testConnection(message.draft);
        return;
      case "fetchModels":
        await this.fetchModels(message.draft);
        return;
      default:
        return;
    }
  }

  /**
   * 切换供应商时同步默认地址和模型，但仍遵守“只覆盖未自定义值”的规则。
   */
  private onProviderChanged(providerValue: unknown, draftValue: unknown): void {
    if (!this.draft || typeof providerValue !== "string") {
      return;
    }
    const current = normalizeDraft(draftValue);
    const next = getProvider(providerValue).id;
    const defaults = resolveProviderDefaults(this.draft.provider, next, current.baseUrl, current.model);
    this.draft = {
      ...this.draft,
      provider: next,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    };
    this.postMessage({ type: "providerDefaults", provider: next, ...defaults });
  }

  private async save(draftValue: unknown): Promise<void> {
    await this.runAction(async (draft) => {
      const settings = normalizeSettingsDraft(draft);
      const config = vscode.workspace.getConfiguration("aiCommit");
      await config.update("provider", settings.provider, vscode.ConfigurationTarget.Global);
      await config.update("baseUrl", draft.baseUrl.trim(), vscode.ConfigurationTarget.Global);
      await config.update("model", draft.model.trim(), vscode.ConfigurationTarget.Global);
      await config.update("messageStyle", settings.messageStyle, vscode.ConfigurationTarget.Global);
      await config.update("strictMode", settings.strictMode, vscode.ConfigurationTarget.Global);
      await config.update("extraPrompt", settings.extraPrompt, vscode.ConfigurationTarget.Global);
      await config.update("perFileChars", settings.perFileChars, vscode.ConfigurationTarget.Global);
      await config.update("totalChars", settings.totalChars, vscode.ConfigurationTarget.Global);
      await config.update("timeoutSeconds", settings.timeoutSeconds, vscode.ConfigurationTarget.Global);
      await setApiKey(this.context, settings.provider, draft.apiKey);
      this.draft = { ...draft, ...settings, apiKey: "" };
      return "设置已保存。";
    }, draftValue);
  }

  private async testConnection(draftValue: unknown): Promise<void> {
    this.postMessage({ type: "busy", busy: true, message: "正在测试连接…" });
    try {
      const draft = normalizeDraft(draftValue);
      if (!draft.apiKey.trim()) {
        draft.apiKey = await this.savedApiKey(draft.provider);
      }
      if (!draft.apiKey.trim()) {
        throw new Error("请先填写 API Key。");
      }
      await vscode.commands.executeCommand("aiCommit.runConnectionTest", {
        settings: normalizeSettingsDraft(draft),
        apiKey: draft.apiKey,
      });
      this.postMessage({ type: "status", message: "连接成功。" });
    } catch (error) {
      this.postMessage({ type: "error", message: errorMessage(error) });
    } finally {
      this.postMessage({ type: "busy", busy: false });
    }
  }

  private async fetchModels(draftValue: unknown): Promise<void> {
    this.postMessage({ type: "busy", busy: true, message: "正在获取模型列表…" });
    try {
      const draft = normalizeDraft(draftValue);
      if (!draft.apiKey.trim()) {
        draft.apiKey = await this.savedApiKey(draft.provider);
      }
      if (!draft.apiKey.trim()) {
        throw new Error("请先填写 API Key。");
      }
      const models = await vscode.commands.executeCommand<ModelOption[]>("aiCommit.listModels", {
        settings: normalizeEndpointDraft(draft),
        apiKey: draft.apiKey,
      });
      if (!Array.isArray(models) || models.length === 0) {
        throw new Error("该供应商未返回任何模型。");
      }
      this.postMessage({ type: "models", models, selected: draft.model });
    } catch (error) {
      this.postMessage({ type: "error", message: errorMessage(error) });
    } finally {
      this.postMessage({ type: "busy", busy: false });
    }
  }

  private async runAction(action: (draft: SettingsDraft) => Promise<string>, draftValue: unknown): Promise<void> {
    if (this.isSaving) {
      return;
    }
    this.isSaving = true;
    this.postMessage({ type: "busy", busy: true });
    try {
      const message = await action(normalizeDraft(draftValue));
      this.postMessage({ type: "status", message });
      this.postMessage({ type: "saved" });
    } catch (error) {
      this.postMessage({ type: "error", message: errorMessage(error) });
    } finally {
      this.isSaving = false;
      this.postMessage({ type: "busy", busy: false });
    }
  }

  private postState(): void {
    if (!this.draft) {
      return;
    }
    this.postMessage({
      type: "state",
      draft: this.draft,
      styles: MESSAGE_STYLE_OPTIONS,
      modelOptions: getProvider(this.draft.provider).defaultModel
        ? [getProvider(this.draft.provider).defaultModel]
        : [],
    });
  }

  private async savedApiKey(provider: ProviderId): Promise<string> {
    return (await this.context.secrets.get(`aiCommit.apiKey.${provider}`)) ?? "";
  }

  private postMessage(message: unknown): void {
    void this.panel?.webview.postMessage(message);
  }

  private render(): string {
    const nonce = createNonce();
    const providerOptions = PROVIDERS.map((provider) => (
      `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.displayName)}</option>`
    )).join("");
    const styleOptions = MESSAGE_STYLE_OPTIONS.map((style) => (
      `<option value="${escapeHtml(style.id)}">${escapeHtml(style.label)}</option>`
    )).join("");
    const csp = [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Commit Message 设置</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --brand: #d89a32;
      --brand-soft: color-mix(in srgb, var(--brand) 16%, transparent);
      --line: var(--vscode-panel-border);
      --muted: var(--vscode-descriptionForeground);
      --surface: var(--vscode-editor-background);
      --field: var(--vscode-input-background);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--vscode-foreground);
      background:
        radial-gradient(circle at 92% 0%, var(--brand-soft), transparent 38rem),
        var(--surface);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .shell { max-width: 920px; margin: 0 auto; padding: 30px 32px 42px; }
    header { display: flex; gap: 16px; align-items: center; margin-bottom: 26px; }
    .mark {
      width: 44px; height: 44px; border-radius: 12px; flex: 0 0 auto;
      display: grid; place-items: center; background: #17223b; color: #d89a32;
      font-size: 21px; font-weight: 700;
    }
    h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: .2px; }
    .subtitle, .hint { color: var(--muted); line-height: 1.55; }
    .subtitle { margin: 0; }
    section {
      border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px 18px;
      margin-bottom: 16px; background: color-mix(in srgb, var(--surface) 88%, transparent);
    }
    section h2 { margin: 0 0 16px; font-size: 14px; letter-spacing: .3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 18px; }
    .field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .field.wide { grid-column: 1 / -1; }
    label { font-weight: 600; }
    .optional { color: var(--muted); font-weight: 400; }
    input, select, textarea {
      width: 100%; color: var(--vscode-input-foreground); background: var(--field);
      border: 1px solid var(--vscode-input-border, var(--line)); border-radius: 7px;
      padding: 9px 10px; font: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder);
    }
    textarea { min-height: 76px; resize: vertical; }
    .row { display: flex; gap: 8px; align-items: stretch; }
    .row > input { flex: 1; }
    .fetch-row { align-items: center; }
    .fetch-row .hint { flex: 1; }
    .model-picker { position: relative; }
    .model-picker #model { padding-right: 42px; }
    .model-toggle {
      position: absolute; top: 1px; right: 1px; bottom: 1px; width: 40px;
      border: 0; border-left: 1px solid var(--line); border-radius: 0 7px 7px 0;
      color: var(--vscode-foreground); background: transparent; font-size: 18px;
    }
    .model-toggle:hover { background: var(--vscode-toolbar-hoverBackground); }
    .model-menu {
      position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; right: 0;
      overflow: hidden; border: 1px solid var(--vscode-widget-border, var(--line));
      border-radius: 10px; background: var(--vscode-dropdown-background, var(--field));
      box-shadow: 0 12px 30px var(--vscode-widget-shadow, rgba(0, 0, 0, .35));
    }
    .model-menu[hidden] { display: none; }
    .model-search-wrap { padding: 10px; border-bottom: 1px solid var(--line); }
    .model-search-wrap input { padding: 8px 10px; }
    .model-meta {
      padding: 8px 12px; color: var(--muted); font-size: 12px;
      border-bottom: 1px solid var(--line);
    }
    .model-list { max-height: 300px; overflow-y: auto; padding: 5px 0; }
    .model-group-label {
      padding: 8px 12px 5px; color: var(--muted); font-size: 11px;
      font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
    }
    .model-option {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 14px;
      padding: 8px 12px; cursor: pointer; border-left: 2px solid transparent;
    }
    .model-option:hover, .model-option.active {
      background: var(--vscode-list-hoverBackground);
      border-left-color: var(--brand);
    }
    .model-option.selected { background: var(--vscode-list-activeSelectionBackground); }
    .model-option-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;
    }
    .model-option-context { color: var(--muted); font-size: 11px; white-space: nowrap; }
    .model-option-id {
      grid-column: 1 / -1; color: var(--muted); font-size: 11px;
      font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere;
    }
    .model-empty { padding: 22px 12px; text-align: center; color: var(--muted); }
    button {
      border: 1px solid var(--vscode-button-border, transparent); border-radius: 7px;
      padding: 8px 13px; font: inherit; cursor: pointer; white-space: nowrap;
      color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: .55; cursor: progress; }
    .style-note {
      grid-column: 1 / -1; padding: 12px 14px; border-radius: 9px;
      background: var(--brand-soft); border-left: 3px solid var(--brand);
      line-height: 1.6;
    }
    .style-note code {
      display: block; margin-top: 6px; color: var(--vscode-foreground);
      font-family: var(--vscode-editor-font-family); white-space: pre-wrap;
    }
    .checks { display: flex; align-items: center; gap: 9px; }
    .checks input { width: 16px; height: 16px; }
    .actions {
      position: sticky; bottom: 0; display: flex; gap: 10px; align-items: center;
      padding: 14px 0 2px; background: linear-gradient(transparent, var(--surface) 30%);
    }
    .status { flex: 1; min-height: 20px; line-height: 1.5; }
    .status.error { color: var(--vscode-errorForeground); }
    .status.ok { color: var(--vscode-testing-iconPassed, #3da6a0); }
    @media (max-width: 680px) {
      .shell { padding: 22px 16px 32px; }
      .grid { grid-template-columns: 1fr; }
      .field.wide, .style-note { grid-column: auto; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="mark">AI</div>
      <div>
        <h1>AI Commit Message</h1>
        <p class="subtitle">配置模型服务与提交消息生成方式。API Key 存入 VS Code 加密凭据库。</p>
      </div>
    </header>

    <section>
      <h2>模型服务</h2>
      <div class="grid">
        <div class="field">
          <label for="provider">供应商</label>
          <select id="provider">${providerOptions}</select>
        </div>
        <div class="field wide">
          <label for="baseUrl">Base URL</label>
          <input id="baseUrl" spellcheck="false" autocomplete="off">
          <span class="hint">留空时使用供应商默认地址；切换供应商会自动更新未自定义的地址。</span>
        </div>
        <div class="field wide">
          <label for="apiKey">API Key</label>
          <div class="row">
            <input id="apiKey" type="password" spellcheck="false" autocomplete="off" placeholder="粘贴 API Key">
            <button id="showApiKey" class="secondary" type="button">显示</button>
          </div>
          <span class="hint">密钥只写入 VS Code 加密凭据库，不会写入 settings.json。</span>
        </div>
        <div class="field wide">
          <div class="row fetch-row">
            <button id="fetchModels" class="secondary" type="button">获取模型</button>
            <span class="hint">使用上方 Base URL 与 API Key 拉取可用模型，不需要先填写模型名称。</span>
          </div>
        </div>
        <div class="field wide model-field">
          <label for="model">模型</label>
          <div class="model-picker" id="modelPicker">
            <input id="model" role="combobox" aria-autocomplete="list" aria-expanded="false"
              aria-controls="modelMenu" spellcheck="false" autocomplete="off" placeholder="选择或输入模型">
            <button id="toggleModels" class="model-toggle" type="button" aria-label="展开模型列表">⌄</button>
            <div id="modelMenu" class="model-menu" role="listbox" hidden>
              <div class="model-search-wrap">
                <input id="modelSearch" type="search" autocomplete="off" placeholder="搜索模型、供应商或 ID">
              </div>
              <div class="model-meta" id="modelMeta"></div>
              <div class="model-list" id="modelList"></div>
            </div>
          </div>
          <span class="hint">点击右侧箭头查看全部模型；输入文字可筛选，也可以直接手动填写模型 ID。</span>
        </div>
      </div>
    </section>

    <section>
      <h2>生成方式</h2>
      <div class="grid">
        <div class="field wide">
          <label for="messageStyle">提交消息风格（Message Style）</label>
          <select id="messageStyle">${styleOptions}</select>
          <div class="style-note">
            <span id="styleDescription"></span>
            <code id="styleExample"></code>
          </div>
        </div>
        <div class="field wide">
          <label class="checks"><input id="strictMode" type="checkbox"> 严格模式</label>
          <span class="hint">按 Conventional Commits 校验生成结果；不合规时自动让模型重写一次。</span>
        </div>
        <div class="field wide">
          <label for="extraPrompt">附加要求 <span class="optional">（可选）</span></label>
          <textarea id="extraPrompt" placeholder="例如：不要使用 emoji；正文使用简短要点。"></textarea>
        </div>
      </div>
    </section>

    <section>
      <h2>差异与请求</h2>
      <div class="grid">
        <div class="field">
          <label for="perFileChars">单文件差异上限（字符）</label>
          <input id="perFileChars" type="number" min="1" step="1">
        </div>
        <div class="field">
          <label for="totalChars">总差异上限（字符）</label>
          <input id="totalChars" type="number" min="1" step="1">
        </div>
        <div class="field">
          <label for="timeoutSeconds">请求超时（秒）</label>
          <input id="timeoutSeconds" type="number" min="5" step="1">
        </div>
      </div>
    </section>

    <div class="actions">
      <span id="status" class="status" role="status"></span>
      <button id="testConnection" class="secondary" type="button">测试连接</button>
      <button id="save" type="button">保存设置</button>
    </div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const ids = ["provider", "baseUrl", "model", "apiKey", "messageStyle", "strictMode",
      "extraPrompt", "perFileChars", "totalChars", "timeoutSeconds"];
    const fields = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    let styles = [];
    let models = [];
    let activeModelIndex = 0;
    let modelMenuOpen = false;

    function setStatus(message, kind) {
      const status = document.getElementById("status");
      status.textContent = message;
      status.className = "status" + (kind ? " " + kind : "");
    }

    function syncStyleNote() {
      const style = styles.find((item) => item.id === fields.messageStyle.value);
      document.getElementById("styleDescription").textContent = style ? style.description : "";
      document.getElementById("styleExample").textContent = style ? "示例：" + style.example : "";
    }

    function normalizeModelOption(model) {
      if (typeof model === "string") {
        return { id: model, displayName: model, group: "其他", contextLength: 0 };
      }
      return model;
    }

    function formatContext(length) {
      if (!length) {
        return "";
      }
      if (length >= 1000000) {
        return Math.round(length / 100000) / 10 + "M 上下文";
      }
      return Math.round(length / 1000) + "K 上下文";
    }

    function setModelOptions(options, selected) {
      models = (options || []).map(normalizeModelOption);
      fields.model.value = selected ?? "";
      renderModelList();
    }

    function filteredModels() {
      const query = document.getElementById("modelSearch").value.trim().toLowerCase();
      if (!query) {
        return models;
      }
      return models.filter((model) =>
        model.id.toLowerCase().includes(query)
        || model.displayName.toLowerCase().includes(query)
        || model.group.toLowerCase().includes(query));
    }

    function renderModelList() {
      const list = document.getElementById("modelList");
      const meta = document.getElementById("modelMeta");
      const visible = filteredModels();
      list.replaceChildren();
      meta.textContent = models.length === 0
        ? "还没有候选模型。填写 Base URL 与 API Key 后点击“获取模型”。"
        : "共 " + models.length + " 个模型" + (visible.length === models.length ? "" : "，匹配 " + visible.length + " 个");
      activeModelIndex = Math.min(activeModelIndex, Math.max(0, visible.length - 1));

      let previousGroup = "";
      for (const [index, model] of visible.entries()) {
        if (model.group !== previousGroup) {
          const group = document.createElement("div");
          group.className = "model-group-label";
          group.textContent = model.group;
          list.appendChild(group);
          previousGroup = model.group;
        }
        const option = document.createElement("div");
        option.className = "model-option" + (index === activeModelIndex ? " active" : "")
          + (model.id === fields.model.value ? " selected" : "");
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(model.id === fields.model.value));
        const name = document.createElement("span");
        name.className = "model-option-name";
        name.textContent = model.displayName;
        const context = document.createElement("span");
        context.className = "model-option-context";
        context.textContent = formatContext(model.contextLength);
        const id = document.createElement("span");
        id.className = "model-option-id";
        id.textContent = model.id;
        option.append(name, context, id);
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          chooseModel(model);
        });
        list.appendChild(option);
      }
      if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "model-empty";
        empty.textContent = models.length === 0 ? "暂无候选模型" : "没有匹配的模型，可直接在输入框手动填写";
        list.appendChild(empty);
      }
    }

    function openModelMenu() {
      modelMenuOpen = true;
      document.getElementById("modelMenu").hidden = false;
      fields.model.setAttribute("aria-expanded", "true");
      document.getElementById("modelSearch").value = "";
      renderModelList();
      requestAnimationFrame(() => document.getElementById("modelSearch").focus());
    }

    function closeModelMenu() {
      modelMenuOpen = false;
      document.getElementById("modelMenu").hidden = true;
      fields.model.setAttribute("aria-expanded", "false");
    }

    function chooseModel(model) {
      fields.model.value = model.id;
      closeModelMenu();
      setStatus("已选择 " + model.displayName + "。", "ok");
    }

    function moveActiveModel(delta) {
      const visible = filteredModels();
      if (visible.length === 0) {
        return;
      }
      activeModelIndex = Math.max(0, Math.min(visible.length - 1, activeModelIndex + delta));
      renderModelList();
      document.querySelector(".model-option.active")?.scrollIntoView({ block: "nearest" });
    }

    function readDraft() {
      return {
        provider: fields.provider.value,
        baseUrl: fields.baseUrl.value,
        model: fields.model.value,
        apiKey: fields.apiKey.value,
        messageStyle: fields.messageStyle.value,
        strictMode: fields.strictMode.checked,
        extraPrompt: fields.extraPrompt.value,
        perFileChars: Number(fields.perFileChars.value),
        totalChars: Number(fields.totalChars.value),
        timeoutSeconds: Number(fields.timeoutSeconds.value),
      };
    }

    function applyDraft(draft) {
      for (const id of ids) {
        fields[id].value = draft[id] ?? "";
      }
      fields.strictMode.checked = Boolean(draft.strictMode);
      fields.apiKey.value = "";
      fields.apiKey.placeholder = draft.apiKey ? "已保存，留空则保持不变" : "粘贴 API Key";
      syncStyleNote();
    }

    function setBusy(busy) {
      document.getElementById("save").disabled = busy;
      document.getElementById("testConnection").disabled = busy;
      document.getElementById("fetchModels").disabled = busy;
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "state") {
        styles = message.styles;
        applyDraft(message.draft);
        setModelOptions(message.modelOptions, message.draft.model);
      } else if (message.type === "providerDefaults") {
        if (message.provider === fields.provider.value) {
          fields.baseUrl.value = message.baseUrl;
          setModelOptions(message.model ? [message.model] : [], message.model);
        }
      } else if (message.type === "models") {
        const options = (message.models || []).map(normalizeModelOption);
        const selected = options.some((model) => model.id === message.selected)
          ? message.selected
          : options[0]?.id ?? "";
        setModelOptions(options, selected);
        openModelMenu();
        setStatus("已获取 " + message.models.length + " 个模型，可从下拉列表选择。", "ok");
      } else if (message.type === "status") {
        setStatus(message.message, "ok");
      } else if (message.type === "error") {
        setStatus(message.message, "error");
      } else if (message.type === "busy") {
        setBusy(message.busy);
        if (message.message) {
          setStatus(message.message);
        }
      } else if (message.type === "saved") {
        fields.apiKey.value = "";
        fields.apiKey.placeholder = "已保存，留空则保持不变";
      }
    });

    fields.provider.addEventListener("change", () => {
      vscode.postMessage({ type: "providerChanged", provider: fields.provider.value, draft: readDraft() });
    });
    fields.messageStyle.addEventListener("change", () => {
      syncStyleNote();
      setStatus("消息风格已切换，保存后生效。");
    });

    document.getElementById("toggleModels").addEventListener("click", () => {
      if (modelMenuOpen) {
        closeModelMenu();
      } else {
        openModelMenu();
      }
    });
    document.getElementById("modelSearch").addEventListener("input", () => {
      activeModelIndex = 0;
      renderModelList();
    });
    document.getElementById("modelSearch").addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveModel(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const model = filteredModels()[activeModelIndex];
        if (model) {
          chooseModel(model);
        }
      } else if (event.key === "Escape") {
        closeModelMenu();
        fields.model.focus();
      }
    });
    fields.model.addEventListener("click", () => {
      if (!modelMenuOpen) {
        openModelMenu();
      }
    });
    fields.model.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        openModelMenu();
      } else if (event.key === "Escape") {
        closeModelMenu();
      }
    });
    document.addEventListener("mousedown", (event) => {
      if (modelMenuOpen && !document.getElementById("modelPicker").contains(event.target)) {
        closeModelMenu();
      }
    });

    document.getElementById("showApiKey").addEventListener("click", () => {
      const hidden = fields.apiKey.type === "password";
      fields.apiKey.type = hidden ? "text" : "password";
      document.getElementById("showApiKey").textContent = hidden ? "隐藏" : "显示";
    });
    document.getElementById("fetchModels").addEventListener("click", () => {
      vscode.postMessage({ type: "fetchModels", draft: readDraft() });
    });
    document.getElementById("testConnection").addEventListener("click", () => {
      vscode.postMessage({ type: "testConnection", draft: readDraft() });
    });
    document.getElementById("save").addEventListener("click", () => {
      vscode.postMessage({ type: "save", draft: readDraft() });
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

function normalizeDraft(value: unknown): SettingsDraft {
  if (!isRecord(value)) {
    throw new Error("设置内容无效。");
  }
  return {
    provider: String(value.provider ?? "") as ProviderId,
    baseUrl: String(value.baseUrl ?? ""),
    model: String(value.model ?? ""),
    apiKey: String(value.apiKey ?? ""),
    messageStyle: String(value.messageStyle ?? "") as MessageStyle,
    strictMode: Boolean(value.strictMode),
    extraPrompt: String(value.extraPrompt ?? ""),
    perFileChars: Number(value.perFileChars),
    totalChars: Number(value.totalChars),
    timeoutSeconds: Number(value.timeoutSeconds),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
