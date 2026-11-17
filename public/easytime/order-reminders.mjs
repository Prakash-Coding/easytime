import {zonedTime,addDays,partsAt} from './payroll-domain.mjs';
const fail=message=>{throw Error(message)},text=(value,label,max=300)=>typeof value==='string'&&value.trim()&&value.trim().length<=max?value.trim():fail(`Enter ${label} (${max} characters maximum).`);
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T12:00Z'))||new Date(value+'T12:00Z').toISOString().slice(0,10)!==value)fail('Choose a valid order due date.');return value;}
export function orderStatus(reminder,now=Date.now()){
 if(!reminder.active)return reminder.finished?'Ordered':'Paused';
 const delta=Date.parse(reminder.due)-now;
 return delta<0?'Overdue':delta===0?'Due now':delta<=Number(reminder.leadHours)*3600000?'Due soon':'Upcoming';
}
export function orderDueAlerts(state,now=Date.now()){return (state.workforce?.orderReminders||[]).filter(r=>r.active&&Date.parse(r.due)-r.leadHours*3600000<=now).map(r=>{const due=partsAt(r.due,r.timezone);return {id:r.id,store:r.store,employee:r.employee,kind:'Stock order',text:`${orderStatus(r,now)}: ${r.title}${r.supplier?' · '+r.supplier:''} · due ${due.date} ${due.time} (${r.timezone})`,page:'ordering'};});}
// Keep recurring reminders at their store-local wall time across offset changes.
function nextOccurrence(reminder,now){const days={daily:1,weekly:7}[reminder.repeat];if(!days)return null;
 let day=addDays(reminder.dueDate,days),due,adjusted=false,skipped=0;
 for(let i=0;i<40000;i++){
  adjusted=false;
  try{due=zonedTime(day,reminder.dueTime,reminder.timezone);}catch(error){
   // A spring-forward gap moves this occurrence to the next valid local minute.
   let found=false;const [h,m]=reminder.dueTime.split(':').map(Number),start=h*60+m;
   for(let n=1;n<=120&&start+n<1440;n++){const total=start+n,time=String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');try{due=zonedTime(day,time,reminder.timezone);found=true;adjusted=true;break;}catch{}}
   if(!found)throw error;
  }
  if(Date.parse(due)>Math.max(now,Date.parse(reminder.due)))return {dueDate:day,due,adjusted,skipped};
  skipped++;day=addDays(day,days);
 }
 fail('Reminder is too old to advance automatically. Edit its due date.');
}
export function applyOrderCommand(db,type,v,actor,now,makeId){const w=db.workforce;let before=null,after=null,detail='';
 const find=()=>w.orderReminders.find(r=>r.id===v.id)||fail('Ordering reminder not found.');
 if(type==='wf:orderReminder'){
  const existing=v.id?find():null,store=db.stores.find(s=>s.id===v.store)||fail('Choose a store.'),employee=db.employees.find(e=>e.id===v.employee)||fail('Choose an employee.');
  if(!employee.active||![employee.store,...(employee.stores||[])].includes(store.id))fail('Choose an active employee assigned to this store.');
  if(!['none','daily','weekly'].includes(v.repeat))fail('Choose a repeat schedule.');const lead=Number(v.leadHours);if(v.leadHours===''||!Number.isInteger(lead)||lead<0||lead>168)fail('Reminder lead time must be whole hours from 0 to 168.');
  const dueDate=validDate(v.dueDate),due=zonedTime(dueDate,v.dueTime,store.timezone);before=existing?structuredClone(existing):null;
  if(existing)text(v.reason,'a reason for editing this reminder',500);
  after={id:existing?.id||makeId(),store:store.id,employee:employee.id,title:text(v.title,'an order title',180),supplier:String(v.supplier||'').trim().slice(0,180),items:text(v.items,'items or ordering instructions',2000),dueDate,dueTime:v.dueTime,due,timezone:store.timezone,repeat:v.repeat,leadHours:lead,active:existing?existing.active:true,finished:existing?.finished||false,adjusted:false,createdBy:existing?.createdBy||actor,createdAt:existing?.createdAt||new Date(now).toISOString(),updatedBy:actor,updatedAt:new Date(now).toISOString()};
  if(existing)Object.assign(existing,after);else w.orderReminders.push(after);detail=existing?v.reason:'Assigned stock-order reminder';
 }else if(type==='wf:orderPause'){
  const r=find();before=structuredClone(r);if(typeof v.active!=='boolean')fail('Choose pause or resume.');if(r.active===v.active)fail('This reminder status has already changed.');text(v.reason,'a reason for this status change',500);r.active=v.active;r.finished=false;r.updatedAt=new Date(now).toISOString();r.updatedBy=actor;after=structuredClone(r);detail=v.reason;
 }else if(type==='wf:orderComplete'){
  const r=find();if(!r.active)fail('This reminder is paused or already completed.');if(v.due!==r.due)fail('This order occurrence changed. Reload before completing it.');const note=text(v.note,'an order completion note or reference',500);before=structuredClone(r);
  const next=nextOccurrence(r,now);w.orderHistory.push({id:makeId(),reminder:r.id,store:r.store,employee:r.employee,title:r.title,supplier:r.supplier,due:r.due,timezone:r.timezone,completedAt:new Date(now).toISOString(),completedBy:actor,note,skippedOccurrences:next?.skipped||0});
  if(next){r.dueDate=next.dueDate;r.due=next.due;r.adjusted=next.adjusted;}else{r.active=false;r.finished=true;}r.lastOrderedAt=new Date(now).toISOString();r.updatedAt=r.lastOrderedAt;r.updatedBy=actor;after=structuredClone(r);detail='Order marked placed: '+note;
 }else fail('Unknown order reminder action.');return {before,after,detail};
}
