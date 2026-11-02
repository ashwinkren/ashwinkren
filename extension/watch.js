import { handClass, isTop40, readHeroCards } from "./hands.js";

const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_NAME = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
const RANK_NAME = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  T: "ten",
  9: "nine",
  8: "eight",
  7: "seven",
  6: "six",
  5: "five",
  4: "four",
  3: "three",
  2: "two",
};

const VISIBLE_MS = 3000;
const FADE_MS = 200;
const ABSENT_MS = 700;

const TOAST_CSS = `
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 8px 8px;
    border-radius: 12px;
    background: rgba(12, 22, 18, 0.94);
    border: 1px solid rgba(214, 178, 90, 0.5);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
    color: #f6f3ea;
    font-family: "Segoe UI", system-ui, sans-serif;
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
  }
  .toast.on {
    opacity: 1;
    transform: translateY(0);
  }
  .cards { display: flex; gap: 4px; }
  .card {
    width: 28px;
    height: 38px;
    border-radius: 4px;
    background: #fbfbf8;
    color: #1c1c1c;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  }
  .card .r { font-size: 14px; }
  .card .s { font-size: 12px; margin-top: 1px; }
  .card.red { color: #c0392b; }
  .label {
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.03em;
    color: #e7d7a8;
    padding-right: 2px;
  }
`;

function rankLabel(rank) {
  return rank === "T" ? "10" : rank;
}

function spokenCard(card) {
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;
}

export function startWatcher(doc, options = {}) {
  const view = doc.defaultView || globalThis;
  const setTimer = options.setTimeout || view.setTimeout.bind(view);
  const clearTimer = options.clearTimeout || view.clearTimeout.bind(view);
  const freeze = options.freeze === true;

  let lastKey = "";
  let absentTimer = null;
  let fadeTimer = null;
  let removeTimer = null;
  let host = null;

  function clearToastTimers() {
    if (fadeTimer) clearTimer(fadeTimer);
    if (removeTimer) clearTimer(removeTimer);
    fadeTimer = null;
    removeTimer = null;
  }

  function removeToast() {
    clearToastTimers();
    if (host) {
      host.remove();
      host = null;
    }
  }

  function showToast(cards) {
    removeToast();
    host = doc.createElement("div");
    host.id = "top40-hand-toast";
    host.setAttribute("aria-live", "polite");
    host.style.cssText = [
      "position:fixed",
      "top:14px",
      "right:14px",
      "z-index:2147483647",
      "pointer-events:none",
    ].join(";");

    const sr = doc.createElement("span");
    sr.textContent = `${spokenCard(cards[0])}, ${spokenCard(cards[1])}, top 40%`;
    sr.style.cssText = [
      "position:absolute",
      "width:1px",
      "height:1px",
      "padding:0",
      "margin:-1px",
      "overflow:hidden",
      "clip:rect(0,0,0,0)",
      "border:0",
    ].join(";");
    host.appendChild(sr);

    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = TOAST_CSS;
    const toast = doc.createElement("div");
    toast.className = "toast";
    const cardsEl = doc.createElement("div");
    cardsEl.className = "cards";
    for (const card of cards) {
      const el = doc.createElement("div");
      el.className = `card${card.suit === "h" || card.suit === "d" ? " red" : ""}`;
      const rank = doc.createElement("div");
      rank.className = "r";
      rank.textContent = rankLabel(card.rank);
      const suit = doc.createElement("div");
      suit.className = "s";
      suit.textContent = SUIT_SYMBOL[card.suit];
      el.append(rank, suit);
      cardsEl.appendChild(el);
    }
    const label = doc.createElement("div");
    label.className = "label";
    label.textContent = "top 40%";
    toast.append(cardsEl, label);
    shadow.append(style, toast);
    doc.documentElement.appendChild(host);
    // Let the fade transition run from the hidden state.
    view.requestAnimationFrame(() => toast.classList.add("on"));

    if (freeze) return;
    fadeTimer = setTimer(() => toast.classList.remove("on"), VISIBLE_MS - FADE_MS);
    removeTimer = setTimer(removeToast, VISIBLE_MS);
  }

  function evaluate() {
    const cards = readHeroCards(doc);
    if (!cards) {
      if (lastKey && !absentTimer) {
        absentTimer = setTimer(() => {
          lastKey = "";
          absentTimer = null;
        }, ABSENT_MS);
      }
      return;
    }
    if (absentTimer) {
      clearTimer(absentTimer);
      absentTimer = null;
    }
    const key = cards.map((card) => card.rank + card.suit).join("");
    if (key === lastKey) return;
    lastKey = key;
    if (!isTop40(handClass(cards[0], cards[1]))) return;
    showToast(cards);
  }

  function safeEvaluate() {
    try {
      evaluate();
    } catch {
      // A miss is quiet. Never throw into the poker page.
    }
  }

  const observer = new view.MutationObserver(safeEvaluate);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
  safeEvaluate();

  return {
    stop() {
      observer.disconnect();
      if (absentTimer) clearTimer(absentTimer);
      removeToast();
    },
  };
}
