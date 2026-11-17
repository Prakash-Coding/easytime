import {applySpendCommand,spendAlerts} from './spend-domain.mjs';
import {validateBusinessProfile} from './business-profile.mjs';
import {applyFeatureSelection} from './business-features.mjs';
import {applyOrderCommand,orderDueAlerts} from './order-reminders.mjs';
import {applyCommand as base,emptyPayroll,dateAt,partsAt,addDays,weekKey,hours,span,segments,payroll} from './payroll-domain.mjs';
import {validateContact,scheduleMessage} from './schedule-sharing.mjs';
import {validateWorkplace,verifyPosition} from './workplace.mjs';
export {emptyPayroll};
export const workforce=()=>({availability:[],leave:[],coverage:[],templates:[],needs:[],budgets:[],messages:[],publications:[],sharing:[],candidates:[],onboarding:[],members:[],integrations:[],orderReminders:[],orderHistory:[],spendBudgets:[],spendExpenses:[]});
export function upgrade(state){const d=structuredClone(state);d.workforce={...workforce(),...d.workforce};return d;}
const fail=m=>{throw Error(m)},str=(v,label,max=300)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail('Enter '+label+'.'),num=(v,min,max,label)=>v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fail('Enter valid '+label+'.');
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||new Date(v+'T12:00Z').toISOString().slice(0,10)!==v)fail('Choose a valid date.');return v;}
const overlaps=(a,b)=>a.start<b.end&&a.end>b.start;
export function assignments(e){return [...new Set([e.store,...(e.stores||[])])];}
export function available(db,employee,shift){
 const e=db.employees.find(e=>e.id===employee);if(!e?.active||!assignments(e).includes(shift.store))return false;
 if(db.shifts.some(s=>s.id!==shift.id&&s.employee===employee&&overlaps(s,shift)))return false;
 const zone=db.stores.find(s=>s.id===shift.store)?.timezone||db.settings.timezone;
 const first=dateAt(shift.start,zone),last=dateAt(Date.parse(shift.end)-1,zone);
 if(db.workforce.leave.some(l=>l.employee===employee&&l.status==='Approved'&&l.from<=last&&l.to>=first))return false;
 for(let d=first;d<=last;d=addDays(d,1)){const day=new Date(d+'T12:00Z').getUTCDay(),rules=db.workforce.availability.filter(a=>a.employee===employee&&a.day===day);if(!rules.length)continue;if(rules.some(a=>a.unavailable))return false;const a=d===first?partsAt(shift.start,zone).time:'00:00',b=d===last&&partsAt(shift.end,zone).date===d?partsAt(shift.end,zone).time:'23:59';if(!rules.some(r=>r.start<=a&&r.end>=b))return false;}
 return true;
}
export function plannedWeek(db,employee,shift){const w=weekKey(dateAt(shift.start,db.settings.timezone),db.settings.weekStart);return db.shifts.filter(s=>s.employee===employee&&s.id!==shift.id).flatMap(s=>segments(s,db.settings.timezone)).filter(s=>weekKey(s.date,db.settings.weekStart)===w).reduce((n,s)=>n+s.minutes/60,0);}
export function applyWorkforce(current,command,actor='Workspace owner',now=Date.now(),makeId=()=>crypto.randomUUID()){
 let d=upgrade(current),w=d.workforce,{type,data:v={}}=command||{},before=null,after=null,detail=String(v.reason||'').trim();
 const person=id=>d.employees.find(e=>e.id===id)||fail('Choose an employee.'),store=id=>d.stores.find(s=>s.id===id)||fail('Choose a store.'),find=(kind,id)=>w[kind].find(x=>x.id===id)||fail('Record no longer exists.'),put=(kind,record)=>{const i=w[kind].findIndex(x=>x.id===record.id);if(i<0)w[kind].push(record);else w[kind][i]=record;after=record;};
 if(!type?.startsWith('wf:')){
  if(type==='shift'){const s=store(v.store),test={employee:v.employee,store:v.store,id:v.id,...span(v,s.timezone)};if(!available(d,v.employee,test))fail('Employee is unavailable, on approved leave, unassigned to this store, or has overlapping shifts.');}
  if(type==='clock'&&!d.entries.some(e=>e.employee===v.employee&&!e.end)){const s=store(v.store);if(!assignments(person(v.employee)).includes(s.id))fail('Employee is not assigned to this store.');if(s.workplace)verifyPosition(s.workplace,v.position,now);}
  const old=type==='employee'?d.employees.find(e=>e.id===v.id):type==='store'?d.stores.find(e=>e.id===v.id):null;
  d=base(d,command,actor,now,makeId);
  if(type==='employee'){const e=d.employees.find(e=>e.id===v.id)||d.employees.at(-1);if(old)Object.assign(e,{contact:old.contact,role:old.role,stores:old.stores,pto:old.pto});e.stores=[...new Set([e.store,...(e.stores||[])])];}
  if(type==='store'&&old){const s=d.stores.find(s=>s.id===old.id);s.workplace=old.workplace;}
  if(type==='clock'&&v.position){const entry=d.entries.find(e=>e.employee===v.employee&&!e.end);if(entry){entry.locationCheck={...verifyPosition(store(v.store).workplace,v.position,now),workplace:structuredClone(store(v.store).workplace)};}}
  return d;
 }
 if(['wf:spendBudget','wf:spendBudgetActive','wf:spendExpense','wf:spendExpenseStatus'].includes(type)){({before,after,detail}=applySpendCommand(d,type,v,actor,now,makeId));
 }else if(type==='wf:businessProfile'){before=structuredClone(d.businessProfile||null);d.businessProfile={...validateBusinessProfile(v),updatedAt:new Date(now).toISOString(),updatedBy:actor};after=structuredClone(d.businessProfile);detail='Business name and type updated';
 }else if(type==='wf:selectFeatures'){before=structuredClone(d.businessPlan?.selectedFeatures||null);const selected=applyFeatureSelection(d,v,actor,now);d.businessPlan={...d.businessPlan,...selected};after={selectedFeatures:selected.selectedFeatures};detail='Business feature selection saved; payment status unchanged';
 }else if(['wf:orderReminder','wf:orderPause','wf:orderComplete'].includes(type)){({before,after,detail}=applyOrderCommand(d,type,v,actor,now,makeId));
 }else if(type==='wf:profile'){
  const e=person(v.employee);before=structuredClone(e);const ids=[...new Set([e.store,...(Array.isArray(v.stores)?v.stores:[])])];ids.forEach(store);Object.assign(e,{role:str(v.role||'Team member','job role',80),stores:ids,contact:validateContact(v),pto:num(v.pto??e.pto??0,0,10000,'PTO allocation')});after=structuredClone(e);
 }else if(type==='wf:location'){
  const s=store(v.store);before=structuredClone(s);s.workplace=v.enabled?validateWorkplace({latitude:Number(v.latitude),longitude:Number(v.longitude),radius:Number(v.radius)}):null;after=structuredClone(s);
 }else if(type==='wf:availability'){
  person(v.employee);const day=num(v.day,0,6,'day');if(!Number.isInteger(day))fail('Choose a day.');if(!v.unavailable&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.end)||v.end<=v.start))fail('Availability end must follow start; use separate days for overnight availability.');before=w.availability.filter(a=>a.employee===v.employee&&a.day===day);w.availability=w.availability.filter(a=>a.employee!==v.employee||a.day!==day);put('availability',{id:makeId(),employee:v.employee,day,unavailable:!!v.unavailable,start:v.start||'00:00',end:v.end||'23:59'});
 }else if(type==='wf:leave'){
  const e=person(v.employee),from=date(v.from),to=date(v.to);if(to<from)fail('End date must follow start date.');put('leave',{id:makeId(),employee:e.id,from,to,hours:num(v.hours||0,0,10000,'leave hours'),paid:!!v.paid,reason:str(v.reason,'leave reason',500),status:'Pending',requestedAt:new Date(now).toISOString()});
 }else if(type==='wf:leaveReview'){
  const l=find('leave',v.id);if(l.status!=='Pending')fail('This request was already reviewed.');if(!['Approved','Denied'].includes(v.status))fail('Choose approve or deny.');before=structuredClone(l);if(v.status==='Approved'&&l.paid){const e=person(l.employee),used=w.leave.filter(a=>a.id!==l.id&&a.employee===l.employee&&a.paid&&a.status==='Approved').reduce((n,a)=>n+a.hours,0);if(used+l.hours>(e.pto||0))fail('Request exceeds remaining PTO. Update the allocation or request unpaid leave.');}Object.assign(l,{status:v.status,reviewedBy:actor,reviewedAt:new Date(now).toISOString(),reviewNote:str(v.reason,'review reason',500)});after=structuredClone(l);
 }else if(type==='wf:leaveCancel'){const l=find('leave',v.id);if(!['Pending','Approved'].includes(l.status))fail('This leave request cannot be cancelled.');before=structuredClone(l);Object.assign(l,{status:'Cancelled',cancelledBy:actor,cancelledAt:new Date(now).toISOString(),cancelReason:str(v.reason,'cancellation reason',500)});after=structuredClone(l);
 }else if(type==='wf:template'){
  const s=store(v.store);span({...v,date:'2026-01-05',endDate:v.endTime<=v.startTime?'2026-01-06':'2026-01-05'},s.timezone);put('templates',{id:makeId(),name:str(v.name,'template name',100),store:s.id,startTime:v.startTime,endTime:v.endTime,break:Number(v.break||0)});
 }else if(type==='wf:applyTemplate'){
  const t=find('templates',v.template),start=date(v.date);const count=num(v.count||1,1,31,'number of days');if(!Number.isInteger(count))fail('Use whole days.');before=[];after=[];for(let i=0;i<count;i++){const day=addDays(start,i),c={type:'shift',data:{...t,id:undefined,employee:v.employee,date:day,endDate:t.endTime<=t.startTime?addDays(day,1):day}};d=applyWorkforce(d,c,actor,now,makeId);after.push(d.shifts.at(-1));}w=d.workforce;
 }else if(type==='wf:need'){
  const s=store(v.store),day=date(v.date),times=span({...v,date:day,endDate:v.endTime<=v.startTime?addDays(day,1):day},s.timezone),count=num(v.count,1,50,'headcount');if(!Number.isInteger(count))fail('Headcount must be whole.');put('needs',{id:makeId(),store:s.id,...times,count,role:String(v.role||'').trim().slice(0,80)});
 }else if(type==='wf:autoSchedule'){
  const from=date(v.from),to=date(v.to);if(to<from||Date.parse(to)-Date.parse(from)>31*86400000)fail('Choose a range of at most 31 days.');const needs=w.needs.filter(n=>(!v.store||n.store===v.store)&&dateAt(n.start,d.settings.timezone)>=from&&dateAt(n.start,d.settings.timezone)<=to);if(!needs.length)fail('Add staffing requirements for this date range first.');let added=0;
  for(const need of needs){let assigned=d.shifts.filter(s=>s.store===need.store&&s.start<=need.start&&s.end>=need.end&&(!need.role||person(s.employee).role===need.role)).length;while(assigned<need.count){const candidates=d.employees.filter(e=>(!need.role||e.role===need.role)&&available(d,e.id,need)&&plannedWeek(d,e.id,need)+hours(need)<=d.settings.threshold).sort((a,b)=>plannedWeek(d,a.id,need)-plannedWeek(d,b.id,need)||a.name.localeCompare(b.name));if(!candidates.length)break;const shift={id:makeId(),employee:candidates[0].id,store:need.store,start:need.start,end:need.end,break:need.break,revision:1};d.shifts.push(shift);added++;assigned++;}}
  detail=`Auto-scheduled ${added} shifts. Unfilled staffing requirements remain visible.`;after={added};
 }else if(type==='wf:coverage'){
  if(!['Open shift','Cover','Swap'].includes(v.kind))fail('Choose a coverage type.');const s=store(v.store),times=v.kind==='Open shift'?span(v,s.timezone):null,shift=v.kind!=='Open shift'?d.shifts.find(s=>s.id===v.shift)||fail('Choose a scheduled shift.'):null;
  if(shift&&shift.store!==s.id)fail('Choose the scheduled shift’s store.');
  const target=v.kind==='Swap'?d.shifts.find(s=>s.id===v.target)||fail('Choose the swap shift.'):null;if(target&&(target.id===shift.id||target.employee===shift.employee))fail('Choose a different employee for the swap.');
  put('coverage',{id:makeId(),kind:v.kind,store:s.id,shift:shift?.id||'',target:target?.id||'',employee:shift?.employee||'',requestedShift:shift?structuredClone(shift):null,requestedTarget:target?structuredClone(target):null,...(times||{}),reason:str(v.reason,'coverage note',500),status:'Open',requestedBy:actor,createdAt:new Date(now).toISOString()});
 }else if(type==='wf:claim'){
  const r=find('coverage',v.id);if(r.status!=='Open')fail('This coverage request is no longer open.');const e=person(v.employee);if(r.employee===e.id)fail('Choose another employee to cover this shift.');if(r.kind==='Swap'&&d.shifts.find(s=>s.id===r.target)?.employee!==e.id)fail('Only the employee on the requested swap shift may accept it.');const shift=r.kind==='Open shift'?r:d.shifts.find(s=>s.id===r.shift)||fail('Shift no longer exists.');if(r.requestedShift&&JSON.stringify(r.requestedShift)!==JSON.stringify(shift))fail('The shift changed; create a new coverage request.');const checked=structuredClone(d);if(r.kind==='Swap')checked.shifts=checked.shifts.filter(s=>s.id!==r.target&&s.id!==r.shift);if(!available(checked,e.id,shift))fail('Employee cannot cover this shift.');before=structuredClone(r);Object.assign(r,{claimant:e.id,status:'Pending',acceptedAt:new Date(now).toISOString()});after=structuredClone(r);
 }else if(type==='wf:coverageReview'){
  const r=find('coverage',v.id);if(r.status!=='Pending')fail('A claim is needed before review.');before=structuredClone(r);if(!['Approved','Denied'].includes(v.status))fail('Choose approve or deny.');if(v.status==='Approved'){
   const e=person(r.claimant),shift=r.kind==='Open shift'?r:d.shifts.find(s=>s.id===r.shift)||fail('Shift no longer exists.');if(d.entries.some(e=>e.shift===shift.id))fail('Cannot reassign a shift that has attendance.');
   if(r.requestedShift&&JSON.stringify(r.requestedShift)!==JSON.stringify(shift))fail('The shift changed after this request; request coverage again.');
   const original=structuredClone(shift),target=r.kind==='Swap'?d.shifts.find(s=>s.id===r.target)||fail('Swap shift no longer exists.'):null;if(target&&r.requestedTarget&&JSON.stringify(target)!==JSON.stringify(r.requestedTarget))fail('The requested swap shift changed; request coverage again.');if(target&&d.entries.some(e=>e.shift===target.id))fail('Cannot swap a shift with attendance.');
   const checked=structuredClone(d);if(target)checked.shifts=checked.shifts.filter(s=>s.id!==target.id&&s.id!==shift.id);if(!available(checked,e.id,shift))fail('Claimant is no longer available.');
   if(target){if(!available(checked,original.employee,target))fail('Original employee cannot cover the swap.');target.employee=original.employee;target.revision++;}
   if(r.kind==='Open shift')d.shifts.push({id:makeId(),employee:e.id,store:r.store,start:r.start,end:r.end,break:r.break,revision:1});else{shift.employee=e.id;shift.revision++;}
  }Object.assign(r,{status:v.status,reviewedBy:actor,reviewNote:str(v.reason,'review reason',500),reviewedAt:new Date(now).toISOString()});after=structuredClone(r);
 }else if(type==='wf:budget'){
  store(v.store);const from=date(v.from),to=date(v.to);if(to<from)fail('End date must follow start.');put('budgets',{id:makeId(),store:v.store,from,to,limit:num(v.limit,0,10000000,'labor budget'),sales:num(v.sales,0,100000000,'sales estimate'),salesPerHour:num(v.salesPerHour,1,100000,'sales per labor hour')});
 }else if(type==='wf:publish'){
  const s=store(v.store),from=date(v.from),to=date(v.to);if(to<from)fail('Invalid date range.');if(!['New schedule','Schedule update','Schedule cancellation'].includes(v.kind))fail('Choose message type.');put('publications',{id:makeId(),version:1+Math.max(0,...w.publications.map(p=>p.version)),store:s.id,storeName:s.name,location:s.address||s.name,timezone:s.timezone,from,to,kind:v.kind,reply:str(v.reply,'manager contact',200),publishedBy:actor,publishedAt:new Date(now).toISOString(),shifts:v.kind==='Schedule cancellation'?[]:structuredClone(d.shifts.filter(shift=>shift.store===v.store&&dateAt(shift.start,s.timezone)>=from&&dateAt(shift.start,s.timezone)<=to).map(s=>{const a=partsAt(s.start,store(s.store).timezone),b=partsAt(s.end,store(s.store).timezone);return {employee:s.employee,date:a.date,start:a.time,endDate:b.date,end:b.time,breaks:s.break}}))});
 }else if(type==='wf:share'){
  const p=find('publications',v.publication),e=person(v.employee);if(!assignments(e).includes(p.store))fail('Employee is not assigned to the publication store.');if(!e.contact?.consent)fail('Employee notification permission is needed.');const channel=v.channel;if(!['email','whatsapp','sms'].includes(channel)||!e.contact[channel==='sms'?'phone':channel])fail('Contact details needed for this channel.');put('sharing',{id:makeId(),publication:p.id,version:p.version,store:p.store,employee:e.id,channel,recipient:e.contact[channel==='sms'?'phone':channel],status:'Sharing opened · sending unconfirmed',by:actor,at:new Date(now).toISOString()});
 }else if(type==='wf:message'){
  store(v.store);if(v.employee&&person(v.employee)&&!assignments(person(v.employee)).includes(v.store))fail('Recipient is not assigned to this store.');put('messages',{id:makeId(),store:v.store,employee:v.employee||'',text:str(v.text,'message',2000),by:actor,at:new Date(now).toISOString()});
 }else if(type==='wf:candidate'){
  store(v.store);if(!['Applied','Interview','Offer','Hired','Declined'].includes(v.status))fail('Choose hiring stage.');before=v.id?structuredClone(find('candidates',v.id)):null;put('candidates',{id:v.id||makeId(),name:str(v.name,'candidate name'),store:v.store,email:validateContact({email:v.email}).email,role:str(v.role,'role',80),status:v.status,note:String(v.note||'').slice(0,1000)});
 }else if(type==='wf:onboarding'){
  person(v.employee);put('onboarding',{id:makeId(),employee:v.employee,title:str(v.title,'onboarding task',200),due:date(v.due),done:false});
 }else if(type==='wf:taskDone'){
  const t=find('onboarding',v.id);before=structuredClone(t);t.done=!t.done;t.completedBy=actor;t.completedAt=new Date(now).toISOString();after=structuredClone(t);
 }else if(type==='wf:member'){
  const email=str(v.email,'member email',200).toLowerCase();validateContact({email});if(!['Manager','Employee'].includes(v.role))fail('Choose Manager or Employee.');const stores=Array.isArray(v.stores)?v.stores:[];if(!stores.length)fail('Assign at least one store.');stores.forEach(store);if(v.role==='Employee'){const e=person(v.employee);if(!assignments(e).some(s=>stores.includes(s)))fail('Assign a store matching this employee.');}before=w.members.find(m=>m.email===email)||null;put('members',{id:before?.id||makeId(),email,role:v.role,stores,employee:v.role==='Employee'?v.employee:'',active:v.active!==false});
 }else if(type==='wf:removeMember'){before=find('members',v.id);w.members=w.members.filter(m=>m.id!==v.id);
 }else fail('Unknown workforce action.');
 for(const items of Object.values(w))if(Array.isArray(items)&&items.length>20000)fail('Workspace capacity reached.');d.audit.push({id:makeId(),at:new Date(now).toISOString(),actor,action:type,detail:detail||type.slice(3),before,after});return d;
}
export function alerts(db,now=Date.now()){
 const d=upgrade(db),out=[...orderDueAlerts(d,now),...spendAlerts(d,now)];for(const e of d.entries){const a=e.schedule;if(!e.end)out.push({store:e.store,employee:e.employee,text:`Open punch since ${e.start}`,kind:'Open punch'});if(e.status==='Submitted')out.push({store:e.store,employee:e.employee,text:'Timesheet needs manager review',kind:'Approval'});if(a&&Date.parse(e.start)>Date.parse(a.start))out.push({store:e.store,employee:e.employee,text:`${Math.round((Date.parse(e.start)-Date.parse(a.start))/60000)} minutes late`,kind:'Attendance'});}
 for(const s of d.shifts)if(Date.parse(s.end)<now&&!d.entries.some(e=>e.shift===s.id))out.push({store:s.store,employee:s.employee,text:`No attendance for shift ${s.start}`,kind:'Missing attendance'});
 for(const s of d.shifts){const zone=d.stores.find(x=>x.id===s.store)?.timezone||d.settings.timezone;if(d.workforce.leave.some(l=>l.status==='Approved'&&l.employee===s.employee&&l.from<=dateAt(Date.parse(s.end)-1,zone)&&l.to>=dateAt(s.start,zone)))out.push({store:s.store,employee:s.employee,text:'Scheduled shift overlaps approved leave: '+s.start,kind:'Leave conflict'});}
 const week=weekKey(dateAt(now,d.settings.timezone),d.settings.weekStart),p=payroll(d,week,addDays(week,6));for(const r of p.rows)if(r.total>=d.settings.threshold-4)out.push({store:'',employee:r.id,text:`${r.total.toFixed(2)} hours this week; ${r.overtime.toFixed(2)} overtime hours`,kind:'Overtime'});return out;
}
export function labor(db,b){const actual=payroll(db,b.from,b.to,b.store),gross=actual.rows.reduce((n,r)=>n+r.gross,0);let scheduled=0;for(const s of db.shifts.filter(s=>s.store===b.store))scheduled+=segments(s,db.settings.timezone).filter(x=>x.date>=b.from&&x.date<=b.to).reduce((n,x)=>n+x.minutes/60,0)*(db.employees.find(e=>e.id===s.employee)?.rate||0);return {actual:gross,scheduled,remaining:b.limit-gross,laborPercent:b.sales?gross/b.sales*100:null,recommendedHours:b.sales/b.salesPerHour};}
