const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf, gradeOf, todayKST, getMonthWeekdays } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

function getStudents(grade, cls) {
  const g = String(grade);
  if (!studentsData[g]) return [];
  if (!cls || cls === 0) return Object.values(studentsData[g]).flat().sort((a, b) => a.학번 - b.학번);
  const c = String(cls);
  return (studentsData[g][c] || []).slice();
}

function presentList(students, records, date, period) {
  const presentSet = new Set();
  const memoMap = {};
  records.forEach(r => {
    if (r.날짜 === date && Number(r.교시) === Number(period)) {
      if (r.상태 === '출석') presentSet.add(r.학번);
      if (r.메모) memoMap[r.학번] = r.메모;
    }
  });
  return students
    .filter(s => presentSet.has(s.학번))
    .map(s => ({ 학번: s.학번, 이름: s.이름, 상태: '출석', 메모: memoMap[s.학번] || '' }));
}

export default requireTeacher(async function handler(req, res) {
  const { grade, cls, ym } = req.query;
  const g = Number(grade);
  const c = Number(cls || 0);

  if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const today = todayKST();
  const yearMonth = ym || today.substring(0, 7);

  const students = getStudents(g, c);
  const records = await readAttendance(g, yearMonth);
  const clsRecords = c === 0 ? records : records.filter(r => classOf(r.학번) === c);

  const todayP1 = presentList(students, clsRecords, today, 1);
  const todayP2 = presentList(students, clsRecords, today, 2);

  const weekdays = getMonthWeekdays(yearMonth);
  const eligibleDays = weekdays.filter(d => d <= today);

  const recIdx = {};
  clsRecords.forEach(r => { recIdx[r.학번 + '|' + r.날짜 + '|' + r.교시] = r.상태; });

  const perStudent = students.map(s => {
    let absent = 0, present = 0;
    eligibleDays.forEach(d => {
      [1, 2].forEach(p => {
        const k = s.학번 + '|' + d + '|' + p;
        if (recIdx[k] === '출석') present++; else absent++;
      });
    });
    return { 학번: s.학번, 이름: s.이름, 결석: absent, 출석: present };
  });

  const perDay = eligibleDays.map(d => {
    let p1 = 0, p2 = 0;
    students.forEach(s => {
      if (recIdx[s.학번 + '|' + d + '|1'] !== '출석') p1++;
      if (recIdx[s.학번 + '|' + d + '|2'] !== '출석') p2++;
    });
    return { date: d, p1결석: p1, p2결석: p2 };
  });

  res.json({
    ok: true,
    grade: g, cls: c,
    today: { date: today, period1: todayP1, period2: todayP2, total: students.length },
    monthly: { yearMonth, perStudent, perDay },
  });
});
