const studentsData = require('../../students.json');

export default function handler(req, res) {
  const grade = String(req.query.grade || '');
  const cls = String(req.query.cls || '');

  if (!studentsData[grade]) return res.status(400).json({ error: 'INVALID_GRADE' });

  if (cls && cls !== '0') {
    // 특정 반 학생
    const list = studentsData[grade][cls] || [];
    return res.json(list);
  }

  // cls=0 또는 미지정: 해당 학년 전체
  const all = Object.values(studentsData[grade]).flat();
  all.sort((a, b) => a.학번 - b.학번);
  return res.json(all);
}
