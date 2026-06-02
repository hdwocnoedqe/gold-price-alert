import assert from "node:assert/strict";
import {
  evaluateRule,
  findPriceAtOrBefore,
  hasEnoughWindowHistory,
  percentChange,
} from "../public/alert-engine.js";

const history = [
  { price: 100, updatedAt: "2026-05-31T10:00:00.000Z" },
  { price: 102, updatedAt: "2026-05-31T10:03:00.000Z" },
  { price: 105, updatedAt: "2026-05-31T10:10:00.000Z" },
];

assert.equal(percentChange(105, 100), 5);
assert.equal(percentChange(95, 100), -5);
assert.equal(percentChange(100, 0), null);

assert.deepEqual(findPriceAtOrBefore(history, "2026-05-31T10:05:00.000Z"), history[1]);
assert.equal(hasEnoughWindowHistory(history, "2026-05-31T10:10:00.000Z", 10), true);
assert.equal(hasEnoughWindowHistory(history.slice(1), "2026-05-31T10:10:00.000Z", 10), false);

const referenceResult = evaluateRule(
  {
    type: "reference",
    referencePrice: 100,
    referenceUnit: "usd_per_ounce",
    thresholdPercent: 4,
    armed: false,
  },
  { price: 105, updatedAt: "2026-05-31T10:10:00.000Z" },
  history,
);

assert.equal(referenceResult.status, "triggered");
assert.equal(referenceResult.shouldAlert, true);

const alreadyArmedResult = evaluateRule(
  {
    type: "reference",
    referencePrice: 100,
    referenceUnit: "usd_per_ounce",
    thresholdPercent: 4,
    armed: true,
  },
  { price: 105, updatedAt: "2026-05-31T10:10:00.000Z" },
  history,
);

assert.equal(alreadyArmedResult.status, "triggered");
assert.equal(alreadyArmedResult.shouldAlert, false);

const windowResult = evaluateRule(
  {
    type: "window",
    windowMinutes: 10,
    thresholdPercent: 4,
    armed: false,
  },
  { price: 105, updatedAt: "2026-05-31T10:10:00.000Z" },
  history,
);

assert.equal(windowResult.status, "triggered");
assert.equal(windowResult.shouldAlert, true);

const waitingResult = evaluateRule(
  {
    type: "window",
    windowMinutes: 20,
    thresholdPercent: 4,
    armed: false,
  },
  { price: 105, updatedAt: "2026-05-31T10:10:00.000Z" },
  history,
);

assert.equal(waitingResult.status, "waiting");
assert.equal(waitingResult.shouldAlert, false);

console.log("Alert calculation tests passed.");
