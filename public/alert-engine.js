const troyOunceGrams = 31.1034768;

export function percentChange(currentPrice, basePrice) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(basePrice) || basePrice <= 0) {
    return null;
  }

  return ((currentPrice - basePrice) / basePrice) * 100;
}

export function usdPerOunceToCnyPerGram(usdPerOunce, usdCnyRate) {
  if (!Number.isFinite(usdPerOunce) || !Number.isFinite(usdCnyRate) || usdPerOunce <= 0 || usdCnyRate <= 0) {
    return null;
  }

  return (usdPerOunce * usdCnyRate) / troyOunceGrams;
}

export function cnyPerGramToUsdPerOunce(cnyPerGram, usdCnyRate) {
  if (!Number.isFinite(cnyPerGram) || !Number.isFinite(usdCnyRate) || cnyPerGram <= 0 || usdCnyRate <= 0) {
    return null;
  }

  return (cnyPerGram * troyOunceGrams) / usdCnyRate;
}

export function normalizeReferencePrice(rule, usdCnyRate) {
  const referencePrice = Number(rule.referencePrice);

  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return null;
  }

  if (rule.referenceUnit === "cny_per_gram") {
    return cnyPerGramToUsdPerOunce(referencePrice, usdCnyRate);
  }

  return referencePrice;
}

export function findPriceAtOrBefore(history, targetTime) {
  const target = new Date(targetTime).getTime();

  if (!Number.isFinite(target)) {
    return null;
  }

  let candidate = null;

  for (const item of history) {
    const itemTime = new Date(item.updatedAt).getTime();
    if (Number.isFinite(itemTime) && itemTime <= target) {
      candidate = item;
    }
  }

  return candidate;
}

export function hasEnoughWindowHistory(history, currentTime, windowMinutes) {
  const current = new Date(currentTime).getTime();
  const minutes = Number(windowMinutes);

  if (!Number.isFinite(current) || !Number.isFinite(minutes) || minutes <= 0) {
    return false;
  }

  const earliest = history[0];
  const earliestTime = new Date(earliest?.updatedAt).getTime();

  return Number.isFinite(earliestTime) && current - earliestTime >= minutes * 60 * 1000;
}

export function evaluateRule(rule, currentQuote, history) {
  if (!currentQuote || !Number.isFinite(currentQuote.price)) {
    return {
      status: "waiting",
      changePercent: null,
      basePrice: null,
      shouldAlert: false,
    };
  }

  let basePrice = null;

  if (rule.type === "reference") {
    basePrice = normalizeReferencePrice(rule, currentQuote.usdCny);
  }

  if (rule.type === "window") {
    if (!hasEnoughWindowHistory(history, currentQuote.updatedAt, rule.windowMinutes)) {
      return {
        status: "waiting",
        changePercent: null,
        basePrice: null,
        shouldAlert: false,
      };
    }

    const targetTime = new Date(currentQuote.updatedAt).getTime() - Number(rule.windowMinutes) * 60 * 1000;
    const baseQuote = findPriceAtOrBefore(history, targetTime);
    basePrice = baseQuote?.price ?? null;
  }

  const changePercent = percentChange(currentQuote.price, basePrice);
  const threshold = Number(rule.thresholdPercent);

  if (changePercent === null || !Number.isFinite(threshold) || threshold <= 0) {
    return {
      status: "waiting",
      changePercent: null,
      basePrice,
      shouldAlert: false,
    };
  }

  const crossed = Math.abs(changePercent) >= threshold;

  return {
    status: crossed ? "triggered" : "normal",
    changePercent,
    basePrice,
    shouldAlert: crossed && !rule.armed,
  };
}
