const { requireTeacher } = require('../../../lib/auth');
const { readAttendance } = require('../../../lib/sheets');
const { classOf, gradeOf, todayKST } = require('../../../lib/utils');
const studentsData = require('../../../students.json');

export default requireTeacher(async function handler(req, res) {
  if (req.teacher.role !== 'admin') return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

  const targetDate = req.query.date || todayKST();

  const classData = [];
  for (const g of [1, 2, 3]) {
    const records = await readAttendance(g, targetDate.substring(0, 7));
    const dayRecords = records.filter(r => r.날짜 === targetDate);

    const allStudents = Object.entries(studentsData[String(g)] || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    for (const [clsStr, students] of allStudents) {
      const cls = Number(clsStr);
      const clsRecords = dayRecords.filter(r => classOf(r.학번) === cls);

      const participantSet = new Set();
      const presentSet1 = new Set();
      const presentSet2 = new Set();
      clsRecords.forEach(r => {
        if (r.상태 === '출석') {
          participantSet.add(r.학번);
          if (Number(r.교시) === 1) presentSet1.add(r.학번);
          else if (Number(r.교시) === 2) presentSet2.add(r.학번);
        }
      });

      const mkList = (set) => students.filter(s => set.has(s.학번)).map(s => ({ 학번: s.학번, 이름: s.이름 }));

      classData.push({
        grade: g, cls,
        total: students.length,
        participants: participantSet.size,
        present1: presentSet1.size,
        present2: presentSet2.size,
        participantList: mkList(participantSet),
        participantList1: mkList(presentSet1),
        participantList2: mkList(presentSet2),
      });
    }
  }

  res.json({ ok: true, date: targetDate, classes: classData });
});
