// Runs in the browser after installContrastHelpers. Recharts axes can be
// aria-hidden, so axe alone does not validate their visible text paint.
export function measureSvgAxes() {
  const api=window.__auditColor;
  return [...document.querySelectorAll('svg text.recharts-cartesian-axis-tick-value, svg text.recharts-label')].filter(e=>{
    const r=e.getBoundingClientRect(),svg=e.ownerSVGElement.getBoundingClientRect(),s=getComputedStyle(e);
    return e.textContent.trim()&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Math.min(r.right,svg.right)>Math.max(r.left,svg.left)&&Math.min(r.bottom,svg.bottom)>Math.max(r.top,svg.top);
  }).map(e=>{
    const s=getComputedStyle(e),bg=api.background(e),fg=api.parse(s.fill);
    return {text:e.textContent,foreground:s.fill,background:bg,ratio:bg&&fg?api.ratio(api.over(bg,fg),bg):null,threshold:4.5};
  });
}
