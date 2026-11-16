import {createGameActivity} from './game-adapter.mjs';
const KEY='zombie-typing:site-usage:v2';
const GA_KEY='zombie-typing:analytics-consent:v1';
// Both are false/default-conservative until the concrete release checklist is signed off.
const configured=import.meta.env.VITE_SITE_ACTIVITY_ENABLED==='true';
const independentLegacy=import.meta.env.VITE_SITE_ACTIVITY_LEGACY_POLICY==='independent-reviewed';
function allowed():boolean {
 try{const choice=localStorage.getItem(KEY);if(choice==='off')return false;if(choice==='on')return true;
  return independentLegacy || localStorage.getItem(GA_KEY)!=='denied';
 }catch{return false;}
}
export const gameActivity=createGameActivity({enabled:configured,policyAllowsCollection:allowed});
export function initGameActivitySettings():void {
 if(!configured)return;
 const host=document.getElementById('analytics-dialog');if(!host)return;
 const section=document.createElement('section');section.id='site-usage-settings';
 const heading=document.createElement('h3');heading.textContent='サイト内の利用統計';
 const text=document.createElement('p');text.textContent='遊んだ日・難易度・回数・プレイ時間を、ゲーム改善のためSupabaseへ記録します。名前や打鍵内容は含めません。Google Analyticsとは別の仕組みで、送信はここから停止できます。';
 const status=document.createElement('p');status.setAttribute('role','status');
 const button=document.createElement('button');button.type='button';button.className='plate-btn';
 const render=()=>{status.textContent=allowed()?'利用統計の送信：有効（接続できた後のプレイが対象）':'利用統計の送信：停止中';button.textContent=allowed()?'送信を停止し、記録を削除する':'利用統計を再開する';};
 button.onclick=async()=>{
  const wasAllowed=allowed();button.disabled=true;
  try{localStorage.setItem(KEY,wasAllowed?'off':'on');
   if(wasAllowed){const deleted=await gameActivity.stopAndDelete();render();if(!deleted)status.textContent='送信は停止しました。保存済み記録の削除はまだ確認できていません。';}
   else{render();status.textContent='再開設定を保存しました。次の再読み込みから有効になります。';}
  }catch{status.textContent='設定を保存できなかったため、送信を停止します。';gameActivity.stop();}
  finally{button.disabled=false;}
 };
 const retryDelete=document.createElement('button');retryDelete.type='button';retryDelete.className='plate-btn';retryDelete.textContent='保存済み記録の削除を再試行';retryDelete.onclick=async()=>{retryDelete.disabled=true;try{localStorage.setItem(KEY,'off');const deleted=await gameActivity.stopAndDelete();render();status.textContent=deleted?'送信を停止し、このブラウザの記録を削除しました。':'送信は停止中です。記録の削除は確認できませんでした。識別Cookieがない場合、同じ記録を指定して削除できません。';}catch{gameActivity.stop();status.textContent='送信を停止しました。削除は未確認です。';}finally{retryDelete.disabled=false;}};
 section.append(heading,text,status,button,retryDelete);host.append(section);render();
 window.addEventListener('storage',e=>{if(e.key===KEY||e.key===GA_KEY||e.key===null){if(!allowed())gameActivity.stop();render();}});
 void gameActivity.prepare();
}
