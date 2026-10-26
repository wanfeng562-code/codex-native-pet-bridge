export class PetSession {
  constructor(url, port) {
    const u = new URL(url);
    if (u.protocol !== 'ws:' || u.hostname !== '127.0.0.1' || Number(u.port) !== port || u.username || u.password || !u.pathname.startsWith('/devtools/page/')) throw Error('Not our loopback pet socket');
    this.url = url; this.pending = new Map(); this.id = 0; this.closed = false;
  }
  async open() {
    const ws = this.ws = new WebSocket(this.url);
    ws.addEventListener('message', e => {
      let m; try { m = JSON.parse(String(e.data)); } catch { return; }
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id); clearTimeout(p.timer);
      if (m.error) p.reject(Error(m.error.message)); else p.resolve(m.result);
    });
    ws.addEventListener('close', () => { this.closed = true; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('Pet socket closed')); } this.pending.clear(); });
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => { ws.close(); reject(Error('Pet socket timeout')); }, 6000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
      ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('Pet socket error')); }, {once:true});
    });
  }
  send(method, params = {}) {
    if (this.closed || this.ws?.readyState !== WebSocket.OPEN) return Promise.reject(Error('Not connected'));
    const id = ++this.id;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(method+' timeout')); }, 20000);
      this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  }
  close() { this.ws?.close(); }
}
export async function discoverPets(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid CDP port');
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, {redirect:'error', signal:AbortSignal.timeout(1500)});
  if (!r.ok) throw Error('Pet discovery HTTP '+r.status);
  return (await r.json()).filter(t => t.type === 'page' && t.url?.startsWith('app://') && t.url.includes('avatar-overlay') && t.webSocketDebuggerUrl);
}
export async function discoverWorkWindows(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, {redirect:'error', signal:AbortSignal.timeout(1500)});
  if (!r.ok) throw Error('Work window discovery HTTP '+r.status);
  return (await r.json()).filter(t => t.type === 'page' && t.url?.startsWith('app://') && !t.url.includes('avatar-overlay') && ['/index.html','/detached-window.html'].includes(new URL(t.url).pathname) && t.webSocketDebuggerUrl);
}
