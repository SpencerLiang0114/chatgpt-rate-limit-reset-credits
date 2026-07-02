# ChatGPT Rate Limit Reset Credits

Tampermonkey userscript for showing ChatGPT rate-limit reset credits in a compact floating panel.

Maintained by SpencerLiang0114. This repository is a maintained adaptation with a redesigned dashboard and install/update metadata.

## Install

1. Install Tampermonkey or Violentmonkey in your browser.
2. Open this raw userscript URL:

   `https://raw.githubusercontent.com/SpencerLiang0114/chatgpt-rate-limit-reset-credits/main/chatgpt-rate-limit-reset-credits.user.js`

3. The userscript manager should open an install screen.
4. Install the script, then reload `https://chatgpt.com`.
5. Click the floating blue button near the top-right of ChatGPT to view reset-credit details.

## Notes

- This script runs only on `https://chatgpt.com/*`.
- It reads the browser session from `/api/auth/session` and calls ChatGPT's internal rate-limit reset-credit endpoint.
- Internal ChatGPT endpoints can change without notice, so the script may need updates later.
- Do not modify the script to send your `accessToken` anywhere outside the ChatGPT page.
