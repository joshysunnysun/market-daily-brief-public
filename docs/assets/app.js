const qp = new URLSearchParams(location.search);
const requestedDate = qp.get('date');
const pct = value => `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
const stat = ({label, value, detail, direction = ''}) => `<article class="stat"><div class="label">${label}</div><div class="value ${direction}">${value}</div><div class="detail ${direction}">${detail}</div></article>`;
function bars(items) {
  const max = Math.max(...items.map(item => Math.abs(item.value)), 1);
  return items.map(item => {
    const direction = item.value >= 0 ? 'positive' : 'negative';
    const width = Math.max(2, Math.abs(item.value) / max * 48);
    const style = item.value >= 0 ? `margin-left:50%;width:${width}%` : `margin-left:${50 - width}%;width:${width}%`;
    return `<div class="bar-row"><span class="bar-label">${item.name}</span><span class="bar-track"><span class="bar ${direction}" style="${style}"></span></span><span class="bar-value ${direction}">${pct(item.value)}</span></div>`;
  }).join('');
}
function render(report, index) {
  document.title = `${report.date}｜市場日報`;
  document.querySelector('#report-meta').textContent = `${report.date}｜資料截點 ${report.generatedAt}｜${report.disclaimer}`;
  document.querySelector('#market-stats').innerHTML = report.marketStats.map(stat).join('');
  document.querySelector('#rotation-bars').innerHTML = bars(report.rotation);
  document.querySelector('#market-notes').innerHTML = report.notes.map(n => `<article class="note"><h3>${n.title}</h3><p>${n.text}</p></article>`).join('');
  document.querySelector('#market-decision').innerHTML = `<strong>今日判讀：</strong>${report.marketDecision}`;
  document.querySelector('#theme-list').innerHTML = report.themes.map(t => `<article class="theme"><span class="tag">${t.status}</span><h3>${t.name}</h3><p>${t.text}</p></article>`).join('');
  document.querySelector('#archive-list').innerHTML = index.reports.map(item => `<div class="archive-item"><div><strong>${item.date}</strong><div class="muted">${item.title}</div></div><a href="/?date=${item.date}">開啟</a></div>`).join('');
  document.querySelector('#source-links').innerHTML = report.sources.map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${s.label}</a>`).join(' · ');
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('.panel').forEach(el => { el.hidden = true; el.classList.remove('active'); });
  button.classList.add('active'); button.setAttribute('aria-selected', 'true');
  const panel = document.getElementById(button.dataset.panel); panel.hidden = false; panel.classList.add('active');
}));
async function load() {
  const path = requestedDate ? `/reports/${requestedDate}.json` : '/reports/latest.json';
  const [reportResponse, indexResponse] = await Promise.all([fetch(path), fetch('/reports/index.json')]);
  if (!reportResponse.ok) throw new Error('找不到指定日期的報告');
  render(await reportResponse.json(), await indexResponse.json());
}
load().catch(error => document.querySelector('#report-meta').textContent = `報告暫時無法載入：${error.message}`);
