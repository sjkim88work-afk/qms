// v0.6.1 텔레그램 아침 요약 시험 (Playwright): node tests/telegram_test.js [index.html 경로]
// 텔레그램 서버는 흉내(route)로 대신함 — 실제로 보내지 않음
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const fails = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function fresh(browser, reply) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [], calls = [];
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://api.telegram.org/**', async route => {
    const req = route.request(), m = /\/bot([^/]+)\/(\w+)$/.exec(req.url());
    calls.push({ token: decodeURIComponent(m[1]), method: m[2], body: Object.fromEntries(new URLSearchParams(req.postData() || '')) });
    const r = reply ? reply(m[2]) : { ok: true, result: m[2] === 'getUpdates' ? [{ update_id: 1, my_chat_member: { chat: { id: -100555, title: '품질팀', type: 'supergroup' } } }] : { message_id: 1 } };
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(r) });
  });
  await p.goto(FILE);
  await p.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady);
  return { ctx, p, errs, calls };
}
const SEED = () => {
  const t = today();
  db.suppliers.push({ id: 'S1', name: '시험협력사', code: 'T1' });
  db.ncrs.push({ id: 'n1', no: 'N-LATE', issueDate: addDays(t, -20), notifyDate: addDays(t, -20), requestDate: addDays(t, -20), dueDate: addDays(t, -3), supplierId: 'S1', reqType: '8D 보고서', defectIds: [] });
  db.ncrs.push({ id: 'n2', no: 'N-TODAY', issueDate: addDays(t, -7), notifyDate: addDays(t, -7), requestDate: addDays(t, -7), dueDate: t, supplierId: 'S1', reqType: '8D 보고서', defectIds: [] });
  db.cases.push({ id: 'c1', CaseNo: 'RCA-1', Title: '비밀 제목', Stage: '대책', Status: '진행중', Tier: 'TIER 2', Created: addDays(t, -5) });
  db.actions.push({ id: 'a1', CaseId: 'c1', Title: '금형 수정 비밀', Category: '발생대책', DueDate: addDays(t, -1), ActionStatus: '진행' });
  db.issues.push({ id: 'i1', no: 'ISS-T-1', title: '이슈 제목 비밀', at: addDays(t, -4) + 'T09:00', urg: '긴급', special: true, logs: [], defectIds: [], caseIds: [], photos: [] });
  save();
};
const CFG = o => ({ token: '123:ABC', chat: '-100555', time: '00:00', on: true, noWeekend: false, detail: false, ...o });

(async () => {
  const browser = await chromium.launch();

  // 1. 요약 내용 · 세부 내용 끄기
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    const s = await p.evaluate(c => { localStorage.setItem('qis_tg', JSON.stringify(c)); return tgSummary() }, CFG({}));
    ok(/■ 지연 \d+건/.test(s) && s.includes('N-LATE') && s.includes('대책서 회신 D+3'), '1 요약: 지연 NCR · 경과일');
    ok(/■ 오늘 기한 1건/.test(s) && s.includes('N-TODAY'), '1 요약: 오늘 기한');
    ok(s.includes('ISS-T-1') && s.includes('격리 기록 없음 1건'), '1 요약: 이슈 분류 대기 · 격리 기록 없음');
    ok(!s.includes('비밀'), '1 세부 내용 끄면 조치 · 이슈 제목이 나가지 않음');
    const s2 = await p.evaluate(c => { localStorage.setItem('qis_tg', JSON.stringify(c)); return tgSummary() }, CFG({ detail: true }));
    ok(s2.includes('금형 수정 비밀') && s2.includes('이슈 제목 비밀'), '1 세부 내용 켜면 제목 포함');
    ok(errs.length === 0, '1 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 2. 자동 전송 — 하루 한 번 · 토큰은 데이터에 없음
  {
    const { ctx, p, errs, calls } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(c => localStorage.setItem('qis_tg', JSON.stringify(c)), CFG({}));
    await p.evaluate(() => tgAuto()); await wait(600);
    ok(calls.length === 1 && calls[0].method === 'sendMessage' && calls[0].token === '123:ABC' && calls[0].body.chat_id === '-100555' && calls[0].body.text.includes('아침 품질 요약'), '2 정한 시각이 지나면 자동 전송 ' + JSON.stringify(calls.map(c => c.method)));
    ok(await p.evaluate(() => db.meta.tgSent === today()), '2 보낸 날짜 기록');
    await p.evaluate(() => tgAuto()); await wait(400);
    ok(calls.length === 1, '2 같은 날 두 번 보내지 않음');
    ok(await p.evaluate(() => !JSON.stringify(db).includes('123:ABC')), '2 봇 토큰은 데이터(백업 · 공유본)에 들어가지 않음');
    ok(errs.length === 0, '2 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 3. 보내지 않는 경우 — 시각 전 · 꺼짐 · 보기 전용 창 · 주말 제외
  {
    const { ctx, p, calls } = await fresh(browser);
    await p.evaluate(SEED);
    const r = await p.evaluate(c => {
      const set = o => localStorage.setItem('qis_tg', JSON.stringify({ ...c, ...o }));
      const at = (h, m, day) => { const d = new Date(); d.setHours(h, m, 0, 0); if (day != null) d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7)); return d };
      set({ time: '08:00' }); const before = tgDue(at(7, 59)), after = tgDue(at(8, 0));
      set({ on: false }); const off = tgDue(at(9, 0));
      set({ chat: '' }); const nochat = tgDue(at(9, 0));
      set({ noWeekend: true }); const sun = tgDue(at(9, 0, 0)), mon = tgDue(at(9, 0, 1));
      set({}); tabLocked = true; const locked = tgDue(at(9, 0)); tabLocked = false;
      return { before, after, off, nochat, sun, mon, locked };
    }, CFG({}));
    ok(!r.before && r.after, '3 정한 시각 전에는 보내지 않음 ' + JSON.stringify(r));
    ok(!r.off && !r.nochat, '3 꺼짐 · 받을 곳 없음 → 안 보냄');
    ok(!r.sun && r.mon, '3 주말 제외');
    ok(!r.locked, '3 다른 창에서 편집 중(보기 전용 창)이면 안 보냄');
    ok(calls.length === 0, '3 실제 전송 없음');
    await ctx.close();
  }

  // 4. 설정 화면 · 받을 곳 찾기 · 시험 전송 · 실패 처리
  {
    const { ctx, p, errs, calls } = await fresh(browser);
    await p.evaluate(() => { state.setTab = 'tg'; go('data') });
    ok(await p.evaluate(() => document.querySelector('#view').innerText.includes('봇 토큰')), '4 설정 › 알림 (텔레그램) 화면');
    await p.fill('input[placeholder="123456789:AA…"]', '999:XYZ');
    await p.press('input[placeholder="123456789:AA…"]', 'Tab');
    await p.click('button:has-text("받을 곳 찾기")'); await wait(500);
    await p.click('#tgChats button:has-text("품질팀")'); await wait(200);
    ok(await p.evaluate(() => tgCfg().chat === '-100555' && tgCfg().token === '999:XYZ'), '4 받을 곳 찾기 → 그룹 선택');
    await p.click('button:has-text("시험 메시지 보내기")'); await wait(500);
    ok(calls.some(c => c.method === 'sendMessage' && c.body.text.includes('시험 전송')), '4 시험 전송');
    await p.click('button:has-text("지금 요약 보내기")'); await wait(500);
    ok(calls.filter(c => c.method === 'sendMessage').length === 2 && await p.evaluate(() => db.meta.tgSent === today()), '4 지금 요약 보내기');
    ok(errs.length === 0, '4 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, p, calls } = await fresh(browser, () => ({ ok: false, description: 'Bad Request: chat not found' }));
    await p.evaluate(c => localStorage.setItem('qis_tg', JSON.stringify(c)), CFG({}));
    await p.evaluate(() => tgSendSummary(true).catch(() => { })); await wait(500);
    const r = await p.evaluate(() => ({ sent: db.meta.tgSent || '', toast: $('#toast').textContent }));
    ok(calls.length === 1 && !r.sent && r.toast.includes('chat not found'), '4 실패하면 날짜를 남기지 않고 이유 표시 → 다음에 다시 시도 ' + JSON.stringify(r));
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
