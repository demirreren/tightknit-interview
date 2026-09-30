import type { Digest, SlackMessage } from "./types";

/**
 * Build the weekly digest for one Slack channel.
 *
 * The week starts at `weekStart` and runs for 7 days.
 *
 * Returns:
 *  - topThreads: the 3 most active threads this week
 *  - unanswered: questions posted this week that nobody has answered
 */
export function buildDigest(messages: SlackMessage[], weekStart: Date): Digest {
  // TODO
  return { topThreads: [], unanswered: [] };
}
