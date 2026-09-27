/* ══════════════════════════════════════════════════════════════════════════
   SPIKE App 3 protokolü — fd02 servisi üzerinden çalışan yeni hub firmware'i
   ──────────────────────────────────────────────────────────────────────────
   Bazı SPIKE Prime/Essential firmware'leri LWP3 (1623) yerine bunu kullanıyor.
   Çerçeveleme: COBS kodla → tüm baytları 0x03 ile XOR'la → sonuna 0x02 ekle.
   ══════════════════════════════════════════════════════════════════════════ */
const S3_DELIMITER = 0x02;   // çerçeve sonu
const S3_PRIORITY  = 0x01;   // öncelikli mesaj öneki (varsa atlanır)
const S3_NO_DELIM  = 0xFF;   // blokta sınırlayıcı yok kod sözcüğü
const S3_OFFSET    = 0x02;   // kod sözcüğüne eklenen sabit
const S3_MAX_BLOCK = 84;     // kod sözcüğü dahil azami blok

const S3_MSG = {
  INFO_REQUEST: 0x00, INFO_RESPONSE: 0x01, GET_HUB_NAME: 0x18,
  GET_DEVICE_UUID: 0x1A,
  PROGRAM_FLOW: 0x1E, PROGRAM_FLOW_RESPONSE: 0x1F, PROGRAM_FLOW_NOTIFICATION: 0x20,
  CONSOLE_NOTIFICATION: 0x21,
  DEVICE_NOTIFICATION_REQUEST: 0x28, DEVICE_NOTIFICATION_RESPONSE: 0x29,
  DEVICE_NOTIFICATION: 0x3C
};
/* DeviceNotification içindeki alt mesaj tipleri — LWP3'tekilerle AYNI DEĞİL */
const S3_DEV = { BATTERY:0x00, IMU:0x01, DISPLAY:0x02, MOTOR:0x0A, FORCE:0x0B,
                 COLOR:0x0C, DISTANCE:0x0D, MATRIX:0x0E };
/* Porta bağlı olmayan, hub'ın kendi alt mesajları (port baytı taşımazlar) */
const S3_PORTLESS = new Set([S3_DEV.BATTERY, S3_DEV.IMU, S3_DEV.DISPLAY]);

/* Hangi yüzün yukarı baktığı — LEGO'nun DeviceFace enum'u */
const FACE_NAMES = {
  en: { 0:'top', 1:'front', 2:'right', 3:'bottom', 4:'back', 5:'left' },
  tr: { 0:'üst', 1:'ön', 2:'sağ', 3:'alt', 4:'arka', 5:'sol' }
};
const FACE_DESCS = {
  en: { 0:'flat', 1:'tilted front', 2:'tilted right', 3:'upside down', 4:'tilted back', 5:'tilted left' },
  tr: { 0:'düz duruyor', 1:'öne yatık', 2:'sağa yatık', 3:'ters duruyor', 4:'arkaya yatık', 5:'sola yatık' }
};
const FACE_NAME = new Proxy({}, {
  get: (_, prop) => (FACE_NAMES[currentLang] && FACE_NAMES[currentLang][prop]) ||
                    FACE_NAMES.en[prop] || String(prop)
});
const FACE_DESC = new Proxy({}, {
  get: (_, prop) => (FACE_DESCS[currentLang] && FACE_DESCS[currentLang][prop]) ||
                    FACE_DESCS.en[prop] || '–'
});
/* Alt mesaj uzunlukları — KESİN DEĞİL.
   index.html'in PCAP'ten çıkardığı boyutlarla LEGO'nun kendi bundle'ındaki
   boyutlar her tipte farklı çıkıyor (ör. motor 12 mi 13 mü, imu 20 mi 21 mi),
   üstelik hub'ın mesajlarında fazladan bir "port" baytı var. Tek bir yanlış
   boyut tüm yürüyüşü kaydırıyor ve hiçbir port algılanmıyor.
   Çözüm: DeviceNotification başlığındaki payloadSize'ı sağlama olarak kullanıp
   aday boyut tablolarını deneyip tutanı kilitliyoruz. */
const S3_SIZE_CANDIDATES = {
  0x00:[2,3],        // pil
  0x01:[21,20],      // IMU — gerçek cihazda 21 çıktı
  0x02:[26],         // hub'ın 5x5 ekranı: tip + 25 piksel
  0x0A:[12,13,14],   // motor
  0x0B:[4,5],        // kuvvet sensörü
  0x0C:[9,10,13],    // renk sensörü
  0x0D:[4,5],        // mesafe sensörü
  0x0E:[11,12]       // 3x3 renk matrisi
};

let _s3Combos = null;
function s3SizeCombos(){
  if(_s3Combos) return _s3Combos;
  const tipler = Object.keys(S3_SIZE_CANDIDATES).map(Number);
  let liste = [{}];
  for(const t of tipler){
    const yeni = [];
    for(const kısmi of liste)
      for(const boyut of S3_SIZE_CANDIDATES[t]) yeni.push({ ...kısmi, [t]: boyut });
    liste = yeni;
  }
  return (_s3Combos = liste);
}

/** Verilen boyut tablosuyla yük baştan sona tam olarak yürünüyor mu? */
function s3WalkOk(payload, sizes, slotCount){
  let off = 0, cihazVar = false;
  const portlar = new Set();
  const hubTipleri = new Set();   // portsuz tipler — her biri en fazla bir kez
  while(off < payload.length){
    const t = payload[off];
    const size = sizes[t];
    if(size === undefined || off + size > payload.length) return false;
    if(S3_PORTLESS.has(t)){
      // Aynı hub alt mesajı bir bildirimde iki kez gelmez.
      // (Pil + IMU + ekran birlikte gelebilir; sayaç tip BAŞINA tutulmalı.)
      if(hubTipleri.has(t)) return false;
      hubTipleri.add(t);
      if(t === S3_DEV.BATTERY && payload[off + 1] > 100) return false;
    }else{
      const port = payload[off + 1];
      if(port >= slotCount) return false;      // geçersiz port → yanlış hizalama
      if(portlar.has(port)) return false;       // aynı port iki kez olamaz
      portlar.add(port);
      cihazVar = true;
    }
    off += size;
  }
  return off === payload.length ? { cihazVar } : false;
}

/** Yükü çözebilecek boyut tablosunu bul (yoksa null). */
function s3DetectSizes(payload, slotCount){
  for(const sizes of s3SizeCombos()){
    const r = s3WalkOk(payload, sizes, slotCount);
    if(r) return sizes;
  }
  return null;
}
const S3_DEV_KIND = { 0x0A:'motor', 0x0B:'force', 0x0C:'color',
                      0x0D:'distance', 0x0E:'matrix' };

function s3CobsEncode(data){
  const out = []; let codeIndex = 0, block = 1;
  out.push(S3_NO_DELIM);
  for(let i = 0; i < data.length; i++){
    const b = data[i];
    if(b > S3_DELIMITER){ out.push(b); block++; }
    if(b <= S3_DELIMITER || block > S3_MAX_BLOCK){
      if(b <= S3_DELIMITER) out[codeIndex] = b * S3_MAX_BLOCK + block + S3_OFFSET;
      codeIndex = out.length; out.push(S3_NO_DELIM); block = 1;
    }
  }
  out[codeIndex] = block + S3_OFFSET;
  return Uint8Array.from(out);
}

function s3CobsDecode(data){
  const out = [];
  const unescape = code => {
    if(code === 0xFF) return { value:null, block:S3_MAX_BLOCK + 1 };
    const adj = code - S3_OFFSET;
    let block = adj % S3_MAX_BLOCK, value = Math.floor(adj / S3_MAX_BLOCK);
    if(block === 0){ block = S3_MAX_BLOCK; value -= 1; }
    return { value, block };
  };
  let { value, block } = unescape(data[0]);
  for(let i = 1; i < data.length; i++){
    block--;
    if(block > 0){ out.push(data[i]); continue; }
    if(value !== null) out.push(value);
    const r = unescape(data[i]); value = r.value; block = r.block;
  }
  return Uint8Array.from(out);
}

/** Mesajı gönderilebilir çerçeveye sarar. */
function s3Pack(data){
  const enc = s3CobsEncode(data);
  const buf = new Uint8Array(enc.length + 1);
  for(let i = 0; i < enc.length; i++) buf[i] = enc[i] ^ 0x03;
  buf[enc.length] = S3_DELIMITER;
  return buf;
}

/** Gelen çerçeveyi açar (öncelik baytı + sınırlayıcı + XOR + COBS). */
function s3Unpack(frame){
  const start = frame[0] === S3_PRIORITY ? 1 : 0;
  const un = new Uint8Array(frame.length - start - 1);
  for(let i = start; i < frame.length - 1; i++) un[i - start] = frame[i] ^ 0x03;
  return s3CobsDecode(un);
}

const S3_CMD = {
  infoRequest:   () => s3Pack(Uint8Array.of(S3_MSG.INFO_REQUEST)),
  hubName:       () => s3Pack(Uint8Array.of(S3_MSG.GET_HUB_NAME)),
  deviceUuid:    () => s3Pack(Uint8Array.of(S3_MSG.GET_DEVICE_UUID)),
  // Slottaki programı başlat / durdur. Programı YÜKLEMİYOR — hub'da hazır
  // olan bir programı çalıştırıyor (ör. SPIKE uygulamasıyla kaydettiğin).
  programFlow:   (dur, slot) => s3Pack(Uint8Array.of(S3_MSG.PROGRAM_FLOW,
                                                     dur ? 1 : 0, slot & 0xFF)),
  notifyRequest: ms => s3Pack(Uint8Array.of(S3_MSG.DEVICE_NOTIFICATION_REQUEST,
                                            ms & 0xFF, (ms >> 8) & 0xFF))
};

/* ── Gelen SPIKE App 3 verisi ─────────────────────────────────────────── */
/* ÖNEMLİ: Bir DeviceNotification kolayca 50-60 bayt ediyor, BLE bildirimi ise
   ~20 baytta bölünüyor. Yani çerçeveler PARÇALI geliyor ve sadece sonuncusu
   0x02 sınırlayıcısıyla bitiyor. Gelen baytları biriktirip 0x02'de bölüyoruz.
   Bu güvenli: COBS'tan çıkan baytlar daima >= 3, XOR 0x03 sonrası hiçbiri 0x02
   olamaz (0x02 için kodlanmış baytın 0x01 olması gerekirdi). */
function onSpike3Notify(d, ev){
  const parca = new Uint8Array(ev.target.value.buffer);
  if(d.rawLog) log(d, '← ' + [...parca].map(b=>b.toString(16).padStart(2,'0')).join(' '), 'rx');

  if(!d.rxBuf) d.rxBuf = [];
  for(const b of parca){
    if(b === S3_DELIMITER){
      if(d.rxBuf.length){
        d.rxBuf.push(b);                       // sınırlayıcıyı da ekle
        handleSpike3Frame(d, Uint8Array.from(d.rxBuf));
      }
      d.rxBuf = [];
    }else{
      d.rxBuf.push(b);
      if(d.rxBuf.length > 600) d.rxBuf = [];   // bozuk akışta sonsuz büyümeyi engelle
    }
  }
}

function handleSpike3Frame(d, frame){
  if(frame.length < 3) return;
  let msg;
  try{ msg = s3Unpack(frame); }catch(e){ return; }
  if(!msg.length) return;

  d.s3Frames = (d.s3Frames || 0) + 1;
  const type = msg[0];

  // Bekleyen bir istek varsa yanıtını ona ver (yükleme akışı bunu kullanıyor)
  if(d.s3Pending && d.s3Pending.has(type)){
    const bekleyen = d.s3Pending.get(type);
    d.s3Pending.delete(type);
    clearTimeout(bekleyen.timer);
    bekleyen.resolve(msg);
    return;
  }

  if(type === S3_MSG.PROGRAM_FLOW_NOTIFICATION && msg.length >= 2){
    log(d, msg[1] ? '▶ hub programı çalışıyor' : '■ hub programı durdu',
        msg[1] ? 'g' : '');
    return;
  }
  if(type === S3_MSG.CONSOLE_NOTIFICATION && msg.length > 1){
    // Programın print() çıktısı
    let t = ''; for(let i = 1; i < msg.length && msg[i]; i++) t += String.fromCharCode(msg[i]);
    if(t.trim()) log(d, '» ' + t.trim(), 'rx');
    return;
  }
  if(type === S3_MSG.PROGRAM_FLOW_RESPONSE){
    log(d, msg[1] === 0 ? '✓ program komutu kabul edildi'
                        : `⚠ program komutu reddedildi (kod ${msg[1]})`,
        msg[1] === 0 ? 'g' : 'e');
    return;
  }

  // Motor komutu yanıtı geldiyse hub bu biçimi kabul ediyor demektir
  if(S3_MOTOR_RESULTS.has(type)){
    if(!d.s3MotorAck){ d.s3MotorAck = true; log(d, '✓ hub motor komutlarını kabul ediyor', 'g'); }
    clearTimeout(d.s3AckTimer);
    return;
  }

  if(type === S3_MSG.INFO_RESPONSE && msg.length >= 9){
    const dv = new DataView(msg.buffer, msg.byteOffset);
    // SPIKE InfoResponse: ... maxPacketSize u16, maxMessageSize u16, maxChunkSize u16
    d.info = { rpc:`${msg[1]}.${msg[2]}.${dv.getUint16(3,true)}`,
               firmware:`${msg[5]}.${msg[6]}.${dv.getUint16(7,true)}` };
    if(msg.length >= 15){
      d.maxPacketSize = dv.getUint16(9,  true);
      d.maxChunkSize  = dv.getUint16(13, true);
      log(d, `azami parça ${d.maxChunkSize} bayt`, 'rx');
    }
    setText(d.el, '.fw', `${d.typeInfo.label} · fw ${d.info.firmware}`);
    log(d, `firmware ${d.info.firmware}`, 'g');
    return;
  }

  if(type !== S3_MSG.DEVICE_NOTIFICATION || msg.length < 3) return;

  // Başlıktaki boyut kadarını al — sonrasında dolgu olabilir
  const bildirilen = msg[1] | (msg[2] << 8);
  const payload = msg.slice(3, 3 + Math.min(bildirilen, msg.length - 3));

  // Boyut tablosu henüz kilitlenmediyse bu yükle kalibre etmeye çalış
  if(!d.s3Sizes){
    const bulunan = s3DetectSizes(payload, d.slotCount);
    if(!bulunan){
      if(!d.s3Warned){
        d.s3Warned = true;
        log(d, '⚠ Bildirim çözülemedi — alt mesaj boyutları tutmuyor. ' +
               'RAW paket logunu açıp aşağıdaki satırları paylaşın.', 'e');
        log(d, 'payload: ' + [...payload].map(b=>b.toString(16).padStart(2,'0')).join(' '), 'rx');
      }
      return;
    }
    d.s3Try = (d.s3Try && JSON.stringify(d.s3Try.s) === JSON.stringify(bulunan))
      ? { s:bulunan, n:d.s3Try.n + 1 } : { s:bulunan, n:1 };
    if(d.s3Try.n >= 3){
      d.s3Sizes = bulunan;
      log(d, 'çözümleme kilitlendi — ' +
             Object.entries(bulunan).map(([t,v]) => `0x${(+t).toString(16)}:${v}`).join(' '), 'g');
    }
  }
  const sizes = d.s3Sizes || (d.s3Try && d.s3Try.s);
  if(!sizes) return;

  const görülen = new Set();
  let off = 0;

  while(off < payload.length){
    const dt = payload[off];
    const size = sizes[dt];
    if(size === undefined || off + size > payload.length) break;
    const dv = new DataView(payload.buffer, payload.byteOffset + off);

    if(dt === S3_DEV.BATTERY){
      const b = payload[off + 1];
      if(b >= 0 && b <= 100) d.state.battery = b;
    }
    else if(dt === S3_DEV.DISPLAY){
      d.display = Array.from(payload.slice(off + 1, off + 26));   // 5x5 parlaklık
    }
    else if(dt === S3_DEV.IMU){
      // Ölçekler LEGO'nun kendi uygulamasından: yaw/-10, pitch/-10, roll/10
      d.imu = {
        upFace:   payload[off + 1],
        yawFace:  payload[off + 2],
        yaw:   dv.getInt16(3,  true) / -10,
        pitch: dv.getInt16(5,  true) / -10,
        roll:  dv.getInt16(7,  true) /  10,
        ax: dv.getInt16(9,  true), ay: dv.getInt16(11, true), az: dv.getInt16(13, true),
        gx: dv.getInt16(15, true), gy: dv.getInt16(17, true), gz: dv.getInt16(19, true)
      };
    }
    else if(!S3_PORTLESS.has(dt)){
      const port = payload[off + 1];
      if(port >= d.slotCount) hubEnsureSlot(d, port);
      if(port < d.slotCount){
        görülen.add(port);
        const kind = S3_DEV_KIND[dt];
        const model = payload[off + 2];
        let p = d.ports[port];
        if(!p || p.kind !== kind || p.model !== model){
          p = d.ports[port] = {
            kind,
            type: dt,
            model,
            value: null,
            get typeName(){ return portTypeName(this); }
          };
          log(d, `⊕ Port ${PORT_LETTERS[port]}: ${portTypeName(p)}`, 'g');
          d.slotsDirty = true;
        }
        if(kind === 'motor'){
          p.value = ((dv.getInt16(3, true) % 360) + 360) % 360;   // mutlak açı
          p.power = dv.getInt16(5, true);                          // tork
          p.speed = dv.getInt8(7);                                 // hız (%)
          p.raw   = dv.getInt32(8, true);                          // kümülatif konum
          p.model = model;
        }else if(kind === 'matrix'){
          p.pixels = Array.from(payload.slice(off + 2, off + 11)); // 3x3 renk kodu
          p.value  = p.pixels.filter(v => v && v !== 255).length;  // yanan piksel
        }else if(kind === 'force'){
          p.value = payload[off + 2];                 // 0-100
          const basili = payload[off + 3] === 1;
          if(p.pressed !== basili)
            log(d, `⏺ Port ${PORT_LETTERS[port]} ${t('button')}: ${basili ? t('pressed') : t('released')}`,
                basili ? 'g' : '');
          p.pressed = basili;
        }else if(kind === 'color'){
          const c = payload[off + 2];
          if(p.value !== c)
            log(d, `🎨 Port ${PORT_LETTERS[port]}: ${LWP3_COLOR_NAME[c] || '?'}`,
                c === 255 ? '' : 'g');
          p.value = c;
        }else if(kind === 'distance'){
          p.value = dv.getInt16(2, true);             // cm
        }
      }
    }
    off += size;
  }

  // Bu bildirimde hiç görünmeyen port = cihaz çıkarılmış
  for(let i = 0; i < d.slotCount; i++){
    const p = d.ports[i];
    if(p && p.kind != null && !görülen.has(i)){
      d.ports[i] = { kind:null, type:null, value:null };
      log(d, `⊘ Port ${PORT_LETTERS[i]} ${t('portDisconnected')}`);
      d.slotsDirty = true;
    }
  }

  throttlePaint(d, () => {
    if(d.slotsDirty){ d.slotsDirty = false; renderHubSlots(d); }
    else paintHub(d);
    paintPano();
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Hub motor komutları — iki protokol için ayrı biçim
   ══════════════════════════════════════════════════════════════════════════ */
/* LWP3: PortOutput (0x81) alt komutları */
const LWP3_SUB = { START_SPEED:0x07, START_SPEED_DEGREES:0x0B, GOTO_ABS_POS:0x0D };
const LWP3_SUB_WRITE_DIRECT = 0x51;   // WriteDirectModeData
/* SPIKE App 3: fd02 cihazlarıyla aynı mesaj kimlikleri, port maskesiyle */
const S3_MOTOR = { RUN:122, RUN_RESULT:123, FOR_DEGREES:124, FOR_DEGREES_RESULT:125,
                   TO_ABS:128, TO_ABS_RESULT:129, STOP:138, STOP_RESULT:139, SET_SPEED:140 };
const S3_MOTOR_RESULTS = new Set([123, 125, 129, 131, 139, 141]);

/* LWP3'te 3x3 renk matrisi yazmak için iki ayrıntı gerekiyor:
   1) Alt komut WriteDirectModeData (0x51) olmalı; ardından mod baytı (0x02) gelir.
      Yalnızca 0x02 gönderilirse hub bunu geçersiz bir alt komut sayıp yok sayar.
   2) Her piksel tek bayta paketlenir: üst nibble parlaklık, alt nibble renk.
      Ham renk indeksi gönderilirse parlaklık 0 olur ve matris kapalı kalır. */
function lwp3MatrixWrite(port, pixels, intensity = 10){
  const packed = pixels.map(c => {
    const renk = Math.min(10, Math.max(0, Number(c) || 0));
    if(renk === 0) return 0x00;                       // kapalı piksel
    const par = Math.min(10, Math.max(0, intensity));
    return ((par & 0x0F) << 4) | (renk & 0x0F);
  });
  return lwp3PortOutput(port, LWP3_SUB_WRITE_DIRECT, 0x02, ...packed);
}

function lwp3PortOutput(port, ...body){
  const b = [0, 0x00, LWP3_MSG.PORT_OUTPUT, port, 0x11, ...body];
  b[0] = b.length;
  return Uint8Array.from(b);
}
const _s32 = v => { const b = new Uint8Array(4);
                    new DataView(b.buffer).setInt32(0, Math.round(v), true); return [...b]; };
const _u16 = v => [v & 0xFF, (v >> 8) & 0xFF];
const _i8  = v => [v < 0 ? (v + 256) & 0xFF : v & 0xFF];

/** Port için hız işaretli değer (yön). */
const hubSpeed = (dir, sp) => dir === 'CW' ? sp : -sp;

function hubMotorRun(d, port, dir, sp){
  if(d.hubProto === 'lwp3'){
    send(d, lwp3PortOutput(port, LWP3_SUB.START_SPEED, ..._i8(hubSpeed(dir, sp)), 100, 0x00));
  }else if(d.hubProto === 'spike3'){
    const harf = PORT_LETTERS[port];
    const kaynak = motorPython(harf, 'run', 0, dir, sp);
    spikeUploadAndRun(d, kaynak, 0).catch(e => log(d, `⚠ Port ${harf} çalıştırma hatası: ${e.message}`, 'e'));
  }else{
    send(d, Uint8Array.from([S3_MOTOR.SET_SPEED, 1 << port, ..._i8(sp)]));
    send(d, Uint8Array.from([S3_MOTOR.RUN, 1 << port, dir === 'CW' ? 0 : 1]));
  }
  log(d, `Port ${PORT_LETTERS[port]}: ${dir === 'CW' ? '↻ sağa' : '↺ sola'} (hız ${sp})`);
}

function hubMotorStop(d, port){
  if(d.hubProto === 'lwp3'){
    send(d, lwp3PortOutput(port, LWP3_SUB.START_SPEED, 0, 100, 0x00));
  }else if(d.hubProto === 'spike3'){
    send(d, S3_CMD.programFlow(true, 0));
  }else{
    send(d, Uint8Array.from([S3_MOTOR.STOP, 1 << port]));
  }
  log(d, `Port ${PORT_LETTERS[port]}: ⏹ durdu`);
}

function hubMotorDegrees(d, port, deg, dir, sp){
  if(d.hubProto === 'lwp3'){
    send(d, lwp3PortOutput(port, LWP3_SUB.START_SPEED_DEGREES,
                           ..._s32(deg), ..._i8(hubSpeed(dir, sp)), 100, 1, 0x00));
  }else if(d.hubProto === 'spike3'){
    const harf = PORT_LETTERS[port];
    const kaynak = motorPython(harf, 'degrees', deg, dir, sp);
    spikeUploadAndRun(d, kaynak, 0).catch(e => log(d, `⚠ Port ${harf} döndürme hatası: ${e.message}`, 'e'));
  }else{
    send(d, Uint8Array.from([S3_MOTOR.SET_SPEED, 1 << port, ..._i8(sp)]));
    send(d, Uint8Array.from([S3_MOTOR.FOR_DEGREES, 1 << port, ..._s32(deg), dir === 'CW' ? 0 : 1]));
    hubExpectAck(d);
  }
  log(d, `Port ${PORT_LETTERS[port]}: ${deg}° ${dir === 'CW' ? '↻' : '↺'}`);
}

function hubMotorAbsolute(d, port, angle, sp, dir = 'Shortest'){
  const pos = ((Math.round(angle) % 360) + 360) % 360;
  if(d.hubProto === 'lwp3'){
    send(d, lwp3PortOutput(port, LWP3_SUB.GOTO_ABS_POS, ..._s32(pos), ..._i8(sp), 100, 1, 0x00));
  }else if(d.hubProto === 'spike3'){
    const harf = PORT_LETTERS[port];
    const kaynak = motorPython(harf, 'absolute', pos, dir, sp);
    spikeUploadAndRun(d, kaynak, 0).catch(e => log(d, `⚠ Port ${harf} açı hatası: ${e.message}`, 'e'));
  }else{
    send(d, Uint8Array.from([S3_MOTOR.SET_SPEED, 1 << port, ..._i8(sp)]));
    send(d, Uint8Array.from([S3_MOTOR.TO_ABS, 1 << port, ..._u16(pos), 2]));  // 2 = en kısa yol
    hubExpectAck(d);
  }
  log(d, `Port ${PORT_LETTERS[port]}: → ${pos}°`);
}

function hubMotorTime(d, port, sec, dir, sp){
  if(d.hubProto === 'spike3'){
    const harf = PORT_LETTERS[port];
    const kaynak = motorPython(harf, 'time', sec, dir, sp);
    spikeUploadAndRun(d, kaynak, 0).catch(e => log(d, `⚠ Port ${harf} süre hatası: ${e.message}`, 'e'));
    log(d, `Port ${PORT_LETTERS[port]}: ${sec} sn ${dir === 'CW' ? '↻' : '↺'} (hız ${sp})`);
  }
}

function hubMotorReset(d, port){
  if(d.hubProto === 'spike3'){
    const harf = PORT_LETTERS[port];
    const kaynak = motorPython(harf, 'reset', 0, 'CW', 0);
    spikeUploadAndRun(d, kaynak, 0).catch(e => log(d, `⚠ Port ${harf} sıfırlama hatası: ${e.message}`, 'e'));
    log(d, `Port ${PORT_LETTERS[port]}: konum sıfırlandı (0°)`);
  }
}

/* SPIKE App 3'te hub'ın motor komutlarını kabul ettiğini ancak yanıt mesajından
   anlayabiliyoruz. Hiç yanıt gelmezse kullanıcıya sessizce başarısız olmadığını
   söylemek gerekiyor — komut biçimi bu firmware'de farklı olabilir. */
function hubExpectAck(d){
  if(d.hubProto !== 'spike3' || d.s3MotorAck) return;
  clearTimeout(d.s3AckTimer);
  d.s3AckTimer = setTimeout(() => {
    if(!d.s3MotorAck && d.device.gatt.connected)
      log(d, '⚠ Hub motor komutuna yanıt vermedi. Motor dönmediyse bu firmware ' +
             'farklı bir komut biçimi bekliyor olabilir — RAW logu paylaşın.', 'e');
  }, 2500);
}

/* SPIKE App 3 firmware'inde motoru doğrudan sürmek MÜMKÜN DEĞİL.
   Bu protokolün mesaj kümesi şunlarla sınırlı: bilgi, hub adı, cihaz UUID,
   program akışı (slot başlat/durdur), dosya yükleme ve telemetri bildirimi.
   Motor komutu diye bir mesaj yok — LEGO'nun kendi uygulaması da blokları
   Python'a çevirip hub'a yükleyip çalıştırarak hareket ettiriyor. */
const hubSendRunHTML = () => `
  <div class="sep"></div>
  <p class="hint">${t('sendRunHint')}</p>

  <div class="tabs">
    <button class="on" data-utab="turn">${t('tabTurns')}</button>
    <button data-utab="time">${t('tabTime')}</button>
    <button data-utab="pos">${t('tabAngle')}</button>
    <button data-utab="free">${t('tabContinuous')}</button>
    <button data-utab="reset">${t('tabReset')}</button>
  </div>

  <div class="umode on" data-umode="turn">
    <div class="row">
      <label>${t('tabTurns')}</label><input type="number" class="u-turns" value="1" min="0.1" step="0.25">
      <label>${t('dirLabel')}</label>
      <select class="u-dir"><option value="CW">${t('dirCW')}</option><option value="CCW">${t('dirCCW')}</option></select>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-uquick="turn-CCW" style="flex:1">${t('turnLeft')}</button>
      <button class="btn" data-uquick="turn-CW" style="flex:1">${t('turnRight')}</button>
    </div>
  </div>

  <div class="umode" data-umode="time">
    <div class="row">
      <label>${t('tabTime')}</label><input type="number" class="u-time" value="2" min="0.1" step="0.5"> <span style="font-size:12px;color:var(--dim)">${t('sec')}</span>
      <label>${t('dirLabel')}</label>
      <select class="u-dir-time"><option value="CW">${t('dirCW')}</option><option value="CCW">${t('dirCCW')}</option></select>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-uquick="time-CCW" style="flex:1">${t('runLeft')}</button>
      <button class="btn" data-uquick="time-CW" style="flex:1">${t('runRight')}</button>
    </div>
  </div>

  <div class="umode" data-umode="pos">
    <div class="row">
      <label>${t('posLabel')}</label><input type="number" class="u-angle" value="90" min="0" max="359">
      <input type="range" class="u-angle-r" value="90" min="0" max="359">
    </div>
    <div class="row" style="margin-top:8px">
      <label>${t('dirLabel')}</label>
      <select class="u-dir-pos" style="flex:1">
        <option value="Shortest">${t('dirShortest')}</option>
        <option value="CW">${t('dirCW')}</option>
        <option value="CCW">${t('dirCCW')}</option>
      </select>
      <button class="btn" data-uquick="pos-go" style="flex:1">${t('btnGotoAngle')}</button>
    </div>
  </div>

  <div class="umode" data-umode="free">
    <div class="row">
      <label>${t('dirLabel')}</label>
      <select class="u-dir2"><option value="CW">${t('dirCW')}</option><option value="CCW">${t('dirCCW')}</option></select>
      <span class="hint" style="margin:0">${t('freeHint')}</span>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-uquick="free-CCW" style="flex:1">${t('startLeft')}</button>
      <button class="btn" data-uquick="free-CW" style="flex:1">${t('startRight')}</button>
    </div>
  </div>

  <div class="umode" data-umode="reset">
    <p class="hint" style="margin-bottom:8px">${t('resetZeroHint')}</p>
    <button class="btn ghost" data-uquick="reset-zero" style="width:100%">${t('btnResetZero')}</button>
  </div>

  <div class="row" style="margin-top:14px">
    <label>${t('speedLabel')}</label>
    <input type="range" class="u-speed" value="50" min="1" max="100">
    <b class="u-speed-v" style="font:600 13px ui-monospace,monospace;min-width:28px">50</b>
  </div>
  <div class="row" style="margin-top:8px">
    <label>Slot</label>
    <select class="u-slot">${Array.from({length:20},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select>
    <span class="hint" style="margin:0">${t('slotHint')}</span>
  </div>

  <div class="row" style="margin-top:14px">
    <button class="btn" data-usend style="flex:1">${t('btnSendRun')}</button>
    <button class="btn danger" data-ustop>${t('btnStop')}</button>
  </div>

  <div class="uprog" style="display:none">
    <div class="ubar"><i></i></div>
    <div class="ustep">—</div>
  </div>

  <details class="ucode">
    <summary>${t('pythonCode')}</summary>
    <pre class="u-src"></pre>
  </details>`;

/* ── Gönder & Çalıştır panelini bağla (SPIKE App 3 hub'ları) ──────────── */
function wireSendRun(d, card, port){
  const q = sel => card.querySelector(sel);
  const harf = PORT_LETTERS[port];

  const mod = () => (card.querySelector('[data-utab].on') || {}).dataset?.utab || 'turn';
  const hiz  = () => Number(q('.u-speed').value) || 50;
  const slot = () => Number(q('.u-slot').value) || 0;

  /** Seçili moda göre Python üret. */
  const uret = () => {
    const m = mod();
    if(m === 'turn')
      return motorPython(harf, 'degrees',
        Math.round((Number(q('.u-turns').value) || 1) * 360), q('.u-dir').value, hiz());
    if(m === 'time')
      return motorPython(harf, 'time', Number(q('.u-time').value) || 2, q('.u-dir-time').value, hiz());
    if(m === 'pos')
      return motorPython(harf, 'absolute', Number(q('.u-angle').value) || 0, q('.u-dir-pos').value, hiz());
    if(m === 'reset')
      return motorPython(harf, 'reset', 0, 'CW', 0);
    return motorPython(harf, 'run', 0, q('.u-dir2').value, hiz());
  };
  const tazele = () => { const src = q('.u-src'); if(src) src.textContent = uret(); };

  card.querySelectorAll('[data-utab]').forEach(b => {
    b.onclick = () => {
      card.querySelectorAll('[data-utab]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      card.querySelectorAll('.umode').forEach(m =>
        m.classList.toggle('on', m.dataset.umode === b.dataset.utab));
      tazele();
    };
  });

  const n = q('.u-angle'), r = q('.u-angle-r');
  if(n && r){
    n.oninput = () => { r.value = n.value; tazele(); };
    r.oninput = () => { n.value = r.value; tazele(); };
  }
  if(q('.u-turns'))    q('.u-turns').oninput    = tazele;
  if(q('.u-dir'))      q('.u-dir').onchange     = tazele;
  if(q('.u-time'))     q('.u-time').oninput     = tazele;
  if(q('.u-dir-time')) q('.u-dir-time').onchange = tazele;
  if(q('.u-dir-pos'))  q('.u-dir-pos').onchange  = tazele;
  if(q('.u-dir2'))     q('.u-dir2').onchange    = tazele;
  if(q('.u-speed'))    q('.u-speed').oninput    = () => { q('.u-speed-v').textContent = q('.u-speed').value; tazele(); };
  tazele();

  const prog = q('.uprog'), bar = q('.ubar i'), adimEl = q('.ustep');
  const gonderBtn = q('[data-usend]');

  const calistir = async (kaynak) => {
    if(!d.device.gatt.connected){ alert(t('deviceNotConnected')); return; }
    if(gonderBtn) gonderBtn.disabled = true;
    prog.style.display = '';
    bar.style.width = '0%';
    bar.style.background = 'var(--accent)';
    adimEl.textContent = t('preparing');
    log(d, `⬆ Port ${harf}: program slot ${slot()}'e gönderiliyor (${kaynak.length} bayt)`);
    try{
      await spikeUploadAndRun(d, kaynak, slot(), (oran, metin) => {
        bar.style.width = Math.round(oran * 100) + '%';
        adimEl.textContent = metin;
      });
      bar.style.width = '100%';
      adimEl.textContent = t('executed');
      log(d, `✓ Port ${harf}: program yüklendi ve başlatıldı`, 'g');
    }catch(e){
      adimEl.textContent = t('error') + e.message;
      bar.style.background = 'var(--err)';
      log(d, `⚠ Port ${harf} yükleme başarısız: ` + e.message, 'e');
    }finally{
      if(gonderBtn) gonderBtn.disabled = false;
      setTimeout(() => { bar.style.background = 'var(--accent)'; }, 2500);
    }
  };

  if(gonderBtn) gonderBtn.onclick = () => calistir(uret());

  // Hızlı tek-tıkla işlem butonları
  card.querySelectorAll('[data-uquick]').forEach(btn => {
    btn.onclick = () => {
      const qk = btn.dataset.uquick;
      if(qk === 'turn-CW'){
        if(q('.u-dir')) q('.u-dir').value = 'CW';
        tazele(); calistir(uret());
      }else if(qk === 'turn-CCW'){
        if(q('.u-dir')) q('.u-dir').value = 'CCW';
        tazele(); calistir(uret());
      }else if(qk === 'time-CW'){
        if(q('.u-dir-time')) q('.u-dir-time').value = 'CW';
        tazele(); calistir(uret());
      }else if(qk === 'time-CCW'){
        if(q('.u-dir-time')) q('.u-dir-time').value = 'CCW';
        tazele(); calistir(uret());
      }else if(qk === 'pos-go'){
        tazele(); calistir(uret());
      }else if(qk === 'free-CW'){
        if(q('.u-dir2')) q('.u-dir2').value = 'CW';
        tazele(); calistir(uret());
      }else if(qk === 'free-CCW'){
        if(q('.u-dir2')) q('.u-dir2').value = 'CCW';
        tazele(); calistir(uret());
      }else if(qk === 'reset-zero'){
        calistir(motorPython(harf, 'reset', 0, 'CW', 0));
      }
    };
  });

  const durBtn = q('[data-ustop]');
  if(durBtn) durBtn.onclick = () => {
    send(d, S3_CMD.programFlow(true, slot()));
    log(d, `■ Port ${harf} (slot ${slot()}) durduruldu`);
  };
}

/* ── Motor slotuna kontrol paneli (yalnızca LWP3 hub'larda) ───────────── */
const hubMotorControlHTML = () => `
  <div class="sep"></div>
  <div class="tabs">
    <button class="on" data-htab="jog">${t('tabManual')}</button>
    <button data-htab="turn">${t('tabTurns')}</button>
    <button data-htab="pos">${t('tabAngle')}</button>
  </div>
  <div class="hmode on" data-hmode="jog">
    <p class="hint">${t('jogHint')}</p>
    <div class="jog">
      <button data-hjog="CCW">↺<span class="lbl">${t('jogLeft')}</span></button>
      <button data-hjog="CW">↻<span class="lbl">${t('jogRight')}</span></button>
    </div>
  </div>
  <div class="hmode" data-hmode="turn">
    <p class="hint">${t('turnsHint')}</p>
    <div class="row" style="margin-bottom:12px">
      <label>${t('turnsLabel')}</label><input type="number" class="h-turns" value="1" min="0.25" step="0.25">
    </div>
    <div class="row">
      <button class="btn ghost" data-hturn="CCW" style="flex:1">${t('turnLeft')}</button>
      <button class="btn" data-hturn="CW" style="flex:1">${t('turnRight')}</button>
    </div>
  </div>
  <div class="hmode" data-hmode="pos">
    <p class="hint">${t('posHint')}</p>
    <div class="row" style="margin-bottom:12px">
      <label>${t('posLabel')}</label><input type="number" class="h-angle" value="90" min="0" max="359">
      <input type="range" class="h-angle-r" value="90" min="0" max="359">
    </div>
    <button class="btn" data-hgoto style="width:100%">${t('btnGotoAngle')}</button>
  </div>
  <div class="row" style="margin-top:14px">
    <label>${t('speedLabel')}</label>
    <input type="range" class="h-speed" value="50" min="1" max="100">
    <b class="h-speed-v" style="font:600 13px ui-monospace,monospace;min-width:28px">50</b>
  </div>
  <div class="row" style="margin-top:12px">
    <button class="btn danger" data-hstop style="width:100%">${t('emergencyStop')}</button>
  </div>`;

function wireHubMotor(d, card, port){
  const sp = () => Number(card.querySelector('.h-speed').value) || 50;

  card.querySelectorAll('[data-htab]').forEach(b => {
    b.onclick = () => {
      card.querySelectorAll('[data-htab]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      card.querySelectorAll('.hmode').forEach(m =>
        m.classList.toggle('on', m.dataset.hmode === b.dataset.htab));
      hubMotorStop(d, port);
    };
  });

  card.querySelectorAll('[data-hjog]').forEach(b => {
    const dir = b.dataset.hjog;
    const down = e => { e.preventDefault(); b.classList.add('held'); hubMotorRun(d, port, dir, sp()); };
    const up   = e => { e.preventDefault(); b.classList.remove('held'); hubMotorStop(d, port); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
  });

  card.querySelectorAll('[data-hturn]').forEach(b => {
    b.onclick = () => hubMotorDegrees(d, port,
      Math.round(Number(card.querySelector('.h-turns').value || 1) * 360), b.dataset.hturn, sp());
  });

  const n = card.querySelector('.h-angle'), r = card.querySelector('.h-angle-r');
  if(n && r){
    n.oninput = () => r.value = n.value;
    r.oninput = () => n.value = r.value;
  }
  const goto_ = card.querySelector('[data-hgoto]');
  if(goto_) goto_.onclick = () => hubMotorAbsolute(d, port, Number(n.value) || 0, sp());

  const spEl = card.querySelector('.h-speed');
  if(spEl) spEl.oninput = () => { card.querySelector('.h-speed-v').textContent = spEl.value; };

  const stop = card.querySelector('[data-hstop]');
  if(stop) stop.onclick = () => hubMotorStop(d, port);
}

/* ── Color Matrix (3x3 Renk Matrisi) Stüdyosu ────────────────────────── */
const MATRIX_COLORS = [
  { id: 0,  css: '#1a202c', border: '#4a5568', labelEn: 'Off',       labelTr: 'Kapalı' },
  { id: 1,  css: '#be00fe', border: '#be00fe', labelEn: 'Magenta',   labelTr: 'Macenta' },
  { id: 2,  css: '#7c4dff', border: '#7c4dff', labelEn: 'Purple',    labelTr: 'Mor' },
  { id: 3,  css: '#2465d6', border: '#2465d6', labelEn: 'Blue',      labelTr: 'Mavi' },
  { id: 4,  css: '#4dbeea', border: '#4dbeea', labelEn: 'Azure',     labelTr: 'Gök Mavisi' },
  { id: 5,  css: '#00857d', border: '#00857d', labelEn: 'Turquoise', labelTr: 'Turkuaz' },
  { id: 6,  css: '#00a831', border: '#00a831', labelEn: 'Green',     labelTr: 'Yeşil' },
  { id: 7,  css: '#ffc90f', border: '#ffc90f', labelEn: 'Yellow',    labelTr: 'Sarı' },
  { id: 8,  css: '#ff8c00', border: '#ff8c00', labelEn: 'Orange',    labelTr: 'Turuncu' },
  { id: 9,  css: '#d93025', border: '#d93025', labelEn: 'Red',       labelTr: 'Kırmızı' },
  { id: 10, css: '#ffffff', border: '#cbd5e1', labelEn: 'White',     labelTr: 'Beyaz' }
];

function matrixPython(portHarfi, pixels, intensity = 10){
  const p = `port.${portHarfi}`;
  const allOff = pixels.every(c => c === 0 || c == null);
  let govde;
  if(allOff){
    govde = `    color_matrix.clear(${p})`;
  }else{
    const pixelTuples = pixels.map(c => {
      const col = Number(c) || 0;
      const intens = col === 0 ? 0 : intensity;
      return `(${col}, ${intens})`;
    });
    const rows = [
      `        ` + pixelTuples.slice(0, 3).join(', '),
      `        ` + pixelTuples.slice(3, 6).join(', '),
      `        ` + pixelTuples.slice(6, 9).join(', ')
    ].join(',\n');
    govde = `    pixels = [\n${rows}\n    ]\n    color_matrix.show(${p}, pixels)\n` +
            `    while True:\n        await runloop.sleep_ms(1000)`;
  }
  return `import color, color_matrix, runloop\nfrom hub import port\n\n` +
         `async def main():\n${govde}\n\nrunloop.run(main())\n`;
}

const hubMatrixEditorHTML = proto => `
  <div class="matrix-editor">
    <p class="hint" style="margin:0">${t('matrixEditorHint')}</p>
    <div class="matrix-canvas-wrap">
      <div class="matrix-grid">
        ${Array.from({length:9}, (_,i)=>`<div class="matrix-cell" data-pix="${i}"></div>`).join('')}
      </div>
      <div class="matrix-tools">
        <div class="matrix-bar-head">
          <span>${t('selectedColor')}: <b class="m-cur-color" style="color:var(--accent)">–</b></span>
          <span class="m-count-lbl" style="font-size:11px;font-weight:700;color:var(--muted)">0/9</span>
        </div>
        <div class="matrix-palette"></div>
        <div class="matrix-bar-head" style="margin-top:4px">
          <span>${t('matrixPresets')}</span>
        </div>
        <div class="matrix-presets">
          <button type="button" class="matrix-preset-btn" data-mpreset="smile">😊 ${t('presetSmile')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="heart">❤️ ${t('presetHeart')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="cross">✕ ${t('presetCross')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="plus">＋ ${t('presetPlus')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="rainbow">🌈 ${t('presetRainbow')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="fill">⬛ ${t('presetFill')}</button>
          <button type="button" class="matrix-preset-btn" data-mpreset="clear">⊘ ${t('presetClear')}</button>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
          <label style="font-size:12px;font-weight:700;color:var(--muted)">${t('intensity')}</label>
          <div class="matrix-presets" style="gap:4px">
            <button type="button" class="matrix-preset-btn active" data-mintensity="10">100%</button>
            <button type="button" class="matrix-preset-btn" data-mintensity="7">70%</button>
            <button type="button" class="matrix-preset-btn" data-mintensity="4">40%</button>
            <button type="button" class="matrix-preset-btn" data-mintensity="2">20%</button>
          </div>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:6px">
      <label>Slot</label>
      <select class="m-slot">${Array.from({length:20},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select>
      <span class="hint" style="margin:0">${t('slotHint')}</span>
    </div>

    <div class="row" style="margin-top:12px">
      <button class="btn" data-msend style="flex:1">${t('btnSaveAndRun')}</button>
      <button class="btn danger" data-mstop>${t('btnStop')}</button>
    </div>

    <div class="uprog m-prog" style="display:none">
      <div class="ubar"><i class="m-bar"></i></div>
      <div class="ustep m-step">—</div>
    </div>

    <details class="ucode">
      <summary>${t('pythonCode')}</summary>
      <pre class="u-src m-src"></pre>
    </details>
  </div>`;

function wireColorMatrix(d, card, port){
  const harf = PORT_LETTERS[port];

  /* Çizim taslağı port NESNESİNDE tutulamaz: cihaz her yeniden takıldığında
     d.ports[port] yepyeni bir nesneyle değiştiriliyor. Eski kod nesneyi bir kez
     yakaladığı için (a) kullanıcının çizimi sessizce sıfırlanıyor, (b) editör
     artık canlı porta değil kopmuş eski nesneye yazıyordu. Taslağı cihazda
     porta göre saklıyor, port nesnesine de her seferinde taze bakıyoruz. */
  if(!d.matrixDrafts) d.matrixDrafts = {};
  const canliPort = () => d.ports[port] || {};
  if(!d.matrixDrafts[port]){
    const mevcut = canliPort().pixels;
    d.matrixDrafts[port] = (mevcut && mevcut.length === 9) ? [...mevcut] : Array(9).fill(0);
  }
  const p = { get editPixels(){ return d.matrixDrafts[port]; },
              set editPixels(v){ d.matrixDrafts[port] = v; },
              get pixels(){ return canliPort().pixels; },
              set pixels(v){ canliPort().pixels = v; },
              set value(v){ canliPort().value = v; } };

  let curColorId = 9; // varsayılan: Kırmızı
  let intensity = 10;
  const slot = () => Number(card.querySelector('.m-slot')?.value) || 0;

  const curColLbl = card.querySelector('.m-cur-color');
  const palBox = card.querySelector('.matrix-palette');
  const srcPre = card.querySelector('.m-src');
  const countLbl = card.querySelector('.m-count-lbl');

  const colorObj = id => MATRIX_COLORS.find(c => c.id === id) || MATRIX_COLORS[0];

  const updatePython = () => {
    if(srcPre) srcPre.textContent = matrixPython(harf, p.editPixels, intensity);
  };

  const updateCanvas = () => {
    let litCount = 0;
    card.querySelectorAll('.matrix-cell[data-pix]').forEach(cell => {
      const idx = +cell.dataset.pix;
      const colId = p.editPixels[idx] || 0;
      const c = colorObj(colId);
      if(colId > 0 && colId !== 255){
        litCount++;
        cell.style.background = c.css;
        cell.style.borderColor = c.border;
        cell.style.color = c.css;
        cell.classList.add('lit');
      }else{
        cell.style.background = '#1a202c';
        cell.style.borderColor = '#2d3748';
        cell.classList.remove('lit');
      }
    });
    if(countLbl) countLbl.textContent = `${litCount}/9`;
    updatePython();
  };

  // Renk paleti butonları
  if(palBox){
    palBox.innerHTML = '';
    for(const mc of MATRIX_COLORS){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `matrix-col-btn ${mc.id === curColorId ? 'active' : ''}`;
      btn.style.background = mc.css;
      btn.style.borderColor = mc.border;
      btn.title = currentLang === 'tr' ? mc.labelTr : mc.labelEn;
      btn.onclick = () => {
        curColorId = mc.id;
        palBox.querySelectorAll('.matrix-col-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if(curColLbl){
          curColLbl.textContent = currentLang === 'tr' ? mc.labelTr : mc.labelEn;
          curColLbl.style.color = mc.id === 0 ? 'var(--muted)' : mc.css;
        }
      };
      palBox.appendChild(btn);
    }
    const defCol = colorObj(curColorId);
    if(curColLbl){
      curColLbl.textContent = currentLang === 'tr' ? defCol.labelTr : defCol.labelEn;
      curColLbl.style.color = defCol.css;
    }
  }

  // Piksellere tıklama: boya veya kapat
  card.querySelectorAll('.matrix-cell[data-pix]').forEach(cell => {
    cell.onclick = () => {
      const idx = +cell.dataset.pix;
      if(p.editPixels[idx] === curColorId){
        p.editPixels[idx] = 0;
      }else{
        p.editPixels[idx] = curColorId;
      }
      updateCanvas();
    };
  });

  // Şablonlar
  const PRESET_MAP = {
    smile:   [7, 0, 7, 0, 0, 0, 7, 7, 7],
    heart:   [9, 0, 9, 9, 9, 9, 0, 9, 0],
    cross:   [9, 0, 9, 0, 9, 0, 9, 0, 9],
    plus:    [0, 4, 0, 4, 4, 4, 0, 4, 0],
    rainbow: [9, 8, 7, 6, 4, 3, 2, 1, 10],
    clear:   [0, 0, 0, 0, 0, 0, 0, 0, 0]
  };

  card.querySelectorAll('[data-mpreset]').forEach(b => {
    b.onclick = () => {
      const key = b.dataset.mpreset;
      if(key === 'fill'){
        p.editPixels = Array(9).fill(curColorId);
      }else if(PRESET_MAP[key]){
        p.editPixels = [...PRESET_MAP[key]];
      }
      updateCanvas();
    };
  });

  // Parlaklık / yoğunluk butonları
  card.querySelectorAll('[data-mintensity]').forEach(b => {
    b.onclick = () => {
      intensity = Number(b.dataset.mintensity) || 10;
      card.querySelectorAll('[data-mintensity]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      updatePython();
    };
  });

  updateCanvas();

  // Gönder & Çalıştır işlemi
  const gonderBtn = card.querySelector('[data-msend]');
  const durBtn = card.querySelector('[data-mstop]');
  const prog = card.querySelector('.m-prog');
  const bar = card.querySelector('.m-bar');
  const adimEl = card.querySelector('.m-step');

  const calistir = async () => {
    if(!d.device.gatt.connected){ alert(t('deviceNotConnected')); return; }
    if(gonderBtn) gonderBtn.disabled = true;
    if(prog) prog.style.display = '';
    if(bar){ bar.style.width = '0%'; bar.style.background = 'var(--accent)'; }
    if(adimEl) adimEl.textContent = t('preparing');

    const kaynak = matrixPython(harf, p.editPixels, intensity);
    log(d, `⬆ Port ${harf}: renk matrisi programı slot ${slot()}'e gönderiliyor (${kaynak.length} bayt)`);

    try{
      if(d.hubProto === 'lwp3'){
        send(d, lwp3MatrixWrite(port, p.editPixels, intensity));
        if(bar) bar.style.width = '100%';
        if(adimEl) adimEl.textContent = t('executed');
        log(d, `✓ Port ${harf}: LWP3 renk matrisi güncellendi`, 'g');
      }else{
        await spikeUploadAndRun(d, kaynak, slot(), (oran, metin) => {
          if(bar) bar.style.width = Math.round(oran * 100) + '%';
          if(adimEl) adimEl.textContent = metin;
        });
        if(bar) bar.style.width = '100%';
        if(adimEl) adimEl.textContent = t('executed');
        log(d, `✓ Port ${harf}: renk matrisi programı yüklendi ve çalıştırıldı`, 'g');
      }
      p.pixels = [...p.editPixels];
      p.value = p.pixels.filter(v => v && v !== 255 && v !== 0).length;
      paintHub(d);
    }catch(e){
      if(adimEl) adimEl.textContent = t('error') + e.message;
      if(bar) bar.style.background = 'var(--err)';
      log(d, `⚠ Port ${harf} renk matrisi yükleme başarısız: ` + e.message, 'e');
    }finally{
      if(gonderBtn) gonderBtn.disabled = false;
      setTimeout(() => { if(bar) bar.style.background = 'var(--accent)'; }, 2500);
    }
  };

  if(gonderBtn) gonderBtn.onclick = calistir;

  if(durBtn) durBtn.onclick = () => {
    if(d.hubProto === 'lwp3'){
      send(d, lwp3MatrixWrite(port, Array(9).fill(0), 0));
    }else{
      send(d, S3_CMD.programFlow(true, slot()));
    }
    log(d, `■ Port ${harf} (slot ${slot()}) durduruldu`);
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   SPIKE Prime'a program yükleyip çalıştırma
   ──────────────────────────────────────────────────────────────────────────
   Bu firmware'de motoru doğrudan süren bir mesaj yok. LEGO'nun kendi uygulaması
   da blokları Python'a çevirip hub'a yüklüyor. Mesaj biçimleri
   spike.legoeducation.com bundle'ından çıkarıldı:
     ClearSlot(70)       = [70, slot]
     StartFileUpload(12) = [12, dosyaadı(≤31)+0x00, slot, uint32 dosyaCRC]
     TransferChunk(16)   = [16, uint32 yürüyenCRC, uint16 uzunluk, ...veri]
     ProgramFlow(30)     = [30, 0=başlat/1=durdur, slot]
   Yanıtların hepsi tek bayt durum taşır: Ack=0, Nack=1.
   ══════════════════════════════════════════════════════════════════════════ */
const S3_UP = { CLEAR_SLOT:70, CLEAR_SLOT_RES:71, START_UPLOAD:12, START_UPLOAD_RES:13,
                TRANSFER_CHUNK:16, TRANSFER_CHUNK_RES:17 };
const S3_ACK = 0;

/* Standart zlib CRC-32; tohumlanabilir, böylece crc(a+b) = crc(b, crc(a)) */
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for(let i = 0; i < 256; i++){
    let c = i;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32Ham(bytes, prev = 0){
  let c = (prev ^ 0xFFFFFFFF) >>> 0;
  for(const b of bytes) c = (CRC32_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** SPIKE'ın CRC'si: hesaplamadan ÖNCE veri 4'ün katına sıfırla doldurulur.
    Bundle'daki karşılığı:  kalan = len % 4; kalan && push(4-kalan adet 0)
    Bu dolgu olmadan hub her parçayı Nack'liyor. */
function crc32(bytes, prev = 0){
  const kalan = bytes.length % 4;
  if(kalan === 0) return crc32Ham(bytes, prev);
  const dolu = new Uint8Array(bytes.length + (4 - kalan));
  dolu.set(bytes, 0);                       // kalan baytlar zaten 0
  return crc32Ham(dolu, prev);
}

const _u32le = v => { const b = new Uint8Array(4);
                      new DataView(b.buffer).setUint32(0, v >>> 0, true); return [...b]; };
const _u16le = v => [v & 0xFF, (v >> 8) & 0xFF];

/** Bir istek gönderip yanıtını bekler. */
function s3Request(d, payload, responseId, timeoutMs = 5000){
  return new Promise((resolve, reject) => {
    if(!d.s3Pending) d.s3Pending = new Map();
    const timer = setTimeout(() => {
      d.s3Pending.delete(responseId);
      reject(new Error(`yanıt gelmedi (mesaj ${responseId})`));
    }, timeoutMs);
    d.s3Pending.set(responseId, { resolve, timer });
    send(d, s3Pack(Uint8Array.from(payload)));
  });
}

/** Python kaynağını slota yükleyip çalıştırır. onStep ilerlemeyi bildirir. */
async function spikeUploadAndRun(d, kaynak, slot, onStep){
  const bytes = new TextEncoder().encode(kaynak);
  const chunkSize = Math.max(16, d.maxChunkSize || 512);
  const adSayisi = Math.ceil(bytes.length / chunkSize) + 3;
  let adim = 0;
  const ilerle = (metin) => { adim++; onStep && onStep(adim / adSayisi, metin); };

  // 0) Slotda çalışan program varsa önce durdur
  try{
    await s3Request(d, [S3_MSG.PROGRAM_FLOW, 1, slot & 0xFF], S3_MSG.PROGRAM_FLOW_RESPONSE, 400);
  }catch(_){}

  // 1) slotu temizle
  ilerle('slot temizleniyor');
  let r = await s3Request(d, [S3_UP.CLEAR_SLOT, slot & 0xFF], S3_UP.CLEAR_SLOT_RES);
  // Boş slotu temizlemek Nack dönebilir — bu hata değil, devam.

  // 2) yüklemeyi başlat
  ilerle('yükleme başlatılıyor');
  const ad = new TextEncoder().encode('program.py');
  r = await s3Request(d,
    [S3_UP.START_UPLOAD, ...ad.slice(0, 31), 0x00, slot & 0xFF, ..._u32le(crc32(bytes))],
    S3_UP.START_UPLOAD_RES);
  if(r[1] !== S3_ACK) throw new Error('hub yüklemeyi reddetti (StartFileUpload Nack)');

  // 3) parçaları gönder — her parçada yürüyen CRC, Nack'te 3 kez tekrar
  let yuruyen = 0;
  for(let i = 0; i < bytes.length; i += chunkSize){
    const parca = bytes.slice(i, i + chunkSize);
    let dene = 0;
    for(;;){
      const aday = crc32(parca, yuruyen);
      const cevap = await s3Request(d,
        [S3_UP.TRANSFER_CHUNK, ..._u32le(aday), ..._u16le(parca.length), ...parca],
        S3_UP.TRANSFER_CHUNK_RES);
      if(cevap[1] === S3_ACK){ yuruyen = aday; break; }
      if(++dene >= 3) throw new Error('parça aktarımı başarısız (3 deneme)');
    }
    ilerle(`gönderiliyor ${Math.min(i + chunkSize, bytes.length)}/${bytes.length} bayt`);
  }

  // 4) çalıştır
  ilerle('program başlatılıyor');
  await s3Request(d, [S3_MSG.PROGRAM_FLOW, 0, slot & 0xFF], S3_MSG.PROGRAM_FLOW_RESPONSE);
  return true;
}

/* ── Motor eylemi → Python ────────────────────────────────────────────── */
/* SPIKE App 3 çalışma zamanı: motor modülü + runloop.
   Hız birimi derece/saniye; %100 ≈ 1000 dps. */
function motorPython(portHarfi, eylem, deger, yon = 'CW', hizYuzde = 50){
  const dps = Math.max(50, Math.round((hizYuzde / 100) * 1000));
  const p = `port.${portHarfi}`;
  let govde;
  if(eylem === 'degrees'){
    const d = yon === 'CCW' ? -Math.abs(deger) : Math.abs(deger);
    govde = `    await motor.run_for_degrees(${p}, ${d}, ${dps})`;
  }else if(eylem === 'time'){
    const ms = Math.max(50, Math.round(Number(deger) * 1000));
    const spd = yon === 'CCW' ? -dps : dps;
    govde = `    await motor.run_for_time(${p}, ${ms}, ${spd})`;
  }else if(eylem === 'absolute'){
    const pos = ((Math.round(deger) % 360) + 360) % 360;
    let dirCode = '';
    if(yon === 'CW') dirCode = ', direction=motor.CLOCKWISE';
    else if(yon === 'CCW') dirCode = ', direction=motor.COUNTERCLOCKWISE';
    else if(yon === 'Shortest') dirCode = ', direction=motor.SHORTEST_PATH';
    govde = `    await motor.run_to_absolute_position(${p}, ${pos}, ${dps}${dirCode})`;
  }else if(eylem === 'run'){
    const spd = yon === 'CCW' ? -dps : dps;
    govde = `    motor.run(${p}, ${spd})\n` +
            `    while True:\n        await runloop.sleep_ms(1000)`;
  }else if(eylem === 'reset'){
    govde = `    motor.reset_relative_position(${p}, 0)`;
  }else if(eylem === 'stop'){
    govde = `    motor.stop(${p})`;
  }else{
    govde = `    motor.stop(${p})`;
  }
  return `import motor, runloop\nfrom hub import port\n\n` +
         `async def main():\n${govde}\n\nrunloop.run(main())\n`;
}

buildPicker();
