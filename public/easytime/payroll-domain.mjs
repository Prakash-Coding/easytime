// Shared by the browser and server; the server is authoritative for every saved change.
export const emptyPayroll=()=>({version:2,stores:[],employees:[],entries:[],shifts:[],audit:[],settings:{threshold:40,multiplier:1.5,weekStart:1,timezone:'America/New_York'}});
const fail=message=>{throw new Error(message)},text=(v,label,max=180)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail(`Enter ${label} (${max} characters maximum).`),num=(v,min,max,label)=>Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fail(`Enter a valid ${label}.`);
export const dateAt=(value=Date.now(),zone='America/New_York')=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function partsAt(value,zone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekKey(date,weekStart=1){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((day-weekStart+7)%7));}
export function zonedTime(date,time,zone){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Enter a valid date and time.');
 const target=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(target))fail('Enter a valid date.');let ts=target;
 for(let i=0;i<4;i++){const p=partsAt(ts,zone),wall=Date.parse(p.date+'T'+p.time+':00Z');const diff=target-wall;if(!diff)break;ts+=diff;}
 const p=partsAt(ts,zone);if(p.date!==date||p.time!==time)fail('This local time does not exist because of a daylight-saving change. Choose another time.');return new Date(ts).toISOString();
}
export function hours(r){return r.end?Math.max(0,(Date.parse(r.end)-Date.parse(r.start))/3600000-Number(r.break||0)/60):0;}
export function span(v,zone){const start=zonedTime(v.date,v.startTime,zone),end=zonedTime(v.endDate||v.date,v.endTime,zone),duration=(Date.parse(end)-Date.parse(start))/60000;if(duration<=0||duration>24*60)fail('Clock out must follow clock in and be within 24 hours. Set the end date for overnight shifts.');const br=num(v.break||0,0,1439,'unpaid break');if(!Number.isInteger(br)||br>=duration)fail('The unpaid break must be whole minutes and shorter than the shift.');return {start,end,break:br};}
function assertOverlap(db,r,excludeId,collection='entries'){const a=Date.parse(r.start),b=r.end?Date.parse(r.end):Infinity;if(db[collection].some(x=>x.id!==excludeId&&x.employee===r.employee&&a<(x.end?Date.parse(x.end):Infinity)&&b>Date.parse(x.start)))fail('This employee already has an overlapping shift.');}
export function applyCommand(current,command,actor='Workspace owner',now=Date.now(),makeId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')){
 const db=structuredClone(current),{type,data:v={}}=command||{};let before=null,after=null,detail=String(v.reason||'').trim();
 const person=id=>db.employees.find(x=>x.id===id)||fail('Choose an employee.'),location=id=>db.stores.find(x=>x.id===id)||fail('Choose a store.');
 if(type==='store'){const existing=db.stores.find(x=>x.id===v.id);before=existing?structuredClone(existing):null;const timezone=v.timezone||db.settings.timezone;try{new Intl.DateTimeFormat('en',{timeZone:timezone})}catch{fail('Choose a valid store timezone.');}after={id:existing?.id||makeId(),name:text(v.name,'a store name'),address:String(v.address||'').trim().slice(0,240),timezone};if(existing)Object.assign(existing,after);else db.stores.push(after);detail=after.name;}
 else if(type==='employee'){const store=location(v.store),existing=db.employees.find(x=>x.id===v.id);if(db.employees.some(x=>x.code===String(v.code).trim()&&x.id!==v.id))fail('Employee ID is already in use.');before=existing?structuredClone(existing):null;after={id:existing?.id||makeId(),name:text(v.name,'a full name'),code:text(v.code,'an employee ID',40),store:store.id,rate:num(v.rate,0.01,10000,'hourly rate'),active:v.active!==false};if(existing)Object.assign(existing,after);else db.employees.push(after);detail=after.name;}
 else if(type==='entry'||type==='shift'){
  const e=person(v.employee),s=location(v.store),collection=type==='entry'?'entries':'shifts',r=db[collection].find(x=>x.id===v.id);if(v.id&&!r)fail('This record no longer exists.');if(r?.status==='Approved')fail('Reopen approved hours with a reason before correcting them.');
  if(r&&!detail)fail('Enter a reason for this correction.');before=r?structuredClone(r):null;const times=span(v,s.timezone);
  if(type==='entry'&&Date.parse(times.end)>now+60000)fail('Attendance cannot be recorded in the future.');
  after={id:r?.id||makeId(),employee:e.id,store:s.id,...times};assertOverlap(db,after,r?.id,collection);
  if(type==='entry'){const linked=v.shift?db.shifts.find(x=>x.id===v.shift):null;if(v.shift&&(!linked||linked.employee!==e.id||linked.store!==s.id))fail('Choose a schedule for the same employee and store.');Object.assign(after,{rate:r?.employee===e.id?r.rate:e.rate,status:'Draft',shift:linked?.id||'',schedule:linked?structuredClone(linked):null,corrected:!!r,updatedAt:new Date(now).toISOString()});}
  else after.revision=(r?.revision||0)+1;
  if(r)Object.assign(r,after);else db[collection].push(after);detail=detail||'New record';
 }
 else if(type==='clock'){
  const e=person(v.employee),s=location(v.store);if(!e.active)fail('This employee is inactive.');const open=db.entries.find(x=>x.employee===e.id&&!x.end);
  if(open){before=structuredClone(open);const end=new Date(now).toISOString(),br=num(v.break||0,0,1439,'unpaid break');if(!Number.isInteger(br)||(now-Date.parse(open.start))/60000<=br)fail('Clock out must follow clock in and exceed the break.');if(now-Date.parse(open.start)>86400000)fail('Use Correct hours to complete a punch older than 24 hours.');after={...open,end,break:br};assertOverlap(db,after,open.id);Object.assign(open,after);detail='Clocked out';}
  else{const linked=v.shift?db.shifts.find(x=>x.id===v.shift):null;if(linked&&(linked.employee!==e.id||linked.store!==s.id))fail('Schedule does not match this employee and store.');after={id:makeId(),employee:e.id,store:s.id,start:new Date(now).toISOString(),end:'',break:0,rate:e.rate,status:'Draft',shift:linked?.id||'',schedule:linked?structuredClone(linked):null,corrected:false,updatedAt:new Date(now).toISOString()};assertOverlap(db,after,null);db.entries.push(after);detail='Clocked in';}
 }
 else if(type==='status'){
  const r=db.entries.find(x=>x.id===v.id)||fail('Record not found.'),transitions={Submitted:['Draft','Returned'],Approved:['Submitted'],Returned:['Submitted'],Draft:['Approved']};
  if(!transitions[v.status]?.includes(r.status))fail('This status change is not available. Refresh the record.');if(!r.end)fail('Complete clock out before submitting.');if(!detail)fail('Enter a review note or correction reason.');before=structuredClone(r);r.status=v.status;r.reviewedBy=actor;r.reviewedAt=new Date(now).toISOString();r.reviewNote=detail;after=structuredClone(r);
 }
 else if(type==='deleteShift'){const i=db.shifts.findIndex(x=>x.id===v.id);if(i<0)fail('Schedule not found.');if(!detail)fail('Enter a reason for removing this schedule.');before=db.shifts[i];db.shifts.splice(i,1);}
 else if(type==='settings'){if(db.entries.some(x=>x.status==='Approved'))fail('Reopen approved entries before changing payroll rules.');if(!detail)fail('Enter a reason for changing payroll rules.');before={...db.settings};after={...db.settings,threshold:num(v.threshold,1,168,'weekly overtime threshold'),multiplier:num(v.multiplier,1,5,'overtime multiplier'),weekStart:num(v.weekStart,0,6,'workweek start')};if(!Number.isInteger(after.weekStart))fail('Choose a workweek start.');db.settings=after;}
 else fail('Unknown payroll action.');
 if(db.entries.length>15000||db.shifts.length>15000||db.employees.length>500||db.stores.length>100)fail('Workspace record limit reached.');
 db.audit.push({id:makeId(),at:new Date(now).toISOString(),actor,action:type,detail,before,after});return db;
}
// Allocate exact elapsed minutes to local calendar days. Breaks are explicitly allocated at the shift end.
export function segments(entry,zone){if(!entry.end)return [];let cursor=Date.parse(entry.start),end=Date.parse(entry.end)-entry.break*60000,out=[];while(cursor<end){const date=dateAt(cursor,zone),midnight=Date.parse(zonedTime(addDays(date,1),'00:00',zone)),stop=Math.min(end,midnight);if(stop<=cursor)break;out.push({...entry,date,minutes:(stop-cursor)/60000,segmentStart:cursor});cursor=stop;}return out;}
export function payroll(db,from,to,store='',employee='',approvedOnly=false){
 const used=new Map(),rows=new Map(),daily=[],settings=db.settings;
 const all=db.entries.flatMap(e=>segments(e,settings.timezone)).sort((a,b)=>a.segmentStart-b.segmentStart||a.id.localeCompare(b.id));
 for(const r of all){const key=r.employee+'|'+weekKey(r.date,settings.weekStart),prior=used.get(key)||0,reg=db.allocation?.[r.id+'|'+r.segmentStart]??Math.min(r.minutes,Math.max(0,settings.threshold*60-prior)),ot=r.minutes-reg;used.set(key,prior+r.minutes);
  if(r.date<from||r.date>to||(store&&r.store!==store)||(employee&&r.employee!==employee)||(approvedOnly&&r.status!=='Approved'))continue;
  const e=db.employees.find(x=>x.id===r.employee);if(!e)continue;const row=rows.get(e.id)||{id:e.id,name:e.name,code:e.code,regular:0,overtime:0,total:0,gross:0,rates:[],pending:0,scheduled:0};const gross=reg/60*r.rate+ot/60*r.rate*settings.multiplier;
  row.regular+=reg/60;row.overtime+=ot/60;row.total+=r.minutes/60;row.gross+=gross;if(!row.rates.includes(r.rate))row.rates.push(r.rate);if(r.status!=='Approved')row.pending++;rows.set(e.id,row);daily.push({date:r.date,employee:e.id,store:r.store,regular:reg/60,overtime:ot/60,total:r.minutes/60,gross});
 }
 for(const s of db.shifts){if((store&&s.store!==store)||(employee&&s.employee!==employee))continue;const e=db.employees.find(e=>e.id===s.employee);if(!e)continue;const amount=segments(s,settings.timezone).filter(x=>x.date>=from&&x.date<=to).reduce((sum,x)=>sum+x.minutes/60,0);if(amount){const row=rows.get(e.id)||{id:e.id,name:e.name,code:e.code,regular:0,overtime:0,total:0,gross:0,rates:[],pending:0,scheduled:0};row.scheduled+=amount;rows.set(e.id,row);}}
 const totals=[...rows.values()];totals.forEach(r=>r.gross=Math.round((r.gross+Number.EPSILON)*100)/100);return {rows:totals.sort((a,b)=>a.name.localeCompare(b.name)),daily};
}
export function attendance(entry){const s=entry.schedule;if(!s)return null;return {arrival:Math.round((Date.parse(entry.start)-Date.parse(s.start))/60000),departure:entry.end?Math.round((Date.parse(entry.end)-Date.parse(s.end))/60000):null,scheduled:hours(s),actual:entry.end?hours(entry):null};}
export function samplePayroll(now=Date.now()){
 let db=emptyPayroll();let n=0;const id=()=>`sample-${++n}`,cmd=(type,data)=>db=applyCommand(db,{type,data},'Sample manager',now,id),today=dateAt(now),monday=weekKey(today),last=addDays(monday,-7);
 cmd('store',{name:'RT 30 · Irwin',address:'Irwin, Pennsylvania',timezone:'America/New_York'});cmd('store',{name:'North Huntingdon',address:'North Huntingdon, Pennsylvania',timezone:'America/New_York'});const s=db.stores[0].id,s2=db.stores[1].id;
 for(const [name,code,rate,store] of [['Alex Morgan','ET-001',20,s],['Jamie Patel','ET-002',18,s],['Taylor Reed','ET-003',22,s2]])cmd('employee',{name,code,rate,store});
 for(let d=0;d<5;d++)for(let e=0;e<3;e++){const employee=db.employees[e],date=addDays(last,d),end=e===0?'18:00':'17:00';cmd('shift',{employee:employee.id,store:employee.store,date,startTime:'09:00',endDate:date,endTime:'17:30',break:30});const sh=db.shifts.at(-1);cmd('entry',{employee:employee.id,store:employee.store,date,startTime:d===1&&e===1?'09:10':'09:00',endDate:date,endTime:end,break:30,shift:sh.id,reason:'Sample attendance'});const entry=db.entries.at(-1);cmd('status',{id:entry.id,status:'Submitted',reason:'Ready for review'});if(d<4)cmd('status',{id:entry.id,status:'Approved',reason:'Hours checked'});}
 return db;
}
