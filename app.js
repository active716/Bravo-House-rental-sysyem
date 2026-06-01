const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);
const TODAY=new Date();

// ══════════════════════════════════════════
//  ★ 請將你的 GAS Web App 網址貼在這裡 ★
// ══════════════════════════════════════════
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
// ══════════════════════════════════════════

// ── 統一 API 呼叫函式 ───────────────────────
// GET:  apiRequest('GET')  → 呼叫 ?action=getAll
// POST: apiRequest('POST', {action,table,payload})
async function apiRequest(method='GET', body=null){
  try{
    showLoading();
    let res;
    if(method==='GET'){
      res=await fetch(GAS_WEB_APP_URL+'?action=getAll',{redirect:'follow'});
    } else {
      res=await fetch(GAS_WEB_APP_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        redirect:'follow'
      });
    }
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  } catch(err){
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

// ── 判斷執行環境 ────────────────────────────────────────
const IS_GAS = typeof google !== 'undefined' && google.script && google.script.run;

// ── 資料儲存中心（優先採用 Google Sheets 真實資料） ──────────
let tenantsData = [];
let invoicesData = [];
let meterData = [];
let availableData = [];
let repairsData = MOCK_REPAIRS;
let logsData = [];
let configData = {};
let roomsData = [];

// ── 頁面切換 ──────────────────────────────────────────
const pageTitles={dashboard:'儀表板',rooms:'房間管理',tenants:'房客管理',billing:'帳單管理',meter:'水電紀錄',repairs:'報修管理',contracts:'合約管理',reports:'月報表統計',available:'可承租房間'};
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
  tenantsData.forEach(t => {
    const b = extractBuilding(t.room_id);
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
  const active=tenantsData.filter(t=>t.status==='active');
  const vacant=tenantsData.filter(t=>t.status==='vacant');
  const totalRooms=tenantsData.length;
  
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  const revenue=currentInvoices.reduce((s,i)=>s+(Number(i.total) || 0),0);
  
  $('kpiTotalRooms').textContent=totalRooms;
  $('kpiOccupied').textContent=active.length;
  $('kpiVacant').textContent=vacant.length;
  $('kpiRevenue').textContent=fmt(revenue);
  $('kpiOccRate').textContent='↗ 入住率 '+ (totalRooms ? Math.round(active.length/totalRooms*100) : 0)+'%';

  // 警示清單
  const unpaid=currentInvoices.filter(i=>!i.paid);
  const expiring=active.filter(t=>t.contract_end && diffDays(t.contract_end)<=30 && diffDays(t.contract_end)>0);
  const expired=active.filter(t=>t.contract_end && diffDays(t.contract_end)<=0);
  const pendingRepairs=repairsData.filter(r=>r.status==='pending');
  
  let alerts='';
  if(unpaid.length)alerts+='<div class="alert-item danger"><span class="alert-icon">🚨</span>本月有 <b>'+unpaid.length+'</b> 位房客尚未繳租</div>';
  if(expired.length)alerts+='<div class="alert-item danger"><span class="alert-icon">📋</span>有 <b>'+expired.length+'</b> 份合約已過期，請儘速處理續約</div>';
  if(expiring.length)alerts+='<div class="alert-item warn"><span class="alert-icon">⏰</span>有 <b>'+expiring.length+'</b> 份合約將在 30 天內到期</div>';
  if(pendingRepairs.length)alerts+='<div class="alert-item info"><span class="alert-icon">🔧</span>有 <b>'+pendingRepairs.length+'</b> 件報修待處理</div>';
  $('alertStrip').innerHTML=alerts;

  // 館別長條圖
  const maxT=Math.max(...BUILDINGS.map(b=>b.total), 1);
  $('buildingList').innerHTML=BUILDINGS.map(b=>{
    const occ=tenantsData.filter(t=>t.room_id.startsWith(b.name.replace('館',''))&&t.status==='active').length;
    const pct=Math.round(occ/b.total*100) || 0;
    return '<div class="building-row"><span class="building-name">'+b.name+'</span><div class="building-bar-bg"><div class="building-bar-fill" style="width:'+Math.round(b.total/maxT*100)+'%;background:'+b.color+'">'+pct+'%</div></div><span class="building-stats">'+occ+'/'+b.total+'</span></div>';
  }).join('');

  // 系統動態
  $('activityList').innerHTML=logsData.length ? logsData.map(a=>'<div class="activity-item"><div class="activity-dot '+a.color+'"></div><div><div class="activity-text">'+a.text+'</div><span class="activity-time">'+a.time+'</span></div></div>').join('') : '<div class="empty-state">尚無系統紀錄</div>';

  // 快速看版
  $('unpaidDashCount').textContent=unpaid.length;
  $('unpaidQuickList').innerHTML=unpaid.length?unpaid.slice(0,5).map(i=>'<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+i.room_id+'</span><span class="name">'+i.name+'</span></div><span class="badge badge-danger">'+fmt(i.total)+'</span></div>').join(''):'<div class="empty-state">🎉 全部已繳清</div>';

  const allExpiring=[...expired,...expiring].sort((a,b)=>diffDays(a.contract_end)-diffDays(b.contract_end));
  $('expiringDashCount').textContent=allExpiring.length;
  $('expiringQuickList').innerHTML=allExpiring.length?allExpiring.slice(0,5).map(t=>{const d=diffDays(t.contract_end);const cls=d<=0?'badge-danger':'badge-warn';const txt=d<=0?'已過期'+Math.abs(d)+'天':'剩'+d+'天';return '<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+t.room_id+'</span><span class="name">'+t.name+'</span></div><span class="badge '+cls+'">'+txt+'</span></div>';}).join(''):'<div class="empty-state">✅ 近期無到期合約</div>';

  $('repairDashCount').textContent=pendingRepairs.length;
  $('repairQuickList').innerHTML=pendingRepairs.length?pendingRepairs.slice(0,5).map(r=>'<div class="quick-item"><div class="quick-item-left"><span class="room-id">'+r.room_id+'</span><span class="name">'+r.desc.substring(0,12)+'...</span></div><span class="badge badge-info">'+r.category+'</span></div>').join(''):'<div class="empty-state">✅ 無待處理報修</div>';

  // 側邊欄通知氣泡
  $('navVacantBadge').textContent=vacant.length;
  $('navUnpaidBadge').textContent=unpaid.length;
  $('navRepairBadge').textContent=pendingRepairs.length;
  $('navContractBadge').textContent=allExpiring.length;
}

// === 2. 房間管理 (ROOMS) ===
function renderRooms(filter={}){
  let list=[...tenantsData];
  if(filter.building&&filter.building!=='all')list=list.filter(t=>t.room_id.includes(filter.building));
  if(filter.status==='occupied')list=list.filter(t=>t.status==='active');
  else if(filter.status==='vacant')list=list.filter(t=>t.status==='vacant');
  if(filter.search)list=list.filter(t=>t.room_id.toLowerCase().includes(filter.search.toLowerCase()));

  // 網格視圖
  const groups={};
  list.forEach(t=>{const b=extractBuilding(t.room_id);if(!groups[b])groups[b]=[];groups[b].push(t)});
  $('roomGridContainer').innerHTML=Object.keys(groups).map(b=>'<div class="room-building-section"><div class="room-building-title">🏢 '+b+'</div><div class="room-grid">'+groups[b].map(t=>{const cls=t.status==='active'?'occupied':'vacant';return '<div class="room-cell '+cls+'"><div class="room-num">'+t.room_id.replace(b,'')+'</div><div class="room-tenant">'+(t.name||'空房')+'</div></div>';}).join('')+'</div></div>').join('');

  // 列表視圖
  $('roomTbody').innerHTML=list.map(t=>{const occ=t.status==='active';const bound=!!t.line_user_id;const d=t.contract_end?diffDays(t.contract_end):'';const dcls=d!==''?(d<=0?'expired':d<=30?'urgent':'safe'):'';return '<tr><td class="room-id">'+t.room_id+'</td><td><span class="badge badge-info">'+extractBuilding(t.room_id)+'</span></td><td><span class="badge '+(occ?'badge-success':'badge-warn')+'">'+(occ?'已出租':'空房')+'</span></td><td>'+(t.name||'-')+'</td><td class="amount">'+(occ?fmt(t.rent):'-')+'</td><td>'+(occ?'<span class="line-status"><span class="line-dot '+(bound?'bound':'unbound')+'"></span>'+(bound?'已綁':'未綁')+'</span>':'-')+'</td><td>'+(t.contract_end?'<span class="contract-days '+dcls+'">'+(d<=0?'已過期':'剩'+d+'天')+'</span>':'-')+'</td></tr>';}).join('');
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
function renderBilling(){
  const yyyymm = $('monthSelector').value;
  const currentInvoices = invoicesData.filter(i => normalizeYyyymm(i.yyyymm) === yyyymm);
  
  const total=currentInvoices.reduce((s,i)=>s+(Number(i.total) || 0),0);
  const sent=currentInvoices.filter(i=>i.sent).length;
  const unpaid=currentInvoices.filter(i=>!i.paid);
  
  $('kpiBillCount').textContent=currentInvoices.length;
  $('kpiBillSent').textContent=sent;
  $('kpiBillUnpaid').textContent=unpaid.length;
  $('kpiBillTotal').textContent=fmt(total);
  $('unpaidBillCount').textContent=unpaid.length+'位';

  // 逾期計算 (基準為當月 10 號)
  const [year, month] = yyyymm.split('-');
  const dueBase = year + '-' + month + '-10';
  const overDays = Math.max(0, diffDays(dueBase) * -1);

  $('unpaidTbody').innerHTML=unpaid.length?unpaid.map(i=>{
    return '<tr><td class="room-id">'+i.room_id+'</td><td>'+i.name+'</td><td class="amount" style="font-weight:800;color:var(--danger-600)">'+fmt(i.total)+'</td><td>'+(i.due_date || (year+'/'+month+'/10'))+'</td><td><span class="badge badge-danger">逾期 '+overDays+' 天</span></td><td><span class="badge badge-danger">❌ 未繳</span></td></tr>';
  }).join(''):'<tr><td colspan="6" class="empty-state">🎉 全部已繳清</td></tr>';

  $('billingTbody').innerHTML=currentInvoices.map(i=>{
    const yyyymm=$('monthSelector').value;
    const [year,month]=yyyymm.split('-');
    const paidBtn=i.paid?'<span class="badge badge-success">✅ 已繳</span>':'<button class="btn btn-sm btn-success" data-action="markPaid" data-room="'+i.room_id+'" data-month="'+yyyymm+'">標記已繳</button>';
    return '<tr><td class="room-id">'+i.room_id+'</td><td>'+i.name+'</td><td class="amount">'+fmt(i.rent)+'</td><td class="amount">'+fmt(i.electricity)+'</td><td class="amount">'+fmt(i.water)+'</td><td class="amount">'+(i.late_fee>0?fmt(i.late_fee):'-')+'</td><td class="amount" style="font-weight:800">'+fmt(i.total)+'</td><td>'+(i.due_date||(year+'/'+month+'/10'))+'</td><td>'+paidBtn+'</td></tr>';
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
    const elecCharge = invoiceMap[m.room_id] ? invoiceMap[m.room_id].electricity : 0;
    const usedK = Number(m.used_kwh) || 0;
    const pct=Math.round(usedK/maxK*100);
    const lv=usedK>160?'high':usedK>100?'medium':'low';
    return '<tr><td class="room-id">'+m.room_id+'</td><td>'+name+'</td><td class="amount">'+(m.prev_kwh || 0)+'</td><td class="amount">'+(m.curr_kwh || 0)+'</td><td class="amount" style="font-weight:700">'+usedK+' 度</td><td class="amount">'+fmt(elecCharge)+'</td><td><div class="meter-bar-wrapper"><div class="meter-bar"><div class="meter-bar-fill '+lv+'" style="width:'+pct+'%"></div></div><span class="meter-kwh">'+usedK+'度</span></div></td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty-state">本月尚無電表讀數紀錄</td></tr>';
}

// === 6. 報修管理 (REPAIRS) ===
function renderRepairs(statusFilter='all'){
  let list=[...repairsData];
  if(statusFilter!=='all')list=list.filter(r=>r.status===statusFilter);
  const statusMap={pending:'待處理',in_progress:'處理中',done:'已完成'};
  const badgeMap={pending:'badge-danger',in_progress:'badge-warn',done:'badge-success'};
  
  $('kpiRepairTotal').textContent=repairsData.length;
  $('kpiRepairPending').textContent=repairsData.filter(r=>r.status==='pending').length;
  $('kpiRepairProgress').textContent=repairsData.filter(r=>r.status==='in_progress').length;
  $('kpiRepairDone').textContent=repairsData.filter(r=>r.status==='done').length;
  
  $('repairCards').innerHTML=list.map(r=>'<div class="repair-card status-'+r.status+'"><div class="repair-card-header"><div><div class="repair-room">'+r.room_id+'</div><span class="badge badge-info" style="margin-top:4px">'+r.category+'</span></div><div style="text-align:right"><span class="badge '+badgeMap[r.status]+'">'+statusMap[r.status]+'</span><div class="repair-date" style="margin-top:4px">'+r.date+'</div></div></div><div class="repair-desc">'+r.desc+'</div><div class="repair-footer"><span class="repair-reporter">報修人：'+r.reporter+'</span></div></div>').join('');
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
  
  const totalRev=currentInvoices.reduce((s,i)=>s+(Number(i.total) || 0),0);
  const totalRent=currentInvoices.reduce((s,i)=>s+(Number(i.rent) || 0),0);
  const totalElec=currentInvoices.reduce((s,i)=>s+(Number(i.electricity) || 0),0);
  const totalWater=currentInvoices.reduce((s,i)=>s+(Number(i.water) || 0),0);
  
  $('reportSummary').innerHTML='<div class="report-stat"><div class="report-stat-value">'+fmt(totalRev)+'</div><div class="report-stat-label">總營收</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalRent)+'</div><div class="report-stat-label">租金收入</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalElec)+'</div><div class="report-stat-label">電費收入</div></div><div class="report-stat"><div class="report-stat-value">'+fmt(totalWater)+'</div><div class="report-stat-label">水費收入</div></div>';

  // 營收歷史圖表
  const monthMap = {};
  invoicesData.forEach(i => {
    const m = normalizeYyyymm(i.yyyymm);
    if(m) monthMap[m] = (monthMap[m] || 0) + (Number(i.total) || 0);
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
    const bRev=bInv.reduce((s,i)=>s+(Number(i.total) || 0),0);
    const pct=totalRev ? Math.round(bRev/totalRev*100) : 0;
    return '<div class="building-row"><span class="building-name">'+b.name+'</span><div class="building-bar-bg"><div class="building-bar-fill" style="width:'+pct+'%;background:'+b.color+'">'+pct+'%</div></div><span class="building-stats">'+fmt(bRev)+'</span></div>';
  }).join('');

  // 統計清單
  const active=tenantsData.filter(t=>t.status==='active');
  const vacant=tenantsData.filter(t=>t.status==='vacant');
  const bound=active.filter(t=>t.line_user_id);
  const avgRent=active.length ? Math.round(totalRent/active.length) : 0;
  
  $('statList').innerHTML=[
    ['總房間數',tenantsData.length+'間'],['已出租',active.length+'間'],['空房',vacant.length+'間'],
    ['入住率',(tenantsData.length ? Math.round(active.length/tenantsData.length*100) : 0)+'%'],
    ['LINE 綁定率',(active.length ? Math.round(bound.length/active.length*100) : 0)+'%'],
    ['平均租金',fmt(avgRent)],['本月總電費',fmt(totalElec)],['本月總水費',fmt(totalWater)],
  ].map(([l,v])=>'<div class="stat-row"><span class="stat-label">'+l+'</span><span class="stat-value">'+v+'</span></div>').join('');
}
$('exportReportBtn').addEventListener('click',()=>alert('報表匯出功能：請直接前往 Google Sheets 下載 invoices 頁面即可！'));

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

    return '<div class="available-card"><div class="available-card-room">🔑 ' + (building ? building + ' ' : '') + roomId + '</div><div class="available-card-price">月租 ' + fmt(rent) + '</div></div>';
  }).join('') : '<div class="empty-state">🎉 目前無待出租空房！</div>';
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
          availableData = data.available || [];
          logsData = data.logs || [];
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
    availableData= AVAILABLE_ROOMS;
    logsData     = MOCK_ACTIVITIES;
    repairsData  = MOCK_REPAIRS;
    showSheetStatus(false);
    init();

    // 若試算表 ID 已設定且非預設值，則嘗試背景載入真實資料
    if(SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID') {
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
  renderDashboard();
  renderRooms();
  renderTenants();
  renderBilling();
  renderMeter();
  renderRepairs();
  renderContracts();
  renderReports();
  renderAvailable();
  initCRUD();
}

loadData();

// ═══════════════════════════════════════════════════════
//  CRUD 功能：新增房客 / 新增電表 / 標記已繳 / 已聯絡
// ═══════════════════════════════════════════════════════
function initCRUD(){
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
      // 本地追加（真實環境會重新 loadData）
      tenantsData.push({...payload, line_user_id:'', tenant_id:'T'+Date.now()});
      renderTenants(); renderDashboard();
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
      meterData.push({yyyymm:payload.billing_month, room_id:payload.room_id, prev_kwh:prev, curr_kwh:curr, used_kwh:payload.usage});
      renderMeter();
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
      const inv = invoicesData.find(i=>i.room_id===roomId && normalizeYyyymm(i.yyyymm)===month);
      if(inv){ inv.paid=true; inv.status='paid'; }
      showToast(roomId+' 已標記為已繳 ✅');
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

  // ── 關閉 Modal ────────────────────────────────────────
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


