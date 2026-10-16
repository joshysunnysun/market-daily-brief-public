const query = new URLSearchParams(location.search);
const requestedDate = query.get('date');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const sessionNames = { tw_pre: '台股盤前', tw_premarket: '台股盤前', tw_intraday: '台股盤中', tw_close: '台股盤後', us_pre: '美股盤前', us_close: '美股盤後' };
const glossary = {
  '三大法人': '外資、投信與自營商的正式買賣超分類。',
  '外資': '外國及陸資投資人的正式買賣超。',
  '投信': '本地證券投資信託基金的正式買賣超。',
  '自營商': '證券商自有資金與避險部位的正式買賣超。',
  '融資': '投資人向券商借款買股；餘額增加不必然代表看多正確。',
  '融券': '投資人向券商借股賣出；須與價格及回補壓力一起看。',
  '借券': '股票借貸餘額，包含避險、交割與放空等多種用途。',
  'MOPS': '公開資訊觀測站，台灣上市櫃公司的正式申報平台。',
  'YoY': '與去年同期相比的年增率。',
  'MoM': '與上個月相比的月增率。',
  'ETF': '在交易所買賣、追蹤一籃子資產的基金。',
  'EPS': '每股盈餘，用來觀察公司獲利能力。',
  'P/E': '本益比，股價相對每股盈餘的估值倍數。',
};
let currentStocks = [];
let stocksByTicker = new Map();
let activeSuggestion = -1;

function tooltip(text, tip, extraClass = '') {
  return `<span class="glossary ${extraClass}" tabindex="0" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(`${text}：${tip}`)}">${escapeHtml(text)}</span>`;
}

function explained(text) {
  const tips = Object.entries(glossary).filter(([term]) => String(text).includes(term)).map(([, tip]) => tip);
  return tips.length ? tooltip(text, tips.join(' ')) : escapeHtml(text);
}

function stockButton(stock, label = `${stock.ticker} ${stock.name}`) {
  const tip = `股票代碼 ${stock.ticker}，${stock.exchange || (stock.market === 'tw' ? '台灣市場' : '美國市場')}；點擊開啟完整證據。`;
  return `<button type="button" class="stock-trigger glossary" data-stock="${escapeHtml(stock.ticker)}" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(`${label}：${tip}`)}">${escapeHtml(label)}</button>`;
}

function stat(item) {
  return `<article class="stat"><div class="label">${explained(item.label)}</div><div class="value ${escapeHtml(item.direction ?? '')}">${escapeHtml(item.value)}</div><div class="detail ${escapeHtml(item.direction ?? '')}">${escapeHtml(item.detail ?? '')}</div></article>`;
}

function renderStats(id, items) {
  const element = document.querySelector(`#${id}`);
  if (element) element.innerHTML = items?.length ? items.map(stat).join('') : '<div class="empty-state">這個截點沒有可用數值。</div>';
}

function tickerFrom(item) {
  if (item.ticker && stocksByTicker.has(String(item.ticker))) return String(item.ticker);
  const token = String(item.name ?? '').trim().split(/\s+/u)[0];
  return stocksByTicker.has(token) ? token : null;
}

function bars(items = []) {
  if (!items.length) return '<div class="empty-state">尚未累積可比較的量價資料。</div>';
  const max = Math.max(...items.map(item => Math.abs(Number(item.value))), 1);
  return items.map(item => {
    const value = Number(item.value);
    const direction = value >= 0 ? 'positive' : 'negative';
    const width = Math.max(2, Math.abs(value) / max * 48);
    const style = value >= 0 ? `margin-left:50%;width:${width}%` : `margin-left:${50 - width}%;width:${width}%`;
    const ticker = tickerFrom(item);
    const label = ticker ? stockButton(stocksByTicker.get(ticker), item.name) : escapeHtml(item.name);
    return `<div class="bar-row"><span class="bar-label">${label}</span><span class="bar-track"><span class="bar ${direction}" style="${style}"></span></span><span class="bar-value ${direction}">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span></div>`;
  }).join('');
}

function notes(items = []) {
  return items.length ? items.map(item => `<article class="note"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('') : '<div class="empty-state">本時段沒有新增重點。</div>';
}

function missingBlock(detail = '這份報告尚未包含此欄位。') {
  return { status: 'missing', detail };
}

function legacyMarket(report, key) {
  if (key === 'tw') return { label: '台股', session: report.session ?? 'tw_intraday', updatedAt: report.generatedAt, dataQuality: '歷史格式：可查看既有盤面資料，明細證據尚未完整', stats: report.marketStats ?? [], signals: [], rotation: report.rotation ?? [], notes: report.notes ?? [], decision: report.marketDecision ?? '', candidates: [], noCandidateReason: '這份歷史報告未包含完整篩選資料。' };
  return { label: '美股', session: 'us_close', updatedAt: report.generatedAt, dataQuality: '歷史格式：尚未建立獨立美股資料集', stats: [{ label: '資料狀態', value: '待建立', detail: '請查看較新的報告', direction: '' }], signals: [], rotation: [], notes: [], decision: '這份歷史報告沒有獨立美股判讀。', candidates: [], noCandidateReason: '缺少獨立美股資料。' };
}

function legacyStocks(report) {
  const result = new Map();
  for (const [marketKey, market] of Object.entries(report.markets)) {
    for (const item of [...(market.rotation ?? []), ...(market.candidates ?? [])]) {
      const first = String(item.ticker ?? item.name ?? '').trim().split(/\s+/u)[0];
      if (!/^(?:\d{4}|[A-Z]{1,6})$/u.test(first)) continue;
      const name = item.name && item.ticker ? item.name : String(item.name ?? first).replace(new RegExp(`^${first}\\s*`, 'u'), '') || first;
      const key = `${marketKey}:${first}`;
      if (!result.has(key)) result.set(key, {
        ticker: first, symbol: first, name, market: marketKey, exchange: marketKey === 'tw' ? 'TWSE／TPEx' : 'US', company: item.company ?? '歷史報告未提供公司說明',
        price: Number.isFinite(item.value) ? { status: 'available', value: null, returns: { d1: item.value }, source: '歷史排行' } : missingBlock(),
        institutional: missingBlock('歷史報告未保存多日法人資料'), margin: missingBlock('歷史報告未保存融資資料'), lending: missingBlock('歷史報告未保存借券資料'),
        financials: missingBlock('歷史報告未保存財報資料'), themes: [], catalysts: [],
        screening: { eligible: false, reason: '歷史資料不足，不列入候選', checks: [{ label: '完整證據', status: 'missing', detail: '請查看較新的報告' }] },
      });
    }
  }
  return [...result.values()];
}

function normalize(report) {
  const markets = report.markets ?? { tw: legacyMarket(report, 'tw'), us: legacyMarket(report, 'us') };
  const normalized = { ...report, overview: report.overview ?? { stats: report.marketStats ?? [], notes: report.notes ?? [], decision: report.marketDecision ?? '' }, markets };
  normalized.stocks = Array.isArray(report.stocks) && report.stocks.length ? report.stocks : legacyStocks(normalized);
  return normalized;
}

function statusLabel(status) {
  return ({ available: '已取得', insufficient: '資料不足', missing: '未取得', not_applicable: '不適用', pass: '通過', fail: '未通過' })[status] ?? status ?? '未知';
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '資料不足';
}

function formatPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number > 0 ? '+' : ''}${number.toFixed(2)}%` : '資料不足';
}

function detailItem(label, value, detail = '') {
  return `<div class="evidence-item"><dt>${explained(label)}</dt><dd>${escapeHtml(value)}</dd>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
}

function institutionalEvidence(stock, periods) {
  if (stock.market !== 'tw') return `<section class="dialog-section"><h3>機構活動</h3><p class="quality-line">不適用台灣三大法人分類；美股機構代理尚待可驗證來源，不以空值代替。</p></section>`;
  const rows = [3, 5, 10, 20].map(period => `<tr><th>${period} 日</th><td>${formatNumber(periods[period]?.foreign)}</td><td>${formatNumber(periods[period]?.trust)}</td><td>${formatNumber(periods[period]?.dealer)}</td></tr>`).join('');
  return `<section class="dialog-section"><h3>${explained('三大法人')}近 3／5／10／20 日</h3><div class="table-wrap"><table><thead><tr><th>期間</th><th>${explained('外資')}</th><th>${explained('投信')}</th><th>${explained('自營商')}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="quality-line">${escapeHtml(stock.institutional?.detail ?? `${statusLabel(stock.institutional?.status)} · ${stock.institutional?.source ?? ''}`)}</p></section>`;
}

function positionEvidence(stock) {
  if (stock.market !== 'tw') return `<section class="dialog-section"><h3>融資、融券與借券</h3><p class="quality-line">美股不適用台灣的融資融券與借券餘額制度；此處不是資料抓取失敗。</p></section>`;
  return `<section class="dialog-section two-up"><div><h3>${explained('融資')}／${explained('融券')}</h3><dl class="evidence-grid">${detailItem('狀態', statusLabel(stock.margin?.status), stock.margin?.detail)}${detailItem('餘額', formatNumber(stock.margin?.balance), stock.margin?.asOf)}</dl></div><div><h3>${explained('借券')}</h3><dl class="evidence-grid">${detailItem('狀態', statusLabel(stock.lending?.status), stock.lending?.detail)}${detailItem('餘額', formatNumber(stock.lending?.balance), stock.lending?.asOf)}</dl></div></section>`;
}

function financialEvidence(stock) {
  const financials = stock.financials ?? missingBlock();
  if (stock.market === 'us' && !Number.isFinite(financials.revenue)) return `<section class="dialog-section"><h3>財報與營收</h3><dl class="evidence-grid">${detailItem('資料狀態', statusLabel(financials.status), financials.detail)}${detailItem('SEC 最新申報', financials.filingForm ?? financials.period ?? '資料不足', financials.asOf)}${detailItem('申報日期', financials.filedAt ?? '資料不足')}${detailItem('營收 YoY', '數值端點未取得')}</dl></section>`;
  const label = stock.market === 'tw' ? 'MOPS 月營收' : financials.source?.startsWith('Nasdaq') ? 'Nasdaq 財務摘要營收' : 'SEC 申報營收';
  const value = stock.market === 'tw' ? financials.monthlyRevenue : financials.revenue;
  return `<section class="dialog-section"><h3>財報與營收</h3><dl class="evidence-grid">${detailItem('資料狀態', statusLabel(financials.status), financials.detail)}${detailItem(label, formatNumber(value), financials.asOf)}${detailItem('YoY', formatPct(financials.yoyPct))}${stock.market === 'tw' ? detailItem('MoM', formatPct(financials.momPct)) : detailItem('申報期', financials.period ?? '資料不足', financials.filedAt)}</dl></section>`;
}

function discoveryEvidence(stock) {
  const item = stock.discovery;
  if (!item) return '';
  return `<section class="dialog-section"><div class="section-heading compact"><h3>每日資金流目標</h3><span class="status-chip ${escapeHtml(item.direction)}">${escapeHtml(item.label)}</span></div><dl class="evidence-grid">${detailItem('1 日法人合計', formatNumber(item.netFlow1d), item.asOf)}${detailItem(`${item.periodDays} 日法人合計`, formatNumber(item.netFlow), `${item.source} 正式買賣超`)}</dl><p class="quality-line">依官方資料自動加入觀察名單，不代表買賣建議。</p></section>`;
}

function stockDialogContent(stock) {
  const price = stock.price ?? missingBlock();
  const periods = stock.institutional?.periods ?? {};
  const returns = price.returns ?? {};
  const checks = stock.screening?.checks ?? [];
  return `
    <p class="company-line">${escapeHtml(stock.company)} · ${escapeHtml(stock.exchange)}</p>
    ${discoveryEvidence(stock)}
    <section class="dialog-section"><h3>價格</h3><dl class="evidence-grid">${detailItem('最新價格', price.status === 'available' ? `${formatNumber(price.value)} ${price.currency ?? ''}` : statusLabel(price.status), price.source ?? price.detail)}${detailItem('1 日', formatPct(returns.d1))}${detailItem('5 日', formatPct(returns.d5))}${detailItem('20 日', formatPct(returns.d20))}</dl></section>
    ${institutionalEvidence(stock, periods)}
    ${positionEvidence(stock)}
    ${financialEvidence(stock)}
    <section class="dialog-section two-up"><div><h3>題材</h3><p>${escapeHtml(stock.themes?.join('、') || '資料不足')}</p></div><div><h3>催化劑</h3><p>${escapeHtml(stock.catalysts?.join('；') || '尚無已核對來源與日期的催化劑')}</p></div></section>
    <section class="dialog-section"><div class="section-heading compact"><h3>候選條件</h3><span class="status-chip ${stock.screening?.eligible ? 'pass' : 'missing'}">${stock.screening?.eligible ? '合格' : '不列入候選'}</span></div><div class="check-list">${checks.map(check => `<div class="check-row"><span class="check-dot ${escapeHtml(check.status)}"></span><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.detail)}</span></div>`).join('') || '<p>這份歷史報告沒有完整條件。</p>'}</div></section>`;
}

function openStock(ticker) {
  const stock = stocksByTicker.get(String(ticker));
  if (!stock) return;
  const title = document.querySelector('#stock-dialog-title');
  const body = document.querySelector('#stock-dialog-body');
  const dialog = document.querySelector('#stock-dialog');
  if (!title || !body || !dialog) return;
  title.textContent = `${stock.ticker} ${stock.name}`;
  body.innerHTML = stockDialogContent(stock);
  bindGlossary();
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
}

function watchlist(stocks) {
  if (!stocks.length) return '<div class="empty-state">這份報告沒有可展開的股票。</div>';
  return stocks.map(stock => {
    const change = stock.price?.returns?.d1;
    const direction = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
    const discovery = stock.discovery ? `<span class="status-chip ${escapeHtml(stock.discovery.direction)}">${escapeHtml(stock.discovery.label)} · ${stock.discovery.periodDays} 日</span>` : '';
    return `<article class="watch-card"><div><span class="market-pill">${escapeHtml(stock.exchange)}</span>${stockButton(stock)}</div><strong class="watch-price">${stock.price?.status === 'available' ? formatNumber(stock.price.value) : '資料不足'}</strong><span class="${direction}">${formatPct(change)}</span>${discovery}<span class="status-chip ${stock.screening?.eligible ? 'pass' : 'missing'}">${stock.screening?.eligible ? '候選合格' : '查看缺口'}</span></article>`;
  }).join('');
}

function candidateCard(candidate) {
  const stock = stocksByTicker.get(String(candidate.ticker));
  const metrics = (candidate.metrics ?? []).map(item => `<div class="candidate-metric"><span>${explained(item.label)}</span><strong class="${escapeHtml(item.direction ?? '')}">${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail ?? '')}</small></div>`).join('');
  return `<article class="candidate card"><div class="candidate-head"><div><span class="tag">${escapeHtml(candidate.stage)}</span><h3>${stock ? stockButton(stock) : escapeHtml(`${candidate.ticker} ${candidate.name}`)}</h3><p>${escapeHtml(candidate.company)}</p></div><div class="score"><strong>${escapeHtml(candidate.score)}</strong><span>篩選分數</span></div></div><p class="quality-line">資料品質：${escapeHtml(candidate.dataQuality)}</p><div class="candidate-metrics">${metrics}</div><dl class="candidate-details"><div><dt>財報趨勢</dt><dd>${escapeHtml(candidate.financialTrend)}</dd></div><div><dt>基本面催化</dt><dd>${escapeHtml(candidate.catalyst)}</dd></div><div><dt>市場敘事</dt><dd>${escapeHtml(candidate.narrative)}</dd></div><div><dt>買進條件</dt><dd>${escapeHtml(candidate.entryCondition)}</dd></div><div><dt>失效條件</dt><dd>${escapeHtml(candidate.invalidation)}</dd></div><div><dt>停損</dt><dd>${escapeHtml(candidate.stopLoss)}</dd></div><div><dt>部位規畫</dt><dd>${escapeHtml(candidate.positionPlan)}</dd></div></dl></article>`;
}

function renderCandidates(id, market) {
  const element = document.querySelector(`#${id}`);
  if (element) element.innerHTML = market.candidates.length ? market.candidates.map(candidateCard).join('') : `<article class="empty-state candidate-empty"><strong>本次沒有合格候選</strong><p>${escapeHtml(market.noCandidateReason)}</p></article>`;
}

function renderMarket(key, market) {
  const quality = document.querySelector(`#${key}-quality`);
  if (quality) quality.textContent = `${sessionNames[market.session] ?? market.session}｜${market.updatedAt}｜${market.dataQuality}`;
  renderStats(`${key}-stats`, market.stats); renderStats(`${key}-signals`, market.signals ?? []);
  document.querySelector(`#${key}-rotation`).innerHTML = bars(market.rotation);
  document.querySelector(`#${key}-notes`).innerHTML = notes(market.notes);
  document.querySelector(`#${key}-decision`).innerHTML = `<strong>市場判讀：</strong>${escapeHtml(market.decision)}`;
  document.querySelector(`#${key}-watchlist`).innerHTML = watchlist(currentStocks.filter(stock => stock.market === key));
  renderCandidates(`${key}-candidates`, market);
}

function bindStockTriggers() {
  document.querySelectorAll('.stock-trigger').forEach(button => button.addEventListener('click', () => openStock(button.dataset.stock)));
}

function bindGlossary() {
  document.querySelectorAll('.glossary').forEach(element => {
    if (element.dataset.longPressBound) return;
    element.dataset.longPressBound = 'true';
    let timer;
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    element.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') return; timer = setTimeout(() => element.classList.add('tip-open'), 550); });
    element.addEventListener('pointerup', cancel); element.addEventListener('pointercancel', cancel);
    element.addEventListener('blur', () => element.classList.remove('tip-open'));
  });
}

function render(rawReport, index) {
  const report = normalize(rawReport);
  currentStocks = report.stocks;
  stocksByTicker = new Map(currentStocks.map(stock => [String(stock.ticker), stock]));
  document.title = `${report.date}｜市場日報`;
  document.querySelector('#report-meta').textContent = `${report.date}｜資料截點 ${report.generatedAt}｜${report.disclaimer}`;
  renderStats('market-stats', report.overview.stats);
  document.querySelector('#market-status').innerHTML = Object.entries(report.markets).map(([key, market]) => `<article class="market-status card"><div><span class="tag">${escapeHtml(sessionNames[market.session] ?? market.session)}</span><h2>${escapeHtml(market.label)}</h2></div><strong>${market.candidates.length} 檔候選</strong><p>${escapeHtml(market.dataQuality)}</p><button type="button" class="jump-link" data-target="${key}-market">查看市場與名單</button></article>`).join('');
  document.querySelector('#overview-notes').innerHTML = notes(report.overview.notes);
  document.querySelector('#overview-decision').innerHTML = `<strong>跨市場判讀</strong><p>${escapeHtml(report.overview.decision)}</p>`;
  renderMarket('tw', report.markets.tw); renderMarket('us', report.markets.us);
  document.querySelector('#theme-list').innerHTML = (report.themes ?? []).map(theme => `<article class="theme"><span class="tag">${escapeHtml(theme.status)}</span><h3>${escapeHtml(theme.name)}</h3><p>${escapeHtml(theme.text)}</p></article>`).join('') || '<div class="empty-state">本次沒有新增題材。</div>';
  document.querySelector('#archive-list').innerHTML = index.reports.map(item => `<div class="archive-item"><div><strong>${escapeHtml(item.date)}</strong><div class="muted">${escapeHtml(item.title)}</div></div><a href="?date=${encodeURIComponent(item.date)}">開啟</a></div>`).join('');
  document.querySelector('#source-links').innerHTML = report.sources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join(' · ');
  document.querySelectorAll('.jump-link').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.target)));
  bindStockTriggers(); bindGlossary(); renderSearch('');
}

function activatePanel(panelId) {
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.panel === panelId; tab.classList[active ? 'add' : 'remove']('active'); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.panel').forEach(panel => { const active = panel.id === panelId; panel.hidden = !active; panel.classList[active ? 'add' : 'remove']('active'); });
}

function matchingStocks(value) {
  const needle = String(value).trim().toLocaleLowerCase('zh-Hant');
  if (!needle) return currentStocks.slice(0, 8);
  return currentStocks.filter(stock => `${stock.ticker} ${stock.symbol} ${stock.name} ${stock.company}`.toLocaleLowerCase('zh-Hant').includes(needle)).slice(0, 8);
}

function renderSearch(value) {
  const input = document.querySelector('#stock-search');
  const results = document.querySelector('#search-results');
  if (!input || !results) return;
  const matches = matchingStocks(value);
  activeSuggestion = Math.min(activeSuggestion, matches.length - 1);
  results.innerHTML = matches.map((stock, index) => `<button type="button" role="option" class="search-option ${index === activeSuggestion ? 'active' : ''}" data-stock="${escapeHtml(stock.ticker)}" aria-selected="${index === activeSuggestion}"><span><strong>${escapeHtml(stock.ticker)}</strong> ${escapeHtml(stock.name)}</span><small>${escapeHtml(stock.exchange)} · ${stock.market === 'tw' ? '台股' : '美股'}</small></button>`).join('');
  results.hidden = !value || !matches.length;
  input.setAttribute('aria-expanded', String(!results.hidden));
  results.querySelectorAll?.('.search-option').forEach(button => button.addEventListener('click', () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); openStock(button.dataset.stock); }));
}

function setupSearch() {
  const input = document.querySelector('#stock-search');
  const results = document.querySelector('#search-results');
  if (!input?.addEventListener || !results) return;
  input.addEventListener('input', () => { activeSuggestion = -1; renderSearch(input.value); });
  input.addEventListener('focus', () => renderSearch(input.value));
  input.addEventListener('keydown', event => {
    const matches = matchingStocks(input.value);
    if (event.key === 'ArrowDown') { event.preventDefault(); activeSuggestion = Math.min(activeSuggestion + 1, matches.length - 1); renderSearch(input.value); }
    if (event.key === 'ArrowUp') { event.preventDefault(); activeSuggestion = Math.max(activeSuggestion - 1, 0); renderSearch(input.value); }
    if (event.key === 'Enter' && matches[activeSuggestion]) { event.preventDefault(); results.hidden = true; openStock(matches[activeSuggestion].ticker); }
    if (event.key === 'Escape') { results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  });
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.panel)));
const closeButton = document.querySelector('.dialog-close');
if (closeButton?.addEventListener) closeButton.addEventListener('click', () => document.querySelector('#stock-dialog').close?.());
setupSearch();

async function load() {
  const reportPath = requestedDate ? `reports/${encodeURIComponent(requestedDate)}.json` : 'reports/latest.json';
  const [reportResponse, indexResponse] = await Promise.all([fetch(reportPath), fetch('reports/index.json')]);
  if (!reportResponse.ok) throw new Error('找不到指定日期的報告');
  if (!indexResponse.ok) throw new Error('找不到歷史報告索引');
  render(await reportResponse.json(), await indexResponse.json());
}

load().catch(error => { document.querySelector('#report-meta').textContent = `報告暫時無法載入：${error.message}`; });
