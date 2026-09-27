/* ══════════════════════════════════════════════════════════════════════════
   LWP3 — SPIKE Prime / Essential hub protokolü
   ──────────────────────────────────────────────────────────────────────────
   fd02 cihazlarından TAMAMEN farklı bir protokol. Mesaj biçimi:
       [uzunluk][hubId=0][mesajTipi][gövde…]
   Hub bağlanınca takılı cihazları kendiliğinden HUB_ATTACHED_IO ile bildirir;
   her porta ayrıca PORT_INPUT_FORMAT_SETUP ile abone olmak gerekir.
   ══════════════════════════════════════════════════════════════════════════ */
const LWP3_SVC  = '00001623-1212-efde-1623-785feabcd123';
const LWP3_CHAR = '00001624-1212-efde-1623-785feabcd123';

const LWP3_MSG = {
  HUB_PROPERTIES:     0x01,
  HUB_ATTACHED_IO:    0x04,
  PORT_INPUT_FORMAT:  0x41,
  PORT_VALUE:         0x45,
  PORT_OUTPUT:        0x81
};
/* 0x02 = Button: kumandanın ortasındaki YEŞİL düğme buradan gelir.
   Bir port değeri değildir — eski kod 59/60'ı dinliyordu, onlar voltaj ve RSSI. */
const LWP3_PROP = { NAME: 0x01, BUTTON: 0x02, BATTERY: 0x06 };
const LWP3_PROP_OP = { ENABLE_UPDATES: 0x02, REQUEST_UPDATE: 0x05, UPDATE: 0x06 };

/* Porta takılabilen cihaz tipleri (IO type) */
const IO_TYPE = {
  MEDIUM_MOTOR_48: 48, LARGE_MOTOR_49: 49,
  MOTOR_75: 75, MOTOR_76: 76, MOTOR_38: 38, MOTOR_39: 39,
  MOTOR_46: 46, MOTOR_47: 47, MOTOR_65: 65, MOTOR_66: 66,
  COLOR_SENSOR: 0x3D, DISTANCE_SENSOR: 0x3E, FORCE_SENSOR: 0x3F,
  MATRIX_3X3: 0x40, LIGHT_MATRIX: 0x60
};
/* Motor sayılan IO tipleri. 1 (Powered Up Orta Motor) ve 2 (Tren Motoru)
   eksikti; City/Boost hub'larının tipik motorları bunlar olduğu için
   motor paneli yerine genel panele düşüyorlardı. */
const MOTOR_IO_TYPES = [1, 2, 38, 39, 46, 47, 48, 49, 65, 66, 75, 76];

const IO_TYPE_NAMES = {
  en: {
    1:'Medium Motor', 2:'Train Motor', 4:'Matrix', 6:'Motor', 8:'Light', 23:'RGB Light',
    34:'Tilt Sensor', 35:'Motion Sensor', 37:'Color & Distance Sensor',
    38:'BOOST Motor', 39:'BOOST Internal Motor', 40:'Tilt Sensor',
    41:'Motion Sensor', 42:'Color & Distance Sensor', 46:'Large Motor', 47:'XL Motor',
    48:'Medium Motor', 49:'Large Motor',
    57:'Gyroscope', 58:'Accelerometer', 59:'Tilt Sensor',
    61:'Color Sensor', 62:'Distance Sensor', 63:'Force Sensor',
    64:'Color Matrix', 65:'Small Motor', 66:'Large Motor',
    75:'Medium Motor', 76:'Large Motor', 96:'Light Matrix'
  },
  tr: {
    1:'Orta Motor', 2:'Tren Motoru', 4:'Matris', 6:'Motor', 8:'Işık', 23:'RGB Işık',
    34:'Eğim Sensörü', 35:'Hareket Sensörü', 37:'Renk ve Mesafe Sensörü',
    38:'BOOST Motor', 39:'BOOST Dahili Motor', 40:'Eğim Sensörü',
    41:'Hareket Sensörü', 42:'Renk ve Mesafe Sensörü', 46:'Büyük Motor', 47:'XL Motor',
    48:'Orta Motor', 49:'Büyük Motor',
    57:'Jiroskop', 58:'İvmeölçer', 59:'Eğim Sensörü',
    61:'Renk Sensörü', 62:'Mesafe Sensörü', 63:'Kuvvet Sensörü',
    64:'Renk Matrisi', 65:'Küçük Motor', 66:'Büyük Motor',
    75:'Orta Motor', 76:'Büyük Motor', 96:'Işık Matrisi'
  }
};
const IO_TYPE_NAME = new Proxy({}, {
  get: (_, prop) => (IO_TYPE_NAMES[currentLang] && IO_TYPE_NAMES[currentLang][prop]) ||
                    (IO_TYPE_NAMES.en && IO_TYPE_NAMES.en[prop]) ||
                    (IO_TYPE_NAMES.tr && IO_TYPE_NAMES.tr[prop])
});
const ioTypeName = t => IO_TYPE_NAME[t] || (currentLang === 'tr' ? `Bilinmeyen (${t})` : `Unknown (${t})`);

function portTypeName(p){
  if(!p || p.kind == null) return t('emptySlot');
  const code = p.model != null ? p.model : (p.rawModel != null ? p.rawModel : p.type);
  if(code != null && IO_TYPE_NAME[code]) return IO_TYPE_NAME[code];
  return KIND_NAME[p.kind] || t('device');
}

/* İki hub protokolü farklı cihaz numaraları kullanıyor (LWP3 vs SPIKE App3).
   Panelleri ortak tutmak için hepsini tek bir "kind" adına indirgiyoruz. */
function lwp3Kind(t){
  if(MOTOR_IO_TYPES.includes(t))    return 'motor';
  if(t === 37 || t === 42)          return 'color';   // BOOST renk+mesafe sensörü
  if(t === 34 || t === 40)          return 'other';   // eğim sensörü
  if(t === 35 || t === 41)          return 'distance';// hareket/mesafe sensörü
  if(t === IO_TYPE.COLOR_SENSOR)    return 'color';
  if(t === IO_TYPE.DISTANCE_SENSOR) return 'distance';
  if(t === IO_TYPE.FORCE_SENSOR)    return 'force';
  if(t === IO_TYPE.MATRIX_3X3 || t === IO_TYPE.LIGHT_MATRIX) return 'matrix';
  return 'other';
}

/** Wire LED color picker swatches for Remote Controller card */
function wireRemoteLedPicker(d){
  if(!d.el) return;
  const picker = d.el.querySelector(`#remoteLedPicker_${d.id}`);
  if(!picker) return;
  picker.querySelectorAll('[data-led-color]').forEach(btn => {
    btn.onclick = async () => {
      const colorName = btn.dataset.ledColor;
      const colorMap = { off:0, pink:1, purple:2, blue:3, light_blue:4,
                        cyan:5, green:6, yellow:7, orange:8, red:9, white:10 };
      const colorIdx = colorMap[colorName] ?? 0;
      // LWP3 Port Output: port 52 (0x34) = RGB LED, WriteDirectModeData mode 0
      const cmd = new Uint8Array([0x08,0x00,0x81,0x34,0x11,0x51,0x00,colorIdx]);
      await send(d, cmd);
      const ledEl = d.el.querySelector(`#remoteLed_${d.id}`);
      if(ledEl){
        const hex = btn.style.background;
        ledEl.style.background = colorIdx === 0 ? '#333' : hex;
        ledEl.style.boxShadow  = colorIdx === 0 ? 'none' : `0 0 10px ${hex}`;
      }
      if(!d.remoteState) d.remoteState = { left:0, right:0, green:false, led:0 };
      d.remoteState.led = colorIdx;
      log(d, `💡 LED: ${colorName}`, 'g');
    };
  });
}
const KIND_NAMES = {
  en: { motor:'Motor', force:'Force Sensor', color:'Color Sensor', distance:'Distance Sensor', matrix:'Color Matrix', other:'Device' },
  tr: { motor:'Motor', force:'Kuvvet Sensörü', color:'Renk Sensörü', distance:'Mesafe Sensörü', matrix:'Renk Matrisi', other:'Cihaz' }
};
const KIND_NAME = new Proxy({}, {
  get: (_, prop) => (KIND_NAMES[currentLang] && KIND_NAMES[currentLang][prop]) ||
                    KIND_NAMES.en[prop] || t('device')
});
const KIND_ICON = { motor:'https://blockcode.alorak.com/img/spike_motor_icon.png', force:'https://blockcode.alorak.com/img/force_sensor_icon.png',
                    color:'https://blockcode.alorak.com/img/color_sensor_icon.png', distance:'https://blockcode.alorak.com/img/distance_sensor_icon.png',
                    matrix:'https://blockcode.alorak.com/img/matrix_icon.png', other:'https://blockcode.alorak.com/img/hub_light_icon.png' };
const kindIcon = k => KIND_ICON[k] || KIND_ICON.other;

const PORT_LETTERS = ['A','B','C','D','E','F'];
/* Başlangıç slot sayıları. City Hub'ın 2 dış portu var; Boost Move Hub'da
   A/B dahili motorlar + C/D dış port olmak üzere 4 port kimliği kullanılıyor.
   Bunlar yalnızca BAŞLANGIÇ değeri: hub daha yüksek bir porta cihaz takıldığını
   bildirirse slot listesi kendiliğinden büyür (bkz. hubEnsureSlot). */
const HUB_SLOTS = { spike_prime:6, technic_hub:4, boost_move_hub:4,
                    city_hub:2, spike_essential:2, remote_controller:2 };
const isHubType    = key => Object.prototype.hasOwnProperty.call(HUB_SLOTS, key);
const hubSlotCount = key => HUB_SLOTS[key] || 2;

/* Renk sensörü (LWP3) renk indeksleri — fd02'dekinden farklı numaralandırma */
const LWP3_COLOR_NAMES = {
  en: { 255:'no reading', 0:'black', 1:'purple', 3:'blue', 4:'azure',
        5:'turquoise', 6:'green', 7:'yellow', 9:'red', 10:'white' },
  tr: { 255:'okuma yok', 0:'siyah', 1:'mor', 3:'mavi', 4:'gök mavisi',
        5:'turkuaz', 6:'yeşil', 7:'sarı', 9:'kırmızı', 10:'beyaz' }
};
const LWP3_COLOR_NAME = new Proxy({}, {
  get: (_, prop) => (LWP3_COLOR_NAMES[currentLang] && LWP3_COLOR_NAMES[currentLang][prop]) ||
                    (LWP3_COLOR_NAMES.en && LWP3_COLOR_NAMES.en[prop]) || t('colorUnknown')
});
const LWP3_COLOR_CSS  = { 255:'transparent', 0:'#1a1a1a', 1:'#be00fe', 3:'#2465d6',
                          4:'#4dbeea', 5:'#00857d', 6:'#00a831', 7:'#ffc90f',
                          9:'#d93025', 10:'#f0f0f0' };

/* ── Mesaj kurucuları ─────────────────────────────────────────────────── */
const lwp3 = (...bytes) => { const a = [bytes.length + 1, ...bytes]; return Uint8Array.from(a); };

const HUB_CMD = {
  // [len][0][01][prop][op]
  propRequest: prop => lwp3(0x00, LWP3_MSG.HUB_PROPERTIES, prop, LWP3_PROP_OP.REQUEST_UPDATE),
  propSubscribe: prop => lwp3(0x00, LWP3_MSG.HUB_PROPERTIES, prop, LWP3_PROP_OP.ENABLE_UPDATES),
  // [0A][00][41][port][mode][delta int32][notify]
  portSubscribe: (port, mode, delta = 1) => Uint8Array.from(
    [0x0A, 0x00, LWP3_MSG.PORT_INPUT_FORMAT, port, mode,
     delta & 0xFF, (delta >> 8) & 0xFF, 0x00, 0x00, 0x01])
};

/** Takılı cihaza göre hangi moda abone olunacağı. */
function portModeFor(ioType){
  if(MOTOR_IO_TYPES.includes(ioType)) return { mode: 0x03, delta: 2 };  // mutlak konum
  return { mode: 0x00, delta: 1 };
}

/* ── Gelen LWP3 mesajı ────────────────────────────────────────────────── */
function onHubNotify(d, ev){
  const bytes = new Uint8Array(ev.target.value.buffer);
  if(bytes.length < 3) return;
  if(d.rawLog) log(d, '← ' + [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(' '), 'rx');

  const msg = bytes[2];

  if(msg === LWP3_MSG.HUB_PROPERTIES && bytes.length > 5){
    const prop = bytes[3];
    if(prop === LWP3_PROP.BATTERY){
      d.state.battery = bytes[5];
    }else if(prop === LWP3_PROP.BUTTON){
      const basili = bytes[5] === 1;
      if(!d.remoteState) d.remoteState = { left:0, right:0, green:false, led:0 };
      if(d.remoteState.green !== basili){
        d.remoteState.green = basili;
        log(d, `🎮 ${t('m_greenButton')}: ${basili ? t('pressed') : t('released')}`,
            basili ? 'g' : '');
      }
      const g = d.el && d.el.querySelector(`#rGreen_${d.id}`);
      if(g) g.classList.toggle('active', basili);
      throttlePaint(d, () => paintPano());
    }else if(prop === LWP3_PROP.NAME){
      let name = '';
      for(let i = 5; i < bytes.length && bytes[i]; i++) name += String.fromCharCode(bytes[i]);
      if(name){
        d.name = name;
        setText(d.el, '.name', name);
        if(d.item) setText(d.item, '.t1', name);
      }
    }
  }

  else if(msg === LWP3_MSG.HUB_ATTACHED_IO && bytes.length >= 5){
    const port = bytes[3], event = bytes[4];
    // Takma bildirimi beklenenden yüksek bir porttan geldiyse slotu aç.
    // Çıkarma bildiriminde açmaya gerek yok (zaten bilmediğimiz bir port).
    if(port >= d.slotCount){
      if(event !== 0x01 || !hubEnsureSlot(d, port)) return;   // dahili portlar — atla
    }
    if(event === 0x00){
      const prev = d.ports[port];
      d.ports[port] = { kind:null, type:null, value:null };
      if(prev && prev.kind != null) log(d, `⊘ Port ${PORT_LETTERS[port]} ${t('portDisconnected')}`);
      renderHubSlots(d);
    }else if(event === 0x01 && bytes.length >= 7){
      const ioType = bytes[5] | (bytes[6] << 8);
      d.ports[port] = {
        kind: lwp3Kind(ioType),
        type: ioType,
        model: ioType,
        value: null,
        get typeName(){ return portTypeName(this); }
      };
      if(d.type !== 'remote_controller'){
        log(d, `⊕ Port ${PORT_LETTERS[port]}: ${portTypeName(d.ports[port])}`, 'g');
        const { mode, delta } = portModeFor(ioType);
        send(d, HUB_CMD.portSubscribe(port, mode, delta));
        renderHubSlots(d);
      }
    }
  }

  /* ── Remote Controller button values (0x45 Port Value) ──────────────── */
  else if(msg === LWP3_MSG.PORT_VALUE && bytes.length >= 5 && d.type === 'remote_controller'){
    const port = bytes[3];
    const val  = bytes[4];  // 0x01=+, 0x7f=stop, 0xff=-, 0x00=released
    if(!d.remoteState) d.remoteState = { left:0, right:0, green:false, led:0 };
    const stateName = v => v===0x01?'+' : v===0xff?'-' : v===0x7f?'■' : '○';
    if(port === 0){
      d.remoteState.left = val;
      const lbl = stateName(val);
      if(d.el){
        const plus  = d.el.querySelector(`#rL_plus_${d.id}`);
        const minus = d.el.querySelector(`#rL_minus_${d.id}`);
        const stop  = d.el.querySelector(`#rL_red_${d.id}`);
        if(plus)  plus.classList.toggle('active', val===0x01);
        if(minus) minus.classList.toggle('active', val===0xff);
        if(stop)  stop.classList.toggle('active', val===0x7f);
      }
      log(d, `🎮 L: ${lbl}`);
    } else if(port === 1){
      d.remoteState.right = val;
      const lbl = stateName(val);
      if(d.el){
        const plus  = d.el.querySelector(`#rR_plus_${d.id}`);
        const minus = d.el.querySelector(`#rR_minus_${d.id}`);
        const stop  = d.el.querySelector(`#rR_red_${d.id}`);
        if(plus)  plus.classList.toggle('active', val===0x01);
        if(minus) minus.classList.toggle('active', val===0xff);
        if(stop)  stop.classList.toggle('active', val===0x7f);
      }
      log(d, `🎮 R: ${lbl}`);
    }
    // Not: yeşil düğme port değeri olarak GELMEZ; hub özelliği 0x02 ile gelir
    // (yukarıdaki HUB_PROPERTIES dalında ele alınıyor). 59/60 voltaj ve RSSI'dır.
    throttlePaint(d, () => paintPano());
    return; // skip generic paint below
  }

  else if(msg === LWP3_MSG.PORT_VALUE && bytes.length >= 5){
    const port = bytes[3];
    const p = d.ports[port];
    if(!p || p.kind == null) return;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if(p.kind === 'motor'){
      let a = bytes.length >= 8 ? dv.getInt32(4, true) : dv.getInt16(4, true);
      p.value = ((a % 360) + 360) % 360;
      p.raw = a;
    }
    else if(p.kind === 'force'){
      const raw = bytes[4];                       // desinewton (0-100)
      const pressed = raw > 0;
      if(p.pressed !== pressed)
        log(d, `⏺ Port ${PORT_LETTERS[port]} ${t('button')}: ${pressed ? t('pressed') : t('released')}`,
            pressed ? 'g' : '');
      p.pressed = pressed;
      p.value = raw;
    }
    else if(p.kind === 'distance'){
      p.value = bytes.length >= 6 ? (bytes[4] | (bytes[5] << 8)) / 10 : bytes[4];  // cm
    }
    else if(p.kind === 'color'){
      const c = bytes[4];
      if(p.value !== c){
        const ad = LWP3_COLOR_NAME[c] || `bilinmeyen (${c})`;
        log(d, `🎨 Port ${PORT_LETTERS[port]}: ${ad}`, c === 255 ? '' : 'g');
      }
      p.value = c;
    }
    else p.value = bytes[4];
  }

  throttlePaint(d, () => { paintHub(d); paintPano(); });
}
