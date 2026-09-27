/* ══════════════════════════════════════════════════════════════════════════
   PAD (GAMEPAD CONTROLLER) YÖNETİMİ
   ══════════════════════════════════════════════════════════════════════════ */

const PAD_BUTTONS = [
  { key: 'up',         group: 'dpad',   nameTr: 'D-Pad Yukarı',     nameEn: 'D-Pad Up',          symbol: '▲', keyHint: 'W / ↑' },
  { key: 'down',       group: 'dpad',   nameTr: 'D-Pad Aşağı',      nameEn: 'D-Pad Down',        symbol: '▼', keyHint: 'S / ↓' },
  { key: 'left',       group: 'dpad',   nameTr: 'D-Pad Sol',        nameEn: 'D-Pad Left',        symbol: '◀', keyHint: 'A / ←' },
  { key: 'right',      group: 'dpad',   nameTr: 'D-Pad Sağ',        nameEn: 'D-Pad Right',       symbol: '▶', keyHint: 'D / →' },
  { key: 'act-top',    group: 'action', nameTr: 'Sarı Buton (Y)',   nameEn: 'Yellow Button (Y)',  symbol: 'Y', keyHint: 'I' },
  { key: 'act-right',  group: 'action', nameTr: 'Kırmızı Buton (B)', nameEn: 'Red Button (B)',    symbol: 'B', keyHint: 'L' },
  { key: 'act-bottom', group: 'action', nameTr: 'Yeşil Buton (A)',   nameEn: 'Green Button (A)',  symbol: 'A', keyHint: 'K' },
  { key: 'act-left',   group: 'action', nameTr: 'Mavi Buton (X)',    nameEn: 'Blue Button (X)',   symbol: 'X', keyHint: 'J' }
];

let padEditMode = false;
let editingPadKey = null;
let padConfig = {};
const padActiveJogs = new Set();

function padLoadConfig(){
  try{
    const raw = localStorage.getItem('antigravity_pad_bindings');
    if(raw) padConfig = JSON.parse(raw);
    else padConfig = {};
  }catch(e){
    padConfig = {};
  }
}

function padSaveConfig(){
  try{
    localStorage.setItem('antigravity_pad_bindings', JSON.stringify(padConfig));
  }catch(e){}
}

function togglePadMode(){
  padEditMode = !padEditMode;
  renderPad();
}

function renderPad(){
  padLoadConfig();
  const shell = document.getElementById('gamepadShell');
  if(shell) shell.classList.toggle('edit-active', padEditMode);

  const pill = document.getElementById('padModePill');
  const modeTxt = document.getElementById('padModeText');
  const toggleBtn = document.getElementById('padToggleModeBtn');
  const hintTxt = document.getElementById('padHintText');

  if(pill) pill.classList.toggle('edit', padEditMode);
  if(modeTxt) modeTxt.textContent = padEditMode ? t('padEditMode') : t('padPlayMode');
  if(toggleBtn) toggleBtn.textContent = padEditMode ? t('padBtnPlayMode') : t('padBtnEditMode');
  if(hintTxt) hintTxt.textContent = padEditMode ? t('padHintEdit') : t('padHintPlay');

  PAD_BUTTONS.forEach(b => {
    const btnEl = document.querySelector(`[data-pad="${b.key}"]`);
    const badgeEl = document.getElementById(`badge_pad-${b.key}`);
    const binding = padConfig[b.key];

    if(btnEl){
      const oldBadge = btnEl.querySelector('.pad-edit-badge');
      if(oldBadge) oldBadge.remove();

      if(padEditMode){
        const eb = document.createElement('span');
        eb.className = 'pad-edit-badge';
        eb.textContent = '✎';
        btnEl.appendChild(eb);
      }
    }

    if(badgeEl){
      if(binding && binding.title){
        badgeEl.textContent = binding.title;
        badgeEl.style.display = '';
        badgeEl.title = binding.title;
      }else if(padEditMode){
        badgeEl.textContent = '+';
        badgeEl.style.display = '';
        badgeEl.title = t('padAssignAction');
      }else{
        badgeEl.style.display = 'none';
      }
    }
  });

  const statusInfo = document.getElementById('padStatusInfo');
  if(statusInfo){
    const devCount = [...devices.values()].filter(d => d.device && d.device.gatt && d.device.gatt.connected).length;
    const boundCount = Object.keys(padConfig).length;
    statusInfo.innerHTML = `<span>${devCount} ${currentLang === 'tr' ? 'cihaz bağlı' : 'devices connected'} · ${boundCount}/8 ${currentLang === 'tr' ? 'buton ayarlı' : 'buttons set'}</span><br><small style="color:var(--muted)">${t('padKeyboardHint')}</small>`;
  }
}

/* ── Pad Aksiyon Çalıştırma (Play Mode) ────────────────────────────────── */
function padButtonDown(btnKey){
  if(padEditMode){
    openPadModal(btnKey);
    return;
  }
  const btnEl = document.querySelector(`[data-pad="${btnKey}"]`);
  if(btnEl) btnEl.classList.add('pressed');

  const binding = padConfig[btnKey];
  if(!binding) return;

  const d = widgetDevice(binding);
  if(!d) return;

  if(binding.action === 'jog'){
    padActiveJogs.add(btnKey);
    if(btnEl) btnEl.classList.add('held');
    const hiz = binding.speed || 75;
    if(isHubType(d.type) && binding.port != null){
      hubMotorRun(d, binding.port, binding.dir || 'CW', hiz);
    }else{
      if(binding.speed) d.speed = binding.speed;
      jogStart(d, widgetMask(binding, d), binding.dir || 'CW');
    }
  }else{
    runWidgetAction(binding);
  }
}

function padButtonUp(btnKey){
  const btnEl = document.querySelector(`[data-pad="${btnKey}"]`);
  if(btnEl) {
    btnEl.classList.remove('pressed');
    btnEl.classList.remove('held');
  }

  if(padEditMode) return;

  const binding = padConfig[btnKey];
  if(!binding) return;

  if(binding.action === 'jog' && padActiveJogs.has(btnKey)){
    padActiveJogs.delete(btnKey);
    const d = widgetDevice(binding);
    if(!d) return;
    if(isHubType(d.type) && binding.port != null){
      hubMotorStop(d, binding.port);
    }else{
      jogStop(d);
    }
  }
}

function padEmergencyStop(){
  padActiveJogs.clear();
  document.querySelectorAll('.dpad-btn, .pad-act-btn').forEach(b => {
    b.classList.remove('pressed');
    b.classList.remove('held');
  });

  devices.forEach(d => {
    if(!d.device || !d.device.gatt || !d.device.gatt.connected) return;
    if(isHubType(d.type)){
      for(let i=0; i<(d.slotCount||6); i++){
        if((d.ports[i]||{}).kind === 'motor') hubMotorStop(d, i);
      }
      if(d.hubProto === 'spike3') send(d, S3_CMD.programFlow(true, 0));
    }else{
      jogStop(d);
    }
    log(d, '🛑 Pad: Acil Durdurma uygulandı', 'e');
  });
}

/* ── Pad Aksiyon Düzenleme Modalı ─────────────────────────────────────── */
let padModalState = {
  deviceId: null,
  port: null,
  mask: 1,
  action: 'jog',
  dir: 'CW',
  speed: 75,
  value: 1,
  title: ''
};

function openPadModal(btnKey){
  editingPadKey = btnKey;
  const bInfo = PAD_BUTTONS.find(b => b.key === btnKey);
  const btnName = currentLang === 'tr' ? (bInfo ? bInfo.nameTr : btnKey) : (bInfo ? bInfo.nameEn : btnKey);

  document.getElementById('padModalTitle').textContent = `🎮 ${btnName}`;
  document.getElementById('padActionModal').classList.add('on');

  const existing = padConfig[btnKey];
  const devList = [...devices.values()].filter(d => d.device && d.device.gatt && d.device.gatt.connected);
  const firstDev = devList[0] || null;

  if(existing){
    padModalState = { ...existing };
  }else{
    padModalState = {
      deviceId: firstDev ? firstDev.id : null,
      port: (firstDev && isHubType(firstDev.type)) ? padFirstMotorPort(firstDev) : null,
      mask: 1,
      action: 'jog',
      dir: (btnKey === 'down' || btnKey === 'left' || btnKey === 'act-left') ? 'CCW' : 'CW',
      speed: 75,
      value: 1,
      title: ''
    };
  }

  const clearBtn = document.getElementById('padBtnClear');
  if(clearBtn) clearBtn.style.display = existing ? '' : 'none';

  renderPadModalBody();
}

function padFirstMotorPort(d){
  if(!isHubType(d.type)) return null;
  for(let i=0; i<(d.slotCount||6); i++){
    if((d.ports[i]||{}).kind === 'motor') return i;
  }
  return 0;
}

function renderPadModalBody(){
  const devGrid = document.getElementById('padDevGrid');
  const portRow = document.getElementById('padPortRow');
  const portGrid = document.getElementById('padPortGrid');
  const actGrid = document.getElementById('padActionGrid');
  const dirGroup = document.getElementById('padDirGroup');
  const spdPresets = document.getElementById('padSpeedPresets');
  const valRow = document.getElementById('padValueRow');
  const valLabel = document.getElementById('padValLabel');
  const valInput = document.getElementById('padValInput');
  const titleInput = document.getElementById('padTitleInput');

  // 1. Cihazlar
  devGrid.innerHTML = '';
  const devList = [...devices.values()].filter(d => d.device && d.device.gatt && d.device.gatt.connected);
  if(!devList.length){
    devGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:10px 0">${t('emptyDevicesDesc')}</div>`;
  }else{
    devList.forEach(d => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pad-opt-card ${padModalState.deviceId === d.id ? 'active' : ''}`;
      card.innerHTML = `<img src="${d.typeInfo?.img || './img/favicon.svg'}" alt=""><span>${d.name}</span>`;
      card.onclick = () => {
        padModalState.deviceId = d.id;
        if(isHubType(d.type)) padModalState.port = padFirstMotorPort(d);
        else padModalState.port = null;
        renderPadModalBody();
      };
      devGrid.appendChild(card);
    });
  }

  // 2. Port / Motor seçimi
  const selDev = devices.get(padModalState.deviceId);
  if(selDev && isHubType(selDev.type)){
    portRow.style.display = '';
    portGrid.innerHTML = '';
    for(let i=0; i<(selDev.slotCount||6); i++){
      const p = selDev.ports[i] || {};
      const isMotor = p.kind === 'motor';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pad-opt-card ${padModalState.port === i ? 'active' : ''}`;
      card.innerHTML = `<span>Port ${PORT_LETTERS[i]}</span><small style="color:${isMotor?'var(--ok)':'var(--muted)'}">${isMotor ? (portTypeName(p)) : t('emptySlot')}</small>`;
      card.onclick = () => {
        padModalState.port = i;
        renderPadModalBody();
      };
      portGrid.appendChild(card);
    }
  }else if(selDev && selDev.type === 'double_motor'){
    portRow.style.display = '';
    portGrid.innerHTML = `
      <button type="button" class="pad-opt-card ${padModalState.mask === 1 ? 'active' : ''}" onclick="padModalState.mask=1; renderPadModalBody();">Motor 1</button>
      <button type="button" class="pad-opt-card ${padModalState.mask === 2 ? 'active' : ''}" onclick="padModalState.mask=2; renderPadModalBody();">Motor 2</button>
      <button type="button" class="pad-opt-card ${padModalState.mask === 3 ? 'active' : ''}" onclick="padModalState.mask=3; renderPadModalBody();">${t('both')}</button>
    `;
  }else{
    portRow.style.display = 'none';
  }

  // 3. Aksiyon Türü
  const PAD_ACTIONS = [
    { key: 'jog',    titleTr: 'Basılı Tuttukça Çevir', titleEn: 'Hold to Run (Jog)', icon: '⚡', badgeTr: 'Önerilen', badgeEn: 'Recommended' },
    { key: 'turns',  titleTr: 'X Tur Çevir',           titleEn: 'Turn X Rotations',  icon: '↺' },
    { key: 'time',   titleTr: 'X Saniye Çevir',        titleEn: 'Run X Seconds',     icon: '⏱' },
    { key: 'angle',  titleTr: 'Açıya Git',             titleEn: 'Go to Angle',       icon: '🎯' },
    { key: 'run',    titleTr: 'Sürekli Döndür',        titleEn: 'Continuous Run',    icon: '▶' },
    { key: 'stop',   titleTr: 'Durdur',                titleEn: 'Stop',              icon: '■' }
  ];

  actGrid.innerHTML = '';
  PAD_ACTIONS.forEach(a => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `pad-opt-card ${padModalState.action === a.key ? 'active' : ''}`;
    const badge = a.badgeTr ? `<span style="font-size:9px;background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:4px;margin-bottom:2px">${currentLang==='tr'?a.badgeTr:a.badgeEn}</span>` : '';
    card.innerHTML = `${badge}<span style="font-size:16px">${a.icon}</span><span>${currentLang==='tr'?a.titleTr:a.titleEn}</span>`;
    card.onclick = () => {
      padModalState.action = a.key;
      renderPadModalBody();
    };
    actGrid.appendChild(card);
  });

  // 4. Parametreler
  const isStop = padModalState.action === 'stop';
  const hasValue = padModalState.action === 'turns' || padModalState.action === 'time' || padModalState.action === 'angle';
  document.getElementById('padParamsRow').style.display = isStop ? 'none' : '';

  if(dirGroup){
    dirGroup.querySelectorAll('[data-pdir]').forEach(b => {
      b.classList.toggle('active', b.dataset.pdir === padModalState.dir);
      b.onclick = () => {
        padModalState.dir = b.dataset.pdir;
        renderPadModalBody();
      };
    });
  }

  if(spdPresets){
    spdPresets.querySelectorAll('[data-pspd]').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.pspd) === padModalState.speed);
      b.onclick = () => {
        padModalState.speed = Number(b.dataset.pspd);
        renderPadModalBody();
      };
    });
  }

  if(valRow){
    valRow.style.display = hasValue ? '' : 'none';
    if(padModalState.action === 'turns'){
      valLabel.textContent = currentLang === 'tr' ? 'Tur Sayısı (ör. 1, 2.5)' : 'Rotations (e.g. 1, 2.5)';
      valInput.step = '0.5';
    }else if(padModalState.action === 'time'){
      valLabel.textContent = currentLang === 'tr' ? 'Süre (saniye)' : 'Duration (seconds)';
      valInput.step = '0.5';
    }else if(padModalState.action === 'angle'){
      valLabel.textContent = currentLang === 'tr' ? 'Hedef Açı (0–359°)' : 'Target Angle (0–359°)';
      valInput.step = '15';
    }
    valInput.value = padModalState.value;
    valInput.oninput = () => { padModalState.value = Number(valInput.value) || 0; };
  }

  if(titleInput){
    titleInput.value = padModalState.title;
    titleInput.oninput = () => { padModalState.title = titleInput.value; };
  }
}

function autoPadActionTitle(s, d){
  const dirStr = s.dir === 'CCW' ? (currentLang === 'tr' ? 'Sola' : 'Left') : (currentLang === 'tr' ? 'Sağa' : 'Right');
  let devPart = '';
  if(d && isHubType(d.type) && s.port != null) devPart = `P${PORT_LETTERS[s.port]} `;

  if(s.action === 'jog')   return `${devPart}${dirStr} Jog`;
  if(s.action === 'turns') return `${devPart}${s.value}T ${dirStr}`;
  if(s.action === 'time')  return `${devPart}${s.value}s ${dirStr}`;
  if(s.action === 'angle') return `${devPart}${s.value}°`;
  if(s.action === 'run')   return `${devPart}${dirStr} Run`;
  if(s.action === 'stop')  return `${devPart}Stop`;
  return `${devPart}Action`;
}

function savePadModal(){
  if(!editingPadKey) return;
  const d = devices.get(padModalState.deviceId);
  if(!d){ alert(t('selectDevicePrompt')); return; }

  const binding = {
    deviceId: d.id,
    deviceName: d.name,
    deviceType: d.type,
    port: padModalState.port,
    mask: padModalState.mask,
    action: padModalState.action,
    dir: padModalState.dir,
    speed: padModalState.speed || 75,
    value: Number(padModalState.value) || 1,
    title: (padModalState.title || '').trim() || autoPadActionTitle(padModalState, d)
  };

  padConfig[editingPadKey] = binding;
  padSaveConfig();
  closePadModal();
  renderPad();
}

function clearPadButtonBinding(){
  if(!editingPadKey) return;
  delete padConfig[editingPadKey];
  padSaveConfig();
  closePadModal();
  renderPad();
}

function closePadModal(){
  document.getElementById('padActionModal').classList.remove('on');
  editingPadKey = null;
}

/* ── Pad Etkileşim Dinleyicileri ────────────────────────────────────────── */
function initPadListeners(){
  document.querySelectorAll('[data-pad]').forEach(btn => {
    const key = btn.dataset.pad;
    btn.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      padButtonDown(key);
    });
    btn.addEventListener('pointerup', ev => {
      ev.preventDefault();
      padButtonUp(key);
    });
    btn.addEventListener('pointerleave', ev => {
      ev.preventDefault();
      padButtonUp(key);
    });
    btn.addEventListener('pointercancel', ev => {
      ev.preventDefault();
      padButtonUp(key);
    });
  });

  const KEY_TO_PAD = {
    ArrowUp:    'up',
    KeyW:       'up',
    ArrowDown:  'down',
    KeyS:       'down',
    ArrowLeft:  'left',
    KeyA:       'left',
    ArrowRight: 'right',
    KeyD:       'right',
    KeyI:       'act-top',
    KeyL:       'act-right',
    KeyK:       'act-bottom',
    KeyJ:       'act-left'
  };

  window.addEventListener('keydown', ev => {
    if(currentView !== 'pad') return;
    if(ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;

    if(ev.code === 'Space'){
      ev.preventDefault();
      padEmergencyStop();
      return;
    }

    const padKey = KEY_TO_PAD[ev.code];
    if(padKey && !ev.repeat){
      ev.preventDefault();
      padButtonDown(padKey);
    }
  });

  window.addEventListener('keyup', ev => {
    if(currentView !== 'pad') return;
    if(ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;

    const padKey = KEY_TO_PAD[ev.code];
    if(padKey){
      ev.preventDefault();
      padButtonUp(padKey);
    }
  });
}
