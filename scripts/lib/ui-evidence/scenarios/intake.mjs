// Intake pilot scenario. Steps are plain functions so the runner stays generic.
import {captureTarget,captureCaptureDialog,captureDeleteDialog,captureStates,captureTriage} from '../probes.mjs';

export default {
  name:'intake',
  path:'/projects?tab=intake',
  ready:'table.intake-table',
  steps:[
    {
      id:'target',
      run:async ctx=>{
        if(ctx.inject==='hover-lift'){
          await ctx.session.page.addStyleTag({content:'.btn-primary:hover{transform:translateY(-10px)!important}'});
        }
        return captureTarget(ctx.session.page,{shotDir:ctx.shotDir,width:ctx.viewport.width});
      },
    },
    {
      id:'capture',
      run:async ctx=>captureCaptureDialog(ctx.session.page,ctx.session),
    },
    {
      id:'delete',
      run:async ctx=>captureDeleteDialog(ctx.session.page,{injectRemoveRole:ctx.inject==='remove-role'}),
    },
    {
      id:'states',
      run:async ctx=>captureStates(ctx.session.page,ctx.session,{shotDir:ctx.shotDir,width:ctx.viewport.width}),
    },
    {
      id:'triage',
      run:async ctx=>captureTriage(ctx.session.page,ctx.session),
    },
  ],
};
