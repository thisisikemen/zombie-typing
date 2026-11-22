import { describe, expect, it } from 'vitest';
import { personalBest, personalRecords, type PersonalState } from '../src/core/personal-records';
import { correctionRuns, previewCorrection } from '../src/core/record-correction';

function fixture() {
  let state: unknown;
  let unavailable = false;
  let previous = Promise.resolve();
  let time = 1_800_000_000_000;
  const shared = {
    update<T>(mutate:(raw:unknown)=>{state:PersonalState;value:T}): Promise<T> {
      const result = previous.then(()=>{
        if (unavailable) throw Error('cannot commit');
        const next=mutate(structuredClone(state));
        state=structuredClone(next.state);
        return next.value;
      });
      previous=result.then(()=>{},()=>{});
      return result;
    },
  };
  const make = () => personalRecords(shared,()=>time);
  const records=make();
  return { records, make, setUnavailable:()=>{unavailable=true;}, overwrite:(raw:unknown)=>{state=raw;},
    elapse:(delta:number)=>{time+=delta;},
    add:(id:string,difficulty:'easy'|'endless',value:number)=>records.append({id,difficulty,value,playedAt:time}),
    now:()=>time };
}

describe('browser-only personal records',()=>{
  it('starts empty and keeps a lower honest run after excluding a score, reloading, and pruning',async()=>{
    const f=fixture();
    const h=24*3600*1000;
    expect((await f.records.load()).runs).toEqual([]);
    await f.add('old','easy',7560);
    f.elapse(h);
    await f.add('friend','easy',12000);
    await f.add('own','easy',8100);
    const view=await f.add('friend-endless','endless',148);
    const changes=['friend','friend-endless'].map(runId=>({runId,excluded:true}));
    expect(previewCorrection(view,changes)).toEqual([
      {difficulty:'easy',before:12000,after:8100},{difficulty:'endless',before:148,after:null},
    ]);
    const corrected=await f.records.apply(view.revision,changes);
    expect(personalBest(corrected,'easy')).toBe(8100);
    expect(personalBest(await f.make().load(),'endless')).toBeUndefined();
    f.elapse(h);
    const later=await f.make().load();
    expect(correctionRuns(later)).toEqual([]);
    expect(personalBest(later,'easy')).toBe(8100);
    expect(personalBest(await f.add('lower','easy',4000),'easy')).toBe(8100);
    await expect(f.records.apply(later.revision,[{runId:'friend',excluded:false}])).rejects.toThrow();
  });

  it('rejects stale multitab confirmation, atomically allows a fresh batch, and supports undo',async()=>{
    const f=fixture();
    const first=await f.add('own','easy',5000);
    const newest=await f.add('friend','easy',8000);
    const other=f.make();
    await expect(other.apply(first.revision,[{runId:'own',excluded:true}])).rejects.toThrow('changed');
    await expect(other.apply(newest.revision,[{runId:'friend',excluded:true},{runId:'unknown',excluded:true}])).rejects.toThrow('unavailable');
    const current=await f.records.load();
    expect(personalBest(current,'easy')).toBe(8000);
    const excluded=await other.apply(current.revision,[{runId:'friend',excluded:true}]);
    expect(personalBest(excluded,'easy')).toBe(5000);
    const undone=await f.records.apply(excluded.revision,[{runId:'friend',excluded:false}]);
    expect(personalBest(undone,'easy')).toBe(8000);
  });

  it('does not reintroduce an excluded result on a duplicate write and refuses a reused or expired ID payload',async()=>{
    const f=fixture();
    const event={id:'one',difficulty:'easy' as const,value:9999,playedAt:f.now()};
    const added=await f.records.append(event);
    const excluded=await f.records.apply(added.revision,[{runId:event.id,excluded:true}]);
    const retried=await f.records.append(event);
    expect(retried.revision).toBe(excluded.revision);
    expect(personalBest(retried,'easy')).toBeUndefined();
    await expect(f.records.append({...event,value:30000})).rejects.toThrow('reused');
    f.elapse(24*3600*1000);
    await expect(f.records.append(event)).rejects.toThrow('expired');
    expect((await f.records.load()).runs).toEqual([]);
  });

  it('fails closed for unavailable or corrupt browser storage without resetting stored data',async()=>{
    const f=fixture();
    f.overwrite({corrupt:true});
    await expect(f.records.load()).rejects.toThrow('unavailable');
    await expect(f.add('not-written','easy',1300)).rejects.toThrow('unavailable');
    f.setUnavailable();
    await expect(f.records.load()).rejects.toThrow('cannot commit');
  });

  it('distinguishes a freshly recreated browser store from an earlier identical revision',async()=>{
    const f=fixture();
    const before=await f.add('friend','easy',9000);
    f.overwrite(undefined);
    const after=await f.add('friend','easy',9000);
    expect(before.revision).not.toBe(after.revision);
    await expect(f.records.apply(before.revision,[{runId:'friend',excluded:true}])).rejects.toThrow('changed');
  });
});
