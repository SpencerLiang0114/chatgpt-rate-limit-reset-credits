// ==UserScript==
// @name         ChatGPT Rate Limit Reset Credits
// @namespace    https://chatgpt.com/
// @version      2.3
// @description  更完整的额度仪表盘 + 紧凑中文布局
// @author       SpencerLiang0114
// @contributor  nobiyou
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @downloadURL  https://raw.githubusercontent.com/SpencerLiang0114/chatgpt-rate-limit-reset-credits/main/chatgpt-rate-limit-reset-credits.user.js
// @updateURL    https://raw.githubusercontent.com/SpencerLiang0114/chatgpt-rate-limit-reset-credits/main/chatgpt-rate-limit-reset-credits.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  let panel, contentDiv, launcherBtn, styleEl;
  let accessToken = "";
  let isCollapsed = true;

  function formatDate(value) {
    if (!value) return "未知";
    const date = typeof value === "string" ? new Date(value) : new Date(value * 1000);
    if (isNaN(date.getTime())) return "格式错误";
    return date.toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function localizeCreditTitle(title) {
    if (!title) return "完整重置（每周 + 5小时）";

    let text = String(title).trim();
    const replacements = [
      [/Full reset/gi, "完整重置"],
      [/Weekly/gi, "每周"],
      [/Daily/gi, "每日"],
      [/Monthly/gi, "每月"],
      [/Credits?/gi, "额度"],
      [/Bonus/gi, "奖励"],
      [/Reset/gi, "重置"],
      [/Hours?/gi, "小时"],
      [/\bhr\b/gi, "小时"]
    ];

    replacements.forEach(([pattern, value]) => {
      text = text.replace(pattern, value);
    });

    text = text
      .replace(/\(([^)]+)\)/g, "（$1）")
      .replace(/\s*\+\s*/g, " + ")
      .replace(/\s{2,}/g, " ")
      .replace(/(\d+)\s*小时/gi, "$1小时")
      .trim();

    return text;
  }

  function normalizeDate(value) {
    if (!value) return null;
    const date = typeof value === "string" ? new Date(value) : new Date(value * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDuration(ms) {
    const abs = Math.abs(ms);
    const days = Math.floor(abs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${Math.max(minutes, 1)}分钟`;
  }

  function formatRelativeTime(value) {
    const date = normalizeDate(value);
    if (!date) return "未知";
    const diff = date.getTime() - Date.now();
    const duration = formatDuration(diff);
    return diff >= 0 ? `${duration}后` : `${duration}前`;
  }

  function getCreditStatus(expiresAt) {
    const expireDate = normalizeDate(expiresAt);
    if (!expireDate) return { key: "unknown", label: "未知", tone: "muted" };

    const diff = expireDate.getTime() - Date.now();
    if (diff <= 0) return { key: "expired", label: "已过期", tone: "danger" };
    if (diff <= 6 * 60 * 60 * 1000) return { key: "urgent", label: "即将过期", tone: "danger" };
    if (diff <= 24 * 60 * 60 * 1000) return { key: "today", label: "24小时内", tone: "warn" };
    return { key: "active", label: "可用", tone: "ok" };
  }

  function getElapsedPercent(grantedAt, expiresAt) {
    const start = normalizeDate(grantedAt);
    const end = normalizeDate(expiresAt);
    if (!start || !end || end <= start) return 0;

    const percent = ((Date.now() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
    return Math.min(100, Math.max(0, Math.round(percent)));
  }

  function summarizeCredits(data) {
    const credits = Array.isArray(data.credits) ? data.credits : [];
    const available = Number(data.available_count || 0);
    const totalEarned = Number(data.total_earned_count || 0);
    const activeCredits = credits.filter((credit) => getCreditStatus(credit.expires_at).key !== "expired");
    const expiring24h = activeCredits.filter((credit) => {
      const expires = normalizeDate(credit.expires_at);
      return expires && expires.getTime() - Date.now() <= 24 * 60 * 60 * 1000;
    });
    const nextCredit = activeCredits
      .slice()
      .sort((a, b) => {
        const aDate = normalizeDate(a.expires_at);
        const bDate = normalizeDate(b.expires_at);
        return (aDate ? aDate.getTime() : Infinity) - (bDate ? bDate.getTime() : Infinity);
      })[0];

    return {
      credits,
      available,
      totalEarned,
      used: Math.max(totalEarned - available, 0),
      activeCount: activeCredits.length,
      expiredCount: credits.length - activeCredits.length,
      expiring24hCount: expiring24h.length,
      nextExpiry: nextCredit ? nextCredit.expires_at : null,
      refreshedAt: formatDate(Date.now() / 1000)
    };
  }

  function renderMetric(label, value, hint, tone = "") {
    return `
      <div class="rl-metric ${tone}">
        <div class="rl-label">${escapeHtml(label)}</div>
        <div class="rl-metric-value">${escapeHtml(value)}</div>
        <div class="rl-hint">${escapeHtml(hint)}</div>
      </div>`;
  }

  function renderTimelineBar(percent, tone) {
    return `
      <div class="rl-progress" title="已使用生命周期 ${percent}%">
        <span class="${tone}" style="width:${percent}%"></span>
      </div>`;
  }

  function renderCreditCard(credit, index) {
    const title = escapeHtml(localizeCreditTitle(credit.title));
    const status = getCreditStatus(credit.expires_at);
    const percent = getElapsedPercent(credit.granted_at, credit.expires_at);
    const idText = credit.id || credit.credit_id || credit.grant_id || `#${index + 1}`;

    return `
      <article class="rl-credit">
        <div class="rl-credit-head">
          <div>
            <div class="rl-credit-index">${escapeHtml(idText)}</div>
            <div class="rl-credit-title">${title}</div>
          </div>
          <span class="rl-pill ${status.tone}">${status.label}</span>
        </div>

        ${renderTimelineBar(percent, status.tone)}

        <div class="rl-detail-grid">
          <div>
            <div class="rl-label">获得时间</div>
            <div class="rl-detail-value">${escapeHtml(formatDate(credit.granted_at))}</div>
          </div>
          <div>
            <div class="rl-label">过期时间</div>
            <div class="rl-detail-value">${escapeHtml(formatDate(credit.expires_at))}</div>
          </div>
          <div>
            <div class="rl-label">${status.key === "expired" ? "过期于" : "剩余时间"}</div>
            <div class="rl-detail-value strong">${escapeHtml(formatRelativeTime(credit.expires_at))}</div>
          </div>
        </div>
      </article>`;
  }

  function renderEmptyState() {
    return `
      <div class="rl-empty">
        <div class="rl-empty-title">暂无可用额度</div>
        <div class="rl-empty-copy">刷新后仍为空，说明当前账号没有可展示的重置额度。</div>
      </div>`;
  }

  function showError() {
    if (!contentDiv) return;
    contentDiv.innerHTML = `
      <div class="rl-error">
        <div class="rl-empty-title">请求失败</div>
        <div class="rl-empty-copy">请确认 ChatGPT 已登录，然后点右上角图标重新打开并刷新。</div>
      </div>`;
  }

  function injectStyles() {
    if (styleEl) return;

    styleEl = document.createElement("style");
    styleEl.textContent = `
      #rl-content, #rl-content * { box-sizing: border-box; letter-spacing: 0; }
      #rl-content button { font: inherit; }
      .rl-shell { color: #172033; }
      .rl-topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
      .rl-title { margin: 0; color: #101827; font-size: 19px; line-height: 1.2; font-weight: 800; }
      .rl-subtitle { margin-top: 4px; color: #667085; font-size: 12px; line-height: 1.4; }
      .rl-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
      .rl-btn { min-width: 44px; height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid #d7deea; cursor: pointer; color: #344054; background: #ffffff; font-size: 13px; font-weight: 700; }
      .rl-btn.primary { border-color: #153e75; color: #ffffff; background: #153e75; box-shadow: 0 8px 18px rgba(21, 62, 117, 0.18); }
      .rl-btn:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }
      .rl-hero { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px; align-items: stretch; margin-bottom: 10px; }
      .rl-balance { min-height: 118px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 14px; background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 52%, #ecfdf3 100%); position: relative; overflow: hidden; }
      .rl-balance:after { content: ""; position: absolute; right: -26px; top: -28px; width: 108px; height: 108px; border: 18px solid rgba(21, 62, 117, 0.1); border-radius: 999px; }
      .rl-balance-number { display: flex; align-items: baseline; gap: 6px; margin-top: 8px; color: #14532d; font-weight: 850; }
      .rl-balance-number b { font-size: 42px; line-height: 0.95; }
      .rl-balance-number span { color: #667085; font-size: 15px; font-weight: 700; }
      .rl-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .rl-metric { min-height: 78px; padding: 10px; border: 1px solid #e4e9f2; border-radius: 12px; background: #ffffff; }
      .rl-metric.ok { border-color: #bbf7d0; background: #f0fdf4; }
      .rl-metric.warn { border-color: #fde68a; background: #fffbeb; }
      .rl-label { color: #667085; font-size: 10.5px; line-height: 1.2; font-weight: 750; text-transform: uppercase; }
      .rl-metric-value { margin-top: 5px; color: #101827; font-size: 19px; line-height: 1.05; font-weight: 850; }
      .rl-hint { margin-top: 4px; color: #667085; font-size: 11.5px; line-height: 1.35; }
      .rl-section-head { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px; gap: 8px; color: #344054; font-size: 13px; font-weight: 800; }
      .rl-section-head span { color: #667085; font-size: 11px; font-weight: 700; }
      .rl-credit { padding: 12px; border: 1px solid #e4e9f2; border-radius: 13px; background: #ffffff; box-shadow: 0 10px 24px rgba(16, 24, 40, 0.06); margin-bottom: 9px; }
      .rl-credit-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 9px; }
      .rl-credit-index { color: #667085; font-size: 10.5px; line-height: 1.2; font-weight: 800; }
      .rl-credit-title { margin-top: 3px; color: #101827; font-size: 14px; line-height: 1.35; font-weight: 800; word-break: break-word; }
      .rl-pill { flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; font-size: 11px; line-height: 1; font-weight: 850; }
      .rl-pill.ok { color: #166534; background: #dcfce7; }
      .rl-pill.warn { color: #92400e; background: #fef3c7; }
      .rl-pill.danger { color: #991b1b; background: #fee2e2; }
      .rl-pill.muted { color: #475569; background: #e2e8f0; }
      .rl-progress { height: 7px; border-radius: 999px; background: #eef2f7; overflow: hidden; margin-bottom: 10px; }
      .rl-progress span { display: block; height: 100%; border-radius: inherit; background: #153e75; }
      .rl-progress span.ok { background: #16a34a; }
      .rl-progress span.warn { background: #f59e0b; }
      .rl-progress span.danger { background: #dc2626; }
      .rl-progress span.muted { background: #94a3b8; }
      .rl-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .rl-detail-grid > div { min-width: 0; padding: 8px; border-radius: 10px; background: #f8fafc; border: 1px solid #eef2f7; }
      .rl-detail-value { margin-top: 4px; color: #172033; font-size: 12.5px; line-height: 1.35; font-weight: 650; word-break: break-word; }
      .rl-detail-value.strong { color: #14532d; font-weight: 850; }
      .rl-footnote { padding: 8px 2px 0; color: #667085; font-size: 11px; line-height: 1.4; }
      .rl-empty, .rl-error { padding: 22px 16px; border: 1px dashed #cbd5e1; border-radius: 13px; background: #f8fafc; text-align: center; }
      .rl-error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
      .rl-empty-title { color: inherit; font-size: 14px; font-weight: 850; }
      .rl-empty-copy { margin-top: 5px; color: #667085; font-size: 12px; line-height: 1.5; }
      @media (max-width: 520px) {
        .rl-topbar, .rl-credit-head { align-items: stretch; flex-direction: column; }
        .rl-actions { width: 100%; }
        .rl-btn { flex: 1; }
        .rl-hero { grid-template-columns: 1fr; }
        .rl-detail-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  async function getAccessToken() {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const data = await res.json();
      accessToken = data.accessToken || data.access_token || "";
      return accessToken;
    } catch (e) { return ""; }
  }

  async function fetchRateLimit(hasRetriedAuth = false) {
    if (!accessToken) await getAccessToken();

    try {
      const res = await fetch("https://chatgpt.com/backend-api/wham/rate-limit-reset-credits", {
        method: "GET",
        headers: { accept: "*/*", authorization: `Bearer ${accessToken}` },
        credentials: "include"
      });

      if (res.status === 401 && !hasRetriedAuth) {
        await getAccessToken();
        return fetchRateLimit(true);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      updateLauncher(data.available_count || 0);
      showResult(data);

    } catch (err) {
      updateLauncher("!");
      showError();
    }
  }

  function updateLauncher(value) {
    if (!launcherBtn) return;
    const badge = launcherBtn.querySelector("#rl-launcher-badge");
    if (!badge) return;
    badge.textContent = String(value);
  }

  function setCollapsed(nextCollapsed) {
    isCollapsed = nextCollapsed;
    if (panel) panel.style.display = isCollapsed ? "none" : "block";
    if (launcherBtn) launcherBtn.style.display = isCollapsed ? "flex" : "none";
  }

  function showResult(data) {
    if (!contentDiv) return;
    const summary = summarizeCredits(data);
    const creditsHtml = summary.credits.length > 0
      ? summary.credits.map((credit, index) => renderCreditCard(credit, index)).join("")
      : renderEmptyState();

    contentDiv.innerHTML = `
      <div class="rl-shell">
        <div class="rl-topbar">
          <div>
            <h2 class="rl-title">额度仪表盘</h2>
            <div class="rl-subtitle">刷新于 ${escapeHtml(summary.refreshedAt)}，数据来自当前 ChatGPT 登录会话。</div>
          </div>
          <div class="rl-actions">
            <button id="collapseBtn" class="rl-btn" type="button">收起</button>
            <button id="refreshBtn" class="rl-btn primary" type="button">刷新</button>
          </div>
        </div>

        <section class="rl-hero">
          <div class="rl-balance">
            <div class="rl-label">当前可用重置额度</div>
            <div class="rl-balance-number">
              <b>${escapeHtml(summary.available)}</b>
              <span>/ ${escapeHtml(summary.totalEarned)}</span>
            </div>
            <div class="rl-hint">已使用 ${escapeHtml(summary.used)} 个，列表中仍有效 ${escapeHtml(summary.activeCount)} 个。</div>
          </div>
          <div class="rl-metrics">
            ${renderMetric("24小时内到期", summary.expiring24hCount, "需要优先使用", summary.expiring24hCount > 0 ? "warn" : "")}
            ${renderMetric("下一次过期", summary.nextExpiry ? formatRelativeTime(summary.nextExpiry) : "暂无", summary.nextExpiry ? formatDate(summary.nextExpiry) : "没有未来过期时间", summary.nextExpiry ? "ok" : "")}
            ${renderMetric("有效条目", summary.activeCount, `共 ${summary.credits.length} 条记录`, "ok")}
            ${renderMetric("已过期条目", summary.expiredCount, "仍会保留在列表中", summary.expiredCount > 0 ? "warn" : "")}
          </div>
        </section>

        <div class="rl-section-head">
          <div>额度明细</div>
          <span>按接口返回顺序展示</span>
        </div>
        ${creditsHtml}

        <div class="rl-footnote">
          显示字段：available_count、total_earned_count、credits、granted_at、expires_at。进度条表示从获得到过期的时间生命周期。
        </div>
      </div>`;
    contentDiv.querySelector("#refreshBtn").addEventListener("click", fetchRateLimit);
    contentDiv.querySelector("#collapseBtn").addEventListener("click", () => setCollapsed(true));
  }

  function createLauncher() {
    launcherBtn = document.createElement("button");
    launcherBtn.type = "button";
    launcherBtn.title = "查看额度详情";
    launcherBtn.style.cssText = `
      position:fixed; top:70px; right:20px; width:54px; height:54px; display:flex;
      align-items:center; justify-content:center; border:none; border-radius:18px;
      background:linear-gradient(135deg,#2563eb,#1d4ed8); box-shadow:0 16px 30px rgba(37,99,235,0.28);
      z-index:100000; cursor:pointer; padding:0; box-sizing:border-box;
    `;
    launcherBtn.innerHTML = `
      <div style="position:relative;width:22px;height:22px;border:2px solid rgba(255,255,255,0.96);border-radius:999px;box-sizing:border-box">
        <span style="position:absolute;left:9px;top:3px;width:2px;height:7px;background:#ffffff;border-radius:999px"></span>
        <span style="position:absolute;left:9px;top:9px;width:6px;height:2px;background:#ffffff;border-radius:999px"></span>
      </div>
      <span id="rl-launcher-badge" style="position:absolute;top:-4px;right:-4px;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-sizing:border-box">0</span>
    `;
    launcherBtn.addEventListener("click", () => setCollapsed(false));
    document.body.appendChild(launcherBtn);
  }

  function createPanel() {
    injectStyles();
    createLauncher();

    panel = document.createElement("div");
    panel.style.cssText = `
      position:fixed; top:70px; right:20px; width:min(580px, calc(100vw - 20px));
      background:linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98));
      border:1px solid #bfdbfe; border-radius:18px; box-shadow:0 18px 48px rgba(15,23,42,0.14);
      backdrop-filter:blur(10px); z-index:99999; padding:14px; box-sizing:border-box;
      font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size:14px;
      color:#1f2937; max-height:85vh; overflow:auto; display:none;
    `;

    panel.innerHTML = `
      <div id="rl-content">
        <div style="padding:18px;border:1px solid #dbeafe;background:#f8fbff;border-radius:14px;color:#475569;text-align:center;font-weight:600">
          正在加载额度信息...
        </div>
      </div>`;
    document.body.appendChild(panel);
    contentDiv = panel.querySelector("#rl-content");
    setCollapsed(true);

    setTimeout(() => getAccessToken().then(() => fetchRateLimit()), 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel);
  } else {
    createPanel();
  }
})();
