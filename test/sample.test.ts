import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest";
import type { Digest, SlackMessage } from "../src/types";
import sampleMessages from "../data/sample-messages.json";
import sampleDigest from "../data/sample-digest.json";

const weekStart = new Date("2026-09-21T00:00:00Z");

describe("buildDigest on the sample", () => {
  it("returns an empty digest for an empty channel", () => {
    expect(buildDigest([], weekStart)).toEqual({ topThreads: [], unanswered: [] });
  });

  it("produces sample-digest.json from sample-messages.json", () => {
    const result = buildDigest(sampleMessages as SlackMessage[], weekStart);
    expect(result).toEqual(sampleDigest as Digest);
  });
});
