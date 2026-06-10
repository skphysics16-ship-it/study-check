const { google } = require('googleapis');
const { formatKST, gradeOf, classOf } = require('./utils');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET = { 1: '출석기록_1', 2: '출석기록_2', 3: '출석기록_3' };
const SCHEDULE_SHEET = { 1: '일정_1', 2: '일정_2', 3: '일정_3' };

function getClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// 해당 학년·월의 출석기록 전체 읽기
async function readAttendance(grade, yearMonth) {
  const sheets = getClient();
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET[grade]}!A2:G`,
    });
    const rows = resp.data.values || [];
    // 같은 (날짜+교시+학번) 중 마지막 행을 진실로 사용 (append-only 방식 대응)
    const recordMap = new Map();
    rows
      .filter(r => r[0] && r[2])
      .forEach(r => {
        const key = `${r[0]}|${r[1]}|${r[2]}`;
        recordMap.set(key, {
          날짜: String(r[0]),
          교시: Number(r[1]),
          학번: Number(r[2]),
          이름: String(r[3] || ''),
          상태: String(r[4] || '결석'),
          메모: String(r[5] || ''),
          기록시각: r[6] || '',
        });
      });
    const records = Array.from(recordMap.values());
    return yearMonth ? records.filter(r => r.날짜.startsWith(yearMonth)) : records;
  } catch (err) {
    console.error('readAttendance error:', err.message);
    return [];
  }
}

// 출석 저장 (항상 append — read-before-write 제거로 동시성 문제 해소)
async function saveAttendance(grade, record) {
  const sheets = getClient();
  const { date, period, 학번, 이름, 상태, 메모 } = record;
  const nowStr = formatKST(new Date());

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET[grade]}!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[date, String(period), String(학번), 이름, 상태, 메모 || '', nowStr]] },
  });
  return { ok: true };
}

// 해당 학년 일정 전체 읽기
async function readSchedule(grade) {
  const sheets = getClient();
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SCHEDULE_SHEET[grade]}!A2:G`,
    });
    const rows = resp.data.values || [];
    const schedule = {};
    rows.forEach(r => {
      if (r[0]) {
        schedule[r[0]] = {
          월: r[2] === 'O' || r[2] === 'TRUE' || r[2] === 'true',
          화: r[3] === 'O' || r[3] === 'TRUE' || r[3] === 'true',
          수: r[4] === 'O' || r[4] === 'TRUE' || r[4] === 'true',
          목: r[5] === 'O' || r[5] === 'TRUE' || r[5] === 'true',
          금: r[6] === 'O' || r[6] === 'TRUE' || r[6] === 'true',
        };
      }
    });
    return schedule;
  } catch (err) {
    console.error('readSchedule error:', err.message);
    return {};
  }
}

// 해당 학년 일정 업데이트 — 해당 학생 행만 수정 (전체 재기록 대신 row-level update)
async function saveSchedule(grade, scheduleData) {
  const sheets = getClient();
  const sheetName = SCHEDULE_SHEET[grade];

  // A열만 읽어 학번→행번호 맵 생성 (읽기 비용 최소화)
  let existingRows = [];
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    });
    existingRows = resp.data.values || [];
  } catch (err) {
    console.warn(`[WARN] Could not read ${sheetName}. (Error: ${err.message})`);
  }

  // 빈 시트면 헤더 먼저 삽입
  if (existingRows.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['학번', '이름', '월', '화', '수', '목', '금']] },
    });
  }

  // 학번 → 시트 행번호 (1-indexed) 맵
  const rowMap = {};
  existingRows.forEach((r, i) => {
    if (i === 0) return; // 헤더 스킵
    if (r[0]) rowMap[r[0]] = i + 1;
  });

  const toUpdate = [];
  const toAppend = [];

  scheduleData.forEach(d => {
    const rowValues = [
      String(d.학번), d.이름,
      d.월 ? 'O' : '', d.화 ? 'O' : '', d.수 ? 'O' : '', d.목 ? 'O' : '', d.금 ? 'O' : ''
    ];
    const sheetRow = rowMap[String(d.학번)];
    if (sheetRow) {
      toUpdate.push({ range: `${sheetName}!A${sheetRow}:G${sheetRow}`, values: [rowValues] });
    } else {
      toAppend.push(rowValues);
    }
  });

  // 기존 행 수정 (해당 행만 — 다른 반/교사가 저장한 행 건드리지 않음)
  if (toUpdate.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: toUpdate },
    });
  }

  // 신규 학생 추가
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: toAppend },
    });
  }

  return { ok: true };
}

module.exports = { readAttendance, saveAttendance, readSchedule, saveSchedule };
