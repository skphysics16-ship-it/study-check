const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf, getMonthWeekdays } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default requireTeacher(async function handler(req, res) {
  const { grade, cls, ym } = req.query;
  const g = Number(grade);
  const c = Number(cls || 0);
  if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (!ym) return res.status(400).json({ ok: false });

  const gradeData = studentsData[String(g)] || {};
  const students = c === 0
    ? Object.values(gradeData).flat().sort((a, b) => a.학번 - b.학번)
    : (gradeData[String(c)] || []).slice();

  const dates = getMonthWeekdays(ym);
  const records = await readAttendance(g, ym);
  const clsRecords = c === 0 ? records : records.filter(r => classOf(r.학번) === c);

  const cells = {};
  clsRecords.forEach(r => { cells[r.학번 + '|' + r.날짜 + '|' + r.교시] = r.상태; });

  const header = ['학번', '이름'];
  dates.forEach(d => { header.push(d + '_1교시'); header.push(d + '_2교시'); });

  const rows = [header];
  students.forEach(s => {
    const row = [s.학번, s.이름];
    dates.forEach(d => {
      [1, 2].forEach(p => { row.push(cells[s.학번 + '|' + d + '|' + p] || '결석'); });
    });
    rows.push(row);
  });

  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const gradeName = ['', '1학년', '2학년', '3학년'][g] || '';
  const clsName = c === 0 ? '전체' : c + '반';
  const filename = `${ym}_${gradeName}${clsName}_출석.csv`;

  res.json({ ok: true, csv, filename });
});
