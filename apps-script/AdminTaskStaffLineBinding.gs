/**
 * 行政交辦：員工 LINE 綁定接線檔。
 *
 * 修改位置：
 * - 專案：目前接 LINE webhook 的 Apps Script 專案
 * - 檔案：包含 doPost(e) 的 webhook 檔案
 * - 精準位置：events.forEach(function(event) { ... }) 裡面，放在房客/帳單綁定邏輯之前
 *
 * 新增方式：
 * 1. 把本檔貼到 LINE webhook Apps Script 專案。
 * 2. 在既有 events.forEach 裡加入：
 *
 *    var adminTaskBind = tryHandleAdminTaskStaffBindingEvent_(event);
 *    if (adminTaskBind.handled) return;
 *
 * 影響範圍：
 * - 只處理員工傳「員工綁定 綁定代碼」的訊息。
 * - 只寫入 staff_contacts.line_user_id，不碰房客 LINE 綁定或 billing_accounts。
 */

var ADMIN_TASK_STAFF_BINDING_SPREADSHEET_ID = '1IPcwCNKbCRVz9JsvQYeYhZ4qQnEPzQZza8WE081VcJ0';
var ADMIN_TASK_STAFF_CONTACTS_SHEET = 'staff_contacts';
var ADMIN_TASK_STAFF_CONTACT_HEADERS = [
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

function tryHandleAdminTaskStaffBindingEvent_(event) {
  if (!event || event.type !== 'message') return { handled: false };
  if (!event.message || event.message.type !== 'text') return { handled: false };

  var lineUserId = event.source && event.source.userId ? String(event.source.userId) : '';
  var text = adminTaskStaffTrim_(event.message.text);
  if (!lineUserId || !text) return { handled: false };

  var bindCode = parseAdminTaskStaffBindingCode_(text);
  if (!bindCode) return { handled: false };

  var result = bindAdminTaskStaffLineUser_(lineUserId, bindCode, '');
  if (result.ok) {
    replyAdminTaskStaffText_(event.replyToken, [
      '員工 LINE 綁定完成',
      '',
      '姓名：' + result.staff.name,
      '角色：' + result.staff.role,
      '',
      '之後行政交辦會用這個 LINE 帳號提醒你。'
    ].join('\n'));
  } else {
    replyAdminTaskStaffText_(event.replyToken, [
      '找不到這個員工綁定代碼。',
      '',
      '請確認你輸入的是：員工綁定 綁定代碼',
      '例如：員工綁定 A01'
    ].join('\n'));
  }

  return { handled: true, ok: result.ok, bind_code: bindCode };
}

function parseAdminTaskStaffBindingCode_(text) {
  var match = String(text || '').match(/^(員工綁定|staff bind)\s+(.+)$/i);
  if (!match) return '';
  return adminTaskStaffTrim_(match[2]);
}

function bindAdminTaskStaffLineUser_(lineUserId, bindCode, displayName) {
  var sheet = getAdminTaskStaffContactsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No staff contacts' };

  var values = sheet.getRange(2, 1, lastRow - 1, ADMIN_TASK_STAFF_CONTACT_HEADERS.length).getValues();
  var codeIdx = ADMIN_TASK_STAFF_CONTACT_HEADERS.indexOf('bind_code');
  var lineIdx = ADMIN_TASK_STAFF_CONTACT_HEADERS.indexOf('line_user_id');
  var updatedIdx = ADMIN_TASK_STAFF_CONTACT_HEADERS.indexOf('updated_at');
  var displayIdx = ADMIN_TASK_STAFF_CONTACT_HEADERS.indexOf('line_display_name');
  var activeIdx = ADMIN_TASK_STAFF_CONTACT_HEADERS.indexOf('active');

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[codeIdx]).trim() !== String(bindCode).trim()) continue;
    if (String(row[activeIdx] || 'true').toLowerCase() === 'false') {
      return { ok: false, error: 'Inactive staff contact' };
    }

    var sheetRow = i + 2;
    sheet.getRange(sheetRow, lineIdx + 1).setValue(lineUserId);
    sheet.getRange(sheetRow, updatedIdx + 1).setValue(adminTaskStaffNow_());
    if (displayIdx >= 0) sheet.getRange(sheetRow, displayIdx + 1).setValue(displayName || '');

    row[lineIdx] = lineUserId;
    row[updatedIdx] = adminTaskStaffNow_();
    if (displayIdx >= 0) row[displayIdx] = displayName || '';
    return { ok: true, staff: adminTaskStaffRowToObject_(row) };
  }

  return { ok: false, error: 'Bind code not found' };
}

function getAdminTaskStaffContactsSheet_() {
  var ss = SpreadsheetApp.openById(ADMIN_TASK_STAFF_BINDING_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(ADMIN_TASK_STAFF_CONTACTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(ADMIN_TASK_STAFF_CONTACTS_SHEET);

  var headerRange = sheet.getRange(1, 1, 1, ADMIN_TASK_STAFF_CONTACT_HEADERS.length);
  var currentHeaders = headerRange.getValues()[0];
  var needsHeaders = false;
  for (var i = 0; i < ADMIN_TASK_STAFF_CONTACT_HEADERS.length; i++) {
    if (currentHeaders[i] !== ADMIN_TASK_STAFF_CONTACT_HEADERS[i]) needsHeaders = true;
  }
  if (needsHeaders) {
    headerRange.setValues([ADMIN_TASK_STAFF_CONTACT_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f1f5f9');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function adminTaskStaffRowToObject_(row) {
  var item = {};
  for (var i = 0; i < ADMIN_TASK_STAFF_CONTACT_HEADERS.length; i++) {
    item[ADMIN_TASK_STAFF_CONTACT_HEADERS[i]] = row[i] === undefined || row[i] === null ? '' : String(row[i]);
  }
  return item;
}

function replyAdminTaskStaffText_(replyToken, text) {
  if (!replyToken) return;
  var token = getAdminTaskStaffLineToken_();
  if (!token) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });
}

function getAdminTaskStaffLineToken_() {
  var props = PropertiesService.getScriptProperties();
  if (typeof LINE_CHANNEL_ACCESS_TOKEN !== 'undefined' && LINE_CHANNEL_ACCESS_TOKEN) return LINE_CHANNEL_ACCESS_TOKEN;
  if (typeof CHANNEL_ACCESS_TOKEN !== 'undefined' && CHANNEL_ACCESS_TOKEN) return CHANNEL_ACCESS_TOKEN;
  if (typeof LINE_TOKEN !== 'undefined' && LINE_TOKEN) return LINE_TOKEN;
  return props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') ||
    props.getProperty('CHANNEL_ACCESS_TOKEN') ||
    props.getProperty('LINE_TOKEN') ||
    '';
}

function adminTaskStaffTrim_(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function adminTaskStaffNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}
