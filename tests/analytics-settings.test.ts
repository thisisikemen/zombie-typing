// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('Cookieの現在の選択を設定欄とダイアログの両方へ反映し、設定欄から変更できる',async()=>{
 localStorage.clear();vi.stubEnv('PROD',false);
 localStorage.setItem('zombie-typing:analytics-consent:v1','granted');
 document.body.innerHTML='<dialog id="analytics-dialog"><p id="analytics-status"></p><button id="analytics-close"></button><button data-analytics-choice="granted"></button><button data-analytics-choice="denied"></button></dialog><aside id="analytics-notice"></aside><select id="set-analytics"><option value="unset">未選択</option><option value="granted">許可する</option><option value="denied">許可しない</option></select>';
 const {analytics,initAnalytics}=await import('../src/analytics');initAnalytics();
 const select=document.getElementById('set-analytics') as HTMLSelectElement;
 expect(select.value).toBe('granted');expect(document.querySelector('[data-analytics-choice="granted"]')!.getAttribute('aria-pressed')).toBe('true');
 select.value='denied';select.dispatchEvent(new Event('change'));
 expect(analytics.choice).toBe('denied');expect(document.querySelector('[data-analytics-choice="denied"]')!.getAttribute('aria-pressed')).toBe('true');
});
