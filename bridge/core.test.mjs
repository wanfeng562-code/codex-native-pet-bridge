import test from 'node:test';
import assert from 'node:assert/strict';
import {createFormMachine,createClickTracker,planFor,createHoverGesture} from './core.mjs';
import data from '../examples/deepseek-v2/assets/asset-data.mjs';
import {PetSession} from './cdp.mjs';

test('only the completed final frame persists basin; stale completion is rejected',()=>{
  const saved=[], events=[]; const m=createFormMachine({save:f=>saved.push(f),emit:e=>events.push(e)});
  assert.equal(m.toggle(),true); const generation=m.snapshot().generation;
  assert.deepEqual(saved,[]); assert.equal(m.toggle(),false);
  assert.equal(m.complete(generation-1),false); assert.equal(m.snapshot().form,'normal');
  assert.equal(m.complete(generation),true); assert.deepEqual(saved,['basin']);
  assert.equal(m.complete(generation),false); m.toggle(); assert.deepEqual(saved,['basin','normal']);
});
test('restart restores a stable form, interrupted transform leaves normal',()=>{
  let stable='normal'; const first=createFormMachine({save:f=>{stable=f;}}); first.toggle();
  assert.equal(createFormMachine({initial:stable}).snapshot().form,'normal');
  first.complete(first.snapshot().generation);
  assert.equal(createFormMachine({initial:stable}).snapshot().form,'basin');
});
test('every native action retains basin and all non-baked frames have costume anchors',()=>{
  const actions=['idle','running','failed','waiting','review','running-left','running-right','jumping','waving'];
  for(const action of actions){
    const p=planFor({form:'basin',phase:'stable'},action,data); assert.equal(p.sheet,'basin');
    assert.ok(p.frames.length>0); if(p.costume) for(const f of p.frames) assert.ok(data.helmet.anchors[f.row+':'+f.column]);
  }
  assert.equal(planFor({form:'basin',phase:'stable'},'running',data).frames.length,8);
});
test('transition is independent from changing native actions; latest action can resume',()=>{
  for(const a of ['running','failed','jumping']){
    const p=planFor({form:'normal',phase:'transforming'},a,data);
    assert.equal(p.action,'transforming'); assert.equal(p.oneShot,true); assert.equal(p.frames.reduce((s,f)=>s+f.duration,0),1920);
  }
  assert.equal(planFor({form:'basin',phase:'stable'},'failed',data).action,'failed');
});
const e=(extra={})=>({pointerId:1,screenX:100,screenY:100,button:0,...extra});
test('double-click tracker ignores drag, modifiers, badges, long intervals and cancel',()=>{
  const t=createClickTracker();
  const click=(at,extra={},pet=true)=>{t.down(e(extra),pet);return t.up(e(extra),at);};
  assert.equal(click(0).double,false); assert.equal(click(200).double,true);
  t.down(e(),true); t.move(e({screenX:120})); assert.equal(t.up(e({screenX:120}),400).click,false);
  assert.equal(click(500).double,false); assert.equal(click(1200).double,false);
  assert.equal(click(1300,{ctrlKey:true}).click,false);
  assert.equal(click(1400,{},false).click,false);
  click(1500);t.reset();assert.equal(click(1600).double,false);
});
test('storage failure does not report persisted; external restore invalidates pending completion',()=>{
  const events=[];const m=createFormMachine({save:()=>{throw Error('quota');},emit:e=>events.push(e)});
  m.toggle();const id=m.snapshot().generation;m.restore('normal');assert.equal(m.complete(id),false);
  m.toggle();m.complete(m.snapshot().generation);assert.equal(events.at(-1).persisted,false);
});
test('controller cannot connect to non-loopback, wrong-port or non-page targets',()=>{
  for(const u of ['ws://example.com:46873/devtools/page/1','ws://127.0.0.1:9222/devtools/page/1','ws://127.0.0.1:46873/devtools/browser/1','ws://a:b@127.0.0.1:46873/devtools/page/1']) assert.throws(()=>new PetSession(u,46873));
  assert.doesNotThrow(()=>new PetSession('ws://127.0.0.1:46873/devtools/page/1',46873));
});
test('hover hisses once, remains consumed while inside, and rearms only after leaving',()=>{
  const h=createHoverGesture();assert.equal(h.enter(),true);const id=h.snapshot().generation;
  assert.equal(h.enter(),false);assert.equal(h.snapshot().generation,id);
  assert.equal(h.complete(id),true);assert.equal(h.snapshot().active,false);
  assert.equal(h.enter(),false);h.leave();assert.equal(h.enter(),true);
  assert.notEqual(h.snapshot().generation,id);assert.equal(h.complete(id),false);
});
test('hover can leave while playing, re-entry invalidates the earlier completion, transform cancels it',()=>{
  const h=createHoverGesture();h.enter();const id=h.snapshot().generation;h.leave();
  assert.equal(h.snapshot().active,true);h.enter();assert.equal(h.complete(id),false);
  h.cancel('transform');assert.equal(h.snapshot().active,false);assert.equal(h.snapshot().inside,true);
  assert.equal(h.enter(),false);h.leave();h.enter({blocked:true});assert.equal(h.snapshot().active,false);
});
test('both forms use a dedicated one-shot hiss and keep original failure frames with tracked helmet',()=>{
  for(const form of ['normal','basin']){
    const state={form,phase:'stable'};const h=planFor(state,'hissing',data);
    assert.equal(h.sheet,'hissing');assert.equal(h.oneShot,true);assert.equal(h.gesture,true);
    assert.equal(h.frames.length,8);assert.equal(h.frames[0].row,form==='basin'?1:0);
    const f=planFor(state,'failed',data);assert.equal(f.sheet,form);assert.equal(f.frames[0].row,5);
    assert.equal(f.costume,form==='basin');assert.deepEqual(f.frames.map(x=>x.duration),[140,140,140,140,140,140,140,240]);
  }
  assert.equal(planFor({form:'normal',phase:'transforming'},'hissing',data).action,'transforming');
});
test('hiss completion preserves form and lets the latest native action resume',()=>{
  const form=createFormMachine({initial:'basin'}),h=createHoverGesture();h.enter();
  assert.equal(planFor(form.snapshot(),h.snapshot().active?'hissing':'running',data).action,'hissing');
  h.complete(h.snapshot().generation);
  assert.equal(planFor(form.snapshot(),h.snapshot().active?'hissing':'waiting',data).action,'waiting');
  assert.equal(form.snapshot().form,'basin');assert.equal(form.snapshot().phase,'stable');
});
