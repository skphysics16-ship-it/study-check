const { readAttendance } = require('../../../lib/sheets');
const { classOf } = require('../../../lib/utils');

export default async function handler(req, res) {
  const { grade, cls, date, period } = req.query;
  if (!grade || !date || !period) return res.status(400).json({ error: 'MISSING_PARAMS' });

  const g = Number(grade);
  const c = cls ? Number(cls) : 0;
  const yearMonth = date.substring(0, 7);

  const records = await readAttendance(g, yearMonth);

  const filtered = records
    .filter(r => r.날짜 === date && Number(r.교시) === Number(period))
    .filter(r => c === 0 || classOf(r.학번) === c);

  res.json(filtered.map(r => ({ 학번: r.학번, 상태: r.상태, 메모: r.메모 })));
}
