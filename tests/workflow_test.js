// v0.5.0 업무 흐름 시험 (Playwright): node tests/workflow_test.js [index.html 경로]
// KPI 이동 · 독촉/회신 접수 · 저장 후 NCR 발행 · RCA 이력 · 조치 정리 · 지연 기준 · 주간 보고 · 배지 · 진행 막대
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const fails = [];
const monthEndJs = f => { const [y, m] = f.split('-').map(Number); return `${f.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };

async function fresh(browser, confirmVal = true) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE);
  await p.waitForFunction(() => typeof dataReady !== 'undefined' && dataReady);
  await p.evaluate(v => { window.__cfm = v; window.askConfirm = async () => window.__cfm; }, confirmVal);
  return { ctx, p, errs };
}
// 시험 데이터 (가상): 협력사 1, 부품 1, 회신 지연 NCR, RCA 1
const SEED = () => {
  const t = today();
  db.suppliers.push({ id: 'S1', name: '시험협력사', code: 'T1', contacts: [{ id: 'k1', name: '홍길동', role: '품질 담당', email: 'qa@example.com', primary: true }] });
  db.parts.push({ id: 'P1', partNo: 'P-100', name: '스핀들 너트', supplierId: 'S1' });
  db.ncrs.push({ id: 'n1', no: 'N-LATE', issueDate: addDays(t, -20), notifyDate: addDays(t, -20), requestDate: addDays(t, -20), dueDate: addDays(t, -5), supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: [] });
  db.ncrs.push({ id: 'n2', no: 'N-WAIT', issueDate: addDays(t, -2), notifyDate: addDays(t, -2), requestDate: addDays(t, -2), dueDate: addDays(t, 5), supplierId: 'S1', partNo: 'P-100', reqType: '8D 보고서', defectIds: [] });
  touch(db.ncrs[0]); touch(db.ncrs[1]);
};

(async () => {
  const browser = await chromium.launch();

  // 1. KPI 카드 → 필터가 걸린 목록 · 오늘 챙길 일 펼치기
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => { go('dash') });
    const n = await p.locator('.kpi.go').count();
    ok(n >= 10, `1 대시보드 KPI 카드 클릭 가능 (${n}개)`);
    await p.locator('.kpi.go', { hasText: '대책서 회신 지연' }).click();
    const r = await p.evaluate(() => ({ tab: state.tab, st: state.nf.status, rows: document.querySelectorAll('#ntab tbody tr').length, txt: document.querySelector('#ntab').innerText }));
    ok(r.tab === 'ncr' && r.st === 'replyLate' && r.txt.includes('N-LATE') && !r.txt.includes('N-WAIT'), '1 회신 지연 KPI → NCR 목록 회신 지연 필터 ' + JSON.stringify({ tab: r.tab, st: r.st }));
    ok(await p.locator('#ntab tr.late').count() === 1, '1 NCR 목록 지연 행 배경');
    await p.evaluate(() => { go('dash') });
    await p.locator('.kpi.go', { hasText: '심각도 A' }).click();
    const d = await p.evaluate(() => ({ tab: state.tab, sev: state.df.sev, from: state.df.from, to: state.df.to }));
    ok(d.tab === 'defect' && d.sev === 'A' && d.from.endsWith('-01') && d.to === monthEndJs(d.from), '1 심각도 A KPI → 그 달 A등급 불량 목록 ' + JSON.stringify(d));
    await p.evaluate(() => { go('dash') });
    await p.locator('.kpi.go', { hasText: '지연 중인 건' }).click();
    ok(await p.evaluate(() => state.tab === 'case' && czUi.view === 'prog' && state.pf.late === '1'), '1 지연 중인 건 KPI → 진행 현황 지연만');
    // 오늘 챙길 일 펼치기 — 항목 7개 이상 만들기
    await p.evaluate(() => { for (let i = 0; i < 8; i++) { const n = { id: 'x' + i, no: 'N-X' + i, issueDate: addDays(today(), -30), supplierId: 'S1', reqType: '8D 보고서', defectIds: [] }; db.ncrs.push(n) } go('dash') });
    const before = await p.evaluate(() => document.querySelectorAll('ul.act li').length);
    await p.locator('button', { hasText: /전체 \d+건 보기/ }).click();
    const after = await p.evaluate(() => ({ n: document.querySelectorAll('ul.act li').length, tab: state.tab }));
    ok(before === 6 && after.n > 6 && after.tab === 'dash', `1 오늘 챙길 일 전체 보기 = 그 자리에서 펼침 (${before} → ${after.n})`);
    ok(errs.length === 0, '1 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 2. 독촉 · 회신 접수
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => { go('dash') });
    await p.locator('ul.act li', { hasText: 'N-LATE' }).locator('button', { hasText: '독촉' }).click();
    await p.waitForSelector('#modal.on');
    ok(await p.inputValue('#mf [name=party]') === '홍길동', '2 독촉 창: 협력사 품질 담당 자동');
    await p.evaluate(() => { const c = $('#mf [name=mail]'); if (c) c.checked = false });
    await p.locator('#mfoot button', { hasText: '독촉 기록' }).click();
    const lg = await p.evaluate(() => { const n = db.ncrs.find(x => x.id === 'n1'); return { cnt: nudgeLogs(n).length, kind: n.logs[0].kind, txt: n.logs[0].text } });
    ok(lg.cnt === 1 && lg.kind === '협력사 연락' && lg.txt.includes('독촉'), '2 독촉이 진행 기록에 남음 ' + JSON.stringify(lg));
    ok((await p.locator('ul.act li', { hasText: 'N-LATE' }).innerText()).includes('독촉 1회'), '2 대시보드에 독촉 횟수 표시');
    await p.locator('ul.act li', { hasText: 'N-LATE' }).locator('button', { hasText: '회신 접수' }).click();
    const rp = await p.evaluate(() => { const n = db.ncrs.find(x => x.id === 'n1'); return { rd: n.replyDate, st: ncrStatus(n), bar: $('#actbar').classList.contains('on') } });
    ok(rp.rd === await p.evaluate(() => today()) && rp.st === '대책서 검토' && rp.bar, '2 회신 접수(오늘) → 대책서 검토 + 평가 바로가기 ' + JSON.stringify(rp));
    await p.evaluate(() => { go('ncr') });
    ok(await p.locator('#ntab button', { hasText: '회신 접수' }).count() === 1, '2 NCR 목록 회신 대기 건에 회신 접수 버튼 (N-WAIT)');
    ok(errs.length === 0, '2 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 3. 불량 저장 직후 NCR 발행 바로가기
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => { editDefect() });
    await p.fill('#mf [name=partNo]', 'P-100');
    await p.evaluate(() => { onPartNo('P-100') });
    await p.fill('#mf [name=qty]', '500');
    await p.fill('#mf [name=inspQty]', '1000');
    await p.evaluate(() => { const f = $('#mf'); f.resp.value = '협력사'; f.disposition.value = f.disposition.options[1] ? f.disposition.options[1].value : '' });
    const id = await p.evaluate(() => saveDefect());
    const s = await p.evaluate(id => { const d = db.defects.find(x => x.id === id); return { g: sevOf(d).grade, on: $('#actbar').classList.contains('on'), btn: $('#actBtn').textContent, rs: ncrReasons(d).length } }, id);
    if (s.rs) {
      ok(s.on && s.btn === 'NCR 발행', '3 A·B등급 불량 저장 직후 [NCR 발행] 바로가기 ' + JSON.stringify(s));
      await p.click('#actBtn');
      ok(await p.evaluate(() => $('#modal').classList.contains('on') && $('#mt').textContent.includes('NCR')), '3 바로가기 → NCR 발행 창');
    } else ok(false, '3 시험 데이터가 NCR 권고 등급이 아님 ' + JSON.stringify(s));
    ok(errs.length === 0, '3 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 4 · 5 · 9. RCA 이력 · 조치 정리 · 진행 막대
  {
    const { ctx, p, errs } = await fresh(browser, '원인 재분석 필요');
    await p.evaluate(SEED);
    const r = await p.evaluate(() => {
      const c = czCreateCase({ Title: '스프링 파단', PartId: 'P1', DefectType: db.settings.defectTypes[0], DefectQty: 5, Description: 'x', SevS: '4', ImpI: '3', Response: '8D', Ball: '나', NextAction: '확인', RecheckDate: today() });
      save(); czOpenCase(c.id); czStageNext();
      return { id: c.id, log: c.Log.map(x => x.type + ':' + x.text), stage: c.Stage };
    });
    ok(r.log[0].startsWith('생성') && r.log.some(x => x.startsWith('단계:접수 → 격리')), '4 RCA 생성 · 단계 진행이 이력에 남음 ' + JSON.stringify(r.log));
    // 진행 막대: 현재 단계 체류 · 다음 단계 남은 조건 수
    const st = await p.evaluate(() => ({ cur: document.querySelector('.cz .stg.cur').innerText, nx: document.querySelector('.cz .stg.nx')?.innerText || '' }));
    ok(/0일째/.test(st.cur) && /\d/.test(st.nx), '9 진행 막대: 체류 일수 · 남은 조건 수 ' + JSON.stringify(st));
    await p.click('.cz .stg.nx');
    ok(await p.evaluate(() => czUi.showGate && !!document.querySelector('.cz .gate')), '9 다음 단계 칩을 누르면 남은 조건 목록');
    // 되돌리기 — 사유 필수
    await p.click('.cz [data-act=stagePrev]');
    const back = await p.evaluate(id => { const c = czById('cases', id); const l = c.Log[c.Log.length - 1]; return { stage: c.Stage, type: l.type, reason: l.reason } }, r.id);
    ok(back.stage === '접수' && back.type === '되돌림' && back.reason === '원인 재분석 필요', '4 되돌리기: 사유와 함께 이력 ' + JSON.stringify(back));
    // 사유 없이(취소) 되돌리기는 안 됨
    await p.evaluate(id => { czStageNext(); window.__cfm = false }, r.id);
    await p.click('.cz [data-act=stagePrev]');
    ok(await p.evaluate(id => czById('cases', id).Stage === '격리', r.id), '4 되돌리기 취소하면 단계 그대로');
    // 조치: 완료 해제 → 완료일 비움, 효과검증 구분
    const a = await p.evaluate(id => {
      const c = czById('cases', id); const x = czCreateAction({ CaseId: id, Category: '발생대책', Title: '금형 수정' }); save(); czUi.tab = 'actions'; render();
      const sel = document.querySelector(`.cz [data-scope=act][data-id="${x.id}"][data-f=ActionStatus]`);
      sel.value = '완료'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      const d1 = x.DoneDate;
      sel.value = '진행'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { d1, d2: x.DoneDate, st: x.ActionStatus, logs: c.Log.filter(l => l.actId === x.id).map(l => l.type), cat: CZ_OPT.ActCat.includes('효과검증') };
    }, r.id);
    ok(a.d1 && a.d2 === '' && a.st === '진행', '5 완료 해제 → 완료일도 비움 ' + JSON.stringify(a));
    ok(a.logs.includes('조치 완료') && a.logs.includes('조치'), '4 조치 완료 · 완료 해제가 이력에 남음 ' + JSON.stringify(a.logs));
    ok(a.cat, '5 조치 구분에 효과검증');
    // 게이트: 담당자 · 기한 없는 미완료 조치
    const g = await p.evaluate(id => { const c = czById('cases', id); const x = czCreateAction({ CaseId: id, Category: '유출대책', Title: '검사 추가', Assignee: '', DueDate: '' }); const m = czGate(c, '효과검증').some(r => r.t.includes('담당자 · 기한')); czActs(c).forEach(a => { a.Assignee = a.Assignee || '김'; a.DueDate = a.DueDate || today() }); const m2 = czGate(c, '효과검증').some(r => r.t.includes('담당자 · 기한')); return { m, m2 } }, r.id);
    ok(g.m && !g.m2, '5 담당자 · 기한 없는 조치가 있으면 대책 다음 단계로 못 감 ' + JSON.stringify(g));
    // 효과검증 기본 행
    const gh = await p.evaluate(id => { const c = czById('cases', id); c.Stage = '효과검증'; c.VerifyEnd = addDays(today(), 20); czUi.tab = 'actions'; render(); const i = document.querySelector('.cz input[data-scope=ghostdue][data-cat=효과검증]'); return i ? i.value === c.VerifyEnd : false }, r.id);
    ok(gh, '5 효과검증 단계 기본 행 (기한 = 검증 종료일)');
    // 종결 → 다시 열기: 사유 필수
    const ro = await p.evaluate(async id => {
      const c = czById('cases', id); c.Status = '종결'; c.Stage = '종결'; c.CloseDate = today(); window.__cfm = '고객 추가 요청'; czUi.tab = 'basic'; render();
      document.querySelector('.cz [data-act=reopen]').click(); await new Promise(r => setTimeout(r, 50));
      const l = c.Log[c.Log.length - 1]; return { st: c.Status, cd: c.CloseDate, type: l.type, reason: l.reason };
    }, r.id);
    ok(ro.st === '진행중' && ro.cd === '' && ro.type === '다시 열기' && ro.reason === '고객 추가 요청', '4 다시 열기: 사유와 함께 이력 ' + JSON.stringify(ro));
    // 상태 선택으로 종결 → 진행중 변경도 사유를 받음
    const ro2 = await p.evaluate(async id => {
      const c = czById('cases', id); c.Status = '종결'; c.Stage = '종결'; c.CloseDate = today(); window.__cfm = false; render();
      const s = document.querySelector('.cz select[data-scope=case][data-f=Status]'); s.value = '진행중'; s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50)); return { st: c.Status, cd: c.CloseDate };
    }, r.id);
    ok(ro2.st === '종결' && ro2.cd, '4 상태 선택으로 다시 열기: 사유를 안 주면 그대로 종결');
    // 이력 탭
    const h = await p.evaluate(id => { czUi.tab = 'hist'; render(); return { rows: document.querySelectorAll('.cz .card tbody tr').length, txt: document.querySelector('.cz .card').innerText } }, r.id);
    ok(h.rows >= 5 && h.txt.includes('다시 열기') && h.txt.includes('되돌림'), `4 이력 탭 (${h.rows}줄)`);
    // 기존 건(이력 없음)은 날짜로 추정
    const old = await p.evaluate(() => { db.cases.push({ id: 'old', CaseNo: 'RCA-OLD', Title: '옛 건', Stage: '종결', Status: '종결', Created: '2026-01-05', CloseDate: '2026-02-01' }); czOpenCase('old', 'hist'); return document.querySelector('.cz .card').innerText });
    ok(old.includes('2026-01-05') && old.includes('2026-02-01') && old.includes('추정'), '4 이력 도입 전 건은 등록일 · 종결일로 추정 표시');
    ok(errs.length === 0, '4 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 6. 목표 종결일 · 하나의 지연 기준
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    const r = await p.evaluate(() => {
      const c = { id: 'c1', CaseNo: 'RCA-1', Title: '늦은 건', Stage: '대책', Status: '진행중', Tier: 'TIER 2', Created: addDays(today(), -40) }; db.cases.push(c);
      const c2 = { id: 'c2', CaseNo: 'RCA-2', Title: '정상 건', Stage: '대책', Status: '진행중', Tier: 'TIER 3', Created: addDays(today(), -40) }; db.cases.push(c2);
      const c3 = { id: 'c3', CaseNo: 'RCA-3', Title: '직접 지정', Stage: '대책', Status: '진행중', Tier: 'TIER 3', Created: addDays(today(), -40), TargetClose: addDays(today(), -1) }; db.cases.push(c3);
      return { t1: czTarget(c), l1: lateInfo('rca', c).map(x => x.l), l2: lateInfo('rca', c2).length, l3: lateInfo('rca', c3).length, ncr: lateInfo('ncr', db.ncrs[0]).map(x => x.l) };
    });
    ok(r.l1.includes('목표 종결일') && r.l2 === 0 && r.l3 === 1, '6 목표 종결일 = 등록일 + TIER 일수 (TIER 2 30일 · TIER 3 45일) · 직접 지정 우선 ' + JSON.stringify(r));
    ok(r.ncr.includes('대책서 회신'), '6 NCR 회신 지연이 같은 기준으로 잡힘');
    await p.evaluate(() => { db.settings.rcaT2 = 60; });
    ok(await p.evaluate(() => lateInfo('rca', czById('cases', 'c1')).length === 0), '6 설정에서 TIER 일수를 바꾸면 반영');
    await p.evaluate(() => { db.settings.rcaT2 = 30; czUi.filt.late = '1'; czUi.filt.status = '미종결'; czGo('cases') });
    const lst = await p.evaluate(() => document.querySelector('.cz table.t tbody').innerText);
    ok(lst.includes('RCA-1') && lst.includes('RCA-3') && !lst.includes('RCA-2'), 'RCA 목록 지연만 필터');
    ok(await p.locator('.cz table.t tr.late').count() === 2, '6 RCA 목록 지연 행 배경');
    const dash = await p.evaluate(() => { go('dash'); return document.querySelector('.kpi.go:last-of-type') && [...document.querySelectorAll('.kpi')].find(k => k.innerText.includes('지연 중인 건')).querySelector('.v').innerText });
    ok(+dash >= 3, '6 대시보드 지연 중인 건 = RCA 2 + NCR 1 이상 (' + dash + ')');
    ok(await p.evaluate(() => document.body.innerText.includes('RCA 월별 등록 · 종결')), '6 대시보드 RCA 월별 추이');
    ok(errs.length === 0, '6 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 7. 주간 보고
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    await p.evaluate(() => { db.defects.push({ id: 'd1', date: today(), source: db.settings.sources[0], supplierId: 'S1', partNo: 'P-100', partName: '스핀들 너트', type: db.settings.defectTypes[0], qty: 3, resp: '협력사' }) });
    const [w] = await Promise.all([ctx.waitForEvent('page'), p.evaluate(() => weekReport())]);
    await w.waitForLoadState();
    await w.waitForFunction(() => document.body && document.body.innerText.includes('주간 품질 현황 보고'), null, { timeout: 5000 }).catch(() => { });
    const t = await w.evaluate(() => document.body.innerText);
    ok(t.includes('주간 품질 현황 보고') && t.includes('신규 불량 (1건)') && t.includes('N-LATE') && t.includes('지연 중인 건'), '7 주간 보고 — 신규 불량 · 지연 NCR 포함');
    ok(errs.length === 0, '7 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  // 8. 배지 색
  {
    const { ctx, p } = await fresh(browser);
    const r = await p.evaluate(() => ({ cls: SEV_CLS.A, bg: (() => { const e = document.createElement('span'); e.className = 'bg svA'; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c })() }));
    ok(r.cls === 'svA' && r.bg === 'rgb(192, 57, 43)', '8 심각도 A 전용 배지 ' + JSON.stringify(r));
    await ctx.close();
  }

  // 10. 수입검사 검출 판정 (v0.5.1) — 샘플링 한계면 사내 유출 RCA 권고 없음 · NCR 요구사항에 유출 문구
  {
    const { ctx, p, errs } = await fresh(browser);
    await p.evaluate(SEED);
    const r = await p.evaluate(() => {
      const src = db.settings.sources.find(x => /공정|라인|조립/.test(x)) || (db.settings.sources.push('공정'), '공정');
      const d = { id: 'e1', date: today(), source: src, supplierId: 'S1', partNo: 'P-100', partName: '스핀들 너트', type: db.settings.defectTypes[0], qty: 500, inspQty: 1000, resp: '협력사', disposition: '선별' };
      db.defects.push(d);
      const R = () => routeOf(d).map(x => x.t), hasRca = () => R().some(t => t.startsWith('유출 원인 분석')), btn = () => actCell(d).includes('유출 RCA');
      const s0 = { judge: R().some(t => t.startsWith('수입검사 검출 판정')), rca: hasRca(), btn: btn(), lv: escLevel([d]) };
      d.escJudge = '샘플링 한계';
      const s1 = { rca: hasRca(), btn: btn(), lv: escLevel([d]), req: defaultReq('8D 보고서', today(), null, false, escLevel([d])), scope: czBuildFrom([d], null).o.RcaScope };
      d.escJudge = '검사 항목 아님';
      const s2 = { rca: hasRca(), btn: btn(), lv: escLevel([d]), scope: czBuildFrom([d], null).o.RcaScope };
      d.resp = '사내'; const s3 = escLevel([d]);
      return { s0, s1, s2, s3, src };
    });
    ok(r.s0.judge && !r.s0.rca && r.s0.btn && r.s0.lv === 1, '10 판정 전: 검출 판정 단계 표시 · 유출 RCA 권고는 판정 후 ' + JSON.stringify(r.s0));
    ok(!r.s1.rca && !r.s1.btn && r.s1.lv === 2 && r.s1.req.includes('출하 전 전수') && r.s1.scope === '없음', '10 샘플링 한계: 사내 RCA 없음 · NCR에 유출 원인 · 출하 전수/자동 검출 요구 ' + JSON.stringify(r.s1).slice(0, 200));
    ok(r.s2.rca && r.s2.btn && r.s2.lv === 1 && r.s2.scope === '유출', '10 검사 항목 아님: 사내 유출 RCA 권고 ' + JSON.stringify(r.s2));
    ok(r.s3 === 0, '10 사내 귀책은 유출 문구 없음');
    // 등록 폼: 공정 + 협력사일 때만 판정 칸
    await p.evaluate(() => { const d = db.defects.find(x => x.id === 'e1'); d.resp = '협력사'; d.escJudge = ''; editDefect('e1') });
    const v1 = await p.evaluate(() => $('#escRow').style.display !== 'none');
    await p.selectOption('#mf [name=escJudge]', '샘플링 한계');
    await p.selectOption('#mf [name=resp]', '사내');
    const v2 = await p.evaluate(() => $('#escRow').style.display === 'none');
    await p.selectOption('#mf [name=resp]', '협력사');
    await p.evaluate(() => saveDefect('e1'));
    const saved = await p.evaluate(() => db.defects.find(x => x.id === 'e1').escJudge);
    ok(v1 && v2 && saved === '샘플링 한계', '10 등록 폼: 공정 · 협력사일 때만 판정 칸 · 저장 ' + JSON.stringify({ v1, v2, saved }));
    ok(errs.length === 0, '10 페이지 오류 없음 ' + errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
