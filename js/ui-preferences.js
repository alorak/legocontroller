/* ── Log paneli gizleme / açma (localStorage kalıcı) ─────────────────── */
const LOG_COLLAPSED_KEY = 'deviceController.logCollapsed';

function isLogCollapsed(){
  return localStorage.getItem(LOG_COLLAPSED_KEY) === 'true';
}

function setLogCollapsed(collapsed){
  try { localStorage.setItem(LOG_COLLAPSED_KEY, collapsed ? 'true' : 'false'); } catch(e){}
  applyLogCollapse(collapsed);
}

function applyLogCollapse(collapsed){
  const ws = document.getElementById('workspace');
  const openBtn = document.getElementById('logOpenBtn');
  if(ws) ws.classList.toggle('log-collapsed', collapsed);
  if(openBtn) openBtn.style.display = collapsed ? 'flex' : 'none';
}
