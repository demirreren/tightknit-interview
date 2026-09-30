export type SlackMessage = {
  ts: string; // Slack timestamp, e.g. "1789960000.000200"
  thread_ts?: string; // set on thread replies, and on parents that have replies
  user: string;
  text: string;
  reply_count?: number; // only on thread parents
  subtype?: "bot_message" | "channel_join";
};

export type Digest = {
  topThreads: { thread_ts: string; text: string; repliesThisWeek: number }[];
  unanswered: { ts: string; user: string; text: string }[];
};
