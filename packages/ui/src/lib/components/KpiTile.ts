const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en", {
  signDisplay: "always",
  maximumFractionDigits: 1,
});

export function formatCompactValue(value: number, unit = "") {
  return `${compactFormatter.format(value)}${unit}`;
}

export function formatDeltaPct(deltaPct: number | null) {
  if (deltaPct === null) return "No comparison";

  return `${percentFormatter.format(deltaPct)}%`;
}

export function deltaTone(deltaPct: number | null) {
  if (deltaPct === null) return "text-slate-500";
  return deltaPct >= 0 ? "text-emerald-600" : "text-red-600";
}
