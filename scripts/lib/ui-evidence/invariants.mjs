// Evidence invariants for the intake pilot.
// Pure functions: they read evidence JSON and return checks; they never touch the page.
export const INVARIANTS_VERSION='2026-11-10.3';

const round=(value,digits=2)=>Math.round(value*10**digits)/10**digits;
const empty=value=>value===null||value===undefined||String(value).trim()==='';
const finite=value=>Number.isFinite(Number(value));

function check(id,severity,ok,detail,{warnOnly=false}={}){
  return {id,severity,ok,detail,warnOnly};
}

export function checkTarget(evidence){
  const checks=[];
  if(!evidence)return [check('target-evidence','P1',false,'target step did not run')];

  const staticAncestor=evidence.static?.ancestors?.find(item=>item.selector==='.unified-tab-content');
  const hoverAncestor=evidence.hover?.ancestors?.find(item=>item.selector==='.unified-tab-content');
  const targetTop=evidence.static?.target?.rect?.top;
  const hoverTargetTop=evidence.hover?.target?.rect?.top;
  const staticAncestorTop=staticAncestor?.rect?.top;
  const hoverAncestorTop=hoverAncestor?.rect?.top;

  if(!finite(targetTop)||!finite(staticAncestorTop)){
    return [check('target-evidence','P1',false,'missing target or .unified-tab-content static geometry')];
  }

  const tokenRaw=parseFloat(staticAncestor?.computed?.pageTopGap);
  const token=Number.isFinite(tokenRaw)?tokenRaw:8;
  const staticGap=round(targetTop-staticAncestorTop);
  checks.push(check(
    'target-top-gap',
    'P1',
    staticGap>=4,
    `target top ${targetTop} - ancestor ${staticAncestor.selector} top ${staticAncestorTop} = ${staticGap}px (floor >=4, token ${token})`
  ));
  if(staticGap>=4&&staticGap<token)checks.push(check(
    'target-top-gap-token',
    'P2',
    false,
    `top gap ${staticGap}px is below --page-top-gap ${token}px (contract drift)`,
    {warnOnly:true}
  ));

  if(!finite(hoverTargetTop)||!finite(hoverAncestorTop)){
    checks.push(check('hover-top-boundary','P1',false,'missing hover target/ancestor geometry'));
  }else{
    const hoverGap=round(hoverTargetTop-hoverAncestorTop);
    checks.push(check(
      'hover-top-boundary',
      'P1',
      hoverGap>=4&&hoverTargetTop>=hoverAncestorTop,
      `hover top ${hoverTargetTop} - ancestor top ${hoverAncestorTop} = ${hoverGap}px (floor >=4, token ${token}); transform=${evidence.hover?.target?.computed?.transform??'n/a'}`
    ));
    if(hoverGap>=4&&hoverGap<token)checks.push(check(
      'hover-top-gap-token',
      'P2',
      false,
      `hover top gap ${hoverGap}px is below --page-top-gap ${token}px (contract drift)`,
      {warnOnly:true}
    ));
  }

  checks.push(check(
    'hover-hit-target',
    'P1',
    !!evidence.hover?.elementAtTop?.isTarget,
    `elementFromPoint at hover top = ${evidence.hover?.elementAtTop?.tag??'null'}.${evidence.hover?.elementAtTop?.cls??''}${evidence.hover?.elementAtTop?.testid?` [${evidence.hover.elementAtTop.testid}]`:''}`
  ));
  checks.push(check(
    'static-hit-target',
    'P2',
    !!evidence.static?.elementAtTop?.isTarget,
    `elementFromPoint at static top = ${evidence.static?.elementAtTop?.tag??'null'}.${evidence.static?.elementAtTop?.cls??''}`,
    {warnOnly:true}
  ));

  const heights=(evidence.static?.rows??[]).flatMap(row=>(row.elements??[]).map(el=>parseFloat(el.computed?.height))).filter(Number.isFinite);
  checks.push(check(
    'row-height-evidence',
    'P1',
    heights.length>0,
    `same-row control samples = ${heights.length}`
  ));
  if(heights.length){
    const spread=round(Math.max(...heights)-Math.min(...heights));
    checks.push(check(
      'row-height-family',
      'P2',
      spread<=2,
      `same-row control heights = [${heights.join(', ')}], spread=${spread}px (tolerance 2px)`,
      {warnOnly:true}
    ));
  }

  return checks;
}

export function checkCapture(evidence){
  const checks=[];
  if(!evidence)return [check('capture-evidence','P1',false,'capture-dialog step did not run')];
  const payload=evidence.payload;
  if(!evidence.request||!payload||typeof payload!=='object'){
    return [check('capture-payload','P1',false,'no mocked POST /api/intake payload captured')];
  }

  const fields=[
    ['source-ref',evidence.cleared?.ref,payload.source_ref],
    ['expected-finish',evidence.cleared?.finish,payload.expected_finish],
  ];
  for(const [id,displayed,submitted] of fields){
    const stale=empty(displayed)&&!empty(submitted);
    checks.push(check(
      `capture-${id}`,
      'P1',
      !stale,
      `cleared field=${JSON.stringify(displayed)}, submitted=${JSON.stringify(submitted)}${stale?' (display/payload divergence)':''}`
    ));
  }

  const chips=String(evidence.cleared?.chips??evidence.autoFilled?.chips??'').trim();
  const bothFieldsEmpty=empty(evidence.cleared?.ref)&&empty(evidence.cleared?.finish);
  checks.push(check(
    'capture-stale-chips',
    'P2',
    !(bothFieldsEmpty&&chips.length>0),
    `cleared fields=(${JSON.stringify(evidence.cleared?.ref)},${JSON.stringify(evidence.cleared?.finish)}), chips=${JSON.stringify(chips)}`,
    {warnOnly:true}
  ));
  checks.push(check(
    'capture-dialog-close',
    'P2',
    !evidence.dialogOpenAfterSubmit,
    `dialog open after mocked success = ${evidence.dialogOpenAfterSubmit}`,
    {warnOnly:true}
  ));
  return checks;
}

export function checkDelete(evidence,{language='zh-CN'}={}){
  const checks=[];
  if(!evidence)return [check('delete-evidence','P1',false,'delete-dialog step did not run')];
  const attributes=evidence.modal?.attributes??{};
  const role=attributes.role??null;
  const ariaModal=String(attributes.ariaModal)==='true';
  const backgroundIsolated=!!evidence.modal?.backgroundIsolated;
  checks.push(check(
    'delete-role',
    'P1',
    role==='dialog'||role==='alertdialog',
    `role=${JSON.stringify(role)} (required dialog|alertdialog)`
  ));
  checks.push(check(
    'delete-modal-isolation',
    'P1',
    ariaModal||backgroundIsolated,
    `aria-modal=${JSON.stringify(attributes.ariaModal)}, backgroundIsolated=${backgroundIsolated}, siblings=${JSON.stringify(evidence.modal?.backgroundSiblings??[])}`
  ));
  if(!ariaModal)checks.push(check(
    'delete-aria-modal-attr',
    'P2',
    false,
    'aria-modal is absent; Radix hideOthers isolates the background, but the attribute is still missing',
    {warnOnly:true}
  ));
  const name=attributes.ariaLabel??evidence.modal?.ariaLabelledbyText??'';
  checks.push(check(
    'delete-name',
    'P1',
    !empty(name),
    `accessible name source aria-label/aria-labelledby text=${JSON.stringify(name)}, aria-labelledby=${JSON.stringify(attributes.ariaLabelledby)}`
  ));
  checks.push(check(
    'delete-initial-focus',
    'P1',
    !!evidence.modal?.initialFocusInside,
    `initial focus=${JSON.stringify(evidence.modal?.initialFocus)}`
  ));
  const escaped=evidence.focusTrace?.filter(step=>!step.insideModal)??[];
  checks.push(check(
    'delete-focus-contained',
    'P1',
    escaped.length===0,
    `Tab steps outside modal = ${escaped.length}/${evidence.focusTrace?.length??0}; first outside=${JSON.stringify(escaped[0]??null)}`
  ));
  const close=evidence.modal?.close;
  const closeName=close?.ariaLabel??close?.title??close?.text??'';
  checks.push(check(
    'delete-close-name',
    'P1',
    !empty(closeName),
    `close button name=${JSON.stringify(closeName)} (aria-label/title/text)`
  ));
  const closeWidth=Number(close?.rect?.width),closeHeight=Number(close?.rect?.height);
  checks.push(check(
    'delete-close-size',
    'P2',
    closeWidth>=44&&closeHeight>=44,
    `close button size=${closeWidth}x${closeHeight} (project touch target 44px)`,
    {warnOnly:true}
  ));
  const localeOk=language!=='zh-CN'||String(closeName).trim()==='关闭';
  checks.push(check(
    'delete-close-name-locale',
    'P2',
    localeOk,
    `language=${language}, close name=${JSON.stringify(closeName)} (zh-CN expects 关闭)`,
    {warnOnly:true}
  ));
  checks.push(check(
    'delete-escape-closes',
    'P1',
    !!evidence.closedByEscape,
    `Escape closed dialog = ${evidence.closedByEscape}`
  ));
  checks.push(check(
    'delete-focus-return',
    'P2',
    !!evidence.trigger?.testid&&evidence.afterClose?.testid===evidence.trigger.testid,
    `trigger=${JSON.stringify(evidence.trigger?.testid??null)}, after close=${JSON.stringify(evidence.afterClose?.testid??null)}`,
    {warnOnly:true}
  ));
  return checks;
}

export function checkStates(evidence){
  const checks=[];
  if(!evidence)return [check('states-evidence','P1',false,'states step did not run')];

  const countsError=evidence.countsError??{};
  const countsZero=/待处理[:：]\s*0/.test(String(countsError.countsText??''));
  const errorVisible=(countsError.alertTexts??[]).length>0;
  checks.push(check(
    'states-counts-error',
    'P1',
    !countsZero||errorVisible,
    `counts=${JSON.stringify(countsError.countsText??'')}, rows=${countsError.rows??'n/a'}, alert=${JSON.stringify(countsError.alertTexts??[])}`
  ));

  const noMatch=evidence.noMatch??{};
  const noMatchCounts=Number((/待处理[:：]\s*(\d+)/.exec(String(noMatch.countsText??''))??[])[1]);
  const globalEmpty=/收件箱为空/.test(String(noMatch.emptyText??''));
  checks.push(check(
    'states-no-match',
    'P1',
    !(noMatch.rows===0&&noMatchCounts>0&&globalEmpty),
    `rows=${noMatch.rows??'n/a'}, counts=${JSON.stringify(noMatch.countsText??'')}, empty=${JSON.stringify(noMatch.emptyText??'')}`
  ));

  const bulk=evidence.bulk??{};
  const bulkCounts=Number((/待处理[:：]\s*(\d+)/.exec(String(bulk.countsText??''))??[])[1]);
  checks.push(check(
    'states-bulk-pagination',
    'P1',
    !(Number.isFinite(bulkCounts)&&Number.isFinite(bulk.rows)&&bulkCounts>bulk.rows&&!bulk.hasPager),
    `counts=${JSON.stringify(bulk.countsText??'')}, rows=${bulk.rows??'n/a'}, hasPager=${bulk.hasPager}, pager=${JSON.stringify(bulk.pagerText??'')}`
  ));

  const responsive=evidence.responsive??{};
  const hidden=responsive.hiddenColumns??{};
  const hiddenActive=hidden.requester==='none'||hidden.expected==='none';
  const detail=String(responsive.detailText??'');
  const missingFields=[
    ['requester','张三'],
    ['expected_start','2026-12-01'],
    ['expected_finish','2026-12-31'],
  ].filter(([,value])=>!detail.includes(value)).map(([name])=>name);
  checks.push(check(
    'states-responsive-detail',
    'P1',
    !hiddenActive||missingFields.length===0,
    `hidden=${JSON.stringify(hidden)}, missing in detail=${JSON.stringify(missingFields)}, detail=${JSON.stringify(detail.slice(0,300))}`
  ));

  return checks;
}

export function checkTriage(evidence){
  const checks=[];
  if(!evidence)return [check('triage-evidence','P1',false,'triage step did not run')];
  const payload=evidence.payload;
  if(!evidence.request||!payload||typeof payload!=='object'){
    return [check('triage-payload','P1',false,'no mocked POST convert payload captured')];
  }

  const row=evidence.row??{};
  const dialog=evidence.dialog??{};
  const rowStart=String(row.expected_start??'');
  const dialogStart=String(dialog.start??'');
  const payloadStart=payload.expected_start??null;
  checks.push(check(
    'triage-start-divergence',
    'P1',
    !(rowStart!==''&&dialogStart===''&&payloadStart===null),
    `row.expected_start=${JSON.stringify(rowStart)}, dialog.start=${JSON.stringify(dialogStart)}, payload.expected_start=${JSON.stringify(payloadStart)}`
  ));
  const note=String(dialog.note??'');
  checks.push(check(
    'triage-note-consistency',
    'P1',
    !(rowStart!==''&&note.includes('不生成阶段')),
    `row.expected_start=${JSON.stringify(rowStart)}, note=${JSON.stringify(note)}`
  ));
  const rowFinish=String(row.expected_finish??'');
  checks.push(check(
    'triage-finish-prefill',
    'P2',
    rowFinish===''||String(dialog.finish??'')===rowFinish,
    `row.expected_finish=${JSON.stringify(rowFinish)}, dialog.finish=${JSON.stringify(dialog.finish??'')}`,
    {warnOnly:true}
  ));
  checks.push(check(
    'triage-dialog-close',
    'P2',
    !evidence.dialogOpenAfterSubmit,
    `dialog open after mocked success = ${evidence.dialogOpenAfterSubmit}`,
    {warnOnly:true}
  ));
  return checks;
}

export function evaluateAll({target,capture,delete:deleteEvidence,states,triage}={},{steps,meta}={}){
  const selected=steps?new Set(steps):null;
  const checks=[];
  if(!selected||selected.has('target'))checks.push(...checkTarget(target));
  if(!selected||selected.has('capture'))checks.push(...checkCapture(capture));
  if(!selected||selected.has('delete'))checks.push(...checkDelete(deleteEvidence,{language:meta?.language??'zh-CN'}));
  if(!selected||selected.has('states'))checks.push(...checkStates(states));
  if(!selected||selected.has('triage'))checks.push(...checkTriage(triage));
  if(checks.length===0)checks.push(check('no-checks','P1',false,'no checks selected or executed'));
  const blocking=checks.filter(item=>!item.ok&&!item.warnOnly&&item.severity!=='P2');
  const warnings=checks.filter(item=>!item.ok&&(item.warnOnly||item.severity==='P2'));
  return {
    checks,
    status:blocking.length?'fail':warnings.length?'warn':'pass',
    blocking:blocking.length,
    warnings:warnings.length,
    passed:checks.filter(item=>item.ok).length,
    total:checks.length,
  };
}
