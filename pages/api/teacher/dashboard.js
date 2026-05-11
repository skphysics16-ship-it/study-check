const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readAttendance, readSchedule } = require('../../../lib/sheets');
const { classOf, todayKST, getMonthWeekdays } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

function getStudents(grade, cls) {
  const g = String(grade);
  if (!studentsData[g]) return [];
  if (!cls || cls === 0) return Object.values(studentsData[g]).flat().sort((a, b) => a.학번 - b.학번);
  const c = String(cls);
  return (studentsData[g][c] || []).slice();
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
  const schedule = await readSchedule(g);

  const dayIndex = new Date(today).getDay();
  const dayMap = ['일', '월', '화', '수', '목', '금', '토'];
  const todayDayName = dayMap[dayIndex];

  function buildDailyList(period) {
    const expected = [];
    const unexpected = [];
    
    const presentSet = new Set();
    const memoMap = {};
    clsRecords.forEach(r => {
      if (r.날짜 === today && Number(r.교시) === Number(period)) {
        if (r.상태 === '출석') presentSet.add(r.학번);
        if (r.메모) memoMap[r.학번] = r.메모;
      }
    });

    students.forEach(s => {
      const isExpected = schedule[s.학번] ? schedule[s.학번][todayDayName] : false;
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

  const todayP1 = buildDailyList(1);
  const todayP2 = buildDailyList(2);

  let todayClassBreakdown = null;
  if (c === 0) {
    const todayRecs = clsRecords.filter(r => r.날짜 === today && r.상태 === '출석');
    const pm = {};
    todayRecs.forEach(r => {
      const cls = classOf(r.학번);
      if (!pm[cls]) pm[cls] = { p1: new Set(), p2: new Set() };
      if (Number(r.교시) === 1) pm[cls].p1.add(r.학번);
      else if (Number(r.교시) === 2) pm[cls].p2.add(r.학번);
    });
    todayClassBreakdown = {};
    Object.entries(studentsData[String(g)] || {}).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([clsStr, clsStudents]) => {
      const cls = Number(clsStr);
      const sets = pm[cls] || { p1: new Set(), p2: new Set() };
      todayClassBreakdown[cls] = {
        total: clsStudents.length,
        present1: sets.p1.size,
        present2: sets.p2.size,
        participantList1: clsStudents.filter(s => sets.p1.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름 })),
        participantList2: clsStudents.filter(s => sets.p2.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름 })),
      };
    });
  }

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
    today: { date: today, period1: todayP1, period2: todayP2, total: students.length, classBreakdown: todayClassBreakdown },
    monthly: { yearMonth, perStudent, perDay },
  });
});
