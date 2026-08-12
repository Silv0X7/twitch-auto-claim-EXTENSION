(() => {
  "use strict";

  // ============================================================
  // Twitch Auto Claim Points — Content Script
  // Professional build with in-chat settings (7TV-style)
  // ============================================================

  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[TAC]", ...a);

  // ---------- Settings (synced with storage) ----------

  // Safe chrome API wrapper — avoids "Extension context invalidated"
  function chromeOk() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeStorageGet(keys, cb) {
    if (!chromeOk()) return;
    try {
      chrome.storage.local.get(keys, (r) => {
        if (chrome.runtime.lastError) return;
        try { cb(r); } catch {}
      });
    } catch {}
  }

  function safeStorageSet(obj) {
    if (!chromeOk()) return;
    try { chrome.storage.local.set(obj); } catch {}
  }

  function safeSendMessage(msg) {
    if (!chromeOk()) return;
    try {
      chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
    } catch {}
  }

  const DEFAULTS = {
    enabled: true,
    showToast: true,
    showButton: true
  };
  let settings = { ...DEFAULTS };

  safeStorageGet(["tacSettings"], (r) => {
    if (r.tacSettings) settings = { ...DEFAULTS, ...r.tacSettings };
    applySettingsUI();
  });

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (!chromeOk()) return;
      if (changes.tacSettings) {
        settings = { ...DEFAULTS, ...changes.tacSettings.newValue };
        applySettingsUI();
      }
    });
  } catch {}

  function saveSettings() {
    safeStorageSet({ tacSettings: settings });
  }

  // ---------- Multi-language Claim Bonus ----------
  const CLAIM_ARIA_LABELS = [
    "Claim Bonus", "Receber bónus", "Resgatar Bônus",
    "Reclamar bonificación", "Reclamar bono", "Récupérer un bonus",
    "Bonus einfordern", "Riscatta bonus", "Få bonus", "Motta bonus",
    "Odbierz bonus", "Hämta bonus", "领取奖励", "領取額外獎勵",
    "ボーナスを受け取る", "보너스 받기", "Получить бонус", "Nhận thưởng",
    "Vyzdvihnúť bonus", "Vyzvednout bonus", "Obține bonusul",
    "Bónusz igénylése", "Bonus claimen", "Lunasta bonus",
    "Διεκδίκηση μπόνους", "Получаване на бонус", "เคลมโบนัส", "Bonusu al"
  ];

  // ---------- Channel name ----------
  function getChannelNameFromUrl(url) {
    let pathname;
    try { pathname = new URL(url).pathname; } catch { pathname = url; }
    try { pathname = decodeURIComponent(pathname); } catch {}
    const parts = pathname.replace(/^\/|\/$/g, "").split("/");

    if (parts[0] === "moderator" && parts[1]) return parts[1];
    if (parts[0] === "popout" && parts[1] === "moderator" && parts[2]) return parts[2];
    if (parts[0] === "popout" && parts[1] && !["moderator", "settings", "dashboard"].includes(parts[1]))
      return parts[1];
    if (parts[0] === "popout" && !parts[1]) return null;

    const special = [
      "directory","videos","search","settings","dashboard","subscriptions",
      "friends","inventory","drops","wallet","downloads","jobs","security",
      "creators","turbo","broadcast","messages","notifications","moderator","popout"
    ];
    if (parts[0] && !special.includes(parts[0])) return parts[0];
    try {
      const p = new URL(url).searchParams.get("channel");
      if (p) return decodeURIComponent(p);
    } catch {}
    return null;
  }

  // ---------- Find claim button ----------
  function findCommunityPointsSummary(doc = document) {
    return (
      doc.querySelector('[data-test-selector="community-points-summary"]') ||
      doc.querySelector(".community-points-summary") ||
      null
    );
  }

  function findButtonByAriaLabel(root) {
    for (const label of CLAIM_ARIA_LABELS) {
      const btn = root.querySelector(`[aria-label="${label}"]`);
      if (btn) return btn;
    }
    return null;
  }

  function findClaimButton(root = document) {
    const scope = root || document;
    let button =
      scope.querySelector('[data-test-selector="claimable-bonus"]') ||
      scope.querySelector(".claimable-bonus__icon")?.closest("button") ||
      findButtonByAriaLabel(scope);

    if (!button) return null;
    if (button.nodeName !== "BUTTON") {
      button = button.querySelector?.("button") || findButtonByAriaLabel(scope);
    }
    if (!button || button.disabled) return null;
    return button;
  }

  // ---------- Claim guard ----------
  function createClaimGuard(ms = 2000) {
    const handled = new WeakSet();
    let last = 0;
    return {
      canClaim(b) {
        if (!b || handled.has(b) || Date.now() - last < ms) return false;
        return true;
      },
      mark(b) {
        if (b) handled.add(b);
        last = Date.now();
      }
    };
  }
  const guard = createClaimGuard(2000);

  const excludeRe = [/dashboard\.twitch\.tv/, /twitch\.tv\/settings\//];
  const isExcluded = () => excludeRe.some((r) => r.test(location.href));

  function debounce(fn, wait) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
  }

  function sendIncrement(channel) {
    if (!channel) return;
    const key = String(channel).toLowerCase().trim();
    // Primary: write storage from content script (most reliable)
    safeStorageGet("tcpacObj", (r) => {
      const obj = { ...(r.tcpacObj || {}) };
      obj[key] = (obj[key] || 0) + 1;
      safeStorageSet({ tcpacObj: obj });
      log("Counter", key, obj[key]);
    });
    // Also notify background (keeps multi-tab consistent when possible)
    safeSendMessage({ type: "INCREMENT_CLAIM", channel: key });
  }

  // ---------- Toast + mini Hype animation ----------
  function getParachuteURL() {
    try {
      if (chromeOk() && chrome.runtime.getURL) {
        return chrome.runtime.getURL("images/icon128.png");
      }
    } catch {}
    return "";
  }

  // Tiny purple parachute SVG fallback if PNG fails to load
  const PARA_FALLBACK =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<path fill="#9b5cff" d="M32 4C18 4 8 14 8 24c0 2 8 4 24 4s24-2 24-4C56 14 46 4 32 4z"/>' +
      '<path stroke="#7c3aed" stroke-width="2" fill="none" d="M20 26 L32 40 L44 26"/>' +
      '<rect x="26" y="40" width="12" height="12" rx="2" fill="#a78bfa"/>' +
      '<path fill="#c4b5fd" d="M32 40 L38 46 L32 52 L26 46z"/>' +
      '</svg>'
    );

  function showToast() {
    if (!settings.showToast) return;

    let el = document.getElementById("tac-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "tac-toast";
      Object.assign(el.style, {
        position: "fixed", bottom: "80px", right: "20px",
        background: "#9146FF", color: "#fff", padding: "8px 14px",
        borderRadius: "8px", fontSize: "13px", fontWeight: "600",
        zIndex: "999999", pointerEvents: "none", opacity: "0",
        transition: "opacity .25s", boxShadow: "0 4px 12px rgba(0,0,0,.25)"
      });
      document.body.appendChild(el);
    }
    el.textContent = "✓ Channel Points claimed";
    el.style.opacity = "1";
    clearTimeout(el._h);
    el._h = setTimeout(() => { el.style.opacity = "0"; }, 2200);

    playClaimHype();
    playClaimSound();
  }

  function playClaimSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.02 + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + i * 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + 0.45 + i * 0.08);
      });
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.value = 180;
      g2.gain.setValueAtTime(0.08, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.25);
      setTimeout(() => ctx.close().catch(() => {}), 1000);
    } catch {}
  }

  function bindImg(img, url) {
    img.decoding = "async";
    img.loading = "eager";
    img.src = url || PARA_FALLBACK;
    img.onerror = () => {
      if (img.src !== PARA_FALLBACK) img.src = PARA_FALLBACK;
    };
  }

  function playClaimHype() {
    document.getElementById("tac-hype")?.remove();

    const iconURL = getParachuteURL();
    const root = document.createElement("div");
    root.id = "tac-hype";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);

    const banner = document.createElement("div");
    banner.className = "tac-hype-banner";

    const bannerIcon = document.createElement("img");
    bannerIcon.className = "tac-hype-banner-icon";
    bannerIcon.alt = "";
    bindImg(bannerIcon, iconURL);

    const textWrap = document.createElement("div");
    textWrap.className = "tac-hype-banner-text";
    textWrap.innerHTML =
      '<div class="tac-hype-title">BONUS CLAIMED</div>' +
      '<div class="tac-hype-sub">Channel Points +</div>';

    banner.appendChild(bannerIcon);
    banner.appendChild(textWrap);
    root.appendChild(banner);

    // 18 parachutes
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("img");
      p.className = "tac-hype-para";
      p.alt = "";
      bindImg(p, iconURL);
      const left = 2 + Math.random() * 96;
      const delay = Math.random() * 0.7;
      const duration = 1.5 + Math.random() * 1.4;
      const size = 26 + Math.floor(Math.random() * 42);
      const rot = -30 + Math.random() * 60;
      p.style.left = left + "%";
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.animationDelay = delay + "s";
      p.style.animationDuration = duration + "s";
      p.style.setProperty("--rot", rot + "deg");
      root.appendChild(p);
    }

    for (let i = 0; i < 20; i++) {
      const s = document.createElement("div");
      s.className = "tac-hype-spark";
      s.style.left = 5 + Math.random() * 90 + "%";
      s.style.top = 10 + Math.random() * 55 + "%";
      s.style.animationDelay = Math.random() * 0.9 + "s";
      s.style.setProperty("--dx", Math.random() * 100 - 50 + "px");
      s.style.setProperty("--dy", -50 - Math.random() * 100 + "px");
      root.appendChild(s);
    }

    setTimeout(() => root.remove(), 3400);
  }

  // ---------- Core claim ----------
  const claimBonus = debounce(() => {
    if (!settings.enabled || isExcluded()) return;

    const summary = findCommunityPointsSummary();
    const button = findClaimButton(summary || document);
    if (!button || !guard.canClaim(button)) return;

    const raw = getChannelNameFromUrl(location.href);
    const channel = (raw || location.pathname.split("/").filter(Boolean)[0] || "unknown").toLowerCase();

    guard.mark(button);
    log("Claim", channel);
    button.click();
    sendIncrement(channel);
    showToast();
    refreshPanelStats();
  }, 300);

  // ---------- Observers ----------
  let summaryObs = null, bodyObs = null, observedSummary = null;
  let sumDeb = null, bodyDeb = null;

  function disconnectSummary() {
    if (summaryObs) { summaryObs.disconnect(); summaryObs = null; }
    observedSummary = null;
  }

  function observeSummary(el) {
    if (!el || el === observedSummary) return;
    disconnectSummary();
    observedSummary = el;
    summaryObs = new MutationObserver(() => {
      if (sumDeb) clearTimeout(sumDeb);
      sumDeb = setTimeout(claimBonus, 100);
    });
    summaryObs.observe(el, { childList: true, subtree: true });
    claimBonus();
  }

  function rediscover() {
    const s = findCommunityPointsSummary();
    if (s && s !== observedSummary) observeSummary(s);
    else if (!s && observedSummary) disconnectSummary();
  }

  function setupBodyObs() {
    if (bodyObs) bodyObs.disconnect();
    bodyObs = new MutationObserver(() => {
      if (bodyDeb) clearTimeout(bodyDeb);
      bodyDeb = setTimeout(() => {
        rediscover();
        tryInjectButton();
      }, 500);
    });
    if (document.body) bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  // ============================================================
  // IN-CHAT SETTINGS BUTTON (7TV-style)
  // ============================================================

  // Gift / chest style icon (more visible than a checkmark)
  const BTN_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 9.58 2 8 2 6.34 2 5 3.34 5 5c0 .35.07.69.18 1H3c-1.11 0-2 .89-2 2v4c0 .55.45 1 1 1h18c.55 0 1-.45 1-1V8c0-1.11-.89-2-2-2zM8 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm8 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm3 12H5v-4H3v6c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2v-6h-2v4z"/></svg>`;

  function createSettingsButton() {
    if (document.getElementById("tac-settings-btn")) return null;

    const btn = document.createElement("button");
    btn.id = "tac-settings-btn";
    btn.type = "button";
    btn.title = "Twitch Auto Claim Points";
    btn.setAttribute("aria-label", "Twitch Auto Claim settings");
    btn.innerHTML = BTN_SVG;
    if (!settings.enabled) btn.classList.add("disabled-mode");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(btn);
    });

    return btn;
  }

  function createPanel() {
    let panel = document.getElementById("tac-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "tac-panel";
    panel.innerHTML = `
      <div class="tac-header">
        <div class="tac-header-title">
          <span>🎁</span> Auto Claim Points
        </div>
        <button class="tac-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="tac-body">
        <div class="tac-row">
          <div>
            <div class="tac-label">Auto-claim</div>
            <div class="tac-hint">Claim the green bonus chest</div>
          </div>
          <label class="tac-switch">
            <input type="checkbox" id="tac-opt-enabled" />
            <span class="tac-slider"></span>
          </label>
        </div>
        <div class="tac-row">
          <div>
            <div class="tac-label">Toast notification</div>
            <div class="tac-hint">Show when points are claimed</div>
          </div>
          <label class="tac-switch">
            <input type="checkbox" id="tac-opt-toast" />
            <span class="tac-slider"></span>
          </label>
        </div>
        <div class="tac-row">
          <div>
            <div class="tac-label">Show chat button</div>
            <div class="tac-hint">Button next to channel points</div>
          </div>
          <label class="tac-switch">
            <input type="checkbox" id="tac-opt-button" />
            <span class="tac-slider"></span>
          </label>
        </div>
        <div class="tac-stats" id="tac-panel-stats">
          Claims this session: <strong id="tac-stat-total">0</strong>
        </div>
      </div>
    `;

    panel.querySelector(".tac-close").addEventListener("click", () => {
      panel.remove();
      document.getElementById("tac-settings-btn")?.classList.remove("active");
    });

    // Bind toggles
    const en = panel.querySelector("#tac-opt-enabled");
    const toast = panel.querySelector("#tac-opt-toast");
    const showBtn = panel.querySelector("#tac-opt-button");

    en.checked = settings.enabled;
    toast.checked = settings.showToast;
    showBtn.checked = settings.showButton;

    en.addEventListener("change", () => {
      settings.enabled = en.checked;
      saveSettings();
      applySettingsUI();
    });
    toast.addEventListener("change", () => {
      settings.showToast = toast.checked;
      saveSettings();
    });
    showBtn.addEventListener("change", () => {
      settings.showButton = showBtn.checked;
      saveSettings();
      applySettingsUI();
    });

    // Close on outside click
    setTimeout(() => {
      const closer = (ev) => {
        if (!panel.contains(ev.target) && ev.target.id !== "tac-settings-btn") {
          panel.remove();
          document.getElementById("tac-settings-btn")?.classList.remove("active");
          document.removeEventListener("click", closer);
        }
      };
      document.addEventListener("click", closer);
    }, 10);

    return panel;
  }

  function togglePanel(btn) {
    let panel = document.getElementById("tac-panel");
    if (panel) {
      panel.remove();
      btn.classList.remove("active");
      return;
    }
    panel = createPanel();
    // Position relative to button's parent
    const wrap = btn.parentElement;
    if (wrap) {
      if (getComputedStyle(wrap).position === "static") {
        wrap.style.position = "relative";
      }
      wrap.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    btn.classList.add("active");
    refreshPanelStats();
  }

  function refreshPanelStats() {
    const el = document.getElementById("tac-stat-total");
    if (!el) return;
    safeStorageGet("tcpacObj", (r) => {
      const obj = r.tcpacObj || {};
      const total = Object.values(obj).reduce((s, v) => s + (v || 0), 0);
      el.textContent = total;
    });
  }

  function applySettingsUI() {
    const btn = document.getElementById("tac-settings-btn");
    if (btn) {
      btn.classList.toggle("disabled-mode", !settings.enabled);
      btn.style.display = settings.showButton ? "" : "none";
    }
    // Update panel toggles if open
    const en = document.getElementById("tac-opt-enabled");
    if (en) en.checked = settings.enabled;
    const toast = document.getElementById("tac-opt-toast");
    if (toast) toast.checked = settings.showToast;
    const showBtn = document.getElementById("tac-opt-button");
    if (showBtn) showBtn.checked = settings.showButton;
  }

  // Try to inject button next to community points / chat buttons
  // Targets the bottom bar: [points] [gear] [Chat]  — same row as in the screenshot
  function tryInjectButton() {
    if (!settings.showButton) return;
    if (document.getElementById("tac-settings-btn")) return;

    const btn = createSettingsButton();
    if (!btn) return;

    // 1) Best: inside / next to community-points-summary (the 0 · 4,9 mil row)
    const summary = findCommunityPointsSummary();
    if (summary) {
      const parent = summary.parentElement;
      if (parent) {
        parent.style.display = "flex";
        parent.style.alignItems = "center";
        parent.style.gap = parent.style.gap || "4px";
        // insert after summary so it sits to the right of the points
        if (summary.nextSibling) {
          parent.insertBefore(btn, summary.nextSibling);
        } else {
          parent.appendChild(btn);
        }
        log("Button injected near points summary");
        return;
      }
      // last resort inside summary itself
      summary.style.display = "flex";
      summary.style.alignItems = "center";
      summary.appendChild(btn);
      log("Button injected inside summary");
      return;
    }

    // 2) Near the gear / chat settings button (bottom right of input area)
    const gear =
      document.querySelector('button[aria-label*="Chat Settings" i]') ||
      document.querySelector('button[aria-label*="Definições" i]') ||
      document.querySelector('button[aria-label*="Settings" i]') ||
      document.querySelector('[data-a-target="chat-settings"]') ||
      document.querySelector(".chat-input button[aria-label]");

    if (gear && gear.parentElement) {
      gear.parentElement.insertBefore(btn, gear);
      log("Button injected near gear");
      return;
    }

    // 3) Chat input buttons container
    const chatBtns =
      document.querySelector(".chat-input__buttons-container") ||
      document.querySelector('[data-test-selector="chat-input-buttons-container"]') ||
      document.querySelector('[class*="chat-input"] [class*="buttons"]');

    if (chatBtns) {
      chatBtns.appendChild(btn);
      log("Button injected in chat buttons");
      return;
    }

    // 4) Absolute fallback: float next to the points balance text if we find it
    const balance =
      document.querySelector('[data-test-selector="community-points-summary"]') ||
      document.querySelector(".community-points-summary") ||
      document.querySelector('[class*="channel-points"]');

    if (balance) {
      const box = document.createElement("div");
      box.id = "tac-btn-wrap";
      box.style.cssText = "display:inline-flex;align-items:center;margin-left:4px;";
      box.appendChild(btn);
      balance.appendChild(box);
      log("Button injected via balance fallback");
    }
  }

  // ---------- Init ----------
  function init() {
    const s = findCommunityPointsSummary();
    if (s) observeSummary(s);
    setupBodyObs();
    tryInjectButton();

    // Retry injection a few times while chat loads
    let tries = 0;
    const injectTimer = setInterval(() => {
      tryInjectButton();
      tries++;
      if (document.getElementById("tac-settings-btn") || tries > 20) {
        clearInterval(injectTimer);
      }
    }, 1000);

    setInterval(() => {
      if (isExcluded()) return;
      const sum = findCommunityPointsSummary();
      if (sum && sum !== observedSummary) observeSummary(sum);
      claimBonus();
      tryInjectButton();
    }, 5000);

    claimBonus();
    console.log("%c[Twitch Auto Claim] Ready — looking for chat button slot", "color:#9146FF;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
// Made by Red0X
