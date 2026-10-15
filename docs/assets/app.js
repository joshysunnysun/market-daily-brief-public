const query = new URLSearchParams(location.search);
const requestedDate = query.get('date');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/gu, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const sessionNames = {
  tw_pre: '台股盤前', tw_premarket: '台股盤前', tw_intraday: '台股盤中', tw_close: '台股盤後', us_pre: '美股盤前', us_close: '美股盤後',
};

function stat(item) {
  return `<article class="stat"><div class="label">${escapeHtml(item.label)}</div><div class="value ${escapeHtml(item.direction ?? '')}">${escapeHtml(item.value)}</div><div class="detail ${escapeHtml(item.direction ?? '')}">${escapeHtml(item.detail ?? '')}</div></article>`;
}

function renderStats(id, items) {
  document.querySelector(`#${id}`).innerHTML = items?.length ? items.map(stat).join('') : '<div class="empty-state">這個截點沒有可用數值。</div>';
}

function bars(items = []) {
  if (!items.length) return '<div class="empty-state">尚未累積可比較的量價資料。</div>';
  const max = Math.max(...items.map(item => Math.abs(Number(item.value))), 1);
  return items.map(item => {
    const value = Number(item.value);
    const direction = value >= 0 ? 'positive' : 'negative';
    const width = Math.max(2, Math.abs(value) / max * 48);
    const style = value >= 0 ? `margin-left:50%;width:${width}%` : `margin-left:${50 - width}%;width:${width}%`;
    const formatted = `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(item.name)}</span><span class="bar-track"><span class="bar ${direction}" style="${style}"></span></span><span class="bar-value ${direction}">${formatted}</span></div>`;
  }).join('');
}

function notes(items = []) {
  return items.length ? items.map(item => `<article class="note"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('') : '<div class="empty-state">本時段沒有新增重點。</div>';
}

function legacyMarket(report, key) {
  if (key === 'tw') {
    return {
      label: '台股', session: report.session ?? 'tw_intraday', updatedAt: report.generatedAt,
      dataQuality: '歷史格式：尚未拆分完整資金欄位', stats: report.marketStats ?? [], signals: [],
      rotation: report.rotation ?? [], notes: report.notes ?? [], decision: report.marketDecision ?? '', candidates: [],
      noCandidateReason: '這份歷史報告未包含候選股篩選資料。',
    };
  }
  return {
    label: '美股', session: 'us_close', updatedAt: report.generatedAt,
    dataQuality: '歷史格式：尚未建立獨立美股資料集',
    stats: [{ label: '資料狀態', value: '待建立', detail: '請查看較新的報告', direction: '' }], signals: [], rotation: [], notes: [],
    decision: '這份歷史報告只有台股主頁與全球市場背景，無法形成獨立美股判讀。', candidates: [],
    noCandidateReason: '缺少獨立美股量價、資金代理與財報資料。',
  };
}

function normalize(report) {
  return {
    ...report,
    overview: report.overview ?? { stats: report.marketStats ?? [], notes: report.notes ?? [], decision: report.marketDecision ?? '' },
    markets: report.markets ?? { tw: legacyMarket(report, 'tw'), us: legacyMarket(report, 'us') },
  };
}

function candidateCard(candidate) {
  const metrics = candidate.metrics.map(item => `<div class="candidate-metric"><span>${escapeHtml(item.label)}</span><strong class="${escapeHtml(item.direction ?? '')}">${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail ?? '')}</small></div>`).join('');
  return `<article class="candidate card">
    <div class="candidate-head"><div><span class="tag">${escapeHtml(candidate.stage)}</span><h3>${escapeHtml(candidate.ticker)} ${escapeHtml(candidate.name)}</h3><p>${escapeHtml(candidate.company)}</p></div><div class="score"><strong>${escapeHtml(candidate.score)}</strong><span>篩選分數</span></div></div>
    <p class="quality-line">資料品質：${escapeHtml(candidate.dataQuality)}</p><div class="candidate-metrics">${metrics}</div>
    <dl class="candidate-details"><div><dt>財報趨勢</dt><dd>${escapeHtml(candidate.financialTrend)}</dd></div><div><dt>基本面催化</dt><dd>${escapeHtml(candidate.catalyst)}</dd></div><div><dt>市場敘事</dt><dd>${escapeHtml(candidate.narrative)}</dd></div><div><dt>買進條件</dt><dd>${escapeHtml(candidate.entryCondition)}</dd></div><div><dt>失效條件</dt><dd>${escapeHtml(candidate.invalidation)}</dd></div><div><dt>停損</dt><dd>${escapeHtml(candidate.stopLoss)}</dd></div><div><dt>部位規畫</dt><dd>${escapeHtml(candidate.positionPlan)}</dd></div></dl>
  </article>`;
}

function renderCandidates(id, market) {
  document.querySelector(`#${id}`).innerHTML = market.candidates.length
    ? market.candidates.map(candidateCard).join('')
    : `<article class="empty-state candidate-empty"><strong>本次沒有合格候選</strong><p>${escapeHtml(market.noCandidateReason)}</p></article>`;
}

function renderMarket(key, market) {
  document.querySelector(`#${key}-quality`).textContent = `${sessionNames[market.session] ?? market.session}｜${market.updatedAt}｜${market.dataQuality}`;
  renderStats(`${key}-stats`, market.stats);
  renderStats(`${key}-signals`, market.signals ?? []);
  document.querySelector(`#${key}-rotation`).innerHTML = bars(market.rotation);
  document.querySelector(`#${key}-notes`).innerHTML = notes(market.notes);
  document.querySelector(`#${key}-decision`).innerHTML = `<strong>市場判讀：</strong>${escapeHtml(market.decision)}`;
  renderCandidates(`${key}-candidates`, market);
}

function render(rawReport, index) {
  const report = normalize(rawReport);
  document.title = `${report.date}｜市場日報`;
  document.querySelector('#report-meta').textContent = `${report.date}｜資料截點 ${report.generatedAt}｜${report.disclaimer}`;
  renderStats('market-stats', report.overview.stats);
  document.querySelector('#market-status').innerHTML = Object.entries(report.markets).map(([key, market]) => `<article class="market-status card"><div><span class="tag">${escapeHtml(sessionNames[market.session] ?? market.session)}</span><h2>${escapeHtml(market.label)}</h2></div><strong>${market.candidates.length} 檔候選</strong><p>${escapeHtml(market.dataQuality)}</p><button type="button" class="jump-link" data-target="${key}-market">查看市場頁</button></article>`).join('');
  document.querySelector('#overview-notes').innerHTML = notes(report.overview.notes);
  document.querySelector('#overview-decision').innerHTML = `<strong>跨市場判讀：</strong>${escapeHtml(report.overview.decision)}`;
  renderMarket('tw', report.markets.tw);
  renderMarket('us', report.markets.us);
  document.querySelector('#theme-list').innerHTML = (report.themes ?? []).map(item => `<article class="theme"><span class="tag">${escapeHtml(item.status)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('');
  document.querySelector('#archive-list').innerHTML = index.reports.map(item => `<div class="archive-item"><div><strong>${escapeHtml(item.date)}</strong><div class="muted">${escapeHtml(item.title)}</div></div><a href="?date=${encodeURIComponent(item.date)}">開啟</a></div>`).join('');
  document.querySelector('#source-links').innerHTML = report.sources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join(' · ');
  document.querySelectorAll('.jump-link').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.target)));
}

function activatePanel(panelId) {
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.panel === panelId; tab.classList[active ? 'add' : 'remove']('active'); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.panel').forEach(panel => { const active = panel.id === panelId; panel.hidden = !active; panel.classList[active ? 'add' : 'remove']('active'); });
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => activatePanel(button.dataset.panel)));

async function load() {
  const reportPath = requestedDate ? `reports/${encodeURIComponent(requestedDate)}.json` : 'reports/latest.json';
  const [reportResponse, indexResponse] = await Promise.all([fetch(reportPath), fetch('reports/index.json')]);
  if (!reportResponse.ok) throw new Error('找不到指定日期的報告');
  if (!indexResponse.ok) throw new Error('找不到歷史報告索引');
  render(await reportResponse.json(), await indexResponse.json());
}

load().catch(error => { document.querySelector('#report-meta').textContent = `報告暫時無法載入：${error.message}`; });
