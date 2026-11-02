const VISIBLE_MS = 3000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "top40" || typeof message.text !== "string") return;

  const id = `top40-${message.handKey || Date.now()}`;
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/128.png",
    title: "Top 40%",
    message: message.text,
    priority: 2,
    silent: false,
    requireInteraction: false,
  }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false });
      return;
    }
    setTimeout(() => chrome.notifications.clear(id), VISIBLE_MS);
    sendResponse({ ok: true });
  });
  return true;
});
