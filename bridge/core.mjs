export function createFormMachine({initial = 'normal', save = () => true, emit = () => {}} = {}) {
  let form = initial === 'basin' ? 'basin' : 'normal', phase = 'stable', generation = 0;
  const snapshot = () => ({form, phase, generation});
  const commit = (next, reason) => {
    form = next; phase = 'stable'; generation++;
    let persisted = false;
    try { persisted = save(form) !== false; } catch {}
    emit({event: 'form-change', ...snapshot(), reason, persisted});
    return snapshot();
  };
  return {
    snapshot,
    toggle() {
      if (phase !== 'stable') return false;
      if (form === 'basin') { commit('normal', 'double-click'); return true; }
      phase = 'transforming'; generation++;
      emit({event: 'transform-start', ...snapshot()}); return true;
    },
    complete(id) {
      if (phase !== 'transforming' || id !== generation) return false;
      emit({event: 'transform-complete', ...snapshot()});
      commit('basin', 'last-frame-complete'); return true;
    },
    restore(next) {
      if (next !== 'normal' && next !== 'basin') return false;
      form = next; phase = 'stable'; generation++;
      emit({event: 'form-restored', ...snapshot()}); return true;
    },
  };
}

export function planFor(state, action, data) {
  const frames = (row, times) => times.map((duration, column) => ({row, column, duration}));
  if (state.phase === 'transforming') return {action: 'transforming', sheet: 'transition', frames: frames(0, data.durations.transition), oneShot: true, costume: false};
  if (action === 'hissing') return {action, sheet:'hissing', frames:frames(state.form === 'basin' ? 1 : 0,data.durations.hissing), oneShot:true, gesture:true, costume:false};
  let list;
  if (action === 'idle') list = frames(0, state.form === 'basin' ? data.durations.basinIdle : data.durations.normalIdle);
  else if (action === 'running') list = frames(7, data.durations.running);
  else if (action === 'failed') list = frames(5, data.durations.failed);
  else {
    const specs = {'running-right':[1,8,120,220], 'running-left':[2,8,120,220], waving:[3,4,140,280], jumping:[4,5,140,280], waiting:[6,6,150,260], review:[8,6,150,280]};
    const s = specs[action];
    if (!s) return planFor(state, 'idle', data);
    list = frames(s[0], Array.from({length:s[1]}, (_,i) => i === s[1]-1 ? s[3] : s[2]));
  }
  return {action, sheet: state.form, frames:list, oneShot:false, costume:state.form === 'basin' && !data.helmet.bakedRows.includes(list[0].row)};
}

export function createHoverGesture({emit = () => {}} = {}) {
  let inside = false, active = false, generation = 0;
  const snapshot = () => ({inside, active, generation});
  return {
    snapshot,
    enter({blocked = false} = {}) {
      if (inside) return false;
      inside = true;
      if (blocked) return false;
      active = true; generation++;
      emit({event:'hiss-start', ...snapshot()}); return true;
    },
    leave() { inside = false; },
    complete(id) {
      if (!active || id !== generation) return false;
      active = false; emit({event:'hiss-complete', ...snapshot()}); return true;
    },
    cancel(reason) {
      if (!active) return;
      active = false; generation++; emit({event:'hiss-cancelled', reason, ...snapshot()});
    },
    reset() { inside = false; active = false; generation++; },
  };
}

export function createClickTracker({interval = 550, distance = 5} = {}) {
  let down = null, previous = null;
  const reset = () => { down = null; previous = null; };
  const move = e => { if (down && (Math.abs(e.screenX-down.x) >= distance || Math.abs(e.screenY-down.y) >= distance)) down.moved = true; return !!down?.moved; };
  return {
    reset, move,
    down(e, onPet) {
      if (!onPet || e.button !== 0 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) { reset(); return; }
      down = {id:e.pointerId, x:e.screenX, y:e.screenY, moved:false};
    },
    up(e, now) {
      if (!down || down.id !== e.pointerId) return {click:false, double:false};
      move(e);
      const eligible = !down.moved && e.button === 0 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
      down = null;
      if (!eligible) { previous = null; return {click:false, double:false}; }
      const double = !!previous && now-previous.time >= 0 && now-previous.time <= interval && Math.abs(e.screenX-previous.x)<distance && Math.abs(e.screenY-previous.y)<distance;
      previous = double ? null : {time:now, x:e.screenX, y:e.screenY};
      return {click:true, double};
    },
  };
}
