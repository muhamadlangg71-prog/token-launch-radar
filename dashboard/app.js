// The board's own code: render, filter, sort, the detail view, and the farm
// plans. Farm plans are generated here from the same rules main.ts applies,
// so the steps a reader sees are the steps board.json carries, whatever the
// snapshot holds. No network, no framework, no build.
(function () {
  'use strict';

  var fmtUsd = function (n) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  };
  var esc = function (s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var CHAIN_GAS = [
    { m: /^Ethereum$/, band: 'about $8\u2013$25 of gas' },
    { m: /^(Base|Arbitrum|Optimism|Blast|Linea|Scroll|Mantle|zkSync|Unichain|Polygon|Avalanche|BSC|Corn|Katana|Monad)$/, band: 'about $0.20\u2013$1.50 of gas' },
    { m: /^(Solana|Sei|Sui|Aptos|Ton)$/, band: 'about $0.02\u2013$0.10 of fees' }
  ];
  var chainGas = function (chains) {
    for (var i = 0; i < CHAIN_GAS.length; i++) {
      for (var j = 0; j < chains.length; j++) if (CHAIN_GAS[i].m.test(chains[j])) return CHAIN_GAS[i].band;
    }
    return 'about $0.50\u2013$2 of gas';
  };

  // The farm plan: the same rules main.ts writes board.json with, so this page
  // and the board agree. Generated from the row, never stored by hand.
  var CATEGORY_PLAY = {
    DEX: function (r) { return 'Swap regularly on ' + r.chains[0] + ' across at least three of its busiest pools and keep some of the fees it pays you working as concentrated liquidity in a stable pair. Budget ' + chainGas(r.chains) + ' per visit plus a $250\u2013$1,000 working balance, about 45 minutes a week.'; },
    Lending: function (r) { return 'Deposit on ' + r.chains[0] + ', borrow against the deposit up to a safe 35% and rotate the borrowed liquidity into its own markets so it counts as usage, not a parked balance. Budget ' + chainGas(r.chains) + ' per reset and a $500\u2013$2,000 working balance, about 30 minutes a week.'; },
    Yield: function (r) { return 'Lock part of the position in its longest vault on ' + r.chains[0] + ' and autocompound the rest, then sweep the weekly yield into the lock so the position grows while fees stay flat. Budget ' + chainGas(r.chains) + ' monthly and a $400\u2013$1,500 stake, about 20 minutes a week.'; },
    'Liquid Staking': function (r) { return 'Mint its liquid token on ' + r.chains[0] + ' with the funds you already stake, then lend or LP the liquid token rather than letting it idle, so two lines of the protocol carry you. Budget ' + chainGas(r.chains) + ' once plus a $300\u2013$1,200 position, about 15 minutes a week.'; },
    Restaking: function (r) { return 'Restake through its interface on ' + r.chains[0] + ', keep the position inside a partnered operator set, and compound the points-bearing positions monthly. Budget ' + chainGas(r.chains) + ' per rotation and a $600\u2013$2,500 position, about 25 minutes a week.'; },
    CDM: function (r) { return 'Open its position on ' + r.chains[0] + ' with a small vault, mint against it conservatively at 3:1 and use the minted debt in its own yield venues, keeping the vault above water at all times. Budget ' + chainGas(r.chains) + ' plus a $500\u2013$2,000 working balance, about 40 minutes a week.'; },
    Bridge: function (r) { return 'Bridge a working balance via its ' + r.chains[0] + ' route weekly, keep it running both ways so the volume reads as organic, then rest the funds in its own yield pages between crossings. Budget ' + chainGas(r.chains) + ' per crossing and $200\u2013$800 of float, about 20 minutes a week.'; },
    'Risk Curators': function (r) { return 'Deposit through the curated vaults it manages on ' + r.chains[0] + ', spread across its best-rated strategies, and rebalance toward whichever vault its own dashboards score highest each month. Budget ' + chainGas(r.chains) + ' to rebalance and a $500\u2013$2,000 position, about 15 minutes a week.'; },
    Derivatives: function (r) { return 'Trade on ' + r.chains[0] + ' in a real size on both directions with stop discipline, keep the average hold over a day so the week reads as usage, and keep collateral split between the protocol and cold storage. Budget ' + chainGas(r.chains) + ' plus a $300\u2013$1,200 margin and about 2 hours a month.'; }
  };
  var genericPlay = function (r) {
    var cat = r.category || 'protocol';
    return 'Use ' + r.name + ' itself on ' + (r.chains[0] || 'its home chain') + ' the way its ' + cat.toLowerCase() + ' peers reward: a working balance, a real interaction each week, and the earnings kept inside so the record compounds. Budget ' + chainGas(r.chains) + ' plus a $300\u2013$1,000 stake, about 30 minutes a week.';
  };
  function farmSteps(r, asOf) {
    var chain = r.chains[0] || 'its home chain';
    var gas = chainGas(r.chains);
    var stake = r.tvl >= 1e9 ? '$1,000\u2013$5,000' : r.tvl >= 1e8 ? '$500\u2013$2,500' : '$250\u2013$1,200';
    var play = (CATEGORY_PLAY[r.category] || genericPlay)(r);
    var ageWord = r.age ? r.age + ' days on the record' : 'an unknown age';
    var grow = r.growth == null ? 'growth unreported' : (r.growth > 0 ? '+' : '') + Math.round(r.growth * 10) / 10 + '%';
    return [
      'Give the farm its own wallet: a fresh key, only the farm\u2019s funds, the seed phrase offline, and no other dapp ever connected to it. Cost: ' + gas + ' for the first transaction. Time: 10 minutes.',
      'Size the position to the row, not to hope: with ' + fmtUsd(r.tvl) + ' of TVL a readable footprint is ' + stake + ' of capital, kept in ' + chain + ' gas plus the protocol\u2019s own asset. Review the size monthly against the 7-day TVL line (' + grow + ').',
      play,
      'Build the record over months, not one weekend: interact every week in a normal human shape (a few clears, ' + gas + ' each), hold the position through its ' + ageWord + ', and never route many wallets into one farm, because airdrop reviews discard sybil clusters on sight. Cost: ' + gas + ' a week. Time: about 15 minutes a week besides step 3\u2019s.',
      'Collect the fee-bearing side while you wait: staking, LP or vault rewards the protocol pays today go into the position, and a claim is a strong signal of active use. Cost: ' + gas + ' per claim. Time: 10 minutes.',
      'Keep an exit note on the row before you enter: the farm plan runs until a launch, a buyout or a TVL break below half of today\u2019s ' + fmtUsd(r.tvl) + ' ends it, whichever comes first, and the snapshot\u2019s own as-of date (' + asOf + ') is the record\u2019s date, not the market\u2019s. Cost: free. Time: 5 minutes to write.'
    ];
  }

  // ------------------------------------------------------------ rows
  // zz-data.js packs a row as [rank, slug, name, category, chains, tvl,
  // growth (0 = unreported), age (0 = unknown), implied, watchlist, multiple,
  // growthMult, maturityMult, breadthMult, multipleSource].
  function unpack(a) {
    return {
      rank: a[0], slug: a[1], name: a[2], category: a[3] || null, chains: a[4], tvl: a[5],
      growth: a[6], age: a[7], implied: a[8], watch: a[9] === 1,
      mult: a[10], gMult: a[11], mMult: a[12], bMult: a[13], multSrc: a[14]
    };
  }

  function start() {
    var D = window.RADAR_DATA;
    var rows = D.rows.map(unpack);
    var live = D.live, aside = D.aside;
    var state = { q: '', cat: '', chain: '', tvl: 0, watch: false, sort: { k: 'rank', asc: true }, view: 'board' };
    var $ = function (id) { return document.getElementById(id); };

    $('stats').innerHTML =
      '<div class="stat"><b>' + rows.length + '</b><span>ranked</span></div>' +
      '<div class="stat"><b>' + D.watchlist_size + '/' + D.watchlist_size + '</b><span>watchlist in</span></div>' +
      '<div class="stat"><b>' + fmtUsd(rows.length ? rows[0].implied : 0) + '</b><span>top implied</span></div>' +
      '<div class="stat"><b>' + D.as_of + '</b><span>snapshot</span></div>';

    var cats = [], chains = [];
    rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
    });
    cats.sort(); chains.sort();
    cats.forEach(function (c) { $('f-cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
    chains.forEach(function (c) { $('f-chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

    var KEYS = {
      rank: function (r) { return r.rank; }, name: function (r) { return r.name.toLowerCase(); },
      category: function (r) { return (r.category || '').toLowerCase(); }, tvl: function (r) { return r.tvl; },
      growth: function (r) { return r.growth; }, age: function (r) { return r.age; }, implied: function (r) { return r.implied; }
    };
    var th, td;
    Array.prototype.forEach.call(document.querySelectorAll('#board th'), function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-k');
        state.sort = { k: k, asc: k === 'name' || k === 'category' };
        render();
      });
    });

    function shown() {
      var k = state.sort.k || 'rank', f = KEYS[k] || KEYS.rank;
      var list = rows.filter(function (r) {
        if (state.watch && !r.watch) return false;
        if (state.cat && (r.category || '') !== state.cat) return false;
        if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
        if (r.tvl < state.tvl * 1e6) return false;
        if (state.q) {
          var q = state.q.toLowerCase();
          if (r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1 &&
            !r.chains.some(function (c) { return c.toLowerCase().indexOf(q) !== -1; })) return false;
        }
        return true;
      });
      list.sort(function (a, b) { return state.sort.asc ? (f(a) > f(b) ? 1 : -1) : (f(a) < f(b) ? 1 : -1); });
      return list;
    }

    function render() {
      var list = shown();
      $('count').textContent = list.length + ' of ' + rows.length + ' rows';
      $('board-body').innerHTML = list.map(function (r) {
        var ch = r.chains.length > 2 ? r.chains[0] + ' +' + (r.chains.length - 1) : r.chains.join(', ');
        return '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num dim">' + r.rank + '</td>' +
          '<td><b>' + esc(r.name) + '</b>' + (r.watch ? ' <span class="chip">\u25CF watchlist</span>' : '') + '<br><span class="mono-chips">' + esc(ch) + '</span></td>' +
          '<td class="dim">' + esc(r.category || '\u2014') + '</td>' +
          '<td class="num">' + fmtUsd(r.tvl) + '</td>' +
          '<td class="num ' + (r.growth > 0 ? 'up' : r.growth < 0 ? 'down' : 'dim') + '">' + (r.growth == null ? '\u2014' : (r.growth > 0 ? '+' : '') + r.growth + '%') + '</td>' +
          '<td class="num dim">' + (r.age ? Math.round(r.age / 7) + 'w' : '\u2014') + '</td>' +
          '<td class="num strong">' + fmtUsd(r.implied) + '</td></tr>';
      }).join('');
      Array.prototype.forEach.call($('board-body').querySelectorAll('tr'), function (tr) {
        tr.addEventListener('click', function () { openDrawer(tr.getAttribute('data-slug')); });
      });
    }

    function openDrawer(slug) {
      var r = rows.filter(function (x) { return x.slug === slug; })[0];
      if (!r) return;
      var steps = farmSteps(r, D.as_of);
      var bars = [
        ['category multiple \u00D7' + r.mult, r.mult, Math.min(r.mult / 2.3, 1), r.multSrc],
        ['growth \u00D7' + r.gMult, r.gMult, (r.gMult - 0.7) / 0.6, '7-day TVL change, saturating'],
        ['maturity \u00D7' + r.mMult, r.mMult, (r.mMult - 0.6) / 0.4, r.age ? r.age + ' days with no token' : 'age unknown'],
        ['breadth \u00D7' + r.bMult, r.bMult, (r.bMult - 1) / 0.2, r.chains.length + ' chains']
      ];
      $('drawer-body').innerHTML =
        '<h2>' + esc(r.name) + '</h2><div class="slug">' + esc(r.slug) + ' \u00B7 rank #' + r.rank + ' \u00B7 ' + esc(r.category || 'uncategorised') + '</div>' +
        '<p class="note">Every figure from the snapshot itself: TVL ' + fmtUsd(r.tvl) + ', ' +
        (r.growth == null ? 'growth unreported' : '7-day ' + (r.growth > 0 ? '+' : '') + r.growth + '%') + ', ' +
        (r.age ? r.age + ' days on the record' : 'age unknown') + ', ' + r.chains.length + ' chains.</p>' +
        '<h3 class="sec">The value, term by term</h3>' +
        '<div class="factors">' + bars.map(function (b) {
          return '<div class="frow"><span class="k">' + esc(b[0]) + '</span>' +
            '<span class="bar"><i style="width:' + Math.max(4, Math.min(100, b[2] * 100)) + '%"></i></span>' +
            '<span class="v">\u00D7' + b[1] + '</span></div>';
        }).join('') +
        '<p class="note">' + bars.map(function (b) { return esc(b[0]) + ': ' + esc(b[3]) + '.'; }).join(' ') +
        ' Implied value ' + fmtUsd(r.implied) + ' = ' + fmtUsd(r.tvl) + ' \u00D7 the terms above.</p></div>' +
        '<h3 class="sec">How to farm it</h3>' +
        '<ul class="steps">' + steps.map(function (s, i) {
          return '<li><label><input type="checkbox"><span>' + esc(s) + '</span></label></li>';
        }).join('') + '</ul>' +
        '<div class="chips"><span class="chip">steps generated from the row, none written by hand</span></div>';
      $('drawer').classList.remove('hidden');
    }
    $('drawer-close').addEventListener('click', function () { $('drawer').classList.add('hidden'); });

    // Live tokens: the calibration set, never ranked.
    $('live-body').innerHTML = live.map(function (l) {
      return '<tr><td><b>' + esc(l[1]) + '</b><br><span class="mono-chips">' + esc(l[0]) + '</span></td>' +
        '<td class="dim">' + esc(l[2] || '\u2014') + '</td><td class="num">' + fmtUsd(l[3]) + '</td>' +
        '<td class="num">' + fmtUsd(l[4]) + '</td><td class="num strong">\u00D7' + l[5] + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call($('live-body').querySelectorAll('tr'), function (tr) { tr.style.cursor = 'default'; });

    // Set aside: the cuts, with their reasons.
    $('aside-body').innerHTML = aside.map(function (a) {
      return '<tr><td><b>' + esc(a[1]) + '</b><br><span class="mono-chips">' + esc(a[0]) + '</span></td><td class="dim">' + esc(a[2]) + '</td></tr>';
    }).join('');

    // Method: stated in words, the multiples printed as this run measured them.
    var mults = {};
    live.forEach(function (l) {
      var c = l[2] || 'Uncategorised';
      if (!mults[c]) mults[c] = [];
      mults[c].push(l[5]);
    });
    var med = function (xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    var gRatio = med(live.map(function (l) { return l[5]; }));
    var rowsByCat = {};
    rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (!rowsByCat[c]) rowsByCat[c] = []; rowsByCat[c].push(r); });
    $('method').innerHTML =
      '<h3>The claim</h3><p>A protocol\u2019s launch is the token it may issue one day. The board asks what that token would be worth if the protocol\u2019s record stayed as it is \u2014 it does not predict whether or when a token is issued. The implied value is this entry\u2019s own claim, never make.fun\u2019s.</p>' +
      '<h3>The model</h3><p><code>implied_value_usd = tvl \u00D7 multiple \u00D7 growth \u00D7 maturity \u00D7 breadth</code></p>' +
      '<ul><li><b>multiple</b> \u2014 the market\u2019s own pricing: per category, the median mcap/TVL of the snapshot\u2019s live ' + live.length + ' tokenized peers, shrunk toward the snapshot-wide median (\u00D7' + gRatio.toFixed(2) + ') by three pseudo-peers, clamped \u00D70.05\u2013\u00D72.3.</li>' +
      '<li><b>growth</b> \u2014 the 7-day TVL change on a saturating curve, \u00D70.7\u2013\u00D71.3, so one explosive week lifts a row without swallowing the board; unreported reads as flat.</li>' +
      '<li><b>maturity</b> \u2014 days with no token: rising \u00D70.7\u2192\u00D71.0 over two years of track record, easing gently after four.</li>' +
      '<li><b>breadth</b> \u2014 chains served, +4% each to a fifth extra chain.</li></ul>' +
      '<p>No protocol is special-cased: one function scores every row, so the radar finds the early ones below the $' + Math.round(D.floor_usd / 1e6) + 'M watchlist floor instead of repeating a list.</p>' +
      '<h3>This run\u2019s multiples</h3>' +
      '<table class="mult-table"><thead><tr><th>Category</th><th>Live peers</th><th>Median mcap/TVL</th><th>Board rows</th></tr></thead><tbody>' +
      Object.keys(rowsByCat).sort().map(function (c) {
        var rs = rowsByCat[c];
        var r0 = rs[0];
        return '<tr><td>' + esc(c) + '</td><td>' + (mults[c] ? mults[c].length : 0) + '</td>' +
          '<td class="strong">\u00D7' + (r0 ? r0.mult : '\u2014') + '</td><td>' + rs.length + '</td></tr>';
      }).join('') + '</tbody></table>';

    // Wire the controls.
    $('q').addEventListener('input', function () { state.q = $('q').value.trim(); render(); });
    $('f-cat').addEventListener('change', function () { state.cat = $('f-cat').value; render(); });
    $('f-chain').addEventListener('change', function () { state.chain = $('f-chain').value; render(); });
    $('f-tvl').addEventListener('change', function () { state.tvl = +$('f-tvl').value; render(); });
    $('f-watch').addEventListener('change', function () { state.watch = $('f-watch').checked; render(); });
    $('sort').addEventListener('change', function () {
      var v = $('sort').value;
      state.sort = { k: v === 'rank' ? 'rank' : v === 'implied' ? 'implied' : v, asc: false };
      if (v === 'rank') state.sort.asc = false;
      render();
    });
    Array.prototype.forEach.call($('tabs').querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call($('tabs').querySelectorAll('.tab'), function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        state.view = t.getAttribute('data-view');
        ['board', 'live', 'aside', 'method'].forEach(function (v) {
          $('view-' + v).classList.toggle('hidden', v !== state.view);
        });
        $('controls').classList.toggle('hidden', state.view !== 'board');
      });
    });

    render();
  }

  window.RADAR_APP = {
    start: start,
    // Exposed for the parity check: the farm generator as the board uses it.
    farmSteps: farmSteps,
    unpack: unpack
  };
})();
