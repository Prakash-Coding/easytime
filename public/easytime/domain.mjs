export const DAY=86400000;
export const CYCLES=['7','14','15','semimonth','month','30','custom'];
export const CATEGORIES=['Housing','Food','Transport','Utilities','Health','Shopping','Entertainment','Savings','Other'];
export const defaults={cycle:'15',weekStart:1,otThreshold:40,otMultiplier:1.5,rate:'',paydayOffset:5,timeZone:'America/Chicago',reminders:true,rateHistory:[]};
export function emptyState(){return {version:3,profile:{fullName:'',employeeId:'',company:'',email:'',rate:''},settings:{...defaults,rateHistory:[]},records:[],expenses:[],bills:[],paychecks:[],budgets:{},customCategories:[],categoryOrder:[],cycleBudgets:{},dismissed:[]};}
export function expenseCategories(state){const known=[...CATEGORIES,...(state.customCategories??[])],ordered=(state.categoryOrder??[]).filter(c=>known.includes(c));return [...ordered,...known.filter(c=>!ordered.includes(c))];}
export function categoryName(value,existing=CATEGORIES){
 if(typeof value!=='string')throw new Error('Enter a category name.');
 const name=value.trim().replace(/\s+/g,' ');
 if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(value)||['__proto__','constructor','prototype'].includes(name.toLowerCase()))throw new Error('Use a category name of 1–60 characters.');
 if(existing.some(c=>c.toLowerCase()===name.toLowerCase()))throw new Error('That category already exists. Choose another name.');
 return name;
}
export function categoryBudgets(state,record){return Object.hasOwn(state.cycleBudgets??{},record.id)?state.cycleBudgets[record.id]:state.budgets;}
export function categorySpending(state,record){
 const range=cycleRange(record.start,record.cycle,record.end),limits=categoryBudgets(state,record),spent=new Map();
 for(const e of state.expenses)if(e.date>=range.start&&e.date<=range.end)spent.set(e.category,(spent.get(e.category)??0)+e.cents);
 return expenseCategories(state).map(name=>{const limit=limits[name]??0,total=spent.get(name)??0;return {name,spent:total,limit,remaining:limit?limit-total:null};});
}
export function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v&&v>='1900-01-01'&&v<='9998-12-31';}
export function addDays(date,n){return new Date(Date.parse(date+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);}
export function monthDays(date){const d=new Date(date.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.getUTCDate();}
export function cycleRange(date,cycle='15',customEnd){
 if(!isoDate(date)||!CYCLES.includes(String(cycle)))throw new Error('Choose a valid pay period.');
 cycle=String(cycle);let start=date,days=Number(cycle);
 if(cycle==='custom'){
  if(!isoDate(customEnd))throw new Error('Choose a valid end date.');
  if(customEnd<start)throw new Error('End date must be on or after the start date.');
  days=Math.round((Date.parse(customEnd+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/DAY)+1;
  if(days>366)throw new Error('Choose a custom period of 366 days or fewer.');
 }
 if(cycle==='month'){start=date.slice(0,7)+'-01';days=monthDays(start);}
 if(cycle==='semimonth'){const day=Number(date.slice(-2));start=date.slice(0,7)+(day<=15?'-01':'-16');days=day<=15?15:monthDays(start)-15;}
 return {start,end:addDays(start,days-1),days,cycle};
}
export function rangeId(range){return range.cycle+':'+range.start+(range.cycle==='custom'?':'+range.end:'');}
export function nextRange(range){const start=addDays(range.end,1);return cycleRange(start,range.cycle,range.cycle==='custom'?addDays(start,range.days-1):undefined);}
export function todayIn(zone='America/Chicago'){const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
export function blankEntry(){return {start:'',end:'',breakMinutes:'',paidBreak:false,manualOT:''};}
export function newRecord(start,cycle='15',rate='',mode='normal',end){const range=cycleRange(start,cycle,end);return {id:rangeId(range),start:range.start,cycle:range.cycle,...(range.cycle==='custom'?{end:range.end}:{}),rate:String(rate),mode,entries:Array.from({length:range.days},blankEntry),updatedAt:new Date().toISOString(),savedAt:null};}
export function freshRecordAfter(record,records=[]){
 const occupied=records.map(r=>cycleRange(r.start,r.cycle,r.end));
 let range=nextRange(cycleRange(record.start,record.cycle,record.end));
 while(occupied.some(r=>r.start<=range.end&&r.end>=range.start))range=nextRange(range);
 return newRecord(range.start,range.cycle,record.rate,record.mode,range.end);
}
export function minutes(v){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))return null;const [h,m]=v.split(':').map(Number);return h*60+m;}
export function rateFor(date,base,history=[]){const eligible=history.filter(x=>x.effective<=date&&x.rate!==''&&Number.isFinite(Number(x.rate))&&Number(x.rate)>=0).sort((a,b)=>a.effective.localeCompare(b.effective));return Number(eligible.at(-1)?.rate??base);}
export function weekKey(date,weekday){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((day-Number(weekday)+7)%7));}
export function calculate(record,allRecords=[],settings=defaults){
 const range=cycleRange(record.start,record.cycle,record.end),mapped=new Map();
 const entered=(e,r)=>e.start||e.end||e.breakMinutes||(r.mode==='overtime'&&e.manualOT);
 [...allRecords.filter(r=>r.id!==record.id).sort((a,b)=>(a.updatedAt??'').localeCompare(b.updatedAt??'')),record].forEach(r=>r.entries.forEach((e,i)=>{if(entered(e,r))mapped.set(addDays(r.start,i),{e,r});}));
 const daily=new Map(),weeks=new Map(),threshold=Number(settings.otThreshold??40)*60,multiplier=Number(settings.otMultiplier??1.5);
 for(const [date,{e,r}] of [...mapped].sort((a,b)=>a[0].localeCompare(b[0]))){
  const start=minutes(e.start),end=minutes(e.end),rawBreak=e.breakMinutes===''?0:Number(e.breakMinutes),manual=e.manualOT===''?null:Number(e.manualOT)*60,errors=[];
  if(start===null||end===null)errors.push('Enter valid start and end times.');const duration=start!==null&&end!==null?(end<start?end+1440:end)-start:0;
  if(duration===0&&start!==null&&end!==null)errors.push('Start and end must differ.');if(!Number.isInteger(rawBreak)||rawBreak<0||rawBreak>duration)errors.push('Break must fit within the shift.');
  const net=duration-(e.paidBreak?0:rawBreak);if(r.mode==='overtime'&&manual!==null&&(!Number.isFinite(manual)||manual<0||manual>net))errors.push('Manual OT must fit within worked hours.');
  const rate=rateFor(date,r.rate,settings.rateHistory);if(r.rate===''&&!(settings.rateHistory??[]).some(x=>x.effective<=date))errors.push('Enter an hourly rate to estimate pay.');if(!Number.isFinite(rate)||rate<0)errors.push('Enter a valid hourly rate.');
  if(errors.length){daily.set(date,{date,errors,total:0,regular:0,overtime:0,pay:0,rate,complete:false});continue;}
  // When only a total unpaid break is entered, deduct it from the shift end.
  // Split the remaining worked minutes at midnight for fixed-workweek totals.
  const segments=[];let left=net;const beforeMidnight=Math.min(left,1440-start);segments.push([date,beforeMidnight]);left-=beforeMidnight;if(left>0)segments.push([addDays(date,1),left]);let automatic=0;
  for(const [segmentDate,count] of segments){const key=weekKey(segmentDate,settings.weekStart??1),used=weeks.get(key)??0;automatic+=Math.max(0,used+count-threshold)-Math.max(0,used-threshold);weeks.set(key,used+count);}
  const overtime=r.mode==='overtime'?(manual??automatic):0,regular=net-overtime;daily.set(date,{date,errors:[],total:net/60,regular:regular/60,overtime:overtime/60,pay:(regular*rate+overtime*rate*multiplier)/60,rate,complete:true,overnight:end<start});
 }
 const rows=record.entries.map((e,i)=>{const date=addDays(range.start,i);return entered(e,record)?daily.get(date):{date,errors:[],total:0,regular:0,overtime:0,pay:0,complete:false};}),sum=k=>rows.reduce((a,r)=>a+(r?.[k]??0),0);
 return {rows,total:sum('total'),regular:sum('regular'),overtime:sum('overtime'),pay:sum('pay'),completed:rows.filter(r=>r.complete).length,errors:rows.filter(r=>r?.errors.length),range,contextStart:weekKey(range.start,settings.weekStart??1),contextEnd:addDays(weekKey(range.end,settings.weekStart??1),6)};
}
export function paycheckSummary(check,record,records,settings){const expected=record?Math.round(calculate(record,records,settings).pay*100):0,deductions=(check.deductions??[]).reduce((s,d)=>s+d.cents,0);return {expected,actual:check.grossCents,difference:check.grossCents-expected,deductions,net:check.grossCents-deductions};}
export function billOccurrences(bills,start,end){const rows=[];for(const bill of bills){if(!bill.active)continue;let date=bill.nextDue,guard=0;while(date<=end&&guard++<1200){if(date>=start)rows.push({...bill,occurrence:date});if(bill.frequency==='once')break;if(bill.frequency==='weekly'){date=addDays(date,7);continue;}const d=new Date(date.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);const base=d.toISOString().slice(0,7)+'-01';date=base.slice(0,7)+'-'+String(Math.min(Number(bill.nextDue.slice(-2)),monthDays(base))).padStart(2,'0');}}return rows.sort((a,b)=>a.occurrence.localeCompare(b.occurrence));}
export function budgetSummary(state,start,end){const received=state.paychecks.filter(p=>p.payDate>=start&&p.payDate<=end).reduce((s,p)=>s+paycheckSummary(p,null,[],state.settings).net,0),expenses=state.expenses.filter(e=>e.date>=start&&e.date<=end).reduce((s,e)=>s+e.cents,0),reserved=billOccurrences(state.bills,start,end).filter(b=>!state.expenses.some(e=>e.billId===b.id&&e.billDate===b.occurrence)).reduce((s,b)=>s+b.cents,0);return {received,expenses,reserved,available:received-expenses-reserved};}
export function csvCell(v){let s=String(v??'');if(/^[\t\r\n ]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function timesheetCSV(record,state){const t=calculate(record,state.records,state.settings);if(t.errors.length)throw new Error('Fix the highlighted times before exporting.');if(!t.completed)throw new Error('Enter a shift before exporting.');const rows=[['EasyTime timesheet'],['Employee',state.profile.fullName],['Employee ID',state.profile.employeeId],['Period',t.range.start,t.range.end],['Mode',record.mode],['Date','Start','End','Break minutes','Break paid','Manual OT','Worked hours','Regular hours','OT hours','Rate','Gross pay']];t.rows.forEach((r,i)=>{const e=record.entries[i];rows.push([r.date,e.start,e.end,e.breakMinutes,e.paidBreak?'Yes':'No',record.mode==='overtime'?e.manualOT:'',r.complete?r.total.toFixed(6):'',r.complete?r.regular.toFixed(6):'',r.complete?r.overtime.toFixed(6):'',r.complete?r.rate.toFixed(2):'',r.complete?r.pay.toFixed(2):'']);});rows.push(['Totals','','','','','',t.total.toFixed(6),t.regular.toFixed(6),t.overtime.toFixed(6),'',t.pay.toFixed(2)]);return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
export function importLegacy(raw,profileRaw,current){const next=structuredClone(current);let imported=0;const parsed=typeof raw==='string'?JSON.parse(raw):raw,list=Array.isArray(parsed?.records)?parsed.records:[];for(const old of list){const start=old.periodStart??old.start,cycle=String(old.cycle??old.periodDays??15);if(!isoDate(start)||!CYCLES.includes(cycle)||!Array.isArray(old.entries)||cycle==='custom'&&!isoDate(old.end??old.periodEnd))continue;const record=newRecord(start,cycle,String(old.rate??''),old.mode==='overtime'?'overtime':'normal',old.end??old.periodEnd);record.entries=record.entries.map((_,i)=>({...blankEntry(),...(old.entries[i]??{})}));record.updatedAt=old.savedAt??old.updatedAt??new Date().toISOString();record.savedAt=old.savedAt??null;if(next.records.some(r=>r.id===record.id))continue;next.records.push(record);imported++;}if(profileRaw){const p=typeof profileRaw==='string'?JSON.parse(profileRaw):profileRaw;if(p?.profile&&!next.profile.fullName){next.profile={...next.profile,...p.profile};if(p.profile.cycleDays)next.settings.cycle=String(p.profile.cycleDays===30?'month':p.profile.cycleDays);if(p.profile.rate!=='')next.settings.rate=String(p.profile.rate??'');}}return {state:next,imported};}
export function validateState(s){
 if(!s||s.version!==3||!s.profile||!s.settings)throw new Error('This backup is not an EasyTime account.');const text=(v,n=250)=>typeof v==='string'&&v.length<=n;
 if(!text(s.profile.fullName,120)||!text(s.profile.employeeId,80)||!text(s.profile.company,180)||!text(s.profile.email??'',254)||!text(s.profile.rate??'',20))throw new Error('Check your profile fields.');
 const set=s.settings;if(!CYCLES.includes(String(set.cycle))||set.cycle==='custom'||!Number.isInteger(set.weekStart)||set.weekStart<0||set.weekStart>6||!Number.isFinite(set.otThreshold)||set.otThreshold<1||set.otThreshold>168||!Number.isFinite(set.otMultiplier)||set.otMultiplier<1||set.otMultiplier>5||!text(set.rate,20)||!Number.isInteger(set.paydayOffset)||set.paydayOffset<0||set.paydayOffset>60||!text(set.timeZone,80)||typeof set.reminders!=='boolean')throw new Error('Check your pay settings.');try{new Intl.DateTimeFormat('en',{timeZone:set.timeZone});}catch{throw new Error('Choose a valid time zone.');}
 if(!Array.isArray(set.rateHistory)||set.rateHistory.length>100||set.rateHistory.some(x=>!isoDate(x.effective)||!text(x.rate,20)||x.rate===''||!Number.isFinite(Number(x.rate))||Number(x.rate)<0||Number(x.rate)>100000))throw new Error('Check your hourly rate history.');
 const arrays={records:1000,expenses:10000,bills:200,paychecks:1000};for(const [k,max] of Object.entries(arrays))if(!Array.isArray(s[k])||s[k].length>max||new Set(s[k].map(x=>x.id)).size!==s[k].length||s[k].some(x=>!text(x.id,120)||!x.id))throw new Error('Too many or invalid '+k+'.');
 for(const r of s.records){const range=cycleRange(r.start,String(r.cycle),r.end);if(!['normal','overtime'].includes(r.mode)||!text(r.rate,20)||(r.rate!==''&&(!Number.isFinite(Number(r.rate))||Number(r.rate)<0||Number(r.rate)>100000))||!Array.isArray(r.entries)||r.entries.length!==range.days||!text(r.updatedAt,50)||!(r.savedAt===null||text(r.savedAt,50)))throw new Error('Check your timesheet.');for(const e of r.entries)if(!text(e.start,5)||!text(e.end,5)||!text(e.breakMinutes,12)||!text(e.manualOT,12)||typeof e.paidBreak!=='boolean'||(e.start&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.start))||(e.end&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.end)))throw new Error('Check your shift fields.');}
 const custom=s.customCategories??[];if(!Array.isArray(custom)||custom.length>100)throw new Error('Use at most 100 custom categories.');
 const categories=[...CATEGORIES];for(const name of custom){if(categoryName(name,categories)!==name)throw new Error('Check your category names.');categories.push(name);}
 const order=s.categoryOrder===undefined?[]:s.categoryOrder;if(!Array.isArray(order)||order.length>categories.length||new Set(order).size!==order.length||order.some(c=>!categories.includes(c)))throw new Error('Check your category order.');
 const cents=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000;for(const e of s.expenses)if(!isoDate(e.date)||!cents(e.cents)||!categories.includes(e.category)||!text(e.note,500)||(e.billId&&!text(e.billId,120))||(e.billDate&&!isoDate(e.billDate)))throw new Error('Check your expenses.');
 for(const b of s.bills)if(!isoDate(b.nextDue)||!cents(b.cents)||!['once','weekly','monthly'].includes(b.frequency)||!text(b.name,120)||!b.name.trim()||typeof b.active!=='boolean')throw new Error('Check your recurring bills.');
 for(const p of s.paychecks)if(!isoDate(p.payDate)||!cents(p.grossCents)||!text(p.recordId,120)||!Array.isArray(p.deductions)||p.deductions.length>30||p.deductions.some(d=>!text(d.name,80)||!cents(d.cents))||p.deductions.reduce((a,d)=>a+d.cents,0)>p.grossCents)throw new Error('Deductions must fit within gross pay.');
 const validLimits=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.entries(v).every(([k,amount])=>categories.includes(k)&&cents(amount));
 const cycleBudgets=s.cycleBudgets??{};if(!validLimits(s.budgets)||!cycleBudgets||typeof cycleBudgets!=='object'||Array.isArray(cycleBudgets)||![Object.prototype,null].includes(Object.getPrototypeOf(cycleBudgets))||Object.keys(cycleBudgets).length>1000||Object.entries(cycleBudgets).some(([recordId,limits])=>!s.records.some(r=>r.id===recordId)||!validLimits(limits))||!Array.isArray(s.dismissed)||s.dismissed.length>500||s.dismissed.some(x=>!text(x,180)))throw new Error('Check your budgets.');
 if(JSON.stringify(s).length>2000000)throw new Error('Your account is too large for one save. Export older records first.');return s;
}
