// v0.6.0 이슈 시험 (Playwright): node tests/issue_test.js [index.html 경로]
// 이슈 등록 · 기록 · 처리 방향(불량 · FAR · NCR · RCA · 종결) · 목록 · 대시보드 · 모바일 빠른 등록
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const fails = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function fresh(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady);
  await p.evaluate(() => { window.__cfm = true; window.askConfirm = async () => window.__cfm; });
  return { ctx, p, errs };
}
// 가상 데이터
const SEED = () => {
  db.settings.owners = ['시험담당'];
  db.suppliers.push({ id: 'S1', name: '시험협력사', code: 'T1' });
  db.parts.push({ id: 'P1', partNo: 'P-100', name: '래치 스프링', supplierId: 'S1' });
  if (!db.settings.sources.some(x => /공정/.test(x))) db.settings.sources.push('공정');
};
// 이슈 등록 창을 채워 저장
async function register(p, o) {
  await p.evaluate(() => { go('issue'); editIssue() });
  await p.fill('#mf [name=title]', o.title);
  if (o.desc) await p.fill('#mf [name=desc]', o.desc);
  if (o.partNo) await p.fill('#mf [name=partNo]', o.partNo);
  if (o.qty) await p.fill('#mf [name=qty]', String(o.qty));
  await p.selectOption('#mf [name=urg]', o.urg || '높음');
  if (o.special) await p.check('#mf [name=special]');
  if (o.contain) { await p.check('#mf [name=contain]'); await p.fill('#mf [name=containText]', o.contain) }
  if (o.share) await p.fill('#mf [name=shareTo]', o.share);
  await p.evaluate(open => saveIssue(null, open), o.open !== false);
  await p.waitForFunction(t => db.issues.some(i => i.title === t), o.title);
  return p.evaluate(t => db.issues.find(i => i.title === t).id, o.title);
}

(async () => {
  const browser = await chromium.launch();

  // 1. 탭 · 등록 · 번호 · 자동 기록 · 상세
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => go('dash'));
    const nav = await p.evaluate(() => [...document.querySelectorAll('#nav button')].map(b => b.textContent.trim()));
    ok(nav.some(t => t.startsWith('이슈')) && nav.some(t => t.startsWith('RCA')) && !nav.some(t => t.includes('이슈 · RCA')), '1 탭: 이슈 추가 · 이슈 · RCA → RCA ' + JSON.stringify(nav));
    const id = await register(p, { title: '래치 스프링 미조립 의심', desc: '조립 중 3EA 확인', partNo: 'P-100', qty: 3, urg: '긴급', special: true, contain: '재공 120EA 보류', share: '생산팀장' });
    const r = await p.evaluate(id => { const i = issById(id); return { no: i.no, kinds: i.logs.map(l => l.kind), st: issStatus(i), view: state.tab === 'issue' && state.issId === id, txt: document.querySelector('#view').innerText } }, id);
    const yymm = await p.evaluate(() => today().slice(2, 4) + today().slice(5, 7));
    ok(r.no === `ISS-${yymm}-001`, '1 이슈 번호 ISS-YYMM-001 ' + r.no);
    ok(JSON.stringify(r.kinds) === JSON.stringify(['발견', '격리', '공유']) && r.st === '접수', '1 등록 시 발견 · 격리 · 공유 자동 기록, 상태 접수 ' + JSON.stringify(r.kinds));
    ok(r.view && r.txt.includes('처리 방향') && r.txt.includes('래치 스프링') && r.txt.includes('재공 120EA 보류'), '1 저장하고 상세(기록 · 처리 방향)로');
    const id2 = await register(p, { title: '두 번째', open: false });
    ok(await p.evaluate(id => issById(id).no.endsWith('-002'), id2), '1 다음 번호 -002');
    // 기록 추가 · 상태 조사 중 · 기록 취소
    await p.evaluate(id => issOpen(id), id);
    await p.selectOption('#isK', '회의');
    await p.fill('#isWho', '생산팀 · 생산기술팀');
    await p.fill('#isTx', '원인 추정 — 스프링 선단 변형');
    await p.click('button:has-text("기록 추가")');
    const st = await p.evaluate(id => ({ st: issStatus(issById(id)), n: issById(id).logs.length, last: issById(id).logs.slice(-1)[0] }), id);
    ok(st.st === '조사 중' && st.n === 4 && st.last.who === '생산팀 · 생산기술팀', '1 회의 기록 추가 → 조사 중');
    await p.evaluate(() => { window.__cfm = '내용 오기' });
    await p.evaluate(id => issVoid(id, 3), id);
    ok(await p.evaluate(id => issById(id).logs[3].void && issById(id).logs[3].void.reason === '내용 오기' && issById(id).logs.length === 4, id), '1 기록 취소 — 지우지 않고 사유 남김');
    ok(errs.length === 0, '1 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 2. 처리 방향 — NCR (불량 미리 채움 · 사진 복사 · 연결 · NCR 창)
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    const id = await register(p, { title: '스프링 파손', desc: '선단 변형', partNo: 'P-100', qty: 4, urg: '높음', special: true, contain: '격리함' });
    await p.evaluate(async id => { const i = issById(id); const ph = { id: 'php1', defectId: id, name: 'a.jpg', caption: '불량 부위', data: 'data:image/jpeg;base64,AAAA', thumb: 'data:image/jpeg;base64,AAAA', createdAt: now() }; await photoPut([ph]); i.photos = ['php1']; save() }, id);
    await p.evaluate(id => issRoute(id, 'ncr'), id);
    await p.waitForFunction(() => $('#modal').classList.contains('on') && typeof curPhotos !== 'undefined' && curPhotos.length === 1);
    const f = await p.evaluate(() => { const f = $('#mf'); return { pn: f.partNo.value, qty: f.qty.value, resp: f.resp.value, cont: f.containment.value, desc: f.desc.value, banner: $('#mbody').innerText.includes('이슈 ISS-'), sp: !!curSev.special, ph: curPhotos[0].id !== 'php1' && curPhotos[0].isNew } });
    ok(f.pn === 'P-100' && f.qty === '4' && f.resp === '협력사' && f.cont === '격리함' && f.desc.includes('선단 변형') && f.banner && f.sp, '2 NCR 방향: 불량 창에 품목 · 수량 · 귀책 협력사 · 격리 · 특별특성 미리 채움 ' + JSON.stringify(f));
    ok(f.ph, '2 이슈 사진을 새 사진으로 복사 (이슈 사진은 그대로)');
    await p.evaluate(() => { const f = $('#mf'); f.type.value = db.settings.defectTypes[0]; f.disposition.value = f.disposition.options[1].value });
    const did = await p.evaluate(() => saveDefect(null));
    await wait(600);
    const r = await p.evaluate(({ id, did }) => { const i = issById(id), d = db.defects.find(x => x.id === did); return { link: i.defectIds.includes(did), di: d.issueId === id, log: i.logs.slice(-1)[0].text, st: issStatus(i), modal: $('#modal').classList.contains('on') && /NCR/.test($('#mt').textContent), photoKept: i.photos[0] === 'php1', dph: d.photos.length } }, { id, did });
    ok(r.link && r.di && r.log.startsWith('NCR 발행 — 불량 등록') && r.st === '분류 완료', '2 저장하면 이슈 후속 건으로 연결 · 분류 기록 ' + JSON.stringify(r));
    ok(r.modal, '2 이어서 NCR 발행 창');
    ok(r.photoKept && r.dph === 1, '2 이슈 사진 유지 · 불량에 사진 1장');
    // 다른 불량 등록 창은 이슈에 연결되지 않음
    await p.evaluate(() => closeModal(true));
    await p.evaluate(id => issRoute(id, 'defect'), id);
    await p.waitForFunction(() => $('#modal').classList.contains('on'));
    await p.evaluate(() => closeModal(true));
    await p.evaluate(() => editDefect());
    await p.evaluate(() => { const f = $('#mf'); f.partNo.value = 'P-100'; f.qty.value = '1'; f.type.value = db.settings.defectTypes[0] });
    const did2 = await p.evaluate(() => saveDefect(null));
    ok(await p.evaluate(({ id, did2 }) => !issById(id).defectIds.includes(did2) && !db.defects.find(x => x.id === did2).issueId, { id, did2 }), '2 이슈에서 연 창을 닫은 뒤 새로 연 불량은 이슈에 연결되지 않음');
    ok(errs.length === 0, '2 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 3. FAR · RCA · 종결 · 다시 열기
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    const id = await register(p, { title: '작동음 증가', partNo: 'P-100', urg: '보통' });
    await p.evaluate(id => issRoute(id, 'far'), id);
    await p.waitForFunction(() => $('#modal').classList.contains('on'));
    ok(await p.evaluate(() => $('#mf').resp.value === '미정'), '3 FAR 방향: 귀책 미정');
    await p.evaluate(() => { const f = $('#mf'); f.qty.value = '2'; f.type.value = db.settings.defectTypes[0] });
    const did = await p.evaluate(() => saveDefect(null));
    await wait(600);
    ok(await p.evaluate(did => $('#modal').classList.contains('on') && !!$('#mf') && !!$('#mf').inv_farReq && db.defects.find(x => x.id === did).issueId, did), '3 저장하면 귀책 조사 창 (FAR 요청)');
    await p.evaluate(() => closeModal(true));
    await p.evaluate(id => issRoute(id, 'rca'), id);
    await wait(300);
    const rc = await p.evaluate(id => { const i = issById(id), c = czById('cases', i.caseIds[0]); return { c: !!c, iss: c && c.IssueId === id, tab: state.tab, title: c && c.Title, log: c && c.Log.some(l => l.text.includes(i.no)) } }, id);
    ok(rc.c && rc.iss && rc.tab === 'case' && rc.title === '작동음 증가' && rc.log, '3 RCA 방향: RCA 생성 · 이슈 연결 · RCA 이력에 출처 ' + JSON.stringify(rc));
    await p.evaluate(() => { window.__cfm = '후속 건으로 이관' });
    await p.evaluate(id => issRoute(id, 'close'), id);
    const cl = await p.evaluate(id => ({ st: issStatus(issById(id)), r: issById(id).closeReason }), id);
    ok(cl.st === '종결' && cl.r === '후속 건으로 이관', '3 종결 — 사유 필수 · 기록');
    await p.evaluate(() => { window.__cfm = '재발' });
    await p.evaluate(id => issReopen(id), id);
    ok(await p.evaluate(id => !issById(id).closedAt && issById(id).logs.slice(-1)[0].kind === '다시 열기', id), '3 다시 열기 — 사유 기록');
    ok(errs.length === 0, '3 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 4. 목록 · 대시보드 · 백업 구조
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => {
      const mk = (no, title, at, o) => { const i = { id: uid(), no, title, at, source: '공정', urg: '보통', logs: [], defectIds: [], caseIds: [], photos: [], ...o }; db.issues.push(i); return i };
      mk('ISS-T-1', '오래된 분류 대기', addDays(today(), -5) + 'T09:00');
      mk('ISS-T-2', '긴급인데 격리 없음', today() + 'T08:00', { urg: '긴급' });
      mk('ISS-T-3', '종결 건', addDays(today(), -9) + 'T08:00', { closedAt: today(), closeReason: '이상 없음' });
      save(); go('issue');
    });
    const L = await p.evaluate(() => ({ rows: document.querySelectorAll('#view tbody tr').length, late: document.querySelectorAll('#view tr.late').length, txt: document.querySelector('#view').innerText, badge: [...document.querySelectorAll('#nav button')].find(b => b.textContent.startsWith('이슈')).textContent }));
    ok(L.rows === 2 && L.late === 1 && !L.txt.includes('종결 건'), '4 목록: 열린 이슈만 · 2일 넘은 분류 대기 행 표시 ' + JSON.stringify({ rows: L.rows, late: L.late }));
    ok(/이슈\s*2/.test(L.badge), '4 탭 배지 = 분류 대기 수 ' + L.badge);
    await p.locator('.kpi.go', { hasText: '긴급 · 특별특성' }).click();
    ok(await p.evaluate(() => document.querySelectorAll('#view tbody tr').length === 1 && state.isf.hot), '4 KPI 누르면 필터');
    await p.evaluate(() => go('dash'));
    const d = await p.evaluate(() => [...document.querySelectorAll('ul.act li')].map(li => li.innerText).join('\n'));
    ok(d.includes('격리 확인') && d.includes('이슈 분류 대기'), '4 대시보드 오늘 챙길 일: 격리 확인 · 이슈 분류 대기');
    ok(await p.evaluate(() => Array.isArray(migrate({}).issues) && COLLS.includes('issues')), '4 백업 · 복원 대상에 이슈 포함');
    ok(errs.length === 0, '4 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 5. 휴대폰 빠른 등록
  {
    const { ctx, p, errs } = await fresh(browser, { width: 390, height: 844 });
    await p.evaluate(SEED);
    await p.click('.mtabs button:has-text("이슈")');
    await p.fill('#mobIss [name=title]', '현장 이상');
    await p.fill('#mobIss [name=loc]', '조립 2라인');
    await p.click('#mobIss fieldset.murg label:has-text("긴급")');
    await p.check('#mobIss [name=contain]');
    await p.fill('#mobIss [name=memo]', '3EA, 재공 보류');
    await p.click('#mobIssBtn');
    await p.waitForFunction(() => db.issues.some(i => i.title === '현장 이상'));
    const r = await p.evaluate(() => { const i = db.issues.find(x => x.title === '현장 이상'); return { urg: i.urg, loc: i.loc, contain: i.contain, kinds: i.logs.map(l => l.kind), done: !!document.querySelector('.mdone') } });
    ok(r.urg === '긴급' && r.loc === '조립 2라인' && r.contain && r.kinds.join() === '발견,격리' && r.done, '5 휴대폰 빠른 등록 ' + JSON.stringify(r));
    ok(errs.length === 0, '5 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
