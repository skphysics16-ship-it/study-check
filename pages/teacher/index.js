import Head from 'next/head';
import { useEffect } from 'react';

export default function TeacherPage() {
  useEffect(() => {
    /* ────────────────────────────────────────────────
     * 상수 / 유틸
     * ──────────────────────────────────────────────── */
    const TOKEN_KEY     = 'teacher_token';
    const TOKEN_EXP_KEY = 'teacher_token_exp';
    const GRADE_KEY     = 'teacher_active_grade'; // 0=전체학년, 1~3
    const CLS_KEY       = 'teacher_active_cls';   // 0=전체반, 1~9

    function pad(n) { return String(n).padStart(2, '0'); }
    function todayYM() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth()+1); }

    function monthOptions() {
      const opts = []; const now = new Date();
      let y = now.getFullYear(), m = 3;
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()+1)) {
        opts.push(y + '-' + pad(m)); m++; if (m > 12) { m = 1; y++; }
      }
      return opts.reverse();
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function parseJwt(token) {
      try { return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }
      catch { return null; }
    }

    /* ────────────────────────────────────────────────
     * 토큰 관리
     * ──────────────────────────────────────────────── */
    function getToken() {
      const t = localStorage.getItem(TOKEN_KEY);
      const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) || 0);
      return (t && Date.now() < exp) ? t : null;
    }
    function saveToken(t) {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + 30*24*60*60*1000));
    }
    function clearToken() {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXP_KEY);
    }

    /* ────────────────────────────────────────────────
     * API 호출 헬퍼
     * ──────────────────────────────────────────────── */
    function apiGet(path) {
      const token = getToken();
      return fetch(path, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} }).then(r => r.json());
    }
    function apiPost(path, body) {
      const token = getToken();
      return fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify(body)
      }).then(r => r.json());
    }

    /* ────────────────────────────────────────────────
     * 토스트
     * ──────────────────────────────────────────────── */
    function showToast(msg, type) {
      const wrap = document.getElementById('toastContainer') || document.body;
      const t = document.createElement('div');
      t.className = 'toast' + (type === 'error' ? ' error' : '');
      t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    /* ────────────────────────────────────────────────
     * 상태 변수
     * ──────────────────────────────────────────────── */
    let TOKEN = null;
    let ROLE  = null;  // 'admin' | 'grade'
    let TEACHER_GRADE = null; // null=admin, 1~3=grade account

    let ACTIVE_GRADE = 0; // 0=전체학년(admin), 1~3=학년
    let CLS = 0;          // 0=전체반, 1~9
    let cachedDashboard = null;
    let sortState = { key: '결석', asc: false };
    let currentMemoTarget = null;

    /* ────────────────────────────────────────────────
     * 로그인 화면
     * ──────────────────────────────────────────────── */
    function showLogin() {
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('teacherRoot').innerHTML = '';
      const inp = document.getElementById('pinInput');
      inp.value = ''; inp.focus();
      initLogin();
    }

    function tryPin(pin) {
      apiPost('/api/teacher/verify-pin', { pin })
        .then(res => {
          if (res && res.ok) {
            saveToken(res.token);
            enterDashboard(res.token, res.role, res.grade);
          } else {
            const inp = document.getElementById('pinInput');
            inp.classList.add('error');
            document.getElementById('loginMsg').textContent = 'PIN이 일치하지 않습니다';
            setTimeout(() => { inp.classList.remove('error'); inp.value = ''; inp.focus(); }, 500);
          }
        })
        .catch(() => { document.getElementById('loginMsg').textContent = '서버 오류. 잠시 후 다시 시도하세요'; });
    }

    function initLogin() {
      const inp = document.getElementById('pinInput');
      if (!inp || inp.dataset.listenerAttached) return;
      inp.dataset.listenerAttached = 'true';
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        document.getElementById('loginMsg').textContent = '';
        if (inp.value.length === 4) tryPin(inp.value);
      });
    }

    /* ────────────────────────────────────────────────
     * 대시보드 진입
     * ──────────────────────────────────────────────── */
    function enterDashboard(token, role, teacherGrade) {
      TOKEN = token; ROLE = role; TEACHER_GRADE = teacherGrade;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('teacherRoot').innerHTML = buildDashboardHTML();
      initDashboard();
    }

    /* ────────────────────────────────────────────────
     * 대시보드 HTML 구조 생성
     * ──────────────────────────────────────────────── */
    function buildDashboardHTML() {
      return `
      <div class="teacher-wrap">
        ${ROLE === 'admin' ? '<div class="grade-tabs" id="gradeTabs"></div>' : ''}
        <div class="class-tabs teacher-class-tabs" id="teacherClassTabs"></div>

        <div class="tabs" id="subTabs">
          <div id="subTabBtns" style="flex:1;display:flex;gap:4px;">
            <button class="tab-btn active" data-tab="today">오늘</button>
            <button class="tab-btn" data-tab="daily">일별 보기</button>
            <button class="tab-btn" data-tab="month">이번 달</button>
            <button class="tab-btn" data-tab="matrix">월별 보기</button>
            <button class="tab-btn" data-tab="schedule">일정 관리</button>
          </div>
          <button class="tab-btn" id="logoutBtn" style="flex:0 0 auto;background:transparent;color:var(--color-muted)">로그아웃</button>
        </div>

        <div id="allGradesPanel" style="display:none;">
          <div class="tabs">
            <button class="tab-btn active" id="allTab-date">날짜별</button>
            <button class="tab-btn" id="allTab-monthly">월별 현황</button>
          </div>
          <div id="all-panel-date" style="padding:16px;">
            <div class="controls">
              <select id="allDateMonth"></select>
              <select id="allDateDay"></select>
              <button class="btn" id="allDateReload">조회</button>
            </div>
            <div id="allGradesContent"><div class="loading">불러오는 중…</div></div>
          </div>
          <div id="all-panel-monthly" style="display:none;padding:16px;">
            <div class="controls">
              <select id="allMonthlyMonth"></select>
              <button class="btn" id="allMonthlyReload">새로고침</button>
            </div>
            <div id="allMonthlyContent"><div class="loading">월을 선택하세요</div></div>
          </div>
        </div>

        <section class="tab-panel active" id="tab-today"><div class="loading">불러오는 중…</div></section>
        <section class="tab-panel" id="tab-month"><div class="loading">불러오는 중…</div></section>
        <section class="tab-panel" id="tab-schedule">
          <div style="padding:16px">
            <div id="scheduleContent"><div class="loading">불러오는 중…</div></div>
            <div style="margin-top:16px">
              <button class="btn btn-primary" id="saveScheduleBtn" style="display:none;width:100%">일정 저장</button>
            </div>
          </div>
        </section>
        <section class="tab-panel" id="tab-matrix">
          <div style="padding:16px">
            <div class="controls">
              <select id="matrixMonth"></select>
              <button class="btn" id="matrixReload">새로고침</button>
            </div>
            <div id="matrixContent"><div class="loading">월을 선택하세요</div></div>
          </div>
        </section>
        <section class="tab-panel" id="tab-daily">
          <div style="padding:16px">
            <div class="controls">
              <select id="dailyMonth"></select>
              <select id="dailyDay"></select>
              <button class="btn" id="dailyReload">조회</button>
            </div>
            <div id="dailyContent"><div class="loading">날짜를 선택하세요</div></div>
          </div>
        </section>
      </div>
      <div id="memoModal" class="memo-modal-overlay" style="display:none">
        <div class="memo-modal-box">
          <div class="memo-modal-title" id="memoModalTitle"></div>
          <div class="memo-modal-hint">불참 사유를 입력하세요</div>
          <input type="text" id="memoInput" maxlength="60" placeholder="예: 학원 보강으로 인한 불참" />
          <div class="memo-modal-actions">
            <button id="memoSaveBtn" class="btn btn-primary">저장</button>
            <button id="memoCancelBtn" class="btn btn-secondary">취소</button>
            <button id="memoClearBtn" class="btn memo-clear-btn">메모 삭제</button>
          </div>
        </div>
      </div>`;
    }

    /* ────────────────────────────────────────────────
     * 대시보드 초기화
     * ──────────────────────────────────────────────── */
    function initDashboard() {
      // 마지막 선택 복원
      const savedGrade = Number(localStorage.getItem(GRADE_KEY));
      const savedCls   = Number(localStorage.getItem(CLS_KEY));

      if (ROLE === 'admin') {
        ACTIVE_GRADE = (savedGrade >= 0 && savedGrade <= 3) ? savedGrade : 0;
      } else {
        ACTIVE_GRADE = TEACHER_GRADE;
      }
      CLS = (savedCls >= 0 && savedCls <= 9) ? savedCls : 0;

      if (ROLE === 'admin') renderGradeTabs();
      renderClassTabs();
      setupSubTabs();
      setupMatrixSelect();
      setupDailySelect();
      setupAllGradesTabs();
      setupAllDateSelect();
      setupAllMonthlySelect();
      initMemoModal();

      document.getElementById('logoutBtn')?.addEventListener('click', () => { clearToken(); showLogin(); });

      reloadAll();
    }

    /* ── 학년 탭 (admin 전용) ── */
    function renderGradeTabs() {
      const wrap = document.getElementById('gradeTabs');
      if (!wrap) return;
      const grades = [{ v: 0, label: '전체학년' }, { v: 1, label: '1학년' }, { v: 2, label: '2학년' }, { v: 3, label: '3학년' }];
      wrap.innerHTML = grades.map(g => `<button class="grade-tab${ACTIVE_GRADE === g.v ? ' active' : ''}" data-grade="${g.v}">${g.label}</button>`).join('');
      wrap.querySelectorAll('.grade-tab[data-grade]').forEach(b => {
        b.addEventListener('click', () => {
          const next = Number(b.dataset.grade);
          if (next === ACTIVE_GRADE) return;
          ACTIVE_GRADE = next; CLS = 0;
          localStorage.setItem(GRADE_KEY, String(ACTIVE_GRADE));
          localStorage.setItem(CLS_KEY, '0');
          wrap.querySelectorAll('.grade-tab[data-grade]').forEach(x => x.classList.toggle('active', Number(x.dataset.grade) === ACTIVE_GRADE));
          renderClassTabs();
          reloadAll();
        });
      });
    }

    /* ── 반 탭 ── */
    function renderClassTabs() {
      const wrap = document.getElementById('teacherClassTabs');
      if (!wrap) return;
      if (ACTIVE_GRADE === 0) { wrap.innerHTML = ''; return; }
      let html = `<button class="class-tab${CLS === 0 ? ' active' : ''}" data-cls="0">전체</button>`;
      for (let i = 1; i <= 9; i++) {
        html += `<button class="class-tab${i === CLS ? ' active' : ''}" data-cls="${i}">${i}반</button>`;
      }
      wrap.innerHTML = html;
      wrap.querySelectorAll('.class-tab[data-cls]').forEach(b => {
        b.addEventListener('click', () => {
          const next = Number(b.dataset.cls);
          if (next === CLS) return;
          CLS = next;
          localStorage.setItem(CLS_KEY, String(CLS));
          wrap.querySelectorAll('.class-tab[data-cls]').forEach(x => x.classList.toggle('active', Number(x.dataset.cls) === CLS));
          cachedDashboard = null;
          loadDashboard();
        });
      });
    }

    /* ── 전체/개별 패널 전환 ── */
    function reloadAll() {
      cachedDashboard = null;
      if (ACTIVE_GRADE === 0) {
        // 관리자 전체학년 뷰
        document.getElementById('subTabBtns').style.display = 'none';
        document.getElementById('allGradesPanel').style.display = 'block';
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        loadAllGrades();
      } else {
        // 학년별 뷰
        document.getElementById('subTabBtns').style.display = '';
        document.getElementById('allGradesPanel').style.display = 'none';
        document.querySelectorAll('#subTabBtns .tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelector('#subTabBtns .tab-btn[data-tab="today"]')?.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('tab-today')?.classList.add('active');
        document.getElementById('tab-today').innerHTML = '<div class="loading">불러오는 중…</div>';
        document.getElementById('tab-month').innerHTML = '<div class="loading">불러오는 중…</div>';
        loadDashboard();
      }
    }

    /* ── 서브 탭 설정 ── */
    function setupSubTabs() {
      document.querySelectorAll('#subTabBtns .tab-btn[data-tab]').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('#subTabBtns .tab-btn[data-tab]').forEach(x => x.classList.remove('active'));
          document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          document.getElementById('tab-' + b.dataset.tab)?.classList.add('active');
          if (b.dataset.tab === 'matrix') {
            const sel = document.getElementById('matrixMonth');
            loadMatrix(sel?.value || todayYM());
          }
          if (b.dataset.tab === 'daily') {
            const m = document.getElementById('dailyMonth');
            const d = document.getElementById('dailyDay');
            if (m?.value && d?.value) loadDailyDetail(m.value + '-' + d.value);
          }
          if (b.dataset.tab === 'schedule') {
            loadSchedule();
          }
        });
      });
    }

    /* ────────────────────────────────────────────────
     * 대시보드 데이터 로드 (학년별)
     * ──────────────────────────────────────────────── */
    function gradeName(g) { return g + '학년'; }
    function clsName(c)   { return c === 0 ? '전체' : c + '반'; }

    let currentScheduleData = [];

    function loadSchedule() {
      const cont = document.getElementById('scheduleContent'); if (!cont) return;
      const btn = document.getElementById('saveScheduleBtn'); if (btn) btn.style.display = 'none';
      cont.innerHTML = '<div class="loading">불러오는 중…</div>';
      apiGet(`/api/teacher/schedule?grade=${ACTIVE_GRADE}&cls=${CLS}`)
        .then(res => {
          if (!res || !res.ok) { cont.innerHTML = '<div class="loading">로드 실패</div>'; return; }
          currentScheduleData = res.data;
          renderSchedule(res.data);
          if (btn) {
            btn.style.display = 'block';
            btn.onclick = saveScheduleData;
          }
        })
        .catch(() => { cont.innerHTML = '<div class="loading">로드 실패</div>'; });
    }

    function renderSchedule(data) {
      const cont = document.getElementById('scheduleContent'); if (!cont) return;
      let html = `<div class="summary-row">${gradeName(ACTIVE_GRADE)} ${clsName(CLS)} 요일별 자율학습 일정</div>`;
      html += `<div class="matrix-wrap"><table class="matrix-table" style="width:100%;text-align:center"><thead><tr>
        <th class="sticky-col">학번</th><th class="sticky-col">이름</th>
        <th>월</th><th>화</th><th>수</th><th>목</th><th>금</th>
      </tr></thead><tbody>`;
      data.forEach((s, idx) => {
        html += `<tr>
          <td class="sticky-col">${s.학번}</td><td class="sticky-col name">${escapeHtml(s.이름)}</td>
          <td><input type="checkbox" data-idx="${idx}" data-day="월" ${s.월 ? 'checked' : ''}></td>
          <td><input type="checkbox" data-idx="${idx}" data-day="화" ${s.화 ? 'checked' : ''}></td>
          <td><input type="checkbox" data-idx="${idx}" data-day="수" ${s.수 ? 'checked' : ''}></td>
          <td><input type="checkbox" data-idx="${idx}" data-day="목" ${s.목 ? 'checked' : ''}></td>
          <td><input type="checkbox" data-idx="${idx}" data-day="금" ${s.금 ? 'checked' : ''}></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
      cont.innerHTML = html;

      cont.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const idx = e.target.dataset.idx;
          const day = e.target.dataset.day;
          currentScheduleData[idx][day] = e.target.checked;
        });
      });
    }

    function saveScheduleData() {
      const btn = document.getElementById('saveScheduleBtn');
      if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
      apiPost('/api/teacher/schedule', {
        grade: ACTIVE_GRADE,
        cls: CLS,
        scheduleData: currentScheduleData
      })
      .then(res => {
        if (btn) { btn.disabled = false; btn.textContent = '일정 저장'; }
        if (res.ok) {
          showToast('일정이 저장되었습니다.');
          cachedDashboard = null; // force reload dashboard
        } else {
          showToast('저장 실패', 'error');
        }
      })
      .catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = '일정 저장'; }
        showToast('저장 실패', 'error');
      });
    }

    function loadDashboard(yearMonth) {
      apiGet(`/api/teacher/dashboard?grade=${ACTIVE_GRADE}&cls=${CLS}${yearMonth ? '&ym='+yearMonth : ''}`)
        .then(res => {
          if (!res || !res.ok) { if (res?.error === 'INVALID_TOKEN') { clearToken(); showLogin(); } return; }
          cachedDashboard = res;
          renderToday(res.today);
          renderMonth(res.monthly);
        })
        .catch(() => showToast('대시보드 로드 실패', 'error'));
    }

    function renderClassBreakdown(date, breakdown, idPrefix) {
      function makeChips(list) {
        if (!list || !list.length) return '<span style="color:var(--color-muted)">출석자 없음</span>';
        return list.map(s => `<span class="participant-chip">${escapeHtml(s.이름)}<small>${s.학번}</small></span>`).join('');
      }
      let sumTotal = 0, sumP1 = 0, sumP2 = 0;
      const rows = Object.entries(breakdown).sort((a, b) => Number(a[0]) - Number(b[0]));
      rows.forEach(([, c]) => { sumTotal += c.total; sumP1 += c.present1; sumP2 += c.present2; });
      let html = `<div class="summary-row">${gradeName(ACTIVE_GRADE)} 전체 · ${escapeHtml(date)} · 1교시 출석 <b>${sumP1}</b>명 · 2교시 출석 <b>${sumP2}</b>명</div>`;
      html += '<table><thead><tr><th>반</th><th>전체</th><th>1교시</th><th>2교시</th></tr></thead><tbody>';
      rows.forEach(([cls, c]) => {
        const did = idPrefix + '-' + cls;
        html += `<tr class="cls-summary-row" data-detail="${did}">
          <td><b>${cls}반</b></td><td>${c.total}</td>
          <td class="participants-cell">${c.present1} <span class="toggle-arrow">▾</span></td>
          <td>${c.present2}</td></tr>`;
        html += `<tr id="${did}" class="cls-detail-row" style="display:none"><td colspan="4">
          <div style="margin-bottom:8px"><b style="font-size:13px;color:var(--color-primary)">1교시 출석</b>
          <div class="participant-chips" style="margin-top:4px">${makeChips(c.participantList1)}</div></div>
          <div><b style="font-size:13px;color:var(--color-primary)">2교시 출석</b>
          <div class="participant-chips" style="margin-top:4px">${makeChips(c.participantList2)}</div></div>
          </td></tr>`;
      });
      html += `<tr class="total-row"><td>합계</td><td>${sumTotal}</td><td>${sumP1}</td><td>${sumP2}</td></tr>`;
      html += '</tbody></table><p class="all-table-hint">반 행을 클릭하면 출석자 명단을 확인합니다.</p>';
      return html;
    }

    function attachBreakdownHandlers(container) {
      container.querySelectorAll('.cls-summary-row').forEach(row => {
        row.addEventListener('click', () => {
          const detail = document.getElementById(row.dataset.detail); if (!detail) return;
          const open = detail.style.display !== 'none';
          detail.style.display = open ? 'none' : '';
          row.querySelector('.toggle-arrow').textContent = open ? '▾' : '▴';
        });
      });
    }

    function renderToday(today) {
      const panel = document.getElementById('tab-today'); if (!panel) return;
      const label = `${gradeName(ACTIVE_GRADE)} ${clsName(CLS)}`;

      if (CLS === 0 && ACTIVE_GRADE !== 0 && today.classBreakdown) {
        panel.innerHTML = renderClassBreakdown(today.date, today.classBreakdown, 'today');
        attachBreakdownHandlers(panel);
        return;
      }

      const p1PresentCount = today.period1.expected.filter(s => s.상태 === '출석').length + today.period1.unexpected.length;
      const p2PresentCount = today.period2.expected.filter(s => s.상태 === '출석').length + today.period2.unexpected.length;

      panel.innerHTML =
        `<div class="summary-row">${label} · ${escapeHtml(today.date)} · 1교시 출석 <b>${p1PresentCount}</b>명 · 2교시 출석 <b>${p2PresentCount}</b>명</div>` +
        renderPeriodCard('1교시', today.period1, today.date, ACTIVE_GRADE) +
        renderPeriodCard('2교시', today.period2, today.date, ACTIVE_GRADE);
      attachMemoHandlers(panel);
    }

    function renderPeriodCard(title, list, date, grade) {
      const { expected, unexpected } = list;
      const periodNum = title === '1교시' ? 1 : 2;

      let expectedHtml = '';
      if (expected.length === 0) {
        expectedHtml = '<li class="empty">예정된 참석자가 없습니다</li>';
      } else {
        expectedHtml = expected.map(s => {
          const isPresent = s.상태 === '출석';
          const hasMemo = !!s.메모;
          return `<li class="memo-editable${isPresent ? '' : ' is-absent'}${hasMemo ? ' has-memo' : ''}"
            data-학번="${s.학번}"
            data-이름="${escapeHtml(s.이름)}"
            data-상태="${isPresent ? '출석' : '결석'}"
            data-period="${periodNum}"
            data-date="${date || ''}"
            data-grade="${grade || ''}"
            title="우클릭 또는 길게 눌러 메모 추가">
            <span><b>${s.학번}</b> ${escapeHtml(s.이름)}</span>
            <span class="status-badge ${isPresent ? 'present' : 'absent'}">${isPresent ? '출석' : '결석'}</span>
            ${hasMemo ? `<span class="memo memo-text">${escapeHtml(s.메모)}</span>` : '<span class="memo memo-hint">메모</span>'}
          </li>`;
        }).join('');
      }

      let unexpectedHtml = '';
      if (unexpected && unexpected.length > 0) {
        unexpectedHtml = '<div class="unexpected-header">추가 참여자</div>' + unexpected.map(s => {
          return `<li>
            <span><b>${s.학번}</b> ${escapeHtml(s.이름)}</span>
            <span class="status-badge unexpected">추가</span>
            ${s.메모 ? `<span class="memo">${escapeHtml(s.메모)}</span>` : ''}
          </li>`;
        }).join('');
      }

      return `<div class="period-card"><h3>${title}</h3>
        <p class="memo-tip">예정 학생을 우클릭 또는 길게 눌러 메모를 추가할 수 있습니다.</p>
        <ul class="absent-list scheduled-list">${expectedHtml}</ul>
        ${unexpectedHtml ? `<ul class="absent-list unexpected-list" style="margin-top:8px">${unexpectedHtml}</ul>` : ''}
      </div>`;
    }

    function renderMonth(monthly) {
      const panel = document.getElementById('tab-month'); if (!panel) return;
      const [y, m] = monthly.yearMonth.split('-');
      const label = `${gradeName(ACTIVE_GRADE)} ${clsName(CLS)}`;
      panel.innerHTML =
        `<div class="summary-row">${label} · ${Number(y)}년 ${Number(m)}월</div>` +
        `<div class="panel-section"><h2>학생별 누적</h2>${renderPerStudentTable(monthly.perStudent)}</div>` +
        `<div class="panel-section"><button class="btn btn-primary" id="csvBtn">CSV 다운로드</button></div>`;
      document.getElementById('csvBtn')?.addEventListener('click', () => downloadCsv(monthly.yearMonth));
      attachSortHandlers();
    }

    function renderPerStudentTable(perStudent) {
      const sorted = perStudent.slice().sort((a, b) => {
        const k = sortState.key;
        if (k === '이름') return sortState.asc ? a[k].localeCompare(b[k]) : b[k].localeCompare(a[k]);
        const av = Number(a[k]||0), bv = Number(b[k]||0);
        return sortState.asc ? av - bv : bv - av;
      });
      const isSorted = k => sortState.key === k ? 'sorted' + (sortState.asc ? ' asc' : '') : '';
      let html = `<table><thead><tr>
        <th data-sort="학번" class="${isSorted('학번')}">학번</th>
        <th data-sort="이름" class="${isSorted('이름')}">이름</th>
        <th data-sort="결석" class="${isSorted('결석')}">결석</th>
        <th data-sort="출석" class="${isSorted('출석')}">출석</th>
        <th data-sort="결석률" class="${isSorted('결석률')}">결석률</th>
      </tr></thead><tbody>`;
      sorted.forEach(r => {
        const total = r.결석 + r.출석;
        const rate = total ? Math.round(r.결석 / total * 1000) / 10 : 0;
        html += `<tr><td>${r.학번}</td><td class="name">${escapeHtml(r.이름)}</td><td>${r.결석}</td><td>${r.출석}</td><td>${rate}%</td></tr>`;
      });
      return html + '</tbody></table>';
    }

    function attachSortHandlers() {
      document.querySelectorAll('#tab-month th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const k = th.dataset.sort;
          if (sortState.key === k) sortState.asc = !sortState.asc; else { sortState.key = k; sortState.asc = false; }
          if (cachedDashboard) renderMonth(cachedDashboard.monthly);
        });
      });
    }

    function downloadCsv(ym) {
      showToast('CSV 생성 중…');
      apiGet(`/api/teacher/export-csv?grade=${ACTIVE_GRADE}&cls=${CLS}&ym=${ym}`)
        .then(res => {
          if (!res || !res.ok) return showToast('CSV 생성 실패', 'error');
          const blob = new Blob(['﻿' + res.csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = res.filename;
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
        })
        .catch(() => showToast('CSV 생성 실패', 'error'));
    }

    /* ── 일별 보기 ── */
    function setupDailySelect() {
      const monthSel = document.getElementById('dailyMonth');
      const daySel   = document.getElementById('dailyDay');
      if (!monthSel || !daySel) return;
      monthSel.innerHTML = monthOptions().map(o => `<option value="${o}">${o}</option>`).join('');
      monthSel.value = todayYM();
      function updateDays() {
        const [y, m] = (monthSel.value || todayYM()).split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        daySel.innerHTML = '';
        for (let d = 1; d <= last; d++) { const opt = document.createElement('option'); opt.value = pad(d); opt.textContent = d + '일'; daySel.appendChild(opt); }
        const now = new Date(); const curYM = now.getFullYear() + '-' + pad(now.getMonth()+1);
        daySel.value = (monthSel.value === curYM) ? pad(now.getDate()) : pad(last);
      }
      updateDays();
      monthSel.addEventListener('change', updateDays);
      function doLoad() { if (monthSel.value && daySel.value) loadDailyDetail(monthSel.value + '-' + daySel.value); }
      daySel.addEventListener('change', doLoad);
      document.getElementById('dailyReload')?.addEventListener('click', doLoad);
    }

    function loadDailyDetail(date) {
      const cont = document.getElementById('dailyContent'); if (!cont) return;
      cont.innerHTML = '<div class="loading">불러오는 중…</div>';
      apiGet(`/api/teacher/daily-detail?grade=${ACTIVE_GRADE}&cls=${CLS}&date=${date}`)
        .then(res => {
          if (!res || !res.ok) { cont.innerHTML = '<div class="loading">로드 실패</div>'; return; }

          if (CLS === 0 && ACTIVE_GRADE !== 0 && res.classBreakdown) {
            cont.innerHTML = renderClassBreakdown(date, res.classBreakdown, 'daily');
            attachBreakdownHandlers(cont);
            return;
          }

          const label = `${gradeName(ACTIVE_GRADE)} ${clsName(CLS)}`;
          const p1 = res.period1_full || { expected: res.period1.map(s => ({...s, 상태: '출석'})), unexpected: [] };
          const p2 = res.period2_full || { expected: res.period2.map(s => ({...s, 상태: '출석'})), unexpected: [] };

          const p1PresentCount = p1.expected.filter(s => s.상태 === '출석').length + p1.unexpected.length;
          const p2PresentCount = p2.expected.filter(s => s.상태 === '출석').length + p2.unexpected.length;

          cont.innerHTML =
            `<div class="summary-row">${label} · ${escapeHtml(date)} · 1교시 출석 <b>${p1PresentCount}</b>명 · 2교시 출석 <b>${p2PresentCount}</b>명</div>` +
            renderPeriodCard('1교시', p1, date, ACTIVE_GRADE) +
            renderPeriodCard('2교시', p2, date, ACTIVE_GRADE);
          attachMemoHandlers(cont);
        })
        .catch(() => { cont.innerHTML = '<div class="loading">로드 실패</div>'; });
    }

    /* ────────────────────────────────────────────────
     * 메모 기능
     * ──────────────────────────────────────────────── */
    function openMemoModal(data) {
      currentMemoTarget = data;
      document.getElementById('memoModalTitle').textContent = `${data.학번} ${data.이름} · ${data.period}교시`;
      document.getElementById('memoInput').value = data.memo || '';
      document.getElementById('memoModal').style.display = 'flex';
      setTimeout(() => document.getElementById('memoInput')?.focus(), 80);
    }

    function closeMemoModal() {
      document.getElementById('memoModal').style.display = 'none';
      currentMemoTarget = null;
    }

    function saveMemo(memoText) {
      if (!currentMemoTarget) return;
      const data = currentMemoTarget;
      closeMemoModal();
      apiPost('/api/teacher/memo', {
        grade: data.grade,
        date: data.date,
        period: data.period,
        학번: Number(data.학번),
        이름: data.이름,
        상태: data.상태,
        memo: memoText,
      }).then(res => {
        if (res.ok) {
          showToast(memoText ? '메모가 저장되었습니다.' : '메모가 삭제되었습니다.');
          reloadCurrentView(data.date);
        } else {
          showToast('저장 실패', 'error');
        }
      }).catch(() => showToast('저장 실패', 'error'));
    }

    function reloadCurrentView(date) {
      const activeTab = document.querySelector('#subTabBtns .tab-btn.active')?.dataset.tab;
      if (!activeTab || activeTab === 'today') {
        cachedDashboard = null;
        loadDashboard();
      } else if (activeTab === 'daily') {
        loadDailyDetail(date);
      }
    }

    function attachMemoHandlers(container) {
      let longPressTimer = null;
      let longPressTriggered = false;

      container.querySelectorAll('.memo-editable').forEach(li => {
        const data = {
          학번: li.dataset.학번,
          이름: li.dataset.이름,
          상태: li.dataset.상태,
          period: li.dataset.period,
          date: li.dataset.date,
          grade: li.dataset.grade,
          memo: li.querySelector('.memo-text')?.textContent || '',
        };

        li.addEventListener('contextmenu', e => {
          e.preventDefault();
          openMemoModal(data);
        });

        li.addEventListener('touchstart', () => {
          longPressTriggered = false;
          longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            openMemoModal(data);
          }, 600);
        }, { passive: true });

        li.addEventListener('touchend', () => clearTimeout(longPressTimer));
        li.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        li.addEventListener('click', e => {
          if (longPressTriggered) { e.preventDefault(); e.stopPropagation(); longPressTriggered = false; }
        });
      });
    }

    function initMemoModal() {
      document.getElementById('memoSaveBtn')?.addEventListener('click', () => {
        saveMemo(document.getElementById('memoInput')?.value?.trim() || '');
      });
      document.getElementById('memoCancelBtn')?.addEventListener('click', closeMemoModal);
      document.getElementById('memoClearBtn')?.addEventListener('click', () => saveMemo(''));
      document.getElementById('memoModal')?.addEventListener('click', e => {
        if (e.target.id === 'memoModal') closeMemoModal();
      });
      document.getElementById('memoInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveMemo(e.target.value.trim());
        if (e.key === 'Escape') closeMemoModal();
      });
    }

    /* ── 월별 매트릭스 ── */
    function setupMatrixSelect() {
      const sel = document.getElementById('matrixMonth'); if (!sel) return;
      sel.innerHTML = monthOptions().map(o => `<option value="${o}">${o}</option>`).join('');
      sel.value = todayYM();
      sel.addEventListener('change', () => loadMatrix(sel.value));
      document.getElementById('matrixReload')?.addEventListener('click', () => loadMatrix(sel.value));
    }

    function loadMatrix(ym) {
      const cont = document.getElementById('matrixContent'); if (!cont) return;
      cont.innerHTML = '<div class="loading">불러오는 중…</div>';
      apiGet(`/api/teacher/matrix?grade=${ACTIVE_GRADE}&cls=${CLS}&ym=${ym}`)
        .then(res => {
          if (!res || !res.ok) { cont.innerHTML = '<div class="loading">로드 실패</div>'; return; }
          renderMatrix(res);
        })
        .catch(() => { cont.innerHTML = '<div class="loading">로드 실패</div>'; });
    }

    function renderMatrix(data) {
      const cont = document.getElementById('matrixContent'); if (!cont) return;
      if (!data.dates || data.dates.length === 0) { cont.innerHTML = '<div class="loading">평일이 없습니다</div>'; return; }
      let header = '<tr><th class="sticky-col">학생</th>';
      data.dates.forEach(d => { header += `<th class="day-header" colspan="2">${Number(d.substring(8,10))}일</th>`; });
      header += '</tr><tr><th class="sticky-col"></th>';
      data.dates.forEach(() => { header += '<th>1</th><th>2</th>'; });
      header += '</tr>';
      let body = '';
      data.students.forEach(s => {
        body += `<tr><td class="sticky-col name">${escapeHtml(s.이름)}<br><small style="color:#64748b">${s.학번}</small></td>`;
        data.dates.forEach(d => {
          [1, 2].forEach(p => {
            const k = s.학번 + '|' + d + '|' + p;
            const st = data.cells[k]; const memo = data.memos[k];
            const cls2 = st === '출석' ? 'cell-present' : 'cell-absent';
            const memoCls = memo ? ' has-memo' : '';
            const mark = st === '출석' ? '●' : '✕';
            const title = memo ? ` title="${escapeHtml(memo)}"` : '';
            body += `<td class="${cls2}${memoCls}"${title}>${mark}</td>`;
          });
        });
        body += '</tr>';
      });
      cont.innerHTML =
        `<div class="matrix-wrap"><table class="matrix-table"><thead>${header}</thead><tbody>${body}</tbody></table></div>` +
        `<div style="margin-top:8px;font-size:12px;color:var(--color-muted)">● 출석 / ✕ 결석 · 노란 배경: 메모 있음</div>`;
    }

    /* ────────────────────────────────────────────────
     * 관리자 전체 학년 뷰
     * ──────────────────────────────────────────────── */
    function setupAllGradesTabs() {
      const dateBtn = document.getElementById('allTab-date');
      const monthlyBtn = document.getElementById('allTab-monthly');
      if (!dateBtn || !monthlyBtn) return;
      dateBtn.addEventListener('click', () => {
        dateBtn.classList.add('active'); monthlyBtn.classList.remove('active');
        document.getElementById('all-panel-date').style.display = '';
        document.getElementById('all-panel-monthly').style.display = 'none';
      });
      monthlyBtn.addEventListener('click', () => {
        monthlyBtn.classList.add('active'); dateBtn.classList.remove('active');
        document.getElementById('all-panel-date').style.display = 'none';
        document.getElementById('all-panel-monthly').style.display = '';
        const sel = document.getElementById('allMonthlyMonth');
        loadAllGradesMonthly(sel?.value || todayYM());
      });
    }

    function setupAllDateSelect() {
      const monthSel = document.getElementById('allDateMonth');
      const daySel   = document.getElementById('allDateDay');
      if (!monthSel || !daySel) return;
      monthSel.innerHTML = monthOptions().map(o => `<option value="${o}">${o}</option>`).join('');
      monthSel.value = todayYM();
      function updateDays() {
        const [y, m] = (monthSel.value || todayYM()).split('-').map(Number);
        const last = new Date(y, m, 0).getDate(); daySel.innerHTML = '';
        for (let d = 1; d <= last; d++) { const opt = document.createElement('option'); opt.value = pad(d); opt.textContent = d + '일'; daySel.appendChild(opt); }
        const now = new Date(); const curYM = now.getFullYear() + '-' + pad(now.getMonth()+1);
        daySel.value = (monthSel.value === curYM) ? pad(now.getDate()) : pad(last);
      }
      updateDays();
      monthSel.addEventListener('change', updateDays);
      daySel.addEventListener('change', loadAllGrades);
      document.getElementById('allDateReload')?.addEventListener('click', loadAllGrades);
    }

    function setupAllMonthlySelect() {
      const sel = document.getElementById('allMonthlyMonth'); if (!sel) return;
      sel.innerHTML = monthOptions().map(o => `<option value="${o}">${o}</option>`).join('');
      sel.value = todayYM();
      sel.addEventListener('change', () => loadAllGradesMonthly(sel.value));
      document.getElementById('allMonthlyReload')?.addEventListener('click', () => loadAllGradesMonthly(sel.value));
    }

    function loadAllGrades() {
      const cont = document.getElementById('allGradesContent'); if (!cont) return;
      const monthSel = document.getElementById('allDateMonth');
      const daySel   = document.getElementById('allDateDay');
      const date = (monthSel?.value && daySel?.value) ? monthSel.value + '-' + daySel.value : null;
      cont.innerHTML = '<div class="loading">불러오는 중…</div>';
      apiGet(`/api/teacher/all-grades${date ? '?date=' + date : ''}`)
        .then(res => {
          if (!res || !res.ok) { if (res?.error === 'INVALID_TOKEN') { clearToken(); showLogin(); } cont.innerHTML = '<div class="loading">로드 실패</div>'; return; }
          renderAllGrades(res);
        })
        .catch(() => { cont.innerHTML = '<div class="loading">로드 실패</div>'; });
    }

    function renderAllGrades(data) {
      const cont = document.getElementById('allGradesContent'); if (!cont) return;
      let html = `<div class="summary-row">전체 현황 · ${escapeHtml(data.date)}</div>`;
      html += '<table><thead><tr><th>학년</th><th>반</th><th>전체</th><th>참가자</th><th>1교시</th><th>2교시</th></tr></thead><tbody>';
      let sumTotal = 0, sumPart = 0, sumP1 = 0, sumP2 = 0;
      data.classes.forEach(c => {
        sumTotal += c.total; sumPart += c.participants; sumP1 += c.present1; sumP2 += c.present2;
        const detailId = 'plist-' + c.grade + '-' + c.cls;
        html += `<tr class="cls-summary-row" data-detail="${detailId}">
          <td><b>${c.grade}학년</b></td><td>${c.cls}반</td><td>${c.total}</td>
          <td class="participants-cell">${c.participants} <span class="toggle-arrow">▾</span></td>
          <td>${c.present1}</td><td>${c.present2}</td></tr>`;
        function makeChips(list) {
          if (!list.length) return '<span style="color:var(--color-muted)">출석자 없음</span>';
          return list.map(s => `<span class="participant-chip">${escapeHtml(s.이름)}<small>${s.학번}</small></span>`).join('');
        }
        html += `<tr id="${detailId}" class="cls-detail-row" style="display:none"><td colspan="6">
          <div style="margin-bottom:8px"><b style="font-size:13px;color:var(--color-primary)">1교시 출석</b>
          <div class="participant-chips" style="margin-top:4px">${makeChips(c.participantList1||[])}</div></div>
          <div><b style="font-size:13px;color:var(--color-primary)">2교시 출석</b>
          <div class="participant-chips" style="margin-top:4px">${makeChips(c.participantList2||[])}</div></div>
          </td></tr>`;
      });
      html += `<tr class="total-row"><td colspan="2">합계</td><td>${sumTotal}</td><td>${sumPart}</td><td>${sumP1}</td><td>${sumP2}</td></tr>`;
      html += '</tbody></table><p class="all-table-hint">반 행을 클릭하면 출석자 명단을 확인합니다.</p>';
      cont.innerHTML = html;
      cont.querySelectorAll('.cls-summary-row').forEach(row => {
        row.addEventListener('click', () => {
          const detail = document.getElementById(row.dataset.detail); if (!detail) return;
          const open = detail.style.display !== 'none';
          detail.style.display = open ? 'none' : '';
          row.querySelector('.toggle-arrow').textContent = open ? '▾' : '▴';
        });
      });
    }

    function loadAllGradesMonthly(ym) {
      const cont = document.getElementById('allMonthlyContent'); if (!cont) return;
      cont.innerHTML = '<div class="loading">불러오는 중…</div>';
      apiGet(`/api/teacher/all-grades-monthly?ym=${ym}`)
        .then(res => {
          if (!res || !res.ok) { cont.innerHTML = '<div class="loading">로드 실패</div>'; return; }
          renderAllGradesMonthly(res);
        })
        .catch(() => { cont.innerHTML = '<div class="loading">로드 실패</div>'; });
    }

    function renderAllGradesMonthly(data) {
      const cont = document.getElementById('allMonthlyContent'); if (!cont) return;
      if (!data.dates || data.dates.length === 0) { cont.innerHTML = '<div class="loading">해당 월에 평일이 없습니다</div>'; return; }
      const [y, m] = data.yearMonth.split('-');
      let html = `<div class="summary-row">전체 현황 · ${Number(y)}년 ${Number(m)}월</div>`;
      html += '<div class="matrix-wrap"><table class="matrix-table"><thead><tr><th class="sticky-col">학년/반</th>';
      data.dates.forEach(d => { html += `<th>${Number(d.substring(8,10))}일</th>`; });
      html += '<th>합계</th></tr></thead><tbody>';
      const classTotals = {};
      data.classes.forEach(c => { classTotals[c.grade + '_' + c.cls] = 0; });
      let grandTotal = 0;
      data.classes.forEach(c => {
        const key = c.grade + '_' + c.cls;
        let rowTotal = 0;
        html += `<tr><td class="sticky-col"><b>${c.grade}학년 ${c.cls}반</b></td>`;
        data.dates.forEach(date => {
          const d = data.data[date] && data.data[date][key];
          const count = d ? d.participants : 0;
          classTotals[key] = (classTotals[key] || 0) + count;
          rowTotal += count;
          html += `<td class="${count > 0 ? 'cell-present-bg' : ''}">${count}</td>`;
        });
        grandTotal += rowTotal;
        html += `<td><b>${rowTotal}</b></td></tr>`;
      });
      html += '<tr class="total-row"><td class="sticky-col">합계</td>';
      data.dates.forEach(() => { html += '<td></td>'; });
      html += `<td><b>${grandTotal}</b></td></tr>`;
      html += '</tbody></table></div><p class="all-table-hint">참가자 = 해당일 출석 기록이 있는 학생 수</p>';
      cont.innerHTML = html;
    }

    /* ────────────────────────────────────────────────
     * 앱 시작
     * ──────────────────────────────────────────────── */
    const existing = getToken();
    if (existing) {
      const payload = parseJwt(existing);
      if (payload) { enterDashboard(existing, payload.role, payload.grade); return; }
    }
    document.getElementById('loginScreen').style.display = 'flex';
    initLogin();
  }, []);

  return (
    <>
      <Head>
        <title>교사 — 자율학습 출석체크</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      <div id="loginScreen" className="login-wrap" style={{ display: 'none' }}>
        <div className="login-title">교사 대시보드</div>
        <div className="login-sub">
          PIN 4자리를 입력하세요<br />
          <span style={{ fontSize: 12 }}>관리자 / 1학년 / 2학년 / 3학년 계정 공용</span>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          className="pin-input"
          id="pinInput"
          autoComplete="off"
        />
        <div className="login-msg" id="loginMsg"></div>
      </div>

      <div id="teacherRoot"></div>
      <div className="toast-container" id="toastContainer"></div>
    </>
  );
}
