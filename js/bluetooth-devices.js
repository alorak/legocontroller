/* ══════════════════════════════════════════════════════════════════════════
   Bağlantı
   ══════════════════════════════════════════════════════════════════════════ */
const DEVICE_TYPES = [
  {key:'controller',       label:'Controller',        img:'https://blockcode.alorak.com/img/controller.png',        hw:3,    ready:true },
  {key:'single_motor',     label:'Single Motor',      img:'https://blockcode.alorak.com/img/single-motor.png',      hw:0,    ready:true },
  {key:'double_motor',     label:'Double Motor',      img:'https://blockcode.alorak.com/img/double-motor.png',      hw:1,    ready:true },
  {key:'color_sensor',     label:'Color Sensor',      img:'https://blockcode.alorak.com/img/color-sensor.png',      hw:2,    ready:true },
  {key:'spike_essential',  label:'Essential Hub',     img:'https://blockcode.alorak.com/img/essential-hub.png',     hw:0x83, ready:true, lwp3:true},
  {key:'spike_prime',      label:'Prime Hub',         img:'https://blockcode.alorak.com/img/prime-hub.png',         hw:0x01, ready:true, lwp3:true},
  {key:'technic_hub',      label:'Technic Hub',       img:'https://blockcode.alorak.com/img/technic-hub.png',       hw:0x80, ready:true, lwp3:true},
  {key:'city_hub',         label:'City Hub',          img:'https://blockcode.alorak.com/img/city-hub.png',          hw:0x41, ready:true, lwp3:true},
  {key:'boost_move_hub',   label:'Boost Move Hub',    img:'https://blockcode.alorak.com/img/boost-hub.png',         hw:0x40, ready:true, lwp3:true},
  {key:'remote_controller',label:'Remote Controller', img:'https://blockcode.alorak.com/img/remote_controller_icon.png', hw:0x42, ready:true, lwp3:true}
];

/* LEGO BLE advertisement filters.
   BlockCode ile aynı model kullanılır:
   - LEGO Company ID: 0x0397
   - manufacturer data'nın ilk byte'ı: device type
   - service ve manufacturer filtreleri AYRI entries olarak verilir; Web Bluetooth
     filters dizisindeki entries OR mantığıyla değerlendirilir.
   Bu sayede cihaz service UUID'yi reklam etmese bile manufacturer data ile,
   manufacturer data eksikse de LEGO service UUID ile listede görünebilir. */
const LEGO_COMPANY_ID = 0x0397;

function legoManufacturerFilter(hw){
  return {
    manufacturerData:[{
      companyIdentifier: LEGO_COMPANY_ID,
      dataPrefix: Uint8Array.of(hw)
    }]
  };
}

function legoCompanyFilter(){
  return {
    manufacturerData:[{
      companyIdentifier: LEGO_COMPANY_ID
    }]
  };
}

function hubFiltersFor(type){
  return [
    { services:[LWP3_SVC] },
    legoManufacturerFilter(type.hw),
    // Bazı eski LEGO firmware'leri servis UUID'sini veya beklenen type byte'ını
    // reklam paketinde tutarlı vermiyor. Son fallback yalnızca LEGO üreticisini
    // gösterir; mouse/klavye/kulaklık gibi cihazları listeye sokmaz.
    legoCompanyFilter()
  ];
}

function filtersFor(hw){
  return [
    { services:[SVC] },
    legoManufacturerFilter(hw),
    // FD02/type eşleşmesi kaçırılırsa yalnızca LEGO manufacturer reklamlarını göster.
    legoCompanyFilter()
  ];
}

async function requestBluetoothDevice(type){
  return navigator.bluetooth.requestDevice({
    filters: type.lwp3 ? hubFiltersFor(type) : filtersFor(type.hw),
    optionalServices: [SVC, LWP3_SVC]
  });
}

function deviceTypeLabel(dt){
  if(!dt) return '';
  const key = typeof dt === 'string' ? dt : dt.key;
  return t('dev_' + key) || (typeof dt === 'object' ? dt.label : key);
}

function buildPicker(){
  const g = document.getElementById('devGrid');
  if(!g) return;
  g.innerHTML = '';
  for(const dt of DEVICE_TYPES){
    const b = document.createElement('button');
    b.className = 'dev ' + (dt.ready ? 'ready' : 'soon');
    b.dataset.soon = t('soon');
    b.innerHTML = `<img src="${dt.img}" alt=""><span>${deviceTypeLabel(dt)}</span>`;
    if(dt.ready) b.onclick = () => connect(dt); else b.disabled = true;
    g.appendChild(b);
  }
}
const openPicker  = () => document.getElementById('picker').classList.add('on');
const closePicker = () => document.getElementById('picker').classList.remove('on');

const isMotorType = key => key === 'single_motor' || key === 'double_motor';

/* InfoResponse'taki productGroupDevice → bizim cihaz tipi anahtarımız.
   Cihazın KENDİ bildirdiği kimlik budur; seçim ekranında ne tıklandığı değil. */
const PRODUCT_TO_TYPE = { 512:'single_motor', 513:'double_motor',
                          514:'color_sensor', 515:'controller' };

/** Cihaz gerçekte ne olduğunu söyleyince kartı/satırı ona göre düzelt. */
function reconcileDeviceType(d, info){
  const realKey = PRODUCT_TO_TYPE[info.productCode];
  if(!realKey) return;
  const realType = DEVICE_TYPES.find(t => t.key === realKey);
  if(!realType) return;

  // Reklam adı yoksa isim seçim ekranındaki etikete düşüyordu; gerçek ürün adını kullan.
  const wasFallback = !d.device.name;
  const typeChanged = d.type !== realKey;
  if(!typeChanged && !wasFallback) return;

  const pickedLabel = d.typeInfo.label;
  d.type = realKey;
  d.typeInfo = realType;
  if(wasFallback) d.name = realType.label;

  // liste satırını ve kartı yerinde yenile (sıra bozulmasın)
  const wasSelected = selectedId === d.id;
  const oldItem = d.item, oldCard = d.el;
  renderListItem(d, realType, oldItem);
  renderCard(d, realType, oldCard);
  if(wasSelected) selectDevice(d.id);
  paint(d);

  // uyarıyı kart yenilendikten SONRA yaz, yoksa yeni log kutusunda görünmez
  if(typeChanged){
    log(d, `⚠ Seçim ekranında "${pickedLabel}" tıklanmıştı; cihaz kendini ` +
           `"${realType.label}" olarak tanıttı — panel buna göre düzeltildi.`, 'e');
  }

  // bu cihaza bağlı widget kayıtlarındaki tip/ad bilgisini de tazele
  let touched = false;
  for(const pan of pano.panolar) for(const w of pan.widgets){
    if(w.deviceId !== d.id) continue;
    if(w.deviceType !== d.type || w.deviceName !== d.name){
      w.deviceType = d.type; w.deviceName = d.name; touched = true;
    }
  }
  if(touched) panoSave();
  if(currentView === 'pano') renderPano(); else paintPano();
}

async function connect(type){
  closePicker();
  if(!navigator.bluetooth){
    alert('Tarayıcınız Web Bluetooth desteklemiyor.\nChrome, Edge veya Opera kullanın.');
    return;
  }
  try{
    const isHub = !!type.lwp3;
    let hubProto = null;               // 'lwp3' | 'spike3'
    const device = await requestBluetoothDevice(type);

    // 1. Aynı device.id'ye sahip mevcut kayıt var mı?
    let existing = devices.get(device.id);

    // 2. Yoksa: Listede aynı tipte olup şu anda bağlantısı KESİLMİŞ olan cihaz var mı?
    if(!existing){
      const disconnectedSameType = [...devices.values()].filter(x =>
        x.type === type.key && (!x.device || !x.device.gatt || !x.device.gatt.connected)
      );
      if(disconnectedSameType.length === 1){
        existing = disconnectedSameType[0];
      }else if(disconnectedSameType.length > 1){
        const nameMatch = disconnectedSameType.find(x => x.name === (device.name || type.label));
        existing = nameMatch || disconnectedSameType[0];
      }
    }

    // 3. Eğer bulunan cihaz zaten aktif olarak bağlıysa uyar
    if(existing && existing.device && existing.device.gatt && existing.device.gatt.connected){
      alert(t('deviceAlreadyConnected'));
      return;
    }

    const server = await device.gatt.connect();
    let service, char, notif;

    // Hub'ın gerçekte hangi servisleri sunduğunu kayda geç
    let servisListesi = [];
    if(isHub){
      try{
        const hepsi = await server.getPrimaryServices();
        servisListesi = hepsi.map(x => x.uuid);
      }catch(e){ servisListesi = ['(servisler listelenemedi: ' + e.message + ')']; }
    }

    if(isHub){
      try{
        service = await server.getPrimaryService(LWP3_SVC);
        char = notif = await service.getCharacteristic(LWP3_CHAR);
        hubProto = 'lwp3';
      }catch(e){
        if(type.key === 'remote_controller'){
          try{ device.gatt.disconnect(); }catch(e2){}
          const msg = currentLang === 'tr'
            ? 'Seçilen cihaz LEGO Powered Up Remote Controller 88010 değil veya LWP3 (1623) servisini sunmuyor.'
            : 'The selected device is not a LEGO Powered Up Remote Controller 88010, or it does not expose the LWP3 (1623) service.';
          alert(msg);
          return;
        }
        try{
          service = await server.getPrimaryService(SVC);
          char    = await service.getCharacteristic(CHAR_DATA);
          notif   = await service.getCharacteristic(CHAR_NOTIF);
          hubProto = 'spike3';
        }catch(e2){
          try{ device.gatt.disconnect(); }catch(e3){}
          alert(`${type.label} bağlandı ama beklenen servislerin hiçbiri bulunamadı ` +
                `(ne 1623 ne fd02). Hub'ı kapatıp açmayı deneyin.`);
          return;
        }
      }
    }else{
      service = await server.getPrimaryService(SVC);
      char    = await service.getCharacteristic(CHAR_DATA);
      notif   = await service.getCharacteristic(CHAR_NOTIF);
    }

    const isReconnecting = !!existing;
    let oldLogHTML = '';

    // Eğer eski bir kopmuş kayıt varsa, çift kart oluşmaması için eski DOM'u kaldır ve widget'ları bağla
    if(existing){
      if(existing.logEl) oldLogHTML = existing.logEl.innerHTML;
      if(existing.el) existing.el.remove();
      if(existing.item) existing.item.remove();
      if(existing.logEl) existing.logEl.remove();
      if(existing.slotEls) Object.values(existing.slotEls).forEach(e => e.remove());
      if(existing.slotItems) Object.values(existing.slotItems).forEach(e => e.remove());

      if(existing.id !== device.id){
        devices.delete(existing.id);
        // Pano widget'larındaki cihaz referansını yeni ID'ye güncelle
        let touched = false;
        for(const pan of pano.panolar){
          for(const w of pan.widgets){
            if(w.deviceId === existing.id){
              w.deviceId = device.id;
              w.deviceName = device.name || type.label;
              touched = true;
            }
          }
        }
        if(touched) panoSave();
      }
    }

    const d = {
      id: device.id, name: device.name || type.label, type: type.key, typeInfo: type,
      device, server, char, notif,
      masks: [], selectedMask: MotorBits.Left, speed: 50, jogging: false, rawLog: false,
      state:{ battery:null, usbPower:null, motors:{}, color:null, controller:null, button:null },
      txQueue: Promise.resolve()
    };
    devices.set(d.id, d);
    if(isHub) buildHub(d, type);
    else { renderListItem(d, type); renderCard(d, type); }
    if(oldLogHTML && d.logEl){
      d.logEl.innerHTML = oldLogHTML;
    }
    refreshShell();
    selectTarget(d.id);
    device.addEventListener('gattserverdisconnected', () => onDisconnect(d));

    d.hubProto = hubProto;
    if(isHub){
      log(d, 'hub servisleri: ' + servisListesi.join(', '), 'rx');
      const lwp3Var = servisListesi.some(u => u.includes('1623'));
      log(d, lwp3Var
        ? '→ LWP3 (1623) mevcut: motor doğrudan sürülebilir'
        : '→ LWP3 (1623) YOK, yalnızca fd02: bu firmware motor komutu kabul etmiyor',
        lwp3Var ? 'g' : 'e');
    }

    notif.addEventListener('characteristicvaluechanged',
      ev => hubProto === 'lwp3'   ? onHubNotify(d, ev)
          : hubProto === 'spike3' ? onSpike3Notify(d, ev)
          :                         onNotify(d, ev));
    await notif.startNotifications();
    log(d, isReconnecting ? t('reconnected', { name: d.name }) : (t('ready') + ': ' + d.name), 'g');
    if(hubProto === 'lwp3'){
      // Hub bağlanınca takılı cihazları kendiliğinden bildirir;
      // bizim istememiz gereken sadece ad ve pil.
      await send(d, HUB_CMD.propRequest(LWP3_PROP.NAME));
      await send(d, HUB_CMD.propRequest(LWP3_PROP.BATTERY));
      await send(d, HUB_CMD.propSubscribe(LWP3_PROP.BATTERY));
      setText(d.el, '.fw', `${type.label} · LWP3`);
      if(type.key === 'remote_controller'){
        // Remote Controller: subscribe to button ports 0 (L) and 1 (R)
        await sleep(300);
        await send(d, new Uint8Array([0x0A,0x00,0x41,0x00,0x00,0x01,0x00,0x00,0x00,0x01]));
        await send(d, new Uint8Array([0x0A,0x00,0x41,0x01,0x00,0x01,0x00,0x00,0x00,0x01]));
        // Yeşil düğme port değil, hub özelliği — ayrıca abone olunmalı
        await send(d, HUB_CMD.propSubscribe(LWP3_PROP.BUTTON));
        // Wire LED picker after card is rendered
        setTimeout(() => wireRemoteLedPicker(d), 100);
        log(d, `🎮 ${type.label} hazır — butonları dinleniyor`, 'g');
      } else {
        log(d, `${type.label} hazır (LWP3) — ${d.slotCount} slot`, 'g');
      }
    }else if(hubProto === 'spike3'){
      // SPIKE App 3: tek istek yeterli, hub 100 ms'de bir her portu yolluyor
      await send(d, S3_CMD.infoRequest());
      await sleep(150);
      await send(d, S3_CMD.hubName());
      await sleep(150);
      await send(d, S3_CMD.deviceUuid());
      await sleep(150);
      await send(d, S3_CMD.notifyRequest(100));

      // Bazı firmware'ler ilk isteği yutuyor; 1 sn sonra bir kez daha iste
      // ve hâlâ bildirim yoksa kullanıcıya nedenini söyle.
      setTimeout(async () => {
        if(!d.device.gatt.connected) return;
        if(!d.s3Frames){
          await send(d, S3_CMD.notifyRequest(100));
          setTimeout(() => {
            if(d.device.gatt.connected && !d.s3Frames)
              log(d, '⚠ Hub bildirim göndermiyor. RAW paket logunu açıp ' +
                     'gelen baytları paylaşırsanız bakılabilir.', 'e');
          }, 2000);
        }
      }, 1000);
      setText(d.el, '.fw', `${type.label} · SPIKE App 3`);
      const pb = $(d.el, '.progbox');
      if(pb) pb.style.display = '';
      log(d, `${type.label} hazır (SPIKE App 3) — ${d.slotCount} slot`, 'g');
    }else{
      await send(d, M.infoRequest());              // firmware / ürün bilgisi
      await send(d, M.notifyRequest(100));         // 100 ms'de bir durum akışı
      if(isMotorType(type.key)){
        await send(d, M.setAcceleration(MotorBits.Both, 100, 100));
        await send(d, M.setEndState(MotorBits.Both, MotorEndState.Brake));
      }
      log(d, 'durum akışı açıldı (100 ms)', 'g');
    }

  }catch(e){
    // NotFoundError = kullanıcı listeyi kapattı ya da eşleşen cihaz çıkmadı
    if(e.name === 'NotFoundError') return;
    console.error('Bağlantı hatası:', e);
    alert(`Bağlantı hatası (${e.name}): ${e.message}`);
  }
}

function onDisconnect(d){
  const dot = d.el ? d.el.querySelector('.dot') : null;
  if(dot) dot.classList.add('off');
  setText(d.el, '.state', t('disconnected'));
  if(d.item){
    const idot = d.item.querySelector('.dot');
    if(idot) idot.classList.add('off');
    setText(d.item, '.i-state', t('disconnected'));
  }
  setDeviceConnectedUI(d, false);

  d.jogging = false;
  d.rxBuf = null;
  log(d, t('disconnected'), 'e');
  paintPano();
}

async function quickReconnect(d){
  if(!d || !d.device || !d.typeInfo) return;
  const recBtn = d.el ? d.el.querySelector('[data-act=reconnect]') : null;
  if(recBtn) recBtn.disabled = true;
  if(d.item) setText(d.item, '.i-state', t('connecting'));
  if(d.el) setText(d.el, '.state', t('connecting'));
  log(d, t('connecting'), 'rx');

  try{
    const server = await d.device.gatt.connect();
    d.server = server;
    let service, char, notif;

    if(isHubType(d.type)){
      if(d.hubProto === 'lwp3'){
        service = await server.getPrimaryService(LWP3_SVC);
        char = notif = await service.getCharacteristic(LWP3_CHAR);
      }else{
        service = await server.getPrimaryService(SVC);
        char    = await service.getCharacteristic(CHAR_DATA);
        notif   = await service.getCharacteristic(CHAR_NOTIF);
      }
    }else{
      service = await server.getPrimaryService(SVC);
      char    = await service.getCharacteristic(CHAR_DATA);
      notif   = await service.getCharacteristic(CHAR_NOTIF);
    }
    d.char = char;
    d.notif = notif;

    notif.addEventListener('characteristicvaluechanged',
      ev => d.hubProto === 'lwp3'   ? onHubNotify(d, ev)
          : d.hubProto === 'spike3' ? onSpike3Notify(d, ev)
          :                           onNotify(d, ev));
    await notif.startNotifications();

    if(d.hubProto === 'lwp3'){
      await send(d, HUB_CMD.propRequest(LWP3_PROP.NAME));
      await send(d, HUB_CMD.propRequest(LWP3_PROP.BATTERY));
      await send(d, HUB_CMD.propSubscribe(LWP3_PROP.BATTERY));
      if(d.type === 'remote_controller'){
        await sleep(300);
        await send(d, new Uint8Array([0x0A,0x00,0x41,0x00,0x00,0x01,0x00,0x00,0x00,0x01]));
        await send(d, new Uint8Array([0x0A,0x00,0x41,0x01,0x00,0x01,0x00,0x00,0x00,0x01]));
        // Yeşil düğme port değil, hub özelliği — ayrıca abone olunmalı
        await send(d, HUB_CMD.propSubscribe(LWP3_PROP.BUTTON));
        setTimeout(() => wireRemoteLedPicker(d), 100);
      }
    }else if(d.hubProto === 'spike3'){
      await send(d, S3_CMD.infoRequest());
      await sleep(150);
      await send(d, S3_CMD.notifyRequest(100));
    }else{
      await send(d, M.infoRequest());
      await send(d, M.notifyRequest(100));
    }

    const dot = d.el ? d.el.querySelector('.dot') : null;
    if(dot) dot.classList.remove('off');
    if(d.item){
      const idot = d.item.querySelector('.dot');
      if(idot) idot.classList.remove('off');
      setText(d.item, '.i-state', t('ready'));
    }
    setText(d.el, '.state', t('ready'));
    setDeviceConnectedUI(d, true);
    log(d, t('reconnected', { name: d.name }), 'g');
    paintPano();
  }catch(err){
    console.warn('Quick reconnect failed, opening picker:', err);
    setDeviceConnectedUI(d, false);
    if(d.item) setText(d.item, '.i-state', t('disconnected'));
    if(d.el) setText(d.el, '.state', t('disconnected'));
    connect(d.typeInfo);
  }
}

function disconnect(id){
  const d = devices.get(id);
  if(!d) return;
  try{
    if(d.device.gatt.connected){
      if(isMotorType(d.type) && !isHubType(d.type))
        d.char.writeValueWithoutResponse(M.stop(MotorBits.Both)).catch(()=>{});
      d.device.gatt.disconnect();
    }
  }catch(e){}
  d.el.remove();
  if(d.item)  d.item.remove();
  if(d.logEl) d.logEl.remove();
  if(d.slotEls)   Object.values(d.slotEls).forEach(e => e.remove());
  if(d.slotItems) Object.values(d.slotItems).forEach(e => e.remove());
  devices.delete(id);
  refreshShell();
  paintPano();
}

/* ══════════════════════════════════════════════════════════════════════════
   Liste + kart iskeleti
   ══════════════════════════════════════════════════════════════════════════ */
function renderListItem(d, type, replaceEl){
  const b = document.createElement('button');
  b.className = 'devitem';
  b.dataset.id = d.id;
  b.innerHTML = `
    <img src="${type.img}" alt="">
    <div class="txt">
      <div class="t1">${d.name}</div>
      <div class="t2"><span class="dot"></span><span class="i-state">${t('connecting')}</span></div>
    </div>
    <span class="i-bat">–</span>
    <span class="i-arrow">›</span>`;
  b.onclick = () => selectTarget(d.id);
  b.dataset.key = d.id;
  d.item = b;
  if(replaceEl) replaceEl.replaceWith(b);
  else document.getElementById('deviceList').appendChild(b);
}

/* Seçilebilir hedef: bir cihaz ("M1") ya da hub slotu ("M1#2").
   Kart ve liste satırları data-key taşır; eşleşen görünür. */
function selectTarget(key){
  selectedId = key;
  const devId = String(key).split('#')[0];
  document.querySelectorAll('#devices .card').forEach(el =>
    el.classList.toggle('on', el.dataset.key === key));
  document.querySelectorAll('#deviceList .devitem').forEach(el =>
    el.classList.toggle('on', el.dataset.key === key));
  document.querySelectorAll('.hub-port-pill[data-hport]').forEach(el => {
    const card = el.closest('.card');
    el.classList.toggle('active', !!(card && card.dataset.key && key === `${card.dataset.key}#${el.dataset.hport}`));
  });
  // log paneli cihaz bazında — slot seçiliyken hub'ın logu görünür
  devices.forEach(d => { if(d.logEl) d.logEl.classList.toggle('on', d.id === devId); });
}
function selectDevice(key){ selectTarget(key); }   // eski çağrılar için

function refreshShell(){
  const has = devices.size > 0;
  document.getElementById('empty').style.display     = has ? 'none' : '';
  document.getElementById('workspace').style.display = has ? '' : 'none';
  if(!has) selectedId = null;
  else if(!devices.has(String(selectedId).split('#')[0]))
    selectTarget(devices.keys().next().value);
}

function renderCard(d, type, replaceEl){
  const p = PANELS[d.type];
  const el = document.createElement('div');
  el.className = 'card';
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
      <div class="gauge">${p.gauge(d)}</div>
      <div class="panel">
        ${p.panel(d)}
      </div>
    </div>`;
  d.el = el;
  el.dataset.key = d.id;
  if(replaceEl) replaceEl.replaceWith(el);
  else document.getElementById('devices').appendChild(el);

  // Kayıt kutusu kartın içinde değil, sağdaki dikey panelde durur.
  // Her cihazın kendi kutusu var; sadece seçili olan görünür.
  if(!d.logEl){
    d.logEl = document.createElement('div');
    d.logEl.className = 'log';
    d.logEl.dataset.id = d.id;
    document.getElementById('logPanel').appendChild(d.logEl);
  }

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

  p.wire(d, el);
  paint(d);
}

/* jog bırakmayı kaçırmamak için güvenlik ağı */
window.addEventListener('pointerup', () => devices.forEach(jogStop));
window.addEventListener('blur',      () => devices.forEach(jogStop));
window.addEventListener('beforeunload', () => devices.forEach(d => {
  try{ if(d.device.gatt.connected) d.device.gatt.disconnect(); }catch(e){}
}));
