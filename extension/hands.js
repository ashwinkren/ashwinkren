// Top 40% of Texas Hold'em starting hands, combo-weighted.
//
// There are 1,326 two-card combinations. A hand is in the top 40% when it
// falls inside the first 530 of those combinations (39.97%) walked in the
// order a 100bb 6-max solver opens them: early-position hands first, then
// cutoff, then the button fringe. The walk stops before A7o, which would
// cross 40%.
//
// Suited connectors and suited aces are included ahead of dominated offsuit
// hands (K8o, A7o, 74o). Raw all-in equity ranks some of those offsuit hands
// higher, but solvers fold them and open the suited hands instead.
// Equity tie context: exhaustive heads-up equity vs a random hand,
// https://pailiku.com/stats/starting-hands (2026-07-04).

const RANKS = "23456789TJQKA";

export const TOP40_HANDS = [
  "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
  "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
  "AKo", "AQo", "AJo", "ATo",
  "KQs", "KJs", "KTs", "KQo", "KJo",
  "44", "33", "22",
  "K9s", "K8s", "K7s", "K6s", "K5s",
  "QJs", "QTs", "Q9s", "Q8s",
  "JTs", "J9s", "J8s",
  "T9s", "T8s", "T7s",
  "98s", "97s", "87s", "86s", "76s", "65s", "54s",
  "A9o", "KTo", "QJo", "QTo", "JTo",
  "K4s", "K3s", "K2s",
  "Q7s", "Q6s", "Q5s", "Q4s",
  "J7s", "J6s", "J5s", "J4s",
  "T6s", "T5s",
  "96s", "95s",
  "85s", "84s",
  "75s", "74s",
  "64s", "53s", "43s",
  "A8o", "A5o", "A4o",
  "K9o", "Q9o", "J9o", "T9o",
];

export const TOP40 = new Set(TOP40_HANDS);

const SUIT_FROM_CHAR = {
  s: "s",
  h: "h",
  d: "d",
  c: "c",
  "♠": "s",
  "♥": "h",
  "♦": "d",
  "♣": "c",
  "♤": "s",
  "♡": "h",
  "♢": "d",
  "♧": "c",
};

export function comboCount(hand) {
  if (hand.length === 2 && hand[0] === hand[1]) return 6;
  if (hand.endsWith("s")) return 4;
  if (hand.endsWith("o")) return 12;
  return 0;
}

export function totalCombos(hands = TOP40_HANDS) {
  return hands.reduce((sum, hand) => sum + comboCount(hand), 0);
}

export function handClass(a, b) {
  const [hi, lo] = [a, b].sort(
    (x, y) => RANKS.indexOf(y.rank) - RANKS.indexOf(x.rank),
  );
  if (hi.rank === lo.rank) return hi.rank + lo.rank;
  return hi.rank + lo.rank + (hi.suit === lo.suit ? "s" : "o");
}

export function isTop40(hand) {
  return TOP40.has(hand);
}

function normalizeRank(raw) {
  const rank = String(raw).toUpperCase();
  if (rank === "10") return "T";
  return RANKS.includes(rank) ? rank : null;
}

// Read a rank and suit from the class list and text Poker Now puts on a card.
// `card-s-A` is a rank token (the "s" is not the suit). Suit is `card-h` /
// `card-d` / `card-c` / `card-s`, or a suit character in the text.
export function parseCardSpec(className, text) {
  const classes = String(className || "")
    .split(/\s+/)
    .filter(Boolean);
  const faceDown = classes.some((cls) => /^(back|card-back|facedown|face-down)$/i.test(cls));

  let rank = null;
  let suit = null;
  for (const cls of classes) {
    const rankMatch = cls.match(/^card-[cdhs]-([2-9tjqka]|10)$/i);
    if (rankMatch) {
      rank = normalizeRank(rankMatch[1]);
      continue;
    }
    const suitMatch = cls.match(/^card-([cdhs])$/i);
    if (suitMatch) suit = suitMatch[1].toLowerCase();
  }

  const compact = String(text || "").replace(/\s+/g, "");
  const textMatch = compact.match(/^(10|[2-9tjqka])([shdc♠♥♦♣♤♡♢♧])$/i);
  if (textMatch) {
    rank = rank || normalizeRank(textMatch[1]);
    suit = suit || SUIT_FROM_CHAR[textMatch[2].toLowerCase()] || SUIT_FROM_CHAR[textMatch[2]];
  } else {
    if (!rank) {
      const rankMatch = compact.match(/^(10|[2-9tjqka])$/i);
      if (rankMatch) rank = normalizeRank(rankMatch[1]);
    }
    if (!suit && compact.length === 1) {
      suit = SUIT_FROM_CHAR[compact.toLowerCase()] || SUIT_FROM_CHAR[compact] || null;
    }
  }

  // A flipper has a face-down back in the same container as the face-up card.
  // That back must not hide a card that already has a rank.
  if (faceDown && !rank) return null;
  if (!rank || !suit) return null;
  return { rank, suit };
}

function classString(node) {
  if (!node) return "";
  if (typeof node.getAttribute === "function") {
    return node.getAttribute("class") || "";
  }
  return typeof node.className === "string" ? node.className : "";
}

export function readCardNode(node) {
  const front = node.querySelector?.(".card:not(.back)") || node;
  const classes = [classString(node), classString(front)].join(" ");
  const valueNode = front.querySelector?.(".value, .rank, .card-value")
    || node.querySelector?.(".value, .rank, .card-value");
  const suitNodes = front.querySelectorAll
    ? [...front.querySelectorAll(".suit, .card-suit")]
    : [];
  const suitNode = [...suitNodes].reverse().find((el) => (el.textContent || "").trim()) || null;
  const text = valueNode || suitNode
    ? `${valueNode ? valueNode.textContent : ""}${suitNode ? suitNode.textContent : ""}`
    : (front.textContent || "");
  return parseCardSpec(classes, text);
}

// Only the seated player's own hole cards. Other seats are ignored even if
// their cards are present in the page.
export function readHeroCards(root) {
  const hero = root.querySelector(".table-player.you-player") || root.querySelector(".you-player");
  if (!hero) return null;
  const zone = hero.querySelector(".table-player-cards") || hero;
  if (zone !== hero && (zone.classList.contains("hide") || zone.hasAttribute("hidden"))) {
    return null;
  }

  const containers = [...zone.querySelectorAll(".card-container")];
  const nodes = containers.length ? containers : [...zone.querySelectorAll(".card")];
  const cards = [];
  const seen = new Set();
  for (const node of nodes) {
    const card = readCardNode(node);
    if (!card) continue;
    const key = card.rank + card.suit;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
    if (cards.length > 2) return null;
  }
  return cards.length === 2 ? cards : null;
}
