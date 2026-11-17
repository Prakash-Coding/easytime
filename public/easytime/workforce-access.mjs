import {upgrade,assignments} from './workforce-domain.mjs';
import {segments,weekKey} from './payroll-domain.mjs';
export function membership(state,user,owner){if(owner===user.id)return {role:'Owner',stores:state.stores.map(s=>s.id),employee:''};const m=state.workforce?.members?.find(m=>m.active&&m.email===user.email.toLowerCase());if(!m)throw Error('You do not have access to this business.');return m;}
export function authorize(state,command,member){
 if(member.role==='Owner')return;
 const {type,data:v={}}=command,db=upgrade(state),w=db.workforce,allowedStore=s=>member.stores.includes(s),existing=type==='employee'?db.employees.find(e=>e.id===v.id):type==='entry'||type==='status'?db.entries.find(e=>e.id===v.id):type==='shift'||type==='deleteShift'?db.shifts.find(e=>e.id===v.id):['wf:leaveReview','wf:leaveCancel'].includes(type)?w.leave.find(e=>e.id===v.id):['wf:claim','wf:coverageReview'].includes(type)?w.coverage.find(e=>e.id===v.id):type==='wf:taskDone'?w.onboarding.find(e=>e.id===v.id):['wf:orderReminder','wf:orderPause','wf:orderComplete'].includes(type)?w.orderReminders.find(e=>e.id===v.id):null;
 const spendExisting=['wf:spendBudget','wf:spendBudgetActive'].includes(type)?w.spendBudgets.find(r=>r.id===v.id):['wf:spendExpense','wf:spendExpenseStatus'].includes(type)?w.spendExpenses.find(r=>r.id===v.id):null;
 const reject=()=>{throw Error('Your role does not permit this change.');};
 if(['wf:businessProfile','wf:selectFeatures','settings','store','employee','wf:member','wf:removeMember','wf:location','wf:profile'].includes(type))reject();
 if(spendExisting&&!allowedStore(spendExisting.store))reject();
 if(member.role==='Manager'){
  if(type==='wf:autoSchedule'&&!v.store)reject();
  if(v.employee){const e=db.employees.find(e=>e.id===v.employee);if(!e||!assignments(e).some(allowedStore))reject();}
  const related=existing?.store||v.store||(existing?.employee?db.employees.find(e=>e.id===existing.employee)?.store:null)||(v.employee?db.employees.find(e=>e.id===v.employee)?.store:null);
  if(related&&!allowedStore(related))reject();if(v.store&&!allowedStore(v.store))reject();
  if(type==='wf:applyTemplate'){const t=w.templates.find(t=>t.id===v.template);if(!t||!allowedStore(t.store))reject();}
  if(type==='wf:share'){const p=w.publications.find(p=>p.id===v.publication);if(!p||!allowedStore(p.store)||!assignments(db.employees.find(e=>e.id===v.employee)||{}).includes(p.store))reject();}
  if(type==='wf:candidate'&&v.id){const c=w.candidates.find(c=>c.id===v.id);if(!c||!allowedStore(c.store))reject();}
  if(type==='wf:coverageReview'&&existing?.target){const target=db.shifts.find(s=>s.id===existing.target);if(!target||!allowedStore(target.store))reject();}
  if(type==='clock'){const open=db.entries.find(e=>e.employee===v.employee&&!e.end);if(open&&!allowedStore(open.store))reject();}
  if(type==='wf:coverage'&&v.kind!=='Open shift'){for(const id of [v.shift,v.target].filter(Boolean)){const s=db.shifts.find(s=>s.id===id);if(!s||!allowedStore(s.store))reject();}}
  return;
 }
 const allowed=['clock','entry','status','wf:availability','wf:leave','wf:leaveCancel','wf:coverage','wf:claim','wf:taskDone','wf:orderComplete','wf:spendExpense','wf:spendExpenseStatus'];if(!allowed.includes(type))reject();
 const employee=type==='wf:claim'?v.employee:spendExisting?.employee||existing?.employee||v.employee;
 if(type==='wf:coverage'){if(v.kind==='Open shift')reject();const s=db.shifts.find(s=>s.id===v.shift);if(s?.employee!==member.employee||!allowedStore(s.store))reject();}
 else if(employee!==member.employee)reject();
 if(v.employee&&v.employee!==member.employee)reject();
 if(type==='wf:coverage'&&v.target){const target=db.shifts.find(s=>s.id===v.target);if(!target||!allowedStore(target.store))reject();}
 if(v.store&&!allowedStore(v.store))reject();if(existing?.store&&!allowedStore(existing.store))reject();
 if(['status','wf:spendExpenseStatus'].includes(type)&&v.status!=='Submitted')reject();
}
export function project(state,member){const d=upgrade(state);if(member.role==='Owner')return d;
 const store=s=>member.stores.includes(s),person=e=>member.role==='Employee'?e===member.employee:d.employees.some(p=>p.id===e&&assignments(p).some(store));
 // Retain only allocation numbers for visible entries; overtime context never reveals other-store records.
 const used=new Map(),allocation={};for(const s of d.entries.flatMap(e=>segments(e,d.settings.timezone)).sort((a,b)=>a.segmentStart-b.segmentStart||a.id.localeCompare(b.id))){const key=s.employee+'|'+weekKey(s.date,d.settings.weekStart),prior=used.get(key)||0,regular=Math.min(s.minutes,Math.max(0,d.settings.threshold*60-prior));used.set(key,prior+s.minutes);if(store(s.store)&&person(s.employee))allocation[s.id+'|'+s.segmentStart]=regular;}
 d.workforce.swapOptions=member.role==='Employee'?d.shifts.filter(s=>store(s.store)&&s.employee!==member.employee).map(s=>({id:s.id,store:s.store,start:s.start,end:s.end,name:d.employees.find(e=>e.id===s.employee)?.name||'Team member'})):[];
 d.allocation=allocation;d.stores=d.stores.filter(s=>store(s.id));d.employees=d.employees.filter(e=>person(e.id)).map(e=>({...e,contact:member.role==='Employee'&&e.id!==member.employee?undefined:e.contact}));d.entries=d.entries.filter(e=>store(e.store)&&person(e.employee));d.shifts=d.shifts.filter(e=>store(e.store)&&person(e.employee));d.audit=member.role==='Employee'?[]:d.audit.filter(a=>{const r=a.after||a.before;return r&&!Array.isArray(r)&&r.store&&store(r.store)&&!['wf:member','wf:removeMember'].includes(a.action)});
 if(d.businessProfile)d.businessProfile={name:d.businessProfile.name,type:d.businessProfile.type,otherType:d.businessProfile.otherType};
 if(d.businessPlan)d.businessPlan={activeFeatures:d.businessPlan.billing?.activeFeatures||[],status:d.businessPlan.billing?.status||'unconfigured'};
 const w=d.workforce;w.members=[];w.integrations=[];w.spendBudgets=w.spendBudgets.filter(b=>store(b.store)&&(member.role!=='Employee'||b.employee===member.employee));w.spendExpenses=w.spendExpenses.filter(e=>store(e.store)&&person(e.employee));w.orderReminders=w.orderReminders.filter(r=>store(r.store)&&person(r.employee));w.orderHistory=w.orderHistory.filter(r=>store(r.store)&&person(r.employee));w.availability=w.availability.filter(x=>person(x.employee));w.leave=w.leave.filter(x=>person(x.employee));w.templates=w.templates.filter(x=>store(x.store));w.needs=w.needs.filter(x=>store(x.store));w.budgets=member.role==='Employee'?[]:w.budgets.filter(x=>store(x.store));w.messages=w.messages.filter(x=>store(x.store)&&(!x.employee||person(x.employee)));w.publications=w.publications.filter(x=>store(x.store)).map(p=>({...p,shifts:p.shifts.filter(s=>person(s.employee))}));w.sharing=member.role==='Employee'?[]:w.sharing.filter(x=>store(x.store));w.candidates=member.role==='Employee'?[]:w.candidates.filter(x=>store(x.store));w.onboarding=w.onboarding.filter(x=>person(x.employee));w.coverage=w.coverage.filter(x=>store(x.store));return d;
}
