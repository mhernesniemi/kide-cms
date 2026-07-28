import { describe, it, expect } from "vitest";
import { getFieldGroups, initDateFormat, formatDate } from "../admin";
import type { CMSConfig } from "../define";
import { fields } from "../define";

const base: CMSConfig = { collections: [] };
// 14:30 UTC on 1 Jul 2026.
const D = "2026-07-01T14:30:00Z";

describe("formatDate", () => {
  it("defaults to en-US 12-hour time", () => {
    initDateFormat({ ...base, admin: { timeZone: "UTC" } });
    const out = formatDate(D);
    expect(out).toContain("02:30");
    expect(out).toMatch(/PM/i);
  });

  it("honours a 24-hour override via dateTimeFormat", () => {
    initDateFormat({ ...base, admin: { timeZone: "UTC", dateTimeFormat: { hour12: false } } });
    expect(formatDate(D)).toContain("14:30");
  });

  it("uses the configured locale's date ordering", () => {
    initDateFormat({ ...base, admin: { dateFormat: "en-GB", timeZone: "UTC" } });
    expect(formatDate(D)).toMatch(/01\/07\/2026/);
  });

  it("lets a configured timeZone override the per-request browser zone", () => {
    // Helsinki is UTC+3 in July → 17:30, even though the request passed "UTC".
    initDateFormat({ ...base, admin: { timeZone: "Europe/Helsinki", dateTimeFormat: { hour12: false } } }, "UTC");
    expect(formatDate(D)).toContain("17:30");
  });

  it("falls back to the per-request zone when none is configured", () => {
    initDateFormat({ ...base, admin: { dateTimeFormat: { hour12: false } } }, "Europe/Helsinki");
    expect(formatDate(D)).toContain("17:30");
  });

  it("returns an em dash for empty values", () => {
    initDateFormat(base);
    expect(formatDate("")).toBe("—");
  });

  describe("dateTimePattern", () => {
    it("renders a Finnish date + colon HH:mm pattern", () => {
      initDateFormat({ ...base, admin: { timeZone: "UTC", dateTimePattern: "d.M.yyyy HH:mm" } });
      expect(formatDate(D)).toBe("1.7.2026 14:30");
    });

    it("applies the time zone to pattern output", () => {
      initDateFormat({ ...base, admin: { timeZone: "Europe/Helsinki", dateTimePattern: "d.M.yyyy HH:mm" } });
      expect(formatDate(D)).toBe("1.7.2026 17:30");
    });

    it("keeps single-quoted text literal and pads 2-digit tokens", () => {
      initDateFormat({ ...base, admin: { timeZone: "UTC", dateTimePattern: "dd.MM.yyyy 'klo' HH:mm" } });
      expect(formatDate(D)).toBe("01.07.2026 klo 14:30");
    });

    it("supports 12-hour tokens", () => {
      initDateFormat({ ...base, admin: { timeZone: "UTC", dateTimePattern: "h:mm a" } });
      expect(formatDate(D)).toBe("2:30 PM");
    });

    it("wins over dateFormat/dateTimeFormat when both are set", () => {
      initDateFormat({
        ...base,
        admin: {
          dateFormat: "en-US",
          dateTimeFormat: { hour12: true },
          timeZone: "UTC",
          dateTimePattern: "yyyy-MM-dd HH:mm",
        },
      });
      expect(formatDate(D)).toBe("2026-07-01 14:30");
    });
  });
});

describe("getFieldGroups", () => {
  const collection = {
    slug: "landing",
    labels: { singular: "Landing", plural: "Landings" },
    fields: {
      intro: fields.text(),
      statValue: fields.text({ admin: { group: "Stats" } }),
      statLabel: fields.text({ admin: { group: "Stats" } }),
      ctaHeading: fields.text({ admin: { group: "CTA" } }),
      extra: fields.text(),
    },
  };

  it("partitions ordered fields into consecutive runs by admin.group", () => {
    const runs = getFieldGroups(collection, ["intro", "statValue", "statLabel", "ctaHeading", "extra"]);
    expect(runs).toEqual([
      { group: undefined, fields: ["intro"] },
      { group: "Stats", fields: ["statValue", "statLabel"] },
      { group: "CTA", fields: ["ctaHeading"] },
      { group: undefined, fields: ["extra"] },
    ]);
  });

  it("returns one ungrouped run when no field declares a group", () => {
    const runs = getFieldGroups(collection, ["intro", "extra"]);
    expect(runs).toEqual([{ group: undefined, fields: ["intro", "extra"] }]);
  });
});
