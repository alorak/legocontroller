/* ══════════════════════════════════════════════════════════════════════════
   Görünüm — her cihaz tipi kendi panelini tanımlar
   ══════════════════════════════════════════════════════════════════════════ */
/** Baştan + sondan kısıtlayan çizim gecikmesi.
    Sondaki çağrı olmazsa, duraklamadan önceki SON değer hiç çizilmez. */
function throttlePaint(d, fn){
  const now = Date.now();
  const kalan = 80 - (now - (d.lastPaint || 0));
  if(kalan <= 0){
    d.lastPaint = now;
    if(d.paintTimer){ clearTimeout(d.paintTimer); d.paintTimer = null; }
    fn();
  }else if(!d.paintTimer){
    d.paintTimer = setTimeout(() => {
      d.paintTimer = null; d.lastPaint = Date.now(); fn();
    }, kalan);
  }
}

const $ = (el, sel) => el.querySelector(sel);
const setText = (el, sel, v) => { const e = el.querySelector(sel); if(e) e.textContent = v; };

const batColor = b => b == null ? 'var(--muted)'
                    : b < 20 ? 'var(--err)' : b < 50 ? 'var(--warn)' : 'var(--ok)';

function setDeviceConnectedUI(d, isConnected){
  if(!d || !d.el) return;
  const recBtn = d.el.querySelector('[data-act=reconnect]');
  const disBtn = d.el.querySelector('[data-act=disconnect]');
  const rawBtn = d.el.querySelector('[data-raw]');
  if(recBtn){
    recBtn.style.display = isConnected ? 'none' : '';
    if(!isConnected) recBtn.disabled = false;
  }
  if(disBtn){
    disBtn.style.display = isConnected ? '' : 'none';
  }
  if(rawBtn){
    rawBtn.style.display = isConnected ? '' : 'none';
  }
}

function paint(d){
  if(!d.el) return;
  const isConn = !!(d.device && d.device.gatt && d.device.gatt.connected);
  setDeviceConnectedUI(d, isConn);
  const p = PANELS[d.type];

  // ortak: pil + güç kaynağı
  setText(d.el, '.v-bat', d.state.battery == null ? '–' : d.state.battery + '%');
  setText(d.el, '.v-src', d.state.usbPower == null ? '–' : UsbPowerName[d.state.usbPower]);
  const bat = $(d.el, '.v-bat');
  if(bat) bat.style.color = batColor(d.state.battery);

  const stateText = p.stateText ? p.stateText(d) : '—';
  setText(d.el, '.state', stateText);
  if(p.paint) p.paint(d, d.el);

  // soldaki liste satırı
  if(d.item){
    setText(d.item, '.i-state', stateText);
    const ib = $(d.item, '.i-bat');
    if(ib){
      ib.textContent = d.state.battery == null ? '–' : d.state.battery + '%';
      ib.style.color = batColor(d.state.battery);
    }
  }
}

function log(d, text, cls=''){
  const box = d.logEl;
  if(!box) return;
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = new Date().toLocaleTimeString('tr-TR') + '  ' + text;
  box.appendChild(line);
  while(box.childElementCount > 300) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
}

/* ── ortak parçalar ─────────────────────────────────────────────────────── */
const motorVisHTML = (cls='') => `
  <div class="motorvis ${cls}">
    <img src="https://blockcode.alorak.com/img/single-motor-body.png" alt="">
    <img class="shaft" src="https://blockcode.alorak.com/img/single-motor-shaft.png" alt="">
  </div>`;

const commonStatsHTML = extra => `
  <div class="stats">
    <div><span>${t('battery')}</span><b class="v-bat">–</b></div>
    <div><span>${t('power')}</span><b class="v-src">–</b></div>
    ${extra || ''}
  </div>
  <div class="fw">${t('waitingInfo')}</div>`;

/** Üç modlu motor kontrol paneli (tek motor ve çift motorun her portu için). */
const motorModesHTML = () => `
  <div class="tabs">
    <button class="on" data-tab="jog">${t('tabManual')}</button>
    <button data-tab="turn">${t('tabTurns')}</button>
    <button data-tab="pos">${t('tabAngle')}</button>
  </div>

  <div class="mode on" data-mode="jog">
    <p class="hint">${t('jogHint')}</p>
    <div class="jog">
      <button data-jog="CCW">↺<span class="lbl">${t('jogLeft')}</span></button>
      <button data-jog="CW">↻<span class="lbl">${t('jogRight')}</span></button>
    </div>
  </div>

  <div class="mode" data-mode="turn">
    <p class="hint">${t('turnsHint')}</p>
    <div class="row" style="margin-bottom:14px">
      <label>${t('turnsLabel')}</label>
      <input type="number" class="turns" value="1" min="0.25" max="100" step="0.25">
    </div>
    <div class="row">
      <button class="btn ghost" data-turn="CCW" style="flex:1">${t('turnLeft')}</button>
      <button class="btn" data-turn="CW" style="flex:1">${t('turnRight')}</button>
    </div>
  </div>

  <div class="mode" data-mode="pos">
    <p class="hint">${t('posHint')}</p>
    <div class="row" style="margin-bottom:12px">
      <label>${t('posLabel')}</label>
      <input type="number" class="posnum" value="90" min="0" max="359" step="1">
      <input type="range" class="posrange" value="90" min="0" max="359" step="1">
    </div>
    <div class="row" style="margin-bottom:14px">
      <label>${t('dirLabel')}</label>
      <select class="posdir">
        <option value="Shortest" selected>${t('dirShortest')}</option>
        <option value="Clockwise">${t('dirCW')}</option>
        <option value="Counterclockwise">${t('dirCCW')}</option>
        <option value="Longest">${t('dirLongest')}</option>
      </select>
    </div>
    <div class="row">
      <button class="btn" data-goto style="flex:1">${t('btnGotoAngle')}</button>
      <button class="btn ghost" data-home>${t('btnGotoZero')}</button>
    </div>
  </div>

  <div class="sep"></div>
  <div class="row">
    <label>${t('speedLabel')}</label>
    <input type="range" class="spd" value="50" min="1" max="100" step="1">
    <b class="spdval" style="font:600 13px ui-monospace,monospace;min-width:30px">50</b>
  </div>`;

/** Motor modlarını bağlar. maskFn() hangi porta gideceğini söyler. */
function wireMotorModes(d, el, maskFn){
  el.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      el.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      el.querySelectorAll('.mode').forEach(m => m.classList.toggle('on', m.dataset.mode === b.dataset.tab));
      jogStop(d);
    };
  });

  el.querySelectorAll('[data-jog]').forEach(b => {
    const dir  = b.dataset.jog;
    const down = e => { e.preventDefault(); b.classList.add('held'); jogStart(d, maskFn(), dir); };
    const up   = e => { e.preventDefault(); b.classList.remove('held'); jogStop(d); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
  });

  el.querySelectorAll('[data-turn]').forEach(b => {
    b.onclick = () => runTurns(d, maskFn(), el.querySelector('.turns').value, b.dataset.turn);
  });

  const num = $(el, '.posnum'), rng = $(el, '.posrange');
  num.oninput = () => rng.value = num.value;
  rng.oninput = () => num.value = rng.value;
  $(el, '[data-goto]').onclick = () => goToAngle(d, maskFn(), num.value, $(el, '.posdir').value);
  $(el, '[data-home]').onclick = () => {
    num.value = rng.value = 0;
    goToAngle(d, maskFn(), 0, $(el, '.posdir').value);
  };

  const spd = $(el, '.spd'), spdval = $(el, '.spdval');
  spd.oninput = () => {
    d.speed = Number(spd.value);
    spdval.textContent = spd.value;
    if(d.jogging) send(d, M.setSpeed(d.jogging, d.speed));   // dönerken canlı değişir
  };
}

/** Bir motor görselini + sayaçlarını tazeler. */
function paintMotor(el, sub, prefix=''){
  if(!sub) return;
  const shaft = el.querySelector(prefix + '.motorvis .shaft');
  if(shaft) shaft.style.transform = `rotate(${sub.absolutePosition}deg)`;
  setText(el, prefix + '.angle', '');
  const a = el.querySelector(prefix + '.angle');
  if(a) a.innerHTML = `${sub.absolutePosition}<small>°</small>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   PANEL TANIMLARI
   ══════════════════════════════════════════════════════════════════════════ */
const PANELS = {

/* ── TEK MOTOR ─────────────────────────────────────────────────────────── */
single_motor: {
  gauge: () => `
    ${motorVisHTML()}
    <div class="angle">0<small>°</small></div>
    ${commonStatsHTML(`
      <div><span>${t('position')}</span><b class="v-pos">–</b></div>
      <div><span>${t('speed')}</span><b class="v-spd">–</b></div>
      <div><span>${t('torque')}</span><b class="v-pwr">–</b></div>
      <div><span>${t('status')}</span><b class="v-st">–</b></div>`)}`,
  panel: () => motorModesHTML() + `
    <div class="row" style="margin-top:14px">
      <button class="btn danger" data-stop style="flex:1">${t('emergencyStop')}</button>
      <button class="btn ghost" data-reset>${t('resetPosition')}</button>
    </div>`,
  wire(d, el){
    wireMotorModes(d, el, () => d.masks[0] || MotorBits.Left);
    $(el, '[data-stop]').onclick  = () => emergencyStop(d);
    $(el, '[data-reset]').onclick = () => {
      send(d, M.resetPosition(d.masks[0] || MotorBits.Left, 0));
      log(d, 'kümülatif konum sıfırlandı');
    };
  },
  stateText(d){
    const m = d.state.motors[d.masks[0]];
    return m ? (MotorStateName[m.motorState] || '—') : t('waiting');
  },
  paint(d, el){
    const m = d.state.motors[d.masks[0]];
    if(!m) return;
    paintMotor(el, m);
    setText(el, '.v-pos', m.position + '°');
    setText(el, '.v-spd', m.speed + '%');
    setText(el, '.v-pwr', m.power.toFixed(0) + '%');
    setText(el, '.v-st',  MotorStateName[m.motorState] || m.motorState);
  }
},

/* ── ÇİFT MOTOR ────────────────────────────────────────────────────────── */
double_motor: {
  gauge: () => `
    <div class="twin">
      <div class="twin-one" data-m="1">
        ${motorVisHTML('small')}
        <div class="angle">0<small>°</small></div>
        <div class="twin-lbl">${t('motor1')}</div>
      </div>
      <div class="twin-one" data-m="2">
        ${motorVisHTML('small')}
        <div class="angle">0<small>°</small></div>
        <div class="twin-lbl">${t('motor2')}</div>
      </div>
    </div>
    ${commonStatsHTML(`
      <div><span>M1 ${t('position').toLowerCase()}</span><b class="v-pos1">–</b></div>
      <div><span>M2 ${t('position').toLowerCase()}</span><b class="v-pos2">–</b></div>
      <div><span>M1 ${t('status').toLowerCase()}</span><b class="v-st1">–</b></div>
      <div><span>M2 ${t('status').toLowerCase()}</span><b class="v-st2">–</b></div>`)}`,
  panel: () => `
    <div class="row" style="margin-bottom:16px">
      <label>${t('target')}</label>
      <div class="seg">
        <button class="on" data-mask="1">${t('motor1')}</button>
        <button data-mask="2">${t('motor2')}</button>
        <button data-mask="3">${t('both')}</button>
      </div>
    </div>` + motorModesHTML() + `
    <div class="row" style="margin-top:14px">
      <button class="btn danger" data-stop style="flex:1">${t('emergencyStopBoth')}</button>
      <button class="btn ghost" data-reset>${t('resetPosition')}</button>
    </div>`,
  wire(d, el){
    d.selectedMask = MotorBits.Left;
    el.querySelectorAll('[data-mask]').forEach(b => {
      b.onclick = () => {
        el.querySelectorAll('[data-mask]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        d.selectedMask = Number(b.dataset.mask);
        jogStop(d);
        log(d, 'hedef: ' + maskName(d.selectedMask));
      };
    });
    wireMotorModes(d, el, () => d.selectedMask);
    $(el, '[data-stop]').onclick  = () => emergencyStop(d);
    $(el, '[data-reset]').onclick = () => {
      send(d, M.resetPosition(d.selectedMask, 0));
      log(d, maskName(d.selectedMask) + ' kümülatif konumu sıfırlandı');
    };
  },
  stateText(d){
    const m1 = d.state.motors[MotorBits.Left], m2 = d.state.motors[MotorBits.Right];
    if(!m1 && !m2) return t('waiting');
    const running = [m1, m2].some(m => m && m.motorState === 1);
    return running ? t('running') : t('ready');
  },
  paint(d, el){
    const m1 = d.state.motors[MotorBits.Left], m2 = d.state.motors[MotorBits.Right];
    if(m1){
      paintMotor(el, m1, '[data-m="1"] ');
      setText(el, '.v-pos1', m1.position + '°');
      setText(el, '.v-st1',  MotorStateName[m1.motorState] || m1.motorState);
    }
    if(m2){
      paintMotor(el, m2, '[data-m="2"] ');
      setText(el, '.v-pos2', m2.position + '°');
      setText(el, '.v-st2',  MotorStateName[m2.motorState] || m2.motorState);
    }
  }
},

/* ── RENK SENSÖRÜ ──────────────────────────────────────────────────────── */
color_sensor: {
  gauge: () => `
    <div class="swatch"><span>?</span></div>
    <div class="colorname">${t('colorNoReading')}</div>
    ${commonStatsHTML(`
      <div><span>${t('reflection')}</span><b class="v-refl">–</b></div>
      <div><span>${t('hue')}</span><b class="v-hue">–</b></div>
      <div><span>${t('saturation')}</span><b class="v-sat">–</b></div>
      <div><span>${t('brightness')}</span><b class="v-val">–</b></div>`)}`,
  panel: () => `
    <p class="hint">${t('colorSensorHint')}</p>

    <div class="rgbrow">
      <div class="rgbbar"><span>R</span><div class="track"><i class="bar-r"></i></div><b class="v-r">–</b></div>
      <div class="rgbbar"><span>G</span><div class="track"><i class="bar-g"></i></div><b class="v-g">–</b></div>
      <div class="rgbbar"><span>B</span><div class="track"><i class="bar-b"></i></div><b class="v-b">–</b></div>
    </div>

    <div class="sep"></div>
    <p class="hint">${t('sensorLight')}</p>
    <div class="row">
      <select class="ledcolor"></select>
      <select class="ledpattern"></select>
      <input type="range" class="ledint" value="100" min="0" max="100" step="5" style="min-width:110px">
      <button class="btn" data-led>${t('btnApply')}</button>
    </div>`,
  wire(d, el){
    const cs = $(el, '.ledcolor');
    for(const [name, v] of Object.entries(LegoColor)){
      const o = document.createElement('option');
      o.value = v; o.textContent = LegoColorName[v] || name;
      cs.appendChild(o);
    }
    cs.value = LegoColor.Green;
    const ps = $(el, '.ledpattern');
    for(const [name, v] of Object.entries(LightPattern)){
      const o = document.createElement('option');
      o.value = v; o.textContent = LightPatternName[v] || name;
      ps.appendChild(o);
    }
    $(el, '[data-led]').onclick = () => {
      const c = Number(cs.value), pat = Number(ps.value), int = Number($(el, '.ledint').value);
      send(d, M.lightColor(c, pat, int));
      log(d, `ışık: ${LegoColorName[c]} / ${LightPatternName[pat]} / %${int}`);
    };
  },
  stateText(d){
    const c = d.state.color;
    return c ? (LegoColorName[c.color] || t('colorUnknown')) : t('colorNoReading');
  },
  paint(d, el){
    const c = d.state.color;
    if(!c) return;
    const name = LegoColorName[c.color] || t('colorUnknown');
    const css  = LegoColorCss[c.color] || 'transparent';
    const sw = $(el, '.swatch');
    if(sw){
      sw.style.background = css;
      sw.style.borderColor = c.color === LegoColor.None ? 'var(--line)' : css;
      sw.querySelector('span').textContent = c.color === LegoColor.None ? '?' : '';
    }
    setText(el, '.colorname', name);
    setText(el, '.v-refl', c.reflection + '%');
    setText(el, '.v-hue',  c.hue);
    setText(el, '.v-sat',  c.saturation);
    setText(el, '.v-val',  c.value);

    // ham RGB — ölçek cihaza göre değişebildiği için en büyük bileşene göre normalize
    const peak = Math.max(c.rawRed, c.rawGreen, c.rawBlue, 1);
    const put = (barSel, valSel, raw) => {
      const b = $(el, barSel); if(b) b.style.width = (raw / peak * 100) + '%';
      setText(el, valSel, raw);
    };
    put('.bar-r', '.v-r', c.rawRed);
    put('.bar-g', '.v-g', c.rawGreen);
    put('.bar-b', '.v-b', c.rawBlue);
  }
},

/* ── CONTROLLER ────────────────────────────────────────────────────────── */
controller: {
  gauge: () => `
    <div class="levers">
      <div class="lever" data-l="L"><div class="lv-track"><i></i></div><span>${t('left')}</span></div>
      <div class="lever" data-l="R"><div class="lv-track"><i></i></div><span>${t('right')}</span></div>
    </div>
    ${commonStatsHTML(`
      <div><span>${t('left')}</span><b class="v-lp">–</b></div>
      <div><span>${t('right')}</span><b class="v-rp">–</b></div>
      <div><span>${t('left')} ${t('posLabel').toLowerCase()}</span><b class="v-la">–</b></div>
      <div><span>${t('right')} ${t('posLabel').toLowerCase()}</span><b class="v-ra">–</b></div>
      <div><span>${t('left')} ${t('status').toLowerCase()}</span><b class="v-ls">–</b></div>
      <div><span>${t('right')} ${t('status').toLowerCase()}</span><b class="v-rs">–</b></div>`)}`,
  panel: () => `
    <p class="hint">${t('controllerHint')}</p>
    <div class="bigval">
      <div><b class="v-lp2">0</b><span>${t('leftLever')}</span><i class="lvst v-ls2">${t('middle')}</i></div>
      <div><b class="v-rp2">0</b><span>${t('rightLever')}</span><i class="lvst v-rs2">${t('middle')}</i></div>
    </div>
    <p class="hint" style="margin-top:12px">${t('controllerThreshHint')}</p>
    <div class="row" style="margin-top:8px">
      <label>${t('button')}</label><b class="v-btn" style="font:600 13px ui-monospace,monospace">–</b>
    </div>`,
  wire(){},
  stateText(d){
    const c = d.state.controller && controllerView(d.state.controller);
    if(!c) return t('waiting');
    const act = [];
    if(c.leftState  !== 'MIDDLE') act.push(t('left').toLowerCase() + ' ' + LeverStateName[c.leftState]);
    if(c.rightState !== 'MIDDLE') act.push(t('right').toLowerCase() + ' ' + LeverStateName[c.rightState]);
    return act.length ? act.join(', ') : t('leversReleased');
  },
  paint(d, el){
    const c = d.state.controller && controllerView(d.state.controller);
    if(c){
      const put = (sel, pct) => {
        const i = el.querySelector(sel + ' .lv-track i');
        if(!i) return;
        // -100..100 → çubuğun ortasından yukarı/aşağı
        const h = Math.min(Math.abs(pct), 100) / 2;
        i.style.height = h + '%';
        i.style.top    = pct >= 0 ? (50 - h) + '%' : '50%';
        i.style.background = pct >= 0 ? 'var(--ok)' : 'var(--accent)';
      };
      put('[data-l="L"]', c.leftPercent);
      put('[data-l="R"]', c.rightPercent);
      setText(el, '.v-lp',  c.leftPercent + '%');
      setText(el, '.v-rp',  c.rightPercent + '%');
      setText(el, '.v-la',  c.leftAngle.toFixed(1) + '°');
      setText(el, '.v-ra',  c.rightAngle.toFixed(1) + '°');
      setText(el, '.v-lp2', c.leftPercent);
      setText(el, '.v-rp2', c.rightPercent);
      setText(el, '.v-ls',  LeverStateName[c.leftState]);
      setText(el, '.v-rs',  LeverStateName[c.rightState]);

      const badge = (sel, st) => {
        const e = el.querySelector(sel);
        if(!e) return;
        e.textContent = LeverStateName[st];
        e.dataset.st = st;
      };
      badge('.v-ls2', c.leftState);
      badge('.v-rs2', c.rightState);
    }
    if(d.state.button) setText(el, '.v-btn', ButtonStateName[d.state.button.state] || '–');
  }
}

};
