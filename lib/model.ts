// Token Launch Radar — value model and farm plans.
//
// The model is built only from the snapshot's own figures. Nothing here names a
// protocol: every number below is derived from the row's TVL, its 7-day change,
// the day DefiLlama began tracking it, how many chains it runs on, and the
// market-cap-to-TVL ratios of the tokenized protocols in its own category.
//
// Implied value, for one protocol that records no token:
//   implied = TVL x categoryMultiple x growthFactor x ageFactor x chainFactor
//   categoryMultiple = median(mcap / TVL) of the tokenized protocols in the
//     same category (>= 5 of them, else the global median), clamped to
//     [0.02, 2.00]. It answers "what does the market pay per dollar of TVL
//     for protocols like this one that already trade?"
//   growthFactor = 1 + clamp(change_7d, -20, +20) / 100. A week's move is
//     noisy, so its effect is capped at twenty points either way.
//   ageFactor = 0.80 + 0.20 x min(ageDays / 365, 1). A protocol that has run
//     for a year with no token has survived; a brand-new listing has not.
//     The factor never exceeds 1.00, so age can only reward survival, never
//     inflate a value without limit.
//   chainFactor = 1 + 0.05 x min(chains - 1, 4). Each extra chain is wider
//     distribution, worth a little, capped at four extra chains.
// The result is then clamped to [TVL x 0.01, TVL x 3] and rounded to whole
// dollars, so no row can claim more than three dollars of value per dollar
// of TVL, and no row can claim almost nothing while holding real TVL.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ScoredRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  multiple: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  conviction: number;
}

export interface BoardStats {
  as_of: string;
  floor_usd: number;
  total_protocols: number;
  no_token_protocols: number;
  candidates: number;
  watchlist_count: number;
  board_rows: number;
  total_implied_usd: number;
  median_multiple: number;
  categories: number;
}

export interface BoardResult {
  rows: ScoredRow[];
  stats: BoardStats;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2] as number;
  return ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** Days from listed_at to as_of; null when the snapshot carries no date. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(listedAt + 'T00:00:00Z');
  const end = Date.parse(asOf + 'T00:00:00Z');
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const days = Math.floor((end - start) / DAY_MS);
  return days < 0 ? 0 : days;
}

/** The house watchlist rule's exclusion side: a protocol that is a wrapped,
 * staked or bridged product of a token that already trades is not a token
 * that does not exist yet, even when the snapshot records no token for it.
 * This mirrors the rule the snapshot's own watchlist was built with, minus
 * parentProtocol, which the snapshot does not carry: WBTC, Binance staked
 * ETH and USDT0 are off it for exactly this reason. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

export function isWrappedOrBridgedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_MARKER.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  for (const ex of EXCHANGE_NAMES) {
    if (p.name.startsWith(ex)) return true;
  }
  return false;
}

/**
 * The category multiple: median market-cap-per-TVL of the tokenized protocols
 * in the same category, winsorized to [0.02, 2.00]. Fewer than five
 * comparables in the category falls back to the global median; no tokenized
 * protocol anywhere falls back to 0.25, a disclosed round assumption.
 */
export function categoryMultiples(protocols: SnapshotProtocol[]): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  const global: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, 0.02, 2.0);
    global.push(ratio);
    const key = p.category ?? '(uncategorised)';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const globalMedian = global.length > 0 ? median(global) : 0.25;
  const out = new Map<string, number>();
  for (const [key, list] of byCategory) {
    out.set(key, list.length >= 5 ? median(list) : globalMedian);
  }
  out.set('__global__', globalMedian);
  return out;
}

/** The implied value of one protocol, with every factor exposed for the page. */
export function scoreProtocol(
  p: SnapshotProtocol,
  multiples: Map<string, number>,
  asOf: string,
  medianAge: number,
): Omit<ScoredRow, 'rank' | 'farm_steps' | 'watchlist' | 'conviction'> {
  const key = p.category ?? '(uncategorised)';
  const multiple = multiples.get(key) ?? (multiples.get('__global__') as number);
  const growth = p.change_7d ?? 0;
  const growthFactor = 1 + clamp(growth, -20, 20) / 100;
  const age = ageDays(p.listed_at, asOf) ?? medianAge;
  const ageFactor = 0.8 + 0.2 * Math.min(age / 365, 1);
  const chainFactor = 1 + 0.05 * Math.min(Math.max(p.chains.length - 1, 0), 4);
  const raw = p.tvl_usd * multiple * growthFactor * ageFactor * chainFactor;
  const implied = Math.max(1, Math.round(clamp(raw, p.tvl_usd * 0.01, p.tvl_usd * 3)));
  return {
    slug: p.slug,
    name: p.name,
    implied_value_usd: implied,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: ageDays(p.listed_at, asOf),
    multiple: round4(multiple),
    growth_factor: round4(growthFactor),
    age_factor: round4(ageFactor),
    chain_factor: round4(chainFactor),
  };
}

/**
 * A 0-100 conviction display score: half the protocol's TVL standing among
 * the board's candidates, a quarter its weekly growth, a quarter its age.
 * Display only; the rank is set by implied value, never by this score.
 */
function conviction(
  p: SnapshotProtocol,
  tvlPercentile: number,
  age: number,
): number {
  const growthNorm = clamp(((p.change_7d ?? 0) + 20) / 40, 0, 1);
  const ageNorm = Math.min(age / 365, 1);
  return Math.round(100 * (0.5 * tvlPercentile + 0.25 * growthNorm + 0.25 * ageNorm));
}

// ---------------------------------------------------------------- farm plans

function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'about $5–$15 a transaction';
  if (chain === 'Solana') return 'under $1 a transaction';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Unichain') {
    return 'about $1–$3 a transaction';
  }
  return 'about $1–$5 a transaction';
}

interface ActionKit {
  core: string;
  second: string;
}

function actionFor(category: string | null): ActionKit {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lending') || c.includes('borrow')) {
    return {
      core: 'Supply $100–$500 of a major asset to the protocol and, if you want borrow exposure, borrow no more than 30% of what you supplied while keeping the health factor above 2. Do it in two tranches a week apart so the activity spans time instead of landing in one burst.',
      second: 'its borrow side: repay part of the loan, then borrow a small amount again the following week',
    };
  }
  if (c.includes('dex') || c.includes('swap') || c.includes('exchange')) {
    return {
      core: 'Swap $50–$200 through the protocol in two or three trades across different pairs, then provide $100–$300 of liquidity to its largest pool for at least two weeks. Keep each trade small enough that slippage stays under 0.5%.',
      second: 'its liquidity pools: add to a second pool on another chain the protocol runs on',
    };
  }
  if (c.includes('deriv') || c.includes('perp') || c.includes('options') || c.includes('synthetic')) {
    return {
      core: 'Open a small position of $50–$150 with no more than 2x leverage, hold it for at least a week, then close it and open a second one the other way. Never risk more than $100 on a single position while you are learning the interface.',
      second: 'its other markets: open one position in a second market with the same small size',
    };
  }
  if (c.includes('yield') || c.includes('vault') || c.includes('farm')) {
    return {
      core: 'Deposit $100–$300 into the protocol’s largest vault and leave it working for at least four weeks, then harvest or compound once and add a second deposit half the size of the first. Track the vault’s APY weekly so you notice if it collapses.',
      second: 'its other vaults: split a second deposit across a different strategy in the same protocol',
    };
  }
  if (c.includes('restak') || c.includes('liquid staking') || c.includes('staking')) {
    return {
      core: 'Stake $100–$300 through the protocol, keep the receipt token in your wallet, and use it once in a supported DeFi position (a lend or a liquidity pool) so your stake is visibly productive. Do not stake more than you can leave locked for a month.',
      second: 'its receipt token: use it in one more supported position instead of leaving it idle',
    };
  }
  if (c.includes('bridge') || c.includes('cross-chain')) {
    return {
      core: 'Bridge $50–$150 across the protocol to a second chain, then bridge a smaller amount back a week later. Use the protocol’s own interface both ways and keep each bridge under $200 until you trust its finality times.',
      second: 'a second route: bridge a different asset or to a different destination chain',
    };
  }
  if (c.includes('cdp') || c.includes('stablecoin') || c.includes('mint')) {
    return {
      core: 'Mint $50–$150 of the protocol’s stable asset against $200–$400 of collateral, hold it for two weeks, then repay half and mint again. Keep the collateral ratio comfortably above the protocol’s minimum so a dip cannot liquidate you.',
      second: 'its stability features: try the savings or redemption side with a small amount',
    };
  }
  return {
    core: 'Use the protocol’s core feature with $50–$200 in two separate sessions a week apart — one to open the position and one to adjust or close it — so the activity shows real use rather than a single click. Read the docs first and keep the first amount small.',
    second: 'its second feature: whatever the docs list after the main one, with the same small size',
  };
}

/**
 * Five concrete farm steps for one protocol. Each names what to do, what it
 * costs and how long it takes, and says the protocol records no token rather
 * than promising one: a token may never come, and the plan is worth doing
 * only with money the reader can afford to lose.
 */
export function farmSteps(p: SnapshotProtocol, age: number): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chain2 = p.chains.length > 1 ? (p.chains[1] as string) : null;
  const kit = actionFor(p.category);
  const steps: string[] = [];
  steps.push(
    `Set up a fresh wallet just for ${p.name} farming and fund it with about $150–$300 on ${chain} for gas plus a first position; gas here is ${gasNote(chain)}. Bookmark only the protocol’s official app and never paste a seed phrase anywhere. Time: about 30 minutes.`,
  );
  steps.push(kit.core);
  steps.push(
    'Come back once a week for 6–8 weeks and do one real action per visit — a supply, a swap, a repay or a rebalance of $25–$100 — varying the action each week. Steady use over two months reads very differently from a single afternoon of clicks.',
  );
  if (chain2 !== null) {
    steps.push(
      `Use a second chain the protocol runs on: try ${p.name} on ${chain2} as well, and ${kit.second}. Complete any official points or quests campaign the protocol itself runs, and save a screenshot and the date of each step.`,
    );
  } else {
    steps.push(
      `Use a second feature of the protocol: ${kit.second}. Complete any official points or quests campaign the protocol itself runs, and save a screenshot and the date of each step.`,
    );
  }
  steps.push(
    `Keep total exposure under $1,000 you can afford to lose, review every position weekly, and set a 90-day reminder: ${p.name} records no token today, so if one is ever announced, follow only the protocol’s own channels and never sign a blind token approval.`,
  );
  return steps;
}

// ---------------------------------------------------------------- the board

const BOARD_ROWS = 200;

/**
 * Build the board: every protocol that records no token (both gecko_id and
 * symbol null) is scored; the top BOARD_ROWS by implied value make the board,
 * with every watchlist slug force-included even if its score would have put
 * it below the cut. Ranks are 1..N by implied value, ties broken by slug so
 * two runs write identical bytes.
 */
export function buildBoard(snapshot: Snapshot): BoardResult {
  const multiples = categoryMultiples(snapshot.protocols);
  // Candidates are the protocols that record no token AND are not a wrapped,
  // staked or bridged product of a token that already trades: the snapshot
  // records no token for WBTC or USDT0, but neither is a launch still to come.
  const noToken = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null);
  const candidates = noToken.filter((p) => !isWrappedOrBridgedProduct(p));
  const ages = candidates.map((p) => ageDays(p.listed_at, snapshot.as_of)).filter((a): a is number => a !== null);
  const medianAge = ages.length > 0 ? Math.round(median(ages)) : 365;

  const scored = candidates.map((p) => {
    const s = scoreProtocol(p, multiples, snapshot.as_of, medianAge);
    const age = s.age_days ?? medianAge;
    return { ...s, age, farm: farmSteps(p, age) };
  });

  // TVL percentile among candidates, for the conviction display score.
  const tvls = [...scored].map((s) => s.tvl_usd).sort((a, b) => a - b);
  const tvlPercentile = (tvl: number): number => {
    let below = 0;
    for (const v of tvls) if (v < tvl) below++;
    return tvls.length > 1 ? below / (tvls.length - 1) : 1;
  };

  const byImplied = [...scored].sort((a, b) =>
    b.implied_value_usd !== a.implied_value_usd
      ? b.implied_value_usd - a.implied_value_usd
      : a.slug < b.slug
        ? -1
        : 1,
  );
  // Every watchlist slug is on the board, then the highest-valued other
  // pre-token protocols fill the board up to BOARD_ROWS.
  const watchlistSet = new Set(snapshot.watchlist);
  const watchRows = byImplied.filter((r) => watchlistSet.has(r.slug));
  const otherRows = byImplied.filter((r) => !watchlistSet.has(r.slug));
  const picked = [...watchRows, ...otherRows].slice(0, Math.min(BOARD_ROWS, byImplied.length));
  picked.sort((a, b) =>
    b.implied_value_usd !== a.implied_value_usd
      ? b.implied_value_usd - a.implied_value_usd
      : a.slug < b.slug
        ? -1
        : 1,
  );

  const rows: ScoredRow[] = picked.map((r, i) => ({
    slug: r.slug,
    name: r.name,
    rank: i + 1,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    age_days: r.age_days,
    watchlist: watchlistSet.has(r.slug),
    multiple: r.multiple,
    growth_factor: r.growth_factor,
    age_factor: r.age_factor,
    chain_factor: r.chain_factor,
    conviction: conviction(
      { slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null },
      tvlPercentile(r.tvl_usd),
      r.age,
    ),
  }));

  const totalImplied = rows.reduce((n, r) => n + r.implied_value_usd, 0);
  const stats: BoardStats = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    total_protocols: snapshot.protocols.length,
    no_token_protocols: noToken.length,
    candidates: candidates.length,
    watchlist_count: snapshot.watchlist.length,
    board_rows: rows.length,
    total_implied_usd: totalImplied,
    median_multiple: round4(multiples.get('__global__') as number),
    categories: new Set(snapshot.protocols.map((p) => p.category ?? '(uncategorised)')).size,
  };
  return { rows, stats };
}
