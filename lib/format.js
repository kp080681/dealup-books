export function rupees(paise) {
  const n = Number(paise) / 100;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function niceDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MON[Number(m) - 1]} ${y}`;
}

export function niceMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MON[Number(m) - 1]} ${y}`;
}
