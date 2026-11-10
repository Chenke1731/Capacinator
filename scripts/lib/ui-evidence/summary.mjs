// Compact, reviewer-facing summary. Raw evidence stays in evidence.json.
const show=value=>typeof value==='string'?value:JSON.stringify(value);
const round=value=>typeof value==='number'?Math.round(value*100)/100:value;
const statusOf=item=>item.ok?'PASS':item.warnOnly?'WARN':'FAIL';

export function renderSummary({meta,evidence,verdict,outDir}){
  const lines=[];
  lines.push('# UI Evidence Bundle');
  lines.push('');
  lines.push(`- label: ${meta.label||'(none)'}`);
  lines.push(`- page: ${meta.page}`);
  lines.push(`- viewport/theme: ${meta.viewport.width}x${meta.viewport.height} / ${meta.theme}`);
  lines.push(`- base/api: ${meta.base} | ${meta.api}`);
  lines.push(`- fixture: ${meta.fixture}`);
  lines.push(`- invariants: ${meta.invariantsVersion??'unknown'}; language: ${meta.language??'zh-CN'}`);
  lines.push(`- auth: ${show(meta.auth??null)}`);
  if(meta.stepErrors?.length)lines.push(`- step errors: ${show(meta.stepErrors)}`);
  lines.push(`- started: ${meta.startedAt} (${meta.durationMs}ms)`);
  lines.push(`- verdict: **${verdict.status.toUpperCase()}** (pass ${verdict.passed}/${verdict.total}, blocking ${verdict.blocking}, warnings ${verdict.warnings})`);
  lines.push('');

  const target=evidence.target;
  if(target){
    const ancestor=target.static?.ancestors?.find(item=>item.selector==='.unified-tab-content');
    lines.push('## Target: capture button');
    lines.push('');
    lines.push('| state | top | height | transform | box-shadow |');
    lines.push('|---|---:|---:|---|---|');
    for(const [name,state] of [['static',target.static],['hover',target.hover],['focus',target.focus]]){
      const el=state?.target;
      if(!el)continue;
      lines.push(`| ${name} | ${round(el.rect?.top)} | ${round(el.rect?.height)} | \`${el.computed?.transform??''}\` | \`${el.computed?.boxShadow??''}\` |`);
    }
    lines.push('');
    lines.push(`- ancestor: \`${ancestor?.selector??'missing'}\` top=${ancestor?.rect?.top??'n/a'}, padding-top=${ancestor?.computed?.paddingTop??'n/a'}, overflow=${ancestor?.computed?.overflow??'n/a'}`);
    lines.push(`- elementFromPoint(top): static=${show(target.static?.elementAtTop)}; hover=${show(target.hover?.elementAtTop)}`);
    const heights=(target.static?.rows??[]).flatMap(row=>(row.elements??[]).map(el=>el.computed?.height));
    lines.push(`- same-row heights: [${heights.join(', ')}]`);
    lines.push(`- screenshot: ${target.shot}`);
    lines.push('');
  }

  const capture=evidence.capture;
  if(capture){
    lines.push('## Capture dialog');
    lines.push('');
    lines.push(`- auto-filled: ${show(capture.autoFilled)}`);
    lines.push(`- after clearing: ${show(capture.cleared)}`);
    lines.push(`- submitted payload: ${show(capture.payload)}`);
    lines.push(`- dialog open after success: ${capture.dialogOpenAfterSubmit}; error text: ${show(capture.errorText)}`);
    lines.push('');
  }

  const del=evidence.delete;
  if(del){
    lines.push('## Delete confirm');
    lines.push('');
    lines.push(`- dialog selector: \`${del.dialogSelector??'.modal'}\``);
    lines.push(`- attributes: ${show(del.modal?.attributes)}`);
    lines.push(`- aria-labelledby text: ${show(del.modal?.ariaLabelledbyText)}; background isolated: ${del.modal?.backgroundIsolated}`);
    lines.push(`- heading: ${show(del.modal?.heading)}`);
    lines.push(`- initial focus: ${show(del.modal?.initialFocus)} (inside=${del.modal?.initialFocusInside})`);
    lines.push(`- close button: ${show(del.modal?.close)}`);
    lines.push(`- Tab trace: ${show(del.focusTrace)}`);
    lines.push(`- Escape closed: ${del.closedByEscape}; after close focus: ${show(del.afterClose)}`);
    lines.push(`- aria snapshot: \`${String(del.ariaSnapshot??'').replace(/\s+/g,' ').slice(0,1200)}\``);
    lines.push('');
  }

  const states=evidence.states;
  if(states){
    lines.push('## States');
    lines.push('');
    lines.push(`- counts error: ${show(states.countsError)}`);
    lines.push(`- no-match: ${show(states.noMatch)}`);
    lines.push(`- bulk: ${show(states.bulk)}`);
    lines.push(`- responsive: ${show(states.responsive)}`);
    lines.push('');
  }

  const triage=evidence.triage;
  if(triage){
    lines.push('## Triage');
    lines.push('');
    lines.push(`- row: ${show(triage.row)}`);
    lines.push(`- dialog: ${show(triage.dialog)}`);
    lines.push(`- submitted payload: ${show(triage.payload)}`);
    lines.push(`- dialog open after success: ${triage.dialogOpenAfterSubmit}; error text: ${show(triage.errorText)}`);
    lines.push('');
  }

  lines.push('## Checks');
  lines.push('');
  lines.push('| status | id | severity | detail |');
  lines.push('|---|---|---|---|');
  for(const item of verdict.checks){
    const detail=String(item.detail).replace(/\r?\n/g,' ').replace(/\|/g,'\\|').slice(0,300);
    lines.push(`| ${statusOf(item)} | ${item.id} | ${item.severity} | ${detail} |`);
  }
  lines.push('');
  lines.push(`Raw evidence: \`${outDir}/evidence.json\``);
  lines.push('');
  return lines.join('\n');
}
