const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf, getMonthWeekdays } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

function getStudents(grade, cls) {
  const g = String(grade);
  if (!studentsData[g]) return [];
  if (!cls || cls === 0) return Object.values(studentsData[g]).flat().sort((a, b) => a.학번 - b.학번);
  return (studentsData[g][String(cls)] || []).slice();
}

export default requireTeacher(async function handler(req, res) {
  const { grade, cls, ym } = req.query;
  const g = Number(grade);
  const c = Number(cls || 0);
  if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (!ym) return res.status(400).json({ ok: false });

  const students = getStudents(g, c);
  const dates = getMonthWeekdays(ym);
  const records = await readAttendance(g, ym);
  const clsRecords = c === 0 ? records : records.filter(r => classOf(r.학번) === c);

  const cells = {}, memos = {};
  clsRecords.forEach(r => {
    const k = r.학번 + '|' + r.날짜 + '|' + r.교시;
    cells[k] = r.상태;
    if (r.메모) memos[k] = r.메모;
  });

  res.json({ ok: true, grade: g, cls: c, students, dates, cells, memos });
});
