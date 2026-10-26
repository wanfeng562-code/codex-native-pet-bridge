import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createFormMachine, planFor, createClickTracker, createHoverGesture} from './core.mjs';
import {installBridge} from './renderer.mjs';
import {PetSession, discoverPets, discoverWorkWindows} from './cdp.mjs';
import {parseConfiguration, storageKeyFor} from './config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root,'.runtime');
const version = 'runtime-bridge-v1.3.0';
const files = Object.fromEntries(['status','state','control','lock'].map(k => [k,path.join(runtime,k+'.json')]));
const sleep = ms => new Promise(r => setTimeout(r,ms));
const readJson = async file => { try { return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'')); } catch { return null; } };
async function writeJson(file,value) { const tmp = file+'.'+process.pid+'.tmp'; await fs.writeFile(tmp,JSON.stringify(value,null,2)); await fs.rename(tmp,file); }
const log = async event => { await fs.appendFile(path.join(runtime,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n'); };
async function settings() {
  const raw = await readJson(path.join(root,'config.local.json'));
  if (!raw) throw Error('Run setup.ps1 with your native pet ID first. See README.md.');
  return parseConfiguration(raw,{repositoryRoot:path.dirname(root)});
}
export async function makeConfig() {
  const config = await settings();
  const data = (await import(pathToFileURL(path.join(config.assetRoot,'asset-data.mjs')).href)).default;
  const assets = {};
  const assetHashes = await readJson(path.join(config.assetRoot,'manifest.json'));
  if (!assetHashes || Object.keys(assetHashes).sort().join(',') !== 'basin,helmet-texture,hissing,normal,transition') throw Error('Unexpected pet asset manifest');
  for (const [name,hash] of Object.entries(assetHashes)) {
    const bytes = await fs.readFile(path.join(config.assetRoot,'deepseek-'+name+'.webp'));
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Pet asset changed: '+name);
    assets[name] = bytes.toString('base64');
  }
  const state = await readJson(files.state);
  return {version, petId:config.petId, storageKey:storageKeyFor(config.petId), savedForm:state?.petId === config.petId ? state.form : null, assets, data};
}
export function installExpression(config) {
  return `(()=>{const createFormMachine=${createFormMachine.toString()};const planFor=${planFor.toString()};const createClickTracker=${createClickTracker.toString()};const createHoverGesture=${createHoverGesture.toString()};return (${installBridge.toString()})(${JSON.stringify(config)});})()`;
}
async function run(port) {
  const previous = await readJson(files.lock);
  if (previous?.pid) {
    try { process.kill(previous.pid,0); console.log(JSON.stringify({alreadyRunning:true,...previous})); return; } catch {}
  }
  const handle = await fs.open(files.lock,'wx').catch(async error => { if (error.code !== 'EEXIST') throw error; await fs.unlink(files.lock); return fs.open(files.lock,'wx'); });
  await handle.writeFile(JSON.stringify({pid:process.pid,port,version,startedAt:new Date().toISOString()})); await handle.close();
  await fs.rm(files.control,{force:true});
  const config = await makeConfig(); let session = null, targetId = null, previousState = '', previousEvent = 0, shutdown = false;
  const petId = config.petId;
  const workSessions = new Map();
  const readForegroundActivity = async () => {
    let busy = false;
    const targets = await discoverWorkWindows(port);
    const current = new Set(targets.map(t=>t.id));
    for (const [id,s] of workSessions) if (!current.has(id)) { s.close(); workSessions.delete(id); }
    for (const target of targets) {
      let s = workSessions.get(target.id);
      try {
        if (!s || s.closed) { s?.close(); s = new PetSession(target.webSocketDebuggerUrl,port); await s.open(); workSessions.set(target.id,s); }
        // Only a boolean from the native Stop control. Never read prompt,
        // response, transcript, account, or conversation contents.
        busy ||= await s.evaluate(`(()=>[...document.querySelectorAll('button[aria-label],button[data-testid="stop-button"]')].some(b=>!b.disabled&&b.getBoundingClientRect().width>0&&(b.dataset.testid==='stop-button'||/^(停止|停止生成|停止响应|Stop|Stop generating|Stop response|Stop streaming)$/i.test(b.getAttribute('aria-label')||''))))()`);
      } catch { s?.close(); workSessions.delete(target.id); }
    }
    return busy;
  };
  process.on('SIGTERM',()=>{shutdown=true;}); process.on('SIGINT',()=>{shutdown=true;});
  await log({event:'controller-start',port,pid:process.pid});
  try {
    while (!shutdown) {
      if ((await readJson(files.control))?.command === 'stop') break;
      try {
        if (!session || session.closed) {
          const targets = await discoverPets(port);
          if (targets.length !== 1) throw Error('Expected one native pet renderer; found '+targets.length);
          const target = targets[0]; session?.close(); session = new PetSession(target.webSocketDebuggerUrl,port); await session.open(); targetId = target.id;
        }
        let snapshot = await session.evaluate('window.__deepseekNativeBridgeV1?.heartbeat() ?? null');
        if (!snapshot || snapshot.version !== version) {
          const saved = await readJson(files.state); if (saved?.petId === petId) config.savedForm = saved.form;
          snapshot = await session.evaluate(installExpression(config));
          await log({event:'bridge-installed',targetId,form:snapshot.form});
        }
        const busy = await readForegroundActivity().catch(()=>false);
        snapshot = await session.evaluate(`window.__deepseekNativeBridgeV1?.setActivity(${busy}) ?? null`);
        if (!snapshot) throw Error('Pet bridge was unloaded');
        for (const event of snapshot.events ?? []) if (event.at > previousEvent) { await log(event); }
        previousEvent = Math.max(previousEvent,...(snapshot.events ?? []).map(e=>e.at));
        if (snapshot.phase === 'stable' && ['normal','basin'].includes(snapshot.form)) {
          const state = JSON.stringify({version:1,petId,form:snapshot.form});
          if (state !== previousState) { await writeJson(files.state,{...JSON.parse(state),savedAt:new Date().toISOString()}); previousState = state; }
        }
        await writeJson(files.status,{pid:process.pid,port,version,targetId,status:snapshot.mounted?'active':'waiting-for-deepseek-pet',...snapshot,events:undefined,checkedAt:new Date().toISOString()});
      } catch (error) {
        session?.close(); session = null;
        await writeJson(files.status,{pid:process.pid,port,version,status:'waiting-for-native-client',error:String(error.message),checkedAt:new Date().toISOString()});
      }
      await sleep(1500);
    }
  } finally {
    try { await session?.evaluate('window.__deepseekNativeBridgeV1?.dispose("controller-stopped")'); } catch {}
    session?.close(); for (const s of workSessions.values()) s.close(); await fs.rm(files.lock,{force:true});
    await writeJson(files.status,{version,status:'stopped',checkedAt:new Date().toISOString()}); await log({event:'controller-stopped'});
  }
}
const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const command = process.argv[2] ?? 'status';
  try {
    await fs.mkdir(runtime,{recursive:true});
    const port = Number(process.argv[3] ?? (command === 'run' ? (await settings()).port : 46873));
    if (command === 'run') await run(port);
    else if (command === 'stop') { await writeJson(files.control,{command:'stop',at:Date.now()}); console.log('Stop requested; native art is restored within 8 seconds.'); }
    else if (command === 'status') console.log(JSON.stringify(await readJson(files.status),null,2));
    else if (command === 'probe') console.log(JSON.stringify((await discoverPets(port)).map(t=>({id:t.id,url:t.url})),null,2));
    else throw Error('Unknown command');
  } catch (error) { console.error(String(error.stack)); process.exitCode = 1; }
}
