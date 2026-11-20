// DealUp's compliance calendar.
//
// Turns the company profile into the list of things due in one financial year
// (April to March). It's pure: no database, no clock, so it can be tested.
//
// These are the standard due dates. The government often extends them, so every
// item can be given a new date (with a reason) on the Compliance page. The app
// never decides whether something applies in a grey case: it says "ask the CA".

const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(isoDate, n) {
  const t = Date.parse(isoDate + 'T00:00:00Z') + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
// The month after y-m, as [year, month].
const nextMonth = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const monthLabel = (y, m) => `${MONTH[m - 1]} ${y}`;
const shortMonth = (y, m) => `${MON[m - 1]} ${y}`;

// The financial year a date falls in, named by its starting year (2026 = FY 2026-27).
export function fyOf(isoDate) {
  const y = Number(isoDate.slice(0, 4)); const m = Number(isoDate.slice(5, 7));
  return m >= 4 ? y : y - 1;
}
export const fyLabel = (fy) => `FY ${fy}-${String(fy + 1).slice(2)}`;
export const fyRange = (fy) => [iso(fy, 4, 1), iso(fy + 1, 3, 31)];

// The 12 months of a financial year, April first.
function fyMonths(fy) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    out.push([m >= 4 ? fy : fy + 1, m]);
  }
  return out;
}

export const PROFILE_DEFAULTS = {
  legal_name: '', cin: '', pan: '', tan: '', gstin: '', address: '', state: 'Karnataka',
  incorporation_date: '', first_fy_end: '', small_company: true,
  gst_registered: true, gst_scheme: 'monthly', exports_lut: false,
  deducts_tds: true, pt_registered: false, director_loans: false, msme_vendors: false,
  advance_tax: false, dir_kyc_last_fy: '', tracking_from: '',
  ca_name: '', ca_email: '', reminder_emails: '',
  phone: '', business_email: '', lut_number: '', invoice_prefix: 'DU/INV',
  bank_name: '', bank_account: '', bank_ifsc: '', bank_swift: '', bank_branch: '',
};

// GSTR-3B for quarterly (QRMP) filers is due on the 22nd or the 24th depending on the state.
const GST_22 = new Set(['Chhattisgarh', 'Madhya Pradesh', 'Gujarat', 'Maharashtra', 'Karnataka', 'Goa', 'Kerala',
  'Tamil Nadu', 'Telangana', 'Andhra Pradesh', 'Daman and Diu', 'Dadra and Nagar Haveli', 'Puducherry',
  'Andaman and Nicobar Islands', 'Lakshadweep']);

const TDS_LESSON = 'If TDS that should have been deducted is not deducted and paid on time, part of that expense can be disallowed in the tax return, and interest runs on the late amount.';

/**
 * Every compliance item for one financial year.
 * @param {object} profile  company profile (see PROFILE_DEFAULTS)
 * @param {number} fy       starting year: 2026 means April 2026 to March 2027
 * @param {object} [done]   map of item key -> date it was done (some due dates follow from it, e.g. AOC-4 after the AGM)
 * @returns {Array<{key,title,plain,due,owner,area,period,optional?,after?}>} sorted by due date
 */
export function buildCalendar(profileIn, fy, done = {}) {
  const p = { ...PROFILE_DEFAULTS, ...(profileIn || {}) };
  const items = [];
  const add = (it) => items.push({ owner: 'me', optional: false, ...it });

  // ---------- TDS ----------
  if (p.deducts_tds) {
    for (const [y, m] of fyMonths(fy)) {
      const [ny, nm] = nextMonth(y, m);
      const due = m === 3 ? iso(ny, 4, 30) : iso(ny, nm, 7);
      add({
        key: `tds-pay:${y}-${pad(m)}`, area: 'TDS', period: `${y}-${pad(m)}`, due,
        title: `Pay TDS for ${shortMonth(y, m)}`,
        plain: `Pay the TDS you deducted in ${monthLabel(y, m)} (on contractor, professional-fee or rent payments) through the income-tax portal, using the company's TAN. If nothing was deducted, mark it done and say so in the note. ${TDS_LESSON}`,
        tdsMonth: `${y}-${pad(m)}`,
      });
    }
    const quarters = [
      ['Q1', 'April–June', iso(fy, 7, 31)],
      ['Q2', 'July–September', iso(fy, 10, 31)],
      ['Q3', 'October–December', iso(fy + 1, 1, 31)],
      ['Q4', 'January–March', iso(fy + 1, 5, 31)],
    ];
    for (const [qn, months, due] of quarters) {
      add({
        key: `tds-return:${fy}-${qn}`, area: 'TDS', period: `${fy}-${qn}`, due, owner: 'ca',
        title: `TDS return, ${qn} (${months})`,
        plain: `The quarterly TDS return for ${months}. Under the Income-tax Act 2025 the non-salary return is Form 140 (it used to be 26Q). Send the CA the list of payments where TDS was deducted.`,
      });
    }
  }

  // ---------- GST ----------
  if (p.gst_registered) {
    if (p.gst_scheme === 'qrmp') {
      const day3b = GST_22.has(p.state) ? 22 : 24;
      const qEnds = [[fy, 6], [fy, 9], [fy, 12], [fy + 1, 3]];
      for (const [y, m] of fyMonths(fy)) {
        const [ny, nm] = nextMonth(y, m);
        const quarterEnd = qEnds.some(([qy, qm]) => qy === y && qm === m);
        if (quarterEnd) {
          add({
            key: `gstr1:${y}-${pad(m)}`, area: 'GST', period: `${y}-${pad(m)}`, due: iso(ny, nm, 13), owner: 'ca',
            title: `GSTR-1 for the quarter ending ${shortMonth(y, m)}`,
            plain: 'The quarterly return of sales invoices. Send the CA every invoice raised in the quarter.',
          });
          add({
            key: `gstr3b:${y}-${pad(m)}`, area: 'GST', period: `${y}-${pad(m)}`, due: iso(ny, nm, day3b), owner: 'ca',
            title: `GSTR-3B and GST payment, quarter ending ${shortMonth(y, m)}`,
            plain: 'The quarterly summary return; any GST still owed for the quarter is paid with it.',
          });
        } else {
          add({
            key: `gst-pmt06:${y}-${pad(m)}`, area: 'GST', period: `${y}-${pad(m)}`, due: iso(ny, nm, 25), owner: 'ca',
            title: `GST monthly payment (PMT-06) for ${shortMonth(y, m)}`,
            plain: `Under the quarterly scheme, GST for ${monthLabel(y, m)} is still paid monthly, by the 25th.`,
          });
        }
      }
    } else {
      for (const [y, m] of fyMonths(fy)) {
        const [ny, nm] = nextMonth(y, m);
        add({
          key: `gstr1:${y}-${pad(m)}`, area: 'GST', period: `${y}-${pad(m)}`, due: iso(ny, nm, 11), owner: 'ca',
          title: `GSTR-1 for ${shortMonth(y, m)}`,
          plain: `The return of sales invoices for ${monthLabel(y, m)}. Send the CA every invoice raised that month.`,
        });
        add({
          key: `gstr3b:${y}-${pad(m)}`, area: 'GST', period: `${y}-${pad(m)}`, due: iso(ny, nm, 20), owner: 'ca',
          title: `GSTR-3B and GST payment for ${shortMonth(y, m)}`,
          plain: `The monthly summary return; the GST owed for ${monthLabel(y, m)} is paid with it. Interest on late GST is 18% a year.`,
        });
      }
    }
    add({
      key: `gstr9:${fy}`, area: 'GST', period: String(fy), due: iso(fy + 1, 12, 31), owner: 'ca', optional: true,
      title: `GST annual return (GSTR-9), ${fyLabel(fy)}`,
      plain: 'The yearly GST return. It is optional below ₹2 crore turnover. Ask the CA whether to file it.',
    });
    if (p.exports_lut) {
      add({
        key: `lut:${fy + 1}`, area: 'GST', period: String(fy + 1), due: iso(fy + 1, 3, 31), owner: 'ca',
        title: `Renew the LUT for ${fyLabel(fy + 1)}`,
        plain: 'The Letter of Undertaking lets you invoice export clients without charging GST. It lasts one financial year, so file the new one before 1 April.',
      });
    }
  }

  // ---------- Professional tax (Karnataka) ----------
  if (p.pt_registered) {
    for (const [y, m] of fyMonths(fy)) {
      const [ny, nm] = nextMonth(y, m);
      add({
        key: `pt:${y}-${pad(m)}`, area: 'Professional tax', period: `${y}-${pad(m)}`, due: iso(ny, nm, 20),
        title: `Pay professional tax for ${shortMonth(y, m)}`,
        plain: `Pay the professional tax deducted from ${monthLabel(y, m)} salaries, by the 20th.`,
      });
    }
  }

  // ---------- Income tax ----------
  if (p.advance_tax) {
    [[6, '15%'], [9, '45%'], [12, '75%'], [3, '100%']].forEach(([m, share]) => {
      const y = m === 3 ? fy + 1 : fy;
      add({
        key: `advance-tax:${y}-${pad(m)}`, area: 'Income tax', period: `${y}-${pad(m)}`, due: iso(y, m, 15), owner: 'ca',
        title: `Advance tax instalment (${share} of the year's tax)`,
        plain: 'Only if the company expects a tax bill for the year. With a loss, there is nothing to pay. Ask the CA.',
      });
    });
  }
  add({
    key: `itr:${fy}`, area: 'Income tax', period: String(fy), due: iso(fy + 1, 10, 31), owner: 'ca',
    title: `Company income-tax return for ${fyLabel(fy)}`,
    plain: 'The CA files it. Make sure the books for the year are closed and shared well before. Keep the acknowledgement in Documents.',
  });

  // ---------- Company law (ROC) ----------
  const first = p.first_fy_end && fyOf(p.first_fy_end) === fy;
  const agmKey = `agm:${fy}`;
  const agmDue = first ? iso(fy + 1, 12, 31) : iso(fy + 1, 9, 30);
  add({
    key: agmKey, area: 'Company law', period: String(fy), due: agmDue, owner: 'me',
    title: `${first ? 'First ' : ''}AGM to adopt the ${fyLabel(fy)} accounts`,
    plain: first
      ? 'The first annual general meeting must be held within 9 months of the end of the first financial year. The audited accounts are adopted there and the auditor is appointed for 5 years. Mark it done with the date it was held: the ROC filings below count from that date.'
      : 'The annual general meeting must be held within 6 months of the year end. The audited accounts are adopted there. Mark it done with the date it was held: the ROC filings below count from that date.',
  });
  const agmHeld = done[agmKey] || null;
  const agmBase = agmHeld || agmDue;
  const after = agmHeld ? 'the AGM' : 'the AGM due date';
  add({
    key: `aoc4:${fy}`, area: 'Company law', period: String(fy), due: addDays(agmBase, 30), owner: 'ca', after: agmKey,
    title: `AOC-4: file the ${fyLabel(fy)} accounts with the ROC`,
    plain: `Due within 30 days of ${after}.`,
  });
  add({
    key: `mgt7:${fy}`, area: 'Company law', period: String(fy), due: addDays(agmBase, 60), owner: 'ca', after: agmKey,
    title: `${p.small_company ? 'MGT-7A' : 'MGT-7'}: annual return, ${fyLabel(fy)}`,
    plain: `Due within 60 days of ${after}.${p.small_company ? ' Small companies use the shorter MGT-7A.' : ''}`,
  });
  if (first) {
    add({
      key: `adt1:${fy}`, area: 'Company law', period: String(fy), due: addDays(agmBase, 15), owner: 'ca', after: agmKey,
      title: 'ADT-1: tell the ROC who the auditor is for the next 5 years',
      plain: `Due within 15 days of ${after}, where the auditor is appointed for 5 years.`,
    });
  }
  // Board meetings: a small company needs one in each half of the calendar year (90+ days apart); others need 4 a year.
  const boardDues = p.small_company
    ? [[iso(fy, 6, 30), 'January–June'], [iso(fy, 12, 31), 'July–December']]
    : [[iso(fy, 6, 30), 'April–June'], [iso(fy, 9, 30), 'July–September'], [iso(fy, 12, 31), 'October–December'], [iso(fy + 1, 3, 31), 'January–March']];
  for (const [due, span] of boardDues) {
    add({
      key: `board:${due.slice(0, 7)}`, area: 'Company law', period: due.slice(0, 7), due,
      title: `Board meeting (${span})`,
      plain: p.small_company
        ? 'A small company must hold at least one board meeting in each half of the calendar year, at least 90 days apart. Keep the signed minutes in Documents.'
        : 'Hold at least four board meetings a year, with no more than 120 days between two. Keep the signed minutes in Documents.',
    });
  }
  if (p.director_loans) {
    add({
      key: `dpt3:${fy}`, area: 'Company law', period: String(fy), due: iso(fy + 1, 6, 30), owner: 'ca',
      title: `DPT-3: report loans to the company, as of 31 March ${fy + 1}`,
      plain: 'The company has money from a director (director loan). DPT-3 reports outstanding loans and similar money each year, by 30 June.',
    });
  }
  if (p.msme_vendors) {
    add({
      key: `msme1:${fy}-H1`, area: 'Company law', period: `${fy}-H1`, due: iso(fy, 10, 31), owner: 'ca',
      title: 'MSME-1 for April–September',
      plain: 'Only if a registered MSME supplier was owed money for more than 45 days in the half-year.',
    });
    add({
      key: `msme1:${fy}-H2`, area: 'Company law', period: `${fy}-H2`, due: iso(fy + 1, 4, 30), owner: 'ca',
      title: 'MSME-1 for October–March',
      plain: 'Only if a registered MSME supplier was owed money for more than 45 days in the half-year.',
    });
  }
  // Director KYC: once every three financial years, by 30 June (from 31 March 2026).
  const kycLast = Number(p.dir_kyc_last_fy);
  const kycDueFy = kycLast ? kycLast + 3 : null;
  if (!kycLast || kycDueFy === fy) {
    add({
      key: `dir3kyc:${fy}`, area: 'Company law', period: String(fy), due: iso(fy, 6, 30), owner: 'ca',
      title: 'Director KYC (DIR-3 KYC)',
      plain: kycLast
        ? 'Each director files KYC once every three financial years, by 30 June. A change of phone, email or address must be filed within 30 days at any time.'
        : 'Each director files KYC once every three financial years, by 30 June. Add the year it was last filed in Company details so this shows only when due.',
    });
  }
  if (p.incorporation_date && fyOf(p.incorporation_date) === fy) {
    add({
      key: 'inc20a', area: 'Company law', period: String(fy), due: addDays(p.incorporation_date, 180), owner: 'ca',
      title: 'INC-20A: declare that business has started',
      plain: 'Due within 180 days of incorporation, after the share capital is paid into the company bank account.',
    });
  }

  // Nothing before the company existed.
  let list = items;
  if (p.incorporation_date) {
    if (fy < fyOf(p.incorporation_date)) return [];
    const startMonth = p.incorporation_date.slice(0, 7);
    list = items.filter((i) => !/^\d{4}-\d{2}$/.test(i.period) || i.period >= startMonth);
  }
  return list.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.key < b.key ? -1 : 1));
}

// Where an item stands today.
export function standing(item, today) {
  if (item.done_on) return 'done';
  const d = daysBetween(today, item.due);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'soon';
  return 'later';
}

// Which reminder (if any) is due today: 7 days before, 1 day before, and on each overdue day up to 3 times.
export function reminderKind(item, today) {
  if (item.done_on) return null;
  const d = daysBetween(today, item.due);
  if (d === 7) return 'week';
  if (d === 1) return 'day';
  if (d === -1 || d === -3 || d === -7) return `overdue${-d}`;
  return null;
}
