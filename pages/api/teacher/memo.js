const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance, saveAttendance } = require('../../../lib/sheets');

export default requireTeacher(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { grade, date, period, 학번, 이름, 상태, memo } = req.body;
  const g = Number(grade);

  if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (!grade || !date || !period || !학번) return res.status(400).json({ ok: false });

  try {
    // 기존 출석 상태 보존: 기록이 있으면 그 상태 유지, 없으면 전달된 상태 사용
    const yearMonth = String(date).substring(0, 7);
    const records = await readAttendance(g, yearMonth);
    const existing = records.find(r => r.날짜 === date && Number(r.교시) === Number(period) && Number(r.학번) === Number(학번));
    const finalStatus = existing ? existing.상태 : (상태 || '결석');

    await saveAttendance(g, {
      date,
      period: String(period),
      학번: Number(학번),
      이름: 이름 || (existing?.이름 || ''),
      상태: finalStatus,
      메모: memo || '',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('memo save error:', err.message);
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});
