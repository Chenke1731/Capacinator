// Pure invariant selftest: proves the checks have teeth without a browser.
import assert from 'node:assert/strict';
import {checkTarget,checkCapture,checkDelete,checkStates,checkTriage} from './invariants.mjs';

const targetGood={
  static:{
    target:{rect:{top:108}},
    ancestors:[{selector:'.unified-tab-content',rect:{top:100},computed:{pageTopGap:'8px'}}],
    elementAtTop:{isTarget:true},
    rows:[{elements:[{computed:{height:'40px'}},{computed:{height:'40px'}}]}],
  },
  hover:{
    target:{rect:{top:108},computed:{transform:'none'}},
    ancestors:[{selector:'.unified-tab-content',rect:{top:100},computed:{pageTopGap:'8px'}}],
    elementAtTop:{isTarget:true},
  },
  focus:{target:{rect:{top:108}}},
};
assert.ok(checkTarget(targetGood).every(item=>item.ok),'good target must pass');

const targetLift={
  ...targetGood,
  hover:{
    target:{rect:{top:99},computed:{transform:'matrix(1,0,0,1,0,-1)'}},
    ancestors:[{selector:'.unified-tab-content',rect:{top:100},computed:{pageTopGap:'8px'}}],
    elementAtTop:{isTarget:false},
  },
};
assert.ok(checkTarget(targetLift).some(item=>item.id==='hover-top-boundary'&&!item.ok),'lifted hover must fail');
assert.ok(checkTarget(targetLift).some(item=>item.id==='hover-hit-target'&&!item.ok),'lifted hover must miss the target hit test');

const targetDrift={
  ...targetGood,
  static:{...targetGood.static,target:{rect:{top:105}}},
  hover:{
    ...targetGood.hover,
    target:{rect:{top:105},computed:{transform:'none'}},
  },
};
assert.ok(checkTarget(targetDrift).some(item=>item.id==='target-top-gap-token'&&!item.ok&&item.warnOnly),'4-8px gap must WARN');

const targetNoRows={...targetGood,static:{...targetGood.static,rows:[]}};
assert.ok(checkTarget(targetNoRows).some(item=>item.id==='row-height-evidence'&&!item.ok),'empty row samples must fail');
const targetRowSpread={
  ...targetGood,
  static:{...targetGood.static,rows:[{elements:[{computed:{height:'44px'}},{computed:{height:'40px'}}]}]},
};
assert.ok(checkTarget(targetRowSpread).some(item=>item.id==='row-height-family'&&!item.ok&&item.warnOnly),'44/40 must WARN');

const deleteGood={
  modal:{
    attributes:{role:'dialog',ariaModal:'true',ariaLabelledby:'modal-title',ariaLabel:null},
    ariaLabelledbyText:'删除这条收件记录？',
    backgroundIsolated:true,
    backgroundSiblings:[],
    initialFocusInside:true,
    close:{ariaLabel:'关闭',rect:{width:44,height:44}},
  },
  focusTrace:[{insideModal:true},{insideModal:true}],
  closedByEscape:true,
  trigger:{testid:'delete-1'},
  afterClose:{testid:'delete-1'},
};
assert.ok(checkDelete(deleteGood).every(item=>item.ok),'good dialog must pass');

const deleteNoRole={...deleteGood,modal:{...deleteGood.modal,attributes:{...deleteGood.modal.attributes,role:null}}};
assert.ok(checkDelete(deleteNoRole).some(item=>item.id==='delete-role'&&!item.ok),'missing role must fail');

const deleteNoName={...deleteGood,modal:{...deleteGood.modal,ariaLabelledbyText:''}};
assert.ok(checkDelete(deleteNoName).some(item=>item.id==='delete-name'&&!item.ok),'missing accessible name must fail');

const deleteNoIsolation={
  ...deleteGood,
  modal:{...deleteGood.modal,attributes:{...deleteGood.modal.attributes,ariaModal:null},backgroundIsolated:false},
};
assert.ok(checkDelete(deleteNoIsolation).some(item=>item.id==='delete-modal-isolation'&&!item.ok),'missing isolation must fail');

const deleteRadixIsolation={
  ...deleteGood,
  modal:{...deleteGood.modal,attributes:{...deleteGood.modal.attributes,ariaModal:null},backgroundIsolated:true},
};
const radixChecks=checkDelete(deleteRadixIsolation);
assert.ok(radixChecks.find(item=>item.id==='delete-modal-isolation')?.ok,'Radix background isolation must pass');
assert.ok(radixChecks.some(item=>item.id==='delete-aria-modal-attr'&&!item.ok&&item.warnOnly),'missing aria-modal must WARN');

const deleteFocusEscape={...deleteGood,focusTrace:[{insideModal:false}]};
assert.ok(checkDelete(deleteFocusEscape).some(item=>item.id==='delete-focus-contained'&&!item.ok),'focus escape must fail');

const deleteCloseLocale={...deleteGood,modal:{...deleteGood.modal,close:{ariaLabel:'Close'}}};
assert.ok(checkDelete(deleteCloseLocale).some(item=>item.id==='delete-close-name-locale'&&!item.ok&&item.warnOnly),'zh-CN Close must WARN');

const captureGood={
  cleared:{ref:'',finish:''},
  autoFilled:{chips:''},
  payload:{source_ref:null,expected_finish:null},
  request:{},
  dialogOpenAfterSubmit:false,
};
assert.ok(checkCapture(captureGood).every(item=>item.ok),'good capture must pass');
const captureBad={...captureGood,payload:{source_ref:'SR123456',expected_finish:'2026-11-30'}};
assert.ok(checkCapture(captureBad).some(item=>item.id==='capture-source-ref'&&!item.ok),'cleared-but-submitted values must fail');
const captureBlocked={...captureGood,request:null,payload:null};
assert.ok(checkCapture(captureBlocked).some(item=>item.id==='capture-payload'&&!item.ok),'blocked/unmocked submit must fail');

const statesGood={
  countsError:{countsText:'待处理: 0 · 已转换: 0 · 已拒绝: 0',rows:3,alertTexts:['计数加载失败']},
  noMatch:{countsText:'待处理: 3 · 已转换: 0 · 已拒绝: 0',rows:0,emptyText:'没有符合筛选的条目'},
  bulk:{countsText:'待处理: 209 · 已转换: 0 · 已拒绝: 0',rows:200,hasPager:true,pagerText:'已显示 200/209'},
  responsive:{hiddenColumns:{requester:'none',expected:'none'},detailText:'提出人 张三 期望 2026-12-01 → 2026-12-31'},
};
assert.ok(checkStates(statesGood).every(item=>item.ok),'good states must pass');
const statesCountsZero={...statesGood,countsError:{countsText:'待处理: 0',rows:3,alertTexts:[]}};
assert.ok(checkStates(statesCountsZero).some(item=>item.id==='states-counts-error'&&!item.ok),'counts 0 without error must fail');
const statesNoMatch={...statesGood,noMatch:{countsText:'待处理: 3',rows:0,emptyText:'收件箱为空'}};
assert.ok(checkStates(statesNoMatch).some(item=>item.id==='states-no-match'&&!item.ok),'global empty on filtered no-match must fail');
const statesBulk={...statesGood,bulk:{countsText:'待处理: 209',rows:200,hasPager:false,pagerText:''}};
assert.ok(checkStates(statesBulk).some(item=>item.id==='states-bulk-pagination'&&!item.ok),'209 vs 200 without pager must fail');
const statesResponsive={...statesGood,responsive:{hiddenColumns:{requester:'none',expected:'none'},detailText:'原始内容 收件时间'}};
assert.ok(checkStates(statesResponsive).some(item=>item.id==='states-responsive-detail'&&!item.ok),'hidden fields missing from detail must fail');

const triageGood={
  row:{expected_start:'2026-12-01',expected_finish:'2026-12-31'},
  dialog:{start:'2026-12-01',finish:'2026-12-31',note:'有期望开始日即从该日生成初版阶段'},
  payload:{expected_start:'2026-12-01',expected_finish:'2026-12-31'},
  request:{},
  dialogOpenAfterSubmit:false,
};
assert.ok(checkTriage(triageGood).every(item=>item.ok),'good triage must pass');
const triageBad={
  ...triageGood,
  row:{expected_start:'2026-12-01',expected_finish:'2026-12-31'},
  dialog:{start:'',finish:'2026-12-31',note:'无期望开始日——不生成阶段，标记“未定基线”'},
  payload:{expected_start:null,expected_finish:'2026-12-31'},
};
assert.ok(checkTriage(triageBad).some(item=>item.id==='triage-start-divergence'&&!item.ok),'row start vs empty dialog/payload must fail');
assert.ok(checkTriage(triageBad).some(item=>item.id==='triage-note-consistency'&&!item.ok),'unset note with row start must fail');
const triageBlocked={...triageGood,request:null,payload:null};
assert.ok(checkTriage(triageBlocked).some(item=>item.id==='triage-payload'&&!item.ok),'blocked triage submit must fail');

console.log('invariants selftest: PASS');
