const { saveAttendance } = require('../../../lib/sheets');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { grade, date, period, 학번, 이름, 상태, 메모 } = req.body;
  if (!grade || !date || !period || !학번) return res.status(400).json({ ok: false });

  try {
    const result = await saveAttendance(Number(grade), { date, period, 학번, 이름, 상태, 메모 });
    res.json(result);
  } catch (err) {
    console.error('save error:', err.message);
    res.status(500).json({ ok: false, error: String(err.message) });
  }
}
