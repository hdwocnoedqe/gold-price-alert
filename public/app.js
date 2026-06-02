import { evaluateRule } from "./alert-engine.js";

const refreshIntervalMs = 30 * 60 * 1000;
const maxHistoryItems = 500;
const storageKeys = {
  rules: "gold-alert.rules",
  history: "gold-alert.history",
  lastQuote: "gold-alert.last-quote",
};

const elements = {
  priceValue: document.querySelector("#priceValue"),
  updatedAt: document.querySelector("#updatedAt"),
  errorMessage: document.querySelector("#errorMessage"),
  statusBadge: document.querySelector("#statusBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  enableNotifications: document.querySelector("#enableNotifications"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleType: document.querySelector("#ruleType"),
  referenceField: document.querySelector("#referenceField"),
  referencePrice: document.querySelector("#referencePrice"),
  windowField: document.querySelector("#windowField"),
  windowMinutes: document.querySelector("#windowMinutes"),
  thresholdPercent: document.querySelector("#thresholdPercent"),
  rulesList: document.querySelector("#rulesList"),
  historyList: document.querySelector("#historyList"),
};

let rules = loadJson(storageKeys.rules, []);
let history = loadJson(storageKeys.history, []);
let lastQuote = normalizeQuote(loadJson(storageKeys.lastQuote, null));

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeQuote(quote) {
  const price = Number(quote?.price);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    symbol: "XAU/USD",
    price,
    updatedAt: quote.updatedAt || new Date().toISOString(),
    source: quote.source || "goldapi.io/XAU/USD",
  };
}

function formatUsdPerOunce(price) {
  if (!Number.isFinite(price)) {
    return "--";
  }

  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)} / 盎司`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function setStatus(message, isError = false) {
  elements.statusBadge.textContent = message;
  elements.statusBadge.classList.toggle("error", isError);
}

function setErrorMessage(message = "") {
  elements.errorMessage.textContent = message;
}

function hasRenderableQuote(quote) {
  return Boolean(quote && Number.isFinite(quote.price) && quote.price > 0);
}

async function fetchJsonWithTimeout(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("获取实时价格超时，请稍后再试。");
    }

    throw new Error("无法连接本地服务，请确认 node server.js 正在运行。");
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderQuote() {
  if (!lastQuote) {
    elements.priceValue.textContent = "--";
    elements.updatedAt.textContent = "等待首次更新";
    return;
  }

  elements.priceValue.textContent = formatUsdPerOunce(lastQuote.price);
  elements.updatedAt.textContent = `更新时间 ${formatTime(lastQuote.updatedAt)} · ${lastQuote.source}`;
}

function renderRules() {
  if (!rules.length) {
    elements.rulesList.innerHTML = `<div class="empty">还没有提醒规则</div>`;
    return;
  }

  elements.rulesList.innerHTML = rules
    .map((rule) => {
      const normalizedRule = {
        ...rule,
        referenceUnit: "usd_per_ounce",
      };
      const evaluation = evaluateRule(normalizedRule, lastQuote, history);
      const changeClass = evaluation.changePercent >= 0 ? "up" : "down";
      const title =
        normalizedRule.type === "reference"
          ? `参考价 ${formatUsdPerOunce(Number(normalizedRule.referencePrice))}`
          : `${normalizedRule.windowMinutes} 分钟内波动`;
      const detail =
        normalizedRule.type === "reference"
          ? `超过 ${normalizedRule.thresholdPercent}% 提醒`
          : `${normalizedRule.windowMinutes} 分钟内涨跌超过 ${normalizedRule.thresholdPercent}% 提醒`;
      const status =
        evaluation.status === "waiting"
          ? "等待足够数据"
          : evaluation.status === "triggered"
            ? "已触发"
            : "监控中";

      return `
        <article class="rule-card">
          <div>
            <strong>${title}</strong>
            <div class="rule-meta">${detail} · ${status}</div>
            <div class="rule-meta">当前涨跌幅 <span class="change ${changeClass}">${formatPercent(evaluation.changePercent)}</span></div>
          </div>
          <button class="danger" type="button" data-remove-rule="${normalizedRule.id}">删除</button>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  const visibleHistory = history.slice(-6).reverse();

  if (!visibleHistory.length) {
    elements.historyList.innerHTML = `<div class="empty">还没有价格记录</div>`;
    return;
  }

  elements.historyList.innerHTML = visibleHistory
    .map(
      (item) => `
        <div class="history-row">
          <div>
            <strong>${formatUsdPerOunce(item.price)}</strong>
            <div class="history-meta">${formatTime(item.updatedAt)}</div>
          </div>
          <div class="history-meta">${item.source}</div>
        </div>
      `,
    )
    .join("");
}

function render() {
  renderQuote();
  renderRules();
  renderHistory();
}

function addQuoteToHistory(quote) {
  const lastItem = history.at(-1);

  if (lastItem?.updatedAt === quote.updatedAt && lastItem?.price === quote.price) {
    return;
  }

  history.push(quote);
  history = history.slice(-maxHistoryItems);
  saveJson(storageKeys.history, history);
}

function createAlertMessage(rule, evaluation) {
  const direction = evaluation.changePercent >= 0 ? "上涨" : "下跌";

  if (rule.type === "reference") {
    return `当前黄金价格较参考价${direction} ${Math.abs(evaluation.changePercent).toFixed(2)}%。`;
  }

  return `当前黄金价格在 ${rule.windowMinutes} 分钟内${direction} ${Math.abs(evaluation.changePercent).toFixed(2)}%。`;
}

function sendNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  new Notification(title, { body });
}

function evaluateRulesAndNotify() {
  let changed = false;

  rules = rules.map((rule) => {
    const normalizedRule = {
      ...rule,
      referenceUnit: "usd_per_ounce",
    };
    const evaluation = evaluateRule(normalizedRule, lastQuote, history);
    const nextRule = { ...normalizedRule };

    if (evaluation.status === "triggered" && !normalizedRule.armed) {
      sendNotification("黄金价格提醒", createAlertMessage(normalizedRule, evaluation));
      nextRule.armed = true;
      changed = true;
    }

    if (evaluation.status === "normal" && normalizedRule.armed) {
      nextRule.armed = false;
      changed = true;
    }

    return nextRule;
  });

  if (changed) {
    saveJson(storageKeys.rules, rules);
  }
}

async function fetchPrice() {
  setStatus("正在获取");
  setErrorMessage("");

  try {
    const { response, data } = await fetchJsonWithTimeout("/api/price");

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "数据暂时不可用");
    }

    const quote = normalizeQuote(data.quote);
    if (!quote) {
      throw new Error("接口没有返回有效金价。");
    }

    lastQuote = quote;
    saveJson(storageKeys.lastQuote, lastQuote);
    addQuoteToHistory(lastQuote);
    evaluateRulesAndNotify();
    setStatus("已更新");
  } catch (error) {
    if (hasRenderableQuote(lastQuote)) {
      setStatus("使用缓存", true);
      setErrorMessage(
        `${error instanceof Error ? error.message : "数据暂时不可用"} 当前显示的是上次成功获取的价格。`,
      );
    } else {
      setStatus("获取失败", true);
      setErrorMessage(error instanceof Error ? error.message : "数据暂时不可用");
    }
  }

  render();
}

function updateRuleTypeFields() {
  const isReference = elements.ruleType.value === "reference";
  elements.referenceField.classList.toggle("hidden", !isReference);
  elements.windowField.classList.toggle("hidden", isReference);
  elements.referencePrice.required = isReference;
  elements.windowMinutes.required = !isReference;
}

function addRule(event) {
  event.preventDefault();

  const type = elements.ruleType.value;
  const thresholdPercent = Number(elements.thresholdPercent.value);
  const nextRule = {
    id: crypto.randomUUID(),
    type,
    thresholdPercent,
    armed: false,
  };

  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
    return;
  }

  if (type === "reference") {
    const referencePrice = Number(elements.referencePrice.value);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      return;
    }
    nextRule.referencePrice = referencePrice;
    nextRule.referenceUnit = "usd_per_ounce";
  }

  if (type === "window") {
    const windowMinutes = Number(elements.windowMinutes.value);
    if (!Number.isInteger(windowMinutes) || windowMinutes <= 0) {
      return;
    }
    nextRule.windowMinutes = windowMinutes;
  }

  rules.push(nextRule);
  saveJson(storageKeys.rules, rules);
  elements.ruleForm.reset();
  updateRuleTypeFields();
  renderRules();
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    elements.enableNotifications.textContent = "浏览器不支持通知";
    return;
  }

  const permission = await Notification.requestPermission();
  elements.enableNotifications.textContent =
    permission === "granted" ? "通知已开启" : "通知未开启";
}

elements.ruleType.addEventListener("change", updateRuleTypeFields);
elements.ruleForm.addEventListener("submit", addRule);
elements.refreshButton.addEventListener("click", fetchPrice);
elements.enableNotifications.addEventListener("click", enableNotifications);
elements.rulesList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-rule]");

  if (!button) {
    return;
  }

  rules = rules.filter((rule) => rule.id !== button.dataset.removeRule);
  saveJson(storageKeys.rules, rules);
  renderRules();
});

updateRuleTypeFields();
render();
fetchPrice();
window.setInterval(fetchPrice, refreshIntervalMs);
