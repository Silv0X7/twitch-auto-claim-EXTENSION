// Twitch Auto Claim Points — Background service worker 
// Single writer for claim counts (avoids multi-tab races)

function normalize(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const ch = String(k).toLowerCase();
    out[ch] = (out[ch] ?? 0) + (typeof v === "number" ? v : 0);
  }
  return out;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["tcpacObj", "tacSettings"], (r) => {
    if (r.tcpacObj) {
      chrome.storage.local.set({ tcpacObj: normalize(r.tcpacObj) });
    }
    if (!r.tacSettings) {
      chrome.storage.local.set({
        tacSettings: { enabled: true, showToast: true, showButton: true }
      });
    }
  });
});

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type !== "INCREMENT_CLAIM") return false;

  const channel =
    typeof req.channel === "string" ? req.channel.toLowerCase().trim() : "";
  if (!channel) {
    sendResponse({ ok: false, error: "missing_channel" });
    return false;
  }

  chrome.storage.local.get("tcpacObj", (r) => {
    const obj = normalize(r.tcpacObj ?? {});
    obj[channel] = (obj[channel] ?? 0) + 1;
    chrome.storage.local.set({ tcpacObj: obj }, () => {
      sendResponse({ ok: true, count: obj[channel] });
    });
  });
  return true;
});
// Made by Red0X
