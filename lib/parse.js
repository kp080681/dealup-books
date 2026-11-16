// Turns a plain-English line into a proposed ledger row.
// It only proposes. Kiran confirms, and it never decides a tax treatment:
// anything tax-related becomes a flag for the CA.

export const ACCOUNTS = ['HDFC', 'IOB', 'Director (personal)', 'Cash'];
export const CATEGORIES = [
  'Client receipt',
  'Performance marketing fees',
  'Ad spend (client)',
  'Salary',
  'Rent',
  'Software & subscriptions',
  'Professional fees',
  'GST payment',
  'TDS deposit',
  'Bank charges',
  'Travel',
  'Utilities',
  'Office expenses',
  'Director loan',
  'Transfer between accounts',
  'Other income',
  'Uncategorised',
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const monthIndex = (s) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)));
const pad = (n) => String(n).padStart(2, '0');

// Today's date in India, whatever the server's clock zone is.
export function todayIST(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// The most recent occurrence of a month that is not in the future.
function recentYearFor(monthIdx, today) {
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  return monthIdx + 1 <= tm ? ty : ty - 1;
}

function prevMonth(today) {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7)) - 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${pad(m)}`;
}

const CATEGORY_RULES = [
  [/\bpreethesh\b/i, 'Performance marketing fees'],
  [/\b(salary|salaries|wages|stipend)\b/i, 'Salary'],
  [/\brent\b/i, 'Rent'],
  [/\b(google ads?|meta ads?|facebook ads?|instagram ads?|ad spend|ads? budget|ad recharge)\b/i, 'Ad spend (client)'],
  [/\b(gst)\b/i, 'GST payment'],
  [/\b(tds)\b/i, 'TDS deposit'],
  [/\b(ca fees?|audit|auditor|professional fees?|legal|roc|filing fees?)\b/i, 'Professional fees'],
  [/\b(bank charges?|sms charges?|debit card fee|annual fee)\b/i, 'Bank charges'],
  [/\b(software|subscription|claude|chatgpt|canva|hosting|domain|vercel|neon|google workspace|zoho|adobe|trigger\.dev)\b/i, 'Software & subscriptions'],
  [/\b(travel|fuel|petrol|diesel|cab|uber|ola|flight|train|bus|hotel)\b/i, 'Travel'],
  [/\b(internet|wifi|broadband|phone bill|mobile bill|recharge|electricity|power bill)\b/i, 'Utilities'],
  [/\b(stationery|printing|courier|office)\b/i, 'Office expenses'],
];

const STOP = new Set(['for', 'from', 'via', 'by', 'on', 'in', 'into', 'through', 'as', 'towards', 'toward', 'to', 'of', 'the', 'a', 'an', 'and', 'with', 'using', 'against', 'was', 'is', 'today', 'yesterday', 'rs', 'inr', 'rupees', 'amount', 'payment', 'paid', 'received', 'client', 'month', 'bill', 'fees', 'fee', 'invoice']);

function titleCase(s) {
  return s.replace(/\b([a-z])([a-z.']*)/g, (_, a, b) => a.toUpperCase() + b);
}

function takeName(words) {
  const out = [];
  for (const w of words) {
    const clean = w.replace(/[.,;:]+$/g, '');
    if (!clean || STOP.has(clean.toLowerCase())) break;
    out.push(clean);
    if (out.length === 4) break;
  }
  return out.join(' ');
}

export function parseEntry(text, now = new Date()) {
  const today = todayIST(now);
  const source = String(text || '').trim();
  let w = ' ' + source.replace(/\s+/g, ' ') + ' ';
  const out = {
    entry_date: today, direction: '', amount: '', account: '', party: '',
    category: '', client: '', period_month: '', note: '', flags: [], question: '',
    source_text: source,
  };
  if (!source) { out.question = 'What was paid or received?'; return out; }
  const lower = source.toLowerCase();

  // Month the work relates to: "for September", "for Sept 2026", "for last month".
  const per = new RegExp(`\\bfor\\s+(?:the\\s+)?(?:month\\s+of\\s+)?${MON_RE}\\b\\.?(?:\\s+(20\\d\\d))?`, 'i').exec(w);
  if (per) {
    const mi = monthIndex(per[1]);
    const y = per[2] ? Number(per[2]) : recentYearFor(mi, today);
    out.period_month = `${y}-${pad(mi + 1)}`;
    w = w.replace(per[0], ' ');
  } else if (/\bfor\s+last\s+month\b/i.test(w)) {
    out.period_month = prevMonth(today);
    w = w.replace(/\bfor\s+last\s+month\b/i, ' ');
  } else if (/\bfor\s+this\s+month\b/i.test(w)) {
    out.period_month = today.slice(0, 7);
    w = w.replace(/\bfor\s+this\s+month\b/i, ' ');
  }

  // Date of the transaction.
  let m;
  if ((m = /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/.exec(w))) {
    const d = Number(m[1]); const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    if (validDate(y, mo, d)) { out.entry_date = `${y}-${pad(mo)}-${pad(d)}`; w = w.replace(m[0], ' '); }
  } else if ((m = new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b\\.?(?:,?\\s+(20\\d\\d))?`, 'i').exec(w))) {
    const mi = monthIndex(m[2]); const d = Number(m[1]);
    const y = m[3] ? Number(m[3]) : recentYearFor(mi, today);
    if (validDate(y, mi + 1, d)) { out.entry_date = `${y}-${pad(mi + 1)}-${pad(d)}`; w = w.replace(m[0], ' '); }
  } else if ((m = new RegExp(`\\b(?:on\\s+)?${MON_RE}\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`, 'i').exec(w))) {
    const mi = monthIndex(m[1]); const d = Number(m[2]);
    const y = m[3] ? Number(m[3]) : recentYearFor(mi, today);
    if (validDate(y, mi + 1, d)) { out.entry_date = `${y}-${pad(mi + 1)}-${pad(d)}`; w = w.replace(m[0], ' '); }
  } else if (/\byesterday\b/i.test(w)) {
    const t = new Date(Date.parse(today + 'T00:00:00Z') - 86400000);
    out.entry_date = t.toISOString().slice(0, 10);
    w = w.replace(/\byesterday\b/i, ' ');
  } else {
    w = w.replace(/\btoday\b/i, ' ');
  }

  // Account.
  const acct = [
    [/\b(?:from|via|through|by|in|into|to|using)?\s*(?:my\s+|the\s+)?hdfc(?:\s+(?:bank|account|a\/c))*\b/i, 'HDFC'],
    [/\b(?:from|via|through|by|in|into|to|using)?\s*(?:my\s+|the\s+)?iob(?:\s+(?:bank|account|a\/c|current account))*\b/i, 'IOB'],
    [/\b(?:from|by|out of)?\s*(?:my\s+)?(?:own\s+pocket|personal(?:\s+(?:account|card|upi|money))?|my\s+own(?:\s+money)?|director(?:'s)?(?:\s+(?:account|pocket|card))?)\b/i, 'Director (personal)'],
    [/\b(?:in|by|as)?\s*cash\b/i, 'Cash'],
  ];
  for (const [re, name] of acct) {
    const a = re.exec(w);
    if (a) { out.account = name; w = w.replace(a[0], ' '); break; }
  }

  // Direction.
  const paidRe = /\b(paid|pay|paying|sent|send|gave|transferred|transfer|spent|bought|purchased|debited|settled|deposited)\b/i;
  const recvRe = /\b(received|receive|got|credited|collected|came in|incoming)\b/i;
  const pi = paidRe.exec(w); const ri = recvRe.exec(w);
  if (pi && ri) out.direction = pi.index < ri.index ? 'paid' : 'received';
  else if (pi) out.direction = 'paid';
  else if (ri) out.direction = 'received';

  // Amount: prefer one written with a currency mark or a k/lakh suffix, else the largest number left.
  const cands = [];
  const amtRe = /(₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr|crores?)?(?![\w])/gi;
  let am;
  while ((am = amtRe.exec(w))) {
    let n = Number(am[2].replace(/,/g, ''));
    if (!isFinite(n)) continue;
    const suf = (am[3] || '').toLowerCase();
    if (suf === 'k') n *= 1e3; else if (suf.startsWith('l')) n *= 1e5; else if (suf.startsWith('c')) n *= 1e7;
    cands.push({ n, strong: Boolean(am[1] || am[3]), raw: am[0] });
  }
  if (cands.length) {
    const strong = cands.filter((c) => c.strong);
    const pick = (strong.length ? strong : cands).sort((a, b) => b.n - a.n)[0];
    out.amount = String(Math.round(pick.n * 100) / 100);
    w = w.replace(pick.raw, ' ');
  }

  // Client: "client Shresht" or "for client Shresht Eye Care".
  const cl = /\b(?:for\s+)?client\s+((?:[\w.&']+\s?){1,4})/i.exec(w);
  if (cl) {
    const name = takeName(cl[1].trim().split(' '));
    if (name) { out.client = titleCase(name); w = w.replace(cl[0], ' '); }
  }

  // Party: who was paid, or who paid us.
  const words = w.trim().split(/\s+/);
  const findAfter = (re) => {
    const i = words.findIndex((x) => re.test(x));
    return i >= 0 ? takeName(words.slice(i + 1)) : '';
  };
  let party = '';
  if (out.direction === 'received') party = findAfter(/^from$/i) || findAfter(recvRe);
  else party = findAfter(/^to$/i) || findAfter(paidRe);
  out.party = titleCase(party);

  // Category.
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(lower)) { out.category = cat; break; }
  }
  if (!out.category) out.category = out.direction === 'received' ? 'Client receipt' : 'Uncategorised';

  // What we know about DealUp.
  if (/\bpreethesh\b/i.test(lower)) {
    out.party = 'Preethesh';
    if (!out.direction) out.direction = 'paid';
    if (!out.account) { out.account = 'HDFC'; out.note = 'Account assumed HDFC (Preethesh is paid from HDFC).'; }
    if (!out.period_month) out.period_month = prevMonth(out.entry_date);
    const amt = Number(out.amount);
    if (amt > 0) {
      const extra = amt % 5000 === 0 ? `${amt / 5000} client(s) at ₹5,000 each.` : 'Not a multiple of ₹5,000 per client — check the amount.';
      out.note = [out.note, extra].filter(Boolean).join(' ');
    }
    out.flags.push('TDS at 2% on this payment is under review by the CA.');
  }
  if (out.account === 'Director (personal)') {
    out.flags.push('Paid personally by the director — CA to confirm how it is treated (director loan / reimbursement).');
  }
  if (out.direction === 'received' && out.category === 'Client receipt') {
    out.flags.push('Match this receipt to its invoice; CA to confirm the GST treatment.');
  }
  if (out.category === 'Uncategorised') {
    out.flags.push('Category not clear — pick one or leave for the CA.');
  }

  // One question, only when something essential is missing.
  if (!out.amount) out.question = 'What was the amount?';
  else if (!out.direction) out.question = 'Was this paid out or received?';
  else if (!out.account) out.question = 'Which account: HDFC, IOB, cash or paid personally?';
  else if (!out.party) out.question = out.direction === 'paid' ? 'Who was it paid to?' : 'Who paid it?';

  return out;
}
