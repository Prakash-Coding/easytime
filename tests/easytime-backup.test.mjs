import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,newRecord} from '../public/easytime/domain.mjs';
import {accountBackupHTML,accountBackupJSON,readAccountBackup,MAX_BACKUP_FILE_BYTES} from '../public/easytime/backup.mjs';

const exportedAt='2026-10-09T14:00:00.000Z';
function sample(){
 const state=emptyState(),a=newRecord('2026-10-01','15','20'),b=newRecord('2026-10-16','custom','20','overtime','2026-10-17');
 a.entries[0]={start:'09:00',end:'17:00',breakMinutes:'30',paidBreak:false,manualOT:''};
 b.entries[0]={start:'09:00',end:'17:00',breakMinutes:'',paidBreak:false,manualOT:'1'};
 state.profile.fullName='Sample employee';state.records=[a,b];state.customCategories=['Pets & vet'];state.categoryOrder=['Pets & vet','Food'];
 state.cycleBudgets={[a.id]:{Food:10000,'Pets & vet':2000},[b.id]:{Food:20000}};
 state.paychecks=[{id:'sample-check',recordId:a.id,payDate:'2026-10-15',grossCents:18000,deductions:[{name:'Tax',cents:3000}]}];
 state.expenses=[{id:'food',date:'2026-10-08',category:'Food',cents:5000,note:'Groceries'},{id:'vet',date:'2026-10-08',category:'Pets & vet',cents:2500,note:'Vet visit'}];
 state.bills=[{id:'phone',name:'Phone',cents:4000,nextDue:'2026-10-10',frequency:'monthly',active:true}];state.dismissed=['shift:2026-10-08'];
 return state;
}
test('readable backup uses clear labels, AM/PM, correct money, hours and independent cycle budgets',()=>{
 const state=sample(),before=structuredClone(state),html=accountBackupHTML(state,{exportedAt,unsaved:true});
 for(const text of ['Your records, in plain language.','Your employee profile','Your pay-cycle records','Your paychecks','Your expenses','Your bills','Your daily timesheets and cycle budgets','Your pay settings','9:00 AM','5:00 PM','30 minutes · unpaid','$180.00','Tax: $30.00','$150.00','$75.00','$5.00 over budget','$200.00 remaining','7.50','1.00','$170.00','not yet saved to the cloud','Manual overtime','Pets &amp; vet'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('@media(max-width:650px)'));assert.ok(html.includes('@media print'));assert.deepEqual(state,before);
});
test('readable and earlier JSON backups round-trip every record, category order, setting and optional field',()=>{
 const state=sample();
 assert.deepEqual(readAccountBackup(accountBackupHTML(state,{exportedAt})),state);
 assert.deepEqual(readAccountBackup(accountBackupJSON(state,{exportedAt})),state);
 assert.deepEqual(readAccountBackup(JSON.stringify({state})),state);
 assert.deepEqual(readAccountBackup('\uFEFF'+JSON.stringify(state)),state);
});
test('readable backup safely escapes user entries and restores their exact text without executing HTML',()=>{
 const state=sample(),note='</script><img src=x onerror=alert(1)>&"\u2028\u2029';
 state.profile.fullName='<script>alert("name")</script>';state.expenses[0].note=note;
 const html=accountBackupHTML(state,{exportedAt});
 assert.equal(html.split('<script type="application/json" id="easytime-backup-data">').length-1,1);
 assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>alert'));
 assert.ok(html.includes('&lt;img src=x'));assert.ok(html.includes('\\u003c/script\\u003e'));assert.ok(html.includes("script-src 'none'"));
 assert.deepEqual(readAccountBackup(html),state);
});
test('invalid or unrelated pages, duplicate restore data, damaged payloads and oversized files are rejected',()=>{
 assert.throws(()=>readAccountBackup('<!doctype html><h1>A printed report</h1>'),/not a restorable EasyTime backup/);
 assert.throws(()=>readAccountBackup('not JSON'),/could not be read/);
 assert.throws(()=>readAccountBackup(JSON.stringify({format:'Other app',state:sample()})),/EasyTime account backup/);
 const html=accountBackupHTML(sample(),{exportedAt}),marker='<script type="application/json" id="easytime-backup-data">';
 assert.throws(()=>readAccountBackup(html+marker+'{}</script>'),/not a restorable/);
 const broken=html.replace('"version":3','"version":999');assert.throws(()=>readAccountBackup(broken),/not an EasyTime account/);
 assert.throws(()=>readAccountBackup(' '.repeat(MAX_BACKUP_FILE_BYTES+1)),/smaller than 32 MB/);
});
test('empty accounts, negative recorded balance and invalid draft shifts have readable explanations',()=>{
 const empty=accountBackupHTML(emptyState(),{exportedAt});
 assert.ok(empty.includes('No pay-cycle records yet.'));assert.ok(empty.includes('No expenses recorded yet.'));assert.ok(!empty.includes('NaN'));assert.ok(!empty.includes('undefined'));
 const state=sample();state.expenses[0].cents=20000;state.records[0].entries[0].breakMinutes='999';
 const html=accountBackupHTML(state,{exportedAt});
 assert.ok(html.includes('-$75.00'));assert.ok(html.includes('Entries to check'));assert.ok(html.includes('Break must fit within the shift.'));
 assert.deepEqual(readAccountBackup(html),state);
});

