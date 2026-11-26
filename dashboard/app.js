// Token Launch Radar — page logic.
//
// The page reads window.RADAR (written by main.ts beside this page) and never
// fetches anything, so it renders with no network. The model it shows is the
// one main.ts ran: implied = TVL x categoryMultiple x growth x age x chains,
// and every row carries its factors so the detail view can show the working.
//
//   implied = TVL x categoryMultiple x growthFactor x ageFactor x chainFactor
//   categoryMultiple: median mcap/TVL of the tokenized protocols in the same
//     category (>= 5, else the global median), clamped to [0.02, 2.00]
//   growthFactor: 1 + clamp(change_7d, -20, +20) / 100
//   ageFactor: 0.80 + 0.20 x min(ageDays / 365, 1)
//   chainFactor: 1 + 0.05 x min(chains - 1, 4)
//   implied is clamped to [TVL x 0.01, TVL x 3] and rounded to whole dollars.
// Rank is set by implied value alone; conviction is display only.

(function () {
  'use strict';

  var data = window.RADAR;
  var rowsEl = document.getElementById('rows');
  if (!data || !Array.isArray(data.rows)) {
    rowsEl.innerHTML = '<tr><td colspan="9" class="empty">No board data loaded.</td></tr>';
    return;
  }
  var rows = data.rows;
  var state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1, selected: null };

  function moneyShort(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function moneyFull(v) {
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return s;
  }
  function ageFmt(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // ---- stats strip -------------------------------------------------------
  var s = data.stats || {};
  function setText(id, value) {
    var n = document.getElementById(id);
    if (n) n.textContent = value;
  }
  setText('stat-asof', data.as_of || '—');
  setText('stat-scanned', (s.total_protocols || 0).toLocaleString('en-US'));
  setText('stat-notoken', (s.candidates || 0).toLocaleString('en-US'));
  setText('stat-watchlist', (s.watchlist_count || 0).toLocaleString('en-US'));
  setText('stat-rows', (s.board_rows || rows.length).toLocaleString('en-US'));
  setText('stat-implied', moneyShort(s.total_implied_usd || 0));
  setText('stat-multiple', (s.median_multiple !== undefined ? s.median_multiple.toFixed(2) + 'x' : '—'));
  setText('excluded-count', (s.no_token_protocols || 0) + ' protocols record no token; ' + (s.candidates || 0) + ' remain after this cut.');

  // ---- filter controls ---------------------------------------------------
  var catSel = document.getElementById('cat');
  var chainSel = document.getElementById('chain');
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
    (r.chains || []).forEach(function (c) {
      if (chains.indexOf(c) === -1) chains.push(c);
    });
  });
  cats.sort();
  chains.sort();
  cats.forEach(function (c) { catSel.appendChild(el('option', null, c)); });
  chains.forEach(function (c) { chainSel.appendChild(el('option', null, c)); });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortValue(r, key) {
    var v = r[key];
    if (v === null || v === undefined) return key === 'name' || key === 'category' ? '' : -Infinity;
    return v;
  }
  function sorted(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, key);
      var vb = sortValue(b, key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  // ---- board -------------------------------------------------------------
  function render() {
    var list = sorted(filtered());
    rowsEl.textContent = '';
    if (list.length === 0) {
      var tr = el('tr');
      var td = el('td', 'empty', 'No protocols match this filter. Clear the search or the filters to see the whole board.');
      td.colSpan = 9;
      tr.appendChild(td);
      rowsEl.appendChild(tr);
    }
    list.forEach(function (r) {
      var tr = el('tr');
      if (state.selected === r.slug) tr.className = 'selected';
      tr.appendChild(el('td', 'rank', '#' + r.rank));
      var nameTd = el('td');
      nameTd.appendChild(el('span', 'name', r.name));
      nameTd.appendChild(el('span', 'slug', ' ' + r.slug));
      if (r.watchlist) nameTd.appendChild(el('span', 'badge', 'WATCHLIST'));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', 'mut', r.category || '—'));
      tr.appendChild(el('td', 'mut', (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '')));
      tr.appendChild(el('td', 'num', moneyShort(r.tvl_usd)));
      var ch = el('td', 'num ' + (r.change_7d === null ? 'mut' : r.change_7d >= 0 ? 'pos' : 'neg'), pct(r.change_7d));
      tr.appendChild(ch);
      tr.appendChild(el('td', 'num', ageFmt(r.age_days)));
      tr.appendChild(el('td', 'num', moneyShort(r.implied_value_usd)));
      tr.appendChild(el('td', 'num', ''));
      var conv = el('span', 'conv', String(r.conviction));
      tr.lastChild.appendChild(conv);
      tr.addEventListener('click', function () { openDetail(r.slug); });
      rowsEl.appendChild(tr);
    });
    setText('count', 'Showing ' + list.length + ' of ' + rows.length + ' rows');
    document.querySelectorAll('#board thead th').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  // ---- detail view -------------------------------------------------------
  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.selected = slug;
    setText('d-name', '#' + r.rank + ' — ' + r.name);
    setText('d-meta',
      (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') +
      ' · TVL ' + moneyFull(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) +
      ' · listed ' + ageFmt(r.age_days) + ' ago' + (r.watchlist ? ' · on the watchlist' : ''));
    setText('d-implied', moneyFull(r.implied_value_usd));
    var bd = document.getElementById('d-breakdown');
    bd.textContent = '';
    var base = r.tvl_usd * r.multiple;
    var items = [
      ['TVL', moneyFull(r.tvl_usd)],
      ['Category multiple (' + (r.category || 'uncategorised') + ')', r.multiple.toFixed(2) + 'x → base ' + moneyShort(base)],
      ['Growth factor (7d ' + pct(r.change_7d) + ')', 'x' + r.growth_factor.toFixed(2)],
      ['Age factor (' + ageFmt(r.age_days) + ' listed)', 'x' + r.age_factor.toFixed(2)],
      ['Chain factor (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')', 'x' + r.chain_factor.toFixed(2)],
      ['Conviction (display only)', r.conviction + ' / 100'],
    ];
    items.forEach(function (it) {
      var div = el('div');
      div.appendChild(el('dt', null, it[0]));
      div.appendChild(el('dd', null, it[1]));
      bd.appendChild(div);
    });
    var bar = el('div', 'bar');
    var fill = el('i');
    fill.style.width = r.conviction + '%';
    bar.appendChild(fill);
    bd.appendChild(bar);
    setText('d-token', r.name + ' records no token in the snapshot (no CoinGecko id, no ticker). That is the snapshot’s record, not proof it has none — and a token, if one is ever issued, may not come at all.');
    var steps = document.getElementById('d-steps');
    steps.textContent = '';
    (r.farm_steps || []).forEach(function (step) {
      steps.appendChild(el('li', null, step));
    });
    document.getElementById('detail').hidden = false;
    render();
    // In a focused deep link the detail is already at the top of the page,
    // so there is nothing to scroll to; a click from the board scrolls to it.
    if (!document.body.classList.contains('detail-focus')) {
      document.getElementById('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    if (history.replaceState) history.replaceState(null, '', '#detail=' + encodeURIComponent(slug));
  }

  document.getElementById('detail-close').addEventListener('click', function () {
    document.getElementById('detail').hidden = true;
    document.body.classList.remove('detail-focus');
    state.selected = null;
    render();
    if (history.replaceState) history.replaceState(null, '', '#');
  });

  // ---- controls wiring ---------------------------------------------------
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('watch-only').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
  document.getElementById('sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    state.dir = (state.sort === 'rank' || state.sort === 'name' || state.sort === 'category') ? 1 : -1;
    render();
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) {
        state.dir = -state.dir;
      } else {
        state.sort = key;
        state.dir = (key === 'rank' || key === 'name' || key === 'category') ? 1 : -1;
      }
      var sel = document.getElementById('sort');
      if (sel.querySelector('option[value="' + key + '"]')) sel.value = key;
      render();
    });
  });

  // ---- deep links: #detail=<slug> and #watchlist -------------------------
  (function () {
    var hash = (location.hash || '').slice(1);
    var m = hash.match(/^detail=(.+)$/);
    if (m) {
      // Focus the page on this protocol's detail (the board stays one click away).
      document.body.classList.add('detail-focus');
      render();
      openDetail(decodeURIComponent(m[1]));
      return;
    }
    if (hash === 'watchlist') {
      state.watch = true;
      document.getElementById('watch-only').checked = true;
    }
    render();
  })();
})();
