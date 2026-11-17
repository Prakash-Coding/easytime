import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spendReport} from '../public/easytime/spend-domain.mjs';
import {spendReportRows,spendCsv,spendPdfReport} from '../public/easytime/spend-reports.mjs';

function fixture(){return {
 stores:[{id:'a',name:'Downtown'},{id:'b',name:'Uptown'}],employees:[{id:'alex',name:'Alex'},{id:'blair',name:'Blair'}],
 workforce:{spendBudgets:[{id:'inventory',name:'Inventory plan',store:'a',category:'inventory',employee:'',from:'2026-10-01',to:'2026-10-31',limitCents:100000,alertPercent:80,active:true},{id:'utilities',name:'Utilities plan',store:'b',category:'utilities',employee:'',from:'2026-10-01',to:'2026-10-31',limitCents:50000,alertPercent:80,active:true}],spendExpenses:[
 {id:'prior',date:'2026-10-05',store:'a',employee:'alex',category:'inventory',amountCents:25000,status:'Approved',vendor:'Previous supplier',note:'Prior period context'},
 {id:'current',date:'2026-10-20',store:'a',employee:'alex',category:'inventory',amountCents:30000,status:'Approved',vendor:'=SUM(1,2)',note:'  @danger'},
 {id:'pending',date:'2026-10-22',store:'a',employee:'alex',category:'inventory',amountCents:10000,status:'Submitted',vendor:'\t+danger',note:'Pending order reference'},
 {id:'draft',date:'2026-10-21',store:'a',employee:'alex',category:'inventory',amountCents:500000,status:'Draft',vendor:'Draft',note:'Ignored by actual/pending'},
 {id:'void',date:'2026-10-20',store:'a',employee:'alex',category:'inventory',amountCents:40000,status:'Voided',vendor:'Voided',note:'Ignored by actual/pending'},
 {id:'utility',date:'2026-10-20',store:'b',employee:'blair',category:'utilities',amountCents:10000,status:'Approved',vendor:'Utility supplier',note:'Paid bill'},
 {id:'unbudgeted',date:'2026-10-20',store:'a',employee:'alex',category:'rent',amountCents:4000,status:'Approved',vendor:'Landlord',note:'No matching budget'}
 ]}
};}
const filters={from:'2026-10-15',to:'2026-10-31'};
function csvRows(text){const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\r'&&text[i+1]==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=ch;}row.push(cell);rows.push(row);return rows;}

test('report exports preserve selected-date actuals and complete-budget-period remaining',()=>{
 const db=fixture(),report=spendReport(db,filters),rows=spendReportRows(db,filters),value=label=>rows.find(row=>row[0]===label)?.[1];
 assert.equal(report.totals.approvedCents,44000);
 assert.equal(value('Approved actual spending'),440);
 assert.equal(value('Submitted pending commitments'),100);
 assert.equal(value('Approved spending without a budget'),40);
 assert.equal(value('Full-period budget limits'),1500);
 assert.equal(value('Remaining across complete budget periods'),850);
 const header=rows.findIndex(row=>row[0]==='Budget'&&row[2]==='Category'),inventory=rows[header+1];
 assert.deepEqual(inventory.slice(0,11),['Inventory plan','Downtown','inventory','Store team','2026-10-01','2026-10-31',1000,300,100,450,350]);
 assert.equal(inventory[13],'Partial period');
 assert.ok(rows.some(row=>row[0]==='Complete budget-period context - independent of selected-date actual totals'));
 assert.ok(rows.some(row=>row[0]==='Inventory plan'&&row[2]==='2026-10-01'&&row[5]===550&&row[6]===100));
 assert.ok(rows.some(row=>row[0]==='Notes'&&row[1].includes('limits are not prorated')));
 assert.ok(rows.some(row=>row[0]==='Notes'&&row[1].includes('each matching expense once')));
});

test('status and employee scopes are visible and reporting matches the shared domain',()=>{
 const db=fixture(),selected={...filters,store:'a',employee:'alex',category:'INVENTORY',status:'Submitted'},report=spendReport(db,selected),rows=spendReportRows(db,selected);
 assert.deepEqual(rows.find(row=>row[0]==='Store'),['Store','Downtown']);
 assert.deepEqual(rows.find(row=>row[0]==='Employee'),['Employee','Alex']);
 assert.deepEqual(rows.find(row=>row[0]==='Category'),['Category','inventory']);
 assert.deepEqual(rows.find(row=>row[0]==='Expense status'),['Expense status','Submitted']);
 assert.equal(rows.find(row=>row[0]==='Approved actual spending')[1],report.totals.approvedCents/100);
 assert.equal(rows.find(row=>row[0]==='Submitted pending commitments')[1],100);
 assert.equal(rows.find(row=>row[0]==='Remaining across complete budget periods')[1],450);
 const detail=rows.slice(rows.findIndex(row=>row[0]==='Expense detail - selected filters')+2);
 assert.equal(detail.length,1);assert.equal(detail[0][8],'pending');
 assert.ok(rows.some(row=>row[0]==='Notes'&&row[1].includes('view filters do not change this period context')));
});

test('CSV preserves quotes, newlines and amounts while neutralizing formula-leading strings',()=>{
 const db=fixture();db.workforce.spendExpenses.find(row=>row.id==='unbudgeted').note='Line 1, "quoted"\nLine 2';
 const rows=csvRows(spendCsv(db,filters));
 const current=rows.find(row=>row[8]==='current'),pending=rows.find(row=>row[8]==='pending'),unbudgeted=rows.find(row=>row[8]==='unbudgeted');
 assert.equal(current[4],"'=SUM(1,2)");assert.equal(current[7],"'  @danger");assert.equal(pending[4],"'\t+danger");
 assert.equal(unbudgeted[7],'Line 1, "quoted"\nLine 2');assert.equal(current[5],'300');
 assert.equal(rows.find(row=>row[0]==='Approved actual spending')[1],'440');
 assert.equal(rows.find(row=>row[0]==='Remaining across complete budget periods')[1],'850');
});

test('PDF includes the financial scope and paginates long expense notes',async()=>{
 const db=fixture();for(let i=0;i<24;i++)db.workforce.spendExpenses.push({id:'long-'+i,date:'2026-10-24',store:'a',employee:'alex',category:'maintenance',amountCents:1,status:'Returned',vendor:'W'.repeat(120),note:'Long expense detail '.repeat(60)});
 const blob=spendPdfReport(db,filters),text=await blob.text();assert.equal(blob.type,'application/pdf');assert.ok(text.startsWith('%PDF-1.4'));
 assert.ok(text.includes('BUDGETS & SPENDING'));assert.ok(text.includes('$440.00'));assert.ok(text.includes('Complete budget-period context'));
 assert.ok(text.includes('Manual expense reporting; no card or supplier payments.'));
 const count=Number(text.match(/\/Type \/Pages \/Kids \[[\s\S]*?\] \/Count (\d+)/)?.[1]);assert.ok(count>2);assert.equal((text.match(/\/Type \/Page \/Parent/g)||[]).length,count);
 assert.ok(text.includes('startxref'));assert.ok(text.trimEnd().endsWith('%%EOF'));
});
