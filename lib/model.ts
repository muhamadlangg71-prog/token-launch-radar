// The launch radar model, in one file by design: it reads nothing but the
// snapshot's own figures, and every number on the board traces back to a term
// here. No protocol is special-cased by name anywhere in this file.

// ---------------------------------------------------------------- types

/** One protocol exactly as the sealed snapshot records it. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot this entry reads. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  factors: {
    category_multiple: number;
    multiple_source: string;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

// Constants of the watchlist rule, applied here only to explain set-asides.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const VERSION_MARKER = /\s(v?\d+(?:\.\d+)?|2\.0)$/i;
const DERIVATIVE_WORD = /(^|\s)(wrapped|staked|staking)(\s|$)/i;
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** True when a protocol records no token at all in the snapshot. */
export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when the snapshot's watchlist rule would set the protocol aside as a derivative. */
export function setAsideReason(p: Protocol): string | null {
  if (!recordsNoToken(p)) return 'records a token in the snapshot (market cap, symbol or a listing id): kept in the calibration set, never ranked';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}: a wrapped, bridged or staked product, not a launch of its own`;
  if (p.name !== null && VERSION_MARKER.test(p.name)) return 'name ends in a version marker: a versioned pool of a protocol that exists, not a launch';
  if (p.name !== null && DERIVATIVE_WORD.test(p.name)) return 'name carries wrapped, staked or staking: a product of a token that already trades';
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return `name begins with an exchange (${e}): the exchange's token, not a launch`;
  return null;
}

// ---------------------------------------------------------------- helpers

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** USD a whole number of dollars, $1.2M style for the board's own text. */
export const fmtUsd = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

// ---------------------------------------------------------------- calibration

/**
 * The market's own pricing of tokens against TVL, read from the snapshot's
 * live-token protocols: per category, the median mcap/TVL of its peers shrunk
 * toward the snapshot-wide median by 3 pseudo-peers, so a category with two
 * rich tokens does not crown its whole bench; clamped to ×0.05 … ×2.3.
 */
export function categoryMultiples(snapshot: Snapshot): Map<string, { multiple: number; peers: number; source: string }> {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd !== null && p.tvl_usd > 0);
  const global = median(live.map((p) => p.mcap_usd / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const cat = p.category ?? 'Uncategorised';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p.mcap_usd / p.tvl_usd);
  }
  const out = new Map<string, { multiple: number; peers: number; source: string }>();
  for (const [cat, rs] of [...byCat.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const m = rs.length >= 3 ? (median(rs) * rs.length + global * 3) / (rs.length + 3) : global;
    out.set(cat, {
      multiple: round1(clamp(m, 0.05, 2.3) * 100) / 100,
      peers: rs.length,
      source: rs.length >= 3 ? `median of ${rs.length} live ${cat} peers, shrunk toward the snapshot-wide median` : `fewer than three live ${cat} peers: snapshot-wide median`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the value model

/**
 * The implied launch value, every term from the snapshot itself:
 *   implied = TVL × category multiple × growth × maturity × chain breadth
 * It is an estimate of what a token could be worth if the protocol's record
 * held, never a prediction that one is issued.
 */
export function scoreProtocol(p: Protocol, snapshot: Snapshot, mults: Map<string, { multiple: number; peers: number; source: string }>): ModelRow {
  const tvl = p.tvl_usd ?? 0;
  const cat = p.category ?? 'Uncategorised';
  const m = mults.get(cat)?.multiple ?? 1;

  // Growth: seven days of TVL change on a saturating curve, so one explosive
  // week lifts a row without swallowing the board; unreported reads as flat.
  const g = p.change_7d === null ? 0 : clamp(p.change_7d, -100, 500);
  const growth = 1 + 0.3 * Math.tanh(g / 40);

  // Maturity: a protocol that has run longer with no token has more of a
  // record a launch could rest on, rising to full weight at two years and then
  // easing, gently, for the veterans that never shipped one.
  const age = p.listed_at === null ? null : daysBetween(p.listed_at, snapshot.as_of);
  let maturity = 1;
  if (age !== null) {
    const rise = 0.7 + 0.3 * Math.min(age, 730) / 730;
    const ease = age > 1460 ? 1 - 0.14 * (age - 1460) / 1460 : 1;
    maturity = clamp(rise * ease, 0.6, 1);
  }

  // Breadth: the chains a protocol already serves, up to five beyond the first.
  const breadth = 1 + 0.04 * Math.min(p.chains.length - 1, 5);

  const implied = Math.min(100_000_000_000_000, Math.max(1, Math.round(tvl * m * growth * maturity * breadth)));

  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: Math.round(tvl),
    change_7d: p.change_7d,
    age_days: age,
    implied_value_usd: implied,
    factors: {
      category_multiple: m,
      multiple_source: mults.get(cat)?.source ?? 'snapshot-wide median',
      growth_multiplier: round1(growth * 1000) / 1000,
      maturity_multiplier: round1(maturity * 1000) / 1000,
      breadth_multiplier: round1(breadth * 1000) / 1000,
    },
    watchlist: snapshot.watchlist.includes(p.slug),
  };
}

// ---------------------------------------------------------------- the board

export interface Board {
  rows: (ModelRow & { rank: number; farm_steps: string[]; set_aside?: string })[];
  live: LiveRow[];
  set_aside: { slug: string; name: string; reason: string }[];
  watchlist_size: number;
  floor_usd: number;
  as_of: string;
}

/**
 * The ranked board: every launch candidate the snapshot holds, the whole
 * watchlist always in, and any protocol the rule sets aside is listed with its
 * reason rather than slipped into a rank; live-token protocols stay in their
 * own calibration set. Ranks are exactly 1…N by implied value, ties broken by
 * slug so two runs of the program write the same bytes.
 */
export function buildBoard(snapshot: Snapshot): Board {
  const mults = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const rows: Board['rows'] = [];
  const setAside: Board['set_aside'] = [];

  for (const p of snapshot.protocols) {
    const reason = setAsideReason(p);
    if (reason !== null) {
      if (!recordsNoToken(p)) continue; // live-token: calibration set below
      setAside.push({ slug: p.slug, name: p.name, reason });
      continue;
    }
    if (!recordsNoToken(p)) continue;
    rows.push({ ...scoreProtocol(p, snapshot, mults), rank: 0, farm_steps: [] });
  }

  // A watchlist protocol never falls off the board, whatever my own filter did.
  for (const slug of snapshot.watchlist) {
    if (rows.some((r) => r.slug === slug)) continue;
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p === undefined) continue;
    rows.push({ ...scoreProtocol(p, snapshot, mults), rank: 0, farm_steps: [] });
  }

  rows.sort((a, b) => (b.implied_value_usd - a.implied_value_usd) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.farm_steps = farmSteps(r, snapshot);
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null && p.tvl_usd !== null && p.tvl_usd > 0)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: Math.round(p.tvl_usd), mcap_usd: p.mcap_usd, ratio: Math.round((p.mcap_usd / p.tvl_usd) * 100) / 100 }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  setAside.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { rows, live, set_aside: setAside, watchlist_size: snapshot.watchlist.length, floor_usd: snapshot.floor_usd, as_of: snapshot.as_of };
}

// ---------------------------------------------------------------- farm plans

const CHAIN_GAS: { match: RegExp; band: string }[] = [
  { match: /^Ethereum$/, band: 'about $8–$25 of gas' },
  { match: /^(Base|Arbitrum|Optimism|Blast|Linea|Scroll|Mantle|zkSync|Unichain|Polygon|Avalanche|BSC|Corn|Katana|Monad)$/, band: 'about $0.20–$1.50 of gas' },
  { match: /^(Solana|Sei|Sui|Aptos|Ton)$/, band: 'about $0.02–$0.10 of fees' },
];
const chainGas = (chains: string[]): string => CHAIN_GAS.find((c) => chains.some((ch) => c.match.test(ch)))?.band ?? 'about $0.50–$2 of gas';

const CATEGORY_PLAY: Record<string, (r: ModelRow) => string> = {
  DEX: (r) => `Swap regularly on ${r.chains[0]} across at least three of its busiest pools and keep some of the fees it pays you working as concentrated liquidity in a stable pair. Budget ${chainGas(r.chains)} per visit plus a $250–$1,000 working balance, about 45 minutes a week.`,
  Lending: (r) => `Deposit on ${r.chains[0]}, borrow against the deposit up to a safe 35% and rotate the borrowed liquidity into its own markets so it counts as usage, not a parked balance. Budget ${chainGas(r.chains)} per reset and a $500–$2,000 working balance, about 30 minutes a week.`,
  Yield: (r) => `Lock part of the position in its longest vault on ${r.chains[0]} and autocompound the rest, then sweep the weekly yield into the lock so the position grows while fees stay flat. Budget ${chainGas(r.chains)} monthly and a $400–$1,500 stake, about 20 minutes a week.`,
  'Liquid Staking': (r) => `Mint its liquid token on ${r.chains[0]} with the funds you already stake, then lend or LP the liquid token rather than letting it idle, so two lines of the protocol carry you. Budget ${chainGas(r.chains)} once plus a $300–$1,200 position, about 15 minutes a week.`,
  Restaking: (r) => `Restake through its interface on ${r.chains[0]}, keep the position inside a partnered operator set, and compound the points-bearing positions monthly. Budget ${chainGas(r.chains)} per rotation and a $600–$2,500 position, about 25 minutes a week.`,
  'CDM': (r) => `Open its position on ${r.chains[0]} with a small vault, mint against it conservatively at 3:1 and use the minted debt in its own yield venues, keeping the vault above water at all times. Budget ${chainGas(r.chains)} plus a $500–$2,000 working balance, about 40 minutes a week.`,
  Bridge: (r) => `Bridge a working balance via its ${r.chains[0]} route weekly, keep it running both ways so the volume reads as organic, then rest the funds in its own yield pages between crossings. Budget ${chainGas(r.chains)} per crossing and $200–$800 of float, about 20 minutes a week.`,
  'Risk Curators': (r) => `Deposit through the curated vaults it manages on ${r.chains[0]}, spread across its best-rated strategies, and rebalance toward whichever vault its own dashboards score highest each month. Budget ${chainGas(r.chains)} to rebalance and a $500–$2,000 position, about 15 minutes a week.`,
  Derivatives: (r) => `Trade on ${r.chains[0]} in a real size on both directions with stop discipline, keep the average hold over a day so the week reads as usage, and keep collateral split between the protocol and cold storage. Budget ${chainGas(r.chains)} plus a $300–$1,200 margin and about 2 hours a month.`,
};

const genericPlay = (r: ModelRow): string => {
  const cat = r.category ?? 'protocol';
  return `Use ${r.name} itself on ${r.chains[0]} the way its ${cat.toLowerCase()} peers reward: a working balance, a real interaction each week, and the earnings kept inside so the record compounds. Budget ${chainGas(r.chains)} plus a $300–$1,000 stake, about 30 minutes a week.`;
};

/**
 * The farm plan: concrete steps with what they cost and how long they take,
 * generated from the protocol's own row (category, chains, TVL tier) so the
 * same code writes every plan and no protocol is written by hand.
 */
export function farmSteps(r: ModelRow, snapshot: Snapshot): string[] {
  const chain = r.chains[0] ?? 'its home chain';
  const gas = chainGas(r.chains);
  const stake = r.tvl_usd >= 1e9 ? '$1,000–$5,000' : r.tvl_usd >= 1e8 ? '$500–$2,500' : '$250–$1,200';
  const g = r.change_7d === null ? null : round1(r.change_7d);
  const play = (CATEGORY_PLAY[r.category ?? ''] ?? genericPlay)(r);
  const ageWord = r.age_days === null ? 'an unknown age' : `${r.age_days} days on the record`;
  return [
    `Give the farm its own wallet: a fresh key, only the farm’s funds, the seed phrase offline, and no other dapp ever connected to it. Cost: ${gas} for the first transaction. Time: 10 minutes.`,
    `Size the position to the row, not to hope: with ${fmtUsd(r.tvl_usd)} of TVL a readable footprint is ${stake} of capital, kept in ${chain} gas plus the protocol’s own asset. Review the size monthly against the 7-day TVL line (${g === null ? 'growth unreported' : `${g > 0 ? '+' : ''}${g}%`}).`,
    play,
    `Build the record over months, not one weekend: interact every week in a normal human shape (a few clears, ${gas} each), hold the position through its ${ageWord}, and never route many wallets into one farm, because airdrop reviews discard sybil clusters on sight. Cost: ${gas} a week. Time: about 15 minutes a week besides step 3’s.`,
    `Collect the fee-bearing side while you wait: staking, LP or vault rewards the protocol pays today go into the position, and a claim is a strong signal of active use. Cost: ${gas} per claim. Time: 10 minutes.`,
    `Keep an exit note on the row before you enter: the farm plan runs until a launch, a buyout or a TVL break below half of today’s ${fmtUsd(r.tvl_usd)} ends it, whichever comes first, and the snapshot’s own as-of date (${snapshot.as_of}) is the record’s date, not the market’s. Cost: free. Time: 5 minutes to write.`,
  ];
}
