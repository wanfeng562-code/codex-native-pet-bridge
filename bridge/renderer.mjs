// Serialized into the pet renderer by our local controller. No React internals.
export async function installBridge(cfg) {
  const KEY = '__deepseekNativeBridgeV1';
  if (window[KEY]?.version === cfg.version) { window[KEY].heartbeat(); return window[KEY].snapshot(); }
  window[KEY]?.dispose('upgrade');
  if (location.protocol !== 'app:' || !location.href.includes('avatar-overlay')) throw Error('Not a native pet renderer');
  let disposed = false, ready = false, mounted = null, image = null, costume = null;
  let timer = null, watch = null, observer = null, resize = null, queued = null, painting = '';
  let nativeAction = 'idle', foregroundBusy = false, heartbeatAt = Date.now(), internalCancel = false;
  let playedFrames = 0, playbackLoops = 0;
  const events = [], assets = {}, tracker = createClickTracker();
  const valid = value => value === 'normal' || value === 'basin';
  const report = entry => {
    const event = {...entry, at:Date.now(), version:cfg.version};
    events.push(event); if (events.length > 100) events.shift();
    console.info('[DeepseekNativeBridge]', JSON.stringify(event));
  };
  const hover = createHoverGesture({emit(event) { report(event); repaint(); }});
  let initial = valid(cfg.savedForm) ? cfg.savedForm : 'normal';
  try { const saved = JSON.parse(localStorage.getItem(cfg.storageKey) || 'null'); if (saved?.petId === cfg.petId && valid(saved.form)) initial = saved.form; } catch {}
  const machine = createFormMachine({initial,
    save(form) { localStorage.setItem(cfg.storageKey, JSON.stringify({version:1, petId:cfg.petId, form, updatedAt:Date.now()})); return true; },
    emit(event) { report(event); repaint(); },
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stopPlayback = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const unmount = () => {
    stopPlayback(); painting = ''; tracker.reset(); hover.reset();
    resize?.disconnect(); resize = null;
    if (mounted) {
      mounted.avatar.style.opacity = mounted.opacity;
      mounted.button.removeAttribute('data-deepseek-runtime');
    }
    image?.remove(); image = null; costume = null; mounted = null;
  };
  const align = () => {
    if (!mounted || !image) return;
    const a = mounted.avatar.getBoundingClientRect(), b = mounted.button.getBoundingClientRect();
    Object.assign(image.style, {left:(a.left-b.left)+'px', top:(a.top-b.top)+'px', width:a.width+'px', height:a.height+'px'});
  };
  function repaint() {
    if (!ready || !mounted || !image || disposed) return;
    const state = machine.snapshot(), gesture = hover.snapshot();
    let baseAction = nativeAction;
    if (baseAction === 'jumping' && gesture.inside) {
      // Native hover masks the underlying action as jumping. Use visible task
      // status while the pointer stays inside so the one-shot can return to work.
      const statuses = [...document.querySelectorAll('[data-avatar-overlay-status], [role="img"][aria-label]')];
      const has = pattern => statuses.some(n => pattern.test(n.getAttribute('aria-label') || ''));
      if (foregroundBusy || statuses.some(n=>n.dataset.avatarOverlayStatus === 'spinner') || has(/正在运行|运行中|running/i)) baseAction = 'running';
      else if (has(/失败|受阻|已阻止|blocked|error/i)) baseAction = 'failed';
      else if (has(/需要.*输入|等待.*确认|needs? input|approval/i)) baseAction = 'waiting';
      else if (has(/已完成|就绪|ready|complete/i)) baseAction = 'review';
      else baseAction = 'idle';
    }
    const action = gesture.active ? 'hissing' : baseAction === 'idle' && foregroundBusy ? 'running' : baseAction;
    const plan = planFor(state, action, cfg.data);
    const signature = `${state.form}:${state.phase}:${state.generation}:${plan.action}:${plan.gesture ? gesture.generation : 0}:${reduced.matches}`;
    if (painting === signature) return;
    painting = signature; stopPlayback(); playbackLoops = 0;
    image.style.backgroundImage = 'url("'+assets[plan.sheet]+'")';
    image.dataset.action = plan.action; image.dataset.form = state.form; image.dataset.phase = state.phase;
    costume.style.display = plan.costume ? 'block' : 'none';
    let index = reduced.matches && plan.oneShot ? plan.frames.length-1 : 0;
    const paint = () => {
      if (!image || disposed) return;
      const f = plan.frames[index];
      playedFrames++;
      image.style.backgroundPosition = `${f.column/7*100}% ${f.row/8*100}%`;
      image.dataset.frame = String(index); image.dataset.row = String(f.row);
      if (plan.costume) {
        const anchor = cfg.data.helmet.anchors[f.row+':'+f.column];
        costume.style.display = anchor ? 'block' : 'none';
        if (anchor) costume.style.transform = `translate(${anchor.x}%, ${anchor.y}%) scale(${anchor.scale}) rotate(${anchor.rotation}deg)`;
      }
    };
    const finish = () => {
      if (painting !== signature || !plan.oneShot) return;
      if (plan.gesture) hover.complete(gesture.generation);
      else machine.complete(state.generation);
    };
    const tick = () => {
      if (disposed || painting !== signature || !mounted) return;
      if (++index >= plan.frames.length) {
        if (plan.oneShot) { timer = null; finish(); return; }
        index = 0; playbackLoops++;
      }
      paint(); timer = setTimeout(tick, plan.frames[index].duration);
    };
    paint();
    if (!reduced.matches) timer = setTimeout(tick, plan.frames[index].duration);
    else if (plan.gesture) timer = setTimeout(finish, 800);
    else if (plan.oneShot) queueMicrotask(finish);
    report({event:'playback', nativeAction, foregroundBusy, action:plan.action, form:state.form, phase:state.phase, costume:plan.costume});
  }
  const sync = () => {
    queued = null; if (disposed || !ready) return;
    const button = document.querySelector('[data-testid="avatar-mascot-button"]');
    const avatar = button?.querySelector('[data-codex-pet-id][data-codex-pet-state]');
    if (!button || !avatar || avatar.dataset.codexPetId !== cfg.petId) { if (mounted) { report({event:'unmounted', reason:'pet-hidden-or-selection-changed'}); unmount(); } return; }
    if (mounted?.avatar !== avatar || mounted?.button !== button) {
      unmount(); mounted = {button, avatar, opacity:avatar.style.opacity};
      image = document.createElement('span'); image.id = 'deepseek-native-runtime-sprite'; image.setAttribute('aria-hidden','true');
      Object.assign(image.style, {position:'absolute', zIndex:'11', pointerEvents:'none', backgroundRepeat:'no-repeat', backgroundSize:'800% 900%', display:'block'});
      costume = document.createElement('span'); costume.dataset.deepseekCostume = 'basin';
      Object.assign(costume.style, {position:'absolute', inset:'0', pointerEvents:'none', backgroundImage:'url("'+assets['helmet-texture']+'")', backgroundRepeat:'no-repeat', backgroundSize:'800% 900%', backgroundPosition:'0% 0%', clipPath:cfg.data.helmet.clipPath, transformOrigin:'50% 50%', zIndex:'2'});
      image.append(costume); button.append(image); button.dataset.deepseekRuntime = cfg.version;
      avatar.style.opacity = '0'; resize = new ResizeObserver(align); resize.observe(avatar); resize.observe(button); align();
      if (button.matches(':hover')) hover.enter({blocked:true});
      report({event:'mounted', petId:cfg.petId, form:machine.snapshot().form});
    }
    nativeAction = avatar.dataset.codexPetState || 'idle'; align(); repaint();
  };
  const queueSync = () => { if (queued === null && !disposed) queued = requestAnimationFrame(sync); };
  const isPet = target => !!mounted && target instanceof Element && !!target.closest('[data-deepseek-runtime]') && !target.closest('button, [data-testid="avatar-overlay-notification-badge"]');
  const onDown = e => tracker.down(e, isPet(e.target));
  const onMove = e => { if (tracker.move(e) && (e.buttons & 1)) hover.cancel('drag'); };
  const onOver = e => {
    if (e.pointerType === 'touch' || e.buttons || !isPet(e.target) || (e.relatedTarget instanceof Node && mounted.button.contains(e.relatedTarget))) return;
    hover.enter({blocked:!ready || machine.snapshot().phase === 'transforming'});
  };
  const onOut = e => {
    if (!mounted || !(e.target instanceof Element) || !mounted.button.contains(e.target)) return;
    if (e.relatedTarget instanceof Node && mounted.button.contains(e.relatedTarget)) return;
    const r = mounted.button.getBoundingClientRect();
    // Sprite alpha/transparent-window hit testing can emit out/over without
    // physical movement. Only a real exit from the pet's box rearms the hiss.
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return;
    hover.leave();
  };
  const onUp = e => {
    const result = tracker.up(e, performance.now());
    if (!result.click || !mounted) return;
    // Let the native cancellation handler release its pointer/drag state, while
    // suppressing its single-click chat action. Real drags are never cancelled.
    let capture = mounted.button;
    while (capture && !capture.hasPointerCapture?.(e.pointerId)) capture = capture.parentElement;
    internalCancel = true;
    try { (capture || mounted.button).dispatchEvent(new PointerEvent('pointercancel', {bubbles:true, pointerId:e.pointerId, pointerType:e.pointerType, button:0, screenX:e.screenX, screenY:e.screenY, clientX:e.clientX, clientY:e.clientY})); }
    finally { internalCancel = false; }
    report({event:'pet-click', double:result.double, trusted:e.isTrusted});
    if (result.double && ready) { hover.cancel('transform'); machine.toggle(); }
  };
  const onCancel = () => { if (!internalCancel) { tracker.reset(); hover.leave(); } };
  const onDouble = e => { if (isPet(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onStorage = e => {
    if (e.key !== cfg.storageKey || !e.newValue) return;
    try { const saved = JSON.parse(e.newValue); if (saved.petId === cfg.petId) machine.restore(saved.form); } catch {}
  };
  const bindings = [['pointerover',onOver],['pointerout',onOut],['pointerdown',onDown],['pointermove',onMove],['pointerup',onUp],['pointercancel',onCancel],['blur',onCancel],['dblclick',onDouble],['storage',onStorage]];
  const api = {
    version:cfg.version,
    heartbeat() { heartbeatAt = Date.now(); return api.snapshot(); },
    setActivity(busy) { heartbeatAt = Date.now(); if (foregroundBusy !== Boolean(busy)) { foregroundBusy = Boolean(busy); report({event:'foreground-activity', busy:foregroundBusy}); repaint(); } return api.snapshot(); },
    snapshot() { return {version:cfg.version, ready, mounted:!!mounted, petId:mounted?.avatar.dataset.codexPetId ?? null, nativeAction, foregroundBusy, ...machine.snapshot(), hovered:hover.snapshot().inside, hissing:hover.snapshot().active, action:image?.dataset.action ?? null, frame:Number(image?.dataset.frame ?? 0), playedFrames, playbackLoops, costume:costume?.style.display === 'block', events:events.slice(-25)}; },
    dispose(reason = 'requested') {
      if (disposed) return; disposed = true;
      stopPlayback(); clearInterval(watch); observer?.disconnect();
      if (queued !== null) cancelAnimationFrame(queued);
      for (const [name,fn] of bindings) window.removeEventListener(name,fn,true);
      reduced.removeEventListener('change',repaint); unmount();
      for (const url of Object.values(assets)) URL.revokeObjectURL(url);
      report({event:'disposed', reason}); if (window[KEY] === api) delete window[KEY];
    },
  };
  window[KEY] = api;
  try {
    for (const [name,encoded] of Object.entries(cfg.assets)) {
      const raw = atob(encoded), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      assets[name] = URL.createObjectURL(new Blob([bytes], {type:'image/webp'}));
      const test = new Image(); test.src = assets[name]; await test.decode();
    }
    if (disposed) return {ready:false, disposed:true};
    ready = true;
    for (const [name,fn] of bindings) window.addEventListener(name,fn,true);
    reduced.addEventListener('change',repaint);
    observer = new MutationObserver(records => {
      if (records.some(r => r.type === 'childList' || ['data-codex-pet-state','data-codex-pet-id'].includes(r.attributeName))) queueSync();
    });
    observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['data-codex-pet-state','data-codex-pet-id']});
    watch = setInterval(() => { if (Date.now()-heartbeatAt > 8000) api.dispose('controller-disconnected'); else sync(); }, 1000);
    sync(); report({event:'ready', restoredForm:initial}); return api.snapshot();
  } catch (error) { api.dispose('installation-failed'); throw error; }
}
