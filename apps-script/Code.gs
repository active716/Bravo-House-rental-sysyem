const SPREADSHEET_ID = '1IPcwCNKbCRVz9JsvQYeYhZ4qQnEPzQZza8WE081VcJ0';
const DASHBOARD_SPREADSHEET_ID = '1HiRGZEQiw9k0NZi59M87e-mjRCLUkgcHIrJRaeX9Cqo';
const REPAIRS_SHEET_NAME = 'repairs';
const ADMIN_TASKS_SHEET_NAME = 'admin_tasks';
const STAFF_CONTACTS_SHEET_NAME = 'staff_contacts';
const ADMIN_TASK_LOGS_SHEET_NAME = 'logs';
const ADMIN_TASK_PAGE_URL = 'https://active716.github.io/Bravo-House-rental-sysyem/';
const GAS_VERSION = '2026-07-02-nanzi-a-contracts-reports-v1';
const COMPLETED_REPAIR_RETENTION_DAYS = 7;
const NANZI_A_BUILDING = '楠梓A館';
const DASHBOARD_SHEETS = {
  rooms: 'rooms',
  tenants: 'tenants',
  invoices: 'invoices',
  meter: 'meter',
  available: 'available',
  logs: 'logs',
  config: 'config',
  srcTenant: 'src_tenant'
};
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
    const dashboardData = readDashboardData_();
    return output_({
      ok: true,
      ...dashboardData,
      repairs,
      tasks: repairs,
      admin_tasks: adminTasks,
      staff_contacts: staffContacts
    }, params.callback);
  }

  if (action === 'getDashboardData') {
    return output_({ ok: true, ...readDashboardData_() }, params.callback);
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
      supports_dashboard_data: true,
      completed_repair_retention_days: COMPLETED_REPAIR_RETENTION_DAYS
    }, params.callback);
  }

  if (action === 'upsert') {
    return handleUpsert_(requestFromParams_(params), params.callback);
  }

  return output_({ ok: false, error: 'Unsupported action: ' + action }, params.callback);
}

function getDashboardData() {
  return {
    ok: true,
    ...readDashboardData_(),
    repairs: readRepairs_(),
    tasks: readRepairs_(),
    admin_tasks: readAdminTasks_(),
    staff_contacts: readStaffContacts_()
  };
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

function readDashboardData_() {
  try {
    const ss = SpreadsheetApp.openById(DASHBOARD_SPREADSHEET_ID);
    const contracts = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.srcTenant)
      .map(normalizeContractForDashboard_)
      .filter(isNanziADashboardRecord_);
    const contractsByRoom = mapDashboardRowsByRoom_(contracts);
    const tenants = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.tenants)
      .map(normalizeTenantForDashboard_);
    tenants.forEach(tenant => {
      if (!isNanziADashboardRecord_(tenant)) return;
      const contract = contractsByRoom[tenant.room_id];
      if (!contract) return;
      if (!tenant.contract_start) tenant.contract_start = contract.contract_start;
      if (!tenant.contract_end) tenant.contract_end = contract.contract_end;
      if (!tenant.property_name) tenant.property_name = contract.property_name;
    });
    const invoices = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.invoices)
      .map(normalizeInvoiceForDashboard_);
    const meter = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.meter)
      .map(normalizeMeterForDashboard_);
    const available = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.available)
      .map(normalizeAvailableForDashboard_);
    let rooms = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.rooms)
      .map(normalizeRoomForDashboard_);
    const logs = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.logs)
      .map(normalizeLogForDashboard_);
    const config = readConfigForDashboard_(ss);

    if (!rooms.length) {
      rooms = buildRoomsFromDashboardRows_(tenants, available);
    }

    return {
      data_source: 'dashboard_spreadsheet',
      rooms,
      tenants,
      invoices,
      meter,
      meters: meter,
      available,
      contracts,
      reporting_months: buildNanziAReportingMonths_(invoices),
      logs,
      config
    };
  } catch (err) {
    return {
      data_source: 'dashboard_spreadsheet',
      rooms: [],
      tenants: [],
      invoices: [],
      meter: [],
      meters: [],
      available: [],
      contracts: [],
      reporting_months: { default_month: '', months: [] },
      logs: [],
      config: {},
      dashboard_error: err && err.message ? err.message : String(err)
    };
  }
}

function readOptionalSheetObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0].map(header => String(header || '').trim());
  return values.slice(1)
    .filter(row => row.some(cell => String(cell || '').trim() !== ''))
    .map((row, rowIndex) => {
      const item = { _rowNumber: rowIndex + 2 };
      headers.forEach((header, colIndex) => {
        if (!header) return;
        item[header] = row[colIndex] === undefined || row[colIndex] === null ? '' : String(row[colIndex]).trim();
      });
      return item;
    });
}

function readConfigForDashboard_(ss) {
  const rows = readOptionalSheetObjects_(ss, DASHBOARD_SHEETS.config);
  const config = {};
  rows.forEach(row => {
    const key = firstValue_(row, ['key', 'name', 'setting', '設定', '項目']);
    const value = firstValue_(row, ['value', '設定值', '值']);
    if (key) config[key] = value;
  });

  if (!Object.keys(config).length) {
    const sheet = ss.getSheetByName(DASHBOARD_SHEETS.config);
    if (sheet) {
      const values = sheet.getRange('A1:B20').getDisplayValues();
      values.forEach(row => {
        const key = String(row[0] || '').trim();
        if (key) config[key] = String(row[1] || '').trim();
      });
    }
  }

  return config;
}

function normalizeTenantForDashboard_(row) {
  const roomId = firstValue_(row, ['room_id', '房號', '房間', 'room']);
  const name = firstValue_(row, ['name', 'tenant_name', '姓名', '房客']);
  return {
    ...row,
    tenant_id: firstValue_(row, ['tenant_id', 'id']) || ('T-' + roomId),
    room_id: roomId,
    name,
    phone: firstValue_(row, ['phone', '手機', '電話', 'contact_phone']),
    rent: numberText_(firstValue_(row, ['rent', 'rent_amount', '租金'])),
    people: numberText_(firstValue_(row, ['people', '人數'])) || 1,
    status: firstValue_(row, ['status', '狀態']) || 'active',
    line_user_id: firstValue_(row, ['line_user_id', 'contact_line_user_id', 'LINE ID', 'LINE_ID']),
    contract_start: firstValue_(row, ['contract_start', '合約起日']),
    contract_end: firstValue_(row, ['contract_end', '合約迄日', '合約到期']),
    billing_account: firstValue_(row, ['billing_account', '帳單對象', '合併帳單名稱']),
    billing_contact: firstValue_(row, ['billing_contact', '帳務窗口', '收件人']),
    billing_contact_phone: firstValue_(row, ['billing_contact_phone', '收件電話']),
    billing_line_user_id: firstValue_(row, ['billing_line_user_id', 'contact_line_user_id']),
    rent_role: firstValue_(row, ['rent_role', '租金計算']),
    note: firstValue_(row, ['note', '備註'])
  };
}

function normalizeContractForDashboard_(row) {
  const roomId = firstValue_(row, ['room_id', '房號', '房間', 'room']);
  const propertyName = firstValue_(row, ['property_name', 'building', '館別', '大樓']) || extractDashboardBuilding_(roomId);
  const name = firstValue_(row, ['name', 'tenant_name', '姓名', '房客']);
  return {
    ...row,
    contract_id: firstValue_(row, ['contract_id', 'id']) || ('CONTRACT-' + roomId),
    room_id: roomId,
    property_name: propertyName,
    name,
    phone: firstValue_(row, ['phone', '手機', '電話', 'contact_phone']),
    rent: numberText_(firstValue_(row, ['rent', 'rent_amount', '租金'])),
    status: firstValue_(row, ['status', '狀態']) || 'active',
    contract_start: firstValue_(row, ['contract_start', '合約起日', '起租日', '租約起日']),
    contract_end: firstValue_(row, ['contract_end', '合約迄日', '合約到期', '租約到期日', '到期日'])
  };
}

function normalizeInvoiceForDashboard_(row) {
  const yyyymm = normalizeDashboardMonth_(firstValue_(row, ['yyyymm', 'billing_month', '月份']));
  const rent = numberText_(firstValue_(row, ['rent', 'rent_amount', '租金']));
  const electricity = numberText_(firstValue_(row, ['electricity', 'electric_fee', '電費']));
  const water = numberText_(firstValue_(row, ['water', 'water_fee', '水費']));
  const lateFee = numberText_(firstValue_(row, ['late_fee', 'other_fee', '滯納金', '其他費用']));
  const total = numberText_(firstValue_(row, ['total', 'total_amount', 'invoice_total', '合計', '總金額'])) ||
    rent + electricity + water + lateFee;
  const status = firstValue_(row, ['status', 'invoice_status', '繳費狀態']);
  const paid = isDashboardPaid_(status) || isDashboardPaid_(firstValue_(row, ['paid', '已繳']));

  return {
    ...row,
    invoice_id: firstValue_(row, ['invoice_id', 'id']) || ('INV' + yyyymm + '-' + firstValue_(row, ['room_id', '房號'])),
    room_id: firstValue_(row, ['room_id', '房號']),
    tenant_name: firstValue_(row, ['tenant_name', 'name', '房客']),
    name: firstValue_(row, ['name', 'tenant_name', '房客']),
    billing_account: firstValue_(row, ['billing_account', 'billing_name', '帳單對象', '合併帳單名稱']),
    billing_contact: firstValue_(row, ['billing_contact', '帳務窗口', '收件人']),
    billing_contact_phone: firstValue_(row, ['billing_contact_phone', '收件電話']),
    billing_line_user_id: firstValue_(row, ['billing_line_user_id', 'line_user_id']),
    rent_role: firstValue_(row, ['rent_role', '租金計算']),
    billing_month: yyyymm,
    yyyymm,
    rent,
    electric_fee: electricity,
    electricity,
    water_fee: water,
    water,
    other_fee: lateFee,
    late_fee: lateFee,
    total_amount: total,
    total,
    status: paid ? 'paid' : (status || 'unpaid'),
    paid,
    sent: isDashboardPaid_(firstValue_(row, ['sent', '已發送'])) || !!firstValue_(row, ['billing_line_user_id', 'line_user_id']),
    due_date: firstValue_(row, ['due_date', '繳費期限']),
    paid_date: firstValue_(row, ['paid_date', '繳費日期']),
    note: firstValue_(row, ['note', '備註'])
  };
}

function normalizeMeterForDashboard_(row) {
  const yyyymm = normalizeDashboardMonth_(firstValue_(row, ['yyyymm', 'billing_month', '月份']));
  const prev = numberText_(firstValue_(row, ['prev_kwh', 'previous_reading', '上期度數']));
  const curr = numberText_(firstValue_(row, ['curr_kwh', 'current_reading', '本期度數']));
  const used = numberText_(firstValue_(row, ['used_kwh', 'usage', '使用度數'])) || Math.max(0, curr - prev);
  return {
    ...row,
    yyyymm,
    billing_month: yyyymm,
    room_id: firstValue_(row, ['room_id', '房號']),
    prev_kwh: prev,
    previous_reading: prev,
    curr_kwh: curr,
    current_reading: curr,
    used_kwh: used,
    usage: used,
    note: firstValue_(row, ['note', '備註'])
  };
}

function normalizeRoomForDashboard_(row) {
  const roomId = firstValue_(row, ['room_id', '房號', '房間']);
  return {
    ...row,
    room_id: roomId,
    property_name: firstValue_(row, ['property_name', 'building', '館別', '大樓']) || extractDashboardBuilding_(roomId),
    rent: numberText_(firstValue_(row, ['rent', '租金'])),
    status: normalizeDashboardRoomStatus_(firstValue_(row, ['status', '狀態'])),
    note: firstValue_(row, ['note', '備註'])
  };
}

function normalizeAvailableForDashboard_(row) {
  const roomId = firstValue_(row, ['room_id', '房號', '房間']);
  const building = firstValue_(row, ['property_name', 'building', '館別', '大樓']) || extractDashboardBuilding_(roomId);
  const rent = numberText_(firstValue_(row, ['rent', '租金', '月租']));
  return {
    ...row,
    room_id: roomId,
    '房號': roomId,
    property_name: building,
    '館別': building,
    rent,
    '租金': rent,
    status: normalizeDashboardRoomStatus_(firstValue_(row, ['status', '狀態']) || 'vacant'),
    note: firstValue_(row, ['note', '備註'])
  };
}

function normalizeLogForDashboard_(row) {
  return {
    ...row,
    color: firstValue_(row, ['color']) || 'blue',
    text: firstValue_(row, ['text', 'summary', 'message', '內容']) || firstValue_(row, ['type']),
    time: firstValue_(row, ['time', 'timestamp', 'created_at']) || ''
  };
}

function buildRoomsFromDashboardRows_(tenants, available) {
  const roomsById = {};
  tenants.forEach(tenant => {
    const roomId = tenant.room_id;
    if (!roomId || roomsById[roomId]) return;
    roomsById[roomId] = {
      room_id: roomId,
      property_name: extractDashboardBuilding_(roomId),
      rent: tenant.rent || 0,
      status: tenant.status === 'active' ? 'occupied' : normalizeDashboardRoomStatus_(tenant.status),
      note: tenant.note || ''
    };
  });
  available.forEach(item => {
    const roomId = item.room_id;
    if (!roomId) return;
    roomsById[roomId] = {
      ...roomsById[roomId],
      room_id: roomId,
      property_name: item.property_name || extractDashboardBuilding_(roomId),
      rent: item.rent || roomsById[roomId]?.rent || 0,
      status: normalizeDashboardRoomStatus_(item.status || 'vacant'),
      note: item.note || roomsById[roomId]?.note || ''
    };
  });
  return Object.keys(roomsById).sort().map(roomId => roomsById[roomId]);
}

function mapDashboardRowsByRoom_(rows) {
  const map = {};
  rows.forEach(row => {
    if (row.room_id && !map[row.room_id]) map[row.room_id] = row;
  });
  return map;
}

function isNanziADashboardRecord_(row) {
  const propertyName = String(row.property_name || row.building || row['館別'] || '').trim();
  const roomId = String(row.room_id || row['房號'] || '').trim();
  return propertyName === NANZI_A_BUILDING ||
    roomId.indexOf(NANZI_A_BUILDING) === 0 ||
    roomId.indexOf(NANZI_A_BUILDING) !== -1;
}

function buildNanziAReportingMonths_(invoices) {
  const counts = {};
  invoices
    .filter(isNanziADashboardRecord_)
    .forEach(invoice => {
      const month = normalizeDashboardMonth_(invoice.yyyymm || invoice.billing_month);
      if (!month) return;
      counts[month] = (counts[month] || 0) + 1;
    });

  const months = Object.keys(counts).sort().map(month => ({
    month,
    count: counts[month]
  }));
  const maxCount = months.reduce((max, item) => Math.max(max, item.count), 0);
  const completeMonths = months
    .filter(item => maxCount && item.count >= Math.ceil(maxCount * 0.8))
    .map(item => item.month);

  return {
    default_month: completeMonths.length ? completeMonths[completeMonths.length - 1] : '',
    months
  };
}

function firstValue_(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    const value = row[keys[i]];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function numberText_(value) {
  const cleaned = String(value || '').replace(/[$,，\s]/g, '');
  const numberValue = Number(cleaned);
  return isNaN(numberValue) ? 0 : numberValue;
}

function normalizeDashboardMonth_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})/);
  if (match) return match[1] + '-' + ('0' + match[2]).slice(-2);
  return text;
}

function isDashboardPaid_(value) {
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'paid' || text === '已繳' || text === '撌脩像';
}

function normalizeDashboardRoomStatus_(status) {
  const text = String(status || '').trim().toLowerCase();
  if (text === 'active' || text === 'occupied' || text === '已出租') return 'occupied';
  if (text === 'cleaning' || text === '整理中') return 'cleaning';
  return 'vacant';
}

function extractDashboardBuilding_(roomId) {
  const text = String(roomId || '').trim();
  const match = text.match(/^(.+?)(\d{2,4}|[A-Z]?\d+)$/);
  return match ? match[1] : text;
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
