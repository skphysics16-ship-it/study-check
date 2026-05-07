const { requireTeacher } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf, todayKST, getMonthWeekdays } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

export default requireTeacher(async function handler(req, res) {
  if (req.teacher.role !== 'admin') return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const ym = req.query.ym || todayKST().substring(0, 7);
  const today = todayKST();
  const allDates = getMonthWeekdays(ym);
  const dates = allDates.filter(d => d <= today);

  // 학년별 반 정보
  const classesInfo = [];
  for (const g of [1, 2, 3]) {
    for (const [clsStr, students] of Object.entries(studentsData[String(g)] || {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      classesInfo.push({ grade: g, cls: Number(clsStr), total: students.length });
    }
  }

  // 학년별 출석기록 로드 (중복 없이)
  const recordsByGrade = {};
  for (const g of [1, 2, 3]) {
    recordsByGrade[g] = await readAttendance(g, ym);
  }

  const data = {};
  dates.forEach(date => {
    data[date] = {};
    classesInfo.forEach(({ grade, cls }) => {
      const key = grade + '_' + cls;
      const dayRecs = recordsByGrade[grade].filter(r => r.날짜 === date && classOf(r.학번) === cls);
      const pSet = new Set(); const p1 = new Set(); const p2 = new Set();
      dayRecs.forEach(r => {
        if (r.상태 === '출석') {
          pSet.add(r.학번);
          if (Number(r.교시) === 1) p1.add(r.학번);
          else if (Number(r.교시) === 2) p2.add(r.학번);
        }
      });
      data[date][key] = { participants: pSet.size, present1: p1.size, present2: p2.size };
    });
  });

  res.json({ ok: true, yearMonth: ym, dates, classes: classesInfo, data });
});
