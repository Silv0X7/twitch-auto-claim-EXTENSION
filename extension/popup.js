document.addEventListener("DOMContentLoaded", () => {
  const totalEl = document.getElementById("totalClaims");
  const listEl = document.getElementById("list");
  const badge = document.getElementById("statusBadge");
  const clearBtn = document.getElementById("clearBtn");

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderClaims(obj) {
    const data = obj || {};
    const entries = Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    totalEl.textContent = total;

    if (!entries.length) {
      listEl.innerHTML = '<div class="empty">No claims yet</div>';
      return;
    }
    listEl.innerHTML = entries
      .map(
        ([ch, n]) =>
          `<div class="list-row"><span class="ch">${esc(ch)}</span><span class="ct">${n}</span></div>`
      )
      .join("");
  }

  function renderSettings(s) {
    const on = s?.enabled !== false;
    badge.textContent = on ? "ON" : "OFF";
    badge.classList.toggle("off", !on);
  }

  chrome.storage.local.get(["tcpacObj", "tacSettings"], (r) => {
    renderClaims(r.tcpacObj);
    renderSettings(r.tacSettings);
  });

  chrome.storage.onChanged.addListener((ch) => {
    if (ch.tcpacObj) renderClaims(ch.tcpacObj.newValue);
    if (ch.tacSettings) renderSettings(ch.tacSettings.newValue);
  });

  clearBtn.addEventListener("click", () => {
    if (confirm("Clear all claim counters?")) {
      chrome.storage.local.set({ tcpacObj: {} }, () => renderClaims({}));
    }
  });
});
// Made by Red0X
