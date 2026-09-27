/* BlockCode görselleri çevrimdışı/erişilemez olduğunda yerel SVG'ye dön. */
const BLOCKCODE_IMAGE_BASE = 'https://blockcode.alorak.com/img/';
window.addEventListener('error', event => {
  const img = event.target;
  if(!(img instanceof HTMLImageElement) || img.dataset.blockcodeFallback === '1') return;
  if(!img.src.startsWith(BLOCKCODE_IMAGE_BASE)) return;
  try{
    const file = new URL(img.src).pathname.split('/').pop() || '';
    if(!file.toLowerCase().endsWith('.png')) return;
    img.dataset.blockcodeFallback = '1';
    const fallbackFile = file === 'remote_controller_icon.png'
      ? 'remote-controller.svg'
      : file.replace(/\.png$/i, '.svg');
    img.src = './img/' + fallbackFile;
  }catch(e){}
}, true);

/* ── Başlat ───────────────────────────────────────────────────────────── */
applyLogCollapse(isLogCollapsed());
const colBtn = document.getElementById('logCollapseBtn');
if(colBtn) colBtn.onclick = () => setLogCollapsed(true);
const opnBtn = document.getElementById('logOpenBtn');
if(opnBtn) opnBtn.onclick = () => setLogCollapsed(false);

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.onclick = () => setLang(btn.dataset.lang);
});
setLang(currentLang);
panoLoad();
padLoadConfig();
initPadListeners();

document.querySelectorAll('.viewnav button').forEach(b =>
  b.onclick = () => showView(b.dataset.view));
document.querySelectorAll('[data-pano]').forEach(b =>
  b.onclick = () => panoCommand(b.dataset.pano));
document.getElementById('pmSave').onclick = savePanoModal;
document.getElementById('pmDelete').onclick = () => {
  document.getElementById('pmDanger').classList.add('confirming');
  document.getElementById('pmConfirm').classList.add('on');
};
document.getElementById('pmDeleteNo').onclick = () => {
  document.getElementById('pmDanger').classList.remove('confirming');
  document.getElementById('pmConfirm').classList.remove('on');
};
document.getElementById('pmDeleteYes').onclick = deleteActivePano;
document.getElementById('pmName').addEventListener('keydown', e => {
  if(e.key === 'Enter')  savePanoModal();
  if(e.key === 'Escape') closePanoModal();
});
if(location.hash === '#pano') showView('pano');
else if(location.hash === '#pad') showView('pad');
else renderPanoTabs();
