const { verifyPin } = require('../../../lib/auth');

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ ok: false });

  // 타이밍 공격 방지용 지연
  const start = Date.now();
  const result = verifyPin(String(pin));
  const elapsed = Date.now() - start;
  const delay = Math.max(0, 300 - elapsed);

  setTimeout(() => res.json(result), result.ok ? 0 : delay);
}
