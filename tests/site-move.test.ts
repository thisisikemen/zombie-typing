// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initOldSiteMove, initSiteMove, OLD_ORIGIN, trustedMessage } from '../src/ui/site-move';
const backup = {format:'zombie-typing-records',version:1,entries:{'zombie-typing:player-name':'生存者'}};
beforeEach(()=>{
 document.body.innerHTML='<button data-old-records></button><dialog id="move-dialog"><p id="move-status"></p></dialog>';
 localStorage.clear();history.replaceState(null,'','/');
});
afterEach(()=>{ vi.restoreAllMocks();vi.unstubAllGlobals(); });
describe('ファイルなしの記録引き継ぎ',()=>{
 it('originと開いたタブの両方が一致する場合だけ受け取る',()=>{
  const peer={} as Window;
  expect(trustedMessage({origin:OLD_ORIGIN,source:peer},peer,OLD_ORIGIN)).toBe(true);
  expect(trustedMessage({origin:'https://evil.example',source:peer},peer,OLD_ORIGIN)).toBe(false);
  expect(trustedMessage({origin:OLD_ORIGIN,source:{} as Window},peer,OLD_ORIGIN)).toBe(false);
  expect(trustedMessage({origin:OLD_ORIGIN,source:null},null,OLD_ORIGIN)).toBe(false);
 });
 it('指定した旧タブだけから検証済みデータを読み込み、二重送信を無視する',async()=>{
  const peer={postMessage:vi.fn()} as unknown as Window;
  vi.spyOn(window,'open').mockReturnValue(peer);
  const accept=vi.fn().mockResolvedValue(undefined);
  initSiteMove(accept);
  (document.querySelector('[data-old-records]') as HTMLButtonElement).click();
  const send=(source:Window,origin:string,data:unknown)=>window.dispatchEvent(new MessageEvent('message',{source,origin,data}));
  send(peer,'https://evil.example',{type:'zombie-records-data',backup});
  send({} as Window,OLD_ORIGIN,{type:'zombie-records-data',backup});
  expect(accept).not.toHaveBeenCalled();
  send(peer,OLD_ORIGIN,{type:'zombie-records-data',backup});
  await new Promise(r=>setTimeout(r,0));
  expect(accept).toHaveBeenCalledTimes(1);
  expect(accept).toHaveBeenCalledWith(backup);
  expect(localStorage.getItem('zombie-typing:old-site-moved')).toBe('true');
  expect(location.href).not.toContain('生存者');
  send(peer,OLD_ORIGIN,{type:'zombie-records-data',backup});
  expect(accept).toHaveBeenCalledTimes(1);
 });
 it('不正なデータでは保存せず、成功メッセージを返さない',async()=>{
  const peer={postMessage:vi.fn()} as unknown as Window;
  vi.spyOn(window,'open').mockReturnValue(peer);
  const accept=vi.fn();initSiteMove(accept);
  (document.querySelector('[data-old-records]') as HTMLButtonElement).click();
  window.dispatchEvent(new MessageEvent('message',{source:peer,origin:OLD_ORIGIN,data:{type:'zombie-records-data',backup:{...backup,entries:{token:'secret'}}}}));
  await new Promise(r=>setTimeout(r,0));
  expect(accept).not.toHaveBeenCalled();expect(peer.postMessage).not.toHaveBeenCalled();
  expect(localStorage.getItem('zombie-typing:old-site-moved')).toBeNull();
 });
});

describe('旧サイトの引っ越し画面',()=>{
 it('ゲームを起動せず、ボタンを押したときだけ新サイトのタブへ記録を渡す',()=>{
  document.body.innerHTML='<main id="stage"></main><section id="old-site-move" hidden><button id="old-move-records"></button><p id="old-move-status"></p></section>';
  vi.stubGlobal('location',new URL(`${OLD_ORIGIN}/zombie-typing/`));
  const peer={postMessage:vi.fn()} as unknown as Window;vi.spyOn(window,'open').mockReturnValue(peer);
  localStorage.setItem('zombie-typing:player-name','前の名前');
  expect(initOldSiteMove()).toBe(true);
  expect(document.getElementById('old-site-move')!.hidden).toBe(false);
  expect(document.getElementById('stage')!.hasAttribute('inert')).toBe(true);
  expect(window.open).not.toHaveBeenCalled();expect(peer.postMessage).not.toHaveBeenCalled();
  document.getElementById('old-move-records')!.click();
  expect(window.open).toHaveBeenCalledWith('https://zombietyping.jp/?receive=old','_blank');
  window.dispatchEvent(new MessageEvent('message',{source:peer,origin:'https://zombietyping.jp',data:{type:'zombie-records-ready'}}));
  expect(peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'zombie-records-data',backup:expect.objectContaining({entries:{'zombie-typing:player-name':'前の名前'}})}),'https://zombietyping.jp');
  expect(localStorage.getItem('zombie-typing:player-name')).toBe('前の名前');
 });
});
