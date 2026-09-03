#!/usr/bin/env node
// market-quote-cli：A股公开行情数据助手（个人/公开数据源封装，仅供参考，不构成投资建议）
// 用法: market-quote <quote|kline|ma|auth|status|unAuth> [code] [args]
const fetch = globalThis.fetch;

const UA = 'Mozilla/5.0';
const CONF = process.env.MARKET_QUOTE_CONF || require('os').tmpdir() + '/market-quote-conf.json';
const DEFAULTS = { source: 'eastmoney-public', ok: false };

function secid(code) { // 6xx->1. 0xx/3xx->0.
  return /^(6|9)/.test(code) ? '1.' + code : '0.' + code;
}

async function http(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function out(data, extra) { console.log(JSON.stringify(Object.assign({ code: 0, ok: true, ts: new Date().toISOString() }, extra, { data }))); }
function fail(msg) { console.error(JSON.stringify({ code: 1, ok: false, msg })); process.exit(1); }

async function cmdQuote(code) {
  if (!code) fail('usage: quote <code> e.g. quote 600519');
  const j = await http(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid(code)}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f171`);
  const d = j.data || fail('未找到该代码行情');
  const fmt = x => (x == null || x === '-') ? null : x / 100;
  out({
    code: d.f57, name: d.f58,
    price: fmt(d.f43), high: fmt(d.f44), low: fmt(d.f45), open: fmt(d.f46),
    prevClose: fmt(d.f60), change: fmt(d.f169), changePct: fmt(d.f170),
    source: 'eastmoney-public', note: '数据仅供参考，不构成投资建议'
  });
}

async function cmdKline(code, n) {
  if (!code) fail('usage: kline <code> [days=30]');
  n = Math.max(5, Math.min(250, parseInt(n || 30)));
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid(code)}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=${n}`;
  const j = await http(url);
  const d = j.data || fail('未找到K线');
  const rows = (d.klines || []).map(k => {
    const p = k.split(',');
    return { date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4], vol: +p[5] };
  });
  out({ code: d.code, name: d.name, days: rows.length, rows, source: 'eastmoney-public', note: '数据仅供参考，不构成投资建议' });
}

async function cmdMa(code, n) {
  if (!code) fail('usage: ma <code> [periods=5,10,20]');
  const periods = String(n || '5,10,20').split(',').map(x => parseInt(x)).filter(x => x > 0);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid(code)}&fields1=f1,f2&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=60`;
  const j = await http(url);
  const d = j.data || fail('未找到K线');
  const closes = (d.klines || []).map(k => +k.split(',')[2]);
  const last = {};
  for (const p of periods) {
    if (closes.length >= p) {
      const slice = closes.slice(-p);
      last['ma' + p] = +(slice.reduce((a, b) => a + b, 0) / p).toFixed(2);
    } else last['ma' + p] = null;
  }
  out({ code: d.code, name: d.name, closes: closes.length, last, note: '均线为纯计算指标，仅供参考' });
}

async function cmdAuth() {
  try {
    await http('https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f58');
    require('fs').writeFileSync(CONF, JSON.stringify(Object.assign(DEFAULTS, { ok: true, authed_at: new Date().toISOString() })));
    out({ authed: true, conf: CONF });
  } catch (e) { fail('数据源不可达: ' + e.message); }
}
function cmdStatus() {
  let st;
  try { st = JSON.parse(require('fs').readFileSync(CONF, 'utf8')); } catch (_) { st = Object.assign({}, DEFAULTS); }
  out({ source: st.source, authed: !!st.ok, conf: CONF, note: '公开数据源，无需密钥' });
}
function cmdUnAuth() {
  try { require('fs').unlinkSync(CONF); } catch (_) {}
  out({ unauthed: true });
}

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'quote') await cmdQuote(a);
    else if (cmd === 'kline') await cmdKline(a, b);
    else if (cmd === 'ma') await cmdMa(a, b);
    else if (cmd === 'auth') await cmdAuth();
    else if (cmd === 'status') cmdStatus();
    else if (cmd === 'unAuth') cmdUnAuth();
    else fail('usage: market-quote <quote|kline|ma|auth|status|unAuth> [code] [args]');
  } catch (e) { fail(e.message); }
})();
