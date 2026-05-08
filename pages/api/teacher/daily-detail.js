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

  res.json({
    ok: true,
    grade: g,
    cls: c,
    date,
    total: students.length,
    period1: buildDailyList(1).expected,
    period2: buildDailyList(2).expected,
    period1_full: buildDailyList(1),
    period2_full: buildDailyList(2)
  });
});
