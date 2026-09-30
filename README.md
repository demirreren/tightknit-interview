# Tightknit Co-op Interview Exercise

**The exercise instructions are in [this Google Doc](https://docs.google.com/document/d/13_4C8eQFjhEEvfY8hTlp4ikYebg9yp0Dypb3UpRSj4o/edit?tab=t.0).** Read them first. This README only covers setup.

## Setup

Requires Node 20 or later.

```sh
npm install
```

## Running and testing

```sh
npm test          # runs the tests in test/
npm run digest    # runs buildDigest on data/messages.json and prints the result
npm run digest -- data/sample-messages.json
```

## What's here

| Path | What it is |
| --- | --- |
| `src/digest.ts` | `buildDigest`, the function you'll implement |
| `src/types.ts` | `SlackMessage` and `Digest` types |
| `src/run.ts` | Script behind `npm run digest` |
| `data/sample-messages.json` | 11 messages, so you can get a feel for the data |
| `data/sample-digest.json` | The digest those 11 messages should produce |
| `data/messages.json` | The full channel export (551 messages) |
| `test/sample.test.ts` | Two starter tests. Add your own. |
