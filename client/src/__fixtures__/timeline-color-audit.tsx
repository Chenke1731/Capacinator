// Browser-only audit harness: renders the actual components without API writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { InteractiveTimeline } from '../components/InteractiveTimeline';
import { PhaseHandles } from '../components/interactive-timeline/PhaseHandles';
import { PHASE_COLORS } from '../components/phase-manager/types';

export function mountTimelineAudit() {
  const host = document.createElement('div');
  host.id = 'timeline-color-audit';
  host.style.cssText = 'position:fixed;inset:70px 20px 20px;z-index:2147483640;background:var(--bg-primary);color:var(--text-primary);padding:40px;overflow:auto';
  document.body.append(host);
  const start = new Date('2026-10-14T00:00:00');
  const day = 86400000;
  const items = Object.entries(PHASE_COLORS).map(([name, color], i) => ({
    id: name, name, color, startDate: new Date(+start + i * 4 * day),
    endDate: new Date(+start + (i * 4 + 3) * day)
  }));
  createRoot(host).render(<>
    <h2 style={{marginBottom:40}}>Production timeline palette</h2>
    <InteractiveTimeline items={items} viewport={{startDate:start,endDate:new Date(+start+40*day),pixelsPerDay:25}} mode="brush" height={80} showToday />
    <div style={{position:'relative',height:50,marginTop:40}} data-handle-set="default">
      <PhaseHandles handles={['extend-left','extend-right','adjust-both'].map((handleType,i)=>({id:handleType,phaseId:'audit',handleType:handleType as 'extend-left'|'extend-right'|'adjust-both',position:0,x:100+i*200}))} hoveredHandle={null} isDragging={false} onHandleClick={()=>{}} onHandleMouseDown={()=>{}} />
    </div>
    <div style={{position:'relative',height:50,marginTop:40}} data-handle-set="hover">
      {(['extend-left','extend-right','adjust-both'] as const).map((handleType,i)=><PhaseHandles key={handleType} handles={[{id:handleType,phaseId:'audit',handleType,position:0,x:100+i*200}]} hoveredHandle={{phaseId:'audit',handleType}} isDragging={false} onHandleClick={()=>{}} onHandleMouseDown={()=>{}} />)}
    </div>
  </>);
}
