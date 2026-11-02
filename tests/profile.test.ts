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
  renderProfile([]);expect(document.querySelectorAll('.profile-record')).toHaveLength(5);
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
