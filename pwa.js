(() => {
  const statusEl=document.getElementById('networkStatus');
  const statusText=document.getElementById('networkStatusText');
  const installBtn=document.getElementById('pwaInstallBtn');
  const toast=document.getElementById('pwaUpdateToast');
  const toastTitle=document.getElementById('pwaUpdateTitle');
  const toastText=document.getElementById('pwaUpdateText');
  const reloadBtn=document.getElementById('pwaReloadBtn');

  const labels=()=>{
    const tr=document.documentElement.lang==='tr';
    return tr ? {
      online:'Çevrimiçi',offline:'Çevrimdışı',install:'Uygulamayı Yükle',
      updateTitle:'Yeni sürüm hazır',updateText:'En güncel sürümü kullanmak için yenileyin.',refresh:'Yenile'
    } : {
      online:'Online',offline:'Offline',install:'Install App',
      updateTitle:'New version available',updateText:'Refresh to use the latest version.',refresh:'Refresh'
    };
  };

  function paintNetworkState(){
    const copy=labels();
    const offline=!navigator.onLine;
    if(statusEl) statusEl.dataset.offline=offline?'true':'false';
    if(statusText) statusText.textContent=offline?copy.offline:copy.online;
    if(installBtn) installBtn.textContent=copy.install;
    if(toastTitle) toastTitle.textContent=copy.updateTitle;
    if(toastText) toastText.textContent=copy.updateText;
    if(reloadBtn) reloadBtn.textContent=copy.refresh;
  }

  window.addEventListener('online',paintNetworkState);
  window.addEventListener('offline',paintNetworkState);
  new MutationObserver(paintNetworkState).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  paintNetworkState();

  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    if(installBtn) installBtn.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    if(installBtn) installBtn.hidden=true;
  });
  if(installBtn){
    installBtn.addEventListener('click',async()=>{
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      try{await deferredPrompt.userChoice;}catch(e){}
      deferredPrompt=null;
      installBtn.hidden=true;
    });
  }

  if(!('serviceWorker' in navigator) || !(location.protocol==='https:' || location.hostname==='localhost')) return;

  let registration=null;
  let refreshing=false;
  const showUpdate=()=>{if(toast && navigator.serviceWorker.controller) toast.hidden=false;};

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing) return;
    refreshing=true;
    location.reload();
  });

  window.addEventListener('load',async()=>{
    try{
      registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});
      if(registration.waiting) showUpdate();
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
    }catch(err){
      console.warn('Service worker kaydedilemedi:',err);
    }
  });

  if(reloadBtn){
    reloadBtn.addEventListener('click',()=>{
      if(registration && registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }else{
        location.reload();
      }
    });
  }
})();
