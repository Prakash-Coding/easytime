import assert from 'node:assert/strict';
import { calculateSheet, dayDate, emptyEntries, validDate } from '../lib/timesheet.ts';
let checks = 0;
const equal = (a,b) => { assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`); checks++; };
const make = (hours,count=1) => { const rows=emptyEntries(); for(let i=0;i<count;i++) rows[i]={start:'08:00',end:`${String(8+hours).padStart(2,'0')}:00`,breakMinutes:'',manualOT:''}; return rows; };
let rows=emptyEntries(), result=calculateSheet(rows,'normal','20');
equal(result.total,0); equal(result.completed,0); assert.equal(rows.every(r=>r.breakMinutes===''),true); checks++;
rows=make(8); result=calculateSheet(rows,'normal','20'); equal(result.total,8); equal(result.pay,160);
rows[0].breakMinutes='30'; result=calculateSheet(rows,'normal','20'); equal(result.total,7.5); equal(result.pay,150);
rows[0]={start:'22:30',end:'06:15',breakMinutes:'15',manualOT:''}; result=calculateSheet(rows,'normal','20'); equal(result.total,7.5); assert.equal(result.rows[0].overnight,true); checks++;
rows=make(8,6); result=calculateSheet(rows,'normal','20'); equal(result.regular,48); equal(result.overtime,0); equal(result.pay,960);
result=calculateSheet(rows,'overtime','20'); equal(result.regular,40); equal(result.overtime,8); equal(result.pay,1040);
rows=make(8,15); result=calculateSheet(rows,'overtime','20'); equal(result.total,120); equal(result.regular,88); equal(result.overtime,32); equal(result.pay,2720); equal(result.completed,15); equal(result.rows[7].overtime,0); equal(result.rows[14].overtime,0);
rows=make(8); rows[0].manualOT='2'; result=calculateSheet(rows,'overtime','20'); equal(result.total,8); equal(result.regular,6); equal(result.overtime,2); equal(result.pay,180); result=calculateSheet(rows,'normal','20'); equal(result.overtime,0); equal(result.pay,160);
rows=make(8,6); rows[5].manualOT='0'; result=calculateSheet(rows,'overtime','20'); equal(result.overtime,0); equal(result.pay,960);
rows[5].manualOT='4'; result=calculateSheet(rows,'overtime','20'); equal(result.overtime,4); equal(result.pay,1000);
for (const [field,value] of [['breakMinutes','-1'],['breakMinutes','481'],['breakMinutes','1.5'],['manualOT','9'],['manualOT','-1'],['end','08:00'],['end',''],['start','25:00']]) { rows=make(8); rows[0][field]=value; result=calculateSheet(rows,'overtime','20'); equal(result.total,0); equal(result.completed,0); assert.ok(result.rows[0].errors.length>0); checks++; }
rows=make(8); rows[0].breakMinutes='480'; result=calculateSheet(rows,'overtime','20'); equal(result.total,0); equal(result.completed,1);
for(const rate of ['', '-1','Infinity','abc']) { assert.equal(calculateSheet(make(8),'normal',rate).rateValid,false); checks++; }
equal(calculateSheet(make(8),'normal','0').pay,0);
rows=make(8); rows[0].end='08:01'; equal(calculateSheet(rows,'normal','20').pay,1/3);
assert.equal(dayDate('2026-12-25',14).toISOString().slice(0,10),'2027-01-08'); checks++;
assert.equal(dayDate('2028-02-23',6).toISOString().slice(0,10),'2028-02-29'); checks++;
for(const date of ['2026-02-30','', '9999-12-18']) { assert.equal(validDate(date),false); checks++; }
console.log(`${checks} calculation and date assertions passed.`);
