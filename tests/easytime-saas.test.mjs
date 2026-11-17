import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,newRecord,calculate,cycleRange,nextRange,addDays,weekKey,importLegacy,billOccurrences,budgetSummary,paycheckSummary,timesheetCSV,validateState,categoryName,expenseCategories,categoryBudgets,categorySpending} from '../public/easytime/domain.mjs';
const shift=(start='09:00',end='17:00',breakMinutes='',paidBreak=false,manualOT='')=>({start,end,breakMinutes,paidBreak,manualOT});
test('fixed cycles, true twice-monthly periods, month lengths and transitions',()=>{for(const c of ['7','14','15','30'])assert.equal(cycleRange('2026-10-07',c).days,Number(c));assert.deepEqual(cycleRange('2026-02-20','semimonth'),{start:'2026-02-16',end:'2026-02-28',days:13,cycle:'semimonth'});assert.equal(cycleRange('2028-02-16','semimonth').days,14);assert.equal(cycleRange('2026-10-20','semimonth').days,16);assert.equal(cycleRange('2028-02-08','month').days,29);assert.equal(cycleRange('2100-02-08','month').days,28);assert.equal(nextRange(cycleRange('2026-12-01','month')).start,'2027-01-01');assert.equal(nextRange(cycleRange('2026-10-01','semimonth')).start,'2026-10-16');assert.equal(nextRange(cycleRange('2026-10-16','semimonth')).start,'2026-11-01');});
test('normal and overtime modes, no default break, paid break, explicit manual zero',()=>{const s=emptyState(),r=newRecord('2026-10-05','7','20','normal');r.entries=r.entries.map(()=>shift());assert.equal(calculate(r,[r],s.settings).pay,1120);assert.equal(calculate(r,[r],s.settings).overtime,0);r.mode='overtime';assert.equal(calculate(r,[r],s.settings).overtime,16);assert.equal(calculate(r,[r],s.settings).pay,1280);r.entries[6].manualOT='0';assert.equal(calculate(r,[r],s.settings).overtime,8);r.entries[0].breakMinutes='30';assert.equal(calculate(r,[r],s.settings).total,55.5);r.entries[0].paidBreak=true;assert.equal(calculate(r,[r],s.settings).total,56);});
test('workweeks span pay periods and calendar months without resetting overtime',()=>{const s=emptyState(),a=newRecord('2026-09-28','15','20','overtime'),b=newRecord('2026-10-01','month','20','overtime');a.entries[0]=shift('08:00','18:00');a.entries[1]=shift('08:00','18:00');a.entries[2]=shift('08:00','18:00');b.entries[0]=shift('08:00','18:00');b.entries[1]=shift('08:00','18:00');assert.equal(calculate(b,[a,b],s.settings).overtime,10);assert.equal(calculate(b,[a,b],s.settings).pay,500);assert.equal(weekKey('2026-10-01',1),'2026-09-28');s.settings.weekStart=4;assert.equal(calculate(b,[a,b],s.settings).overtime,0);});
test('overnight hours split at midnight and into the next fixed workweek',()=>{const s=emptyState(),r=newRecord('2026-10-05','14','20','overtime');r.entries[0]=shift('08:00','18:00');r.entries[1]=shift('08:00','18:00');r.entries[2]=shift('08:00','18:00');r.entries[3]=shift('08:00','18:00');r.entries[6]=shift('22:00','06:00');const t=calculate(r,[r],s.settings);assert.equal(t.total,48);assert.equal(t.overtime,2);assert.equal(t.pay,980);r.entries[6].breakMinutes='30';assert.equal(calculate(r,[r],s.settings).total,47.5);});
test('effective rates and multipliers produce consistent CSV and gross estimates',()=>{const s=emptyState(),r=newRecord('2026-10-05','7','20','normal');r.entries[0]=shift();r.entries[1]=shift();s.settings.rateHistory=[{effective:'2026-10-06',rate:'25'}];assert.equal(calculate(r,[r],s.settings).pay,360);const csv=timesheetCSV(r,s);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"360.00"'));s.profile.fullName='=HYPERLINK("bad")';assert.ok(timesheetCSV(r,s).includes("'=HYPERLINK"));});
test('invalid times, excess breaks, and excess manual overtime are excluded',()=>{const s=emptyState(),r=newRecord('2026-10-05','7','20','overtime');r.entries[0]=shift('09:00','09:00');r.entries[1]=shift('09:00','17:00','600');r.entries[2]=shift('09:00','17:00','','false','9');r.entries[3]=shift('99:00','17:00');assert.equal(calculate(r,[r],s.settings).errors.length,4);assert.equal(calculate(r,[r],s.settings).pay,0);assert.throws(()=>timesheetCSV(r,s));});
test('paycheck gross comparison does not confuse deductions with missing gross pay',()=>{const s=emptyState(),r=newRecord('2026-10-05','7','20');r.entries[0]=shift();const p={id:'p',payDate:'2026-10-14',recordId:r.id,grossCents:15000,deductions:[{name:'Tax',cents:3000}]};const result=paycheckSummary(p,r,[r],s.settings);assert.equal(result.expected,16000);assert.equal(result.difference,-1000);assert.equal(result.net,12000);});
test('monthly bills return to the original day after a short month and paid bills are not reserved twice',()=>{const s=emptyState();s.bills=[{id:'b',name:'Phone',cents:5000,nextDue:'2026-01-31',frequency:'monthly',active:true}];assert.deepEqual(billOccurrences(s.bills,'2026-01-01','2026-04-30').map(b=>b.occurrence),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);s.paychecks=[{id:'p',recordId:'x',payDate:'2026-02-20',grossCents:100000,deductions:[{name:'Tax',cents:20000}]}];let budget=budgetSummary(s,'2026-02-16','2026-02-28');assert.equal(budget.available,75000);s.expenses=[{id:'e',date:'2026-02-28',cents:5000,category:'Utilities',note:'Phone',billId:'b',billDate:'2026-02-28'}];budget=budgetSummary(s,'2026-02-16','2026-02-28');assert.equal(budget.reserved,0);assert.equal(budget.available,75000);});
test('legacy fixed periods, month periods, optional profile rate/id and import deduplication',()=>{const s=emptyState();const raw={version:2,records:[{periodStart:'2026-10-01',periodDays:30,rate:'20',mode:'normal',entries:[shift()]},{periodStart:'2026-10-01',periodDays:31,cycle:'month',rate:'20',mode:'overtime',entries:[shift()]}]};const p={version:1,profile:{fullName:'Test',employeeId:'',company:'',rate:'',cycleDays:30,email:''}};const result=importLegacy(raw,p,s);assert.equal(result.imported,2);assert.equal(result.state.records[0].cycle,'30');assert.equal(result.state.records[1].entries.length,31);assert.equal(result.state.profile.employeeId,'');assert.equal(result.state.settings.cycle,'month');validateState(result.state);assert.equal(importLegacy(raw,p,result.state).imported,0);});
test('backup schema rejects invalid amounts, over-deductions, hostile shape and oversized lists',()=>{const s=emptyState();validateState(s);s.expenses=[{id:'x',date:'2026-10-07',cents:-1,note:'',category:'Food'}];assert.throws(()=>validateState(s));s.expenses=[];s.paychecks=[{id:'p',recordId:'r',payDate:'2026-10-07',grossCents:100,deductions:[{name:'Tax',cents:101}]}];assert.throws(()=>validateState(s));s.paychecks=[];s.settings.timeZone='not/a-zone';assert.throws(()=>validateState(s));});

test('custom calendar ranges are inclusive, bounded, distinct and keep their length for the next period',()=>{
 const range=cycleRange('2028-02-28','custom','2028-03-02');
 assert.deepEqual(range,{start:'2028-02-28',end:'2028-03-02',days:4,cycle:'custom'});
 assert.deepEqual(nextRange(range),{start:'2028-03-03',end:'2028-03-06',days:4,cycle:'custom'});
 assert.equal(cycleRange('2026-12-31','custom','2026-12-31').days,1);
 assert.equal(cycleRange('2028-01-01','custom','2028-12-31').days,366);
 assert.throws(()=>cycleRange('2026-10-09','custom','2026-10-08'));
 assert.throws(()=>cycleRange('2026-10-08','custom','2026-02-30'));
 assert.throws(()=>cycleRange('2026-10-08','custom'));
 assert.throws(()=>cycleRange('2026-01-01','custom','2027-01-02'));
 const a=newRecord('2026-12-30','custom','','normal','2027-01-05'),b=newRecord('2026-12-30','custom','','normal','2027-01-06');
 assert.notEqual(a.id,b.id);assert.equal(a.entries.length,7);assert.equal(b.entries.length,8);
 const state=emptyState();state.records=[a,b,newRecord('2026-10-01','15','20')];
 assert.equal(validateState(JSON.parse(JSON.stringify(state))).records[0].end,'2027-01-05');
 const bad=structuredClone(state);bad.records[0].end='2027-01-06';assert.throws(()=>validateState(bad));
});
test('custom periods preserve workweek overtime, CSV dates, paycheck comparison and inclusive spending bounds',()=>{
 const state=emptyState(),previous=newRecord('2026-09-28','custom','20','overtime','2026-09-29'),record=newRecord('2026-09-30','custom','20','overtime','2026-10-06');
 previous.entries=previous.entries.map(()=>shift());record.entries=record.entries.map(()=>shift());state.records=[previous,record];
 const totals=calculate(record,state.records,state.settings);assert.equal(totals.total,56);assert.equal(totals.overtime,16);assert.equal(totals.pay,1280);
 assert.ok(timesheetCSV(record,state).includes('"Period","2026-09-30","2026-10-06"'));
 const check={id:'custom-check',recordId:record.id,payDate:'2026-10-06',grossCents:128000,deductions:[{name:'Tax',cents:28000}]};state.paychecks=[check];
 assert.equal(paycheckSummary(check,record,state.records,state.settings).difference,0);
 state.expenses=[['before','2026-09-29',50000],['start','2026-09-30',5000],['end','2026-10-06',7000],['after','2026-10-07',50000]].map(([id,date,cents])=>({id,date,cents,category:'Food',note:''}));
 const balance=budgetSummary(state,totals.range.start,totals.range.end);assert.equal(balance.received,100000);assert.equal(balance.expenses,12000);assert.equal(balance.available,88000);
 validateState(state);
});
test('custom categories are normalized, unique, bounded and safe; earlier backups remain usable',()=>{
 const state=emptyState();delete state.customCategories;delete state.cycleBudgets;state.budgets={Food:25000};
 validateState(state);assert.ok(expenseCategories(state).includes('Food'));
 assert.equal(categoryName('  Pets   & vet  ',expenseCategories(state)),'Pets & vet');
 state.customCategories=['Pets & vet'];
 state.expenses=[{id:'vet',date:'2026-10-08',cents:5250,category:'Pets & vet',note:''}];validateState(state);
 for(const name of ['','food','PETS & VET','constructor','__proto__','prototype','bad\nname','x'.repeat(61)])assert.throws(()=>categoryName(name,expenseCategories(state)));
 for(const names of [['Food'],['Pets','pets'],[' Pets '],['__proto__'],Array.from({length:101},(_,i)=>'Category '+i)]){const bad=structuredClone(state);bad.customCategories=names;assert.throws(()=>validateState(bad));}
 const bad=structuredClone(state);bad.expenses[0].category='Unknown';assert.throws(()=>validateState(bad));
});
test('budgets keep independent cycle limits, inclusive category spending and legacy starting limits',()=>{
 const state=emptyState(),a=newRecord('2026-10-01','15','20'),b=newRecord('2026-10-16','15','20');state.records=[a,b];state.customCategories=['Pets & vet'];state.budgets={Food:30000};
 assert.equal(categoryBudgets(state,a).Food,30000);
 state.cycleBudgets={[a.id]:{Food:10000,'Pets & vet':5000},[b.id]:{Food:20000,'Pets & vet':0}};
 state.expenses=[['before','2026-09-30',90000,'Pets & vet'],['first','2026-10-01',3500,'Pets & vet'],['last','2026-10-15',2500,'Pets & vet'],['next','2026-10-16',1000,'Pets & vet']].map(([id,date,cents,category])=>({id,date,cents,category,note:''}));
 const pets=categorySpending(state,a).find(c=>c.name==='Pets & vet');assert.deepEqual(pets,{name:'Pets & vet',spent:6000,limit:5000,remaining:-1000});
 assert.equal(categorySpending(state,b).find(c=>c.name==='Pets & vet').spent,1000);assert.equal(categorySpending(state,b).find(c=>c.name==='Pets & vet').remaining,null);
 assert.equal(categoryBudgets(state,b).Food,20000);state.cycleBudgets[a.id].Food=11000;assert.equal(categoryBudgets(state,b).Food,20000);
 validateState(JSON.parse(JSON.stringify(state)));
 for(const limits of [{Food:-1},{Food:1.5},{Food:100000001},{Unknown:1000},[]]){const bad=structuredClone(state);bad.cycleBudgets[a.id]=limits;assert.throws(()=>validateState(bad));}
 const orphan=structuredClone(state);orphan.cycleBudgets.missing={Food:1000};assert.throws(()=>validateState(orphan));
});
test('saved category ordering includes every category and keeps financial values attached to names',()=>{
 const state=emptyState(),record=newRecord('2026-10-01','15','20');state.records=[record];state.customCategories=['Pets & vet'];state.cycleBudgets={[record.id]:{Food:20000,'Pets & vet':5000}};
 state.expenses=[{id:'qa-food',date:'2026-10-08',category:'Food',cents:15000,note:''},{id:'qa-vet',date:'2026-10-08',category:'Pets & vet',cents:7500,note:''}];
 const original=categorySpending(state,record);state.categoryOrder=['Pets & vet','Food'];validateState(state);
 assert.deepEqual(expenseCategories(state).slice(0,3),['Pets & vet','Food','Housing']);assert.equal(expenseCategories(state).length,10);
 const reordered=categorySpending(state,record);for(const c of original)assert.deepEqual(reordered.find(r=>r.name===c.name),c);
 state.customCategories.push('Travel');assert.equal(expenseCategories(state).at(-1),'Travel');
 const backup=JSON.parse(JSON.stringify(state));validateState(backup);assert.equal(expenseCategories(backup)[0],'Pets & vet');
 for(const order of [['Food','Food'],['Unknown'],['__proto__'],null,{},['food']]){const bad=structuredClone(state);bad.categoryOrder=order;assert.throws(()=>validateState(bad));}
 delete backup.categoryOrder;validateState(backup);assert.equal(expenseCategories(backup)[0],'Housing');
});
