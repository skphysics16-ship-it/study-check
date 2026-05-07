const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TTL_DAYS = 30;

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TTL_DAYS * 24 * 3600 });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// PIN → { ok, token, role, grade }
function verifyPin(pin) {
  const accounts = [
    { envKey: 'ADMIN_PIN',   role: 'admin',  grade: null },
    { envKey: 'GRADE1_PIN',  role: 'grade',  grade: 1 },
    { envKey: 'GRADE2_PIN',  role: 'grade',  grade: 2 },
    { envKey: 'GRADE3_PIN',  role: 'grade',  grade: 3 },
  ];
  for (const acc of accounts) {
    const stored = process.env[acc.envKey];
    if (stored && pin === stored) {
      const token = signToken({ role: acc.role, grade: acc.grade });
      return { ok: true, token, role: acc.role, grade: acc.grade };
    }
  }
  return { ok: false };
}

// Express-style middleware for teacher routes
function requireTeacher(handler) {
  return async (req, res) => {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
    const payload = verifyToken(auth.slice(7));
    if (!payload) return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
    req.teacher = payload; // { role, grade }
    return handler(req, res);
  };
}

// grade access: admin can access any grade; grade accounts only their own
function canAccessGrade(teacher, requestedGrade) {
  if (teacher.role === 'admin') return true;
  if (!requestedGrade || requestedGrade === 0) return false; // cross-grade = admin only
  return teacher.grade === Number(requestedGrade);
}

module.exports = { signToken, verifyToken, verifyPin, requireTeacher, canAccessGrade };
