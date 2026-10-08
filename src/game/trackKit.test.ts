import { describe, expect, it } from "vitest";
import {
  BAY_LENGTH,
  ONCOMING_STYLES,
  PARKED_STYLES,
  kitHash,
  planBays,
  planFreight,
  trainStyleFor,
} from "./trackKit";

const FREIGHT_GAP = 0.3;

describe("Rome Rail Kit composition", () => {
  it("fills any train length with whole bays and a gentle stretch", () => {
    for (let length = 7; length <= 22; length += 0.5) {
      for (const cab of [3.5, 4.0, 4.1, 4.9]) {
        const { count, scale } = planBays(length, cab);
        expect(count).toBeGreaterThanOrEqual(1);
        // The cab plus stretched bays ends exactly at the train's length.
        if (length - cab >= BAY_LENGTH * 0.6) expect(cab + count * BAY_LENGTH * scale).toBeCloseTo(length, 6);
        expect(scale).toBeGreaterThan(0.6);
        expect(scale).toBeLessThan(1.5);
      }
    }
  });

  it("plans freight consists that end exactly at the obstacle length", () => {
    for (let length = 5; length <= 24; length += 0.5) {
      for (const seed of [1, 7, 42, 1234]) {
        const { wagons, scale } = planFreight(length, seed);
        expect(wagons.length).toBeGreaterThan(0);
        const total = wagons.reduce((sum, w) => sum + w.length, 0) + FREIGHT_GAP * (wagons.length - 1);
        expect(total).toBeCloseTo(length, 6);
        if (length >= 8) {
          expect(scale).toBeGreaterThan(0.8);
          expect(scale).toBeLessThan(1.25);
        }
      }
    }
  });

  it("varies freight wagons deterministically by seed", () => {
    const parts = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const a = planFreight(18, seed).wagons.map((w) => w.part).join();
      expect(planFreight(18, seed).wagons.map((w) => w.part).join()).toBe(a);
      for (const part of a.split(",")) parts.add(part);
    }
    expect(parts).toEqual(new Set(["freight:boxcar", "freight:boxcarShort", "freight:tank"]));
  });

  it("picks stable, varied train styles for parked and oncoming trains", () => {
    const parked = new Set<string>();
    const oncoming = new Set<string>();
    for (let id = 0; id < 200; id++) {
      expect(trainStyleFor(id, false)).toBe(trainStyleFor(id, false));
      parked.add(trainStyleFor(id, false));
      oncoming.add(trainStyleFor(id, true));
    }
    expect(parked).toEqual(new Set(PARKED_STYLES));
    expect(oncoming).toEqual(new Set(ONCOMING_STYLES));
    expect(kitHash(-3)).toBeGreaterThanOrEqual(0);
  });
});
