/** Unwired integration boundary. Policy permission is provided by the reviewed release adapter. */
import {ActivityCollector} from './collector.mjs';
import {createTransport} from './transport.mjs';
export function createGameActivity({enabled=false,policyAllowsCollection=()=>false,fetchImpl=fetch,now=Date.now,writerId=()=>crypto.randomUUID()}={}){
 let collector=null,enrolling=null,generation=0,disabled=false,enrollmentAbort=null,nextHeartbeat=Infinity;
 const transport=createTransport({fetchImpl});
 function permitted(){let allowed=false;try{allowed=enabled&&!disabled&&policyAllowsCollection()===true;}catch{}
  if(!allowed && collector){const prior=stopLocal();if(prior)void prior.revoke();}
  return allowed;
 }
 async function prepare(){
  if(!permitted()||collector)return; if(enrolling)return enrolling;
  const version=generation;const abort=new AbortController();enrollmentAbort=abort;
  enrolling=(async()=>{try{const epoch=await transport.enroll(abort.signal);if(version!==generation||!permitted())return;const next=new ActivityCollector({enabled:true,transport,writerId:writerId(),now,minimumFlushMs:60000});next.activateEnrollment(epoch);collector=next;}catch{/* Any failure leaves gameplay intact and unmeasured. */}finally{enrolling=null;if(enrollmentAbort===abort)enrollmentAbort=null;}})();return enrolling;
 }
 function stopLocal(){generation++;disabled=true;enrollmentAbort?.abort();const prior=collector;collector=null;return prior;}
 return{
  // Prepare while title/countdown is active. Starting before ready is intentionally unmeasured.
  prepare,
  start(mode,difficulty){if(permitted()&&mode!=='vs'){collector?.start(difficulty);nextHeartbeat=now()+300000;}},
  // Same seconds already shown/stored for the player, as passed to PlayTimeRun.observe.
  observe(seconds){if(permitted())collector?.observeElapsed(seconds);},
  finish(outcome){if(!permitted())return;collector?.end(outcome);void collector?.flush({final:true});},
  checkpoint(){if(permitted())void collector?.flush();},
  exitCheckpoint(){if(permitted())void collector?.flush({final:true});},
  // Bounded low-frequency flush can be called every frame; collector throttles/avoids unchanged data.
  maybeFlush(){if(permitted()&&now()>=nextHeartbeat){nextHeartbeat=now()+300000;void collector?.flush();}},
  async stopAndDelete(){const prior=stopLocal();if(prior)return prior.revoke();try{await transport.revoke();return true;}catch{return false;}},
  // A change in another tab or a stricter setting stops immediately; deletion may be retried separately.
  stop(){const prior=stopLocal();if(prior)void prior.revoke();},
  get state(){return collector?.state??'off';}
 };
}
