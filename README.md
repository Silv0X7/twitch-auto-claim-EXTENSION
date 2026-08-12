# Twitch Auto Claim Points

Browser extension that **automatically claims the Channel Points bonus chest** (green box) on Twitch.

Optional in-chat settings (similar to 7TV), claim counter per channel, sound + mini parachute animation when a bonus is claimed.

**Version:** 2.3.0  
**Manifest:** V3  
**Works on:** Chrome, Edge, Brave, Opera, and other Chromium browsers

---

## Features

- Auto-clicks only the real **Claim Bonus** button (not the normal points menu)
- Multi-language support (`Claim Bonus`, `Receber bónus`, `Resgatar Bônus`, etc.)
- Settings panel injectable near chat / channel points
- Claim counter per channel
- Optional toast + parachute “hype” animation + short sound
- Lightweight (MutationObserver + fallback interval)

---

## Install (from this repo)

### Chrome / Edge / Brave / Opera

1. Download this repository (Code → **Download ZIP**) or clone it
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the **`extension`** folder (the one that contains `manifest.json`)
6. Open Twitch and refresh the page (**F5**)

### Updates

After pulling new changes, go to `chrome://extensions` and click **Reload** on the extension, then **F5** on Twitch.

---

## Usage

1. Watch any stream with Channel Points enabled  
2. When the green bonus chest appears, it is claimed automatically  
3. Open the extension popup to see claim counts per channel  
4. In chat, use the settings button (if visible) to toggle auto-claim / toast / button  

---

## Project structure

```
extension/
├── manifest.json
├── content.js          # Claim logic + chat UI + animation
├── background.js       # Claim counter (storage)
├── popup.html/css/js   # Extension popup
├── images/             # Icons (16, 48, 128)
└── styles/inject.css   # Injected chat UI + animation styles
```

---

## Privacy

- Runs only on `https://*.twitch.tv/*`
- Stores **locally** in the browser: settings + claim counts
- **No** analytics, **no** external servers, **no** account access

---

## Disclaimer

This is an unofficial client-side helper. Automating UI actions may conflict with Twitch Terms of Service. Use at your own risk. Not affiliated with Twitch.

---

## License

MIT — see [LICENSE](LICENSE)
