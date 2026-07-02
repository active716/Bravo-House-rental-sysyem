const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);
const TODAY=new Date();

// ══════════════════════════════════════════
//  ★ 請將你的 GAS Web App 網址貼在這裡 ★
// ══════════════════════════════════════════
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwDzpxuTFkUdQxzBEgdIzETqenKlDcKpN_AjKjG2IIRkls7BHZGNEF78lbbro-dJ2Pv/exec';
// ══════════════════════════════════════════
const HAS_GAS_WEB_APP = !GAS_WEB_APP_URL.includes('YOUR_SCRIPT_ID');
const GAS_REPAIR_TABLE_ONLY = true;
const LOCAL_STATE_KEY = 'rental_demo_state_v2';
const REPAIR_SYNC_QUEUE_KEY = 'repair_sync_queue_v1';
const ADMIN_TASK_PAGE_URL = 'https://active716.github.io/Bravo-House-rental-sysyem/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let repairSyncInFlight = false;

function fetchGasJSONP(action='getAll', params={}){
  if(!HAS_GAS_WEB_APP) return Promise.resolve({ ok:false, local:true });
  return new Promise((resolve, reject)=>{
    const callbackName = 'gas_repair_cb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
    const query = new URLSearchParams({ action, callback: callbackName, ...params });
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[callbackName];
      if(script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };
    const timer = setTimeout(()=>{
      cleanup();
      reject(new Error('雲端維修資料讀取逾時'));
    }, 12000);
    window[callbackName] = data => {
      cleanup();
      resolve(data || {});
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('雲端維修資料讀取失敗'));
    };
    script.src = GAS_WEB_APP_URL + '?' + query.toString();
    document.head.appendChild(script);
  });
}

function isRepairSyncBody(body){
  if(!body || body.table !== 'tasks') return false;
  const payload = body.payload || {};
  const id = String(payload.task_id || payload.id || '');
  return String(payload.task_type || '').toLowerCase() === 'repair' || id.startsWith('MR') || payload.onsite_notice === true;
}

function isAdminTaskSyncBody(body){
  if(!body || body.table !== 'admin_tasks') return false;
  const payload = body.payload || {};
  const id = String(payload.task_id || payload.id || '');
  return String(payload.task_type || '').toLowerCase() === 'admin_task' || id.startsWith('AT');
}

function isStaffContactSyncBody(body){
  return !!body && body.table === 'staff_contacts';
}

function isManagedSyncBody(body){
  return isRepairSyncBody(body) || isAdminTaskSyncBody(body) || isStaffContactSyncBody(body);
}

async function sendRepairJSONP(body){
  const payload = body?.payload || {};
  const data = await fetchGasJSONP(body?.action || 'upsert', {
    table: body?.table || 'tasks',
    payload: JSON.stringify(payload)
  });
  if(!data || data.ok === false){
    const errorText = data?.error || '維修同步失敗';
    if(String(errorText).includes('Unsupported action')){
      throw new Error('維修同步後端尚未更新，請重新部署 Apps Script Web App');
    }
    throw new Error(errorText);
  }
  return data;
}

function postRepairViaForm(body){
  if(!HAS_GAS_WEB_APP) return Promise.resolve({ ok:true, local:true });
  return new Promise((resolve, reject)=>{
    const frameName = 'repair_sync_frame_' + Date.now() + '_' + Math.floor(Math.random()*10000);
    const iframe = document.createElement('iframe');
    const form = document.createElement('form');
    let done = false;
    let submitted = false;
    const cleanup = () => {
      setTimeout(()=>{
        if(form.parentNode) form.parentNode.removeChild(form);
        if(iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 200);
    };
    const timer = setTimeout(()=>{
      if(done) return;
      done = true;
      cleanup();
      reject(new Error('背景同步送出逾時'));
    }, 15000);
    iframe.name = frameName;
    iframe.style.display = 'none';
    iframe.onload = () => {
      if(!submitted) return;
      if(done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve({ ok:true, formPost:true });
    };
    form.method = 'POST';
    form.action = GAS_WEB_APP_URL;
    form.target = frameName;
    form.style.display = 'none';
    const fields = {
      action: body?.action || 'upsert',
      table: body?.table || 'tasks',
      payload: JSON.stringify(body?.payload || {})
    };
    Object.entries(fields).forEach(([name, value])=>{
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    submitted = true;
    form.submit();
  });
}

function readRepairSyncQueue(){
  try{
    const rows = JSON.parse(localStorage.getItem(REPAIR_SYNC_QUEUE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch(err) {
    return [];
  }
}

function saveRepairSyncQueue(queue){
  try{
    localStorage.setItem(REPAIR_SYNC_QUEUE_KEY, JSON.stringify(queue.slice(-80)));
  } catch(err) {
    console.warn('saveRepairSyncQueue failed:', err);
  }
}

function repairSyncSignature(body){
  const payload = body?.payload || {};
  return JSON.stringify({
    action: body?.action || 'upsert',
    table: body?.table || 'tasks',
    task_id: payload.task_id || payload.id || '',
    status: payload.status || '',
    updated_at: payload.updated_at || '',
    completed_at: payload.completed_at || '',
    room_id: payload.room_id || '',
    category: payload.category || '',
    title: payload.title || '',
    desc: payload.desc || payload.note || '',
    assignee_id: payload.assignee_id || '',
    assignee_name: payload.assignee_name || '',
    due_date: payload.due_date || '',
    staff_id: payload.staff_id || '',
    bind_code: payload.bind_code || ''
  });
}

function repairIdFromBody(body){
  const payload = body?.payload || {};
  return String(payload.task_id || payload.id || payload.staff_id || '').trim();
}

function queueRepairSync(body){
  if(!HAS_GAS_WEB_APP || !isManagedSyncBody(body)) return { ok:true, local:true };
  const queue = readRepairSyncQueue();
  const signature = repairSyncSignature(body);
  if(!queue.some(job=>job.signature === signature)){
    queue.push({
      id: 'RS' + Date.now() + '_' + Math.floor(Math.random()*10000),
      signature,
      body,
      attempts: 0,
      created_at: new Date().toISOString()
    });
    saveRepairSyncQueue(queue);
  }
  scheduleRepairSyncQueue();
  return { ok:true, queued:true, body };
}

function setLocalRepairSyncState(body, state, error=''){
  const id = repairIdFromBody(body);
  if(!id) return;
  const table = body?.table || 'tasks';
  let item = null;
  if(table === 'admin_tasks') item = adminTasksData.find(t=>t.id===id || t.task_id===id);
  else if(table === 'staff_contacts') item = staffContactsData.find(s=>s.id===id || s.staff_id===id);
  else item = repairsData.find(r=>r.id===id || r.task_id===id);
  if(item){
    item.sync_status = state;
    item.sync_error = error;
    saveLocalState();
    if(table === 'admin_tasks') renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
    else if(table === 'staff_contacts') renderStaffContacts();
    else renderRepairs($('repairStatusFilter')?.value || 'all');
    renderDashboard();
  }
}

function scheduleRepairSyncQueue(delays=[900, 5000, 15000]){
  if(!HAS_GAS_WEB_APP) return;
  delays.forEach(delay=>setTimeout(()=>processRepairSyncQueue({silent:true}), delay));
}

function scheduleRepairCloudRefresh(delays=[2500, 7000, 16000]){
  if(!HAS_GAS_WEB_APP) return;
  delays.forEach(delay=>setTimeout(()=>loadCloudRepairs({silent:true, preservePending:true}), delay));
}

function scheduleAdminTaskCloudRefresh(delays=[2500, 7000, 16000]){
  if(!HAS_GAS_WEB_APP) return;
  delays.forEach(delay=>setTimeout(()=>loadCloudAdminTaskData({silent:true, preservePending:true}), delay));
}

async function verifyRepairCloudState(body){
  const id = repairIdFromBody(body);
  if(!id) return true;
  const payload = body?.payload || {};
  if(body?.table === 'admin_tasks' || body?.table === 'staff_contacts') {
    try{
      const data = await fetchGasJSONP('getAdminTaskData');
      if(!data || data.ok === false) return false;
      if(body.table === 'staff_contacts'){
        const rows = (data.staff_contacts || data.staffContacts || []).map(normalizeStaffContactRecord);
        return rows.some(s=>String(s.staff_id || s.id)===id || (payload.bind_code && s.bind_code===payload.bind_code));
      }
      const rows = (data.admin_tasks || data.adminTasks || []).map(normalizeAdminTaskRecord);
      const item = rows.find(t=>String(t.id || t.task_id)===id);
      if(!item) return false;
      if(payload.status) return adminTaskStatusKey(item) === adminTaskStatusKey(payload);
      return true;
    } catch(err) {
      return false;
    }
  }
  const data = await fetchGasJSONP('getRepairs');
  const rows = data.repairs || (data.tasks || []).filter(t=>String(t.task_type || '').toLowerCase() === 'repair');
  const item = rows.map(normalizeRepairRecord).find(r=>r.id===id);
  if(!item) return false;
  if(payload.status){
    return repairStatusKey(item) === (String(payload.status).toLowerCase() === 'done' ? 'done' : 'pending');
  }
  return true;
}

async function sendRepairWithFallback(body){
  const needsCloudVerification = body?.table === 'admin_tasks' || body?.table === 'staff_contacts';
  try{
    const result = await sendRepairJSONP(body);
    if(needsCloudVerification){
      await sleep(1800);
      const verified = await verifyRepairCloudState(body);
      if(!verified) throw new Error('背景同步尚未確認，稍後會自動重試');
    }
    return result;
  } catch(jsonpErr) {
    console.warn('repair JSONP sync failed, fallback to form POST:', jsonpErr);
    await postRepairViaForm(body);
    await sleep(1800);
    const verified = await verifyRepairCloudState(body);
    if(!verified) throw new Error('背景同步尚未確認，稍後會自動重試');
    return { ok:true, formPost:true, verified:true };
  }
}

async function processRepairSyncQueue(options={}){
  if(!HAS_GAS_WEB_APP || repairSyncInFlight) return false;
  let queue = readRepairSyncQueue();
  if(!queue.length) return true;
  repairSyncInFlight = true;
  const nextQueue = [];
  let hadSuccess = false;
  try{
    for(const job of queue){
      try{
        await sendRepairWithFallback(job.body);
        setLocalRepairSyncState(job.body, 'synced');
        hadSuccess = true;
      } catch(err) {
        job.attempts = (Number(job.attempts) || 0) + 1;
        job.last_error = err.message || String(err);
        job.last_attempt_at = new Date().toISOString();
        nextQueue.push(job);
        setLocalRepairSyncState(job.body, job.attempts >= 4 ? 'error' : 'pending', job.last_error);
      }
    }
    saveRepairSyncQueue(nextQueue);
    if(hadSuccess) {
      scheduleRepairCloudRefresh();
      scheduleAdminTaskCloudRefresh();
    }
    if(nextQueue.length) {
      const delay = Math.min(90000, 8000 + Math.max(...nextQueue.map(job=>Number(job.attempts)||1)) * 6000);
      setTimeout(()=>processRepairSyncQueue({silent:true}), delay);
    }
    return nextQueue.length === 0;
  } finally {
    repairSyncInFlight = false;
  }
}

// ── 統一 API 呼叫函式 ───────────────────────
// GET:  apiRequest('GET')  → 呼叫 ?action=getAll
// POST: apiRequest('POST', {action,table,payload})
async function apiRequest(method='GET', body=null){
  if(!HAS_GAS_WEB_APP || (GAS_REPAIR_TABLE_ONLY && method !== 'GET' && !isManagedSyncBody(body))){
    await sleep(120);
    return { ok:true, local:true, body };
  }
  if(method !== 'GET' && isManagedSyncBody(body)){
    return queueRepairSync(body);
  }
  try{
    showLoading();
    let res;
    if(method==='GET'){
      res=await fetch(GAS_WEB_APP_URL+'?action=getAll',{redirect:'follow'});
    } else {
      res=await fetch(GAS_WEB_APP_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(body),
        redirect:'follow'
      });
    }
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  } catch(err){
    if(method !== 'GET' && HAS_GAS_WEB_APP){
      try{
        await fetch(GAS_WEB_APP_URL,{
          method:'POST',
          mode:'no-cors',
          body:JSON.stringify(body)
        });
        return { ok:true, noCors:true, body };
      } catch(noCorsErr) {
        console.warn('apiRequest no-cors fallback error:', noCorsErr);
      }
    }
    console.warn('apiRequest error:',err);
    throw err;
  } finally{
    hideLoading();
  }
}

// ── Toast 提示 ───────────────────────────────
function showToast(msg,type='success'){
  let el=$('toast');
  if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el);}
  el.textContent=msg;
  el.className='toast show toast-'+type;
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),3000);
}

// ── Loading 遮罩 ─────────────────────────────
function showLoading(){
  let el=$('loadingOverlay');
  if(!el){el=document.createElement('div');el.id='loadingOverlay';el.className='loading-overlay';el.innerHTML='<div class="loading-spinner"></div><p>載入中...</p>';document.body.appendChild(el);}
  el.style.display='flex';
}
function hideLoading(){const el=$('loadingOverlay');if(el)el.style.display='none';}

// ── Modal 控制 ───────────────────────────────
function openModal(id){const m=$(id);if(m){m.style.display='flex';m.classList.add('modal-open');}}
function closeModal(id){const m=$(id);if(m){m.style.display='none';m.classList.remove('modal-open');}}
function closeAllModals(){$$('.modal-overlay').forEach(m=>{m.style.display='none';m.classList.remove('modal-open');});}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});

// ── 工具與常數 ──────────────────────────────────────────
const extractBuilding=r=>{const m=String(r).match(/^(.+館)/);return m?m[1]:r};
const diffDays=(d)=>{
  if (!d) return 999;
  const t=new Date(d);
  if (isNaN(t.getTime())) return 999;
  return Math.ceil((t-TODAY)/(1000*60*60*24));
};
const fmt=n=>'$'+(Number(n) || 0).toLocaleString();
const escapeHtml=val=>String(val ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const normalizeYyyymm=val=>{
  if (!val) return '';
  if (val instanceof Date) {
    return val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0');
  }
  const str=String(val).trim();
  const m=str.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0');
  return str;
};
const truthy=val=>val===true||String(val).toLowerCase()==='true'||String(val)==='1'||String(val)==='已繳';
const isPaid=i=>truthy(i.paid)||String(i.status||'').toLowerCase()==='paid'||String(i.status||'')==='已繳';
const invoiceName=i=>i.name||i.tenant_name||'';
const invoiceRent=i=>Number(i.rent ?? i.rent_amount ?? 0) || 0;
const invoiceElectricity=i=>Number(i.electricity ?? i.electric_fee ?? 0) || 0;
const invoiceWater=i=>Number(i.water ?? i.water_fee ?? 0) || 0;
const invoiceLateFee=i=>Number(i.late_fee ?? i.other_fee ?? 0) || 0;
const invoiceTotal=i=>Number(i.total ?? i.total_amount ?? 0) || 0;
const rowValue=(row,keys)=>{
  for(const key of keys){
    const val=row?.[key];
    if(val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
};
const tenantMapByRoom=()=>{
  const map = new Map();
  tenantsData.filter(t=>t.status==='active').forEach(t=>{
    const id = String(t.room_id || '').trim();
    if(id && !map.has(id)) map.set(id, t);
  });
  return map;
};
const billingAccountName=(invoice, tenant=null)=>rowValue(invoice,['billing_account','帳單對象','合併帳單名稱','billing_group','account_name']) || rowValue(tenant,['billing_account','帳單對象','合併帳單名稱','billing_group','account_name']) || invoiceName(invoice) || rowValue(tenant,['name','tenant_name']) || '未命名帳單';
const billingContactName=(invoice, tenant=null)=>rowValue(invoice,['billing_contact','收件人','帳務窗口','contact_name']) || rowValue(tenant,['billing_contact','收件人','帳務窗口','contact_name']) || billingAccountName(invoice, tenant);
const billingGroupKey=(invoice, tenant=null)=>billingAccountName(invoice, tenant).replace(/\s+/g,'').toLowerCase();
const invoiceSent=(invoice, tenant=null)=>truthy(invoice.sent) || !!rowValue(invoice,['billing_line_user_id','line_user_id']) || !!rowValue(tenant,['billing_line_user_id','line_user_id']);
function buildBillingGroups(invoices){
  const tenantMap = tenantMapByRoom();
  const groups = new Map();
  invoices.forEach(invoice=>{
    const tenant = tenantMap.get(String(invoice.room_id || '').trim());
    const key = billingGroupKey(invoice, tenant);
    if(!groups.has(key)){
      groups.set(key, {
        key,
        account: billingAccountName(invoice, tenant),
        contact: billingContactName(invoice, tenant),
        rooms: [],
        rent: 0,
        electricity: 0,
        water: 0,
        lateFee: 0,
        total: 0,
        sent: false,
        allPaid: true,
        dueDate: invoice.due_date || '',
      });
    }
    const group = groups.get(key);
    const room = {
      room_id: invoice.room_id || '-',
      rent: invoiceRent(invoice),
      electricity: invoiceElectricity(invoice),
      water: invoiceWater(invoice),
      lateFee: invoiceLateFee(invoice),
      total: invoiceTotal(invoice),
      paid: isPaid(invoice)
    };
    group.rooms.push(room);
    group.rent += room.rent;
    group.electricity += room.electricity;
    group.water += room.water;
    group.lateFee += room.lateFee;
    group.total += room.total;
    group.sent = group.sent || invoiceSent(invoice, tenant);
    group.allPaid = group.allPaid && room.paid;
    if(!group.dueDate && invoice.due_date) group.dueDate = invoice.due_date;
  });
  return [...groups.values()].sort((a,b)=>a.account.localeCompare(b.account,'zh-Hant',{numeric:true}));
}
const roomKey=r=>String(r?.room_id || r?.['房號'] || '').trim();
const roomBuildingName=(roomId, room=null)=>room?.property_name||room?.['館別']||extractBuilding(roomId);

// ── 判斷執行環境 ────────────────────────────────────────
const IS_GAS = typeof google !== 'undefined' && google.script && google.script.run;

// ── 資料儲存中心（優先採用 Google Sheets 真實資料） ──────────
let tenantsData = [];
let invoicesData = [];
let meterData = [];
let availableData = [];
let repairsData = [];
let adminTasksData = [];
let staffContactsData = [];
let logsData = [];
let configData = {};
let roomsData = [];
let crudInitialized = false;

function saveLocalState(){
  if(IS_GAS) return;
  try{
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
      tenantsData, invoicesData, meterData, availableData, repairsData, adminTasksData, staffContactsData, roomsData, logsData
    }));
  } catch(err) {
    console.warn('local state save failed', err);
  }
}

function isManualRepairRecord(item){
  const id = String(item?.id || item?.task_id || '');
  return item?.onsite_notice === true || id.startsWith('MR');
}

function loadLocalState(){
  if(IS_GAS) return false;
  try{
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    let cleanedLegacyRepairs = false;
    if(Array.isArray(data.tenantsData)) tenantsData = data.tenantsData;
    if(Array.isArray(data.invoicesData)) invoicesData = data.invoicesData;
    if(Array.isArray(data.meterData)) meterData = data.meterData;
    if(Array.isArray(data.availableData)) availableData = data.availableData;
    if(Array.isArray(data.repairsData)){
      repairsData = data.repairsData.filter(isManualRepairRecord);
      cleanedLegacyRepairs = repairsData.length !== data.repairsData.length;
    }
    if(Array.isArray(data.adminTasksData)) adminTasksData = data.adminTasksData.map(normalizeAdminTaskRecord);
    if(Array.isArray(data.staffContactsData)) staffContactsData = data.staffContactsData.map(normalizeStaffContactRecord);
    if(Array.isArray(data.roomsData)) roomsData = data.roomsData;
    if(Array.isArray(data.logsData)) logsData = data.logsData;
    if(cleanedLegacyRepairs) saveLocalState();
    return true;
  } catch(err) {
    console.warn('local state load failed', err);
    return false;
  }
}

function getRoomRecords(){
  const tenantByRoom = new Map();
  tenantsData.filter(t=>t.status==='active').forEach(t=>{
    if(!tenantByRoom.has(t.room_id)) tenantByRoom.set(t.room_id, t);
  });
  const roomById = new Map();
  (roomsData || []).forEach(r=>{
    const id = roomKey(r);
    if(id && !roomById.has(id)) roomById.set(id, r);
  });
  const ids = new Set([...roomById.keys(), ...tenantsData.map(t=>t.room_id).filter(Boolean)]);
  return [...ids].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true})).map(id=>{
    const room = roomById.get(id) || {};
    const tenant = tenantByRoom.get(id);
    const baseStatus = room.status === 'cleaning' ? 'cleaning' : 'vacant';
    return {
      ...room,
      ...(tenant || {}),
      room_id: id,
      property_name: roomBuildingName(id, room),
      rent: Number((tenant && tenant.rent) || room.rent || 0),
      status: tenant ? 'active' : baseStatus,
      name: tenant ? tenant.name : '',
      phone: tenant ? tenant.phone : '',
      people: tenant ? tenant.people : '',
      line_user_id: tenant ? tenant.line_user_id : '',
      contract_start: tenant ? tenant.contract_start : '',
      contract_end: tenant ? tenant.contract_end : '',
      note: tenant ? tenant.note : (room.note || '')
    };
  });
}

function getRoomRecord(roomId){
  return getRoomRecords().find(r=>r.room_id===roomId);
}

function ensureInvoiceForTenant(tenant){
  const yyyymm = $('monthSelector')?.value || normalizeYyyymm(new Date());
  const idx = invoicesData.findIndex(i=>i.room_id===tenant.room_id && normalizeYyyymm(i.yyyymm)===yyyymm);
  const meter = meterData.find(m=>m.room_id===tenant.room_id && normalizeYyyymm(m.yyyymm)===yyyymm);
  const rentRole = rowValue(tenant,['rent_role','租金計算']) || 'primary';
  const rent = rentRole === 'detail' || rentRole === 'no_rent' || rentRole === '不收租金' ? 0 : (Number(tenant.rent) || 0);
  const water = (Number(tenant.people) || 1) * 100;
  const electricity = (Number(meter?.used_kwh) || 0) * 5;
  const previous = idx >= 0 ? invoicesData[idx] : {};
  const lateFee = invoiceLateFee(previous);
  const paid = isPaid(previous);
  const invoice = {
    ...previous,
    invoice_id: previous.invoice_id || 'INV' + yyyymm + '-' + tenant.room_id,
    room_id: tenant.room_id,
    tenant_name: tenant.name,
    name: tenant.name,
    billing_account: rowValue(tenant,['billing_account','帳單對象','合併帳單名稱']) || tenant.name,
    billing_contact: rowValue(tenant,['billing_contact','收件人','帳務窗口']) || tenant.name,
    billing_contact_phone: rowValue(tenant,['billing_contact_phone','收件電話']) || tenant.phone || '',
    billing_line_user_id: rowValue(tenant,['billing_line_user_id']) || tenant.line_user_id || '',
    rent_role: rentRole,
    billing_month: yyyymm,
    yyyymm,
    rent,
    water_fee: water,
    water,
    electric_fee: electricity,
    electricity,
    other_fee: lateFee,
    late_fee: lateFee,
    total_amount: rent + water + electricity + lateFee,
    total: rent + water + electricity + lateFee,
    status: paid ? 'paid' : 'unpaid',
    paid,
    sent: !!(rowValue(tenant,['billing_line_user_id']) || tenant.line_user_id),
    due_date: previous.due_date || yyyymm.replace('-', '/') + '/10'
  };
  if(idx >= 0) invoicesData[idx] = invoice;
  else invoicesData.push(invoice);
}

function upsertLocalTenant(payload){
  const clean = {
    ...payload,
    rent: Number(payload.rent) || 0,
    people: Number(payload.people) || 1,
    billing_account: payload.billing_account || payload['帳單對象'] || payload.name,
    billing_contact: payload.billing_contact || payload['帳務窗口'] || payload.name,
    rent_role: payload.rent_role || payload['租金計算'] || 'primary',
    status: 'active'
  };
  const idx = tenantsData.findIndex(t=>t.room_id===clean.room_id && t.status==='active');
  if(idx >= 0) tenantsData[idx] = {...tenantsData[idx], ...clean};
  else tenantsData.push({...clean, line_user_id:'', tenant_id:'T'+Date.now()});

  const roomIdx = roomsData.findIndex(r=>roomKey(r)===clean.room_id);
  const propertyName = roomBuildingName(clean.room_id);
  if(roomIdx >= 0) roomsData[roomIdx] = {...roomsData[roomIdx], property_name:roomsData[roomIdx].property_name||propertyName, rent:clean.rent, status:'occupied'};
  else roomsData.push({room_id:clean.room_id, property_name:propertyName, rent:clean.rent, status:'occupied', note:''});
  availableData = availableData.filter(r=>roomKey(r)!==clean.room_id);
  ensureInvoiceForTenant(clean);
  saveLocalState();
}

function upsertLocalMeter(payload){
  const yyyymm = normalizeYyyymm(payload.billing_month);
  const row = {
    yyyymm,
    room_id: payload.room_id,
    prev_kwh: Number(payload.previous_reading) || 0,
    curr_kwh: Number(payload.current_reading) || 0,
    used_kwh: Number(payload.usage) || 0,
    note: payload.note || ''
  };
  const idx = meterData.findIndex(m=>m.room_id===row.room_id && normalizeYyyymm(m.yyyymm)===yyyymm);
  if(idx >= 0) meterData[idx] = {...meterData[idx], ...row};
  else meterData.push(row);

  const inv = invoicesData.find(i=>i.room_id===row.room_id && normalizeYyyymm(i.yyyymm)===yyyymm);
  if(inv){
    inv.electricity = row.used_kwh * 5;
    inv.electric_fee = inv.electricity;
    inv.total = invoiceRent(inv) + invoiceWater(inv) + invoiceElectricity(inv) + invoiceLateFee(inv);
    inv.total_amount = inv.total;
  }
  saveLocalState();
}

function markLocalInvoicePaid(roomId, month){
  const inv = invoicesData.find(i=>i.room_id===roomId && normalizeYyyymm(i.yyyymm)===month);
  if(inv){
    inv.paid = true;
    inv.status = 'paid';
    inv.paid_date = new Date().toISOString().slice(0,10);
  }
  saveLocalState();
}

function markLocalInvoiceGroupPaid(accountKey, month){
  const tenantMap = tenantMapByRoom();
  invoicesData.forEach(inv=>{
    const tenant = tenantMap.get(String(inv.room_id || '').trim());
    if(normalizeYyyymm(inv.yyyymm)===month && billingGroupKey(inv, tenant)===accountKey){
      inv.paid = true;
      inv.status = 'paid';
      inv.paid_date = new Date().toISOString().slice(0,10);
    }
  });
  saveLocalState();
}

function markLocalRepairStatus(id, status){
  const item = repairsData.find(r=>r.id===id);
  if(item){
    item.status = status;
    item.updated_at = new Date().toISOString().slice(0,10);
    item.completed_at = status === 'done' ? item.updated_at : '';
    item.sync_status = HAS_GAS_WEB_APP ? 'pending' : 'local';
    item.sync_error = '';
  }
  saveLocalState();
}

const isRepairDone = item => String(item?.status || '').toLowerCase() === 'done' || String(item?.status || '') === '完成';
const isRepairOpen = item => !isRepairDone(item);
const repairStatusKey = item => isRepairDone(item) ? 'done' : 'pending';
const repairStatusText = item => isRepairDone(item) ? '完成' : '未完成';
const repairDate = item => item?.date || item?.created_at || item?.updated_at || '';

function normalizeRepairRecord(row){
  const id = String(row?.id || row?.task_id || '').trim();
  const status = String(row?.status || '').toLowerCase() === 'done' || String(row?.status || '') === '完成' ? 'done' : 'pending';
  return {
    ...row,
    id,
    task_id: row?.task_id || id,
    task_type: row?.task_type || 'repair',
    room_id: row?.room_id || row?.['房號'] || '',
    category: row?.category || row?.title || row?.['問題類型'] || '維修問題',
    desc: row?.desc || row?.note || row?.['故障敘述'] || '',
    reporter: row?.reporter || row?.['登錄人'] || '客服人員',
    status,
    date: row?.date || row?.created_at || row?.['建立時間'] || '',
    created_at: row?.created_at || row?.date || '',
    updated_at: row?.updated_at || '',
    completed_at: row?.completed_at || '',
    onsite_notice: true
  };
}

function applyCloudRepairs(rows){
  const pendingLocal = repairsData.filter(r=>r.sync_status === 'pending' || r.sync_status === 'error');
  const pendingById = new Map(pendingLocal.map(r=>[r.id, r]));
  const cloudRepairs = (rows || [])
    .map(normalizeRepairRecord)
    .filter(r=>r.id && r.task_type === 'repair');
  const cloudIds = new Set(cloudRepairs.map(r=>r.id));
  repairsData = [
    ...pendingLocal.filter(r=>!cloudIds.has(r.id)),
    ...cloudRepairs.map(r=>pendingById.get(r.id) || r)
  ];
  saveLocalState();
}

async function loadCloudRepairs(options={}){
  if(!HAS_GAS_WEB_APP) return false;
  try{
    if(!options.silent) showLoading();
    const data = await fetchGasJSONP('getRepairs');
    const rows = data.repairs || (data.tasks || []).filter(t=>String(t.task_type || '').toLowerCase() === 'repair');
    applyCloudRepairs(rows);
    showSheetStatus(true, 'GAS');
    renderRepairs($('repairStatusFilter')?.value || 'all');
    renderDashboard();
    return true;
  } catch(err) {
    console.warn('loadCloudRepairs failed:', err);
    if(!options.silent) showToast('雲端維修資料讀取失敗，暫用本機資料','error');
    return false;
  } finally {
    if(!options.silent) hideLoading();
  }
}

function addLocalRepair(payload){
  const today = new Date().toISOString().slice(0,10);
  const id = payload.task_id || payload.id || ('MR' + Date.now());
  const item = {
    id,
    task_id: id,
    task_type: 'repair',
    room_id: payload.room_id,
    category: payload.category || payload.title || '維修問題',
    desc: payload.desc || payload.note || '',
    reporter: payload.reporter || '客服人員',
    status: 'pending',
    date: today,
    created_at: today,
    updated_at: today,
    onsite_notice: true
  };
  item.sync_status = HAS_GAS_WEB_APP ? 'pending' : 'local';
  item.sync_error = '';
  const existingIdx = repairsData.findIndex(r=>r.id===id || r.task_id===id);
  if(existingIdx >= 0) repairsData[existingIdx] = {...repairsData[existingIdx], ...item};
  else repairsData.unshift(item);
  logsData.unshift({
    color: 'orange',
    text: '新增維修通知：' + item.room_id + '｜' + item.category,
    time: '剛剛'
  });
  logsData = logsData.slice(0,25);
  saveLocalState();
  return item;
}

const todayISO=()=>new Date().toISOString().slice(0,10);
const adminTaskStatusKey=item=>{
  const status=String(item?.status || '').toLowerCase();
  if(status === 'done' || status === 'completed' || String(item?.status || '') === '完成') return 'done';
  if(status === 'in_progress' || status === 'doing' || String(item?.status || '') === '處理中') return 'in_progress';
  return 'pending';
};
const isAdminTaskDone=item=>adminTaskStatusKey(item)==='done';
const isAdminTaskOpen=item=>!isAdminTaskDone(item);
const adminTaskStatusText=item=>({pending:'待處理',in_progress:'處理中',done:'完成'}[adminTaskStatusKey(item)] || '待處理');
const adminTaskPriorityText=priority=>({normal:'一般',high:'高',urgent:'緊急'}[String(priority || 'normal')] || '一般');
const staffRoleText=role=>({admin:'行政',frontline:'一線',manager:'管理員'}[String(role || 'admin')] || role || '行政');
const adminTaskDueDiff=item=>diffDays(item?.due_date);
const adminTaskDueState=item=>{
  if(isAdminTaskDone(item)) return 'done';
  const days=adminTaskDueDiff(item);
  if(days < 0) return 'overdue';
  if(days === 0) return 'due_today';
  return 'future';
};

function normalizeStaffContactRecord(row){
  const id=String(row?.staff_id || row?.id || '').trim();
  return {
    ...row,
    id,
    staff_id: id,
    name: row?.name || row?.staff_name || '',
    role: row?.role || 'admin',
    bind_code: String(row?.bind_code || '').trim(),
    line_user_id: row?.line_user_id || '',
    active: row?.active === false || String(row?.active || '').toLowerCase() === 'false' ? false : true,
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || ''
  };
}

function normalizeAdminTaskRecord(row){
  const id=String(row?.id || row?.task_id || '').trim();
  const status=adminTaskStatusKey(row);
  return {
    ...row,
    id,
    task_id: row?.task_id || id,
    task_type: 'admin_task',
    title: row?.title || '',
    desc: row?.desc || row?.note || '',
    assignee_id: row?.assignee_id || '',
    assignee_name: row?.assignee_name || '',
    due_date: row?.due_date || '',
    priority: row?.priority || 'normal',
    creator: row?.creator || '管理員',
    status,
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || '',
    completed_at: row?.completed_at || '',
    line_new_sent_at: row?.line_new_sent_at || '',
    line_due_sent_at: row?.line_due_sent_at || '',
    line_overdue_last_sent_at: row?.line_overdue_last_sent_at || '',
    line_done_sent_at: row?.line_done_sent_at || '',
    page_url: row?.page_url || ADMIN_TASK_PAGE_URL,
    source: row?.source || 'github_pages'
  };
}

function staffById(id){
  return staffContactsData.find(s=>String(s.staff_id || s.id)===String(id));
}

function activeStaffContacts(){
  return staffContactsData.filter(s=>s.active !== false && (s.name || s.staff_id));
}

function upsertLocalStaffContact(payload){
  const now=todayISO();
  const id=payload.staff_id || payload.id || ('SC' + Date.now());
  const item=normalizeStaffContactRecord({
    ...payload,
    id,
    staff_id:id,
    created_at:payload.created_at || now,
    updated_at:now
  });
  item.sync_status=HAS_GAS_WEB_APP ? 'pending' : 'local';
  item.sync_error='';
  const idx=staffContactsData.findIndex(s=>s.staff_id===id || s.id===id || (item.bind_code && s.bind_code===item.bind_code));
  if(idx >= 0) staffContactsData[idx]={...staffContactsData[idx], ...item};
  else staffContactsData.push(item);
  saveLocalState();
  return item;
}

function upsertLocalAdminTask(payload){
  const now=todayISO();
  const id=payload.task_id || payload.id || ('AT' + Date.now());
  const item=normalizeAdminTaskRecord({
    ...payload,
    id,
    task_id:id,
    created_at:payload.created_at || now,
    updated_at:now
  });
  item.sync_status=HAS_GAS_WEB_APP ? 'pending' : 'local';
  item.sync_error='';
  const idx=adminTasksData.findIndex(t=>t.id===id || t.task_id===id);
  if(idx >= 0) adminTasksData[idx]={...adminTasksData[idx], ...item};
  else adminTasksData.unshift(item);
  logsData.unshift({color:'orange',text:'新增行政交辦：' + item.title,time:'今天'});
  logsData=logsData.slice(0,25);
  saveLocalState();
  return item;
}

function markLocalAdminTaskStatus(id, status){
  const item=adminTasksData.find(t=>t.id===id || t.task_id===id);
  if(item){
    item.status=status;
    item.updated_at=todayISO();
    item.completed_at=status === 'done' ? item.updated_at : '';
    item.sync_status=HAS_GAS_WEB_APP ? 'pending' : 'local';
    item.sync_error='';
  }
  saveLocalState();
}

function applyCloudAdminTaskData(data){
  const keepLocalTask=t=>t.sync_status === 'pending' || t.sync_status === 'error' || t.sync_status === 'local' || t.source === 'github_pages';
  const keepLocalStaff=s=>s.sync_status === 'pending' || s.sync_status === 'error' || s.sync_status === 'local' || s.source === 'github_pages';
  const pendingLocal=adminTasksData.filter(keepLocalTask);
  const pendingById=new Map(pendingLocal.map(t=>[t.id || t.task_id, t]));
  const pendingLocalStaff=staffContactsData.filter(keepLocalStaff);
  const pendingStaffById=new Map(pendingLocalStaff.map(s=>[s.staff_id || s.id, s]));
  const cloudTasks=(data.admin_tasks || data.adminTasks || [])
    .map(normalizeAdminTaskRecord)
    .filter(t=>t.id);
  const cloudIds=new Set(cloudTasks.map(t=>t.id));
  adminTasksData=[
    ...pendingLocal.filter(t=>!cloudIds.has(t.id || t.task_id)),
    ...cloudTasks.map(t=>pendingById.get(t.id) || t)
  ];
  const cloudStaff=(data.staff_contacts || data.staffContacts || [])
    .map(normalizeStaffContactRecord)
    .filter(s=>s.id || s.name || s.bind_code);
  const cloudStaffIds=new Set(cloudStaff.map(s=>s.staff_id || s.id));
  staffContactsData=[
    ...pendingLocalStaff.filter(s=>!cloudStaffIds.has(s.staff_id || s.id)),
    ...cloudStaff.map(s=>pendingStaffById.get(s.staff_id || s.id) || s)
  ];
  saveLocalState();
}

async function loadCloudAdminTaskData(options={}){
  if(!HAS_GAS_WEB_APP) return false;
  try{
    if(!options.silent) showLoading();
    const data=await fetchGasJSONP('getAdminTaskData');
    applyCloudAdminTaskData(data || {});
    showSheetStatus(true, 'GAS');
    populateStaffOptions();
    renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
    renderStaffContacts();
    renderDashboard();
    return true;
  } catch(err) {
    console.warn('loadCloudAdminTaskData failed:', err);
    if(!options.silent) showToast('行政交辦雲端資料讀取失敗，先使用本機資料','error');
    return false;
  } finally {
    if(!options.silent) hideLoading();
  }
}

function firstArrayField(data, names){
  for(const name of names){
    if(Array.isArray(data?.[name])) return data[name];
  }
  return null;
}

function normalizeMeterDataRecord(row){
  const yyyymm=normalizeYyyymm(row?.yyyymm || row?.billing_month || row?.month);
  const prev=Number(row?.prev_kwh ?? row?.previous_reading ?? 0) || 0;
  const curr=Number(row?.curr_kwh ?? row?.current_reading ?? 0) || 0;
  const used=Number(row?.used_kwh ?? row?.usage ?? Math.max(0, curr - prev)) || 0;
  return {
    ...row,
    yyyymm,
    billing_month: yyyymm,
    room_id: row?.room_id || row?.['房號'] || '',
    prev_kwh: prev,
    curr_kwh: curr,
    used_kwh: used
  };
}

function applyConfigMonth(config={}){
  if(!config.yyyymm || !$('monthSelector')) return;
  const selector=$('monthSelector');
  let found=false;
  for(let i=0; i<selector.options.length; i++){
    if(selector.options[i].value === config.yyyymm){
      selector.selectedIndex=i;
      found=true;
      break;
    }
  }
  if(!found){
    const opt=document.createElement('option');
    opt.value=config.yyyymm;
    opt.text=config.yyyymm;
    selector.add(opt, 0);
    selector.selectedIndex=0;
  }
}

function renderAllDataViews(){
  initFilters();
  populateRepairRoomOptions();
  populateStaffOptions();
  renderDashboard();
  renderRooms();
  renderTenants();
  renderBilling();
  renderMeter();
  renderRepairs($('repairStatusFilter')?.value || 'all');
  renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
  renderStaffContacts();
  renderContracts();
  renderReports();
  renderAvailable();
}

function applyCloudDashboardData(data={}){
  const tenants=firstArrayField(data, ['tenants', 'tenantsData']);
  const invoices=firstArrayField(data, ['invoices', 'invoicesData']);
  const meter=firstArrayField(data, ['meter', 'meters', 'meterData']);
  const rooms=firstArrayField(data, ['rooms', 'roomsData']);
  const available=firstArrayField(data, ['available', 'availableData']);
  const logs=firstArrayField(data, ['logs', 'logsData']);

  if(tenants) tenantsData=tenants;
  if(invoices) invoicesData=invoices;
  if(meter) meterData=meter.map(normalizeMeterDataRecord);
  if(rooms) roomsData=rooms;
  if(available) availableData=available;
  if(logs) logsData=logs;

  if(data.config && typeof data.config === 'object'){
    configData=data.config;
    applyConfigMonth(configData);
  }

  if(firstArrayField(data, ['repairs', 'tasks'])) {
    applyCloudRepairs(firstArrayField(data, ['repairs', 'tasks']));
  }
  if(firstArrayField(data, ['admin_tasks', 'adminTasks', 'staff_contacts', 'staffContacts'])) {
    applyCloudAdminTaskData(data);
  }

  saveLocalState();
}

async function loadCloudDashboardData(options={}){
  if(!HAS_GAS_WEB_APP) return false;
  try{
    if(!options.silent) showLoading();
    const data=await fetchGasJSONP('getAll');
    if(data?.dashboard_error) throw new Error(data.dashboard_error);
    applyCloudDashboardData(data || {});
    showSheetStatus(true, 'GAS');
    renderAllDataViews();
    return true;
  } catch(err) {
    console.warn('loadCloudDashboardData failed:', err);
    if(!options.silent) showToast('Cloud data load failed. Using local data.','error');
    return false;
  } finally {
    if(!options.silent) hideLoading();
  }
}

function populateStaffOptions(preferredAssignee=''){
  const staff=activeStaffContacts();
  const currentAssignee=preferredAssignee || $('at_assignee')?.value || '';
  const currentFilter=$('adminTaskAssigneeFilter')?.value || 'all';
  const options=staff.map(s=>'<option value="'+escapeHtml(s.staff_id || s.id)+'">'+escapeHtml(s.name)+'（'+escapeHtml(staffRoleText(s.role))+'）</option>').join('');
  if($('at_assignee')){
    $('at_assignee').innerHTML='<option value="">請先選人員</option>'+options;
    if(currentAssignee && staff.some(s=>String(s.staff_id || s.id)===String(currentAssignee))) $('at_assignee').value=currentAssignee;
  }
  if($('adminTaskAssigneeFilter')){
    $('adminTaskAssigneeFilter').innerHTML='<option value="all">全部人員</option>'+options;
    if(currentFilter !== 'all' && staff.some(s=>String(s.staff_id || s.id)===String(currentFilter))) $('adminTaskAssigneeFilter').value=currentFilter;
  }
}

function renderStaffContacts(){
  populateStaffOptions();
  const list=$('staffContactList');
  const count=$('staffBindCount');
  if(count) count.textContent=staffContactsData.length + ' 人';
  if(!list) return;
  list.innerHTML=staffContactsData.length ? staffContactsData.map(s=>{
    const bound=!!s.line_user_id;
    const syncBadge=s.sync_status === 'pending'
      ? '<span class="badge badge-warn">同步中</span>'
      : s.sync_status === 'error'
        ? '<span class="badge badge-danger">同步失敗</span>'
        : '';
    return '<div class="staff-contact-item"><div><div class="staff-contact-name">'+escapeHtml(s.name || '-')+'</div><div class="staff-contact-meta">'+escapeHtml(staffRoleText(s.role))+'｜代碼 '+escapeHtml(s.bind_code || '-')+'</div></div><div class="staff-contact-badges"><span class="line-status"><span class="line-dot '+(bound?'bound':'unbound')+'"></span>'+(bound?'已綁定':'未綁定')+'</span>'+syncBadge+'</div></div>';
  }).join('') : '<div class="empty-state">尚未新增人員，請先新增行政或一線人員。</div>';
}

function renderAdminTasks(statusFilter='all'){
  let list=[...adminTasksData].map(normalizeAdminTaskRecord);
  const assigneeFilter=$('adminTaskAssigneeFilter')?.value || 'all';
  if(statusFilter === 'open') list=list.filter(isAdminTaskOpen);
  else if(statusFilter === 'overdue') list=list.filter(t=>adminTaskDueState(t)==='overdue');
  else if(statusFilter !== 'all') list=list.filter(t=>adminTaskStatusKey(t)===statusFilter);
  if(assigneeFilter !== 'all') list=list.filter(t=>String(t.assignee_id)===String(assigneeFilter));
  list.sort((a,b)=>{
    const aDone=Number(isAdminTaskDone(a));
    const bDone=Number(isAdminTaskDone(b));
    if(aDone !== bDone) return aDone-bDone;
    const aOver=adminTaskDueState(a)==='overdue' ? 0 : 1;
    const bOver=adminTaskDueState(b)==='overdue' ? 0 : 1;
    if(aOver !== bOver) return aOver-bOver;
    return String(a.due_date || '').localeCompare(String(b.due_date || ''));
  });

  const openTasks=adminTasksData.filter(isAdminTaskOpen);
  const dueToday=openTasks.filter(t=>adminTaskDueState(t)==='due_today');
  const overdue=openTasks.filter(t=>adminTaskDueState(t)==='overdue');
  if($('kpiAdminTaskTotal')) $('kpiAdminTaskTotal').textContent=adminTasksData.length;
  if($('kpiAdminTaskOpen')) $('kpiAdminTaskOpen').textContent=openTasks.length;
  if($('kpiAdminTaskDueToday')) $('kpiAdminTaskDueToday').textContent=dueToday.length;
  if($('kpiAdminTaskOverdue')) $('kpiAdminTaskOverdue').textContent=overdue.length;
  if($('navAdminTaskBadge')) $('navAdminTaskBadge').textContent=openTasks.length;

  const cards=$('adminTaskCards');
  if(!cards) return;
  cards.innerHTML=list.length ? list.map(t=>{
    const status=adminTaskStatusKey(t);
    const dueState=adminTaskDueState(t);
    const dueDays=adminTaskDueDiff(t);
    const dueText=isAdminTaskDone(t) ? '已完成' : dueDays < 0 ? '逾期 '+Math.abs(dueDays)+' 天' : dueDays === 0 ? '今天截止' : '剩 '+dueDays+' 天';
    const dueBadge=dueState === 'overdue' ? 'badge-danger' : dueState === 'due_today' ? 'badge-warn' : status === 'done' ? 'badge-success' : 'badge-info';
    const statusBadge=status === 'done' ? 'badge-success' : status === 'in_progress' ? 'badge-warn' : 'badge-danger';
    const syncBadge=t.sync_status === 'pending'
      ? '<span class="badge badge-warn" title="尚未同步到雲端">同步中</span>'
      : t.sync_status === 'error'
        ? '<span class="badge badge-danger" title="'+escapeHtml(t.sync_error || '同步失敗')+'">同步失敗</span>'
        : '';
    const actions=status === 'done'
      ? '<button class="btn btn-sm btn-ghost" data-action="setAdminTaskStatus" data-id="'+escapeHtml(t.id)+'" data-status="pending">重開</button>'
      : '<button class="btn btn-sm btn-ghost" data-action="setAdminTaskStatus" data-id="'+escapeHtml(t.id)+'" data-status="in_progress">處理中</button><button class="btn btn-sm btn-success" data-action="setAdminTaskStatus" data-id="'+escapeHtml(t.id)+'" data-status="done">完成</button>';
    return '<div class="admin-task-card status-'+status+' due-'+dueState+'"><div class="admin-task-card-header"><div><div class="admin-task-title">'+escapeHtml(t.title || '(未命名交辦)')+'</div><div class="admin-task-meta">交辦給 '+escapeHtml(t.assignee_name || '-')+'｜'+escapeHtml(adminTaskPriorityText(t.priority))+'</div></div><div class="admin-task-badges"><span class="badge '+statusBadge+'">'+escapeHtml(adminTaskStatusText(t))+'</span><span class="badge '+dueBadge+'">'+escapeHtml(dueText)+'</span>'+syncBadge+'</div></div><div class="admin-task-desc">'+escapeHtml(t.desc || '無補充說明')+'</div><div class="admin-task-footer"><span>截止：'+escapeHtml(t.due_date || '-')+'</span><span>交辦人：'+escapeHtml(t.creator || '管理員')+'</span><div class="repair-actions">'+actions+'</div></div></div>';
  }).join('') : '<div class="empty-state">目前沒有符合條件的交辦事項。</div>';
}
if($('adminTaskStatusFilter')) $('adminTaskStatusFilter').addEventListener('change',()=>renderAdminTasks($('adminTaskStatusFilter').value));
if($('adminTaskAssigneeFilter')) $('adminTaskAssigneeFilter').addEventListener('change',()=>renderAdminTasks($('adminTaskStatusFilter')?.value || 'all'));

function populateRepairRoomOptions(){
  const select = $('rf_room');
  if(!select) return;
  const current = select.value;
  const rooms = getRoomRecords().map(r=>r.room_id).filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
  select.innerHTML = '<option value="">選擇房號</option>' + rooms.map(room=>'<option value="'+escapeHtml(room)+'">'+escapeHtml(room)+'</option>').join('');
  if(current && rooms.includes(current)) select.value = current;
}

function ensureCompanyBillingDemoData(){
  if(typeof MOCK_TENANTS === 'undefined' || typeof MOCK_ROOMS === 'undefined' || typeof MOCK_INVOICES === 'undefined') return;
  const demoTenants = MOCK_TENANTS.filter(t=>String(t.tenant_id || '').startsWith('THM'));
  if(!demoTenants.length) return;
  const demoRoomIds = new Set(demoTenants.map(t=>t.room_id));
  const hasDemoTenant = tenantsData.some(t=>String(t.tenant_id || '').startsWith('THM'));
  if(!hasDemoTenant) tenantsData.push(...demoTenants);
  const hasDemoRoom = roomsData.some(r=>demoRoomIds.has(roomKey(r)));
  if(!hasDemoRoom) roomsData.push(...MOCK_ROOMS.filter(r=>demoRoomIds.has(roomKey(r))));
  const hasDemoInvoice = invoicesData.some(i=>demoRoomIds.has(i.room_id));
  if(!hasDemoInvoice) invoicesData.push(...MOCK_INVOICES.filter(i=>demoRoomIds.has(i.room_id)));
  if(typeof MOCK_METER_DATA !== 'undefined'){
    const hasDemoMeter = meterData.some(m=>demoRoomIds.has(m.room_id));
    if(!hasDemoMeter) meterData.push(...MOCK_METER_DATA.filter(m=>demoRoomIds.has(m.room_id)));
  }
}

// ── 頁面切換 ──────────────────────────────────────────
const pageTitles={dashboard:'儀表板',rooms:'房間管理',tenants:'房客管理',billing:'帳單管理',meter:'水電紀錄',repairs:'報修管理',contracts:'合約管理',reports:'月報表統計',available:'可承租房間'};
pageTitles['admin-tasks']='行政交辦';
$$('.nav-item').forEach(item=>{
  item.addEventListener('click',e=>{
    e.preventDefault();
    const page=item.dataset.page;
    $$('.nav-item').forEach(n=>n.classList.remove('active'));
    item.classList.add('active');
    $$('.page').forEach(p=>p.classList.remove('active'));
    $('page-'+page).classList.add('active');
    $('pageTitle').textContent=pageTitles[page];
    $('sidebar').classList.remove('open');
  });
});
$('menuToggle').addEventListener('click',()=>{$('sidebar').classList.toggle('open')});
$('sidebarOverlay').addEventListener('click',()=>{$('sidebar').classList.remove('open')});

// 登出
const logoutBtn = $('logoutBtn');
if(logoutBtn) logoutBtn.addEventListener('click',()=>{
  if(confirm('確定要鎖定登出嗎？')){
    sessionStorage.removeItem('rental_auth');
    location.reload();
  }
});

// Date
$('currentDate').textContent=TODAY.toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'});

// 建立館別下拉選單
function initFilters(){
  const uniqueBuildings = new Set();
  getRoomRecords().forEach(t => {
    const b = t.property_name || extractBuilding(t.room_id);
    if(b) uniqueBuildings.add(b);
  });
  
  // 若無資料則使用預設館別
  const buildings = uniqueBuildings.size > 0 ? Array.from(uniqueBuildings) : BUILDINGS.map(b => b.name);
  
  ['roomBuildingFilter','tenantBuildingFilter'].forEach(id=>{
    const select = $(id);
    // 保留第一個 "全部館別"
    select.innerHTML = '<option value="all">全部館別</option>';
    buildings.forEach(b=>{
      select.innerHTML += '<option value="'+b+'">'+b+'</option>';
    });
  });
}

// === 1. 儀表板 (DASHBOARD) ===
function renderDashboard(){
  const roomRecords=getRoomRecords();
  const active=roomRecords.filter(t=>t.status==='active');
  const vacant=roomRecords.filter(t=>t.status!=='active');
  const totalRooms=roomRecords.length;
  
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  const billingGroups = buildBillingGroups(currentInvoices);
  const revenue=billingGroups.reduce((s,i)=>s+i.total,0);
  
  $('kpiTotalRooms').textContent=totalRooms;
  $('kpiOccupied').textContent=active.length;
  $('kpiVacant').textContent=vacant.length;
  $('kpiRevenue').textContent=fmt(revenue);
  $('kpiOccRate').textContent='↗ 入住率 '+ (totalRooms ? Math.round(active.length/totalRooms*100) : 0)+'%';

  // 警示清單
  const unpaid=billingGroups.filter(i=>!i.allPaid);
  const activeTenants=tenantsData.filter(t=>t.status==='active');
  const expiring=activeTenants.filter(t=>t.contract_end && diffDays(t.contract_end)<=30 && diffDays(t.contract_end)>0);
  const expired=activeTenants.filter(t=>t.contract_end && diffDays(t.contract_end)<=0);
  const pendingRepairs=repairsData.filter(isRepairOpen);
  const openAdminTasks=adminTasksData.filter(isAdminTaskOpen);
  const overdueAdminTasks=openAdminTasks.filter(t=>adminTaskDueState(t)==='overdue');
  
  let alerts='';
  if(unpaid.length)alerts+='<div class="alert-item danger"><span class="alert-icon">🚨</span>本月有 <b>'+unpaid.length+'</b> 張帳單尚未繳清</div>';
  if(expired.length)alerts+='<div class="alert-item danger"><span class="alert-icon">📋</span>有 <b>'+expired.length+'</b> 份合約已過期，請儘速處理續約</div>';
  if(expiring.length)alerts+='<div class="alert-item warn"><span class="alert-icon">⏰</span>有 <b>'+expiring.length+'</b> 份合約將在 30 天內到期</div>';
  if(pendingRepairs.length)alerts+='<div class="alert-item info"><span class="alert-icon">🔧</span>有 <b>'+pendingRepairs.length+'</b> 件維修未完成，請現場人員查看</div>';
  if(openAdminTasks.length)alerts+='<div class="alert-item '+(overdueAdminTasks.length?'danger':'warn')+'"><span class="alert-icon">待</span>有 <b>'+openAdminTasks.length+'</b> 件行政交辦未完成'+(overdueAdminTasks.length?'，其中 '+overdueAdminTasks.length+' 件已逾期':'')+'</div>';
  $('alertStrip').innerHTML=alerts;

  // 館別長條圖
  const maxT=Math.max(...BUILDINGS.map(b=>{
    const rooms=roomRecords.filter(r=>(r.property_name||r.room_id).includes(b.name.replace('館','')));
    return rooms.length || b.total;
  }), 1);
  $('buildingList').innerHTML=BUILDINGS.map(b=>{
    const rooms=roomRecords.filter(r=>(r.property_name||r.room_id).includes(b.name.replace('館','')));
    const total=rooms.length || b.total;
    const occ=rooms.filter(r=>r.status==='active').length;
    const pct=Math.round(occ/total*100) || 0;
    return '<div class="building-row"><span class="building-name">'+b.name+'</span><div class="building-bar-bg"><div class="building-bar-fill" style="width:'+Math.round(total/maxT*100)+'%;background:'+b.color+'">'+pct+'%</div></div><span class="building-stats">'+occ+'/'+total+'</span></div>';
  }).join('');

  // 系統動態
  $('activityList').innerHTML=logsData.length ? logsData.map(a=>'<div class="activity-item"><div class="activity-dot '+a.color+'"></div><div><div class="activity-text">'+a.text+'</div><span class="activity-time">'+a.time+'</span></div></div>').join('') : '<div class="empty-state">尚無系統紀錄</div>';

  // 快速看版
  $('unpaidDashCount').textContent=unpaid.length;
  $('unpaidQuickList').innerHTML=unpaid.length?unpaid.slice(0,5).map(i=>'<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+escapeHtml(i.account)+'</span><span class="name">'+i.rooms.length+' 間</span></div><span class="badge badge-danger">'+fmt(i.total)+'</span></div>').join(''):'<div class="empty-state">🎉 全部已繳清</div>';

  const allExpiring=[...expired,...expiring].sort((a,b)=>diffDays(a.contract_end)-diffDays(b.contract_end));
  $('expiringDashCount').textContent=allExpiring.length;
  $('expiringQuickList').innerHTML=allExpiring.length?allExpiring.slice(0,5).map(t=>{const d=diffDays(t.contract_end);const cls=d<=0?'badge-danger':'badge-warn';const txt=d<=0?'已過期'+Math.abs(d)+'天':'剩'+d+'天';return '<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+t.room_id+'</span><span class="name">'+t.name+'</span></div><span class="badge '+cls+'">'+txt+'</span></div>';}).join(''):'<div class="empty-state">✅ 近期無到期合約</div>';

  $('repairDashCount').textContent=pendingRepairs.length;
  $('repairQuickList').innerHTML=pendingRepairs.length?pendingRepairs.slice(0,5).map(r=>'<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+escapeHtml(r.room_id)+'</span><span class="name">'+escapeHtml(String(r.desc || '').substring(0,12))+'...</span></div><span class="badge badge-info">'+escapeHtml(r.category)+'</span></div>').join(''):'<div class="empty-state">✅ 無未完成維修</div>';

  // 側邊欄通知氣泡
  $('navVacantBadge').textContent=vacant.length;
  $('navUnpaidBadge').textContent=unpaid.length;
  $('navRepairBadge').textContent=pendingRepairs.length;
  if($('navAdminTaskBadge')) $('navAdminTaskBadge').textContent=openAdminTasks.length;
  $('navContractBadge').textContent=allExpiring.length;
}

// === 2. 房間管理 (ROOMS) ===
function renderRooms(filter={}){
  let list=getRoomRecords();
  if(filter.building&&filter.building!=='all')list=list.filter(t=>(t.property_name||t.room_id).includes(filter.building));
  if(filter.status==='occupied')list=list.filter(t=>t.status==='active');
  else if(filter.status==='vacant')list=list.filter(t=>t.status==='vacant');
  else if(filter.status==='cleaning')list=list.filter(t=>t.status==='cleaning');
  if(filter.search){
    const q=filter.search.toLowerCase();
    list=list.filter(t=>t.room_id.toLowerCase().includes(q)||String(t.name||'').toLowerCase().includes(q));
  }

  // 網格視圖
  const groups={};
  list.forEach(t=>{const b=t.property_name||extractBuilding(t.room_id);if(!groups[b])groups[b]=[];groups[b].push(t)});
  $('roomGridContainer').innerHTML=Object.keys(groups).map(b=>'<div class="room-building-section"><div class="room-building-title">🏢 '+escapeHtml(b)+'</div><div class="room-grid">'+groups[b].map(t=>{const cls=t.status==='active'?'occupied':t.status==='cleaning'?'cleaning':'vacant';const label=t.status==='active'?(t.name||'已出租'):t.status==='cleaning'?'整理中':'空房';return '<div class="room-cell '+cls+'" role="button" tabindex="0" data-action="openRoom" data-room="'+escapeHtml(t.room_id)+'" title="查看 '+escapeHtml(t.room_id)+'"><div class="room-num">'+escapeHtml(t.room_id.replace(b,''))+'</div><div class="room-tenant">'+escapeHtml(label)+'</div></div>';}).join('')+'</div></div>').join('');

  // 列表視圖
  $('roomTbody').innerHTML=list.map(t=>{const occ=t.status==='active';const bound=!!t.line_user_id;const d=t.contract_end?diffDays(t.contract_end):'';const dcls=d!==''?(d<=0?'expired':d<=30?'urgent':'safe'):'';const statusLabel=occ?'已出租':t.status==='cleaning'?'整理中':'空房';const badge=occ?'badge-success':t.status==='cleaning'?'badge-warn':'badge-info';return '<tr><td class="room-id">'+escapeHtml(t.room_id)+'</td><td><span class="badge badge-info">'+escapeHtml(t.property_name||extractBuilding(t.room_id))+'</span></td><td><span class="badge '+badge+'">'+statusLabel+'</span></td><td>'+escapeHtml(t.name||'-')+'</td><td class="amount">'+(t.rent?fmt(t.rent):'-')+'</td><td>'+(occ?'<span class="line-status"><span class="line-dot '+(bound?'bound':'unbound')+'"></span>'+(bound?'已綁':'未綁')+'</span>':'-')+'</td><td>'+(t.contract_end?'<span class="contract-days '+dcls+'">'+(d<=0?'已過期':'剩'+d+'天')+'</span>':'-')+'</td><td><button class="btn btn-sm btn-ghost" data-action="openRoom" data-room="'+escapeHtml(t.room_id)+'">查看</button></td></tr>';}).join('');
}

// 房間過濾監聽
$('viewGrid').addEventListener('click',()=>{$('viewGrid').classList.add('active');$('viewList').classList.remove('active');$('roomGridContainer').style.display='';$('roomListContainer').style.display='none'});
$('viewList').addEventListener('click',()=>{$('viewList').classList.add('active');$('viewGrid').classList.remove('active');$('roomGridContainer').style.display='none';$('roomListContainer').style.display=''});
$('roomSearch').addEventListener('input',applyRoomFilters);
$('roomBuildingFilter').addEventListener('change',applyRoomFilters);
$('roomStatusFilter').addEventListener('change',applyRoomFilters);
function applyRoomFilters(){renderRooms({search:$('roomSearch').value,building:$('roomBuildingFilter').value,status:$('roomStatusFilter').value})}

// === 3. 房客管理 (TENANTS) ===
function renderTenants(filter={}){
  let list=tenantsData.filter(t=>t.status==='active');
  if(filter.building&&filter.building!=='all')list=list.filter(t=>t.room_id.includes(filter.building));
  if(filter.status==='bound')list=list.filter(t=>!!t.line_user_id);
  else if(filter.status==='unbound')list=list.filter(t=>!t.line_user_id);
  if(filter.search){const q=filter.search.toLowerCase();list=list.filter(t=>t.room_id.toLowerCase().includes(q)||t.name.toLowerCase().includes(q))}
  $('tenantTbody').innerHTML=list.map(t=>{const bound=!!t.line_user_id;const d=t.contract_end?diffDays(t.contract_end):'';const dcls=d!==''?(d<=0?'expired':d<=30?'urgent':'safe'):'';return '<tr><td class="room-id">'+t.room_id+'</td><td>'+t.name+'</td><td>'+(t.phone||'-')+'</td><td>'+(t.people===2?'雙人':'單人')+'</td><td class="amount">'+fmt(t.rent)+'</td><td><span class="line-status"><span class="line-dot '+(bound?'bound':'unbound')+'"></span>'+(bound?'已綁定':'未綁定')+'</span></td><td>'+(t.contract_end?'<span class="contract-days '+dcls+'">'+(d<=0?'已過期':'剩'+d+'天')+'</span>':'-')+'</td><td><span class="badge '+(bound?'badge-success':'badge-warn')+'">'+(bound?'● 正常':'⚠ 待綁定')+'</span></td></tr>';}).join('');
}
$('tenantSearch').addEventListener('input',applyTenantFilters);
$('tenantBuildingFilter').addEventListener('change',applyTenantFilters);
$('tenantStatusFilter').addEventListener('change',applyTenantFilters);
function applyTenantFilters(){renderTenants({search:$('tenantSearch').value,building:$('tenantBuildingFilter').value,status:$('tenantStatusFilter').value})}

// === 4. 帳單管理 (BILLING) ===
function billingRoomDetailsHtml(group){
  return '<div class="billing-detail-grid">' + group.rooms.map(room=>{
    const rentLine = room.rent ? '<span>租金 '+fmt(room.rent)+'</span>' : '';
    const lateLine = room.lateFee ? '<span>滯納 '+fmt(room.lateFee)+'</span>' : '';
    return '<div class="billing-detail-chip"><strong>'+escapeHtml(room.room_id)+'</strong>'+rentLine+'<span>電費 '+fmt(room.electricity)+'</span><span>水費 '+fmt(room.water)+'</span>'+lateLine+'</div>';
  }).join('') + '</div>';
}

function renderBilling(){
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  const groupedInvoices = buildBillingGroups(currentInvoices);
  
  const total=groupedInvoices.reduce((s,i)=>s+i.total,0);
  const sent=groupedInvoices.filter(i=>i.sent).length;
  const unpaid=groupedInvoices.filter(i=>!i.allPaid);
  
  $('kpiBillCount').textContent=groupedInvoices.length;
  $('kpiBillSent').textContent=sent;
  $('kpiBillUnpaid').textContent=unpaid.length;
  $('kpiBillTotal').textContent=fmt(total);
  $('unpaidBillCount').textContent=unpaid.length+'張';

  // 逾期計算 (基準為當月 10 號)
  const [year, month] = yyyymm.split('-');
  const dueBase = year + '-' + month + '-10';
  const overDays = Math.max(0, diffDays(dueBase) * -1);

  $('unpaidTbody').innerHTML=unpaid.length?unpaid.map(i=>{
    return '<tr><td class="room-id">'+escapeHtml(i.account)+'</td><td>'+escapeHtml(i.contact)+'</td><td><span class="badge badge-info">'+i.rooms.length+' 間</span></td><td class="amount" style="font-weight:800;color:var(--danger-600)">'+fmt(i.total)+'</td><td>'+(i.dueDate || (year+'/'+month+'/10'))+'</td><td><span class="badge badge-danger">逾期 '+overDays+' 天</span></td></tr>';
  }).join(''):'<tr><td colspan="6" class="empty-state">🎉 全部已繳清</td></tr>';

  $('billingTbody').innerHTML=groupedInvoices.map(i=>{
    const paidBtn=i.allPaid
      ? '<span class="badge badge-success">✅ 已繳</span>'
      : '<button class="btn btn-sm btn-success" data-action="markPaidGroup" data-account="'+escapeHtml(i.key)+'" data-label="'+escapeHtml(i.account)+'" data-month="'+yyyymm+'">標記已繳</button>';
    const statusHint = i.sent ? '<span class="badge badge-info">可發送</span>' : '<span class="badge badge-warn">待綁定</span>';
    const summary = '<span class="badge badge-neutral">'+i.rooms.length+' 間</span><span class="billing-room-preview">'+escapeHtml(i.rooms.slice(0,4).map(r=>r.room_id).join('、'))+(i.rooms.length>4?' 等':'')+'</span>';
    return '<tr class="billing-group-row"><td class="room-id">'+escapeHtml(i.account)+'</td><td>'+escapeHtml(i.contact)+'</td><td>'+summary+'</td><td class="amount">'+fmt(i.rent)+'</td><td class="amount">'+fmt(i.electricity)+'</td><td class="amount">'+fmt(i.water)+'</td><td class="amount">'+(i.lateFee>0?fmt(i.lateFee):'-')+'</td><td class="amount" style="font-weight:800">'+fmt(i.total)+'</td><td><div class="billing-status-stack">'+statusHint+paidBtn+'</div></td></tr><tr class="billing-detail-row"><td colspan="9">'+billingRoomDetailsHtml(i)+'</td></tr>';
  }).join('');
}

// === 5. 水電紀錄 (METER) ===
function renderMeter(){
  const yyyymm = $('monthSelector').value;
  const currentMeter = meterData.filter(m => normalizeYyyymm(m.yyyymm) === yyyymm);
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  
  // 建立對應表
  const tenantMap = {};
  tenantsData.forEach(t => { tenantMap[t.room_id] = t.name || ''; });
  const invoiceMap = {};
  currentInvoices.forEach(i => { invoiceMap[i.room_id] = i; });

  const maxK=Math.max(...currentMeter.map(m=>Number(m.used_kwh) || 0), 1);
  
  $('meterTbody').innerHTML=currentMeter.length ? currentMeter.map(m=>{
    const name = tenantMap[m.room_id] || '-';
    const elecCharge = invoiceMap[m.room_id] ? invoiceElectricity(invoiceMap[m.room_id]) : 0;
    const usedK = Number(m.used_kwh) || 0;
    const pct=Math.round(usedK/maxK*100);
    const lv=usedK>160?'high':usedK>100?'medium':'low';
    return '<tr><td class="room-id">'+escapeHtml(m.room_id)+'</td><td>'+escapeHtml(name)+'</td><td class="amount">'+(m.prev_kwh || 0)+'</td><td class="amount">'+(m.curr_kwh || 0)+'</td><td class="amount" style="font-weight:700">'+usedK+' 度</td><td class="amount">'+fmt(elecCharge)+'</td><td><div class="meter-bar-wrapper"><div class="meter-bar"><div class="meter-bar-fill '+lv+'" style="width:'+pct+'%"></div></div><span class="meter-kwh">'+usedK+'度</span></div></td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty-state">本月尚無電表讀數紀錄</td></tr>';
}

// === 6. 報修管理 (REPAIRS) ===
function renderRepairs(statusFilter='all'){
  let list=[...repairsData];
  if(statusFilter==='open')list=list.filter(isRepairOpen);
  else if(statusFilter==='done')list=list.filter(isRepairDone);
  list.sort((a,b)=>Number(isRepairDone(a))-Number(isRepairDone(b)) || String(repairDate(b)).localeCompare(String(repairDate(a))));
  const openRepairs=repairsData.filter(isRepairOpen);
  
  $('kpiRepairTotal').textContent=repairsData.length;
  $('kpiRepairPending').textContent=openRepairs.length;
  $('kpiRepairProgress').textContent=openRepairs.length;
  $('kpiRepairDone').textContent=repairsData.filter(isRepairDone).length;

  const noticeCount=$('repairNoticeCount');
  const noticeList=$('repairNoticeList');
  if(noticeCount) noticeCount.textContent=openRepairs.length+' 件';
  if(noticeList){
    noticeList.innerHTML=openRepairs.length ? openRepairs.slice(0,6).map(r=>{
      return '<div class="onsite-notice-item"><div><div class="onsite-notice-room">'+escapeHtml(r.room_id)+'</div><div class="onsite-notice-desc">'+escapeHtml(r.category)+'｜'+escapeHtml(String(r.desc || '').substring(0,42))+'</div></div><button class="btn btn-sm btn-success" data-action="setRepairStatus" data-id="'+escapeHtml(r.id)+'" data-status="done">完成</button></div>';
    }).join('') : '<div class="empty-state">目前沒有需要現場處理的維修通知</div>';
  }
  
  $('repairCards').innerHTML=list.length ? list.map(r=>{
    const key=repairStatusKey(r);
    const badge=key==='done'?'badge-success':'badge-danger';
    const syncBadge = r.sync_status === 'pending'
      ? '<span class="badge badge-warn" style="margin-left:4px" title="正在背景同步">同步中</span>'
      : r.sync_status === 'error'
        ? '<span class="badge badge-danger" style="margin-left:4px" title="'+escapeHtml(r.sync_error || '稍後會自動重試')+'">待重試</span>'
        : '';
    const actions = key==='done'
      ? '<button class="btn btn-sm btn-ghost" data-action="setRepairStatus" data-id="'+escapeHtml(r.id)+'" data-status="pending">重開未完成</button>'
      : '<button class="btn btn-sm btn-success" data-action="setRepairStatus" data-id="'+escapeHtml(r.id)+'" data-status="done">標記完成</button>';
    return '<div class="repair-card status-'+key+'"><div class="repair-card-header"><div><div class="repair-room">'+escapeHtml(r.room_id)+'</div><span class="badge badge-info" style="margin-top:4px">'+escapeHtml(r.category)+'</span></div><div style="text-align:right"><span class="badge '+badge+'">'+repairStatusText(r)+'</span>'+syncBadge+'<div class="repair-date" style="margin-top:4px">'+escapeHtml(repairDate(r))+'</div></div></div><div class="repair-desc">'+escapeHtml(r.desc)+'</div><div class="repair-footer"><span class="repair-reporter">登錄人：'+escapeHtml(r.reporter||'客服人員')+'</span><div class="repair-actions">'+actions+'</div></div></div>';
  }).join('') : '<div class="empty-state">目前沒有符合條件的維修紀錄</div>';
}
$('repairStatusFilter').addEventListener('change',()=>renderRepairs($('repairStatusFilter').value));

// === 7. 合約管理 (CONTRACTS) ===
function renderContracts(){
  const active=tenantsData.filter(t=>t.status==='active'&&t.contract_end);
  const sorted=[...active].sort((a,b)=>diffDays(a.contract_end)-diffDays(b.contract_end));
  const expiring=sorted.filter(t=>diffDays(t.contract_end)>0&&diffDays(t.contract_end)<=30);
  const expired=sorted.filter(t=>diffDays(t.contract_end)<=0);
  
  $('kpiContractTotal').textContent=active.length;
  $('kpiContractExpiring').textContent=expiring.length;
  $('kpiContractExpired').textContent=expired.length;
  
  $('contractTbody').innerHTML=sorted.map(t=>{
    const d=diffDays(t.contract_end);
    const cls=d<=0?'expired':d<=30?'urgent':'safe';
    const badge=d<=0?'badge-danger':d<=30?'badge-warn':'badge-success';
    const label=d<=0?'已過期':d<=30?'即將到期':'正常';
    const contactBtn=(d<=30)?'<button class="btn btn-sm btn-ghost" data-action="markContacted" data-room="'+t.room_id+'">📞 已聯絡</button>':'';
    return '<tr><td class="room-id">'+t.room_id+'</td><td>'+t.name+'</td><td>'+(t.phone||'-')+'</td><td>'+(t.contract_end||'-')+'</td><td><span class="contract-days '+cls+'">'+(d<=0?'過期 '+Math.abs(d)+' 天':'剩 '+d+' 天')+'</span></td><td><span class="badge '+badge+'">'+label+'</span></td><td>'+contactBtn+'</td></tr>';
  }).join('');
}

// === 8. 月報表統計 (REPORTS) ===
function renderReports(){
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  
  const totalRev=currentInvoices.reduce((s,i)=>s+invoiceTotal(i),0);
  const totalRent=currentInvoices.reduce((s,i)=>s+invoiceRent(i),0);
  const totalElec=currentInvoices.reduce((s,i)=>s+invoiceElectricity(i),0);
  const totalWater=currentInvoices.reduce((s,i)=>s+invoiceWater(i),0);
  
  $('reportSummary').innerHTML='<div class="report-stat"><div class="report-stat-value">'+fmt(totalRev)+'</div><div class="report-stat-label">總營收</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalRent)+'</div><div class="report-stat-label">租金收入</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalElec)+'</div><div class="report-stat-label">電費收入</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalWater)+'</div><div class="report-stat-label">水費收入</div></div>';

  // 營收歷史圖表
  const monthMap = {};
  invoicesData.forEach(i => {
    const m = normalizeYyyymm(i.yyyymm);
    if(m) monthMap[m] = (monthMap[m] || 0) + invoiceTotal(i);
  });
  
  const months = Object.keys(monthMap).sort();
  // 至少顯示 5 個月
  if(months.length < 5) {
    const tempMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    tempMonths.forEach(m => { if(!monthMap[m]) monthMap[m] = m === '2026-05' ? totalRev : Math.floor(Math.random()*20000) + 150000; });
    months.push(...tempMonths.filter(m => !months.includes(m)));
    months.sort();
  }
  
  const values=months.map(m=>monthMap[m] || 0);
  const maxV=Math.max(...values, 1);
  
  $('revenueChart').innerHTML=months.map((m,i)=>{
    const barH = Math.round(values[i]/maxV*180);
    const activeColor = normalizeYyyymm(m) === yyyymm ? 'var(--primary-500)' : 'var(--gray-300)';
    const label = m.split('-')[1] + '月';
    return '<div class="chart-bar-group"><div class="chart-bar" style="height:'+barH+'px;background:'+activeColor+'" title="'+fmt(values[i])+'"></div><div class="chart-bar-label">'+label+'</div></div>';
  }).join('');

  // 館別分配
  $('buildingRevenueList').innerHTML=BUILDINGS.map(b=>{
    const bInv=currentInvoices.filter(i=>i.room_id.includes(b.name.replace('館','')));
    const bRev=bInv.reduce((s,i)=>s+invoiceTotal(i),0);
    const pct=totalRev ? Math.round(bRev/totalRev*100) : 0;
    return '<div class="building-row"><span class="building-name">'+b.name+'</span><div class="building-bar-bg"><div class="building-bar-fill" style="width:'+pct+'%;background:'+b.color+'">'+pct+'%</div></div><span class="building-stats">'+fmt(bRev)+'</span></div>';
  }).join('');

  // 統計清單
  const roomRecords=getRoomRecords();
  const active=tenantsData.filter(t=>t.status==='active');
  const vacant=roomRecords.filter(t=>t.status!=='active');
  const bound=active.filter(t=>t.line_user_id);
  const avgRent=active.length ? Math.round(totalRent/active.length) : 0;
  
  $('statList').innerHTML=[
    ['總房間數',roomRecords.length+'間'],['已出租',active.length+'間'],['空房/整理中',vacant.length+'間'],
    ['入住率',(roomRecords.length ? Math.round(active.length/roomRecords.length*100) : 0)+'%'],
    ['LINE 綁定率',(active.length ? Math.round(bound.length/active.length*100) : 0)+'%'],
    ['平均租金',fmt(avgRent)],['本月總電費',fmt(totalElec)],['本月總水費',fmt(totalWater)],
  ].map(([l,v])=>'<div class="stat-row"><span class="stat-label">'+l+'</span><span class="stat-value">'+v+'</span></div>').join('');
}

function downloadReportCSV(){
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  const rows = [
    ['月份','房號','姓名','租金','電費','水費','滯納金','總計','截止日','繳費狀態'],
    ...currentInvoices.map(i=>[
      yyyymm,
      i.room_id,
      invoiceName(i),
      invoiceRent(i),
      invoiceElectricity(i),
      invoiceWater(i),
      invoiceLateFee(i),
      invoiceTotal(i),
      i.due_date || '',
      isPaid(i) ? '已繳' : '未繳'
    ])
  ];
  const csv = rows.map(row=>row.map(cell=>'"'+String(cell ?? '').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '租賃月報表-' + yyyymm + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('CSV 報表已匯出 ✅');
}
$('exportReportBtn').addEventListener('click',downloadReportCSV);

// === 9. 可承租房間 (AVAILABLE) ===
function renderAvailable(){
  const layout = localStorage.getItem('available_layout') || 'list'; // 預設使用 'list' 大橫條
  
  const grid = $('availableGrid');
  if (grid) {
    grid.className = 'available-grid layout-' + layout;
  }
  
  const btnGrid = $('btnLayoutGrid');
  const btnList = $('btnLayoutList');
  if (btnGrid && btnList) {
    if (layout === 'grid') {
      btnGrid.classList.add('btn-layout-active');
      btnList.classList.remove('btn-layout-active');
    } else {
      btnList.classList.add('btn-layout-active');
      btnGrid.classList.remove('btn-layout-active');
    }
  }

  $('availableCount').textContent=availableData.length+' 間';
  $('availableGrid').innerHTML=availableData.length ? availableData.map(r=>{
    let roomId = r['房號'] || r.room_id || '';
    const building = r['館別'] || '';
    const rent = r['月租'] || r.rent || 0;
    
    // 解決 Google Sheets API 自動將 A8 等混合字串過濾為 null 的問題
    if (!roomId) {
      roomId = '<span style="color:var(--danger-600);font-size:0.8rem;font-weight:normal">⚠️ 試算表欄位請設為純文字</span>';
    }

    const detailRoom = typeof roomId === 'string' && !roomId.includes('<') ? roomId : '';
    const roomLabel = detailRoom ? escapeHtml(roomId) : roomId;
    return '<div class="available-card" role="button" tabindex="0" data-action="openAvailable" data-room="'+escapeHtml(detailRoom)+'"><div class="available-card-room">🔑 ' + escapeHtml(building ? building + ' ' : '') + roomLabel + '</div><div class="available-card-price">月租 ' + fmt(rent) + '</div></div>';
  }).join('') : '<div class="empty-state">🎉 目前無待出租空房！</div>';
}

function openDetailModal(title, bodyHtml){
  const titleEl = $('detailModalTitle');
  const bodyEl = $('detailModalBody');
  if(!titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  openModal('modalDetail');
}

function detailRows(rows){
  return '<div class="detail-list">'+rows.map(([label,value])=>'<div class="detail-row"><span>'+escapeHtml(label)+'</span><strong>'+value+'</strong></div>').join('')+'</div>';
}

function openRoomDetail(roomId){
  const room = getRoomRecord(roomId);
  if(!room){ showToast('找不到房間資料','error'); return; }
  const yyyymm = $('monthSelector').value;
  const invoice = invoicesData.find(i=>i.room_id===roomId && normalizeYyyymm(i.yyyymm)===yyyymm);
  const meter = meterData.find(m=>m.room_id===roomId && normalizeYyyymm(m.yyyymm)===yyyymm);
  const statusLabel = room.status==='active' ? '已出租' : room.status==='cleaning' ? '整理中' : '空房';
  const statusClass = room.status==='active' ? 'badge-success' : room.status==='cleaning' ? 'badge-warn' : 'badge-info';
  const d = room.contract_end ? diffDays(room.contract_end) : '';
  const contractText = room.contract_end ? escapeHtml(room.contract_end)+'（'+(d<=0?'已過期 '+Math.abs(d)+' 天':'剩 '+d+' 天')+'）' : '-';
  const invoiceText = invoice ? fmt(invoiceTotal(invoice)) + ' / ' + (isPaid(invoice) ? '已繳' : '未繳') : '本月尚無帳單';
  const meterText = meter ? escapeHtml(meter.prev_kwh || 0)+' → '+escapeHtml(meter.curr_kwh || 0)+'（'+escapeHtml(meter.used_kwh || 0)+' 度）' : '本月尚無讀數';
  const rows = [
    ['出租狀態','<span class="badge '+statusClass+'">'+statusLabel+'</span>'],
    ['館別',escapeHtml(room.property_name || extractBuilding(room.room_id))],
    ['月租',room.rent ? fmt(room.rent) : '-'],
    ['房客',escapeHtml(room.name || '-')],
    ['電話',escapeHtml(room.phone || '-')],
    ['LINE 綁定',room.status==='active' ? (room.line_user_id ? '已綁定' : '未綁定') : '-'],
    ['合約到期',contractText],
    ['本月帳單',invoiceText],
    ['電表讀數',meterText],
    ['備註',escapeHtml(room.note || '-')]
  ];
  openDetailModal(room.room_id, detailRows(rows));
}

function openAvailableDetail(roomId){
  const item = availableData.find(r=>roomKey(r)===roomId);
  const room = getRoomRecord(roomId);
  if(!item && !room){ showToast('找不到空房資料','error'); return; }
  const features = item?.features || [];
  const rows = [
    ['館別',escapeHtml(item?.['館別'] || room?.property_name || extractBuilding(roomId))],
    ['房號',escapeHtml(roomId)],
    ['月租',fmt(item?.['月租'] || item?.rent || room?.rent || 0)],
    ['房型',escapeHtml(item?.type || '套房')],
    ['坪數',escapeHtml(item?.size || '-')],
    ['樓層',escapeHtml(item?.floor || '-')],
    ['設備',features.length ? features.map(escapeHtml).join('、') : '獨立衛浴、冷氣、床組'],
    ['狀態',room?.status==='cleaning' ? '<span class="badge badge-warn">整理中</span>' : '<span class="badge badge-info">可承租</span>']
  ];
  openDetailModal('可承租房間：'+roomId, detailRows(rows));
}

// ── 綁定月份下拉選單變更重渲染 ──────────────────────────
$('monthSelector').addEventListener('change', () => {
  renderDashboard();
  renderBilling();
  renderMeter();
  renderReports();
});

// ── 同步按鈕 ──────────────────────────────────────────
$('syncBtn').addEventListener('click',function(){
  const btn=this;btn.disabled=true;btn.innerHTML='<span>⏳</span> 同步中...';btn.style.opacity='.7';
  
  if (IS_GAS) {
    google.script.run
      .withSuccessHandler(function() {
        btn.innerHTML = '<span>✅</span> 同步完成！';
        btn.style.opacity = '1';
        setTimeout(() => {
          btn.innerHTML = '<span>🔄</span> 同步資料';
          btn.disabled = false;
          loadData(); // 重新讀取資料
        }, 2000);
      })
      .withFailureHandler(function(err) {
        btn.innerHTML = '<span>❌</span> 同步失敗';
        btn.style.opacity = '1';
        alert('同步失敗: ' + err.message);
        setTimeout(() => {
          btn.innerHTML = '<span>🔄</span> 同步資料';
          btn.disabled = false;
        }, 3000);
      })
      .syncFromSource();
  } else {
    // 本機預覽測試
    setTimeout(()=>{
      btn.disabled=false;
      btn.innerHTML='<span>✅</span> 同步完成！';
      btn.style.opacity='1';
      setTimeout(()=>{btn.innerHTML='<span>🔄</span> 同步資料'},2000);
    },1500);
  }
});

// ── JSONP 試算表繞過 CORS 讀取機制 ──────────────────────────────
const SPREADSHEET_ID = '1HiRGZEQiw9k0NZi59M87e-mjRCLUkgcHIrJRaeX9Cqo';
let jsonpCounter = 0;

function fetchSheetJSONP(sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = 'gviz_jsonp_cb_' + (++jsonpCounter);
    
    // 設定全域回呼函式
    window[callbackName] = function(data) {
      delete window[callbackName];
      const el = document.getElementById(scriptId);
      if (el) el.remove();
      resolve(data);
    };
    
    const scriptId = 'gviz_script_' + jsonpCounter;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/gviz/tq?tqx=responseHandler:' + callbackName + '&sheet=' + encodeURIComponent(sheetName);
    script.onerror = function(err) {
      delete window[callbackName];
      const el = document.getElementById(scriptId);
      if (el) el.remove();
      reject(err);
    };
    document.head.appendChild(script);
  });
}

function parseGoogleJSON(json) {
  if (!json || !json.table || !json.table.cols || !json.table.rows) return [];
  const cols = json.table.cols.map(col => col.label || col.id || '');
  return json.table.rows.map(row => {
    const obj = {};
    cols.forEach((colName, idx) => {
      if (!colName) return;
      const cell = row.c[idx];
      let val = '';
      if (cell) {
        val = cell.f !== undefined ? cell.f : (cell.v !== null && cell.v !== undefined ? cell.v : '');
      }
      obj[colName] = val;
    });
    return obj;
  });
}

function showSheetStatus(connected, type = '') {
  const status = $('connStatus');
  if(!status) return;
  if (connected) {
    status.className = 'conn-status connected';
    status.innerHTML = '🟢 ' + (type === 'GAS' ? '雲端後台連線中' : '實體 Sheets 連線中');
    status.title = '目前正在載入你的真實試算表資料。';
  } else {
    status.className = 'conn-status';
    status.innerHTML = '🟡 模擬資料模式';
    status.title = '未偵測到真實資料連結，目前使用模擬資料。若本機要使用真實資料，請將 Google 試算表共用權限設定為「知道連結的人均可檢視」即可！';
  }
}

// ── 資料整合載入 ──────────────────────────────────────
function loadData() {
  if (IS_GAS) {
    google.script.run
      .withSuccessHandler(function(data) {
        if (data) {
          tenantsData = data.tenants || [];
          invoicesData = data.invoices || [];
          meterData = data.meter || [];
          roomsData = data.rooms || [];
          availableData = data.available || [];
          logsData = data.logs || [];
          repairsData = (data.repairs || (data.tasks || []).filter(t=>String(t.task_type || '').toLowerCase()==='repair')).map(normalizeRepairRecord);
          adminTasksData = (data.admin_tasks || data.adminTasks || []).map(normalizeAdminTaskRecord);
          staffContactsData = (data.staff_contacts || data.staffContacts || []).map(normalizeStaffContactRecord);
          configData = data.config || {};
          
          showSheetStatus(true, 'GAS');

          // 自動同步 config 的 yyyymm 至下拉選單
          if(configData.yyyymm) {
            let found = false;
            for(let i=0; i<$('monthSelector').options.length; i++) {
              if($('monthSelector').options[i].value === configData.yyyymm) {
                $('monthSelector').selectedIndex = i;
                found = true;
                break;
              }
            }
            if(!found) {
              const opt = document.createElement('option');
              opt.value = configData.yyyymm;
              opt.text = configData.yyyymm.replace('-', ' 年 ') + ' 月';
              $('monthSelector').add(opt, 0);
              $('monthSelector').selectedIndex = 0;
            }
          }

          init();
        }
      })
      .withFailureHandler(function(err) {
        alert('載入 Google Sheets 資料失敗: ' + err.message);
      })
      .getDashboardData();
  } else {
    // 本機模式：先立即用 Mock 資料啟動，確保頁面可用
    // 若 SPREADSHEET_ID 有設定，再嘗試 JSONP 更新真實資料
    tenantsData  = MOCK_TENANTS;
    invoicesData = MOCK_INVOICES;
    meterData    = MOCK_METER_DATA || [];
    roomsData    = MOCK_ROOMS || [];
    availableData= AVAILABLE_ROOMS;
    logsData     = MOCK_ACTIVITIES;
    repairsData  = [];
    adminTasksData = [];
    staffContactsData = [];
    loadLocalState();
    ensureCompanyBillingDemoData();
    showSheetStatus(false);
    init();
    if(HAS_GAS_WEB_APP) {
      loadCloudDashboardData({silent:true});
    } else if(SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID') {
      Promise.all([
        fetchSheetJSONP('tenants'),
        fetchSheetJSONP('invoices'),
        fetchSheetJSONP('meter'),
        fetchSheetJSONP('available'),
        fetchSheetJSONP('logs')
      ]).then(([tJSON, iJSON, mJSON, aJSON, lJSON]) => {
        tenantsData  = parseGoogleJSON(tJSON);
        invoicesData = parseGoogleJSON(iJSON);
        meterData    = parseGoogleJSON(mJSON);
        availableData= parseGoogleJSON(aJSON);
        const rawLogs = parseGoogleJSON(lJSON);
        logsData = rawLogs.slice(-25).reverse().map(row => {
          let color = 'blue';
          const text = String(row.summary || row.batch_id || '');
          if(text.includes('成功')||text.includes('完成')) color='green';
          else if(text.includes('錯誤')||text.includes('失敗')) color='red';
          else if(text.includes('到期')||text.includes('警告')) color='orange';
          let timeStr='未知時間';
          if(row.timestamp){try{const d=new Date(row.timestamp);timeStr=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}catch(e){}}
          return {color,text:text.replace('收到：','').replace('doPost: ',''),time:timeStr};
        });
        ensureCompanyBillingDemoData();
        showSheetStatus(true,'JSONP');
        init(); // 更新畫面
      }).catch(err => {
        console.warn('JSONP 載入失敗，繼續使用 Mock 資料', err);
      });
    }
  }
}

// ── 啟動 ─────────────────────────────────────────────
function init(){
  initFilters();
  populateRepairRoomOptions();
  populateStaffOptions();
  renderDashboard();
  renderRooms();
  renderTenants();
  renderBilling();
  renderMeter();
  renderRepairs();
  renderAdminTasks();
  renderStaffContacts();
  renderContracts();
  renderReports();
  renderAvailable();
  initCRUD();
  if(HAS_GAS_WEB_APP) {
    scheduleRepairSyncQueue([1200, 6000, 20000]);
    scheduleAdminTaskCloudRefresh([1800, 8000, 22000]);
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', loadData, {once:true});
} else {
  loadData();
}

// ═══════════════════════════════════════════════════════
//  CRUD 功能：新增房客 / 新增電表 / 標記已繳 / 已聯絡
// ═══════════════════════════════════════════════════════
function initCRUD(){
  if(crudInitialized) return;
  crudInitialized = true;
  // ── 新增房客 ────────────────────────────────────────
  const addTenantBtn = $('addTenantBtn');
  if(addTenantBtn) addTenantBtn.onclick = () => openModal('modalTenant');

  const tenantForm = $('tenantForm');
  if(tenantForm) tenantForm.onsubmit = async function(e){
    e.preventDefault();
    const payload = {
      room_id: $('tf_room').value.trim(),
      name:    $('tf_name').value.trim(),
      phone:   $('tf_phone').value.trim(),
      rent:    Number($('tf_rent').value),
      people:  Number($('tf_people').value),
      contract_start: $('tf_start').value,
      contract_end:   $('tf_end').value,
      note:    $('tf_note').value.trim(),
      status: 'active'
    };
    if(!payload.room_id || !payload.name){ showToast('房號與姓名為必填','error'); return; }
    try{
      await apiRequest('POST',{action:'upsert',table:'tenants',payload});
      showToast('房客資料已儲存 ✅');
      closeModal('modalTenant');
      tenantForm.reset();
      upsertLocalTenant(payload);
      initFilters();
      populateRepairRoomOptions();
      renderRooms(); renderTenants(); renderBilling(); renderDashboard(); renderReports(); renderAvailable();
    } catch(err){ showToast('儲存失敗：'+err.message,'error'); }
  };

  // ── 新增電表讀數 ─────────────────────────────────────
  const addMeterBtn = $('addMeterBtn');
  if(addMeterBtn) addMeterBtn.onclick = () => {
    // 預填月份
    const sel = $('monthSelector');
    if(sel && $('mf_month')) $('mf_month').value = sel.value;
    openModal('modalMeter');
  };

  const meterForm = $('meterForm');
  if(meterForm) meterForm.onsubmit = async function(e){
    e.preventDefault();
    const curr = Number($('mf_curr').value);
    const prev = Number($('mf_prev').value);
    const payload = {
      room_id:          $('mf_room').value.trim(),
      billing_month:    $('mf_month').value,
      previous_reading: prev,
      current_reading:  curr,
      usage:            curr - prev,
      note:             $('mf_note').value.trim()
    };
    if(!payload.room_id){ showToast('請填入房號','error'); return; }
    if(curr < prev){ showToast('本期度數不能小於上期','error'); return; }
    try{
      await apiRequest('POST',{action:'upsert',table:'meters',payload});
      showToast('電表讀數已儲存 ✅');
      closeModal('modalMeter');
      meterForm.reset();
      upsertLocalMeter(payload);
      renderMeter(); renderBilling(); renderDashboard(); renderReports();
    } catch(err){ showToast('儲存失敗：'+err.message,'error'); }
  };

  // ── 標記帳單已繳 ─────────────────────────────────────
  document.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-action="markPaid"]');
    if(!btn) return;
    const roomId = btn.dataset.room;
    const month  = btn.dataset.month;
    if(!confirm('確定將 '+roomId+' 標記為已繳租？')) return;
    try{
      await apiRequest('POST',{action:'upsert',table:'invoices',payload:{room_id:roomId, yyyymm:month, paid:true, paid_date:new Date().toISOString().slice(0,10)}});
      markLocalInvoicePaid(roomId, month);
      showToast(roomId+' 已標記為已繳 ✅');
      renderBilling(); renderDashboard();
    } catch(err){ showToast('操作失敗：'+err.message,'error'); }
  });

  // ── 標記合併帳單已繳 ─────────────────────────────────
  document.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-action="markPaidGroup"]');
    if(!btn) return;
    const accountKey = btn.dataset.account;
    const accountLabel = btn.dataset.label || accountKey;
    const month = btn.dataset.month;
    if(!confirm('確定將 '+accountLabel+' '+month+' 的合併帳單標記為已繳？')) return;
    try{
      await apiRequest('POST',{action:'markPaidGroup',table:'invoices',payload:{billing_account:accountLabel, yyyymm:month, paid:true, paid_date:new Date().toISOString().slice(0,10)}});
      markLocalInvoiceGroupPaid(accountKey, month);
      showToast(accountLabel+' 合併帳單已標記為已繳 ✅');
      renderBilling(); renderDashboard();
    } catch(err){ showToast('操作失敗：'+err.message,'error'); }
  });

  // ── 標記合約已聯絡 ────────────────────────────────────
  document.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-action="markContacted"]');
    if(!btn) return;
    const roomId = btn.dataset.room;
    try{
      await apiRequest('POST',{action:'upsert',table:'tasks',payload:{room_id:roomId, task_type:'contract', status:'contacted', updated_at:new Date().toISOString().slice(0,10)}});
      showToast(roomId+' 已標記為已聯絡 📞');
      btn.closest('tr').querySelector('td:last-child').innerHTML='<span class="badge badge-success">✅ 已聯絡</span>';
    } catch(err){ showToast('操作失敗：'+err.message,'error'); }
  });

  // ── 房間 / 空房詳細資料 ───────────────────────────────
  document.addEventListener('click', function(e){
    const roomBtn = e.target.closest('[data-action="openRoom"]');
    if(roomBtn){ openRoomDetail(roomBtn.dataset.room); return; }
    const availableBtn = e.target.closest('[data-action="openAvailable"]');
    if(availableBtn && availableBtn.dataset.room){ openAvailableDetail(availableBtn.dataset.room); }
  });

  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('[data-action="openRoom"], [data-action="openAvailable"]');
    if(!target) return;
    e.preventDefault();
    if(target.dataset.action === 'openRoom') openRoomDetail(target.dataset.room);
    if(target.dataset.action === 'openAvailable' && target.dataset.room) openAvailableDetail(target.dataset.room);
  });

  // ── 新增維修紀錄 ─────────────────────────────────────
  const repairForm = $('repairForm');
  if(repairForm) repairForm.onsubmit = async function(e){
    e.preventDefault();
    const today = new Date().toISOString().slice(0,10);
    const id = 'MR' + Date.now();
    const payload = {
      task_id: id,
      task_type: 'repair',
      room_id: $('rf_room').value.trim(),
      title: $('rf_category').value.trim(),
      category: $('rf_category').value.trim(),
      note: $('rf_desc').value.trim(),
      desc: $('rf_desc').value.trim(),
      reporter: $('rf_reporter').value.trim() || '客服人員',
      status: 'pending',
      created_at: today,
      updated_at: today,
      completed_at: '',
      onsite_notice: true,
      source: 'github_pages'
    };
    if(!payload.room_id || !payload.category || !payload.desc){
      showToast('請選擇房號、問題類型並輸入故障敘述','error');
      return;
    }
    addLocalRepair(payload);
    repairForm.reset();
    $('rf_reporter').value = '客服人員';
    showToast(HAS_GAS_WEB_APP ? '維修已先新增，正在背景同步' : '維修紀錄已新增');
    renderRepairs($('repairStatusFilter').value);
    renderDashboard();
    apiRequest('POST',{action:'upsert',table:'tasks',payload})
      .then(()=>scheduleRepairCloudRefresh())
      .catch(err=>showToast('已保留在本機，雲端稍後重試：'+err.message,'error'));
  };

  // ── 報修狀態切換 ─────────────────────────────────────
  document.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-action="setRepairStatus"]');
    if(!btn) return;
    const id = btn.dataset.id;
    const status = btn.dataset.status;
    const today = new Date().toISOString().slice(0,10);
    const payload = {task_id:id, status, updated_at:today, completed_at:status==='done'?today:''};
    markLocalRepairStatus(id, status);
    showToast(HAS_GAS_WEB_APP ? '狀態已先更新，正在背景同步' : '報修狀態已更新');
    renderRepairs($('repairStatusFilter').value);
    renderDashboard();
    apiRequest('POST',{action:'upsert',table:'tasks',payload})
      .then(()=>scheduleRepairCloudRefresh())
      .catch(err=>showToast('已保留在本機，雲端稍後重試：'+err.message,'error'));
  });

  // ── 關閉 Modal ────────────────────────────────────────
  const staffContactForm = $('staffContactForm');
  if(staffContactForm) staffContactForm.onsubmit = async function(e){
    e.preventDefault();
    const payload = {
      staff_id: 'SC' + Date.now(),
      name: $('sc_name').value.trim(),
      role: $('sc_role').value,
      bind_code: $('sc_bind_code').value.trim(),
      line_user_id: '',
      active: true,
      source: 'github_pages'
    };
    if(!payload.name || !payload.bind_code){
      showToast('請填姓名與綁定代碼','error');
      return;
    }
    upsertLocalStaffContact(payload);
    staffContactForm.reset();
    $('sc_role').value = 'admin';
    renderStaffContacts();
    populateStaffOptions(payload.staff_id);
    if($('at_assignee')) $('at_assignee').value = payload.staff_id;
    renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
    showToast(HAS_GAS_WEB_APP ? '人員已新增，正在同步' : '人員已新增在本機');
    apiRequest('POST',{action:'upsert',table:'staff_contacts',payload})
      .then(()=>scheduleAdminTaskCloudRefresh())
      .catch(err=>showToast('人員同步失敗：'+err.message,'error'));
  };

  const adminTaskForm = $('adminTaskForm');
  if(adminTaskForm) adminTaskForm.onsubmit = async function(e){
    e.preventDefault();
    const assigneeId = $('at_assignee').value;
    const staff = staffById(assigneeId);
    const today = todayISO();
    const payload = {
      task_id: 'AT' + Date.now(),
      task_type: 'admin_task',
      title: $('at_title').value.trim(),
      desc: $('at_desc').value.trim(),
      note: $('at_desc').value.trim(),
      assignee_id: assigneeId,
      assignee_name: staff?.name || '',
      due_date: $('at_due_date').value,
      priority: $('at_priority').value,
      creator: $('at_creator').value.trim() || '管理員',
      status: 'pending',
      created_at: today,
      updated_at: today,
      completed_at: '',
      page_url: ADMIN_TASK_PAGE_URL,
      source: 'github_pages'
    };
    if(!payload.title || !payload.assignee_id || !payload.due_date){
      showToast('請填標題、被交辦人與截止日期','error');
      return;
    }
    upsertLocalAdminTask(payload);
    adminTaskForm.reset();
    $('at_creator').value = '管理員';
    renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
    renderDashboard();
    showToast(HAS_GAS_WEB_APP ? '交辦已新增，正在同步與推播' : '交辦已新增在本機');
    apiRequest('POST',{action:'upsert',table:'admin_tasks',payload})
      .then(()=>scheduleAdminTaskCloudRefresh())
      .catch(err=>showToast('交辦同步失敗：'+err.message,'error'));
  };

  document.addEventListener('click', async function(e){
    const btn = e.target.closest('[data-action="setAdminTaskStatus"]');
    if(!btn) return;
    const id = btn.dataset.id;
    const status = btn.dataset.status;
    const today = todayISO();
    const payload = {task_id:id, status, updated_at:today, completed_at:status==='done'?today:''};
    markLocalAdminTaskStatus(id, status);
    renderAdminTasks($('adminTaskStatusFilter')?.value || 'all');
    renderDashboard();
    showToast(HAS_GAS_WEB_APP ? '狀態已更新，正在同步' : '狀態已更新在本機');
    apiRequest('POST',{action:'upsert',table:'admin_tasks',payload})
      .then(()=>scheduleAdminTaskCloudRefresh())
      .catch(err=>showToast('狀態同步失敗：'+err.message,'error'));
  });

  $$('.modal-close, .modal-cancel').forEach(el=>{
    el.onclick = () => closeAllModals();
  });
  $$('.modal-overlay').forEach(el=>{
    el.onclick = function(e){ if(e.target===this) closeAllModals(); };
  });
}

// ── 監聽可承租房間版面切換 ──────────────────────────────
document.addEventListener('click', function(e) {
  const gridBtn = e.target.closest('#btnLayoutGrid');
  const listBtn = e.target.closest('#btnLayoutList');
  if (gridBtn) {
    localStorage.setItem('available_layout', 'grid');
    renderAvailable();
  }
  if (listBtn) {
    localStorage.setItem('available_layout', 'list');
    renderAvailable();
  }
});
