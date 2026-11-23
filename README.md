# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/angyi-cmyk/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/angyi-cmyk/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `solve.js` answers every case exactly as csv-reader does — the same `{columns, rows, errors}`, the same broken-row policy (stray CRs, junk after a closing quote, unterminated quotes, short and long rows) — but reads the text in bulk instead of one character at a time. Lines holding no quote are split with `indexOf`; quoted fields jump straight to their closing quote; unquoted fields jump straight to their next comma, line break or stray CR; and two forward-only pointers (the next `"` and the next `\r`) make sure no span of text is ever scanned twice. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22 or later; no dependencies, no WebAssembly, no native code. On the kit's practice set (6 cases, about 10 MB of CSV) it answers identically to the baseline on every case — verified against `practice/reference/expected.json`, against the baseline itself on 7,000 adversarial fuzz inputs and 72 freshly generated cases — and runs about 3.6× faster: 191 ms of CPU (trimmed mean over 11 runs) against the baseline's 694 ms on the same machine.

---

<sub>Entered on [make.fun](https://make.fun/?ref=m2756q7x&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
