// Runs buildDigest on a data file and prints the result.
//   npm run digest                            -> data/messages.json
//   npm run digest -- data/sample-messages.json
import { readFileSync } from "node:fs";
import { buildDigest } from "./digest";
import type { SlackMessage } from "./types";

const file = process.argv[2] ?? "data/messages.json";
const messages: SlackMessage[] = JSON.parse(readFileSync(file, "utf8"));
const weekStart = new Date("2026-09-21T00:00:00Z"); // Monday

console.log(JSON.stringify(buildDigest(messages, weekStart), null, 2));
