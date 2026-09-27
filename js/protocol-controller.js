/* ──────────────────────────────────────────────────────────────────────────
   Kaynak: code.legoeducation.com uygulamasının kendi bundle'ından çıkarıldı.
   Çerçeveleme YOK: her mesaj düpedüz  [messageId, ...payload]  olarak
   fd02-0001'e yazılır; fd02-0002'den aynı biçimde geri okunur.
   Tüm çok-baytlı alanlar little-endian.
   ══════════════════════════════════════════════════════════════════════════ */
const SVC        = '0000fd02-0000-1000-8000-00805f9b34fb';
const CHAR_DATA  = '0000fd02-0001-1000-8000-00805f9b34fb'; // write
const CHAR_NOTIF = '0000fd02-0002-1000-8000-00805f9b34fb'; // notify
const COMPANY_ID = 0x0397;

/* host → cihaz */
const MSG = {
  InfoRequest:                        0,
  InfoResponse:                       1,
  DeviceNotificationRequest:         40,
  DeviceNotificationResponse:        41,
  DeviceNotification:                60,
  LightColorCommand:                110,
  MotorResetRelativePositionCommand:120,
  MotorRunCommand:                  122,
  MotorRunResult:                   123,
  MotorRunForDegreesCommand:        124,
  MotorRunForDegreesResult:         125,
  MotorRunForTimeCommand:           126,
  MotorRunToAbsolutePositionCommand:128,
  MotorRunToAbsolutePositionResult: 129,
  MotorRunToRelativePositionCommand:130,
  MotorSetDutyCycleCommand:         132,
  MotorStopCommand:                 138,
  MotorStopResult:                  139,
  MotorSetSpeedCommand:             140,
  MotorSetEndStateCommand:          142,
  MotorSetAccelerationCommand:      144
};

/* cihaz → host (DeviceNotification içindeki alt mesajlar) */
const DEV_MSG = {
  Info:0, Imu:1, Card:3, Button:4, Motor:10,
  ColorSensor:12, Controller:15, ImuGesture:16
};
/* alt mesaj uzunlukları — id baytı dahil */
const DEV_MSG_SIZE = { 0:3, 1:21, 3:4, 4:2, 10:13, 12:13, 15:7, 16:2 };

const MotorBits       = { Left:1, Right:2, Both:3 };
const MotorDirection  = { Clockwise:0, Counterclockwise:1, Shortest:2, Longest:3 };
const MotorEndState   = { Default:-1, Coast:0, Brake:1, Hold:2, Continue:3, Smart_coast:4, Smart_brake:5 };
const MOTOR_STATE_NAMES = {
  en: { 0:'ready', 1:'running', 2:'stalled', 3:'cancelled', 4:'regulation error',
        5:'motor not connected', 6:'holding', 7:'coasting', 8:'cannot run' },
  tr: { 0:'hazır', 1:'çalışıyor', 2:'sıkıştı', 3:'iptal edildi', 4:'regülasyon hatası',
        5:'motor bağlı değil', 6:'tutuyor', 7:'serbest dönüyor', 8:'çalıştırılamıyor' }
};
const MotorStateName  = new Proxy({}, {
  get: (_, prop) => (MOTOR_STATE_NAMES[currentLang] && MOTOR_STATE_NAMES[currentLang][prop]) ||
                    MOTOR_STATE_NAMES.en[prop] || '—'
});
const ButtonState     = { Released:0, Pressed:1 };

/* Controller kol eşikleri — code.legoeducation.com bundle'ındaki kurallar:
   ölü bölge |ham açı| < 210 (yüzde de sıfırlanır), sonra
   yüzde > 25 → YUKARI, yüzde < -25 → AŞAĞI, arası → ORTA.
   Açı yüzde-derece cinsindendir (/100) ve SOL kolun işareti terstir. */
const LEVER_DEADZONE  = 210;
const LEVER_THRESHOLD = 25;
const LEVER_STATE_NAMES = {
  en: { UP:'up', MIDDLE:'middle', DOWN:'down' },
  tr: { UP:'yukarı', MIDDLE:'orta', DOWN:'aşağı' }
};
const LeverStateName  = new Proxy({}, {
  get: (_, prop) => (LEVER_STATE_NAMES[currentLang] && LEVER_STATE_NAMES[currentLang][prop]) ||
                    LEVER_STATE_NAMES.en[prop] || String(prop)
});

function leverState(percent){
  if(percent >  LEVER_THRESHOLD) return 'UP';
  if(percent < -LEVER_THRESHOLD) return 'DOWN';
  return 'MIDDLE';
}

/** Ham ControllerNotification'ı LEGO'nun gösterdiği değerlere çevirir. */
function controllerView(sub){
  const leftDead  = Math.abs(sub.leftAngle)  < LEVER_DEADZONE;
  const rightDead = Math.abs(sub.rightAngle) < LEVER_DEADZONE;
  const lp = leftDead  ? 0 : sub.leftPercent;
  const rp = rightDead ? 0 : sub.rightPercent;
  return {
    leftPercent: lp,
    rightPercent: rp,
    leftAngle:  leftDead  ? 0 : sub.leftAngle  / -100,   // sol kolun işareti ters
    rightAngle: rightDead ? 0 : sub.rightAngle /  100,
    leftState:  leverState(lp),
    rightState: leverState(rp)
  };
}
const ButtonStateName = new Proxy({}, {
  get: (_, prop) => prop == 1 ? t('pressed') : t('released')
});
const LegoColor       = { None:-1, Black:0, Magenta:1, Purple:2, Blue:3, Azure:4, Turquoise:5,
                          Green:6, Yellow:7, Orange:8, Red:9, White:10 };
const LEGO_COLOR_NAMES = {
  en: { '-1':'no reading', 0:'black', 1:'magenta', 2:'purple', 3:'blue', 4:'azure',
        5:'turquoise', 6:'green', 7:'yellow', 8:'orange', 9:'red', 10:'white' },
  tr: { '-1':'okuma yok', 0:'siyah', 1:'macenta', 2:'mor', 3:'mavi', 4:'gök mavisi',
        5:'turkuaz', 6:'yeşil', 7:'sarı', 8:'turuncu', 9:'kırmızı', 10:'beyaz' }
};
const LegoColorName   = new Proxy({}, {
  get: (_, prop) => (LEGO_COLOR_NAMES[currentLang] && LEGO_COLOR_NAMES[currentLang][prop]) ||
                    LEGO_COLOR_NAMES.en[prop] || t('colorUnknown')
});
const LegoColorCss    = { '-1':'transparent', 0:'#1a1a1a', 1:'#d6218a', 2:'#7a3fd4', 3:'#2b5fd9',
                          4:'#2f9ee8', 5:'#16b9b0', 6:'#3aa74a', 7:'#f2c31a', 8:'#f08020',
                          9:'#d93025', 10:'#f0f0f0' };
const LightPattern     = { Solid:0, Breathe:1, Pulse:2, Short_blink:3, Long_blink:4, Double_blink:5 };
const LIGHT_PATTERN_NAMES = {
  en: { 0:'solid', 1:'breathe', 2:'pulse', 3:'short blink', 4:'long blink', 5:'double blink' },
  tr: { 0:'sabit', 1:'nefes', 2:'nabız', 3:'kısa yanıp sön', 4:'uzun yanıp sön', 5:'çift yanıp sön' }
};
const LightPatternName = new Proxy({}, {
  get: (_, prop) => (LIGHT_PATTERN_NAMES[currentLang] && LIGHT_PATTERN_NAMES[currentLang][prop]) ||
                    LIGHT_PATTERN_NAMES.en[prop] || String(prop)
});
const UsbPowerName    = new Proxy({}, { get: (_, prop) => prop == 1 ? 'USB' : t('battery') });
const ProductName     = {512:'Single Motor',513:'Double Motor',514:'Color Sensor',515:'Controller'};

/* ── mesaj kurucuları ───────────────────────────────────────────────────── */
const u8  = v => [v & 0xFF];
const i8  = v => [v < 0 ? (v + 256) & 0xFF : v & 0xFF];
const u16 = v => [v & 0xFF, (v >> 8) & 0xFF];
const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return [...b]; };
const msg = (id, ...payload) => Uint8Array.from([id, ...payload.flat()]);

const M = {
  infoRequest:      ()                  => msg(MSG.InfoRequest),
  notifyRequest:    delayMs             => msg(MSG.DeviceNotificationRequest, u16(delayMs)),
  run:              (mask, dir)         => msg(MSG.MotorRunCommand, u8(mask), u8(dir)),
  stop:             mask                => msg(MSG.MotorStopCommand, u8(mask)),
  runForDegrees:    (mask, deg, dir)    => msg(MSG.MotorRunForDegreesCommand, u8(mask), i32(deg), u8(dir)),
  runToAbsolute:    (mask, pos, dir)    => msg(MSG.MotorRunToAbsolutePositionCommand, u8(mask), u16(pos), u8(dir)),
  runToRelative:    (mask, pos)         => msg(MSG.MotorRunToRelativePositionCommand, u8(mask), i32(pos)),
  setSpeed:         (mask, speed)       => msg(MSG.MotorSetSpeedCommand, u8(mask), i8(speed)),
  setEndState:      (mask, end)         => msg(MSG.MotorSetEndStateCommand, u8(mask), i8(end)),
  setAcceleration:  (mask, acc, dec)    => msg(MSG.MotorSetAccelerationCommand, u8(mask), u8(acc), u8(dec)),
  resetPosition:    (mask, pos = 0)     => msg(MSG.MotorResetRelativePositionCommand, u8(mask), i32(pos)),
  // LightColorCommand: int8 renk, uint8 desen, uint8 parlaklık (0-100)
  lightColor: (color, pattern, intensity) => msg(MSG.LightColorCommand, i8(color), u8(pattern), u8(intensity))
};

/* ── gelen paket çözücü ─────────────────────────────────────────────────── */
function decode(bytes){
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = bytes[0];

  if(id === MSG.DeviceNotification){
    // [60][uint16 payload uzunluğu][alt mesajlar…]
    const out = [];
    let p = 3;
    const end = Math.min(bytes.length, 3 + dv.getUint16(1, true));
    while(p < end){
      const t = bytes[p];
      let size = DEV_MSG_SIZE[t];
      // bilinmeyen tip ya da taşma → kalanı sessizce bırak (firmware farkı olabilir)
      if(size === undefined || p + size > end) break;
      // Bazı firmware'lerde MotorNotification'ın sonunda 2 fazladan bayt var:
      // paketin sonundaki artığı ona ekle, böylece gesture doğru baytdan okunur.
      const extra = (t === DEV_MSG.Motor && end - p > size && end - p <= size + 2)
                    ? end - p - size : 0;
      out.push(decodeDeviceMessage(t, dv, p, extra));
      p += size + extra;
    }
    return { id, deviceData: out };
  }

  // InfoResponse tam 17 bayttır: id + 16 bayt gövde.
  // (Eskiden >= 20 aranıyordu; bu yüzden hiç çözülmüyordu.)
  if(id === MSG.InfoResponse && bytes.length >= 17){
    return { id, info:{
      rpc:       `${dv.getUint8(1)}.${dv.getUint8(2)}.${dv.getUint16(3,true)}`,
      firmware:  `${dv.getUint8(5)}.${dv.getUint8(6)}.${dv.getUint16(7,true)}`,
      bootloader:`${dv.getUint8(9)}.${dv.getUint8(10)}.${dv.getUint16(11,true)}`,
      maxPacketSize: dv.getUint16(13, true),
      productCode: dv.getUint16(15, true),
      product:   ProductName[dv.getUint16(15, true)] || dv.getUint16(15, true)
    }};
  }
  return { id };
}

function decodeDeviceMessage(t, dv, p, extra = 0){
  switch(t){
    case DEV_MSG.Info:
      return { type:'info', batteryLevel: dv.getUint8(p+1), usbPower: dv.getUint8(p+2) };
    case DEV_MSG.Motor:
      return { type:'motor',
        motorBitMask:     dv.getUint8(p+1),
        motorState:       dv.getUint8(p+2),
        absolutePosition: dv.getUint16(p+3, true),   // 0..359
        power:            dv.getInt16(p+5, true) / 100,   // yüzde
        speed:            dv.getInt8(p+7),
        position:         dv.getInt32(p+8, true),    // kümülatif, işaretli
        gesture:          dv.getInt8(p+12+extra) };
    case DEV_MSG.Button:
      return { type:'button', state: dv.getUint8(p+1) };
    case DEV_MSG.ColorSensor:
      return { type:'color',
        color:      dv.getInt8(p+1),      // LegoColor, -1 = okuma yok
        reflection: dv.getUint8(p+2),
        rawRed:     dv.getUint16(p+3, true),
        rawGreen:   dv.getUint16(p+5, true),
        rawBlue:    dv.getUint16(p+7, true),
        hue:        dv.getUint16(p+9, true),
        saturation: dv.getUint8(p+11),
        value:      dv.getUint8(p+12) };
    case DEV_MSG.Controller:
      return { type:'controller',
        leftPercent: dv.getInt8(p+1), rightPercent: dv.getInt8(p+2),
        leftAngle:   dv.getInt16(p+3, true), rightAngle: dv.getInt16(p+5, true) };
    default:
      return { type:'other', id:t };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Cihaz kaydı + yazma kuyruğu
   ══════════════════════════════════════════════════════════════════════════ */
const devices = new Map();
let selectedId = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tek seferde tek GATT yazması — "operation already in progress" engeli. */
function send(d, bytes){
  d.txQueue = d.txQueue.then(async () => {
    if(!d.char || !d.device.gatt.connected) return;
    // Tek BLE yazması MTU ile sınırlı; büyük çerçeveleri parçalara böl.
    // Karşı taraf zaten 0x02 sınırlayıcısıyla birleştiriyor.
    const limit = Math.max(20, Math.min(d.maxPacketSize || 200, 244));
    try{
      if(bytes.length <= limit){
        await d.char.writeValueWithoutResponse(bytes);
      }else{
        for(let i = 0; i < bytes.length; i += limit)
          await d.char.writeValueWithoutResponse(bytes.slice(i, i + limit));
      }
    }catch(e){ log(d, '⚠ gönderilemedi: ' + e.message, 'e'); }
  });
  return d.txQueue;
}

/* ══════════════════════════════════════════════════════════════════════════
   Motor komutları (tek ve çift motor ortak — fark sadece port maskesi)
   ══════════════════════════════════════════════════════════════════════════ */
const dirOf = s => s === 'CW' ? MotorDirection.Clockwise : MotorDirection.Counterclockwise;
const maskName = m => m === MotorBits.Both ? 'her iki motor'
                    : m === MotorBits.Right ? 'motor 2' : 'motor 1';

function jogStart(d, mask, dirStr){
  if(d.jogging) return;
  d.jogging = mask;
  send(d, M.setSpeed(mask, d.speed));
  send(d, M.run(mask, dirOf(dirStr)));
  log(d, `jog ${dirStr === 'CW' ? '↻ sağa' : '↺ sola'} — ${maskName(mask)} (hız ${d.speed})`);
}
function jogStop(d){
  if(!d.jogging) return;
  const mask = d.jogging;
  d.jogging = false;
  send(d, M.stop(mask));
  log(d, '⏹ durdu');
}
function runTurns(d, mask, turns, dirStr){
  const deg = Math.round(Number(turns) * 360);
  send(d, M.setSpeed(mask, d.speed));
  send(d, M.runForDegrees(mask, deg, dirOf(dirStr)));
  log(d, `${turns} tur = ${deg}° ${dirStr === 'CW' ? '↻ sağa' : '↺ sola'} — ${maskName(mask)}`);
}
function goToAngle(d, mask, angle, dirName){
  const pos = ((Math.round(Number(angle)) % 360) + 360) % 360;
  send(d, M.setSpeed(mask, d.speed));
  send(d, M.runToAbsolute(mask, pos, MotorDirection[dirName]));
  log(d, `→ ${pos}° (${dirName}) — ${maskName(mask)}`);
}
function emergencyStop(d){
  d.jogging = false;
  send(d, M.stop(MotorBits.Both));
  log(d, '■ acil durdurma', 'e');
}

/* ══════════════════════════════════════════════════════════════════════════
   Notification akışı — tip fark etmeksizin tek giriş noktası
   ══════════════════════════════════════════════════════════════════════════ */
function onNotify(d, ev){
  const bytes = new Uint8Array(ev.target.value.buffer);
  let m;
  try{ m = decode(bytes); }
  catch(e){ return; }

  if(d.rawLog){
    log(d, '← ' + [...bytes].map(b => b.toString(16).padStart(2,'0')).join(' '), 'rx');
  }

  if(m.id === MSG.InfoResponse && m.info){
    d.info = m.info;
    log(d, `${m.info.product}, firmware ${m.info.firmware}`, 'g');
    reconcileDeviceType(d, m.info);          // tipi cihazın kendisinden doğrula
    const el = d.el && d.el.querySelector('.fw');
    if(el) el.textContent = `${m.info.product} · fw ${m.info.firmware}`;
    return;
  }
  if(m.id !== MSG.DeviceNotification) return;

  for(const sub of m.deviceData){
    switch(sub.type){
      case 'info':
        d.state.battery  = sub.batteryLevel;
        d.state.usbPower = sub.usbPower;
        break;
      case 'motor':
        // cihazın kendi bildirdiği maskeyi kullan — tahmin etme
        d.state.motors[sub.motorBitMask] = sub;
        if(!d.masks.includes(sub.motorBitMask)) d.masks.push(sub.motorBitMask);
        break;
      case 'color': {
        const prev = d.state.color;
        d.state.color = sub;
        // ilk paket "okuma yok" ise sessiz kal; sadece gerçek değişimleri yaz
        if(prev ? prev.color !== sub.color : sub.color !== LegoColor.None){
          const ad = LegoColorName[sub.color] || 'bilinmiyor';
          if(sub.color === LegoColor.None) log(d, '🎨 renk okunamıyor');
          else log(d, `🎨 renk: ${ad} (yansıma %${sub.reflection})`, 'g');
        }
        break;
      }
      case 'controller': {
        const prev = d.ctrlView;
        const view = controllerView(sub);
        d.state.controller = sub;
        d.ctrlView = view;
        // ilk pakette kollar zaten ortadaysa log üretme
        const leverLog = (yan, st, prevSt, pct) => {
          if(prevSt ? prevSt === st : st === 'MIDDLE') return;
          log(d, `🎮 ${yan} kol: ${LeverStateName[st]}` +
                 (st === 'MIDDLE' ? ' (bırakıldı)' : ` (${pct}%)`),
              st === 'MIDDLE' ? '' : 'g');
        };
        leverLog('sol', view.leftState,  prev && prev.leftState,  view.leftPercent);
        leverLog('sağ', view.rightState, prev && prev.rightState, view.rightPercent);
        break;
      }
      case 'button': {
        const prev = d.state.button;
        d.state.button = sub;
        if(prev ? prev.state !== sub.state : sub.state === ButtonState.Pressed)
          log(d, `⏺ tuş: ${ButtonStateName[sub.state] || sub.state}`,
              sub.state === ButtonState.Pressed ? 'g' : '');
        break;
      }
    }
  }

  throttlePaint(d, () => { paint(d); paintPano(); });
}
