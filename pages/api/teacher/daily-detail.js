const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

function getStudents(grade, cls) {
  const g = String(grade);
  if (!studentsData[g]) return [];
  if (!cls || cls === 0) return Object.values(studentsData[g]).flat().sort((a, b) => a.학번 - b.학번);
  return (studentsData[g][String(cls)] || []).slice();
}

export default requireTeacher(async function handler(req, res) {
  const { grade, cls, date } = req.query;
  const g = Number(grade);
  const c = Number(cls || 0);
  if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (!date) return res.status(400).json({ ok: false });

  const students = getStudents(g, c);
  const records = await readAttendance(g, date.substring(0, 7));
  const clsRecords = c === 0 ? records : records.filter(r => classOf(r.학번) === c);

  function presentList(period) {
    const set = new Set(); const memos = {};
    clsRecords.forEach(r => {
      if (r.날짜 === date && Number(r.교시) === period && r.상태 === '출석') {
        set.add(r.학번); if (r.메모) memos[r.학번] = r.메모;
      }
    });
    return students.filter(s => set.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름, 상태: '출석', 메모: memos[s.학번] || '' }));
  }

  res.json({ ok: true, grade: g, cls: c, date, total: students.length, period1: presentList(1), period2: presentList(2) });
});
