// 데이터 원본 = QIS 폴더 파일 시험 (Playwright): node tests/folder_test.js
// 실제 폴더 선택 창은 자동화할 수 없어, 브라우저 전용 폴더(OPFS)를 QIS 폴더 대신 쓴다 (같은 파일 API).
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8797, URL = `http://127.0.0.1:${PORT}/index.html`;
const fails = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    // 폴더 허용 흉내: window.__perm 이 'prompt' 이면 허용이 풀린 상태
    await ctx.addInitScript(() => {
      // 시험 환경 한정: 이 Chromium은 OPFS 폴더 정보를 IndexedDB에서 다시 읽으면 페이지가 닫히는 문제가 있어,
      // 저장할 때 폴더 경로만 적어 두고 읽을 때 경로로 다시 찾는다 (실제 폴더 선택 창으로 고른 폴더는 해당 없음)
      const S = IDBObjectStore.prototype, put = S.put;
      S.put = function (v, k) {
        if (v instanceof FileSystemHandle) { const id = 'h' + Math.random().toString(36).slice(2), hv = v;
          navigator.storage.getDirectory().then(o => o.resolve(hv)).then(path => localStorage.setItem('__opfs_' + id, JSON.stringify(path)));
          v = { __opfs: id }; }
        return put.call(this, v, k);
      };
      const d = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result');
      Object.defineProperty(IDBRequest.prototype, 'result', { get() { const v = d.get.call(this);
        if (v && v.__opfs) return (async () => { let path; for (let i = 0; i < 100 && !(path = localStorage.getItem('__opfs_' + v.__opfs)); i++) await new Promise(r => setTimeout(r, 20));
          let h = await navigator.storage.getDirectory(); for (const n of JSON.parse(path)) h = await h.getDirectoryHandle(n); return h; })();
        return v; } });
      const P = FileSystemHandle.prototype;
      P.queryPermission = async function () { return window.__perm || localStorage.getItem('__perm') || 'granted'; };
      P.requestPermission = async function () { localStorage.setItem('__perm', 'granted'); window.__perm = 'granted'; return 'granted'; };
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    const ready = () => p.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady);
    await p.goto(URL); await ready();
    await p.evaluate(async () => {
      window.askConfirm = async () => true;
      for (let i = 0; i < 3; i++) db.defects.push({ id: 'k' + i, date: '2026-10-0' + (i + 1), qty: i + 1, photos: [], costs: [] });
      db.suppliers.push({ id: 'S1', name: '가나정밀' }); save();
      const opfs = await navigator.storage.getDirectory();
      const h = await opfs.getDirectoryHandle('QIS폴더시험', { create: true });
      await attachRoot(h, true);
    });
    await p.waitForTimeout(500);
    // 1. 원본을 폴더 파일로
    await p.evaluate(() => srcToFolder());
    const a = await p.evaluate(async () => {
      const opfs = await navigator.storage.getDirectory(), h = await opfs.getDirectoryHandle('QIS폴더시험');
      const t = await (await (await h.getFileHandle(DATA_FILE)).getFile()).text();
      return { store: dataStore, n: JSON.parse(t).defects.length, idb: (await dKeys()).filter(k => String(k).startsWith(KEY)).length, src: localStorage.getItem(SRC_KEY) };
    });
    ok(a.store === 'folder' && a.n === 3 && a.src === 'folder', `1 원본을 QIS 폴더 파일로 바꿈 (${JSON.stringify(a)})`);
    ok(a.idb === 0, '1 브라우저 저장소의 기록 데이터는 지움');

    // 2. 다시 열면 파일에서 불러옴
    await p.reload(); await ready();
    ok(await p.evaluate(() => dataStore === 'folder' && db.defects.length === 3 && !loadFailed), '2 다시 열면 폴더 파일에서 불러옴');

    // 3. 고치면 파일에 바로 저장
    await p.evaluate(() => { window.askConfirm = async () => true; db.defects.push({ id: 'k9', date: '2026-10-09', qty: 9, photos: [], costs: [] }); save(); });
    await p.waitForFunction(() => !_pw);
    const n3 = await p.evaluate(async () => { const r = await folderReadText(); return JSON.parse(r.t).defects.length; });
    ok(n3 === 4, '3 입력하면 바로 파일에 저장');

    // 4. 파일이 다른 곳에서 바뀌면 덮어쓰지 않음
    const c = await p.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1100));
      const fh = await folderRoot.getFileHandle(DATA_FILE), w = await fh.createWritable();
      const other = JSON.parse((await folderRoot.getFileHandle(DATA_FILE).then(h => h.getFile()).then(f => f.text())));
      other.defects.push({ id: 'ext', date: '2026-10-10', qty: 1, photos: [], costs: [] }); await w.write(JSON.stringify(other)); await w.close();
      db.defects.push({ id: 'mine', date: '2026-10-11', qty: 1, photos: [], costs: [] }); save();
      await new Promise(r => setTimeout(r, 300)); while (_pw) await _pw;
      const t = JSON.parse((await folderReadText()).t);
      return { conflict: folderConflict, ext: t.defects.some(d => d.id === 'ext'), mine: t.defects.some(d => d.id === 'mine'), bar: document.querySelector('#alertBar').innerText };
    });
    ok(c.conflict && c.ext && !c.mine && c.bar.includes('저장하지 못했습니다'), '4 다른 곳에서 바뀐 파일은 덮어쓰지 않고 멈춤 · 안내');
    await p.evaluate(() => folderReload());
    ok(await p.evaluate(() => !folderConflict && db.defects.some(d => d.id === 'ext') && !saveFailed), '4 파일 다시 불러오기');

    // 5. 허용이 풀린 상태로 열면 연결 화면 → 연결하면 불러옴, 연결 전 저장 안 함
    await p.evaluate(() => localStorage.setItem('__perm', 'prompt'));
    await p.reload(); await ready();
    const w5 = await p.evaluate(() => ({ wait: folderWait, view: document.querySelector('#view').innerText, n: db.defects.length }));
    ok(w5.wait && w5.view.includes('QIS 폴더를 연결하세요') && w5.n === 0, '5 허용이 풀려 있으면 연결 화면');
    ok(await p.evaluate(async () => { save(); await new Promise(r => setTimeout(r, 200)); return JSON.parse((await folderReadText()).t).defects.length; }) === 5, '5 연결 전에는 빈 데이터로 파일을 덮지 않음');
    await p.click('#view button');
    await p.waitForFunction(() => !folderWait && db.defects.length === 5);
    ok(true, '5 연결하면 파일에서 불러옴');

    // 6. 브라우저로 되돌리기
    await p.evaluate(() => { window.askConfirm = async () => true; return srcToBrowser(); });
    await p.reload(); await ready();
    ok(await p.evaluate(() => dataStore === 'idb' && db.defects.length === 5), '6 브라우저로 되돌려도 데이터 그대로');
    ok(errs.length === 0, '페이지 오류 없음 ' + errs.join(' | '));
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(fails.length ? `FAILS: ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
