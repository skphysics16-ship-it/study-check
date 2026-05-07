const TZ = 'Asia/Seoul';

function pad(n) { return String(n).padStart(2, '0'); }

function formatKST(date) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

function todayKST() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function gradeOf(sid) { return Math.floor(Number(sid) / 10000); }
function classOf(sid) { return Math.floor(Number(sid) / 100) % 100; }

function isWeekday(date) {
  const d = new Date(date + 'T00:00:00+09:00');
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function getMonthWeekdays(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const result = [];
  const last = new Date(y, m, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const dateStr = y + '-' + pad(m) + '-' + pad(day);
    if (isWeekday(dateStr)) result.push(dateStr);
  }
  return result;
}

module.exports = { formatKST, todayKST, gradeOf, classOf, isWeekday, getMonthWeekdays };
