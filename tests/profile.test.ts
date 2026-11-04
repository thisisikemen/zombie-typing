// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { rankingOutcome, renderProfile } from '../src/ui/profile';
import { setRecordOwner } from '../src/ui/record-scope';
import { cacheTransferChoice, refreshTransferPrompts } from '../src/ui/transfer-state';
beforeEach(()=>{localStorage.clear();setRecordOwner(null);document.body.innerHTML='<div id="account-records"></div><section id="account-old-hint" data-transfer-prompt></section><section id="settings-transfer" data-transfer-prompt></section>';});
describe('生存記録の表示',()=>{
 it('夜明け直前に終了し、秒を丸めて制限時間に達していても、クリアにしない',()=>{
  expect(rankingOutcome(90,90,false)).toEqual({label:'生存 1分30秒',cleared:false});
  expect(rankingOutcome(90,90,true)).toEqual({label:'朝を迎えた',cleared:true});
 });
 it('旧形式の記録を時間で表示し、未記録の0秒から結果を推測しない',()=>{
  expect(rankingOutcome(90,90)).toEqual({label:'朝を迎えた',cleared:true});
  expect(rankingOutcome(61,90).label).toBe('生存 1分01秒');
  expect(rankingOutcome(0,90).label).toBe('生存時間の記録なし');
 });
 it('記録がないステージの数値を0や生存率として捏造しない',()=>{
  renderProfile([]);expect(document.querySelectorAll('.profile-record')).toHaveLength(6);
  expect(document.getElementById('account-records')!.textContent).not.toContain('WPM 0');
  expect(document.getElementById('account-records')!.textContent).toContain('まだ記録がありません');
 });
 it('引き継ぎ不要はゲストと会員を分離し、完了した会員の案内は別端末の応答からも隠せる',()=>{
  cacheTransferChoice('dismissed');refreshTransferPrompts();expect(document.getElementById('settings-transfer')!.hidden).toBe(true);
  setRecordOwner('member-a');refreshTransferPrompts();expect(document.getElementById('settings-transfer')!.hidden).toBe(false);
  expect(document.getElementById('account-old-hint')!.hidden).toBe(true);
  cacheTransferChoice('completed');refreshTransferPrompts();expect(document.getElementById('settings-transfer')!.hidden).toBe(true);
 });
});

it('ベーシックは時間だけ、他の5行には自己ベストと時間を表示し、6行の合計を名前横に置く', async () => {
 const { mergePlayCounters } = await import('../src/ui/play-time');
 document.body.insertAdjacentHTML('beforeend','<strong id="account-total-time"></strong>');
 const counter_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 mergePlayCounters(null,[{counter_id,difficulty:'basic',elapsed_ms:90000},{counter_id,difficulty:'normal',elapsed_ms:120000}]);
 renderProfile([]);
 const rows=[...document.querySelectorAll('.profile-record')];
 expect(rows).toHaveLength(6);
 expect(rows[0].textContent).toContain('ベーシック');
 expect(rows[0].textContent).toContain('総練習時間1分30秒');
 expect(rows[0].textContent).not.toContain('WPM');
 expect(rows[0].textContent).not.toContain('位');
 expect(rows[2].textContent).toContain('総プレイ時間2分00秒');
 expect(document.getElementById('account-total-time')!.textContent).toBe('3分30秒');
});
