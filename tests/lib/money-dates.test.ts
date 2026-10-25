import { describe, expect, it } from "vitest";
import { daysBetween, todayIST } from "@/lib/dates";
import { formatPaise, rupeesToPaise } from "@/lib/money";

describe("money", () => {
  it("formats paise as rupees in the Indian style", () => {
    expect(formatPaise(8_000_000)).toBe("₹80,000");
    expect(formatPaise(125_000_000)).toBe("₹12,50,000");
    expect(formatPaise(4_550)).toBe("₹45.5");
  });

  it("parses rupees to whole paise without float errors", () => {
    expect(rupeesToPaise("80,000")).toBe(8_000_000);
    expect(rupeesToPaise("₹ 1,00,000.50")).toBe(10_000_050);
    expect(rupeesToPaise("0.29")).toBe(29);
    expect(rupeesToPaise(1199)).toBe(119_900);
  });

  it("rejects invalid amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5"]) expect(rupeesToPaise(bad)).toBeNull();
  });
});

describe("dates", () => {
  it("uses India Standard Time for today", () => {
    // 20:00 UTC on 31 Jan is already 1 Feb in India (UTC+5:30).
    expect(todayIST(new Date("2027-01-31T20:00:00Z"))).toBe("2027-02-01");
    expect(todayIST(new Date("2027-01-31T18:00:00Z"))).toBe("2027-01-31");
  });

  it("counts whole days between calendar dates", () => {
    expect(daysBetween("2026-10-21", "2027-02-14")).toBe(116);
    expect(daysBetween("2027-02-14", "2027-02-14")).toBe(0);
    expect(daysBetween("2027-02-15", "2027-02-14")).toBe(-1);
  });
});
