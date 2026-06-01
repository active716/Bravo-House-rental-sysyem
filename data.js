// ============================================================
//  租賃管理行動後台 — 模擬資料 (Mock Data)
//  當 GAS API 無法連線時自動使用此資料測試畫面
// ============================================================

// 館別設定
const BUILDINGS = [
  { name: '楠梓A館', color: '#3b82f6', total: 80 },
  { name: '楠梓B館', color: '#8b5cf6', total: 24 },
  { name: '光華館',  color: '#06b6d4', total: 20 },
  { name: '建楠館',  color: '#f59e0b', total: 22 },
  { name: '六合館',  color: '#10b981', total: 10 },
];

// ── 房間資料 (rooms) ──────────────────────────────────────────
const MOCK_ROOMS = [
  { room_id:'楠梓A館101', property_name:'楠梓A館', rent:5500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館102', property_name:'楠梓A館', rent:5500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館103', property_name:'楠梓A館', rent:5800, status:'occupied', note:'LINE未綁', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館201', property_name:'楠梓A館', rent:6000, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館202', property_name:'楠梓A館', rent:5500, status:'occupied', note:'雙人房', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館203', property_name:'楠梓A館', rent:5500, status:'vacant',   note:'剛整理好', created_at:'2024-01-01', updated_at:'2026-05-20' },
  { room_id:'楠梓A館301', property_name:'楠梓A館', rent:6200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館302', property_name:'楠梓A館', rent:5500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館303', property_name:'楠梓A館', rent:5800, status:'cleaning', note:'預計6/1完成', created_at:'2024-01-01', updated_at:'2026-05-28' },
  { room_id:'楠梓A館501', property_name:'楠梓A館', rent:6000, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館502', property_name:'楠梓A館', rent:5500, status:'occupied', note:'合約到期', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館601', property_name:'楠梓A館', rent:5800, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館602', property_name:'楠梓A館', rent:5500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館701', property_name:'楠梓A館', rent:6200, status:'occupied', note:'LINE未綁', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓A館702', property_name:'楠梓A館', rent:5500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓B館201', property_name:'楠梓B館', rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓B館202', property_name:'楠梓B館', rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓B館301', property_name:'楠梓B館', rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'楠梓B館302', property_name:'楠梓B館', rent:5500, status:'vacant',   note:'', created_at:'2024-01-01', updated_at:'2026-05-15' },
  { room_id:'楠梓B館401', property_name:'楠梓B館', rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'光華館101',  property_name:'光華館',  rent:4800, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'光華館102',  property_name:'光華館',  rent:4800, status:'occupied', note:'合約快到', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'光華館201',  property_name:'光華館',  rent:5000, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'光華館202',  property_name:'光華館',  rent:5000, status:'vacant',   note:'', created_at:'2024-01-01', updated_at:'2026-05-10' },
  { room_id:'光華館301',  property_name:'光華館',  rent:5200, status:'occupied', note:'LINE未綁', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'建楠館601',  property_name:'建楠館',  rent:4500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'建楠館602',  property_name:'建楠館',  rent:4500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'建楠館701',  property_name:'建楠館',  rent:4500, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'建楠館711',  property_name:'建楠館',  rent:4800, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'建楠館801',  property_name:'建楠館',  rent:4500, status:'vacant',   note:'', created_at:'2024-01-01', updated_at:'2026-05-05' },
  { room_id:'建楠館802',  property_name:'建楠館',  rent:4800, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'六合館201',  property_name:'六合館',  rent:5000, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'六合館202',  property_name:'六合館',  rent:5000, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'六合館301',  property_name:'六合館',  rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
  { room_id:'六合館302',  property_name:'六合館',  rent:5200, status:'occupied', note:'', created_at:'2024-01-01', updated_at:'2026-05-01' },
];

// ── 房客資料 (tenants) ────────────────────────────────────────
const MOCK_TENANTS = [
  { tenant_id:'T001', room_id:'楠梓A館101', name:'王小明', phone:'0912-345-678', rent:5500, people:1, status:'active', line_user_id:'U1a', contract_start:'2025-08-01', contract_end:'2026-07-31', note:'' },
  { tenant_id:'T002', room_id:'楠梓A館102', name:'李大華', phone:'0923-456-789', rent:5500, people:2, status:'active', line_user_id:'U4d', contract_start:'2025-06-01', contract_end:'2026-05-31', note:'' },
  { tenant_id:'T003', room_id:'楠梓A館103', name:'張美麗', phone:'0934-567-890', rent:5800, people:1, status:'active', line_user_id:'',    contract_start:'2025-09-01', contract_end:'2026-08-31', note:'尚未綁定LINE' },
  { tenant_id:'T004', room_id:'楠梓A館201', name:'陳志豪', phone:'0945-678-901', rent:6000, people:1, status:'active', line_user_id:'U7g', contract_start:'2026-01-01', contract_end:'2026-12-31', note:'' },
  { tenant_id:'T005', room_id:'楠梓A館202', name:'林佳穎', phone:'0956-789-012', rent:5500, people:2, status:'active', line_user_id:'Uj0', contract_start:'2025-07-01', contract_end:'2026-06-30', note:'' },
  { tenant_id:'T006', room_id:'楠梓A館301', name:'劉家銘', phone:'0967-890-123', rent:6200, people:1, status:'active', line_user_id:'Um3', contract_start:'2025-10-01', contract_end:'2026-09-30', note:'' },
  { tenant_id:'T007', room_id:'楠梓A館302', name:'吳佩珊', phone:'0978-901-234', rent:5500, people:2, status:'active', line_user_id:'Up6', contract_start:'2025-12-01', contract_end:'2026-11-30', note:'' },
  { tenant_id:'T008', room_id:'楠梓A館501', name:'周書琴', phone:'0989-012-345', rent:6000, people:1, status:'active', line_user_id:'',    contract_start:'2026-02-01', contract_end:'2027-01-31', note:'LINE未綁' },
  { tenant_id:'T009', room_id:'楠梓A館502', name:'鄭文傑', phone:'0910-111-222', rent:5500, people:1, status:'active', line_user_id:'Uv2', contract_start:'2025-05-01', contract_end:'2026-04-30', note:'合約已過期' },
  { tenant_id:'T010', room_id:'楠梓A館601', name:'謝靜宜', phone:'0921-222-333', rent:5800, people:2, status:'active', line_user_id:'Uy5', contract_start:'2026-03-01', contract_end:'2027-02-28', note:'' },
  { tenant_id:'T011', room_id:'楠梓A館602', name:'洪建國', phone:'0932-333-444', rent:5500, people:1, status:'active', line_user_id:'Ub8', contract_start:'2025-11-01', contract_end:'2026-10-31', note:'' },
  { tenant_id:'T012', room_id:'楠梓A館701', name:'許志遠', phone:'0943-444-555', rent:6200, people:1, status:'active', line_user_id:'',    contract_start:'2025-04-01', contract_end:'2026-06-15', note:'LINE未綁' },
  { tenant_id:'T013', room_id:'楠梓A館702', name:'楊淑芬', phone:'0954-555-666', rent:5500, people:2, status:'active', line_user_id:'Ue1', contract_start:'2026-01-15', contract_end:'2027-01-14', note:'' },
  { tenant_id:'T014', room_id:'楠梓B館201', name:'莊有均', phone:'0965-666-777', rent:5200, people:1, status:'active', line_user_id:'Uk7', contract_start:'2025-08-01', contract_end:'2026-07-31', note:'' },
  { tenant_id:'T015', room_id:'楠梓B館202', name:'潘秋華', phone:'0976-777-888', rent:5200, people:2, status:'active', line_user_id:'',    contract_start:'2025-06-15', contract_end:'2026-06-14', note:'' },
  { tenant_id:'T016', room_id:'楠梓B館301', name:'高志明', phone:'0987-888-999', rent:5200, people:1, status:'active', line_user_id:'Un0', contract_start:'2026-02-01', contract_end:'2027-01-31', note:'' },
  { tenant_id:'T017', room_id:'楠梓B館401', name:'何建志', phone:'0998-999-000', rent:5200, people:2, status:'active', line_user_id:'',    contract_start:'2025-09-01', contract_end:'2026-08-31', note:'' },
  { tenant_id:'T018', room_id:'光華館101',  name:'鍾美玲', phone:'0911-123-456', rent:4800, people:1, status:'active', line_user_id:'Ut6', contract_start:'2025-07-01', contract_end:'2026-06-30', note:'' },
  { tenant_id:'T019', room_id:'光華館102',  name:'范國華', phone:'0922-234-567', rent:4800, people:1, status:'active', line_user_id:'',    contract_start:'2025-05-01', contract_end:'2026-06-20', note:'' },
  { tenant_id:'T020', room_id:'光華館201',  name:'宋雅惠', phone:'0933-345-678', rent:5000, people:2, status:'active', line_user_id:'Uw9', contract_start:'2026-01-01', contract_end:'2026-12-31', note:'' },
  { tenant_id:'T021', room_id:'光華館301',  name:'柯宗翰', phone:'0944-456-789', rent:5200, people:1, status:'active', line_user_id:'',    contract_start:'2025-10-01', contract_end:'2026-09-30', note:'LINE未綁' },
  { tenant_id:'T022', room_id:'建楠館601',  name:'顏美如', phone:'0955-567-890', rent:4500, people:1, status:'active', line_user_id:'Uc5', contract_start:'2025-12-01', contract_end:'2026-11-30', note:'' },
  { tenant_id:'T023', room_id:'建楠館602',  name:'賴志豪', phone:'0966-678-901', rent:4500, people:2, status:'active', line_user_id:'',    contract_start:'2025-08-15', contract_end:'2026-08-14', note:'' },
  { tenant_id:'T024', room_id:'建楠館701',  name:'施淑萍', phone:'0977-789-012', rent:4500, people:1, status:'active', line_user_id:'Uf8', contract_start:'2026-03-01', contract_end:'2027-02-28', note:'' },
  { tenant_id:'T025', room_id:'建楠館711',  name:'江文斌', phone:'0988-890-123', rent:4800, people:1, status:'active', line_user_id:'Ui1', contract_start:'2025-06-01', contract_end:'2026-05-31', note:'' },
  { tenant_id:'T026', room_id:'建楠館802',  name:'田志成', phone:'0999-901-234', rent:4800, people:1, status:'active', line_user_id:'Ul4', contract_start:'2025-11-01', contract_end:'2026-10-31', note:'' },
  { tenant_id:'T027', room_id:'六合館201',  name:'尤美玲', phone:'0910-012-345', rent:5000, people:1, status:'active', line_user_id:'Uo7', contract_start:'2026-01-01', contract_end:'2026-12-31', note:'' },
  { tenant_id:'T028', room_id:'六合館202',  name:'石承恩', phone:'0921-123-456', rent:5000, people:2, status:'active', line_user_id:'',    contract_start:'2025-07-01', contract_end:'2026-06-30', note:'' },
  { tenant_id:'T029', room_id:'六合館301',  name:'方婉婷', phone:'0932-234-567', rent:5200, people:1, status:'active', line_user_id:'',    contract_start:'2025-09-01', contract_end:'2026-08-31', note:'' },
  { tenant_id:'T030', room_id:'六合館302',  name:'巫建輝', phone:'0943-345-678', rent:5200, people:1, status:'active', line_user_id:'Ur0', contract_start:'2026-04-01', contract_end:'2027-03-31', note:'' },
];

// ── 電表紀錄 (meters) ─────────────────────────────────────────
const MOCK_METERS = (function() {
  return MOCK_TENANTS.map(t => {
    const prev = Math.floor(Math.random() * 300) + 200;
    const used = Math.floor(Math.random() * 180) + 40;
    return {
      meter_id: 'M' + t.tenant_id,
      room_id: t.room_id,
      billing_month: '2026-05',
      previous_reading: prev,
      current_reading: prev + used,
      usage: used,
      photo_url: '',
      note: '',
      created_at: '2026-05-25',
      updated_at: '2026-05-25'
    };
  });
})();

// 舊版相容性別名（供 app.js 使用）
const MOCK_METER_DATA = MOCK_METERS.map(m => ({
  yyyymm: m.billing_month,
  room_id: m.room_id,
  prev_kwh: m.previous_reading,
  curr_kwh: m.current_reading,
  used_kwh: m.usage,
}));

// ── 帳單 (invoices) ───────────────────────────────────────────
const MOCK_INVOICES = (function() {
  const meterMap = {};
  MOCK_METER_DATA.forEach(m => { meterMap[m.room_id] = m; });

  return MOCK_TENANTS.map((t, idx) => {
    const m = meterMap[t.room_id] || {};
    const used = m.used_kwh || 0;
    const elec = used * 5;
    const water = t.people * 100;
    const late = (idx % 9 === 0) ? 200 : 0;
    const total = t.rent + elec + water + late;
    const paid = (idx % 7 !== 0);  // 約 1/7 未繳
    return {
      invoice_id: 'INV2026-05-' + t.room_id,
      room_id: t.room_id,
      tenant_name: t.name,
      billing_month: '2026-05',
      yyyymm: '2026-05',
      rent: t.rent,
      water_fee: water,
      electric_fee: elec,
      other_fee: late,
      total_amount: total,
      status: paid ? 'paid' : 'unpaid',
      paid_date: paid ? '2026-05-08' : '',
      note: '',
      // 舊版相容
      name: t.name,
      electricity: elec,
      water: water,
      late_fee: late,
      total: total,
      paid: paid,
      sent: !!t.line_user_id,
      due_date: '2026/5/10',
    };
  });
})();

// ── 待辦任務 (tasks) ──────────────────────────────────────────
const MOCK_TASKS = [
  { task_id:'TK001', task_type:'repair',   room_id:'楠梓A館101', title:'浴室水龍頭漏水', status:'pending',     due_date:'2026-06-02', note:'已用膠帶暫時固定',   created_at:'2026-05-26', updated_at:'2026-05-26' },
  { task_id:'TK002', task_type:'repair',   room_id:'楠梓B館201', title:'冷氣不冷',       status:'pending',     due_date:'2026-06-01', note:'濾網已清但沒改善',  created_at:'2026-05-25', updated_at:'2026-05-25' },
  { task_id:'TK003', task_type:'repair',   room_id:'光華館101',  title:'門鎖難開',       status:'in_progress', due_date:'2026-05-31', note:'師傅已預約',        created_at:'2026-05-22', updated_at:'2026-05-28' },
  { task_id:'TK004', task_type:'repair',   room_id:'建楠館711',  title:'窗戶玻璃裂縫',   status:'pending',     due_date:'2026-06-05', note:'',                  created_at:'2026-05-27', updated_at:'2026-05-27' },
  { task_id:'TK005', task_type:'repair',   room_id:'楠梓A館301', title:'馬桶持續流水',   status:'in_progress', due_date:'2026-05-31', note:'師傅已到場',        created_at:'2026-05-20', updated_at:'2026-05-29' },
  { task_id:'TK006', task_type:'repair',   room_id:'六合館201',  title:'熱水器點不著火', status:'pending',     due_date:'2026-05-31', note:'緊急',              created_at:'2026-05-28', updated_at:'2026-05-28' },
  { task_id:'TK007', task_type:'repair',   room_id:'楠梓A館601', title:'牆壁漏水',       status:'done',        due_date:'2026-05-15', note:'已修繕完成',        created_at:'2026-05-10', updated_at:'2026-05-14' },
  { task_id:'TK008', task_type:'contract', room_id:'楠梓A館502', title:'合約到期聯絡',   status:'pending',     due_date:'2026-06-01', note:'已過期需立即處理',  created_at:'2026-05-28', updated_at:'2026-05-28' },
  { task_id:'TK009', task_type:'contract', room_id:'楠梓A館102', title:'合約即將到期',   status:'contacted',   due_date:'2026-06-05', note:'已致電，確認續租', created_at:'2026-05-25', updated_at:'2026-05-29' },
];

// 報修資料（供舊版 app.js 相容）
const MOCK_REPAIRS = MOCK_TASKS.filter(t => t.task_type === 'repair').map(t => ({
  id: t.task_id,
  room_id: t.room_id,
  reporter: '',
  desc: t.title,
  status: t.status,
  date: t.created_at,
  category: t.note || '維修',
}));

// ── 可承租房間 ───────────────────────────────────────────────
const AVAILABLE_ROOMS = MOCK_ROOMS.filter(r => r.status === 'vacant' || r.status === 'cleaning').map(r => ({
  room_id: r.room_id,
  '房號': r.room_id,
  '館別': r.property_name,
  '月租': r.rent,
  type: '套房',
  size: '6坪',
  floor: (r.room_id.match(/\d(\d\d)/) ? r.room_id.match(/(\d)\d\d/)[1] + 'F' : '1F'),
  features: ['獨立衛浴', '冷氣', '床組'],
}));

// 動態
const MOCK_ACTIVITIES = [
  { color:'green',  text:'楠梓A館301 劉家銘 LINE 綁定成功',       time:'今天 14:32' },
  { color:'blue',   text:'同步資料完成 — 35 筆房客已更新',         time:'今天 10:15' },
  { color:'red',    text:'六合館201 尤美玲 報修：熱水器點不著火',  time:'昨天 18:20' },
  { color:'green',  text:'2026-05 帳單發送完成：成功 24 筆',       time:'昨天 09:00' },
  { color:'orange', text:'楠梓A館502 鄭文傑 合約已過期（2026-04-30）', time:'2 天前' },
  { color:'green',  text:'楠梓B館201 莊有均 LINE 綁定成功',        time:'3 天前' },
  { color:'red',    text:'光華館301 柯宗翰 帳單發送失敗（未綁定）', time:'3 天前' },
  { color:'blue',   text:'系統排程：自動備份已完成',               time:'4 天前' },
];
