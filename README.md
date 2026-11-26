[![Token Launch Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/muhamadlangg71-prog/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/muhamadlangg71-prog/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Launch Radar

A dashboard that ranks the DeFi protocols which **record no token yet** by what
a launch would be worth — and shows a reader how to farm each one. Built for
[make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

## The question it answers

Which pre-token protocol is worth farming next, and what do I do about it?
The board reads a sealed snapshot of every protocol DefiLlama tracks at or
above $5,000,000 of TVL (758 protocols, fetched 2026-11-14), finds the ones
that record no token, and ranks 200 of them by an **implied value** — the
entry's own claim from the snapshot's figures, never a prediction that a token
will be issued or of what one would trade at. Every protocol on the snapshot's
40-protocol watchlist is on the board; the watchlist is the floor, never the
whole board.

## The value model

```
implied = TVL × category multiple × growth × age × chains
```

- **Category multiple** — the median market-cap-per-TVL of the tokenized
  protocols in the same category (five or more of them, else the global
  median), clamped to 0.02–2.00. It answers: what does the market pay per
  dollar of TVL for protocols like this one that already trade?
- **Growth** — 1 + the 7-day TVL change, capped at ±20 points. A week's move
  is noisy, so it can only nudge the value.
- **Age** — 0.80 + 0.20 × min(days listed / 365, 1). A protocol that has run
  a year with no token has survived; a new listing has not.
- **Chains** — 1 + 0.05 per extra chain, up to four. Wider distribution is
  worth a little, not a lot.
- **Excluded before ranking** — bridges, liquid staking and restaking, CEX
  products, wrapped or staked products, versioned names and exchange-named
  products. Each is a product of a token that already trades, so none is a
  launch still to come (the snapshot records no token for WBTC or USDT0, but
  neither is a pre-token protocol).

The result is clamped to 0.01–3.00× TVL and rounded to whole dollars. No
protocol is named anywhere in the code: every number follows from the
snapshot's own figures.

## The dashboard

`dashboard/` is a static page that renders with no network. It shows the
board (sortable, filterable by search, category, chain and watchlist), a
detail view for every protocol with the full working behind its implied value,
and a five-step farm plan per protocol — each step naming what to do, what it
costs and how long it takes. Protocols are described as *recording no token*,
never as having none: the snapshot is DefiLlama's record, not proof.

## Running it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, the page's
`data.js`, copies `dashboard/` and `screenshots/`, and writes `dossier.json`
with the kit's `vendor/makefun-board.ts`. The same snapshot always writes the
same bytes, so the grader's two runs agree.

## Layout

- `main.ts` — entrypoint: read snapshot, build board, write output + dossier
- `lib/model.ts` — the value model, the board builder and the farm plans
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
- `dashboard/` — `index.html`, `app.css`, `app.js` (the page; `data.js` is generated)
- `screenshots/` — the board, a protocol's detail view and a filtered view

## License

MIT — see `LICENSE`. Nothing here is financial advice: farming a protocol
costs gas and carries smart-contract risk.
