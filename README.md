# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/muhamadlangg71-prog/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/muhamadlangg71-prog/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token DeFi protocols by what their token launch would be worth, and hands in a web dashboard with the board, a detail view for every protocol and the steps to farm it. Each row is priced from the market: its category earns the median market-cap/TVL of the protocols that already trade in it, shrunk toward the whole market median where a category has too few live comps.

Every row also carries a **confidence score (0–100)**: 40 points for the depth of its category's live bench, 30 for TVL size (log scale), 30 for the record (age and growth known). A high implied value with a low score is a thin claim. A **Top Movers** strip shows the five fastest 7-day TVL growers among the top 50 by implied value. The **model sandbox** adds three scenarios — Conservative, Base, Aggressive — that set the growth and maturity weights together and show how the top 3 moves.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=sz08m7rk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
