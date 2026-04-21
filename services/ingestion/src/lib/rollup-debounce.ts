import type { RollupGranularity } from "@lwa/db";

export function toBucketStart(start: Date, granularity: RollupGranularity): Date {
  const d = new Date(start);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  d.setUTCHours(0);

  switch (granularity) {
    case "day":
      return d;
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dow);
      return d;
    }
    case "month":
      d.setUTCDate(1);
      return d;
    case "quarter": {
      d.setUTCDate(1);
      const m = d.getUTCMonth();
      d.setUTCMonth(m - (m % 3));
      return d;
    }
  }
}

export function addBucketEnd(start: Date, granularity: RollupGranularity): Date {
  const e = new Date(start);
  switch (granularity) {
    case "day":
      e.setUTCDate(e.getUTCDate() + 1);
      break;
    case "week":
      e.setUTCDate(e.getUTCDate() + 7);
      break;
    case "month":
      e.setUTCMonth(e.getUTCMonth() + 1);
      break;
    case "quarter":
      e.setUTCMonth(e.getUTCMonth() + 3);
      break;
  }
  return e;
}
