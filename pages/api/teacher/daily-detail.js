const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance, readSchedule } = require('../../../lib/sheets');
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
  const schedule = await readSchedule(g);

  const dayIndex = new Date(date).getDay();
  const dayMap = ['일', '월', '화', '수', '목', '금', '토'];
  const targetDayName = dayMap[dayIndex];

  function buildDailyList(period) {
    const expected = [];
    const unexpected = [];
    
    const presentSet = new Set();
    const memoMap = {};
    clsRecords.forEach(r => {
      if (r.날짜 === date && Number(r.교시) === Number(period)) {
        if (r.상태 === '출석') presentSet.add(r.학번);
        if (r.메모) memoMap[r.학번] = r.메모;
      }
    });

    students.forEach(s => {
      const isExpected = schedule[s.학번] ? schedule[s.학번][targetDayName] : false;
      const isPresent = presentSet.has(s.학번);
      
      const item = {
        학번: s.학번,
        이름: s.이름,
        상태: isPresent ? '출석' : '결석',
        메모: memoMap[s.학번] || '',
        isExpected
      };

      if (isExpected) {
        expected.push(item);
      } else if (isPresent) {
        unexpected.push(item);
      }
    });
    
    return { expected, unexpected };
  }

  const p1 = buildDailyList(1);
  const p2 = buildDailyList(2);

  let classBreakdown = null;
  if (c === 0) {
    const dayRecs = clsRecords.filter(r => r.날짜 === date && r.상태 === '출석');
    const pm = {};
    dayRecs.forEach(r => {
      const cls = classOf(r.학번);
      if (!pm[cls]) pm[cls] = { p1: new Set(), p2: new Set() };
      if (Number(r.교시) === 1) pm[cls].p1.add(r.학번);
      else if (Number(r.교시) === 2) pm[cls].p2.add(r.학번);
    });
    classBreakdown = {};
    Object.entries(studentsData[String(g)] || {}).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([clsStr, clsStudents]) => {
      const cls = Number(clsStr);
      const sets = pm[cls] || { p1: new Set(), p2: new Set() };
      classBreakdown[cls] = {
        total: clsStudents.length,
        present1: sets.p1.size,
        present2: sets.p2.size,
        participantList1: clsStudents.filter(s => sets.p1.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름 })),
        participantList2: clsStudents.filter(s => sets.p2.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름 })),
      };
    });
  }

  res.json({
    ok: true,
    grade: g,
    cls: c,
    date,
    total: students.length,
    period1: p1.expected,
    period2: p2.expected,
    period1_full: p1,
    period2_full: p2,
    classBreakdown,
  });
});
