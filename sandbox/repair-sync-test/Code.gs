var SANDBOX_SPREADSHEET_ID = '1PuYj0_e1wGYfCkC6Z3mKRMChF6CN3oXVfOqARAAFSCc';
var SANDBOX_SHEET_NAME = 'repairs_sandbox';
var SANDBOX_VERSION = 'sandbox-2026-06-15-compatible-v1';
var COMPLETED_REPAIR_RETENTION_DAYS = 7;
var REPAIR_HEADERS = [
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
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'health';

  if (action === 'health') {
    return output_({
      ok: true,
      sandbox: true,
      version: SANDBOX_VERSION,
      spreadsheet_id: SANDBOX_SPREADSHEET_ID,
      sheet_name: SANDBOX_SHEET_NAME,
      supports_get_upsert: true,
      supports_form_post: true,
      completed_repair_retention_days: COMPLETED_REPAIR_RETENTION_DAYS
    }, params.callback);
  }

  if (action === 'getRepairs') {
    var repairs = readRepairs_();
    return output_({ ok: true, sandbox: true, repairs: repairs, tasks: repairs }, params.callback);
  }

  if (action === 'upsert') {
    return handleUpsert_(requestFromParams_(params), params.callback);
  }

  return output_({ ok: false, sandbox: true, error: 'Unsupported action: ' + action }, params.callback);
}

function doPost(e) {
  return handleUpsert_(parseBody_(e));
}

function handleUpsert_(body, callback) {
  body = body || {};
  var action = body.action || 'upsert';
  var table = body.table || 'tasks';

  if (table !== 'tasks') {
    return output_({ ok: true, sandbox: true, skipped: true, reason: 'Sandbox only syncs repair tasks.' }, callback);
  }

  if (action === 'upsert') {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var repair = upsertRepair_(body.payload || {});
      return output_({ ok: true, sandbox: true, repair: repair }, callback);
    } finally {
      lock.releaseLock();
    }
  }

  return output_({ ok: false, sandbox: true, error: 'Unsupported action: ' + action }, callback);
}

function requestFromParams_(params) {
  return {
    action: params.action || 'upsert',
    table: params.table || 'tasks',
    payload: parsePayloadParam_(params.payload)
  };
}

function parsePayloadParam_(payloadText) {
  if (!payloadText) return {};
  try {
    return JSON.parse(payloadText);
  } catch (err) {
    return {};
  }
}

function parseBody_(e) {
  if (e && e.parameter && (e.parameter.action || e.parameter.table || e.parameter.payload)) {
    return requestFromParams_(e.parameter);
  }
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function output_(data, callback) {
  var json = JSON.stringify(data);
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
  var ss = SpreadsheetApp.openById(SANDBOX_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SANDBOX_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SANDBOX_SHEET_NAME);

  var headerRange = sheet.getRange(1, 1, 1, REPAIR_HEADERS.length);
  var currentHeaders = headerRange.getValues()[0];
  var needsHeaders = REPAIR_HEADERS.some(function(header, idx) {
    return currentHeaders[idx] !== header;
  });

  if (needsHeaders) {
    headerRange.setValues([REPAIR_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readRepairs_() {
  var sheet = getRepairsSheet_();
  purgeExpiredCompletedRepairs_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, REPAIR_HEADERS.length).getValues();
  return values
    .map(function(row) {
      return rowToRepair_(row);
    })
    .filter(function(item) {
      return item.id && item.task_type === 'repair';
    });
}

function rowToRepair_(row) {
  var item = {};
  REPAIR_HEADERS.forEach(function(header, idx) {
    item[header] = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]);
  });
  item.task_id = item.id;
  item.date = item.created_at;
  item.onsite_notice = item.onsite_notice === 'true' || item.onsite_notice === true;
  return item;
}

function upsertRepair_(payload) {
  payload = payload || {};
  var sheet = getRepairsSheet_();
  purgeExpiredCompletedRepairs_(sheet);
  var now = now_();
  var id = String(payload.task_id || payload.id || ('SB' + Date.now())).trim();
  var existing = findRepairRow_(sheet, id);
  var existingItem = existing ? rowToRepair_(sheet.getRange(existing.row, 1, 1, REPAIR_HEADERS.length).getValues()[0]) : {};
  var nextStatus = normalizeStatus_(payload.status || existingItem.status || 'pending');
  var createdAt = payload.created_at || existingItem.created_at || now;
  var updatedAt = payload.updated_at || now;
  var completedAt = nextStatus === 'done' ? (payload.completed_at || existingItem.completed_at || now) : '';

  var item = {
    id: id,
    task_type: 'repair',
    room_id: payload.room_id || existingItem.room_id || 'SANDBOX-101',
    category: payload.category || payload.title || existingItem.category || 'sandbox test',
    desc: payload.desc || payload.note || existingItem.desc || '',
    reporter: payload.reporter || existingItem.reporter || 'sandbox',
    status: nextStatus,
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: completedAt,
    onsite_notice: true,
    source: payload.source || existingItem.source || 'sandbox_test_page'
  };

  var rowValues = REPAIR_HEADERS.map(function(header) {
    return item[header];
  });
  if (existing) {
    sheet.getRange(existing.row, 1, 1, REPAIR_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  item.task_id = item.id;
  item.date = item.created_at;
  return item;
}

function findRepairRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return { row: i + 2 };
  }
  return null;
}

function purgeExpiredCompletedRepairs_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var rows = sheet.getRange(2, 1, lastRow - 1, REPAIR_HEADERS.length).getValues();
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - COMPLETED_REPAIR_RETENTION_DAYS);

  var removed = 0;
  var statusIdx = REPAIR_HEADERS.indexOf('status');
  var taskTypeIdx = REPAIR_HEADERS.indexOf('task_type');
  var completedIdx = REPAIR_HEADERS.indexOf('completed_at');
  var updatedIdx = REPAIR_HEADERS.indexOf('updated_at');
  var createdIdx = REPAIR_HEADERS.indexOf('created_at');

  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    var taskType = String(row[taskTypeIdx] || '').toLowerCase();
    var status = normalizeStatus_(row[statusIdx]);
    if (taskType !== 'repair' || status !== 'done') continue;

    var completedDate = parseRepairDate_(row[completedIdx] || row[updatedIdx] || row[createdIdx]);
    if (completedDate && completedDate < cutoff) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }

  return removed;
}

function parseRepairDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    var dateValue = new Date(value.getTime());
    dateValue.setHours(0, 0, 0, 0);
    return dateValue;
  }

  var text = String(value).trim();
  var dateMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dateMatch) {
    return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function normalizeStatus_(status) {
  var value = String(status || '').toLowerCase();
  var doneText = String.fromCharCode(23436, 25104);
  return value === 'done' || value === doneText ? 'done' : 'pending';
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}
