// QIS 화면 시험 (Playwright): node tests/browser_test.js [index.html 경로]
// 점검(2026-11-04)에서 찾은 문제가 다시 생기지 않는지 확인한다.
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const fails = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady);
  await p.evaluate(() => { window.askConfirm = async () => true; });
  return { ctx, p, errs };
}

// 시험 데이터: 협력사 1, 부품 1, NCR/불량 몇 건
const SEED = () => {
  const sid = 'S1';
  db.suppliers.push({ id: sid, name: '시험협력사', code: 'T1' });
  db.parts.push({ id: 'P1', partNo: 'P-100', name: '스핀들 너트', supplierId: sid });
};

(async () => {
  const browser = await chromium.launch();

  // 1-1 NCR 번호에 넣은 코드가 '재발로 연결'에서 실행되지 않음
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => {
      db.ncrs.push({ id: 'old', no: "N-1';window.PWN=1;'", issueDate: '2026-09-01', supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: [] });
      db.ncrs.push({ id: 'n2', no: 'N-2', issueDate: '2026-10-25', supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: [] });
      editNcr('n2', null, 'issue');
    });
    await p.click('#repHint button');
    ok(await p.evaluate(() => window.PWN === undefined), '1-1 재발로 연결: NCR 번호 속 코드가 실행되지 않음');
    ok(await p.inputValue('input[name=repeatOf]') === "N-1';window.PWN=1;'", '1-1 재발로 연결: 번호는 그대로 채워짐');
    ok(errs.length === 0, '1-1 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 1-8 RCA 상태 '종결'로 종결 조건을 건너뛰지 못함
  {
    const { ctx, p } = await fresh(browser);
    const r = await p.evaluate(() => {
      const c = { id: 'c1', CaseNo: 'RCA-1', Title: '시험', Stage: '접수', Status: '진행중' };
      db.cases.push(c);
      const res = czSetField(c, 'Status', '종결');
      return { res, status: c.Status, stage: c.Stage, close: c.CloseDate || '' };
    });
    ok(r.res === false && r.status === '진행중' && r.stage === '접수' && !r.close, '1-8 RCA 상태 선택으로 종결 안 됨');
    await ctx.close();
  }

  // 1-9 · 다 · 가: NCR 종결 조건, 검증 기한, 재대책
  {
    const { ctx, p } = await fresh(browser);
    await p.evaluate(SEED);
    const t = await p.evaluate(async () => {
      const out = {};
      const base = { supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: [], issueDate: '2026-08-01', notifyDate: '2026-08-01', requestDate: '2026-08-01', dueDate: '2026-08-08' };
      // (a) 회신 · 승인 없이 '유효'
      db.ncrs.push({ id: 'a', no: 'A', ...base });
      editNcr('a', null, 'verify');
      const f = $('#mf'); f.verifyDate.value = '2026-10-30'; f.verifyResult.value = '유효';
      out.a = saveNcr('a'); out.aStatus = ncrStatus(db.ncrs.find(x => x.id === 'a')); closeModal(true);
      // (b) 승인됐지만 LOT 없음
      db.ncrs.push({ id: 'b', no: 'B', ...base, replyDate: '2026-10-20', validity: '적정', approvedDate: '2026-10-25' });
      editNcr('b', null, 'verify');
      $('#mf').verifyDate.value = '2026-10-30'; $('#mf').verifyResult.value = '유효';
      out.b = saveNcr('b'); closeModal(true);
      // (c) 승인 + 합격 3 LOT → 종결
      editNcr('b', null, 'verify');
      curVLots = [1, 2, 3].map(i => ({ lot: 'L' + i, date: '2026-10-2' + i, insp: 100, ng: 0 }));
      $('#mf').verifyDate.value = '2026-10-30'; $('#mf').verifyResult.value = '유효';
      out.c = !!saveNcr('b'); out.cStatus = ncrStatus(db.ncrs.find(x => x.id === 'b'));
      // (d) 검증 기한: 8/1 발행 · 10/25 승인 → 승인일 + verifyDays
      out.dDue = db.ncrs.find(x => x.id === 'b').verifyDue; out.dExp = addDays('2026-10-25', db.settings.verifyDays);
      // (e) 무효(재발) → 불량은 미완료, 재대책 요청
      db.defects.push({ id: 'd1', date: '2026-08-01', supplierId: 'S1', partNo: 'P-100', type: '치수', qty: 5, ncrId: 'e', resp: '협력사', photos: [], costs: [] });
      db.ncrs.push({ id: 'e', no: 'E', ...base, defectIds: ['d1'], replyDate: '2026-08-05', validity: '적정', approvedDate: '2026-08-06', verifyDate: '2026-09-01', verifyResult: '무효(재발)' });
      out.eDone = !!isDone(db.defects.find(x => x.id === 'd1'));
      out.eFlag = ncrFlags(db.ncrs.find(x => x.id === 'e')).rework;
      await ncrRework('e');
      const e = db.ncrs.find(x => x.id === 'e');
      out.eStatus = ncrStatus(e); out.eHist = (e.verifyHist || []).length; out.eRej = ncrRejects(e);
      closeModal(true);
      return out;
    });
    ok(t.a === null && t.aStatus !== '종결', '1-9 대책서 회신 · 승인 없이 유효 종결 안 됨');
    ok(t.b === null, '1-9 합격 LOT 없이 유효 종결 안 됨');
    ok(t.c && t.cStatus === '종결', '1-9 승인 + 합격 3 LOT 이면 종결됨');
    ok(t.dDue === t.dExp, `다 검증 기한 = 승인일 + 일수 (${t.dDue})`);
    ok(t.eDone === false && t.eFlag === true, '가 검증 무효 NCR의 불량은 미완료 · 오늘 챙길 일 표시');
    ok(t.eStatus === '대책요청' && t.eHist === 1 && t.eRej >= 1, `가 재대책 요청 → 대책요청 상태, 무효 이력 보존 (${t.eStatus})`);
    await ctx.close();
  }

  // 나 · 라 · 마: 판정 규칙
  {
    const { ctx, p } = await fresh(browser);
    await p.evaluate(SEED);
    const r = await p.evaluate(() => {
      const out = {};
      // 나. 승인 후 검증 전 재발 → 대책 후 재발(강제 A)
      db.defects.push({ id: 'x1', date: '2026-09-01', supplierId: 'S1', partNo: 'P-100', type: '치수', qty: 1, ncrId: 'k', photos: [], costs: [] });
      db.ncrs.push({ id: 'k', no: 'K', supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: ['x1'], issueDate: '2026-09-02', replyDate: '2026-09-10', validity: '적정', approvedDate: '2026-09-12' });
      const d2 = { id: 'x2', date: '2026-10-01', supplierId: 'S1', partNo: 'P-100', type: '치수', qty: 1, source: '수입검사', photos: [], costs: [] };
      db.defects.push(d2);
      out.re = repeatInfo(d2).re;
      // 라. 단순 통보 — 통보 전에는 완료 아님
      db.defects.push({ id: 'x3', date: '2026-10-02', supplierId: 'S1', partNo: 'P-100', type: '외관', qty: 1, ncrId: 'm', disposition: '반품', photos: [], costs: [] });
      db.ncrs.push({ id: 'm', no: 'M', supplierId: 'S1', reqType: '단순 통보', defectIds: ['x3'], issueDate: '2026-10-02' });
      out.infoDone = !!isDone(db.defects.find(x => x.id === 'x3'));
      // 마. 공동 귀책 A등급 → NCR 권고
      const j = { id: 'x4', date: '2026-10-03', supplierId: 'S1', partNo: 'P-100', type: '파손', qty: 1, resp: '공동', inv: { share: 50 }, sev: { impact: 4 }, disposition: '반품', photos: [], costs: [] };
      db.defects.push(j);
      out.joint = ncrReasons(j).length; out.jointStage = defStage(j).label;
      return out;
    });
    ok(r.re === true, '나 승인 후(검증 전) 재발은 대책 후 재발');
    ok(r.infoDone === false, '라 단순 통보는 통보 전 불량 완료 아님');
    ok(r.joint === 1 && r.jointStage.includes('NCR 발행 필요'), `마 공동 귀책 A등급 NCR 권고 (${r.jointStage})`);
    await ctx.close();
  }

  // 1-5 대용량 저장소를 쓰던 PC에서 열기 실패 → 저장 멈춤 / 남은 사본이 데이터를 덮지 않음
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(FILE);
    await p.waitForFunction(() => dataReady);
    await p.evaluate(() => { for (let i = 0; i < 5; i++) db.defects.push({ id: 'k' + i, date: '2026-10-0' + (i + 1), qty: 1, photos: [], costs: [] }); save(); });
    await p.waitForTimeout(600);
    // 예전 창이 기본 저장소에 1건짜리 '더 최근' 사본을 남김
    await p.evaluate(() => { const d = JSON.parse(JSON.stringify(db)); d.defects = d.defects.slice(0, 1); d.meta.saved = new Date(Date.now() + 60000).toISOString(); localStorage.setItem(KEY, JSON.stringify(d)); });
    await p.reload(); await p.waitForFunction(() => dataReady);
    ok(await p.evaluate(() => db.defects.length) === 5, '1-5 남은 1건짜리 사본이 5건 데이터를 덮지 않음');
    // IndexedDB 열기 실패
    await p.addInitScript(() => { const o = indexedDB.open.bind(indexedDB); indexedDB.open = () => { throw new Error('시험: 저장소 고장'); }; });
    await p.reload(); await p.waitForFunction(() => dataReady);
    const st = await p.evaluate(() => ({ lf: !!loadFailed, n: db.defects.length, bar: document.querySelector('#alertBar').innerText }));
    ok(st.lf && st.bar.includes('읽지 못했습니다'), '1-5 저장소 열기 실패 → 빨간 안내 · 저장 멈춤');
    await ctx.close();
  }

  // 2-5 두 창: 두 번째 창은 보기 전용, 첫 창을 닫으면 편집 가능
  {
    const ctx = await browser.newContext();
    const a = await ctx.newPage(); await a.goto(FILE); await a.waitForFunction(() => dataReady);
    const b = await ctx.newPage(); await b.goto(FILE); await b.waitForFunction(() => dataReady);
    await b.waitForTimeout(300);
    ok(await b.evaluate(() => tabLocked) === true && await a.evaluate(() => tabLocked) === false, '2-5 두 번째 창은 보기 전용');
    await a.evaluate(() => { db.defects.push({ id: 'w1', date: '2026-10-10', qty: 1, photos: [], costs: [] }); save(); });
    await a.waitForTimeout(500);
    await a.close();
    await b.waitForFunction(() => !tabLocked, null, { timeout: 5000 }).catch(() => {});
    ok(await b.evaluate(() => !tabLocked && db.defects.some(x => x.id === 'w1')), '2-5 첫 창을 닫으면 최신 데이터로 편집 가능');
    await ctx.close();
  }

  // 모든 탭 · NCR 편집 창이 오류 없이 열림 (예시 데이터)
  {
    const { ctx, p, errs } = await fresh(browser);
    // 가상 데이터 (실제 협력사 · 품번 아님)
    await p.evaluate(() => {
      const d = defaultDB();
      d.suppliers = [{ id: 'S1', name: '가나정밀', code: 'A01' }, { id: 'S2', name: '다라공업', code: 'B02' }];
      d.parts = [{ id: 'P1', partNo: 'TP-001', name: '시험 힌지', supplierId: 'S1' }, { id: 'P2', partNo: 'TP-002', name: '시험 스프링', supplierId: 'S2' }];
      const ty = ['치수', '외관', '파손', '기능'], rs = ['협력사', '사내', '공동', '미정'];
      for (let i = 0; i < 16; i++) d.defects.push({ id: 'D' + i, date: `2026-${String(8 + (i % 3)).padStart(2, '0')}-${String(1 + i).padStart(2, '0')}`, supplierId: i % 2 ? 'S2' : 'S1', partNo: i % 2 ? 'TP-002' : 'TP-001', type: ty[i % 4], qty: i + 1, resp: rs[i % 4], source: '수입검사', disposition: i % 3 ? '반품' : '', photos: [], costs: i % 4 ? [] : [{ id: 'c' + i, cat: '선별', amt: 10000 * i, date: '2026-09-01' }] });
      const st = [{}, { notifyDate: '2026-09-02', requestDate: '2026-09-02', dueDate: '2026-09-09' }, { notifyDate: '2026-09-02', replyDate: '2026-09-08', validity: '적정', approvedDate: '2026-09-09' }, { notifyDate: '2026-09-02', replyDate: '2026-09-08', validity: '적정', approvedDate: '2026-09-09', verifyDate: '2026-10-01', verifyResult: '무효(재발)' }];
      st.forEach((x, i) => { d.ncrs.push({ id: 'N' + i, no: 'NCR-T' + i, issueDate: '2026-09-01', supplierId: 'S1', partNo: 'TP-001', reqType: i === 0 ? '단순 통보' : '8D 보고서', defectIds: ['D' + (i * 4)], ...x }); d.defects[i * 4].ncrId = 'N' + i; });
      d.receipts = [{ id: 'R1', supplierId: 'S1', month: '2026-09', qty: 10000 }];
      d.cases = [{ id: 'C1', CaseNo: 'RCA-T1', Title: '시험 이슈', Stage: '원인분석', Status: '진행중' }];
      db = migrate(d);
    });
    const tabs = await p.evaluate(() => TABS.map(t => t[0]));
    for (const t of tabs) { await p.evaluate(x => { state.tab = x; render(); }, t); await p.waitForTimeout(150); }
    await p.evaluate(() => { for (const n of db.ncrs) { for (const m of ['issue', 'reply', 'verify']) { editNcr(n.id, null, m); closeModal(true); } } });
    ok(errs.length === 0, `탭 ${tabs.length}개 · NCR 편집 창 오류 없음 ` + errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `FAILS: ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
