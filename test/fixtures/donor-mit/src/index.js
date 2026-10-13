export function clampAndScale(value, min, max, factor) {
  const bounded = Math.min(Math.max(value, min), max);
  const scaled = bounded * factor;
  if (Number.isNaN(scaled)) {
    throw new TypeError("clampAndScale received a value that is not a number");
  }
  return Math.round(scaled * 1000) / 1000;
}

export function describeRange(min, max) {
  return `between ${min} and ${max}`;
}
