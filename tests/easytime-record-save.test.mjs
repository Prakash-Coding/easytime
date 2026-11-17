import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as domain from '../public/easytime/domain.mjs';
import * as backup from '../public/easytime/backup.mjs';

const appSource=fs.readFileSync(new URL('../public/easytime/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\nboot\(\);\s*$/,'');
const offlineSource=fs.readFileSync(new URL('../public/easytime/calculator.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
const entered=()=>({...domain.blankEntry(),start:'08:00',end:'17:00',breakMinutes:'30',manualOT:'2'});
function fixture(){const state=domain.emptyState(),record=domain.newRecord('2026-10-01','15','22','overtime');record.entries[0]=entered();state.records=[record];state.profile.fullName='Test employee';return state;}
function nodes(){const map=new Map();let focused='';function get(id){if(!map.has(id)){const node={id,textContent:'',innerHTML:'',className:'',value:'',hidden:false,disabled:false,open:false,attributes:{},addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},focus(){focused=id;}};node.classList={contains:c=>node.className.split(' ').includes(c),toggle(){}};map.set(id,node);}return map.get(id);}return {get,map,focused:()=>focused};}
function cloud(initial=fixture(),storage=new Map(),owner='test-account'){
 const dom=nodes(),buttons=[dom.get('save-top'),dom.get('save-bottom')],writes=[];
 let server=structuredClone(initial),revision=0;
 const timeGroups=[];
 const context=vm.createContext({...domain,...backup,fixture:initial,structuredClone,console,crypto:webcrypto,URLSearchParams,Blob,URL,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},document:{getElementById:dom.get,querySelectorAll:s=>s==='[data-action="save-record"]'?buttons:s==='#view [data-time-group]'?timeGroups:[],querySelector:()=>null,addEventListener(){},visibilityState:'visible'},window:{addEventListener(){},scrollTo(){}},location:{protocol:'https:',hash:'#timesheet',search:'',pathname:'/easytime/index.html'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 context.fetch=async (url,options)=>{if(options?.method==='PUT'){const payload=JSON.parse(options.body);writes.push(payload);if(context.writeHook)return context.writeHook(payload);server=structuredClone(payload.state);revision++;return {ok:true,json:async()=>({revision,updatedAt:new Date().toISOString()})};}return {ok:true,json:async()=>({state:structuredClone(server),revision,user:{id:owner,name:'Test employee',email:'test@example.invalid',provider:'chatgpt'}})};};
 vm.runInContext(appSource,context);
 vm.runInContext(`state=structuredClone(fixture);active=state.records[0];user={id:${JSON.stringify(owner)},name:'Test employee',email:'test@example.invalid',provider:'chatgpt'};refreshReminders=()=>{};route();`,context);
 return {context,dom,buttons,writes,storage,timeGroups,run:code=>vm.runInContext(code,context),snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify({state,active,dirty,recordSaveBusy,conflict})',context)),save:()=>vm.runInContext("action({target:{closest:()=>({dataset:{action:'save-record'}})}})",context)};
}
test('Save record stores the complete snapshot before clearing fields and totals',async()=>{
 const h=cloud(),original=structuredClone(fixture().records[0]);await h.save();const result=h.snapshot();
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].state.records.length,1);assert.ok(h.writes[0].state.records[0].savedAt);
 assert.deepEqual(result.state.records[0].entries,original.entries);assert.equal(result.active.start,'2026-10-16');assert.equal(result.active.rate,'22');assert.equal(result.active.mode,'overtime');assert.equal(result.active.savedAt,null);
 assert.ok(result.active.entries.every(e=>e.start===''&&e.end===''&&e.breakMinutes===''&&e.manualOT===''&&!e.paidBreak));
 const totals=domain.calculate(result.active,result.state.records,result.state.settings);assert.equal(totals.total,0);assert.equal(totals.pay,0);assert.equal(totals.completed,0);
 assert.match(h.dom.get('view').innerHTML,/0 of 15 days/);assert.match(h.dom.get('view').innerHTML,/\$0\.00/);assert.equal(h.dom.focused(),'t0-start-h');assert.equal(result.recordSaveBusy,false);assert.ok(h.buttons.every(b=>!b.disabled));
 assert.deepEqual(Object.keys(JSON.parse(h.storage.get('easytimeFreshDraft:test-account'))).sort(),['cycle','mode','rate','start']);
 h.run('selectRecord(state.records[0]);route();');assert.equal(h.snapshot().active.entries[0].breakMinutes,'30');assert.match(h.dom.get('view').innerHTML,/1 of 15 days/);
});
test('Fresh periods keep calendar rules and avoid existing or overlapping records',()=>{
 for(const [cycle,start,end,expected,days] of [['7','2026-12-25',null,'2027-01-01',7],['14','2026-10-01',null,'2026-10-15',14],['15','2026-10-01',null,'2026-10-16',15],['month','2028-01-01',null,'2028-02-01',29],['semimonth','2028-02-16',null,'2028-03-01',15],['custom','2026-12-29','2027-01-02','2027-01-03',5]]){
  const old=domain.newRecord(start,cycle,'0','normal',end),next=domain.freshRecordAfter(old,[old]);assert.equal(next.start,expected);assert.equal(next.entries.length,days);assert.equal(next.rate,'0');assert.equal(next.mode,'normal');assert.equal(domain.calculate(next,[old]).total,0);
 }
 const state=fixture(),next=domain.newRecord('2026-10-16','15','25');next.entries[0]=entered();const overlap=domain.newRecord('2026-10-31','7','30');overlap.entries[0]=entered();state.records.push(next,overlap);
 const before=structuredClone(state),fresh=domain.freshRecordAfter(state.records[0],state.records);assert.equal(fresh.start,'2026-11-15');assert.equal(domain.calculate(fresh,state.records).pay,0);assert.deepEqual(state,before);
});
for(const failure of ['offline',409,503])test('A '+failure+' save failure retains the entered sheet and re-enables both buttons',async()=>{
 const h=cloud(),before=h.snapshot().active;h.context.writeHook=async()=>{if(failure==='offline')throw new Error('Network unavailable');return {ok:false,status:failure,json:async()=>({error:'Save refused'})};};await h.save();const result=h.snapshot();
 assert.equal(result.active.id,before.id);assert.deepEqual(result.active.entries,before.entries);assert.equal(result.dirty,true);assert.equal(result.conflict,failure===409);assert.equal(result.recordSaveBusy,false);assert.ok(h.buttons.every(b=>!b.disabled));assert.match(h.dom.get('toast').textContent,/entries are still here/);assert.equal(h.storage.has('easytimeFreshDraft:test-account'),false);
});
test('Repeated clicks do not create extra saves, and late edits finish saving before clearing',async()=>{
 const h=cloud();let release;h.context.writeHook=payload=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({revision:h.writes.length,updatedAt:new Date().toISOString()})});});
 const pending=h.save();assert.equal(h.writes.length,1);assert.ok(h.buttons.every(b=>b.disabled&&b.textContent==='Saving…'));await h.save();assert.equal(h.writes.length,1);
 h.run("active.entries[1]={...blankEntry(),start:'09:00',end:'10:00'};putActive();");h.context.writeHook=async()=>({ok:true,json:async()=>({revision:h.writes.length,updatedAt:new Date().toISOString()})});release();await pending;
 assert.equal(h.writes.length,2);assert.equal(h.writes[1].state.records[0].entries[1].start,'09:00');assert.equal(h.snapshot().state.records[0].entries[1].end,'10:00');assert.equal(h.snapshot().active.entries[1].start,'');
});
test('Switching to another existing record while saving does not clear that record',async()=>{
 const state=fixture(),other=domain.newRecord('2026-09-01','7','20');other.entries[0]=entered();state.records.push(other);const h=cloud(state);let release;
 h.context.writeHook=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({revision:1,updatedAt:new Date().toISOString()})});});const pending=h.save();h.run('selectRecord(state.records[1]);route();');release();await pending;
 assert.equal(h.snapshot().active.id,other.id);assert.deepEqual(h.snapshot().active.entries,other.entries);
});
test('A blank next-period draft survives reload and is isolated to its signed-in account',async()=>{
 const h=cloud();await h.save();const fresh=h.snapshot().active;await h.run('boot()');assert.equal(h.snapshot().active.id,fresh.id);assert.equal(h.snapshot().active.mode,'overtime');assert.equal(h.snapshot().active.entries[0].start,'');assert.equal(h.snapshot().state.records.length,1);
 const other=cloud(h.snapshot().state,h.storage,'other-account');await other.run('boot()');assert.equal(other.snapshot().active.id,h.snapshot().state.records[0].id);assert.equal(other.snapshot().active.entries[0].start,'08:00');
});
test('Empty or invalid timesheets are retained and never sent to the server',async()=>{
 for(const input of [domain.blankEntry(),{...entered(),breakMinutes:'1000'},{...entered(),end:''}]){const state=fixture();state.records[0].entries[0]=input;const h=cloud(state);await h.save();assert.equal(h.writes.length,0);assert.deepEqual(h.snapshot().active.entries[0],input);assert.equal(h.snapshot().active.savedAt,null);assert.match(h.dom.get('toast').textContent,/valid shift/);}
});
test('A partially typed clock time is kept on screen until hours, minutes and AM/PM are complete',async()=>{
 const h=cloud(),hours=h.dom.get('partial-hours'),minutes=h.dom.get('partial-minutes'),meridiem=h.dom.get('partial-ampm');hours.value='09';hours.select=()=>{};
 h.timeGroups.push({querySelector:s=>s.includes('hours')?hours:s.includes('minutes')?minutes:meridiem});await h.save();assert.equal(h.writes.length,0);assert.equal(hours.value,'09');assert.equal(h.dom.focused(),'partial-hours');assert.match(h.dom.get('toast').textContent,/Complete hours/);assert.equal(h.snapshot().active.start,'2026-10-01');
});
function offline({cycle=15,start='2026-10-01',saved=[],blocked=false}={}){
 const dom=nodes(),storage=new Map();dom.get('period-start').value=start;dom.get('hourly-rate').value='22';
 const region=(a,b)=>offlineSource.slice(offlineSource.indexOf(a),offlineSource.indexOf(b,offlineSource.indexOf(a)));
 const context=vm.createContext({console,structuredClone,document:{getElementById:dom.get,querySelector:()=>null},window:{confirm:()=>{throw new Error('Unexpected discard confirmation');}},localStorage:{setItem:(k,v)=>{if(blocked)throw new Error('Storage full');storage.set(k,v);}},money:value=>'$'+value.toFixed(2),dateFormat:date=>date?.toISOString().slice(0,10)??'',fixtureInputs:[{start:'08:00',end:'17:00',breakMinutes:'30',manualOT:'2'}],fixtureSaved:saved,focusTimePart:(id,part)=>dom.get(id+'-'+part).focus(),loadEmployeeProfile(){},employeeSnapshot:p=>p,renderEmployeeStrip(){},updateCycleLabels(){},renderSavedRecords(){}});
 vm.runInContext(region('let DAYS','const $ ='),context);
 vm.runInContext(`DAYS=${cycle==='month'?domain.monthDays(start):cycle};cycle=${JSON.stringify(cycle)};const $=id=>document.getElementById(id);let mode='overtime',savedRecords=structuredClone(fixtureSaved),recordsReadable=true,activeRecordId=null,cleanSheet='',currentSheetEmployee=null,savedEmployeeProfile=null,currentInputs=emptyEntries();currentInputs[0]=structuredClone(fixtureInputs[0]);const RECORDS_KEY='easytimeRecordsV1';function readEntries(){return structuredClone(currentInputs);}function renderRows(entries){currentInputs=structuredClone(entries);}function calculate(){return calculateSheet(currentInputs,mode,$('hourly-rate').value);}function loadSavedRecords(){}`,context);
 vm.runInContext(region('function sheetValues()','function csvCell('),context);
 vm.runInContext(region('function persistRecords(next)','function renderSavedRecords()'),context);
 vm.runInContext(region('function saveRecord()','function onSheetChange()'),context);
 vm.runInContext(region('function applyCycle(next','function changeCycle(next'),context);
 return {dom,storage,run:code=>vm.runInContext(code,context),snapshot:()=>JSON.parse(vm.runInContext('JSON.stringify({savedRecords,currentInputs,DAYS,mode,activeRecordId,totals:calculate()})',context))};
}
test('The offline Save record preserves its snapshot and clears the next sheet, including leap months',()=>{
 for(const config of [{},{cycle:7},{cycle:'month',start:'2028-01-01'}]){
  const h=offline(config);h.run('saveRecord()');const result=h.snapshot(),stored=JSON.parse(h.storage.get('easytimeRecordsV1'));
  assert.equal(stored.records.length,1);assert.equal(stored.records[0].entries[0].start,'08:00');assert.equal(stored.records[0].entries[0].manualOT,'2');assert.equal(result.totals.pay,0);assert.equal(result.totals.completed,0);assert.equal(result.activeRecordId,null);assert.ok(result.currentInputs.every(e=>e.start===''&&e.end===''&&e.breakMinutes===''&&e.manualOT===''));assert.equal(h.dom.focused(),'day-1-start-hours');assert.equal(h.dom.get('hourly-rate').value,'22');assert.equal(result.mode,'overtime');if(config.cycle==='month'){assert.equal(h.dom.get('period-start').value,'2028-02-01');assert.equal(result.DAYS,29);}
 }
});
test('Offline storage failures keep hours visible, and occupied future records are preserved',()=>{
 const h=offline({blocked:true});h.run('saveRecord()');assert.equal(h.snapshot().currentInputs[0].start,'08:00');assert.equal(h.dom.get('period-start').value,'2026-10-01');assert.match(h.dom.get('record-status').textContent,/could not be saved/);
 const future={id:'period:15:2026-10-16',periodStart:'2026-10-16',periodDays:15,cycle:15,rate:'25',mode:'normal',entries:Array.from({length:15},()=>({start:'09:00',end:'10:00',breakMinutes:'',manualOT:''}))};
 const skipped=offline({saved:[future]});skipped.run('saveRecord()');assert.equal(skipped.dom.get('period-start').value,'2026-10-31');assert.deepEqual(skipped.snapshot().savedRecords.find(r=>r.id===future.id),future);assert.equal(skipped.snapshot().totals.pay,0);
});

test('Save record and budget controls work without a subscription object',async()=>{
 const state=fixture();for(let i=0;i<4;i++){const r=domain.newRecord(domain.addDays('2026-10-16',15*i),'15','22');r.entries[0]=entered();state.records.push(r);}
 const h=cloud(state);h.run("const record=newRecord('2026-12-15','15','22','normal');record.entries[0]={...blankEntry(),start:'09:00',end:'17:00'};selectRecord(record);route();");await h.save();
 assert.equal(h.snapshot().state.records.length,6);assert.equal(h.snapshot().active.start,'2026-12-30');assert.equal(h.snapshot().recordSaveBusy,false);assert.equal(domain.calculate(h.snapshot().active,h.snapshot().state.records).total,0);
 h.dom.get('budget-dialog').showModal=()=>{h.dom.get('budget-dialog').open=true;};h.dom.get('budget-dialog').querySelectorAll=()=>[];h.run('updateBudgetMoveControls=()=>{};showBudget();');assert.match(h.dom.get('budget-content').innerHTML,/Create category/);assert.match(h.dom.get('budget-content').innerHTML,/Save budget limits/);assert.doesNotMatch(h.dom.get('budget-content').innerHTML,/fieldset[^>]*disabled|Pro|trial|subscription|Upgrade/);
 assert.doesNotMatch(h.run('paychecksView()'),/class="tag">PRO/);assert.doesNotMatch(h.run('expensesView()'),/class="tag">PRO/);
 // JSON parsing puts VM-created budget objects in the same realm as the schema validator.
 h.context.validateState=value=>domain.validateState(JSON.parse(JSON.stringify(value)));
 const fieldsets=[{disabled:false},{disabled:false}];h.dom.get('budget-dialog').querySelectorAll=()=>fieldsets;h.dom.get('budget-limits-form').reportValidity=()=>true;h.dom.get('budget-limits-form').querySelectorAll=()=>[{dataset:{budgetCategory:'Food'},value:'150'}];
 h.context.FormData=class {constructor(){this.values=[['budget-category-name','Travel'],['budget-category-limit','70']];}[Symbol.iterator](){return this.values[Symbol.iterator]();}};
 await h.run("saveBudget({preventDefault(){},target:document.getElementById('budget-category-form')})");
 assert.match(h.dom.get('budget-feedback').textContent,/saved/);const recordId=h.snapshot().active.id;assert.deepEqual(h.snapshot().state.customCategories,['Travel']);assert.deepEqual(h.snapshot().state.cycleBudgets[recordId],{Food:15000,Travel:7000});assert.ok(fieldsets.every(f=>!f.disabled));assert.match(h.dom.get('budget-feedback').textContent,/saved/);
 h.run("budgetRows=()=>[{dataset:{budgetRow:'Travel'}},{dataset:{budgetRow:'Food'}}];");await h.run("persistBudgetOrder('Travel')");assert.deepEqual(h.snapshot().state.categoryOrder,['Travel','Food']);assert.deepEqual(h.writes.at(-1).state.categoryOrder,['Travel','Food']);assert.ok(fieldsets.every(f=>!f.disabled));
 h.context.history={replaceState(_state,_title,path){h.context.location.hash='#support';h.context.redirected=path;}};h.run("loadSupport=()=>{};location.hash='#billing';route();");assert.equal(h.context.redirected,'/easytime/index.html#support');assert.match(h.dom.get('view').innerHTML,/Help & account controls/);

});
