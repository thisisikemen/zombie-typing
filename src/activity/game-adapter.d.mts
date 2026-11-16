export interface GameActivity {
 prepare():Promise<void>; start(mode:string,difficulty:string):void; observe(seconds:number):void;
 finish(outcome:string):void; checkpoint():void; exitCheckpoint():void; maybeFlush():void;
 stopAndDelete():Promise<boolean>; stop():void; readonly state:string;
}
export function createGameActivity(options?:{enabled?:boolean;policyAllowsCollection?:()=>boolean;fetchImpl?:typeof fetch;now?:()=>number;writerId?:()=>string}):GameActivity;
