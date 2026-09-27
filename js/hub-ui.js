/* ══════════════════════════════════════════════════════════════════════════
   Hub arayüzü — sol listede hub + slotlar, sağda her biri için ayrı panel
   ══════════════════════════════════════════════════════════════════════════ */

/** Hub bağlandığında liste satırlarını ve kartları kurar. */
function buildHub(d, type){
  d.slotCount = hubSlotCount(type.key);
  d.ports = {};
  for(let i = 0; i < d.slotCount; i++) d.ports[i] = { kind:null, type:null, value:null };

  // hub satırı
  renderListItem(d, type);
  d.item.dataset.key = d.id;

  // Remote Controller has no user-accessible port slots — skip slot items/cards
  d.hasSlots = type.key !== 'remote_controller';
  if(d.hasSlots){ d.slotItems = {}; d.slotEls = {}; }

  // hub genel kartı
  renderHubCard(d, type);

  if(d.hasSlots){
    for(let i = 0; i < d.slotCount; i++) hubAddSlot(d, i);
    renderHubSlots(d);
  }
}

/** Tek bir slotun liste satırını ve kartını oluşturur. */
function hubAddSlot(d, i){
  if(!d.hasSlots || d.slotItems[i]) return;
  const b = document.createElement('button');
  b.className = 'devitem slot';
  b.dataset.key = `${d.id}#${i}`;
  b.onclick = () => selectTarget(`${d.id}#${i}`);
  d.slotItems[i] = b;
  document.getElementById('deviceList').appendChild(b);
  renderSlotCard(d, i);
}

/** Hub beklenenden yüksek bir porta cihaz bildirirse slot listesini büyüt.
    Böylece bir hub modelinin port sayısını eksik tahmin etmek cihazı gizlemez. */
function hubEnsureSlot(d, port){
  if(!d.hasSlots || port < d.slotCount) return false;
  if(port >= PORT_LETTERS.length) return false;      // A-F dışına çıkma
  for(let i = d.slotCount; i <= port; i++){
    d.ports[i] = { kind:null, type:null, value:null };
    hubAddSlot(d, i);
  }
  d.slotCount = port + 1;
  log(d, `ℹ Port ${PORT_LETTERS[port]} bildirildi — slot sayısı ${d.slotCount} oldu`);
  return true;
}

function hubStageHTML(d, type){
  // Remote Controller: button state display
  if(type.key === 'remote_controller'){
    return `
    <div class="hub-stage remote-stage">
      <div class="remote-panel">
        <div class="remote-side" id="remoteLeft_${d.id}">
          <div class="remote-side-label">L</div>
          <div class="remote-btn-row">
            <div class="remote-btn" id="rL_plus_${d.id}" title="L+">+</div>
            <div class="remote-btn" id="rL_red_${d.id}" title="L STOP" style="color:#e03131">■</div>
          </div>
          <div class="remote-btn-row">
            <div class="remote-btn" id="rL_minus_${d.id}" title="L-">–</div>
          </div>
        </div>
        <div class="remote-center">
          <div class="remote-led" id="remoteLed_${d.id}" title="LED"></div>
          <div class="remote-green" id="rGreen_${d.id}" title="Green">✓</div>
        </div>
        <div class="remote-side" id="remoteRight_${d.id}">
          <div class="remote-side-label">R</div>
          <div class="remote-btn-row">
            <div class="remote-btn" id="rR_plus_${d.id}" title="R+">+</div>
            <div class="remote-btn" id="rR_red_${d.id}" title="R STOP" style="color:#e03131">■</div>
          </div>
          <div class="remote-btn-row">
            <div class="remote-btn" id="rR_minus_${d.id}" title="R-">–</div>
          </div>
        </div>
      </div>
      <div class="remote-led-picker" id="remoteLedPicker_${d.id}">
        ${[['off','#444'],['pink','#ff69b4'],['purple','#9b59b6'],['blue','#2465d6'],
           ['light_blue','#4dbeea'],['cyan','#00857d'],['green','#00a831'],['yellow','#ffc90f'],
           ['orange','#ff8c00'],['red','#d93025'],['white','#f0f0f0']]
          .map(([name,hex])=>`<button class="rled-swatch" style="background:${hex}" data-led-color="${name}" title="${name}"></button>`).join('')}
      </div>
    </div>`;
  }

  const isPrime = type.key === 'spike_prime' || d.slotCount === 6;
  const leftPorts  = isPrime ? [0, 2, 4] : [0]; // Sol taraf: A, C, E (veya A)
  const rightPorts = isPrime ? [1, 3, 5] : [1]; // Sağ taraf: B, D, F (veya B)

  const renderSide = (ports, side) => `
    <div class="hub-ports-col ${side}">
      ${ports.map(idx => `
        <div class="hub-port-pill empty" data-hport="${idx}" title="Port ${PORT_LETTERS[idx]}">
          ${side === 'left' ? `
            <span class="hp-letter">${PORT_LETTERS[idx]}</span>
            <span class="hp-icon-box"><i class="hp-dot"></i></span>
          ` : `
            <span class="hp-icon-box"><i class="hp-dot"></i></span>
            <span class="hp-letter">${PORT_LETTERS[idx]}</span>
          `}
        </div>
      `).join('')}
    </div>
  `;

  return `
    <div class="hub-stage">
      ${renderSide(leftPorts, 'left')}
      <div class="hubscreen">
        ${Array.from({length:25}, (_,i)=>`<i data-px="${i}"></i>`).join('')}
      </div>
      ${renderSide(rightPorts, 'right')}
    </div>
  `;
}

function renderHubCard(d, type){
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.key = d.id;
  const isConn = !!(d.device && d.device.gatt && d.device.gatt.connected);
  el.innerHTML = `
    <div class="card-head">
      <img src="${type.img}" alt="">
      <div>
        <div class="name">${d.name}</div>
        <div class="meta"><span class="dot"></span><span class="state">${t('waiting')}</span> · ${deviceTypeLabel(type)}</div>
      </div>
      <div class="spacer"></div>
      <button class="btn ghost" data-raw title="RAW" style="${isConn ? '' : 'display:none'}">${t('rawPacketLog')}</button>
      <button class="btn success" data-act="reconnect" style="${isConn ? 'display:none' : ''}">${t('btnReconnect')}</button>
      <button class="btn danger" data-act="disconnect" style="${isConn ? '' : 'display:none'}">${t('disconnect')}</button>
    </div>
    <div class="body">
      <div class="gauge">
        <img src="${type.img}" style="width:104px;height:80px;object-fit:contain">
        ${hubStageHTML(d, type)}
        <div class="hub-bat-box">
          <span class="lbl">${t('battery')}</span>
          <b class="v-bat">–</b>
        </div>
        <div class="fw">${t('waitingInfo')}</div>
      </div>
      <div class="panel">
        <p class="hint" ${type.key==='remote_controller' ? 'style="display:none"' : ''}>${t('hubHint')}</p>
        <div class="slotgrid" id="slotgrid_${d.id}" ${type.key==='remote_controller' ? 'style="display:none"' : ''}></div>

        <div class="imubox" style="display:none">
          <div class="sep"></div>
          <p class="hint">${t('imuSensor')}</p>
          <div class="bigval">
            <div><b class="imu-face">–</b><span>${t('upFace')}</span></div>
            <div><b class="imu-desc">–</b><span>${t('pose')}</span></div>
          </div>
          <div class="stats" style="grid-template-columns:repeat(3,1fr);margin-top:14px">
            <div><span>${t('yaw')}</span><b class="imu-yaw">–</b></div>
            <div><span>${t('pitch')}</span><b class="imu-pitch">–</b></div>
            <div><span>${t('roll')}</span><b class="imu-roll">–</b></div>
            <div><span>${t('accelX')}</span><b class="imu-ax">–</b></div>
            <div><span>${t('accelY')}</span><b class="imu-ay">–</b></div>
            <div><span>${t('accelZ')}</span><b class="imu-az">–</b></div>
          </div>
        </div>
        <div class="progbox" style="display:none">
          <div class="sep"></div>
          <p class="hint">${t('progSlotHint')}</p>
          <div class="row">
            <label>Slot</label>
            <select class="p-slot">
              ${Array.from({length:20},(_,i)=>`<option value="${i}">${i}</option>`).join('')}
            </select>
            <button class="btn" data-prun style="flex:1">${t('btnStart')}</button>
            <button class="btn danger" data-pstop>${t('btnStop')}</button>
          </div>
        </div>
      </div>
    </div>`;
  d.el = el;
  document.getElementById('devices').appendChild(el);

  el.querySelectorAll('.hub-port-pill[data-hport]').forEach(pill => {
    const idx = +pill.dataset.hport;
    pill.onclick = () => selectTarget(`${d.id}#${idx}`);
  });

  const recBtn = $(el, '[data-act=reconnect]');
  if(recBtn) recBtn.onclick = () => quickReconnect(d);
  $(el, '[data-act=disconnect]').onclick = () => disconnect(d.id);
  const rawBtn = $(el, '[data-raw]');
  rawBtn.onclick = () => {
    d.rawLog = !d.rawLog;
    rawBtn.style.background = d.rawLog ? 'var(--accent)' : '';
    rawBtn.style.color      = d.rawLog ? '#fff' : '';
    log(d, 'ham paket logu ' + (d.rawLog ? 'açık' : 'kapalı'));
  };

  const slot = () => Number($(el, '.p-slot').value) || 0;
  $(el, '[data-prun]').onclick = () => {
    send(d, S3_CMD.programFlow(false, slot()));
    log(d, `▶ slot ${slot()} başlatıldı`, 'g');
  };
  $(el, '[data-pstop]').onclick = () => {
    send(d, S3_CMD.programFlow(true, slot()));
    log(d, `■ slot ${slot()} durduruldu`);
  };

  if(!d.logEl){
    d.logEl = document.createElement('div');
    d.logEl.className = 'log';
    d.logEl.dataset.id = d.id;
    document.getElementById('logPanel').appendChild(d.logEl);
  }
}

function renderSlotCard(d, port){
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.key = `${d.id}#${port}`;
  const hubImg = (d.typeInfo && d.typeInfo.img) || 'https://blockcode.alorak.com/img/spike_prime_hub.png';
  el.innerHTML = `
    <div class="card-head slot-head">
      <button class="slot-hub-crumb" data-crumb title="${t('backToHub')}">
        <img src="${hubImg}" alt="">
        <span>${d.name}</span>
      </button>
      <span class="crumb-sep">›</span>
      <div class="slot-device-info">
        <img class="s-icon" src="https://blockcode.alorak.com/img/hub_light_icon.png" alt="">
        <div>
          <div class="name">Port ${PORT_LETTERS[port]}</div>
          <div class="meta"><span class="dot"></span><span class="s-type">${t('emptySlot')}</span></div>
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn ghost" data-sraw title="RAW">RAW</button>
    </div>
    <div class="body">
      <div class="gauge">
        <div class="s-visual"></div>
        <div class="s-main">–</div>
        <div class="stats" style="margin-top:16px">
          <div><span>Port</span><b>${PORT_LETTERS[port]}</b></div>
          <div><span>${t('device')}</span><b class="s-typename">${t('emptySlot')}</b></div>
        </div>
      </div>
      <div class="panel">
        <div class="s-body"><p class="hint">${t('noDeviceAttached')}</p></div>
      </div>
    </div>`;
  d.slotEls[port] = el;
  document.getElementById('devices').appendChild(el);
  const crumb = $(el, '[data-crumb]');
  if(crumb) crumb.onclick = () => selectTarget(d.id);

  // RAW her slot kartından da açılabilsin — hub kartına dönmek gerekmesin
  const raw = $(el, '[data-sraw]');
  raw.onclick = () => {
    d.rawLog = !d.rawLog;
    document.querySelectorAll(`[data-sraw]`).forEach(b => {
      b.style.background = d.rawLog ? 'var(--accent)' : '';
      b.style.color      = d.rawLog ? '#fff' : '';
    });
    log(d, 'ham paket logu ' + (d.rawLog ? 'açık' : 'kapalı'));
  };
}

/** Slot satırlarını ve hub kartındaki slot ızgarasını tazeler. */
function renderHubSlots(d){
  let used = 0;
  for(let i = 0; i < d.slotCount; i++){
    const p = d.ports[i] || {};
    const dolu = p.kind != null;
    if(dolu) used++;
    const ad = dolu ? portTypeName(p) : t('emptySlot');

    const b = d.slotItems && d.slotItems[i];
    if(b){
      b.classList.toggle('empty', !dolu);
      b.style.display = dolu ? 'flex' : 'none';
      if(dolu){
        b.innerHTML = `
          <span class="slotletter">${PORT_LETTERS[i]}</span>
          <img src="${kindIcon(p.kind)}" alt="">
          <div class="txt">
            <div class="t1">${ad}</div>
            <div class="t2"><span class="s-val">–</span></div>
          </div>
          <span class="i-arrow">›</span>`;
      }
    }

    // Seçili port boşaldıysa seçimi hub'a al
    if(selectedId === `${d.id}#${i}` && !dolu){
      selectTarget(d.id);
    }

    const card = d.slotEls && d.slotEls[i];
    if(card){
      setText(card, '.s-type', ad);
      setText(card, '.s-typename', ad);
      const icon = $(card, '.s-icon');
      if(icon){
        icon.src = dolu ? kindIcon(p.kind) : 'https://blockcode.alorak.com/img/hub_light_icon.png';
        icon.style.opacity = dolu ? 1 : .35;
      }
      const dot = $(card, '.card-head .dot');
      if(dot) dot.classList.toggle('off', !dolu);
      if(card.dataset.built !== String(p.kind)){
        card.dataset.built = String(p.kind);
        $(card, '.s-body').innerHTML   = slotBodyHTML(p.kind, d.hubProto);
        $(card, '.s-visual').innerHTML = slotVisualHTML(p.kind);
        if(p.kind === 'motor'){
          if(d.hubProto === 'lwp3') wireHubMotor(d, card, i);
          else wireSendRun(d, card, i);
        }else if(p.kind === 'matrix'){
          wireColorMatrix(d, card, i);
        }
      }
    }
  }

  // hub kartındaki ızgara
  const grid = document.getElementById('slotgrid_' + d.id);
  if(grid){
    grid.innerHTML = '';
    for(let i = 0; i < d.slotCount; i++){
      const p = d.ports[i] || {};
      const dolu = p.kind != null;
      const b = document.createElement('button');
      b.className = 'slotcell' + (dolu ? '' : ' empty');
      b.innerHTML = `
        <span class="sl">${PORT_LETTERS[i]}</span>
        ${dolu ? `<img src="${kindIcon(p.kind)}" alt="">` : '<span class="sdash">—</span>'}
        <span class="sn">${dolu ? portTypeName(p) : t('emptySlot')}</span>
        <span class="sv" data-port="${i}">–</span>`;
      b.onclick = () => selectTarget(`${d.id}#${i}`);
      grid.appendChild(b);
    }
  }

  if(d.el){
    d.el.querySelectorAll('.hub-port-pill[data-hport]').forEach(el => {
      const idx = +el.dataset.hport;
      const p = d.ports[idx] || {};
      const dolu = p.kind != null;
      el.classList.toggle('filled', dolu);
      el.classList.toggle('empty', !dolu);
      const ad = dolu ? portTypeName(p) : t('emptySlot');
      el.title = `Port ${PORT_LETTERS[idx]}: ${ad}`;
      const isRight = el.closest('.hub-ports-col')?.classList.contains('right');
      const iconBox = el.querySelector('.hp-icon-box');
      if(iconBox){
        if(dolu){
          iconBox.innerHTML = isRight
            ? `<i class="hp-dot"></i><img src="${kindIcon(p.kind)}" class="hp-mini-img" alt="">`
            : `<img src="${kindIcon(p.kind)}" class="hp-mini-img" alt=""><i class="hp-dot"></i>`;
        }else{
          iconBox.innerHTML = `<i class="hp-dot"></i>`;
        }
      }
    });
  }

  setText(d.el, '.v-used', used);
  setText(d.el, '.v-free', d.slotCount - used);
  paintHub(d);
}

/** Takılı cihaza göre slot kartının gövdesi. */
function slotBodyHTML(kind, proto){
  if(kind == null) return `<p class="hint">${t('noDeviceAttached')}</p>`;
  if(kind === 'motor')
    return `<p class="hint">${t('motorStatsHint')}</p>
      <div class="bigval">
        <div><b class="m-speed">–</b><span>${t('speed').toLowerCase()} (%)</span></div>
        <div><b class="m-power">–</b><span>${t('torque').toLowerCase()} (%)</span></div>
      </div>
      <div class="wbar" style="margin-top:12px"><i class="m-pbar"></i></div>
      <div class="stats" style="grid-template-columns:1fr 1fr;margin-top:16px">
        <div><span>${t('posLabel')}</span><b class="m-angle">–</b></div>
        <div><span>${t('cumulative')}</span><b class="m-raw">–</b></div>
        <div><span>${t('model')}</span><b class="m-model">–</b></div>
        <div><span>${t('direction')}</span><b class="m-dir">–</b></div>
      </div>` + (proto === 'lwp3' ? hubMotorControlHTML() : hubSendRunHTML());
  if(kind === 'matrix')
    return hubMatrixEditorHTML(proto);
  if(kind === 'force')
    return `<p class="hint">${t('forceHint')}</p>
      <div class="bigval"><div><b class="f-state">–</b><span>${t('status').toLowerCase()}</span></div>
        <div><b class="f-n">–</b><span>${t('forceN')}</span></div></div>
      <div class="wbar" style="margin-top:14px"><i class="f-bar"></i></div>`;
  if(kind === 'distance')
    return `<p class="hint">${t('distanceHint')}</p>
      <div class="bigval"><div><b class="ds-cm">–</b><span>cm</span></div></div>
      <div class="wbar" style="margin-top:14px"><i class="ds-bar"></i></div>`;
  if(kind === 'color')
    return `<p class="hint">${t('colorHint')}</p>
      <div class="bigval"><div><b class="cs-name">–</b><span>${t('detectedColor')}</span></div></div>`;
  return `<p class="hint">${KIND_NAME[kind] || t('device')} ${t('deviceConnected')}</p>
    <div class="bigval"><div><b class="g-val">–</b><span>${t('value')}</span></div></div>`;
}

function slotVisualHTML(kind){
  if(kind == null) return '';
  if(kind === 'motor')
    return `<div class="motorvis"><img src="https://blockcode.alorak.com/img/single-motor-body.png" alt="">
            <img class="shaft" src="https://blockcode.alorak.com/img/single-motor-shaft.png" alt=""></div>`;
  if(kind === 'color') return '<div class="swatch"><span>?</span></div>';
  if(kind === 'matrix')
    return `<div class="mx3 small">${Array.from({length:9},(_,i)=>`<i data-mx="${i}"></i>`).join('')}</div>`;
  return `<img src="${kindIcon(kind)}" style="width:76px;height:76px;object-fit:contain">`;
}

/** Hub ve slot kartlarındaki canlı değerleri yazar. */
function paintHub(d){
  if(!d.el) return;
  setDeviceConnectedUI(d, d.device.gatt.connected);
  setText(d.el, '.v-bat', d.state.battery == null ? '–' : d.state.battery + '%');
  const bat = $(d.el, '.v-bat');
  if(bat) bat.style.color = batColor(d.state.battery);
  setText(d.el, '.state', d.device.gatt.connected ? t('connected') : t('disconnected'));

  // Hub'ın konum sensörü
  if(d.imu){
    const box = $(d.el, '.imubox');
    if(box){
      box.style.display = '';
      setText(d.el, '.imu-face',  FACE_NAME[d.imu.upFace] || '–');
      setText(d.el, '.imu-desc',  FACE_DESC[d.imu.upFace] || '–');
      setText(d.el, '.imu-yaw',   d.imu.yaw.toFixed(0)   + '°');
      setText(d.el, '.imu-pitch', d.imu.pitch.toFixed(0) + '°');
      setText(d.el, '.imu-roll',  d.imu.roll.toFixed(0)  + '°');
      setText(d.el, '.imu-ax', d.imu.ax);
      setText(d.el, '.imu-ay', d.imu.ay);
      setText(d.el, '.imu-az', d.imu.az);
    }
  }

  // Hub'ın kendi 5x5 ekranı (SPIKE App 3 bunu her bildirimde yolluyor)
  if(d.display){
    const scr = $(d.el, '.hubscreen');
    if(scr){
      scr.style.display = '';
      for(let i = 0; i < 25; i++){
        const px = scr.querySelector(`[data-px="${i}"]`);
        if(px) px.style.opacity = (d.display[i] || 0) > 0 ? Math.min(1, d.display[i] / 100) : '.06';
      }
    }
  }

  if(d.item){
    let usedPorts = 0;
    for(let i = 0; i < d.slotCount; i++) if((d.ports[i] || {}).kind != null) usedPorts++;
    let stateTxt = t('disconnected');
    if(d.device.gatt.connected){
      stateTxt = usedPorts > 0
        ? `${t('connected')} · ${usedPorts} ${usedPorts > 1 ? t('portsPlural') : t('portSingular')}`
        : t('connected');
    }
    setText(d.item, '.i-state', stateTxt);
    const ib = $(d.item, '.i-bat');
    if(ib){
      ib.textContent = d.state.battery == null ? '–' : d.state.battery + '%';
      ib.style.color = batColor(d.state.battery);
    }
  }

  // Remote Controller'ın kullanıcıya açık portu yok: slotEls/slotItems hiç
  // oluşturulmuyor. Buraya girilirse pil bildirimi gelir gelmez çöküyordu.
  if(!d.hasSlots || !d.slotEls || !d.slotItems) return;

  for(let i = 0; i < d.slotCount; i++){
    const p = d.ports[i] || {};
    const card = d.slotEls[i];
    const özet = slotSummary(p);

    const row = d.slotItems[i];
    if(row) setText(row, '.s-val', özet);
    const cell = d.el.querySelector(`.sv[data-port="${i}"]`);
    if(cell) cell.textContent = özet;
    if(!card || p.kind == null) continue;

    setText(card, '.s-main', özet);

    if(p.kind === 'motor'){
      const shaft = $(card, '.shaft');
      if(shaft) shaft.style.transform = `rotate(${p.value || 0}deg)`;
      setText(card, '.m-angle', (p.value ?? '–') + '°');
      setText(card, '.m-raw',   (p.raw   ?? '–') + '°');
      setText(card, '.m-model', portTypeName(p) || '–');
      // Tork LEGO'nun kendi uygulamasında yüzdenin 100 katı olarak taşınıyor
      const tork = p.power == null ? null : Math.round(p.power / 100);
      setText(card, '.m-speed', p.speed == null ? '–' : p.speed);
      setText(card, '.m-power', tork == null ? '–' : tork);
      setText(card, '.m-dir', p.speed == null || p.speed === 0 ? t('dirStopped')
                            : p.speed > 0 ? t('dirRight') : t('dirLeft'));
      const pb = $(card, '.m-pbar');
      if(pb){
        pb.style.width = Math.min(100, Math.abs(p.speed || 0)) + '%';
        pb.style.background = (p.speed || 0) >= 0 ? 'var(--ok)' : 'var(--accent)';
      }
    }
    else if(p.kind === 'matrix'){
      card.querySelectorAll('[data-mx]').forEach(e => {
        const v = p.pixels ? p.pixels[+e.dataset.mx] : null;
        const bos = v == null || v === 255 || v === 0;
        e.style.background  = bos ? 'transparent' : (LWP3_COLOR_CSS[v] || '#888');
        e.style.borderColor = bos ? 'var(--line)' : (LWP3_COLOR_CSS[v] || '#888');
      });
    }
    else if(p.kind === 'force'){
      setText(card, '.f-state', p.pressed ? t('pressed') : t('released'));
      setText(card, '.f-n', p.value == null ? '–' : (p.value / 10).toFixed(1));
      const b = $(card, '.f-bar');
      if(b){ b.style.width = Math.min(100, p.value || 0) + '%';
             b.style.background = p.pressed ? 'var(--ok)' : 'var(--accent)'; }
    }
    else if(p.kind === 'distance'){
      setText(card, '.ds-cm', p.value == null ? '–' : p.value.toFixed(1));
      const b = $(card, '.ds-bar');
      if(b) b.style.width = Math.min(100, (p.value || 0) / 2) + '%';
    }
    else if(p.kind === 'color'){
      const sw = $(card, '.swatch');
      if(sw){
        sw.style.background  = LWP3_COLOR_CSS[p.value] || 'transparent';
        sw.style.borderColor = (p.value == null || p.value === 255)
          ? 'var(--line)' : (LWP3_COLOR_CSS[p.value] || 'var(--line)');
        const q = sw.querySelector('span');
        if(q) q.textContent = (p.value == null || p.value === 255) ? '?' : '';
      }
      setText(card, '.cs-name', p.value == null ? '–' : (LWP3_COLOR_NAME[p.value] || '?'));
    }
    else setText(card, '.g-val', p.value ?? '–');
  }
}

/** Slot satırında gösterilecek tek satırlık özet. */
function slotSummary(p){
  if(!p || p.kind == null) return t('emptySlot');
  if(p.kind === 'force')  return p.pressed ? t('pressed') : t('released');
  if(p.kind === 'matrix')
    return p.pixels ? `${p.value}/9 ${t('colored')}` : t('connected');
  if(p.value == null) return '–';
  if(p.kind === 'motor')    return p.value + '°';
  if(p.kind === 'distance') return p.value < 0 ? t('outOfRange') : p.value.toFixed(1) + ' cm';
  if(p.kind === 'color')    return LWP3_COLOR_NAME[p.value] || '?';
  return String(p.value);
}
