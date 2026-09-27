/* ══════════════════════════════════════════════════════════════════════════
   PANO — birden fazla pano ve widget, localStorage'da saklanır
   ══════════════════════════════════════════════════════════════════════════ */
const PANO_KEY = 'deviceController.panolar.v1';

/* Kayıt şekli:
   { activeId, panolar:[ { id, name, widgets:[ widget ] } ] }
   widget (gösterge): { id, kind:'gauge', deviceId, deviceName, deviceType,
                        mask, metric, style, title }
   widget (kontrol):  { id, kind:'action', deviceId, deviceName, deviceType,
                        mask, action:'turns'|'angle'|'stop', value, dir, title } */

let pano = { activeId:null, panolar:[] };
const uid = () => Math.random().toString(36).slice(2, 10);

function panoLoad(){
  try{
    const raw = localStorage.getItem(PANO_KEY);
    if(raw){
      const p = JSON.parse(raw);
      if(p && Array.isArray(p.panolar)) pano = p;
    }
  }catch(e){ console.warn('Pano okunamadı, sıfırdan başlanıyor:', e); }

  if(!pano.panolar.length){
    pano.panolar = [{ id: uid(), name: 'Pano 1', widgets: [] }];
  }
  if(!pano.panolar.some(p => p.id === pano.activeId)){
    pano.activeId = pano.panolar[0].id;
  }
}

function panoSave(){
  try{ localStorage.setItem(PANO_KEY, JSON.stringify(pano)); }
  catch(e){ alert('Pano kaydedilemedi (localStorage dolu veya kapalı olabilir): ' + e.message); }
}

const panoActive = () => pano.panolar.find(p => p.id === pano.activeId) || pano.panolar[0];

/* ── Ölçüm kayıtları: cihaz tipi → gösterilebilir değerler ────────────── */
const METRICS = {
  motorShared: [
    { key:'angle',    get label(){ return metricLabel('angle', 'Angle'); },        unit:'°',  min:0,   max:359, style:'dial' },
    { key:'position', get label(){ return metricLabel('position', 'Position'); },  unit:'°',  style:'number' },
    { key:'speed',    get label(){ return metricLabel('speed', 'Speed'); },        unit:'%',  min:-100, max:100, style:'bar' },
    { key:'power',    get label(){ return metricLabel('power', 'Torque'); },       unit:'%',  min:0,   max:100, style:'bar' },
    { key:'state',    get label(){ return metricLabel('state', 'Motor state'); },  style:'text' }
  ],
  common: [
    { key:'battery',  get label(){ return metricLabel('battery', 'Battery'); },        unit:'%',  min:0, max:100, style:'bar' },
    { key:'usb',      get label(){ return metricLabel('usb', 'Power source'); },       style:'text' }
  ],
  color_sensor: [
    { key:'color',      get label(){ return metricLabel('color', 'Detected color'); }, style:'swatch' },
    { key:'reflection', get label(){ return metricLabel('reflection', 'Reflection'); },   unit:'%', min:0, max:100, style:'bar' },
    { key:'hue',        get label(){ return metricLabel('hue', 'Hue'); },       style:'number' },
    { key:'saturation', get label(){ return metricLabel('saturation', 'Saturation'); }, min:0, max:100, style:'bar' },
    { key:'value',      get label(){ return metricLabel('value', 'Brightness'); }, min:0, max:100, style:'bar' },
    { key:'rawRed',     get label(){ return metricLabel('rawRed', 'Raw R'); },     style:'number' },
    { key:'rawGreen',   get label(){ return metricLabel('rawGreen', 'Raw G'); },   style:'number' },
    { key:'rawBlue',    get label(){ return metricLabel('rawBlue', 'Raw B'); },    style:'number' }
  ],
  controller: [
    { key:'leftPercent',  get label(){ return metricLabel('leftPercent', 'Left lever'); },  unit:'%', min:-100, max:100, style:'bar' },
    { key:'rightPercent', get label(){ return metricLabel('rightPercent', 'Right lever'); }, unit:'%', min:-100, max:100, style:'bar' },
    { key:'leftAngle',    get label(){ return metricLabel('leftAngle', 'Left angle'); },  style:'number' },
    { key:'rightAngle',   get label(){ return metricLabel('rightAngle', 'Right angle'); }, style:'number' },
    { key:'button',       get label(){ return metricLabel('button', 'Button'); },      style:'text' }
  ],
  remote_controller: [
    { key:'leftBtn',  get label(){ return metricLabel('remoteLeft', 'Left Button'); },  style:'text' },
    { key:'rightBtn', get label(){ return metricLabel('remoteRight', 'Right Button'); }, style:'text' },
    { key:'battery',  get label(){ return metricLabel('battery', 'Battery'); },          unit:'%', min:0, max:100, style:'bar' }
  ]
};

/* Hub'ın kendi değerleri (slot seçilmediğinde) */
const HUB_METRICS = [
  { key:'battery', get label(){ return metricLabel('battery', 'Battery'); },      unit:'%', min:0, max:100, style:'bar' },
  { key:'upFace',  get label(){ return metricLabel('upFace', 'Orientation'); },    style:'text' },
  { key:'pitch',   get label(){ return metricLabel('pitch', 'Pitch'); },     unit:'°', min:-180, max:180, style:'number' },
  { key:'roll',    get label(){ return metricLabel('roll', 'Roll'); },    unit:'°', min:-180, max:180, style:'number' },
  { key:'yaw',     get label(){ return metricLabel('yaw', 'Yaw'); },    unit:'°', style:'number' }
];
/* Slota takılı cihaz türüne göre okunabilir değerler */
const SLOT_METRICS = {
  motor:    [{ key:'angle',    get label(){ return metricLabel('angle', 'Angle'); },      unit:'°', min:0, max:359, style:'dial' },
             { key:'position', get label(){ return metricLabel('position', 'Position'); },    unit:'°', style:'number' },
             { key:'speed',    get label(){ return metricLabel('speed', 'Speed'); },      unit:'%', min:-100, max:100, style:'bar' },
             { key:'power',    get label(){ return metricLabel('power', 'Torque'); },     unit:'%', min:0, max:100, style:'bar' }],
  force:    [{ key:'newton',   get label(){ return metricLabel('newton', 'Force'); },   unit:'N', min:0, max:10, style:'bar' },
             { key:'pressed',  get label(){ return metricLabel('pressed', 'Button'); },    style:'text' }],
  color:    [{ key:'color',    get label(){ return metricLabel('color', 'Color'); },     style:'swatch' }],
  distance: [{ key:'distance', get label(){ return metricLabel('distance', 'Distance'); },   unit:' cm', min:0, max:200, style:'bar' }],
  matrix:   [{ key:'lit',      get label(){ return metricLabel('lit', 'Lit pixel'); }, min:0, max:9, style:'number' }],
  other:    [{ key:'raw',      get label(){ return metricLabel('raw', 'Raw value'); }, style:'number' }]
};
/** Hub widget'ı için: slot seçilmemişse hub değerleri, seçilmişse o cihazınkiler. */
function hubMetricsFor(d, port){
  if(port == null || port === '') return HUB_METRICS;
  const p = d && d.ports && d.ports[port];
  return SLOT_METRICS[(p && p.kind) || 'other'] || SLOT_METRICS.other;
}

function metricsFor(type){
  if(type === 'single_motor' || type === 'double_motor')
    return [...METRICS.motorShared, ...METRICS.common];
  if(type === 'color_sensor')    return [...METRICS.color_sensor, ...METRICS.common];
  if(type === 'controller')      return [...METRICS.controller, ...METRICS.common];
  if(type === 'remote_controller') return [...(METRICS.remote_controller || []), ...METRICS.common];
  return METRICS.common;
}
const metricDef = (type, key) => metricsFor(type).find(m => m.key === key);

/** Widget'ın metrik tanımı — hub'larda slota, diğerlerinde cihaz tipine bakar. */
function widgetMetricDef(d, port, key){
  if(d && isHubType(d.type)){
    const p = (port === '' || port == null) ? null : Number(port);
    return hubMetricsFor(d, p).find(m => m.key === key);
  }
  const tip = d ? d.type : null;
  return tip ? metricsFor(tip).find(m => m.key === key) : null;
}

/** Bağlı cihazdan istenen ölçümü okur. Cihaz yoksa/veri yoksa null. */
function readMetric(d, w){
  if(!d) return null;
  const s = d.state;

  // Hub cihazları: slot seçiliyse o portun değeri, değilse hub'ın kendi değeri
  if(isHubType(d.type)){
    if(w.port == null || w.port === ''){
      if(w.metric === 'battery') return s.battery;
      if(!d.imu) return null;
      if(w.metric === 'upFace') return FACE_DESC[d.imu.upFace] || '–';
      if(w.metric === 'pitch')  return Math.round(d.imu.pitch);
      if(w.metric === 'roll')   return Math.round(d.imu.roll);
      if(w.metric === 'yaw')    return Math.round(d.imu.yaw);
      return null;
    }
    const p = d.ports[w.port];
    if(!p || p.kind == null) return null;
    switch(w.metric){
      case 'angle':    return p.value;
      case 'position': return p.raw;
      case 'speed':    return p.speed;
      case 'power':    return p.power == null ? null : Math.round(p.power / 100);
      case 'newton':   return p.value == null ? null : p.value / 10;
      case 'pressed':  return p.pressed ? t('pressed') : t('released');
      case 'color':    return p.value;
      case 'distance': return p.value;
      case 'lit':      return p.value;
      case 'raw':      return p.value;
    }
    return null;
  }
  switch(w.metric){
    case 'battery': return s.battery;
    case 'usb':     return s.usbPower == null ? null : UsbPowerName[s.usbPower];
  }
  if(d.type === 'single_motor' || d.type === 'double_motor'){
    const mask = d.type === 'double_motor' ? (w.mask || MotorBits.Left) : (d.masks[0] || MotorBits.Left);
    const m = s.motors[mask];
    if(!m) return null;
    switch(w.metric){
      case 'angle':    return m.absolutePosition;
      case 'position': return m.position;
      case 'speed':    return m.speed;
      case 'power':    return Math.round(m.power);
      case 'state':    return MotorStateName[m.motorState] || m.motorState;
    }
  }
  if(d.type === 'color_sensor'){
    const c = s.color;
    if(!c) return null;
    if(w.metric === 'color') return c.color;         // ham LegoColor; boyama için
    return c[w.metric] != null ? c[w.metric] : null;
  }
  if(d.type === 'controller'){
    if(w.metric === 'button')
      return d.state.button ? (ButtonStateName[d.state.button.state] || '–') : null;
    const c = s.controller;
    if(!c) return null;
    return c[w.metric] != null ? c[w.metric] : null;
  }
  if(d.type === 'remote_controller'){
    const rs = d.remoteState || {};
    const btnLabel = v => v===0x01?'+' : v===0xff?'-' : v===0x7f?'stop' : 'released';
    if(w.metric === 'leftBtn')  return btnLabel(rs.left  || 0);
    if(w.metric === 'rightBtn') return btnLabel(rs.right || 0);
    if(w.metric === 'battery')  return s.battery;
  }
  return null;
}

/* ── Görünüm geçişi ───────────────────────────────────────────────────── */
let currentView = 'devices';

function showView(v){
  currentView = v;
  document.getElementById('devicesView').style.display = v === 'devices' ? '' : 'none';
  document.getElementById('panoView').style.display    = v === 'pano'    ? '' : 'none';
  const padEl = document.getElementById('padView');
  if(padEl) padEl.style.display = v === 'pad' ? '' : 'none';
  document.querySelectorAll('.viewnav button').forEach(b =>
    b.classList.toggle('on', b.dataset.view === v));
  location.hash = v === 'pano' ? '#pano' : (v === 'pad' ? '#pad' : '');
  if(v === 'pano') renderPano();
  else if(v === 'pad') renderPad();
}

/* ── Pano sekmeleri ───────────────────────────────────────────────────── */
/* Pano sekmesi renk paleti — tint: arka plan, strong: kenarlık/vurgu */
const PANO_COLORS = [
  { key:'slate',  label:'Gri',     tint:'#eef2f8', strong:'#64748b' },
  { key:'blue',   label:'Mavi',    tint:'#e8f1ff', strong:'#4c8dff' },
  { key:'teal',   label:'Turkuaz', tint:'#e0f5f3', strong:'#14b8a6' },
  { key:'green',  label:'Yeşil',   tint:'#e7f7ec', strong:'#37b24d' },
  { key:'yellow', label:'Sarı',    tint:'#fdf4e0', strong:'#e0a012' },
  { key:'orange', label:'Turuncu', tint:'#fdeee1', strong:'#ef7f22' },
  { key:'red',    label:'Kırmızı', tint:'#fdeaea', strong:'#e03131' },
  { key:'purple', label:'Mor',     tint:'#f2ecfd', strong:'#7c4dda' }
];
const panoColor = key => PANO_COLORS.find(c => c.key === key) || PANO_COLORS[1];

/* Widget arka planları: aynı palet + "varsayılan" (beyaz kart) */
const WIDGET_COLORS = [
  { key:'none', label:'Varsayılan', tint:'#ffffff', strong:'#e3e8ef' },
  ...PANO_COLORS
];
const widgetColor = key => WIDGET_COLORS.find(c => c.key === key) || WIDGET_COLORS[0];

function renderPanoTabs(){
  const box = document.getElementById('panoTabs');
  box.innerHTML = '';
  for(const p of pano.panolar){
    const c = panoColor(p.color);
    const on = p.id === pano.activeId;
    const b = document.createElement('button');
    b.textContent = p.name;
    b.className = on ? 'on' : '';
    b.style.background  = c.tint;
    b.style.borderColor = on ? c.strong : 'transparent';
    if(on) b.style.color = c.strong;
    b.onclick = () => { pano.activeId = p.id; panoSave(); renderPano(); };
    b.ondblclick = () => openPanoModal('edit');
    b.title = 'Çift tıkla: düzenle';
    box.appendChild(b);
  }
}

/* ── Pano ekle / düzenle modalı ────────────────────────────────────────── */
let panoModalMode = 'new';
let pmColor = 'blue';

function openPanoModal(mode){
  panoModalMode = mode;
  const p = panoActive();
  document.getElementById('panoModalTitle').textContent =
    mode === 'new' ? 'Yeni Pano' : 'Panoyu Düzenle';
  const nameEl = document.getElementById('pmName');
  nameEl.value = mode === 'new' ? '' : p.name;
  nameEl.placeholder = mode === 'new' ? 'Pano ' + (pano.panolar.length + 1) : '';
  pmColor = mode === 'new'
    ? PANO_COLORS[pano.panolar.length % PANO_COLORS.length].key   // sırayla farklı renk
    : (p.color || 'blue');
  renderPmColors();

  // Silme yalnızca mevcut panoyu düzenlerken ve birden fazla pano varken anlamlı
  const danger = document.getElementById('pmDanger');
  danger.classList.remove('confirming');
  document.getElementById('pmConfirm').classList.remove('on');
  danger.style.display = (mode === 'edit' && pano.panolar.length > 1) ? '' : 'none';
  document.getElementById('pmCount').textContent = p.widgets.length;

  document.getElementById('panoModal').classList.add('on');
  setTimeout(() => nameEl.focus(), 30);
}
function closePanoModal(){ document.getElementById('panoModal').classList.remove('on'); }

function renderPmColors(){
  const box = document.getElementById('pmColors');
  box.innerHTML = '';
  for(const c of PANO_COLORS){
    const b = document.createElement('button');
    b.style.background  = c.tint;
    b.style.color       = c.strong;
    b.style.borderColor = c.key === pmColor ? c.strong : 'transparent';
    b.className = c.key === pmColor ? 'on' : '';
    b.title = c.label;
    b.onclick = () => { pmColor = c.key; renderPmColors(); };
    box.appendChild(b);
  }
}

function deleteActivePano(){
  if(pano.panolar.length === 1) return;       // son pano silinemez
  const p = panoActive();
  pano.panolar = pano.panolar.filter(x => x.id !== p.id);
  pano.activeId = pano.panolar[0].id;
  panoSave(); closePanoModal(); renderPano();
}

function savePanoModal(){
  const nameEl = document.getElementById('pmName');
  const name = nameEl.value.trim() || nameEl.placeholder || 'Pano';
  if(panoModalMode === 'new'){
    const np = { id: uid(), name, color: pmColor, widgets: [] };
    pano.panolar.push(np);
    pano.activeId = np.id;
  }else{
    const p = panoActive();
    p.name = name;
    p.color = pmColor;
  }
  panoSave(); closePanoModal(); renderPano();
}

/* ── Izgara yerleşimi ─────────────────────────────────────────────────── */
const PANO_COLS = 4;      // kayıtlı düzenin mantıksal sütun sayısı
const PANO_ROW_H = 140;   // px — grid-auto-rows ile aynı olmalı
const PANO_GAP = 14;      // px — .panogrid gap ile aynı olmalı

/** Ekran genişliğine göre gösterilecek sütun sayısı. */
function panoCols(){
  const w = window.innerWidth;
  if(w < 620)  return 1;
  if(w < 900)  return 2;
  return PANO_COLS;
}

/** Konumu olmayan eski widget'lara sırayla yer ver (tek seferlik göç). */
function panoEnsureLayout(p){
  let changed = false;
  const taken = new Set();
  const mark = w => { for(let dy=0;dy<(w.h||1);dy++) for(let dx=0;dx<(w.w||1);dx++)
                        taken.add((w.y+dy) + ':' + (w.x+dx)); };
  for(const w of p.widgets) if(Number.isInteger(w.x) && Number.isInteger(w.y)) mark(w);
  for(const w of p.widgets){
    if(Number.isInteger(w.x) && Number.isInteger(w.y)) continue;
    w.w = w.w || 1; w.h = w.h || 1;
    outer: for(let y=0;;y++) for(let x=0; x + w.w <= PANO_COLS; x++){
      let ok = true;
      for(let dy=0;dy<w.h && ok;dy++) for(let dx=0;dx<w.w;dx++)
        if(taken.has((y+dy)+':'+(x+dx))){ ok = false; break; }
      if(ok){ w.x = x; w.y = y; mark(w); changed = true; break outer; }
    }
  }
  return changed;
}

/** Ekrandaki sütun sayısına göre görüntüleme konumu (kayıt değişmez). */
function displayBox(w, cols){
  if(cols === 1) return { x:0, w:1, h:w.h || 1 };
  const ww = Math.min(w.w || 1, cols);
  return { x: Math.min(w.x, cols - ww), w: ww, h: w.h || 1 };
}

/** Widget'ları y,x sırasına göre dizip ekran düzenini hesaplar. */
function panoLayout(p, cols){
  const list = [...p.widgets].sort((a,b) => (a.y - b.y) || (a.x - b.x));
  if(cols === 1){
    // tek sütunda sırayla alt alta
    return list.map((w, i) => ({ w, box:{ x:0, y:i, w:1, h:1 } }));
  }
  const taken = new Set();
  const free = (x,y,ww,hh) => {
    for(let dy=0;dy<hh;dy++) for(let dx=0;dx<ww;dx++)
      if(taken.has((y+dy)+':'+(x+dx))) return false;
    return true;
  };
  const mark = (x,y,ww,hh) => {
    for(let dy=0;dy<hh;dy++) for(let dx=0;dx<ww;dx++) taken.add((y+dy)+':'+(x+dx));
  };
  const out = [];
  for(const w of list){
    const d = displayBox(w, cols);
    let x = d.x, y = w.y;
    if(!free(x, y, d.w, d.h)){
      // çakışma (daraltılmış ekran) → ilk boş yere kaydır
      outer: for(let yy=y;;yy++) for(let xx=0; xx + d.w <= cols; xx++)
        if(free(xx, yy, d.w, d.h)){ x = xx; y = yy; break outer; }
    }
    mark(x, y, d.w, d.h);
    out.push({ w, box:{ x, y, w:d.w, h:d.h } });
  }
  return out;
}

/* ── Widget'ları çiz ──────────────────────────────────────────────────── */
function renderPano(){
  renderPanoTabs();
  const p = panoActive();
  if(panoEnsureLayout(p)) panoSave();

  const cols = panoCols();
  const grid = document.getElementById('panoGrid');
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.innerHTML = '';
  document.getElementById('panoEmpty').style.display = p.widgets.length ? 'none' : '';

  const placed = panoLayout(p, cols);
  const taken = new Set();
  let maxRow = 0;
  for(const {w, box} of placed){
    const el = buildWidget(w);
    el.style.gridColumn = `${box.x + 1} / span ${box.w}`;
    el.style.gridRow    = `${box.y + 1} / span ${box.h}`;
    el.dataset.h = box.h;
    el.dataset.w = box.w;
    grid.appendChild(el);
    for(let dy=0;dy<box.h;dy++) for(let dx=0;dx<box.w;dx++)
      taken.add((box.y+dy) + ':' + (box.x+dx));
    maxRow = Math.max(maxRow, box.y + box.h);
  }

  // boş hücreler + altta bir satır daha — tıklayınca oraya widget eklenir
  const rows = maxRow + 1;
  for(let y=0; y<rows; y++) for(let x=0; x<cols; x++){
    if(taken.has(y + ':' + x)) continue;
    const ph = document.createElement('button');
    ph.className = 'wcell';
    ph.style.gridColumn = (x + 1);
    ph.style.gridRow    = (y + 1);
    ph.dataset.cx = x; ph.dataset.cy = y;
    ph.innerHTML = '<span>+</span>';
    ph.title = 'Buraya widget ekle';
    ph.onclick = () => openWidgetModal(null, { x, y });
    grid.appendChild(ph);
  }

  grid.dataset.cols = cols;
  paintPano();
}

function buildWidget(w){
  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.wid = w.id;
  const wc = widgetColor(w.color);
  el.style.background  = wc.tint;
  el.style.borderColor = wc.strong;

  const devLabel = w.deviceName +
    (w.deviceType === 'double_motor' ? ` · ${w.mask === MotorBits.Right ? 'Motor 2' : 'Motor 1'}` : '');

  let body = '';
  if(w.kind === 'gauge'){
    const st = w.style;
    if(st === 'dial')        body = `<div class="wdial">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#eef2f8" stroke-width="10"/>
          <circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="var(--accent)"
                  stroke-width="10" stroke-linecap="round"
                  stroke-dasharray="264" stroke-dashoffset="264"/>
        </svg><div class="dv">–</div></div>`;
    else if(st === 'bar')    body = `<div class="wval">–</div><div class="wbar"><i></i></div>`;
    else if(st === 'swatch') body = `<div class="wswatch"></div><div class="wval" style="font-size:15px">–</div>`;
    else if(st === 'text')   body = `<div class="wval" style="font-size:19px">–</div>`;
    else                     body = `<div class="wval">–</div>`;
  } else {
    const cls = w.action === 'stop' ? 'stop' : w.action === 'jog' ? 'jog' : '';
    body = `<button class="wact ${cls}">${actionLabel(w)}</button>`;
  }

  el.innerHTML = `
    <div class="wtools">
      <button data-edit title="${t('edit')}">✎</button>
      <button data-del title="${t('delete')}">✕</button>
    </div>
    <div class="wtitle">${w.title}</div>
    <div class="wdev">${devLabel}</div>
    <div class="woffline">${t('offline')}</div>
    <div class="wbody">${body}</div>`;

  el.querySelector('[data-edit]').onclick = () => openWidgetModal(w);
  el.querySelector('[data-del]').onclick  = () => {
    if(!confirm(t('deleteWidgetConfirm', { title: w.title }))) return;
    const p = panoActive();
    p.widgets = p.widgets.filter(x => x.id !== w.id);
    panoSave(); renderPano();
  };
  const act = el.querySelector('.wact');
  if(act){
    if(w.action === 'jog'){
      // basılı tutulduğu sürece döner, bırakınca durur
      const down = ev => {
        ev.preventDefault(); ev.stopPropagation();
        const d = widgetDevice(w);
        if(!d) return;
        act.classList.add('held');
        const hiz = w.speed || 50;
        if(isHubType(d.type) && w.port != null){
          hubMotorRun(d, w.port, w.dir, hiz);
        }else{
          if(w.speed) d.speed = w.speed;     // widget kendi hızıyla döndürür
          jogStart(d, widgetMask(w, d), w.dir);
        }
      };
      const up = ev => {
        ev.preventDefault(); ev.stopPropagation();
        act.classList.remove('held');
        const d = widgetDevice(w);
        if(!d) return;
        if(isHubType(d.type) && w.port != null){
          hubMotorStop(d, w.port);
        }else{
          jogStop(d);
        }
      };
      act.addEventListener('pointerdown', down);
      act.addEventListener('pointerup', up);
      act.addEventListener('pointerleave', up);
      act.addEventListener('pointercancel', up);
    }else{
      act.onclick = () => runWidgetAction(w);
    }
  }

  makeDraggable(el, w);
  return el;
}

/* ── Sürükle-bırak ile yer değiştirme (fare + dokunmatik) ─────────────── */
let dragState = null;

function makeDraggable(el, w){
  el.addEventListener('pointerdown', ev => {
    // düğme/giriş üzerindeyken sürükleme başlatma
    if(ev.target.closest('button, input, select')) return;
    if(panoCols() === 1) return;              // tek sütunda konum anlamsız
    const grid = document.getElementById('panoGrid');
    dragState = { w, el, startX: ev.clientX, startY: ev.clientY, moved: false, grid };
    el.setPointerCapture(ev.pointerId);
  });

  el.addEventListener('pointermove', ev => {
    if(!dragState || dragState.w.id !== w.id) return;
    if(!dragState.moved){
      if(Math.hypot(ev.clientX - dragState.startX, ev.clientY - dragState.startY) < 6) return;
      dragState.moved = true;
      el.classList.add('dragging');
    }
    const cell = cellFromPoint(ev.clientX, ev.clientY);
    highlightCell(cell);
  });

  const finish = ev => {
    if(!dragState || dragState.w.id !== w.id) return;
    const moved = dragState.moved;
    el.classList.remove('dragging');
    highlightCell(null);
    const cell = moved ? cellFromPoint(ev.clientX, ev.clientY) : null;
    dragState = null;
    if(cell) moveWidgetTo(w, cell.x, cell.y);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    if(dragState && dragState.w.id === w.id){
      el.classList.remove('dragging'); highlightCell(null); dragState = null;
    }
  });
}

/** Ekran koordinatından ızgara hücresi. */
function cellFromPoint(px, py){
  const grid = document.getElementById('panoGrid');
  const r = grid.getBoundingClientRect();
  const cols = Number(grid.dataset.cols) || PANO_COLS;
  const cellW = (r.width - PANO_GAP * (cols - 1)) / cols;
  let x = Math.floor((px - r.left) / (cellW + PANO_GAP));
  let y = Math.floor((py - r.top)  / (PANO_ROW_H + PANO_GAP));
  if(px < r.left || px > r.right) return null;
  if(y < 0) return null;
  x = Math.max(0, Math.min(cols - 1, x));
  return { x, y };
}

function highlightCell(cell){
  document.querySelectorAll('.panogrid .drop-hi').forEach(e => e.classList.remove('drop-hi'));
  if(!cell) return;
  const grid = document.getElementById('panoGrid');
  const ph = grid.querySelector(`.wcell[data-cx="${cell.x}"][data-cy="${cell.y}"]`);
  if(ph) ph.classList.add('drop-hi');
}

/** Widget'ı hedef hücreye taşır; dolu ise yerleri takas eder. */
function moveWidgetTo(w, x, y){
  const p = panoActive();
  const cols = panoCols();
  const ww = Math.min(w.w || 1, cols), hh = w.h || 1;
  x = Math.max(0, Math.min(cols - ww, x));
  if(w.x === x && w.y === y) return;

  const overlaps = (a, ax, ay, aw, ah) => {
    const bw = Math.min(a.w || 1, cols), bh = a.h || 1;
    return ax < a.x + bw && ax + aw > a.x && ay < a.y + bh && ay + ah > a.y;
  };
  const hit = p.widgets.filter(o => o.id !== w.id && overlaps(o, x, y, ww, hh));

  if(hit.length === 1 && (hit[0].w || 1) === ww && (hit[0].h || 1) === hh){
    // aynı boyutta tek widget → takas
    const o = hit[0];
    o.x = w.x; o.y = w.y;
  }else if(hit.length){
    return;   // farklı boyutlarla çakışma — taşıma yapma
  }
  w.x = x; w.y = y;
  panoSave(); renderPano();
}

/* Ekran daralıp genişlediğinde sütun sayısı değişebilir → yeniden çiz */
let panoResizeTimer = null;
window.addEventListener('resize', () => {
  if(currentView !== 'pano') return;
  clearTimeout(panoResizeTimer);
  panoResizeTimer = setTimeout(() => {
    const grid = document.getElementById('panoGrid');
    if(Number(grid.dataset.cols) !== panoCols()) renderPano();
  }, 150);
});

function actionLabel(w){
  if(w.action === 'stop')  return '■ ' + t('actStop');
  if(w.action === 'reset') return '⟲ ' + t('resetAngle');
  if(w.action === 'jog')   return `${w.dir === 'CW' ? '↻' : '↺'} ${t('holdToTurn')}`;
  if(w.action === 'run')   return `${w.dir === 'CW' ? '↻' : '↺'} ${t('continuous')}`;
  if(w.action === 'time')  return `${w.dir === 'CW' ? '↻' : '↺'} ${w.value} ${t('sec')}`;
  if(w.action === 'turns') return `${w.dir === 'CW' ? '↻' : '↺'} ${w.value} ${t('turnCount').toLowerCase()}`;
  if(w.action === 'angle') return `→ ${w.value}°`;
  return t('run');
}

/** Widget'ın bağlı olduğu cihaz — yoksa/kopmuşsa null. */
function widgetDevice(w){
  const d = devices.get(w.deviceId);
  return (d && d.device.gatt.connected) ? d : null;
}
/** Widget'ın hedeflediği port maskesi. */
function widgetMask(w, d){
  return d.type === 'double_motor' ? (w.mask || MotorBits.Left)
                                   : (d.masks[0] || MotorBits.Left);
}

function runWidgetAction(w){
  const d = widgetDevice(w);
  if(!d){ alert(t('deviceNotConnected')); return; }

  // Hub slotu: LWP3'te doğrudan komut, SPIKE App 3'te program yükle-çalıştır
  if(isHubType(d.type) && w.port != null){
    const hiz = w.speed || 50;
    if(d.hubProto === 'lwp3'){
      if(w.action === 'stop')       hubMotorStop(d, w.port);
      else if(w.action === 'turns') hubMotorDegrees(d, w.port, Math.round(w.value * 360), w.dir, hiz);
      else if(w.action === 'angle') hubMotorAbsolute(d, w.port, w.value, hiz);
      return;
    }
    if(w.action === 'stop'){
      send(d, S3_CMD.programFlow(true, 0));
      log(d, `■ pano: Port ${PORT_LETTERS[w.port]} programı durduruldu`);
      return;
    }
    const harf = PORT_LETTERS[w.port];
    let kaynak;
    if(w.action === 'turns'){
      kaynak = motorPython(harf, 'degrees', Math.round(w.value * 360), w.dir, hiz);
    }else if(w.action === 'time'){
      kaynak = motorPython(harf, 'time', w.value, w.dir, hiz);
    }else if(w.action === 'angle'){
      kaynak = motorPython(harf, 'absolute', w.value, w.dir || 'Shortest', hiz);
    }else if(w.action === 'run' || w.action === 'free'){
      kaynak = motorPython(harf, 'run', 0, w.dir, hiz);
    }else if(w.action === 'reset'){
      kaynak = motorPython(harf, 'reset', 0, 'CW', 0);
    }
    if(!kaynak) return;
    log(d, `⬆ pano: Port ${harf} programı gönderiliyor (${actionLabel(w)})`);
    spikeUploadAndRun(d, kaynak, 0, (o, t) => { /* pano'da ilerleme */ })
      .then(() => log(d, `✓ pano: Port ${harf} çalıştırıldı`, 'g'))
      .catch(e => log(d, `⚠ pano (Port ${harf}): ` + e.message, 'e'));
    return;
  }

  const mask = widgetMask(w, d);
  const prevSpeed = d.speed;
  if(w.speed) d.speed = w.speed;          // widget kendi hızını dayatabilir
  if(w.action === 'stop')       { d.jogging = false; send(d, M.stop(mask)); log(d, '■ pano: durdur'); }
  else if(w.action === 'turns') runTurns(d, mask, w.value, w.dir);
  else                          goToAngle(d, mask, w.value, w.dir === 'CW' ? 'Clockwise'
                                        : w.dir === 'CCW' ? 'Counterclockwise' : 'Shortest');
  d.speed = prevSpeed;
}

/* ── Canlı değerleri tazele ───────────────────────────────────────────── */
function paintPano(){
  if(currentView !== 'pano') return;
  const p = panoActive();
  for(const w of p.widgets){
    const el = document.querySelector(`.widget[data-wid="${w.id}"]`);
    if(!el) continue;
    const d = devices.get(w.deviceId);
    const online = d && d.device.gatt.connected;
    el.classList.toggle('offline', !online);

    if(w.kind === 'action'){
      const act = el.querySelector('.wact');
      if(act){
        act.disabled = !online;
        if(!online) act.classList.remove('held');
      }
      continue;
    }

    const def = widgetMetricDef(d, w.port, w.metric)
              || metricDef(w.deviceType, w.metric) || {};
    // Cihaz kopmuşsa d.state'teki ESKİ değerleri gösterme — yoksa widget
    // hâlâ canlı veri gösteriyormuş gibi görünür.
    const raw = online ? readMetric(d, w) : null;
    const valEl = el.querySelector('.wval');

    if(raw == null){
      const bos = online ? '–' : 'bağlı değil';
      const bar = el.querySelector('.wbar i'); if(bar) bar.style.width = '0%';
      const arc = el.querySelector('.arc');    if(arc) arc.style.strokeDashoffset = 264;
      const dv  = el.querySelector('.dv');
      const sw  = el.querySelector('.wswatch');
      if(sw){ sw.style.background = 'transparent'; sw.style.borderColor = 'var(--line)'; }

      if(dv){
        // kadranda "bağlı değil" sığmaz; kısa göster, tam metni başlıkta ver
        dv.textContent = online ? '–' : '✕';
        dv.title = online ? '' : 'Cihaz bağlı değil';
      }
      if(valEl) valEl.innerHTML = online ? '–' : `<span class="woff">${bos}</span>`;
      continue;
    }

    if(w.style === 'swatch'){
      // Hub'ın renk sensörü farklı bir renk numaralandırması kullanıyor
      const hub = d && isHubType(d.type);
      const css = hub ? LWP3_COLOR_CSS : LegoColorCss;
      const ad  = hub ? LWP3_COLOR_NAME : LegoColorName;
      const bos = raw == null || raw === 255 || (!hub && raw === LegoColor.None);
      const sw = el.querySelector('.wswatch');
      if(sw){
        sw.style.background  = bos ? 'transparent' : (css[raw] || 'transparent');
        sw.style.borderColor = bos ? 'var(--line)' : (css[raw] || 'var(--line)');
      }
      if(valEl) valEl.textContent = ad[raw] || '–';
      continue;
    }

    const unit = def.unit || '';
    if(w.style === 'dial'){
      const min = def.min ?? 0, max = def.max ?? 100;
      const pct = Math.max(0, Math.min(1, (raw - min) / (max - min || 1)));
      const arc = el.querySelector('.arc');
      if(arc) arc.style.strokeDashoffset = 264 * (1 - pct);
      const dv = el.querySelector('.dv');
      if(dv) dv.textContent = raw + unit;
      continue;
    }

    if(valEl) valEl.innerHTML = typeof raw === 'number'
      ? `${raw}<small>${unit}</small>` : raw;

    if(w.style === 'bar'){
      const min = def.min ?? 0, max = def.max ?? 100;
      const pct = Math.max(0, Math.min(1, (raw - min) / (max - min || 1)));
      const bar = el.querySelector('.wbar i');
      if(bar){
        bar.style.width = (pct * 100) + '%';
        bar.style.background = w.metric === 'battery'
          ? (raw < 20 ? 'var(--err)' : raw < 50 ? 'var(--warn)' : 'var(--ok)')
          : 'var(--accent)';
      }
    }
  }
}

/* ── Widget Sihirbazı (Add / Edit Widget Wizard) ────────────────────────── */
let editingWidget = null;
let targetCell = null;      // boş hücreden eklenirken hedef konum
let wfColor = 'none';       // widget formunda seçili arka plan

let wizardState = {
  step: 0,
  deviceId: null,
  port: null,
  mask: 1,
  kind: 'gauge',
  metric: 'angle',
  action: 'turns',
  dir: 'CW',
  value: 1,
  speed: 50,
  style: 'dial',
  size: '1x1',
  title: '',
  color: 'none'
};

function getWizardSteps(){
  const d = wizardState.deviceId ? devices.get(wizardState.deviceId) : null;
  const hasSource = d && (isHubType(d.type) || d.type === 'double_motor');
  if(hasSource) return ['device', 'source', 'metric', 'style'];
  return ['device', 'metric', 'style'];
}

function getStepLabel(key){
  switch(key){
    case 'device': return t('stepDevice');
    case 'source': return t('stepSource');
    case 'metric': return t('stepMetric');
    case 'style':  return t('stepCustomize');
  }
  return key;
}

function isMotorDeviceOrPort(d, port){
  if(!d) return false;
  if(d.type === 'single_motor' || d.type === 'double_motor') return true;
  if(isHubType(d.type) && port != null && (d.ports[port] || {}).kind === 'motor') return true;
  return false;
}

function getMetricVisualInfo(key){
  switch(key){
    case 'angle':       return { icon:'↺', badge:'°', desc:'0–359°' };
    case 'position':    return { icon:'🔢', badge:'°', desc:t('cumulative') };
    case 'speed':       return { icon:'⚡', badge:'%', desc:'-100…+100%' };
    case 'power':       return { icon:'⚙', badge:'%', desc:'0…100%' };
    case 'state':       return { icon:'ℹ', badge:'', desc:t('status') };
    case 'battery':     return { icon:'🔋', badge:'%', desc:'0…100%' };
    case 'usb':         return { icon:'🔌', badge:'', desc:t('power') };
    case 'color':       return { icon:'🎨', badge:'', desc:t('colorSensor') };
    case 'reflection':  return { icon:'💡', badge:'%', desc:'0…100%' };
    case 'hue':         return { icon:'🌈', badge:'°', desc:'0…359°' };
    case 'saturation':  return { icon:'💧', badge:'%', desc:'0…100%' };
    case 'value':       return { icon:'☀️', badge:'%', desc:'0…100%' };
    case 'rawRed':      return { icon:'🔴', badge:'', desc:'Red' };
    case 'rawGreen':    return { icon:'🟢', badge:'', desc:'Green' };
    case 'rawBlue':     return { icon:'🔵', badge:'', desc:'Blue' };
    case 'leftPercent': return { icon:'🕹️', badge:'%', desc:t('leftLever') };
    case 'rightPercent':return { icon:'🕹️', badge:'%', desc:t('rightLever') };
    case 'leftAngle':   return { icon:'📐', badge:'°', desc:t('left') };
    case 'rightAngle':  return { icon:'📐', badge:'°', desc:t('right') };
    case 'button':      return { icon:'🔘', badge:'', desc:t('button') };
    case 'upFace':      return { icon:'🧭', badge:'', desc:t('pose') };
    case 'pitch':       return { icon:'📐', badge:'°', desc:t('pitch') };
    case 'roll':        return { icon:'📐', badge:'°', desc:t('roll') };
    case 'yaw':         return { icon:'🧭', badge:'°', desc:t('yaw') };
    case 'newton':      return { icon:'⚓', badge:'N', desc:'0…10 N' };
    case 'pressed':     return { icon:'🔘', badge:'', desc:t('button') };
    case 'distance':    return { icon:'📏', badge:'cm', desc:'0…200 cm' };
    case 'lit':         return { icon:'💡', badge:'px', desc:'0…9' };
    default:            return { icon:'📊', badge:'', desc:'' };
  }
}

function getActionVisualInfo(act){
  switch(act){
    case 'turns': return { icon:'↺', label:t('actTurns'), desc:t('turnsHint').replace(/<[^>]*>/g,'') };
    case 'time':  return { icon:'⏱', label:t('actTime'), desc:t('sec') };
    case 'angle': return { icon:'📐', label:t('actAngle'), desc:'0–359°' };
    case 'run':   return { icon:'▶', label:t('actRun'), desc:t('tabContinuous') };
    case 'jog':   return { icon:'👆', label:t('actJog'), desc:t('jogHint').replace(/<[^>]*>/g,'') };
    case 'reset': return { icon:'⟲', label:t('actReset'), desc:t('resetPosition') };
    case 'stop':  return { icon:'⏹', label:t('actStop'), desc:t('emergencyStop') };
    default:      return { icon:'⚡', label:act, desc:'' };
  }
}

function getWizardAutoTitle(){
  const d = devices.get(wizardState.deviceId);
  if(!d) return '';
  if(wizardState.kind === 'gauge'){
    const def = widgetMetricDef(d, wizardState.port, wizardState.metric);
    return def ? def.label : wizardState.metric;
  }else{
    const yon = wizardState.dir === 'CW' ? t('dirRightText') : wizardState.dir === 'CCW' ? t('dirLeftText') : t('dirShortestText');
    return wizardState.action === 'stop'  ? t('stopTitle')
         : wizardState.action === 'reset' ? t('resetPosTitle')
         : wizardState.action === 'jog'   ? t('holdDir', { dir: yon })
         : wizardState.action === 'run'   ? t('continuousDir', { dir: yon })
         : wizardState.action === 'time'  ? t('secDir', { value: wizardState.value, dir: yon })
         : wizardState.action === 'turns' ? t('turnsDir', { value: wizardState.value, dir: yon })
         :                                  t('posDegrees', { value: wizardState.value });
  }
}

function syncWizardMetricDefaults(d){
  if(!d) d = devices.get(wizardState.deviceId);
  if(!d) return;

  const hub = isHubType(d.type);
  const metrics = hub ? hubMetricsFor(d, wizardState.port) : metricsFor(d.type);
  if(metrics.length && !metrics.some(m => m.key === wizardState.metric)){
    wizardState.metric = metrics[0].key;
    if(metrics[0].style) wizardState.style = metrics[0].style;
  }
  const isMotor = isMotorDeviceOrPort(d, wizardState.port);
  if(!isMotor && wizardState.kind === 'action'){
    wizardState.kind = 'gauge';
  }
}

function canAdvanceStep(stepKey){
  if(stepKey === 'device'){
    return Boolean(wizardState.deviceId && devices.has(wizardState.deviceId));
  }
  if(stepKey === 'metric'){
    if(wizardState.kind === 'gauge') return Boolean(wizardState.metric);
    if(wizardState.kind === 'action') return Boolean(wizardState.action);
  }
  return true;
}

function openWidgetModal(w, cell){
  editingWidget = w || null;
  targetCell = cell || null;
  document.getElementById('widgetModalTitle').textContent = w ? t('editWidget') : t('addWidget');
  const list = [...devices.values()];

  if(w){
    wizardState = {
      step: 0,
      deviceId: w.deviceId,
      port: w.port != null ? w.port : null,
      mask: w.mask || 1,
      kind: w.kind || 'gauge',
      metric: w.metric || 'angle',
      action: w.action || 'turns',
      dir: w.dir || 'CW',
      value: w.value != null ? w.value : 1,
      speed: w.speed || 50,
      style: w.style || 'number',
      size: `${w.w || 1}x${w.h || 1}`,
      title: w.title || '',
      color: w.color || 'none'
    };
    wfColor = wizardState.color;
  }else{
    const firstDev = list[0] || null;
    wizardState = {
      step: 0,
      deviceId: firstDev ? firstDev.id : null,
      port: null,
      mask: 1,
      kind: 'gauge',
      metric: 'angle',
      action: 'turns',
      dir: 'CW',
      value: 1,
      speed: 50,
      style: 'dial',
      size: '1x1',
      title: '',
      color: 'none'
    };
    wfColor = 'none';
    if(firstDev) syncWizardMetricDefaults(firstDev);
  }

  document.getElementById('widgetModal').classList.add('on');
  renderWizard();
}

function closeWidgetModal(){
  document.getElementById('widgetModal').classList.remove('on');
  editingWidget = null;
  targetCell = null;
}

function buildWidgetForm(w){
  openWidgetModal(w);
}

function renderWizardStepper(){
  const steps = getWizardSteps();
  const box = document.getElementById('wizStepper');
  if(!box) return;
  box.innerHTML = '';
  steps.forEach((key, idx) => {
    const isCur = idx === wizardState.step;
    const isPast = idx < wizardState.step;
    const pill = document.createElement('div');
    pill.className = `wiz-step-pill ${isCur ? 'active' : ''} ${isPast ? 'completed' : ''}`;
    pill.innerHTML = `
      <span class="wiz-num">${isPast ? '✓' : (idx + 1)}</span>
      <span class="wiz-lbl">${getStepLabel(key)}</span>
    `;
    pill.onclick = () => {
      if(idx <= wizardState.step || canAdvanceStep(steps[wizardState.step])){
        wizardState.step = idx;
        renderWizard();
      }
    };
    box.appendChild(pill);
    if(idx < steps.length - 1){
      const sep = document.createElement('span');
      sep.className = 'wiz-step-sep';
      sep.textContent = '›';
      box.appendChild(sep);
    }
  });
}

function renderWizardNav(){
  const steps = getWizardSteps();
  if(wizardState.step >= steps.length) wizardState.step = steps.length - 1;
  const curKey = steps[wizardState.step];
  const isValid = canAdvanceStep(curKey);

  const btnBack = document.getElementById('wizBtnBack');
  const btnNext = document.getElementById('wizBtnNext');
  const btnSave = document.getElementById('wizBtnSave');

  if(btnBack){
    btnBack.style.display = wizardState.step > 0 ? 'inline-flex' : 'none';
    btnBack.onclick = () => {
      if(wizardState.step > 0){
        wizardState.step--;
        renderWizard();
      }
    };
  }

  const isLast = wizardState.step === steps.length - 1;
  if(btnNext){
    btnNext.style.display = isLast ? 'none' : 'inline-flex';
    btnNext.disabled = !isValid;
    btnNext.onclick = () => {
      if(isValid && wizardState.step < steps.length - 1){
        wizardState.step++;
        renderWizard();
      }
    };
  }

  if(btnSave){
    btnSave.style.display = isLast ? 'inline-flex' : 'none';
    btnSave.textContent = t('finish');
    btnSave.onclick = saveWidgetFromWizard;
  }
}

function renderWizard(){
  const list = [...devices.values()];
  const body = document.getElementById('wizBody');
  const btnSave = document.getElementById('wizBtnSave');
  const btnNext = document.getElementById('wizBtnNext');

  if(!list.length){
    body.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:42px;margin-bottom:12px">🔌</div>
        <h3 style="margin:0 0 8px;font-size:18px">${t('emptyDevicesTitle')}</h3>
        <p style="color:var(--muted);font-size:13px;max-width:380px;margin:0 auto 20px">${t('needConnectFirst')}</p>
        <button class="btn" onclick="closeWidgetModal();switchView('devices');openPicker()">${t('btnAddDevice')}</button>
      </div>`;
    if(btnSave) btnSave.style.display = 'none';
    if(btnNext) btnNext.style.display = 'none';
    document.getElementById('wizStepper').innerHTML = '';
    return;
  }

  renderWizardStepper();
  const steps = getWizardSteps();
  const stepKey = steps[wizardState.step] || 'device';

  body.innerHTML = '';
  switch(stepKey){
    case 'device':
      renderWizardStepDevice(body, list);
      break;
    case 'source':
      renderWizardStepSource(body);
      break;
    case 'metric':
      renderWizardStepMetric(body);
      break;
    case 'style':
      renderWizardStepStyle(body);
      break;
  }
  renderWizardNav();
}

/* ── Wizard Step 1: Device Selection ────────────────────────────────────── */
function renderWizardStepDevice(container, list){
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="wiz-title-wrap">
      <div class="wiz-title">${t('wizSelectDeviceTitle')}</div>
      <div class="wiz-desc">${t('wizSelectDeviceDesc')}</div>
    </div>
    <div class="wiz-grid" id="wizDevGrid"></div>
  `;
  container.appendChild(wrap);
  const grid = wrap.querySelector('#wizDevGrid');

  for(const d of list){
    const isSel = d.id === wizardState.deviceId;
    const icon = (d.typeInfo && d.typeInfo.img) || './img/single-motor.svg';
    const typeLbl = deviceTypeLabel(d.typeInfo);
    const bat = d.state && d.state.battery != null ? `${d.state.battery}% 🔋` : '';

    const card = document.createElement('div');
    card.className = `wiz-card ${isSel ? 'selected' : ''}`;
    card.innerHTML = `
      <span class="wiz-check">✓</span>
      <div class="wiz-dev-top">
        <img src="${icon}" alt="${d.name}">
        <div class="wiz-dev-info">
          <div class="wiz-dev-name">${d.name}</div>
          <div class="wiz-dev-type">${typeLbl}</div>
        </div>
      </div>
      <div class="wiz-dev-foot">
        <span>● ${t('connected')}</span>
        <span>${bat}</span>
      </div>
    `;
    card.onclick = () => {
      wizardState.deviceId = d.id;
      wizardState.port = null;
      syncWizardMetricDefaults(d);
      renderWizard();
    };
    grid.appendChild(card);
  }
}

/* ── Wizard Step 2: Source Selection ────────────────────────────────────── */
function renderWizardStepSource(container){
  const d = devices.get(wizardState.deviceId);
  if(!d) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#f4f6fa;border-radius:10px;margin-bottom:12px;font-size:12px;font-weight:700;color:var(--muted)">
      <span>${d.name} (${deviceTypeLabel(d.typeInfo)})</span>
      <span style="color:#94a3b8">›</span>
      <span style="color:var(--ink)">${t('stepSource')}</span>
    </div>
    <div class="wiz-title-wrap">
      <div class="wiz-title">${t('wizSelectSourceTitle')}</div>
      <div class="wiz-desc">${t('wizSelectSourceDesc')}</div>
    </div>
    <div class="wiz-grid" id="wizSourceGrid"></div>
  `;
  container.appendChild(wrap);
  const grid = wrap.querySelector('#wizSourceGrid');

  if(isHubType(d.type)){
    // Hub Genel
    const isGenSel = wizardState.port == null || wizardState.port === '';
    const hubCard = document.createElement('div');
    hubCard.className = `wiz-card ${isGenSel ? 'selected' : ''}`;
    hubCard.innerHTML = `
      <span class="wiz-check">✓</span>
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${(d.typeInfo && d.typeInfo.img) || './img/prime-hub.svg'}" style="width:40px;height:40px;object-fit:contain" alt="">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--ink)">${t('hubGeneral')}</div>
          <div style="font-size:11.5px;color:var(--muted)">${t('hubGeneralDesc')}</div>
        </div>
      </div>
    `;
    hubCard.onclick = () => {
      wizardState.port = null;
      syncWizardMetricDefaults(d);
      renderWizard();
    };
    grid.appendChild(hubCard);

    // Portlar
    let portCount = 0;
    for(let i = 0; i < d.slotCount; i++){
      const p = d.ports[i];
      if(!p || p.kind == null) continue;
      portCount++;
      const isPortSel = wizardState.port === i;
      const pIcon = kindIcon(p.kind);
      const pName = p.typeName || KIND_NAME[p.kind];

      const pCard = document.createElement('div');
      pCard.className = `wiz-card ${isPortSel ? 'selected' : ''}`;
      pCard.innerHTML = `
        <span class="wiz-check">✓</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="background:var(--accent);color:#fff;font-weight:800;font-size:12px;padding:3px 8px;border-radius:6px">Port ${PORT_LETTERS[i]}</span>
          <img src="${pIcon}" style="width:34px;height:34px;object-fit:contain" alt="">
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--ink);margin-top:2px">${pName}</div>
        <div style="font-size:11.5px;color:var(--muted)">${t('portDesc', { port: PORT_LETTERS[i] })}</div>
      `;
      pCard.onclick = () => {
        wizardState.port = i;
        syncWizardMetricDefaults(d);
        renderWizard();
      };
      grid.appendChild(pCard);
    }
  }else if(d.type === 'double_motor'){
    const options = [
      { mask: 1, label: t('motor1'), desc: t('left') },
      { mask: 2, label: t('motor2'), desc: t('right') },
      { mask: 3, label: t('bothMotors'), desc: t('both') }
    ];
    for(const opt of options){
      const isSel = wizardState.mask === opt.mask;
      const card = document.createElement('div');
      card.className = `wiz-card ${isSel ? 'selected' : ''}`;
      card.innerHTML = `
        <span class="wiz-check">✓</span>
        <div style="font-size:24px">⚙️</div>
        <div style="font-size:14px;font-weight:700;color:var(--ink)">${opt.label}</div>
        <div style="font-size:11.5px;color:var(--muted)">${opt.desc}</div>
      `;
      card.onclick = () => {
        wizardState.mask = opt.mask;
        renderWizard();
      };
      grid.appendChild(card);
    }
  }
}

/* ── Wizard Step 3: Metric / Action Selection ───────────────────────────── */
function renderWizardStepMetric(container){
  const d = devices.get(wizardState.deviceId);
  if(!d) return;

  const isMotor = isMotorDeviceOrPort(d, wizardState.port);
  const hub = isHubType(d.type);

  // Breadcrumb
  let sourceText = '';
  if(hub){
    sourceText = wizardState.port == null ? ` › ${t('hubGeneral')}` : ` › Port ${PORT_LETTERS[wizardState.port]}`;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#f4f6fa;border-radius:10px;margin-bottom:12px;font-size:12px;font-weight:700;color:var(--muted)">
      <span>${d.name}${sourceText}</span>
      <span style="color:#94a3b8">›</span>
      <span style="color:var(--ink)">${t('stepMetric')}</span>
    </div>
    <div class="wiz-title-wrap">
      <div class="wiz-title">${t('wizSelectMetricTitle')}</div>
      <div class="wiz-desc">${t('wizSelectMetricDesc')}</div>
    </div>
    ${isMotor ? `
      <div class="wiz-segment">
        <button type="button" class="wiz-seg-btn ${wizardState.kind === 'gauge' ? 'active' : ''}" id="wizSegGauge">
          <span>📊</span> <span>${t('typeGauge')}</span>
        </button>
        <button type="button" class="wiz-seg-btn ${wizardState.kind === 'action' ? 'active' : ''}" id="wizSegAction">
          <span>⚡</span> <span>${t('typeAction')}</span>
        </button>
      </div>` : ''}
    <div id="wizMetricContent"></div>
  `;
  container.appendChild(wrap);

  if(isMotor){
    wrap.querySelector('#wizSegGauge').onclick = () => {
      wizardState.kind = 'gauge';
      renderWizard();
    };
    wrap.querySelector('#wizSegAction').onclick = () => {
      wizardState.kind = 'action';
      renderWizard();
    };
  }

  const content = wrap.querySelector('#wizMetricContent');

  if(wizardState.kind === 'gauge'){
    // METRİK SEÇİMİ
    const metrics = hub ? hubMetricsFor(d, wizardState.port) : metricsFor(d.type);
    const grid = document.createElement('div');
    grid.className = 'wiz-grid';

    for(const m of metrics){
      const isSel = wizardState.metric === m.key;
      const vInfo = getMetricVisualInfo(m.key);
      const card = document.createElement('div');
      card.className = `wiz-card ${isSel ? 'selected' : ''}`;
      card.innerHTML = `
        <span class="wiz-check">✓</span>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:24px">${vInfo.icon}</span>
          ${m.unit ? `<span style="font-size:11px;font-weight:700;color:var(--accent);background:#edf2f7;padding:2px 7px;border-radius:6px">${m.unit}</span>` : ''}
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--ink)">${m.label}</div>
        <div style="font-size:11.5px;color:var(--muted)">${vInfo.desc}</div>
      `;
      card.onclick = () => {
        wizardState.metric = m.key;
        if(m.style) wizardState.style = m.style;
        renderWizard();
      };
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }else{
    // MOTOR KONTROL AKSİYONU
    const actions = ['turns', 'time', 'angle', 'run', 'jog', 'reset', 'stop'];
    const grid = document.createElement('div');
    grid.className = 'wiz-grid';

    for(const act of actions){
      const aInfo = getActionVisualInfo(act);
      const isSel = wizardState.action === act;
      const card = document.createElement('div');
      card.className = `wiz-card ${isSel ? 'selected' : ''}`;
      card.innerHTML = `
        <span class="wiz-check">✓</span>
        <div style="font-size:24px">${aInfo.icon}</div>
        <div style="font-size:14px;font-weight:700;color:var(--ink)">${aInfo.label}</div>
        <div style="font-size:11.5px;color:var(--muted)">${aInfo.desc}</div>
      `;
      card.onclick = () => {
        wizardState.action = act;
        renderWizard();
      };
      grid.appendChild(card);
    }
    content.appendChild(grid);

    // Parametre kontrolleri
    const act = wizardState.action;
    const hasParams = (act !== 'stop' && act !== 'reset');
    if(hasParams){
      const paramsBox = document.createElement('div');
      paramsBox.style.background = '#f8fafc';
      paramsBox.style.border = '1px solid var(--line)';
      paramsBox.style.borderRadius = '16px';
      paramsBox.style.padding = '14px 16px';
      paramsBox.style.marginTop = '10px';

      let paramsHtml = '';
      if(act === 'turns' || act === 'time' || act === 'angle'){
        const valLabel = act === 'angle' ? t('angle0to359') : (act === 'time' ? t('durationSec') : t('turnCount'));
        paramsHtml += `
          <div style="margin-bottom:12px">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${valLabel}</label>
            <input type="number" id="wizActVal" class="wiz-input" style="width:100%;font:700 15px inherit;padding:8px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff" value="${wizardState.value || 1}">
            <div class="wiz-chips" id="wizValChips"></div>
          </div>
        `;
      }

      // Yön
      paramsHtml += `
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${t('direction')}</label>
          <div style="display:flex;gap:8px" id="wizDirGroup">
            <button type="button" class="wiz-chip ${wizardState.dir === 'CW' ? 'active' : ''}" data-dir="CW">${t('dirCW')}</button>
            <button type="button" class="wiz-chip ${wizardState.dir === 'CCW' ? 'active' : ''}" data-dir="CCW">${t('dirCCW')}</button>
            ${act === 'angle' ? `<button type="button" class="wiz-chip ${wizardState.dir === 'Shortest' ? 'active' : ''}" data-dir="Shortest">${t('dirShortest')}</button>` : ''}
          </div>
        </div>
      `;

      // Hız
      paramsHtml += `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:12px;font-weight:700;color:var(--muted)">${t('speedLabel')}</label>
            <span id="wizSpeedBadge" style="font-size:12px;font-weight:800;color:var(--accent)">%${wizardState.speed || 50}</span>
          </div>
          <input type="range" id="wizSpeedRange" min="1" max="100" step="1" value="${wizardState.speed || 50}" style="width:100%">
          <div class="wiz-chips">
            ${[25, 50, 75, 100].map(s => `<button type="button" class="wiz-chip ${wizardState.speed === s ? 'active' : ''}" data-spd="${s}">%${s}</button>`).join('')}
          </div>
        </div>
      `;

      paramsBox.innerHTML = paramsHtml;
      content.appendChild(paramsBox);

      // Değer giriş eventleri
      const valInput = paramsBox.querySelector('#wizActVal');
      if(valInput){
        valInput.oninput = () => { wizardState.value = Number(valInput.value) || 1; };
        const chipsBox = paramsBox.querySelector('#wizValChips');
        const presets = act === 'turns' ? [0.5, 1, 2, 5, 10] : (act === 'time' ? [1, 2, 3, 5, 10] : [0, 90, 180, 270]);
        presets.forEach(pv => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `wiz-chip ${Number(wizardState.value) === pv ? 'active' : ''}`;
          b.textContent = act === 'angle' ? `${pv}°` : (act === 'time' ? `${pv}s` : pv);
          b.onclick = () => {
            wizardState.value = pv;
            valInput.value = pv;
            chipsBox.querySelectorAll('.wiz-chip').forEach(c => c.classList.remove('active'));
            b.classList.add('active');
          };
          chipsBox.appendChild(b);
        });
      }

      // Yön eventleri
      paramsBox.querySelectorAll('#wizDirGroup button').forEach(b => {
        b.onclick = () => {
          wizardState.dir = b.getAttribute('data-dir');
          paramsBox.querySelectorAll('#wizDirGroup button').forEach(c => c.classList.remove('active'));
          b.classList.add('active');
        };
      });

      // Hız eventleri
      const spdRange = paramsBox.querySelector('#wizSpeedRange');
      const spdBadge = paramsBox.querySelector('#wizSpeedBadge');
      if(spdRange){
        spdRange.oninput = () => {
          wizardState.speed = Number(spdRange.value);
          spdBadge.textContent = `%${wizardState.speed}`;
        };
        paramsBox.querySelectorAll('[data-spd]').forEach(b => {
          b.onclick = () => {
            const sv = Number(b.getAttribute('data-spd'));
            wizardState.speed = sv;
            spdRange.value = sv;
            spdBadge.textContent = `%${sv}`;
            paramsBox.querySelectorAll('[data-spd]').forEach(c => c.classList.remove('active'));
            b.classList.add('active');
          };
        });
      }
    }
  }
}

/* ── Wizard Step 4: Appearance & Live Preview ──────────────────────────── */
function renderWizardStepStyle(container){
  const d = devices.get(wizardState.deviceId);
  if(!d) return;

  const autoTitle = getWizardAutoTitle();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="wiz-title-wrap">
      <div class="wiz-title">${t('wizSelectStyleTitle')}</div>
      <div class="wiz-desc">${t('wizSelectStyleDesc')}</div>
    </div>
    <div class="wiz-two-col">
      <div id="wizControlsCol"></div>
      <div id="wizPreviewCol"></div>
    </div>
  `;
  container.appendChild(wrap);

  const ctrlCol = wrap.querySelector('#wizControlsCol');
  const prevCol = wrap.querySelector('#wizPreviewCol');

  // SOL SÜTUN: Kontroller
  if(wizardState.kind === 'gauge'){
    // Görünüm Stilleri
    const styles = [
      { key:'number', icon:'123', label:t('styleNumber'), desc:t('styleNumberDesc') },
      { key:'bar',    icon:'▰▱', label:t('styleBar'),    desc:t('styleBarDesc') },
      { key:'dial',   icon:'⏱',  label:t('styleDial'),   desc:t('styleDialDesc') },
      { key:'swatch', icon:'■',  label:t('styleSwatch'), desc:t('styleSwatchDesc') },
      { key:'text',   icon:'Aa', label:t('styleText'),   desc:t('styleTextDesc') }
    ];

    const styleBox = document.createElement('div');
    styleBox.innerHTML = `
      <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${t('appearance')}</label>
      <div class="wiz-style-grid" id="wizStyleGrid"></div>
    `;
    const sGrid = styleBox.querySelector('#wizStyleGrid');
    styles.forEach(st => {
      const isSel = wizardState.style === st.key;
      const sc = document.createElement('div');
      sc.className = `wiz-style-card ${isSel ? 'selected' : ''}`;
      sc.innerHTML = `
        <span style="font-size:16px;font-weight:800">${st.icon}</span>
        <span style="font-size:12px;font-weight:700;color:var(--ink)">${st.label}</span>
      `;
      sc.onclick = () => {
        wizardState.style = st.key;
        sGrid.querySelectorAll('.wiz-style-card').forEach(c => c.classList.remove('selected'));
        sc.classList.add('selected');
        updateLivePreview();
      };
      sGrid.appendChild(sc);
    });
    ctrlCol.appendChild(styleBox);
  }

  // Boyut Seçimi
  const sizes = [
    { key:'1x1', label:'1 × 1', desc:t('size1x1Desc'), fill:[1,0,0,0] },
    { key:'2x1', label:'2 × 1', desc:t('size2x1Desc'), fill:[1,1,0,0] },
    { key:'1x2', label:'1 × 2', desc:t('size1x2Desc'), fill:[1,0,1,0] },
    { key:'2x2', label:'2 × 2', desc:t('size2x2Desc'), fill:[1,1,1,1] }
  ];
  const sizeBox = document.createElement('div');
  sizeBox.innerHTML = `
    <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${t('size')}</label>
    <div class="wiz-size-grid" id="wizSizeGrid"></div>
  `;
  const szGrid = sizeBox.querySelector('#wizSizeGrid');
  sizes.forEach(sz => {
    const isSel = wizardState.size === sz.key;
    const sc = document.createElement('div');
    sc.className = `wiz-size-card ${isSel ? 'selected' : ''}`;
    sc.innerHTML = `
      <div class="wiz-mini-grid">
        ${sz.fill.map(f => `<div class="wiz-mini-cell ${f ? 'fill' : ''}"></div>`).join('')}
      </div>
      <span style="font-size:12px;font-weight:800;color:var(--ink)">${sz.label}</span>
    `;
    sc.onclick = () => {
      wizardState.size = sz.key;
      szGrid.querySelectorAll('.wiz-size-card').forEach(c => c.classList.remove('selected'));
      sc.classList.add('selected');
      updateLivePreview();
    };
    szGrid.appendChild(sc);
  });
  ctrlCol.appendChild(sizeBox);

  // Başlık Girişi
  const titleBox = document.createElement('div');
  titleBox.style.marginBottom = '14px';
  titleBox.innerHTML = `
    <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${t('title')}</label>
    <input type="text" id="wizTitleInput" style="width:100%;font:600 14px inherit;padding:9px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff" placeholder="${autoTitle || t('titleAuto')}" value="${wizardState.title || ''}">
  `;
  const tInput = titleBox.querySelector('#wizTitleInput');
  tInput.oninput = () => {
    wizardState.title = tInput.value;
    updateLivePreview();
  };
  ctrlCol.appendChild(titleBox);

  // Arka Plan Rengi
  const colorBox = document.createElement('div');
  colorBox.innerHTML = `
    <label style="display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">${t('bgColor')}</label>
    <div class="swatches" id="wizColorsGroup"></div>
  `;
  const cGroup = colorBox.querySelector('#wizColorsGroup');
  for(const c of WIDGET_COLORS){
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background  = c.tint;
    b.style.color       = c.key === 'none' ? 'var(--muted)' : c.strong;
    b.style.borderColor = c.key === wizardState.color ? (c.key === 'none' ? 'var(--muted)' : c.strong) : 'var(--line)';
    b.className = c.key === wizardState.color ? 'on' : '';
    b.title = c.label;
    b.onclick = () => {
      wizardState.color = c.key;
      wfColor = c.key;
      cGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('on'));
      b.classList.add('on');
      updateLivePreview();
    };
    cGroup.appendChild(b);
  }
  ctrlCol.appendChild(colorBox);

  // SAĞ SÜTUN: Canlı Önizleme
  function updateLivePreview(){
    const dispTitle = wizardState.title.trim() || autoTitle;
    const colInfo = widgetColor(wizardState.color);

    // Cihaz ve Port alt bilgisi
    let devSub = d.name;
    if(isHubType(d.type)){
      if(wizardState.port == null || wizardState.port === ''){
        devSub += ' · Hub';
      }else{
        const pp = d.ports[wizardState.port];
        devSub += ` · Port ${PORT_LETTERS[wizardState.port]}`;
        if(pp && pp.typeName) devSub += ` (${pp.typeName})`;
      }
    }

    let previewBody = '';
    if(wizardState.kind === 'action'){
      const isStop = wizardState.action === 'stop';
      const isJog  = wizardState.action === 'jog';
      previewBody = `
        <button class="wact ${isStop ? 'stop' : (isJog ? 'jog' : '')}" style="pointer-events:none;width:100%;margin-top:14px">
          ${dispTitle}
        </button>
      `;
    }else{
      if(wizardState.style === 'dial'){
        previewBody = `
          <div class="wdial" style="margin:10px auto">
            <svg viewBox="0 0 100 100" width="82" height="82">
              <circle cx="50" cy="50" r="42" stroke="var(--line)" stroke-width="9" fill="none"
                      stroke-dasharray="264" stroke-dashoffset="0" stroke-linecap="round"
                      transform="rotate(135 50 50)"/>
              <circle cx="50" cy="50" r="42" stroke="var(--accent)" stroke-width="9" fill="none"
                      stroke-dasharray="264" stroke-dashoffset="90" stroke-linecap="round"
                      transform="rotate(135 50 50)"/>
            </svg>
            <div class="dv">90°</div>
          </div>
        `;
      }else if(wizardState.style === 'bar'){
        previewBody = `
          <div class="wval" style="font-size:22px;font-weight:700;margin:10px 0 6px">65%</div>
          <div class="wbar"><i style="width:65%;background:var(--accent)"></i></div>
        `;
      }else if(wizardState.style === 'swatch'){
        previewBody = `
          <div class="wswatch" style="background:#2465d6;border-color:#2465d6;margin:14px auto"></div>
          <div class="wval" style="font-size:13px;font-weight:700;text-align:center">blue</div>
        `;
      }else if(wizardState.style === 'text'){
        previewBody = `
          <div class="wval" style="font-size:16px;font-weight:700;margin:16px 0;text-align:center">
            <span style="background:#e7f7ec;color:#237a37;padding:5px 12px;border-radius:8px">ready</span>
          </div>
        `;
      }else{
        // number
        previewBody = `
          <div class="wval" style="font-size:28px;font-weight:800;margin:12px 0 4px">
            90 <small style="font-size:14px;color:var(--muted)">°</small>
          </div>
        `;
      }
    }

    prevCol.innerHTML = `
      <div class="wiz-preview-wrap">
        <div class="wiz-preview-badge">
          <span>${t('livePreview')}</span>
          <span style="background:#edf2f7;padding:2px 7px;border-radius:6px;font-weight:800">${wizardState.size}</span>
        </div>
        <div class="wiz-preview-card" style="background:${colInfo.tint};border-color:${colInfo.key === 'none' ? 'var(--line)' : colInfo.strong}">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.25">${dispTitle}</div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-top:2px">${devSub}</div>
          </div>
          <div>${previewBody}</div>
        </div>
      </div>
    `;
  }

  updateLivePreview();
}

/* ── Wizard: Pano'ya Kaydet ────────────────────────────────────────────── */
function saveWidgetFromWizard(){
  const d = devices.get(wizardState.deviceId);
  if(!d){ alert(t('selectDevicePrompt')); return; }

  const kind = wizardState.kind;
  const mask = d.type === 'double_motor' ? Number(wizardState.mask || 1) : null;
  const [sw, sh] = (wizardState.size || '1x1').split('x').map(Number);

  const w = {
    id: editingWidget ? editingWidget.id : uid(),
    kind,
    deviceId: d.id,
    deviceName: d.name,
    deviceType: d.type,
    mask,
    color: wizardState.color || 'none',
    w: sw,
    h: sh,
    x: editingWidget ? editingWidget.x : (targetCell ? targetCell.x : undefined),
    y: editingWidget ? editingWidget.y : (targetCell ? targetCell.y : undefined)
  };

  if(isHubType(d.type)){
    const pv = wizardState.port;
    w.port = (pv === '' || pv == null) ? null : Number(pv);
  }

  if(kind === 'gauge'){
    w.metric = wizardState.metric;
    w.style  = wizardState.style || 'number';
    const def = widgetMetricDef(d, w.port, w.metric);
    w.title  = (wizardState.title || '').trim() || (def ? def.label : w.metric);
  }else{
    w.action = wizardState.action || 'turns';
    w.dir    = wizardState.dir || 'CW';
    w.value  = (w.action === 'stop' || w.action === 'jog' || w.action === 'run' || w.action === 'reset') ? null : Number(wizardState.value || 1);
    w.speed  = (w.action === 'stop' || w.action === 'reset') ? null : Number(wizardState.speed || 50);
    const yon = w.dir === 'CW' ? t('dirRightText') : w.dir === 'CCW' ? t('dirLeftText') : t('dirShortestText');
    w.title  = (wizardState.title || '').trim() || (
        w.action === 'stop'  ? t('stopTitle')
      : w.action === 'reset' ? t('resetPosTitle')
      : w.action === 'jog'   ? t('holdDir', { dir: yon })
      : w.action === 'run'   ? t('continuousDir', { dir: yon })
      : w.action === 'time'  ? t('secDir', { value: w.value, dir: yon })
      : w.action === 'turns' ? t('turnsDir', { value: w.value, dir: yon })
      :                        t('posDegrees', { value: w.value }));
  }

  if(Number.isInteger(w.x)) w.x = Math.max(0, Math.min(PANO_COLS - w.w, w.x));

  const p = panoActive();
  if(editingWidget){
    const i = p.widgets.findIndex(x => x.id === w.id);
    if(i >= 0) p.widgets[i] = w; else p.widgets.push(w);
  }else{
    p.widgets.push(w);
  }

  panoSave();
  closeWidgetModal();
  renderPano();
}

/* ── Pano yönetimi ────────────────────────────────────────────────────── */
function panoCommand(cmd){
  const p = panoActive();
  if(cmd === 'new')         openPanoModal('new');
  else if(cmd === 'rename') openPanoModal('edit');
  else if(cmd === 'addwidget') openWidgetModal(null);
}
