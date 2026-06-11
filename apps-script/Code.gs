const SPREADSHEET_ID = '1IPcwCNKbCRVz9JsvQYeYhZ4qQnEPzQZza8WE081VcJ0';
const REPAIRS_SHEET_NAME = 'repairs';
const REPAIR_HEADERS = [
  'id',
  'task_type',
  'room_id',
  'category',
  'desc',
  'reporter',
  'status',
  'created_at',
  'updated_at',
  'completed_at',
  'onsite_notice',
  'source'
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'getAll';

  if (action === 'getAll' || action === 'getRepairs') {
    const repairs = readRepairs_();
    return output_({ ok: true, repairs, tasks: repairs }, params.callback);
  }

  return output_({ ok: false, error: 'Unsupported action: ' + action }, params.callback);
}

function doPost(e) {
  const body = parseBody_(e);
  const action = body.action || 'upsert';
  const table = body.table || 'tasks';

  if (table !== 'tasks') {
    return output_({ ok: true, skipped: true, reason: 'This web app only syncs repair tasks.' });
  }

  if (action === 'upsert') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const repair = upsertRepair_(body.payload || {});
      return output_({ ok: true, repair });
    } finally {
      lock.releaseLock();
    }
  }

  return output_({ ok: false, error: 'Unsupported action: ' + action });
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getRepairsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(REPAIRS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(REPAIRS_SHEET_NAME);

  const headerRange = sheet.getRange(1, 1, 1, REPAIR_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = REPAIR_HEADERS.some((header, idx) => currentHeaders[idx] !== header);

  if (needsHeaders) {
    headerRange.setValues([REPAIR_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readRepairs_() {
  const sheet = getRepairsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, REPAIR_HEADERS.length).getValues();
  return values
    .map(row => rowToRepair_(row))
    .filter(item => item.id && item.task_type === 'repair');
}

function rowToRepair_(row) {
  const item = {};
  REPAIR_HEADERS.forEach((header, idx) => {
    item[header] = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]);
  });
  item.task_id = item.id;
  item.date = item.created_at;
  item.onsite_notice = item.onsite_notice === 'true' || item.onsite_notice === true;
  return item;
}

function upsertRepair_(payload) {
  const sheet = getRepairsSheet_();
  const now = now_();
  const id = String(payload.task_id || payload.id || ('MR' + Date.now())).trim();
  const existing = findRepairRow_(sheet, id);
  const existingItem = existing ? rowToRepair_(sheet.getRange(existing.row, 1, 1, REPAIR_HEADERS.length).getValues()[0]) : {};
  const nextStatus = normalizeStatus_(payload.status || existingItem.status || 'pending');
  const createdAt = payload.created_at || existingItem.created_at || now;
  const updatedAt = payload.updated_at || now;
  const completedAt = nextStatus === 'done' ? (payload.completed_at || existingItem.completed_at || now) : '';

  const item = {
    id,
    task_type: 'repair',
    room_id: payload.room_id || existingItem.room_id || '',
    category: payload.category || payload.title || existingItem.category || '維修問題',
    desc: payload.desc || payload.note || existingItem.desc || '',
    reporter: payload.reporter || existingItem.reporter || '客服人員',
    status: nextStatus,
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: completedAt,
    onsite_notice: true,
    source: payload.source || existingItem.source || 'github_pages'
  };

  const rowValues = REPAIR_HEADERS.map(header => item[header]);
  if (existing) {
    sheet.getRange(existing.row, 1, 1, REPAIR_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return {
    ...item,
    task_id: item.id,
    date: item.created_at
  };
}

function findRepairRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return { row: i + 2 };
  }
  return null;
}

function normalizeStatus_(status) {
  const value = String(status || '').toLowerCase();
  return value === 'done' || value === '完成' ? 'done' : 'pending';
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}
