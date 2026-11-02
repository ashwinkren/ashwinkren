import assert from "node:assert/strict";
import test from "node:test";
import {
  TOP40,
  TOP40_HANDS,
  comboCount,
  handClass,
  isTop40,
  parseCardSpec,
  totalCombos,
} from "../hands.js";

const DECK = 1326;

test("the range is the largest GTO-ordered prefix that stays within 40% of combos", () => {
  assert.equal(new Set(TOP40_HANDS).size, TOP40_HANDS.length);
  const combos = totalCombos();
  assert.equal(combos, 530);
  assert.ok(combos / DECK <= 0.4);
  assert.ok(combos / DECK > 0.39);
  for (const hand of TOP40_HANDS) {
    assert.ok(comboCount(hand) > 0, hand);
    assert.equal(isTop40(hand), true);
  }
});

test("screenshot hand 7h4s is not a top 40% hand, and clear opens are", () => {
  const card = (rank, suit) => ({ rank, suit });
  assert.equal(handClass(card("7", "h"), card("4", "s")), "74o");
  assert.equal(isTop40("74o"), false);
  assert.equal(isTop40("72o"), false);
  assert.equal(isTop40("K8o"), false);
  assert.equal(isTop40("A7o"), false);
  assert.equal(isTop40("A2o"), false);
  assert.equal(isTop40("32o"), false);
  assert.equal(handClass(card("6", "h"), card("9", "s")), "96o");
  assert.equal(isTop40("96o"), false);
  assert.equal(handClass(card("K", "s"), card("2", "d")), "K2o");
  assert.equal(isTop40("K2o"), false);

  assert.equal(handClass(card("A", "s"), card("K", "s")), "AKs");
  assert.equal(handClass(card("K", "h"), card("A", "h")), "AKs");
  assert.equal(handClass(card("A", "h"), card("K", "d")), "AKo");
  assert.equal(handClass(card("T", "c"), card("T", "d")), "TT");
  assert.equal(handClass(card("7", "h"), card("6", "h")), "76s");
  assert.equal(handClass(card("2", "c"), card("2", "d")), "22");

  for (const hand of ["AA", "AKs", "AKo", "22", "76s", "65s", "54s", "JTs", "A5s", "K2s", "74s", "T9o"]) {
    assert.equal(isTop40(hand), true, hand);
  }
});

test("card markup from Poker Now parses rank and suit", () => {
  assert.deepEqual(parseCardSpec("card-container card-s-A card card-h", "A♥"), {
    rank: "A",
    suit: "h",
  });
  assert.deepEqual(parseCardSpec("card-container card-s-K card card-s", "K"), {
    rank: "K",
    suit: "s",
  });
  assert.deepEqual(parseCardSpec("card card-c card-s-T", "10♣"), {
    rank: "T",
    suit: "c",
  });
  assert.deepEqual(parseCardSpec("card card-d", "Q♦"), { rank: "Q", suit: "d" });
  assert.deepEqual(parseCardSpec("", "As"), { rank: "A", suit: "s" });
  assert.deepEqual(parseCardSpec("", "10d"), { rank: "T", suit: "d" });
  assert.deepEqual(parseCardSpec("card-container card-s-A card card-h card back", "A♥"), {
    rank: "A",
    suit: "h",
  });
  assert.equal(parseCardSpec("card back", "POKER NOW"), null);
  assert.equal(parseCardSpec("card card-back", ""), null);
  assert.equal(parseCardSpec("card", ""), null);
});
