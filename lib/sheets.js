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
    const records = rows
      .filter(r => r[0] && r[2])
      .map(r => ({
        날짜: String(r[0]),
        교시: Number(r[1]),
        학번: Number(r[2]),
        이름: String(r[3] || ''),
        상태: String(r[4] || '결석'),
        메모: String(r[5] || ''),
        기록시각: r[6] || '',
      }));
    return yearMonth ? records.filter(r => r.날짜.startsWith(yearMonth)) : records;
  } catch (err) {
    console.error('readAttendance error:', err.message);
    return [];
  }
}

// 출석 저장 (있으면 업데이트, 없으면 추가)
async function saveAttendance(grade, record) {
  const sheets = getClient();
  const sheetName = SHEET[grade];
  const { date, period, 학번, 이름, 상태, 메모 } = record;

  // 기존 행 탐색 (날짜·교시·학번 일치)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:C`,
  });
  const rows = resp.data.values || [];
  let foundRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === date && Number(r[1]) === Number(period) && Number(r[2]) === Number(학번)) {
      foundRow = i + 2; // 1-indexed, 헤더=row1
      break;
    }
  }

  const nowStr = formatKST(new Date());
  const rowData = [[date, String(period), String(학번), 이름, 상태, 메모 || '', nowStr]];

  if (foundRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${foundRow}:G${foundRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: rowData },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rowData },
    });
  }
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

// 해당 학년 일정 일괄 업데이트
async function saveSchedule(grade, scheduleData) {
  const sheets = getClient();
  const sheetName = SCHEDULE_SHEET[grade];
  
  let existingRows = [];
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A2:G`,
    });
    existingRows = resp.data.values || [];
  } catch (err) {
    console.warn(`[WARN] Could not read ${sheetName}. Assumed empty. (Error: ${err.message})`);
  }
  
  const existingMap = {};
  existingRows.forEach(r => { if (r[0]) existingMap[r[0]] = r; });
  
  // scheduleData 배열: { 학번, 이름, 월, 화, 수, 목, 금 }
  scheduleData.forEach(d => {
    existingMap[d.학번] = [
      String(d.학번), d.이름,
      d.월 ? 'O' : '', d.화 ? 'O' : '', d.수 ? 'O' : '', d.목 ? 'O' : '', d.금 ? 'O' : ''
    ];
  });
  
  const newValues = Object.values(existingMap).sort((a, b) => Number(a[0]) - Number(b[0]));
  const fullValues = [['학번', '이름', '월', '화', '수', '목', '금'], ...newValues];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:G`,
    valueInputOption: 'RAW',
    requestBody: { values: fullValues },
  });
  
  return { ok: true };
}

module.exports = { readAttendance, saveAttendance, readSchedule, saveSchedule };
