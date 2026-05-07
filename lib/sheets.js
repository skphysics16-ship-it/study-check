const { google } = require('googleapis');
const { formatKST, gradeOf, classOf } = require('./utils');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET = { 1: '출석기록_1', 2: '출석기록_2', 3: '출석기록_3' };

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

module.exports = { readAttendance, saveAttendance };
