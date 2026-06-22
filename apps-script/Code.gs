const SPREADSHEET_ID = '1IPcwCNKbCRVz9JsvQYeYhZ4qQnEPzQZza8WE081VcJ0';
const REPAIRS_SHEET_NAME = 'repairs';
const ADMIN_TASKS_SHEET_NAME = 'admin_tasks';
const STAFF_CONTACTS_SHEET_NAME = 'staff_contacts';
const ADMIN_TASK_LOGS_SHEET_NAME = 'logs';
const ADMIN_TASK_PAGE_URL = 'https://active716.github.io/Bravo-House-rental-sysyem/';
const GAS_VERSION = '2026-06-22-admin-tasks-mvp-v1';
const COMPLETED_REPAIR_RETENTION_DAYS = 7;
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
const ADMIN_TASK_HEADERS = [
  'id',
  'task_type',
  'title',
  'desc',
  'assignee_id',
  'assignee_name',
  'due_date',
  'priority',
  'creator',
  'status',
  'created_at',
  'updated_at',
  'completed_at',
  'line_new_sent_at',
  'line_due_sent_at',
  'line_overdue_last_sent_at',
  'line_done_sent_at',
  'page_url',
  'source'
];
const STAFF_CONTACT_HEADERS = [
  'staff_id',
  'name',
  'role',
  'bind_code',
  'line_user_id',
  'active',
  'created_at',
  'updated_at',
  'line_display_name'
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'getAll';

  if (action === 'getAll') {
    const repairs = readRepairs_();
    const adminTasks = readAdminTasks_();
    const staffContacts = readStaffContacts_();
    return output_({ ok: true, repairs, tasks: repairs, admin_tasks: adminTasks, staff_contacts: staffContacts }, params.callback);
  }

  if (action === 'getRepairs') {
    const repairs = readRepairs_();
    return output_({ ok: true, repairs, tasks: repairs }, params.callback);
  }

  if (action === 'getAdminTaskData') {
    return output_({ ok: true, admin_tasks: readAdminTasks_(), staff_contacts: readStaffContacts_() }, params.callback);
  }

  if (action === 'sendAdminTaskReminders') {
    return output_(sendAdminTaskDeadlineReminders_(), params.callback);
  }

  if (action === 'health') {
    return output_({
      ok: true,
      version: GAS_VERSION,
      supports_get_upsert: true,
      supports_form_post: true,
      supports_admin_tasks: true,
      supports_staff_contacts: true,
      supports_admin_task_reminders: true,
      completed_repair_retention_days: COMPLETED_REPAIR_RETENTION_DAYS
    }, params.callback);
  }

  if (action === 'upsert') {
    return handleUpsert_(requestFromParams_(params), params.callback);
  }

  return output_({ ok: false, error: 'Unsupported action: ' + action }, params.callback);
}

function doPost(e) {
  const body = parseBody_(e);
  return handleUpsert_(body);
}

function handleUpsert_(body, callback) {
  const action = body.action || 'upsert';
  const table = body.table || 'tasks';

  if (action === 'sendAdminTaskReminders') {
    return output_(sendAdminTaskDeadlineReminders_(), callback);
  }

  if (action === 'upsert') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (table === 'tasks') {
        const repair = upsertRepair_(body.payload || {});
        return output_({ ok: true, repair }, callback);
      }
      if (table === 'admin_tasks') {
        const adminTask = upsertAdminTask_(body.payload || {});
        return output_({ ok: true, admin_task: adminTask }, callback);
      }
      if (table === 'staff_contacts') {
        const staffContact = upsertStaffContact_(body.payload || {});
        return output_({ ok: true, staff_contact: staffContact }, callback);
      }
      return output_({ ok: true, skipped: true, reason: 'Unsupported table: ' + table }, callback);
    } finally {
      lock.releaseLock();
    }
  }

  return output_({ ok: false, error: 'Unsupported action: ' + action }, callback);
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
  purgeExpiredCompletedRepairs_(sheet);
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
  purgeExpiredCompletedRepairs_(sheet);
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

function purgeExpiredCompletedRepairs_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const rows = sheet.getRange(2, 1, lastRow - 1, REPAIR_HEADERS.length).getValues();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - COMPLETED_REPAIR_RETENTION_DAYS);

  let removed = 0;
  const statusIdx = REPAIR_HEADERS.indexOf('status');
  const taskTypeIdx = REPAIR_HEADERS.indexOf('task_type');
  const completedIdx = REPAIR_HEADERS.indexOf('completed_at');
  const updatedIdx = REPAIR_HEADERS.indexOf('updated_at');
  const createdIdx = REPAIR_HEADERS.indexOf('created_at');

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const taskType = String(row[taskTypeIdx] || '').toLowerCase();
    const status = normalizeStatus_(row[statusIdx]);
    if (taskType !== 'repair' || status !== 'done') continue;

    const completedDate = parseRepairDate_(row[completedIdx] || row[updatedIdx] || row[createdIdx]);
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
    const dateValue = new Date(value.getTime());
    dateValue.setHours(0, 0, 0, 0);
    return dateValue;
  }

  const text = String(value).trim();
  const dateMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dateMatch) {
    return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
  }

  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function normalizeStatus_(status) {
  const value = String(status || '').toLowerCase();
  return value === 'done' || value === '完成' ? 'done' : 'pending';
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function getAdminTasksSheet_() {
  return getSheetWithHeaders_(ADMIN_TASKS_SHEET_NAME, ADMIN_TASK_HEADERS);
}

function getStaffContactsSheet_() {
  return getSheetWithHeaders_(STAFF_CONTACTS_SHEET_NAME, STAFF_CONTACT_HEADERS);
}

function getSheetWithHeaders_(sheetName, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  const needsHeaders = headers.some((header, idx) => currentHeaders[idx] !== header);

  if (needsHeaders) {
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readSheetObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .map(row => {
      const item = {};
      headers.forEach((header, idx) => {
        item[header] = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]);
      });
      return item;
    });
}

function readAdminTasks_() {
  return readSheetObjects_(getAdminTasksSheet_(), ADMIN_TASK_HEADERS)
    .filter(item => item.id && item.task_type === 'admin_task')
    .map(item => {
      item.task_id = item.id;
      return item;
    });
}

function readStaffContacts_() {
  return readSheetObjects_(getStaffContactsSheet_(), STAFF_CONTACT_HEADERS)
    .filter(item => item.staff_id || item.name || item.bind_code);
}

function findRowByFirstColumn_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return { row: i + 2 };
  }
  return null;
}

function findStaffContactRowByCode_(sheet, bindCode) {
  if (!bindCode) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, STAFF_CONTACT_HEADERS.length).getValues();
  const codeIdx = STAFF_CONTACT_HEADERS.indexOf('bind_code');
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][codeIdx]).trim() === String(bindCode).trim()) return { row: i + 2, item: rowToStaffContact_(values[i]) };
  }
  return null;
}

function rowToAdminTask_(row) {
  const item = {};
  ADMIN_TASK_HEADERS.forEach((header, idx) => {
    item[header] = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]);
  });
  item.task_id = item.id;
  return item;
}

function rowToStaffContact_(row) {
  const item = {};
  STAFF_CONTACT_HEADERS.forEach((header, idx) => {
    item[header] = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]);
  });
  return item;
}

function normalizeAdminTaskStatus_(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'done' || value === 'completed' || String(status) === '完成') return 'done';
  if (value === 'in_progress' || value === 'doing' || String(status) === '處理中') return 'in_progress';
  return 'pending';
}

function upsertStaffContact_(payload) {
  const sheet = getStaffContactsSheet_();
  const now = now_();
  const id = String(payload.staff_id || payload.id || ('SC' + Date.now())).trim();
  const existing = findRowByFirstColumn_(sheet, id) || findStaffContactRowByCode_(sheet, payload.bind_code);
  const existingItem = existing ? rowToStaffContact_(sheet.getRange(existing.row, 1, 1, STAFF_CONTACT_HEADERS.length).getValues()[0]) : {};
  const item = {
    staff_id: id,
    name: payload.name || existingItem.name || '',
    role: payload.role || existingItem.role || 'admin',
    bind_code: payload.bind_code || existingItem.bind_code || '',
    line_user_id: payload.line_user_id || existingItem.line_user_id || '',
    active: payload.active === false ? 'false' : String(payload.active || existingItem.active || 'true'),
    created_at: payload.created_at || existingItem.created_at || now,
    updated_at: now,
    line_display_name: payload.line_display_name || existingItem.line_display_name || ''
  };
  const rowValues = STAFF_CONTACT_HEADERS.map(header => item[header]);
  if (existing) sheet.getRange(existing.row, 1, 1, STAFF_CONTACT_HEADERS.length).setValues([rowValues]);
  else sheet.appendRow(rowValues);
  return item;
}

function upsertAdminTask_(payload) {
  const sheet = getAdminTasksSheet_();
  const now = now_();
  const id = String(payload.task_id || payload.id || ('AT' + Date.now())).trim();
  const existing = findRowByFirstColumn_(sheet, id);
  const existingItem = existing ? rowToAdminTask_(sheet.getRange(existing.row, 1, 1, ADMIN_TASK_HEADERS.length).getValues()[0]) : {};
  const nextStatus = normalizeAdminTaskStatus_(payload.status || existingItem.status || 'pending');
  const completedAt = nextStatus === 'done' ? (payload.completed_at || existingItem.completed_at || now) : '';
  let item = {
    id,
    task_type: 'admin_task',
    title: payload.title || existingItem.title || '',
    desc: payload.desc || payload.note || existingItem.desc || '',
    assignee_id: payload.assignee_id || existingItem.assignee_id || '',
    assignee_name: payload.assignee_name || existingItem.assignee_name || '',
    due_date: payload.due_date || existingItem.due_date || '',
    priority: payload.priority || existingItem.priority || 'normal',
    creator: payload.creator || existingItem.creator || '管理員',
    status: nextStatus,
    created_at: payload.created_at || existingItem.created_at || now,
    updated_at: payload.updated_at || now,
    completed_at: completedAt,
    line_new_sent_at: existingItem.line_new_sent_at || '',
    line_due_sent_at: existingItem.line_due_sent_at || '',
    line_overdue_last_sent_at: existingItem.line_overdue_last_sent_at || '',
    line_done_sent_at: existingItem.line_done_sent_at || '',
    page_url: payload.page_url || existingItem.page_url || ADMIN_TASK_PAGE_URL,
    source: payload.source || existingItem.source || 'github_pages'
  };

  let row = existing ? existing.row : null;
  writeAdminTaskRow_(sheet, row, item);
  if (!row) row = sheet.getLastRow();
  item = sendAdminTaskLineEvents_(sheet, row, item, existingItem);
  return Object.assign({}, item, { task_id: item.id });
}

function writeAdminTaskRow_(sheet, row, item) {
  const rowValues = ADMIN_TASK_HEADERS.map(header => item[header]);
  if (row) sheet.getRange(row, 1, 1, ADMIN_TASK_HEADERS.length).setValues([rowValues]);
  else sheet.appendRow(rowValues);
}

function sendAdminTaskLineEvents_(sheet, row, item, existingItem) {
  const wasExisting = !!existingItem.id;
  if (!wasExisting && !item.line_new_sent_at) {
    const assignee = getStaffContactById_(item.assignee_id);
    const sent = sendAdminTaskMessageToStaff_(assignee, buildAdminTaskLineMessage_('new', item));
    if (sent.ok) {
      item.line_new_sent_at = now_();
      writeAdminTaskRow_(sheet, row, item);
    }
  }

  const wasDone = normalizeAdminTaskStatus_(existingItem.status) === 'done';
  const isDone = normalizeAdminTaskStatus_(item.status) === 'done';
  if (!wasDone && isDone && !item.line_done_sent_at) {
    const sentCount = sendAdminTaskMessageToManagers_(buildAdminTaskLineMessage_('done', item));
    if (sentCount > 0) {
      item.line_done_sent_at = now_();
      writeAdminTaskRow_(sheet, row, item);
    }
  }

  return item;
}

function sendAdminTaskDeadlineReminders_() {
  const sheet = getAdminTasksSheet_();
  const tasks = readSheetObjects_(sheet, ADMIN_TASK_HEADERS).map(row => {
    row.task_id = row.id;
    return row;
  });
  const today = today_();
  let dueSent = 0;
  let overdueSent = 0;

  tasks.forEach((item, idx) => {
    if (!item.id || item.task_type !== 'admin_task') return;
    if (normalizeAdminTaskStatus_(item.status) === 'done') return;
    if (!item.due_date) return;

    const dueDate = String(item.due_date).slice(0, 10);
    const row = idx + 2;
    const assignee = getStaffContactById_(item.assignee_id);

    if (dueDate === today && !item.line_due_sent_at) {
      const sent = sendAdminTaskMessageToStaff_(assignee, buildAdminTaskLineMessage_('due', item));
      if (sent.ok) {
        item.line_due_sent_at = now_();
        writeAdminTaskRow_(sheet, row, item);
        dueSent++;
      }
    }

    if (dueDate < today && String(item.line_overdue_last_sent_at || '').slice(0, 10) !== today) {
      const sent = sendAdminTaskMessageToStaff_(assignee, buildAdminTaskLineMessage_('overdue', item));
      if (sent.ok) {
        item.line_overdue_last_sent_at = today;
        writeAdminTaskRow_(sheet, row, item);
        overdueSent++;
      }
    }
  });

  return { ok: true, due_sent: dueSent, overdue_sent: overdueSent, checked_at: now_() };
}

function getStaffContactById_(staffId) {
  const contacts = readStaffContacts_();
  for (let i = 0; i < contacts.length; i++) {
    if (String(contacts[i].staff_id) === String(staffId)) return contacts[i];
  }
  return null;
}

function getManagerLineUserIds_() {
  const ids = [];
  const propId = PropertiesService.getScriptProperties().getProperty('ADMIN_LINE_USER_ID');
  if (propId) ids.push(propId);
  readStaffContacts_().forEach(contact => {
    if (String(contact.active || 'true') === 'false') return;
    if (String(contact.role || '').toLowerCase() !== 'manager') return;
    if (contact.line_user_id) ids.push(contact.line_user_id);
  });
  return ids.filter((id, idx, arr) => id && arr.indexOf(id) === idx);
}

function buildAdminTaskLineMessage_(type, item) {
  const labels = {
    new: '新交辦',
    due: '今天截止',
    overdue: '交辦已逾期',
    done: '交辦完成'
  };
  return [
    '【' + (labels[type] || '行政交辦') + '】',
    '事項：' + (item.title || '(未命名)'),
    '負責：' + (item.assignee_name || '-'),
    '截止：' + (item.due_date || '-'),
    '狀態：' + normalizeAdminTaskStatus_(item.status),
    '',
    '到網頁查看/更新：',
    item.page_url || ADMIN_TASK_PAGE_URL
  ].join('\n');
}

function sendAdminTaskMessageToStaff_(staff, message) {
  if (!staff || !staff.line_user_id) return { ok: false, skipped: true, reason: 'Missing staff LINE ID' };
  return pushAdminTaskLineText_(staff.line_user_id, message);
}

function sendAdminTaskMessageToManagers_(message) {
  const ids = getManagerLineUserIds_();
  let sent = 0;
  ids.forEach(id => {
    const result = pushAdminTaskLineText_(id, message);
    if (result.ok) sent++;
  });
  return sent;
}

function pushAdminTaskLineText_(lineUserId, text) {
  const token = getAdminTaskLineToken_();
  if (!token) return { ok: false, error: 'Missing LINE channel access token' };
  const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }]
    }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const ok = code >= 200 && code < 300;
  appendAdminTaskLog_(ok ? 'adminTaskLinePush' : 'adminTaskLinePushError', lineUserId + ' | HTTP ' + code + ' | ' + response.getContentText());
  return { ok, code, body: response.getContentText() };
}

function getAdminTaskLineToken_() {
  const props = PropertiesService.getScriptProperties();
  if (typeof LINE_CHANNEL_ACCESS_TOKEN !== 'undefined' && LINE_CHANNEL_ACCESS_TOKEN) return LINE_CHANNEL_ACCESS_TOKEN;
  if (typeof CHANNEL_ACCESS_TOKEN !== 'undefined' && CHANNEL_ACCESS_TOKEN) return CHANNEL_ACCESS_TOKEN;
  if (typeof LINE_TOKEN !== 'undefined' && LINE_TOKEN) return LINE_TOKEN;
  return props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') ||
    props.getProperty('CHANNEL_ACCESS_TOKEN') ||
    props.getProperty('LINE_TOKEN') ||
    '';
}

function appendAdminTaskLog_(type, summary) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ADMIN_TASK_LOGS_SHEET_NAME) || ss.insertSheet(ADMIN_TASK_LOGS_SHEET_NAME);
  sheet.appendRow([now_(), type, summary]);
}

function installAdminTaskReminderTrigger() {
  ScriptApp.newTrigger('sendAdminTaskDeadlineReminders_')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}
