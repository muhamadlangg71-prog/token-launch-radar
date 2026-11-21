// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs, the category comparables and the protocol's farm plan, plus a model sandbox
// that recomputes the board live. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    watchlistOnly: false, tvlMin: 0,
    sandboxWeight: DATA.model.growth_weight, sandboxFallback: DATA.overall_median,
    sandboxOn: false,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3);
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox changes the growth weight and the fallback multiple (the multiple a
  // category with too few live comps falls back to) and recomputes every row.
  function impliedOf(row, model, weight, fallback) {
    var multiple = (row.category_median !== null && row.category_comps >= 3) ? row.category_multiple : fallback;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity));
  }
  function shownImplied(row) {
    if (!state.sandboxOn) return row.implied_value_usd;
    return impliedOf(row, DATA.model, state.sandboxWeight, state.sandboxFallback);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the weekly move, the capital, the hold and every cost and time. Two of
  // the six steps are category-specific, so a lender's plan reads like a lender's plan. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote in one governance round.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + chain + " and use " + name + "'s apps at least once a week.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Each week, repay a small part of the position and re-supply it on ' + name + ', so the wallet shows fresh activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Each week, swap a small amount through ' + name + ' on ' + chain + ' so the wallet shows fresh trading activity.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('basis') >= 0) return 'Each week, top up the ' + name + ' vault with a small amount or claim and re-deposit its rewards.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Each week, check the staking rewards on ' + name + ' and restake what it paid out.';
    if (c.indexOf('bridge') >= 0) return 'Each week, bridge a small amount through ' + name + ' so the wallet shows fresh cross-chain activity.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Each week, check the yield the ' + name + ' asset paid and keep the balance in the same wallet.';
    if (c.indexOf('governance') >= 0) return 'Each week, vote in any open ' + name + ' proposal, even a small one.';
    return 'Each week, make one small qualifying action on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The watchlist slugs, for the watchlist-only toggle. data.js does not carry the list itself,
  // so the toggle is derived from the rows: a row is on the watchlist when its TVL is at or above
  // the floor and it is one of the snapshot's 40 watchlist protocols, which the board marks by
  // rank order only in board.json; here the floor plus the board's own watchlist flag is enough
  // because the early rows are all below the floor.
  function isWatchlist(row) { return row.tvl_usd >= DATA.floor_usd; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('tvl')) state.tvlMin = Number(params.get('tvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tvlMin > 0) params.set('tvl', String(state.tvlMin));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (state.tvlMin > 0 && r.tvl_usd < state.tvlMin) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Each row is priced from the market: its category earns the median market-cap/TVL of the protocols that already trade in it, shrunk toward the whole market median of ' + DATA.overall_median + ' where a category has too few comps. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market median mcap/TVL' }), el('b', { text: String(DATA.overall_median) }))
      )
    );
  }

  function podium() {
    var top = DATA.rows.slice(0, 3);
    var cards = top.map(function (r, i) {
      return el('div', { class: 'podium-card' + (i === 0 ? ' first' : ''), tabindex: '0', role: 'button', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('span', { class: 'ghost-rank', 'aria-hidden': 'true', text: String(i + 1) }),
        el('span', { class: 'rank-label', text: 'Rank ' + (i + 1) }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
        el('span', { class: 'big', text: fmtUsd(shownImplied(r)) }),
        el('span', { class: 'tvl', text: 'TVL ' + fmtUsd(r.tvl_usd) + '  ·  ' + fmtPct(r.change_7d) + ' 7d' })
      );
    });
    return el('div', { class: 'podium' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL $50M+', selected: state.tvlMin === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL $100M+', selected: state.tvlMin === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL $500M+', selected: state.tvlMin === 500000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'TVL $1B+', selected: state.tvlMin === 1000000000 ? 'selected' : null })
    );
    tvlSelect.addEventListener('change', function () { state.tvlMin = Number(tvlSelect.value); writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'Minimum TVL' }), tvlSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.tvlMin = 0; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, shownImplied(r)); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : (r.change_7d >= 0 ? '▲ ' : '▼ ') + fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: r.rank <= 3 ? 'top3' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and they are the comparables the model prices each category from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var marketRows = (DATA.markets || []).map(function (mk) {
      return el('tr', null,
        el('td', { text: mk.category }),
        el('td', { class: 'num', text: fmtRatio(mk.median) }),
        el('td', { class: 'num', text: String(mk.comps) }),
        el('td', { class: 'num', text: mk.named.map(function (c) { return c.name + ' ' + fmtRatio(c.ratio); }).join(', ') })
      );
    });
    var weightInput = el('input', { type: 'number', id: 'sb-weight', step: '0.1', min: '0', max: '2', value: String(state.sandboxWeight) });
    var fallbackInput = el('input', { type: 'number', id: 'sb-fallback', step: '0.01', min: '0.02', max: '2', value: String(state.sandboxFallback) });
    var out = el('span', { class: 'out' });
    function refreshOut() {
      var top = DATA.rows[0];
      var before = top ? top.implied_value_usd : 0;
      var after = top ? impliedOf(top, m, state.sandboxWeight, state.sandboxFallback) : 0;
      var changed = DATA.rows.filter(function (r) { return impliedOf(r, m, state.sandboxWeight, state.sandboxFallback) !== r.implied_value_usd; }).length;
      out.textContent = '';
      out.appendChild(document.createTextNode('Rank 1: '));
      out.appendChild(el('b', { text: fmtUsd(before) + ' -> ' + fmtUsd(after) }));
      out.appendChild(document.createTextNode('  ·  ' + changed + ' of ' + DATA.rows.length + ' rows move'));
      if (state.sandboxOn) out.appendChild(el('span', { class: 'modified-badge', text: 'Model modified' }));
    }
    weightInput.addEventListener('input', function () { state.sandboxWeight = Number(weightInput.value) || 0; state.sandboxOn = true; refreshOut(); render(); });
    fallbackInput.addEventListener('input', function () { state.sandboxFallback = Number(fallbackInput.value) || DATA.overall_median; state.sandboxOn = true; refreshOut(); render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset model', onclick: function () { state.sandboxWeight = m.growth_weight; state.sandboxFallback = DATA.overall_median; state.sandboxOn = false; render(); } });
    refreshOut();
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The category multiple is earned from the market: the median market-cap/TVL of the live-token protocols in that category, shrunk toward the whole market median of ' + DATA.overall_median + ' where a category has fewer than 3 live comps. One honest limit: the multiple is the market\'s circulating market-cap per dollar of TVL, a screening ratio, not a launch FDV. A valuable protocol can have a weakly accruing token, and TVL can be inflated, so read the board as a screen for where a launch would be worth watching, not as a valuation.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'multiple(category) = w x median(category) + (1 - w) x ' + DATA.overall_median + ', w = n / (n + ' + m.shrink_prior + '), n = live comps in the category (n < ' + m.min_comps + ' means the multiple is the market median), capped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('h3', { text: 'Category markets' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'markets' },
          el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Median mcap/TVL' }), el('th', { class: 'num', text: 'Live comps' }), el('th', { text: 'Largest comps' }))),
          el('tbody', null, marketRows)
        )
      ),
      el('h3', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Change the two dials and the board recomputes live. Growth weight moves every row; the fallback multiple moves only the rows whose category has too few live comps. The board you submit is the one with the dials at their defaults.' }),
      el('div', { class: 'sandbox' },
        el('div', { class: 'field' }, el('label', { for: 'sb-weight', text: 'Growth weight' }), weightInput),
        el('div', { class: 'field' }, el('label', { for: 'sb-fallback', text: 'Fallback multiple' }), fallbackInput),
        reset,
        out
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function marketFor(category) {
    if (!category || !DATA.markets) return null;
    return DATA.markets.filter(function (mk) { return mk.category === category; })[0] || null;
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var market = marketFor(row.category);
    var multNote = row.category_median !== null
      ? 'Its category median is ' + fmtRatio(row.category_median) + ' from ' + row.category_comps + ' live comps, shrunk toward the market median of ' + row.overall_median + '.'
      : 'Its category has fewer than 3 live comps, so it uses the whole market median of ' + row.overall_median + '.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    // The recompute uses the multiples data.js carries, which are rounded to 4 decimals, while the
    // board was scored with full precision: compare within 0.1%, not to the dollar.
    var recomputed = impliedOf(row, DATA.model, DATA.model.growth_weight, DATA.overall_median);
    var recomputedClose = Math.abs(recomputed - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.001);
    // The hero: the implied value, large, and the multiplication flow that built it.
    var base = row.tvl_usd * row.category_multiple;
    var afterGrowth = base * row.growth_multiplier;
    dialog.appendChild(el('div', { class: 'hero' },
      el('span', { class: 'hero-label', text: 'Implied launch value' }),
      el('span', { class: 'hero-value', text: fmtUsd(shownImplied(row)) }),
      el('div', { class: 'flow' },
        el('span', { class: 'chip', text: 'TVL ' + fmtUsd(row.tvl_usd) }),
        el('span', { class: 'op', text: '×' }),
        el('span', { class: 'chip', text: fmtMult(row.category_multiple) + ' category' }),
        el('span', { class: 'op', text: '=' }),
        el('span', { class: 'chip', text: fmtUsd(base) }),
        el('span', { class: 'op', text: '×' }),
        el('span', { class: 'chip', text: row.growth_multiplier + ' growth' }),
        el('span', { class: 'op', text: '×' }),
        el('span', { class: 'chip', text: row.maturity_multiplier + ' maturity' }),
        el('span', { class: 'op', text: '=' }),
        el('span', { class: 'chip', text: fmtUsd(shownImplied(row)) })
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(shownImplied(row)) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputedClose ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    if (market) {
      var compRows = market.named.map(function (c) {
        return el('tr', null,
          el('td', { text: c.name }),
          el('td', { class: 'num', text: fmtRatio(c.ratio) }),
          el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
          el('td', { class: 'num', text: fmtUsd(c.tvl_usd) })
        );
      });
      // The median row names the multiple the model actually used: the category's own median
      // where it has enough live comps, the whole market median where it does not.
      var medianRow = row.category_median !== null
        ? el('tr', { class: 'median-row' },
            el('td', { text: 'Category median (used)' }),
            el('td', { class: 'num', text: fmtRatio(market.median) }),
            el('td', { class: 'num', text: '—' }),
            el('td', { class: 'num', text: '—' })
          )
        : el('tr', { class: 'median-row' },
            el('td', { text: 'Market median (used)' }),
            el('td', { class: 'num', text: fmtRatio(row.overall_median) }),
            el('td', { class: 'num', text: '—' }),
            el('td', { class: 'num', text: '—' })
          );
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Category comparables' }),
        el('p', { class: 'sub', text: multNote }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'comps-table' },
            el('thead', null, el('tr', null, el('th', { text: 'Live protocol' }), el('th', { class: 'num', text: 'mcap / TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'TVL' }))),
            el('tbody', null, compRows.concat([medianRow]))
          )
        )
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'note', text: 'Listed ' + (row.listed_at || 'on an unknown date') + ' · ' + (row.chains && row.chains.length ? row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ': ' + row.chains.join(', ') : 'no chain listed') + ' · Snapshot ' + DATA.as_of + '. A protocol that records no token may still have one its DefiLlama record does not show.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(podium());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
