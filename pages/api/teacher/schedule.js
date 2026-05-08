const { requireTeacher, canAccessGrade } = require('../../../lib/auth');
const { readSchedule, saveSchedule } = require('../../../lib/sheets');
const studentsData = require('../../../students.json');

function getStudents(grade, cls) {
  const g = String(grade);
  if (!studentsData[g]) return [];
  if (!cls || cls === 0) return Object.values(studentsData[g]).flat().sort((a, b) => a.학번 - b.학번);
  const c = String(cls);
  return (studentsData[g][c] || []).slice();
}

export default requireTeacher(async function handler(req, res) {
  if (req.method === 'GET') {
    const { grade, cls } = req.query;
    const g = Number(grade);
    const c = Number(cls || 0);

    if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    const students = getStudents(g, c);
    const schedule = await readSchedule(g);

    const data = students.map(s => {
      const st = schedule[s.학번] || { 월: false, 화: false, 수: false, 목: false, 금: false };
      return {
        학번: s.학번,
        이름: s.이름,
        월: st.월, 화: st.화, 수: st.수, 목: st.목, 금: st.금
      };
    });

    return res.json({ ok: true, data });
  }

  if (req.method === 'POST') {
    const { grade, cls, scheduleData } = req.body;
    const g = Number(grade);

    if (!canAccessGrade(req.teacher, g)) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

    // scheduleData is an array: [{학번, 이름, 월, 화, 수, 목, 금}, ...]
    if (!Array.isArray(scheduleData)) {
      return res.status(400).json({ ok: false, error: 'INVALID_DATA' });
    }

    try {
      await saveSchedule(g, scheduleData);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Schedule save error:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  res.status(405).end();
});
