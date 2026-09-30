import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest";
import type { SlackMessage } from "../src/types";
import sampleMessages from "../data/sample-messages.json";
import sampleDigest from "../data/sample-digest.json";

const weekStart = new Date("2026-09-21T00:00:00Z");

// Slack-style ts for an ISO time, e.g. at("2026-09-22T10:00:00Z") -> "1790042400.000000"
const at = (iso: string) => (Date.parse(iso) / 1000).toFixed(6);

const post = (iso: string, user: string, text: string, extra: Partial<SlackMessage> = {}): SlackMessage => ({
  ts: at(iso),
  user,
  text,
  ...extra,
});

const parent = (iso: string, user: string, text: string, replyCount: number): SlackMessage =>
  post(iso, user, text, { thread_ts: at(iso), reply_count: replyCount });

const reply = (threadIso: string, iso: string, user: string, text: string, extra: Partial<SlackMessage> = {}) =>
  post(iso, user, text, { thread_ts: at(threadIso), ...extra });

describe("week boundaries", () => {
  it("includes a message at exactly weekStart and excludes one at exactly weekStart + 7 days", () => {
    const messages = [
      post("2026-09-20T23:59:59Z", "U1", "Before the week?"),
      post("2026-09-21T00:00:00Z", "U2", "First second of the week?"),
      post("2026-09-28T00:00:00Z", "U3", "First second of next week?"),
    ];
    expect(buildDigest(messages, weekStart).unanswered.map((q) => q.text)).toEqual([
      "First second of the week?",
    ]);
  });
});

describe("topThreads", () => {
  it("counts a thread started before the week using only its in-week replies", () => {
    const old = "2026-09-19T12:00:00Z";
    const messages = [
      parent(old, "U1", "Old thread", 4),
      reply(old, "2026-09-20T12:00:00Z", "U2", "last week"),
      reply(old, "2026-09-22T12:00:00Z", "U3", "this week 1"),
      reply(old, "2026-09-23T12:00:00Z", "U4", "this week 2"),
      reply(old, "2026-09-28T12:00:00Z", "U5", "next week"),
    ];
    expect(buildDigest(messages, weekStart).topThreads).toEqual([
      { thread_ts: at(old), text: "Old thread", repliesThisWeek: 2 },
    ]);
  });

  it("ignores reply_count and threads whose replies are all outside the week", () => {
    const t = "2026-09-27T23:00:00Z";
    const messages = [
      parent(t, "U1", "Big thread, but replies land next week", 3),
      reply(t, "2026-09-28T01:00:00Z", "U2", "a"),
      reply(t, "2026-09-28T02:00:00Z", "U3", "b"),
      reply(t, "2026-09-28T03:00:00Z", "U4", "c"),
    ];
    expect(buildDigest(messages, weekStart).topThreads).toEqual([]);
  });

  it("does not count bot or channel_join replies as activity", () => {
    const t = "2026-09-22T10:00:00Z";
    const messages = [
      parent(t, "U1", "Thread", 3),
      reply(t, "2026-09-22T11:00:00Z", "U2", "human reply"),
      reply(t, "2026-09-22T12:00:00Z", "B1", "auto reply", { subtype: "bot_message" }),
      reply(t, "2026-09-22T13:00:00Z", "U3", "<@U3> has joined the channel", { subtype: "channel_join" }),
    ];
    expect(buildDigest(messages, weekStart).topThreads[0].repliesThisWeek).toBe(1);
  });

  it("counts the asker's own replies as activity, not the parent itself", () => {
    const t = "2026-09-22T10:00:00Z";
    const messages = [
      parent(t, "U1", "Thread", 2),
      reply(t, "2026-09-22T11:00:00Z", "U2", "answer"),
      reply(t, "2026-09-22T12:00:00Z", "U1", "thanks!"),
    ];
    expect(buildDigest(messages, weekStart).topThreads[0].repliesThisWeek).toBe(2);
  });

  it("keeps only the top 3 and breaks ties by earlier thread_ts", () => {
    const threads = ["2026-09-22T10:00:00Z", "2026-09-23T10:00:00Z", "2026-09-24T10:00:00Z", "2026-09-25T10:00:00Z"];
    const counts = [1, 2, 2, 2];
    const messages = threads.flatMap((t, i) => [
      parent(t, "U1", `Thread ${i}`, counts[i]),
      ...Array.from({ length: counts[i] }, (_, j) =>
        reply(t, new Date(Date.parse(t) + (j + 1) * 60_000).toISOString(), `U${j + 2}`, "reply"),
      ),
    ]);
    expect(buildDigest(messages, weekStart).topThreads.map((t) => t.text)).toEqual([
      "Thread 1",
      "Thread 2",
      "Thread 3",
    ]);
  });

  it("returns fewer than 3 threads without padding", () => {
    const t = "2026-09-22T10:00:00Z";
    const messages = [parent(t, "U1", "Only thread", 1), reply(t, "2026-09-22T11:00:00Z", "U2", "hi")];
    expect(buildDigest(messages, weekStart).topThreads).toHaveLength(1);
  });

  it("uses empty text when the parent is missing from the export", () => {
    const t = "2026-09-19T10:00:00Z";
    const messages = [reply(t, "2026-09-22T11:00:00Z", "U2", "orphan reply")];
    expect(buildDigest(messages, weekStart).topThreads).toEqual([
      { thread_ts: at(t), text: "", repliesThisWeek: 1 },
    ]);
  });
});

describe("unanswered", () => {
  it("ignores bot and channel_join messages even if they contain '?'", () => {
    const messages = [
      post("2026-09-22T10:00:00Z", "B1", "Got questions? Bring them!", { subtype: "bot_message" }),
      post("2026-09-22T11:00:00Z", "U1", "<@U1> has joined the channel?", { subtype: "channel_join" }),
    ];
    expect(buildDigest(messages, weekStart).unanswered).toEqual([]);
  });

  it("detects questions without a '?' and skips statements", () => {
    const messages = [
      post("2026-09-22T10:00:00Z", "U1", "Anyone have a good onboarding checklist template"),
      post("2026-09-22T11:00:00Z", "U2", "PSA: the new events page is live"),
    ];
    expect(buildDigest(messages, weekStart).unanswered.map((q) => q.text)).toEqual([
      "Anyone have a good onboarding checklist template",
    ]);
  });

  it("treats a real reply from someone else as an answer", () => {
    const q = "2026-09-22T10:00:00Z";
    const messages = [
      parent(q, "U1", "How do I export members?", 1),
      reply(q, "2026-09-22T11:00:00Z", "U2", "Settings > Export."),
    ];
    expect(buildDigest(messages, weekStart).unanswered).toEqual([]);
  });

  it("does not treat bot, filler, or asker-only replies as answers", () => {
    const bot = "2026-09-22T10:00:00Z";
    const filler = "2026-09-23T10:00:00Z";
    const bump = "2026-09-24T10:00:00Z";
    const messages = [
      parent(bot, "U1", "Can I schedule posts?", 1),
      reply(bot, "2026-09-22T10:01:00Z", "B1", "A team member usually replies within 1 day.", { subtype: "bot_message" }),
      parent(filler, "U2", "Can I see who RSVP'd?", 2),
      reply(filler, "2026-09-23T11:00:00Z", "U3", "+1, same question"),
      reply(filler, "2026-09-23T12:00:00Z", "U4", "🔥"),
      parent(bump, "U5", "How do I bulk-import members?", 1),
      reply(bump, "2026-09-24T11:00:00Z", "U5", "bump"),
    ];
    expect(buildDigest(messages, weekStart).unanswered.map((q) => q.text)).toEqual([
      "Can I schedule posts?",
      "Can I see who RSVP'd?",
      "How do I bulk-import members?",
    ]);
  });

  it("lets the asker's own substantive reply count as an answer only when the toggle is on", () => {
    const q = "2026-09-22T10:00:00Z";
    const messages = [
      parent(q, "U1", "Why won't my domain verify?", 1),
      reply(q, "2026-09-22T12:00:00Z", "U1", "nvm figured it out, TTL hadn't expired"),
    ];
    expect(buildDigest(messages, weekStart).unanswered).toHaveLength(1);
    expect(buildDigest(messages, weekStart, { askerReplyCountsAsAnswer: true }).unanswered).toEqual([]);
  });

  it("does not count replies that arrive after the week ends", () => {
    const q = "2026-09-27T20:00:00Z";
    const messages = [
      parent(q, "U1", "Does the export include DMs?", 1),
      reply(q, "2026-09-28T09:00:00Z", "U2", "No, only public channels."),
    ];
    expect(buildDigest(messages, weekStart).unanswered).toHaveLength(1);
  });

  it("trusts reply_count when the replies are not in the export", () => {
    const messages = [parent("2026-09-22T10:00:00Z", "U1", "Is there an API?", 2)];
    expect(buildDigest(messages, weekStart).unanswered).toEqual([]);
  });

  it("returns only ts, user, text, sorted oldest first", () => {
    const messages = [
      post("2026-09-25T10:00:00Z", "U2", "Later question?"),
      post("2026-09-22T10:00:00Z", "U1", "Earlier question?"),
    ];
    expect(buildDigest(messages, weekStart).unanswered).toEqual([
      { ts: at("2026-09-22T10:00:00Z"), user: "U1", text: "Earlier question?" },
      { ts: at("2026-09-25T10:00:00Z"), user: "U2", text: "Later question?" },
    ]);
  });
});

describe("input handling", () => {
  it("gives the same result regardless of input order", () => {
    const shuffled = [...(sampleMessages as SlackMessage[])].reverse();
    expect(buildDigest(shuffled, weekStart)).toEqual(sampleDigest);
  });

  it("ignores duplicate rows with the same ts", () => {
    const doubled = [...(sampleMessages as SlackMessage[]), ...(sampleMessages as SlackMessage[])];
    expect(buildDigest(doubled, weekStart)).toEqual(sampleDigest);
  });
});

describe("full channel export", () => {
  it("picks the three busiest threads by this week's replies", () => {
    const messages: SlackMessage[] = JSON.parse(readFileSync("data/messages.json", "utf8"));
    expect(
      buildDigest(messages, weekStart).topThreads.map(({ thread_ts, repliesThisWeek }) => ({ thread_ts, repliesThisWeek })),
    ).toEqual([
      { thread_ts: "1789830000.068270", repliesThisWeek: 11 },
      { thread_ts: "1790096400.033730", repliesThisWeek: 9 },
      { thread_ts: "1790179200.073050", repliesThisWeek: 7 },
    ]);
  });
});
