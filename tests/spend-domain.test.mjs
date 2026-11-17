import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyPayroll} from '../public/easytime/payroll-domain.mjs';
import {applyWorkforce,upgrade,alerts} from '../public/easytime/workforce-domain.mjs';
import {moneyCents,spendReport,spendAlerts} from '../public/easytime/spend-domain.mjs';
import {authorize,project} from '../public/easytime/workforce-access.mjs';

const NOW=Date.parse('2026-10-26T18:00:00Z');
let sequence=0;
const apply=(db,type,data,actor='Verified manager',now=NOW)=>applyWorkforce(db,{type,data},actor,now,()=>`spend-test-${++sequence}`);
function workspace(){
 let db=upgrade(emptyPayroll());
 db=apply(db,'store',{name:'North',timezone:'America/Chicago'});
 db=apply(db,'store',{name:'South',timezone:'America/New_York'});
 for(const [name,code,store] of [['Alex','A',db.stores[0].id],['Blair','B',db.stores[0].id],['Casey','C',db.stores[1].id]])db=apply(db,'employee',{name,code,store,rate:20});
 return db;
}
const budget=(db,overrides={})=>({name:'October inventory',store:db.stores[0].id,employee:'',category:'Inventory',from:'2026-10-01',to:'2026-10-31',amount:'1000.00',alertPercent:'80',...overrides});
const expense=(db,overrides={})=>({store:db.stores[0].id,employee:db.employees[0].id,category:'Inventory',date:'2026-10-20',amount:'25.10',vendor:'Distributor',note:'Invoice REF-1',...overrides});
function addExpense(db,overrides={},status='Draft'){
 db=apply(db,'wf:spendExpense',expense(db,overrides));
 const id=db.workforce.spendExpenses.at(-1).id;
 if(['Submitted','Approved','Returned'].includes(status))db=apply(db,'wf:spendExpenseStatus',{id,status:'Submitted',reason:'Ready for review'});
 if(['Approved','Returned'].includes(status))db=apply(db,'wf:spendExpenseStatus',{id,status,reason:status==='Approved'?'Checked invoice':'Needs correction'});
 return db;
}

 test('money amounts use exact integer cents and reject unsupported precision or signs',()=>{
 assert.equal(moneyCents('0.10'),10);
 assert.equal(moneyCents('10.01'),1001);
 assert.equal(moneyCents(' 42.3 '),4230);
 assert.equal(moneyCents('99999999.99'),9999999999);
 assert.equal(moneyCents('0',true),0);
 for(const value of ['0','-1','1.001','1e2','1,000.00','01.00','','abc',null,Infinity])assert.throws(()=>moneyCents(value));
 });

 test('budget edits require reasons and preserve an authenticated before/after audit',()=>{
 const original=workspace();let db=apply(original,'wf:spendBudget',budget(original));
 assert.equal(original.workforce.spendBudgets.length,0);
 const first=db.workforce.spendBudgets[0];assert.equal(first.limitCents,100000);assert.equal(first.category,'inventory');
 assert.throws(()=>apply(db,'wf:spendBudget',{...budget(db),id:first.id,amount:'1200'}),/reason/);
 db=apply(db,'wf:spendBudget',{...budget(db),id:first.id,amount:'1200',reason:'New monthly allowance',createdBy:'Forged actor'});
 assert.equal(db.workforce.spendBudgets[0].limitCents,120000);
 const audit=db.audit.at(-1);assert.equal(audit.actor,'Verified manager');assert.equal(audit.before.limitCents,100000);assert.equal(audit.after.limitCents,120000);
 assert.equal(db.workforce.spendBudgets[0].createdBy,'Verified manager');
 assert.throws(()=>apply(db,'wf:spendBudget',budget(db,{category:'Travel',amount:'12.345'})),/decimal/);
 });

 test('overlapping category allocations cannot double-count a store-wide or employee budget, including paused budgets',()=>{
 let db=workspace();const alex=db.employees[0].id,blair=db.employees[1].id;
 db=apply(db,'wf:spendBudget',budget(db,{employee:alex}));
 db=apply(db,'wf:spendBudget',budget(db,{name:'Blair allocation',employee:blair}));
 assert.equal(db.workforce.spendBudgets.length,2);
 assert.throws(()=>apply(db,'wf:spendBudget',budget(db,{category:'  INVENTORY  '})),/already covers/);
 const id=db.workforce.spendBudgets[0].id;
 db=apply(db,'wf:spendBudgetActive',{id,active:false,reason:'Pause alerts'});
 assert.throws(()=>apply(db,'wf:spendBudget',budget(db,{employee:alex})),/paused budgets/);
 db=apply(db,'wf:spendBudget',budget(db,{employee:alex,from:'2026-11-01',to:'2026-11-30'}));
 assert.equal(db.workforce.spendBudgets.length,3);
 });

 test('expense state transitions keep drafts separate, require review and preserve correction history',()=>{
 let db=workspace();db=addExpense(db);const id=db.workforce.spendExpenses[0].id;
 assert.equal(db.workforce.spendExpenses[0].status,'Draft');
 assert.throws(()=>apply(db,'wf:spendExpenseStatus',{id,status:'Approved',reason:'Skip submission'}),/unavailable/);
 assert.throws(()=>apply(db,'wf:spendExpenseStatus',{id,status:'Submitted',reason:''}),/reason/);
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Submitted',reason:'Review invoice'});
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Returned',reason:'Incorrect total'});
 db=apply(db,'wf:spendExpense',{...expense(db),id,amount:'30.20',reason:'Corrected invoice amount'});
 assert.equal(db.workforce.spendExpenses[0].status,'Draft');
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Submitted',reason:'Corrected'});
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Approved',reason:'Invoice verified'});
 assert.equal(spendReport(db).totals.approvedCents,3020);
 assert.throws(()=>apply(db,'wf:spendExpense',{...expense(db),id,reason:'Attempt locked edit'}),/Reopen/);
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Draft',reason:'Reopen approved record'});
 assert.equal(spendReport(db).totals.approvedCents,0);
 db=apply(db,'wf:spendExpense',{...expense(db),id,amount:'40',reason:'Reopened correction'});
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Submitted',reason:'Ready'});
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Approved',reason:'Checked'});
 db=apply(db,'wf:spendExpenseStatus',{id,status:'Voided',reason:'Duplicate supplier invoice'});
 assert.equal(spendReport(db).totals.approvedCents,0);
 assert.equal(spendReport(db).expenses[0].status,'Voided');
 assert.throws(()=>apply(db,'wf:spendExpense',{...expense(db),id,reason:'Edit voided record'}),/Voided/);
 assert.equal(db.audit.at(-1).before.amountCents,4000);assert.equal(db.audit.at(-1).after.status,'Voided');
 });

 test('actual expenses reject future dates, invalid assignments and missing required fields',()=>{
 const db=workspace();
 assert.throws(()=>addExpense(db,{date:'2026-10-27'}),/future/);
 assert.throws(()=>addExpense(db,{date:'2026-02-30'}),/valid date/);
 assert.throws(()=>addExpense(db,{amount:'12.345'}),/decimal/);
 assert.throws(()=>addExpense(db,{amount:'-1'}),/decimal/);
 assert.throws(()=>addExpense(db,{vendor:''}),/vendor/);
 assert.throws(()=>addExpense(db,{note:''}),/expense note/);
 assert.throws(()=>addExpense(db,{employee:db.employees[2].id}),/assigned/);
 });

 test('reports count approved actual and submitted pending once, with independent category/store/month breakdowns',()=>{
 let db=workspace();db=apply(db,'wf:spendBudget',budget(db));
 db=addExpense(db,{amount:'10.10'},'Approved');
 db=addExpense(db,{amount:'20.20',employee:db.employees[1].id},'Approved');
 db=addExpense(db,{amount:'5.05'},'Submitted');
 db=addExpense(db,{amount:'99'},'Draft');
 db=addExpense(db,{amount:'88'},'Returned');
 db=addExpense(db,{amount:'7.07',store:db.stores[1].id,employee:db.employees[2].id,category:'Travel'},'Approved');
 db=addExpense(db,{amount:'3.03',date:'2026-09-30',category:'Supplies'},'Approved');
 const report=spendReport(db,{from:'2026-09-01',to:'2026-10-31'});
 assert.equal(report.totals.approvedCents,4040);assert.equal(report.totals.pendingCents,505);assert.equal(report.totals.unbudgetedCents,1010);
 assert.equal(report.byCategory.reduce((n,r)=>n+r.approvedCents,0),4040);
 assert.equal(report.byStore.reduce((n,r)=>n+r.approvedCents,0),4040);
 assert.deepEqual(report.monthly.map(r=>[r.month,r.approvedCents]),[['2026-09',303],['2026-10',3737]]);
 assert.equal(report.budgets[0].approvedCents,3030);assert.equal(report.budgets[0].pendingCents,505);
 assert.equal(report.budgets[0].remainingCents,96970);
 });

 test('partial dates and employee/status filters do not change complete-period budget remaining',()=>{
 let db=workspace();db=apply(db,'wf:spendBudget',budget(db));
 db=addExpense(db,{date:'2026-10-05',amount:'200'},'Approved');
 db=addExpense(db,{date:'2026-10-20',employee:db.employees[1].id,amount:'300'},'Approved');
 db=addExpense(db,{date:'2026-10-24',amount:'100'},'Submitted');
 const partial=spendReport(db,{from:'2026-10-20',to:'2026-10-26'}).budgets[0];
 assert.equal(partial.coverage,'Partial period');assert.equal(partial.approvedCents,30000);assert.equal(partial.periodApprovedCents,50000);assert.equal(partial.periodPendingCents,10000);assert.equal(partial.remainingCents,50000);assert.equal(partial.committedRemainingCents,40000);
 const employee=spendReport(db,{from:'2026-10-01',to:'2026-10-31',employee:db.employees[0].id}).budgets[0];
 assert.equal(employee.approvedCents,20000);assert.equal(employee.periodApprovedCents,50000);assert.equal(employee.remainingCents,50000);
 const submitted=spendReport(db,{from:'2026-10-01',to:'2026-10-31',status:'Submitted'}).budgets[0];
 assert.equal(submitted.approvedCents,0);assert.equal(submitted.pendingCents,10000);assert.equal(submitted.periodApprovedCents,50000);assert.equal(submitted.remainingCents,50000);assert.equal(submitted.utilization,60);
 });

 test('budget alerts include approved plus pending commitments only for current active periods',()=>{
 let db=workspace();db=apply(db,'wf:spendBudget',budget(db,{amount:'100'}));
 db=addExpense(db,{amount:'60'},'Approved');db=addExpense(db,{amount:'20'},'Submitted');db=addExpense(db,{amount:'500'},'Draft');
 let report=spendReport(db);assert.equal(report.budgets[0].status,'Near limit');assert.equal(report.budgets[0].utilization,80);assert.equal(spendAlerts(db,NOW).length,1);assert.equal(alerts(db,NOW).filter(a=>a.kind==='Budget').length,1);
 db=addExpense(db,{amount:'30'},'Submitted');report=spendReport(db);assert.equal(report.budgets[0].status,'Over budget');assert.equal(report.budgets[0].committedRemainingCents,-1000);assert.match(spendAlerts(db,NOW)[0].text,/approved \+ submitted \$110.00/);
 assert.equal(spendAlerts(db,Date.parse('2026-11-01T18:00Z')).length,0);
 db=apply(db,'wf:spendBudgetActive',{id:db.workforce.spendBudgets[0].id,active:false,reason:'Pause notifications'});
 assert.equal(spendAlerts(db,NOW).length,0);assert.equal(spendReport(db).totals.budgetCents,10000);assert.equal(spendReport(db).budgets[0].status,'Paused');
 });

 test('zero allocations have finite reporting semantics and warn when spending is committed',()=>{
 let db=workspace();db=apply(db,'wf:spendBudget',budget(db,{amount:'0'}));assert.equal(spendReport(db).budgets[0].utilization,0);
 db=addExpense(db,{amount:'0.01'},'Submitted');const b=spendReport(db).budgets[0];assert.equal(b.utilization,null);assert.equal(b.status,'Over budget');assert.equal(b.committedRemainingCents,-1);
 });

 test('role checks protect budgets, foreign expenses and expense approval',()=>{
 let db=workspace();db=apply(db,'wf:spendBudget',budget(db));db=addExpense(db);db=addExpense(db,{employee:db.employees[1].id});db=addExpense(db,{employee:db.employees[2].id,store:db.stores[1].id});
 const own=db.workforce.spendExpenses[0],other=db.workforce.spendExpenses[1],south=db.workforce.spendExpenses[2],member={role:'Employee',stores:[db.stores[0].id],employee:db.employees[0].id},manager={role:'Manager',stores:[db.stores[0].id]};
 authorize(db,{type:'wf:spendExpense',data:expense(db)},member);authorize(db,{type:'wf:spendExpenseStatus',data:{id:own.id,status:'Submitted'}},member);
 for(const status of ['Approved','Returned','Voided','Draft'])assert.throws(()=>authorize(db,{type:'wf:spendExpenseStatus',data:{id:own.id,status}},member));
 assert.throws(()=>authorize(db,{type:'wf:spendExpense',data:{...expense(db),id:other.id}},member));
 assert.throws(()=>authorize(db,{type:'wf:spendBudget',data:budget(db)},member));
 assert.throws(()=>authorize(db,{type:'wf:spendBudgetActive',data:{id:db.workforce.spendBudgets[0].id,active:false}},member));
 assert.throws(()=>authorize(db,{type:'wf:spendExpenseStatus',data:{id:south.id,status:'Approved'}},manager));
 assert.throws(()=>authorize(db,{type:'wf:spendExpense',data:expense(db,{store:db.stores[1].id,employee:db.employees[2].id})},manager));
 authorize(db,{type:'wf:spendExpenseStatus',data:{id:own.id,status:'Approved'}},manager);
 });

 test('employee projections reveal only assigned budgets and own expenses; managers remain store scoped',()=>{
 let db=workspace();const alex=db.employees[0].id,blair=db.employees[1].id,casey=db.employees[2].id,north=db.stores[0].id,south=db.stores[1].id;
 db=apply(db,'wf:spendBudget',budget(db,{employee:alex,name:'Alex allocation'}));db=apply(db,'wf:spendBudget',budget(db,{employee:blair,name:'Blair allocation'}));db=apply(db,'wf:spendBudget',budget(db,{category:'Utilities',name:'Private store allocation'}));db=apply(db,'wf:spendBudget',budget(db,{store:south,employee:casey,name:'South allocation'}));
 db=addExpense(db,{},'Approved');db=addExpense(db,{employee:blair},'Submitted');db=addExpense(db,{store:south,employee:casey},'Approved');
 const staff=project(db,{role:'Employee',stores:[north],employee:alex});assert.deepEqual(staff.workforce.spendBudgets.map(b=>b.name),['Alex allocation']);assert.equal(staff.workforce.spendExpenses.length,1);assert.equal(staff.workforce.spendExpenses[0].employee,alex);assert.equal(staff.stores.length,1);
 const manager=project(db,{role:'Manager',stores:[north]});assert.equal(manager.workforce.spendBudgets.length,3);assert.equal(manager.workforce.spendExpenses.length,2);assert.ok(manager.workforce.spendExpenses.every(e=>e.store===north));
 assert.equal(db.workforce.spendExpenses.length,3);
 });
