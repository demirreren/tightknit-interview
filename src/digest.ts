import type { Digest, SlackMessage } from "./types";

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const TOP_THREAD_LIMIT = 3;

// Questions that don't end in "?", e.g. "Anyone have a good onboarding checklist template".
const QUESTION_OPENERS = /^(anyone|does anyone|has anyone|curious|wondering|is there)\b/i;

// Replies that react to a question without answering it.
const FILLER_REPLY =
  /^(\+1.*|same( here| question)?|saving this|thanks!*|thank you!*|love this|great idea|this is awesome|this is super helpful.*|congrats!*|bump)$/i;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

export type DigestOptions = {
  // Whether the asker replying in their own thread (e.g. "nvm figured it out") counts as an answer.
  askerReplyCountsAsAnswer?: boolean;
};

/**
 * Build the weekly digest for one Slack channel.
 *
 * The week starts at `weekStart` and runs for 7 days.
 *
 * Returns:
 *  - topThreads: the 3 most active threads this week
 *  - unanswered: questions posted this week that nobody has answered
 */
export function buildDigest(
  messages: SlackMessage[],
  weekStart: Date,
  options: DigestOptions = {},
): Digest {
  const weekStartSec = weekStart.getTime() / 1000;
  const weekEndSec = weekStartSec + WEEK_SECONDS;
  const inWeek = (ts: string) => {
    const sec = toSeconds(ts);
    return sec >= weekStartSec && sec < weekEndSec;
  };

  // Slack ts is unique per channel, so a repeated ts is a duplicate export row.
  const unique = [...new Map(messages.map((m) => [m.ts, m])).values()];

  const messagesByTs = new Map<string, SlackMessage>();
  const repliesByThread = new Map<string, SlackMessage[]>();
  for (const message of unique) {
    messagesByTs.set(message.ts, message);
    if (isReply(message)) {
      const replies = repliesByThread.get(message.thread_ts!) ?? [];
      replies.push(message);
      repliesByThread.set(message.thread_ts!, replies);
    }
  }

  const topThreads = [...repliesByThread]
    .map(([threadTs, replies]) => ({
      thread_ts: threadTs,
      text: messagesByTs.get(threadTs)?.text ?? "",
      repliesThisWeek: replies.filter((r) => !isNoise(r) && inWeek(r.ts)).length,
    }))
    .filter((thread) => thread.repliesThisWeek > 0)
    .sort(
      (a, b) =>
        b.repliesThisWeek - a.repliesThisWeek || toSeconds(a.thread_ts) - toSeconds(b.thread_ts),
    )
    .slice(0, TOP_THREAD_LIMIT);

  const unanswered = unique
    .filter((m) => !isNoise(m) && !isReply(m) && inWeek(m.ts) && looksLikeQuestion(m.text))
    .filter((q) => !isAnswered(q, repliesByThread.get(q.ts) ?? [], weekEndSec, options))
    .sort((a, b) => toSeconds(a.ts) - toSeconds(b.ts))
    .map(({ ts, user, text }) => ({ ts, user, text }));

  return { topThreads, unanswered };
}

function toSeconds(ts: string): number {
  return parseFloat(ts);
}

function isReply(message: SlackMessage): boolean {
  return message.thread_ts !== undefined && message.thread_ts !== message.ts;
}

function isNoise(message: SlackMessage): boolean {
  return message.subtype === "bot_message" || message.subtype === "channel_join";
}

function looksLikeQuestion(text: string): boolean {
  return text.includes("?") || QUESTION_OPENERS.test(text.trim());
}

function isFiller(text: string): boolean {
  const trimmed = text.trim();
  return FILLER_REPLY.test(trimmed) || EMOJI_ONLY.test(trimmed);
}

function isAnswered(
  question: SlackMessage,
  replies: SlackMessage[],
  weekEndSec: number,
  options: DigestOptions,
): boolean {
  // The export may omit a thread's replies; fall back to Slack's own count.
  if (replies.length === 0) return (question.reply_count ?? 0) > 0;

  return replies.some(
    (r) =>
      !isNoise(r) &&
      toSeconds(r.ts) < weekEndSec &&
      (options.askerReplyCountsAsAnswer || r.user !== question.user) &&
      !isFiller(r.text),
  );
}
