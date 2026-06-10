import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import studentsData from '../../../students.json';

export default function StudentPage({ grade, cls, initialStudents }) {
  const router = useRouter();

  useEffect(() => {
    if (!grade || !cls) return;

    /* ── 상태 ── */
    const state = {
      students: initialStudents,
      statusMap: {},
      memoMap: {},
      date: '',
      period: 1,
      longPressTimer: null,
      longPressFired: false,
      activeMemoId: null,
      inflightSet: new Set(),
    };

    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function weekdayName(d) { return ['일','월','화','수','목','금','토'][d.getDay()]; }

    function previousWeekday(d) {
      const r = new Date(d);
      do { r.setDate(r.getDate() - 1); } while (r.getDay() === 0 || r.getDay() === 6);
      return r;
    }

    function decideDateAndPeriod() {
      const now = new Date();
      let target = new Date(now);
      let banner = '';
      if (now.getDay() === 0 || now.getDay() === 6) {
        target = previousWeekday(now);
        banner = '오늘은 자율학습이 없는 날입니다. 가장 최근 평일(' + ymd(target) + ')을 기준으로 표시합니다.';
      }
      const minutes = now.getHours() * 60 + now.getMinutes();
      let period = 1;
      if (minutes >= 20 * 60 + 35 && minutes < 22 * 60) period = 2;

      state.date = ymd(target);
      state.period = period;

      const banEl = document.getElementById('weekendBanner');
      if (banEl) { banEl.textContent = banner; banEl.style.display = banner ? 'block' : 'none'; }

      const dateEl = document.getElementById('headerDate');
      if (dateEl) dateEl.textContent = target.getFullYear() + '.' + pad(target.getMonth()+1) + '.' + pad(target.getDate()) + ' ' + weekdayName(target);

      document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.period) === period));
    }

    function showToast(msg, type) {
      const wrap = document.getElementById('toastContainer');
      if (!wrap) return;
      const t = document.createElement('div');
      t.className = 'toast' + (type === 'error' ? ' error' : '');
      t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function updateSummary() {
      let pres = 0, abs = 0;
      state.students.forEach(s => { if ((state.statusMap[s.학번] || '결석') === '출석') pres++; else abs++; });
      const pe = document.getElementById('presentCount'); if (pe) pe.textContent = pres;
      const ae = document.getElementById('absentCount'); if (ae) ae.textContent = abs;
    }

    function renderGrid() {
      const grid = document.getElementById('grid');
      if (!grid) return;
      grid.innerHTML = '';
      state.students.forEach(s => {
        const status = state.statusMap[s.학번] || '결석';
        const memo = state.memoMap[s.학번] || '';
        const card = document.createElement('div');
        card.className = 'card ' + (status === '출석' ? 'present' : 'absent');
        card.dataset.id = s.학번;
        card.innerHTML =
          (memo ? '<div class="card-memo">📝 ' + escapeHtml(memo) + '</div>' : '') +
          '<div><div class="card-name">' + escapeHtml(s.이름) + '</div>' +
          '<div class="card-id">' + s.학번 + '</div></div>' +
          '<div class="card-status">' + status + '</div>';
        attachCardEvents(card, s);
        grid.appendChild(card);
      });
      updateSummary();
    }

    function attachCardEvents(card, s) {
      let startX = 0, startY = 0, moved = false, touchHandled = false;
      card.addEventListener('touchstart', e => {
        moved = false; touchHandled = false; state.longPressFired = false;
        const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
        state.longPressTimer = setTimeout(() => { state.longPressFired = true; openMemoSheet(s); }, 600);
      }, { passive: true });
      card.addEventListener('touchmove', e => {
        if (moved) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 15 || Math.abs(t.clientY - startY) > 15) { moved = true; clearTimeout(state.longPressTimer); }
      }, { passive: true });
      card.addEventListener('touchend', e => {
        clearTimeout(state.longPressTimer);
        e.preventDefault();
        if (!state.longPressFired && !moved) { touchHandled = true; toggleStatus(s, card); }
      });
      card.addEventListener('touchcancel', () => { clearTimeout(state.longPressTimer); moved = false; touchHandled = false; });
      card.addEventListener('click', () => {
        if (touchHandled) { touchHandled = false; return; }
        toggleStatus(s, card);
      });
      card.addEventListener('contextmenu', e => { e.preventDefault(); openMemoSheet(s); });
    }

    async function saveWithRetry(payload, maxRetries = 2) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 600 * attempt));
          const r = await fetch('/api/attendance/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const res = await r.json();
          if (res && res.ok) return true;
        } catch { /* retry */ }
      }
      return false;
    }

    function toggleStatus(s, card) {
      if (state.inflightSet.has(s.학번)) return;
      const old = state.statusMap[s.학번] || '결석';
      const next = old === '출석' ? '결석' : '출석';
      state.statusMap[s.학번] = next;
      card.classList.toggle('present', next === '출석');
      card.classList.toggle('absent', next === '결석');
      card.querySelector('.card-status').textContent = next;
      updateSummary();

      state.inflightSet.add(s.학번);
      saveWithRetry({ grade, date: state.date, period: state.period, 학번: s.학번, 이름: s.이름, 상태: next, 메모: state.memoMap[s.학번] || '' })
        .then(ok => {
          state.inflightSet.delete(s.학번);
          if (ok) { showToast(s.이름 + ' → ' + next); } else { revert(); }
        });

      function revert() {
        state.statusMap[s.학번] = old;
        card.classList.toggle('present', old === '출석'); card.classList.toggle('absent', old === '결석');
        card.querySelector('.card-status').textContent = old;
        updateSummary(); showToast('저장 실패. 다시 시도하세요', 'error');
      }
    }

    function openMemoSheet(s) {
      state.activeMemoId = s.학번;
      const titleEl = document.getElementById('memoTitle'); if (titleEl) titleEl.textContent = s.이름 + ' 메모';
      const inp = document.getElementById('memoInput'); if (inp) { inp.value = state.memoMap[s.학번] || ''; }
      document.getElementById('sheetBackdrop')?.classList.add('open');
      document.getElementById('bottomSheet')?.classList.add('open');
      setTimeout(() => inp?.focus(), 200);
    }

    function closeMemoSheet() {
      document.getElementById('sheetBackdrop')?.classList.remove('open');
      document.getElementById('bottomSheet')?.classList.remove('open');
      state.activeMemoId = null;
    }

    function saveMemo() {
      const id = state.activeMemoId;
      if (id == null) return closeMemoSheet();
      const memo = (document.getElementById('memoInput')?.value || '').trim();
      const s = state.students.find(x => x.학번 === id);
      state.memoMap[id] = memo;
      const status = state.statusMap[id] || '결석';
      closeMemoSheet();
      renderGrid();
      fetch('/api/attendance/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, date: state.date, period: state.period, 학번: s.학번, 이름: s.이름, 상태: status, 메모: memo }),
      })
        .then(r => r.json())
        .then(res => { showToast(res.ok ? s.이름 + ' 메모 저장' : '메모 저장 실패', res.ok ? '' : 'error'); })
        .catch(() => showToast('메모 저장 실패', 'error'));
    }

    function loadAttendance() {
      const grid = document.getElementById('grid');
      if (grid) grid.innerHTML = '<div class="loading">불러오는 중…</div>';
      state.statusMap = {}; state.memoMap = {};
      fetch(`/api/attendance/get?grade=${grade}&cls=${cls}&date=${state.date}&period=${state.period}`)
        .then(r => r.json())
        .then(records => {
          records.forEach(r => { state.statusMap[r.학번] = r.상태; if (r.메모) state.memoMap[r.학번] = r.메모; });
          renderGrid();
        })
        .catch(() => { showToast('데이터 불러오기 실패', 'error'); renderGrid(); });
    }

    function setPeriod(p) {
      state.period = Number(p);
      document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.period) === state.period));
      loadAttendance();
    }

    /* ── 초기화 ── */
    decideDateAndPeriod();
    document.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', () => setPeriod(b.dataset.period)));
    document.getElementById('refreshBtn')?.addEventListener('click', () => { decideDateAndPeriod(); loadAttendance(); });
    document.getElementById('memoCancel')?.addEventListener('click', closeMemoSheet);
    document.getElementById('memoSave')?.addEventListener('click', saveMemo);
    document.getElementById('sheetBackdrop')?.addEventListener('click', closeMemoSheet);
    loadAttendance();
  }, [grade, cls]);

  const gradeLabel = grade + '-' + cls;

  return (
    <>
      <Head>
        <title>{gradeLabel} 자율학습 출석체크</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      {/* 반 탭 */}
      <div className="class-tabs">
        {Array.from({ length: 9 }, (_, i) => i + 1).map(i => (
          <a
            key={i}
            className={'class-tab' + (i === cls ? ' active' : '')}
            href={`/student/${grade}/${i}`}
          >
            {i}반
          </a>
        ))}
      </div>

      <header className="header">
        <div className="header-class">{gradeLabel}</div>
        <div className="header-date" id="headerDate">—</div>
        <div className="period-toggle">
          <button className="period-btn" data-period="1">1교시</button>
          <button className="period-btn" data-period="2">2교시</button>
        </div>
        <button className="refresh-btn" id="refreshBtn" aria-label="새로고침">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
        </button>
      </header>

      <div id="weekendBanner" className="banner" style={{ display: 'none' }}></div>

      <main>
        <div className="grid" id="grid">
          <div className="loading">불러오는 중…</div>
        </div>
      </main>

      <footer className="summary-bar">
        <span className="pres">출석 <b id="presentCount">0</b></span>
        &nbsp;·&nbsp;
        <span className="abs">결석 <b id="absentCount">0</b></span>
      </footer>

      <div className="toast-container" id="toastContainer"></div>
      <div className="sheet-backdrop" id="sheetBackdrop"></div>
      <div className="bottom-sheet" id="bottomSheet">
        <h3 id="memoTitle">메모</h3>
        <input type="text" id="memoInput" placeholder="예: 병원, 학원 보강" maxLength={40} />
        <div className="sheet-actions">
          <button className="btn-secondary" id="memoCancel">취소</button>
          <button className="btn-primary" id="memoSave">저장</button>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ params }) {
  const grade = Number(params.grade);
  const cls = Number(params.cls);
  const students = studentsData[String(grade)]?.[String(cls)] || [];
  return { props: { grade, cls, initialStudents: students } };
}

export async function getStaticPaths() {
  const paths = [];
  for (const g of [1, 2, 3]) {
    for (let c = 1; c <= 9; c++) {
      paths.push({ params: { grade: String(g), cls: String(c) } });
    }
  }
  return { paths, fallback: false };
}
