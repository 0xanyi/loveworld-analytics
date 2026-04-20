import type { Granularity } from "@lwa/contracts";

export function chunkPeriod(
  start: Date,
  end: Date,
  granularity: Granularity,
): Array<{ start: Date; end: Date }> {
  const result: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = advance(cursor, granularity);
    const chunkEnd = next > end ? end : next;
    result.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = next;
  }
  return result;
}

function advance(d: Date, g: Granularity): Date {
  const r = new Date(d);
  switch (g) {
    case "hour":
      r.setUTCHours(r.getUTCHours() + 1);
      return r;
    case "day":
      r.setUTCDate(r.getUTCDate() + 1);
      return r;
    case "week":
      r.setUTCDate(r.getUTCDate() + 7);
      return r;
    case "month":
      r.setUTCMonth(r.getUTCMonth() + 1);
      return r;
    case "quarter":
      r.setUTCMonth(r.getUTCMonth() + 3);
      return r;
  }
}

export function weekBucketStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
