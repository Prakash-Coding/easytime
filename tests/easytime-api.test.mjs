import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {emptyState,newRecord} from '../public/easytime/domain.mjs';
const folder=await mkdtemp(path.join(tmpdir(),'easytime-api-'));
const sql=new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../drizzle/0000_certain_radioactive_man.sql',import.meta.url),'utf8'));
const binding={prepare(query){let args=[];const p={bind(...values){args=values;return p;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)},success:true};}};return p;},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const p of statements)result.push(await p.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
globalThis.__easytimeTestEnv={DB:binding,APP_ORIGIN:'https://qa.easytime.test'};
await writeFile(path.join(folder,'env.mjs'),'export const env=globalThis.__easytimeTestEnv;');
await copyFile(new URL('../public/easytime/domain.mjs',import.meta.url),path.join(folder,'domain.mjs'));
const sources={server:'lib/easytime/server.ts','provider-auth':'lib/easytime/provider-auth.ts','state-route':'app/api/easytime/state/route.ts','export-route':'app/api/easytime/export/route.ts','support-route':'app/api/easytime/support/route.ts','auth-route':'app/api/easytime/auth/route.ts','billing-route':'app/api/easytime/billing/route.ts','webhook-route':'app/api/easytime/webhook/route.ts'};
for(const [name,src] of Object.entries(sources)){let code=ts.transpileModule(await readFile(new URL('../'+src,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;code=code.replace(/from ['"]cloudflare:workers['"]/g,"from './env.mjs'").replace(/from ['"](?:\.\.\/)+public\/easytime\/domain\.mjs['"]/g,"from './domain.mjs'").replace(/from ['"](?:\.\.\/)+lib\/easytime\/(server|billing|provider-auth)['"]/g,(_,n)=>"from './"+n+".mjs'").replace(/from ['"]\.\/(server|billing|provider-auth)['"]/g,(_,n)=>"from './"+n+".mjs'");await writeFile(path.join(folder,name+'.mjs'),code);}
const load=name=>import(pathToFileURL(path.join(folder,name+'.mjs')).href);
const routes={state:await load('state-route'),export:await load('export-route'),support:await load('support-route'),auth:await load('auth-route'),billing:await load('billing-route')};
const req=(route,method='GET',data,user='alice',extra={})=>new Request('https://qa.easytime.test/api/easytime/'+route,{method,headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...(data?{'Content-Type':'application/json','Origin':'https://qa.easytime.test'}:{}),...extra},body:data?JSON.stringify(data):undefined});
after(async()=>{sql.close();delete globalThis.__easytimeTestEnv;await rm(folder,{recursive:true,force:true});});
test('private routes reject anonymous requests and external-origin writes',async()=>{assert.equal((await routes.state.GET(req('state','GET',undefined,null))).status,401);assert.equal((await routes.state.PUT(req('state','PUT',{state:emptyState(),revision:0},'alice',{Origin:'https://attacker.test'}))).status,403);assert.equal((await routes.billing.POST(req('billing','POST',{action:'checkout'},null))).status,401);});
test('two accounts have isolated cloud data and optimistic saves prevent lost updates',async()=>{let a=await (await routes.state.GET(req('state'))).json();const b=await (await routes.state.GET(req('state','GET',undefined,'bob'))).json();assert.equal(a.revision,0);assert.equal(b.state.records.length,0);a.state.profile.fullName='Alice';a.state.records=[newRecord('2026-10-05','7','20')];a.state.records[0].entries[0]={start:'09:00',end:'17:00',breakMinutes:'',paidBreak:false,manualOT:''};let response=await routes.state.PUT(req('state','PUT',{state:a.state,revision:0,owner:'chatgpt:bob'}));assert.equal(response.status,200);assert.equal((await response.json()).revision,1);assert.equal((await routes.state.PUT(req('state','PUT',{state:a.state,revision:0}))).status,409);const bob=await (await routes.state.GET(req('state','GET',undefined,'bob'))).json();assert.equal(bob.state.profile.fullName,'');assert.equal(bob.state.records.length,0);a=await (await routes.state.GET(req('state'))).json();assert.equal(a.state.profile.fullName,'Alice');assert.equal(a.state.records.length,1);});
test('backups belong to their account, restore data is available, retention is bounded',async()=>{let a=await (await routes.state.GET(req('state'))).json();for(let i=0;i<12;i++){a.state.profile.company='Version '+i;const r=await (await routes.state.PUT(req('state','PUT',{state:a.state,revision:a.revision}))).json();a.revision=r.revision;}const list=await (await routes.export.GET(req('export?mode=backups'))).json();assert.equal(list.backups.length,10);const id=list.backups[0].id;assert.equal((await routes.export.GET(req('export?backup='+id,'GET',undefined,'bob'))).status,404);const backup=await (await routes.export.GET(req('export?backup='+id))).json();assert.ok(backup.state.profile.company.startsWith('Version'));const exported=await (await routes.export.GET(req('export'))).json();assert.equal(exported.state.profile.company,'Version 11');});
test('server validates account data and expenses save after the old trial expires',async()=>{const invalid=await routes.state.PUT(req('state','PUT',{state:{version:3},revision:13}));assert.equal(invalid.status,400);sql.prepare('UPDATE easytime_accounts SET trial_end=0 WHERE id=?').run('chatgpt:alice');const a=await (await routes.state.GET(req('state'))).json();assert.equal(Object.hasOwn(a,'plan'),false);a.state.expenses.push({id:'free-expense',date:'2026-10-07',cents:100,category:'Food',note:''});assert.equal((await routes.state.PUT(req('state','PUT',{state:a.state,revision:a.revision}))).status,200);});
test('support tickets and account exports do not cross account boundaries',async()=>{assert.equal((await routes.support.POST(req('support','POST',{subject:'Test support',message:'Synthetic QA request'}))).status,201);const bob=await (await routes.support.GET(req('support','GET',undefined,'bob'))).json();assert.equal(bob.tickets.length,0);const alice=await (await routes.support.GET(req('support'))).json();assert.equal(alice.tickets.length,1);});
test('retired payment endpoints cannot charge, create subscriptions or process subscription events',async(t)=>{
 const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('Unexpected payment request');};t.after(()=>{globalThis.fetch=originalFetch;});
 globalThis.__easytimeTestEnv.STRIPE_SECRET_KEY='synthetic-key';t.after(()=>{delete globalThis.__easytimeTestEnv.STRIPE_SECRET_KEY;});
 for(const action of ['checkout','portal','reconcile']){const response=await routes.billing.POST(req('billing','POST',{action,session:'cs_synthetic'}));assert.equal(response.status,410);assert.match((await response.json()).error,/without payment/);}
 assert.deepEqual(await (await routes.billing.GET(req('billing'))).json(),{subscriptionsEnabled:false});
 const webhook=await load('webhook-route');assert.equal((await webhook.POST(req('webhook','POST',{type:'customer.subscription.updated'}))).status,410);
 assert.equal(requests,0);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_subscriptions').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_billing_events').get().n,0);
});
test('unconfigured email login and forged provider tokens still fail honestly',async()=>{
 assert.equal((await routes.auth.POST(req('auth','POST',{action:'login',email:'qa@example.test',password:'synthetic-qa-only'}))).status,503);
 const config=await (await routes.auth.GET()).json();assert.equal(config.emailEnabled,false);
 const {verifiedFirebaseIdentity}=await load('provider-auth');const fake=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'fake'})).toString('base64url')+'.x';await assert.rejects(()=>verifiedFirebaseIdentity(fake));
});
test('explicit account deletion removes records, backups and tickets without affecting other users',async()=>{assert.equal((await routes.state.DELETE(req('state','DELETE',{confirm:'no'}))).status,400);assert.equal((await routes.state.DELETE(req('state','DELETE',{confirm:'DELETE'}))).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_backups WHERE owner=?').get('chatgpt:alice').n,0);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_tickets WHERE owner=?').get('chatgpt:alice').n,0);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_states WHERE owner=?').get('chatgpt:alice').n,0);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_accounts WHERE id=?').get('chatgpt:bob').n,1);});

test('private API saves and reopens custom dates with their paycheck and rejects an invalid range',async()=>{
 const account='calendar-qa';let response=await routes.state.GET(req('state','GET',undefined,account));let current=await response.json();
 const record=newRecord('2026-12-30','custom','20','normal','2027-01-05');
 current.state.records=[record];current.state.paychecks=[{id:'calendar-check',recordId:record.id,payDate:'2027-01-05',grossCents:200000,deductions:[{name:'Tax',cents:20000}]}];
 response=await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},account));assert.equal(response.status,200);
 current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 assert.equal(current.state.records[0].end,'2027-01-05');assert.equal(current.state.records[0].entries.length,7);assert.equal(current.state.paychecks[0].recordId,record.id);
 const invalid=structuredClone(current.state);invalid.records[0].end='2026-12-29';
 assert.equal((await routes.state.PUT(req('state','PUT',{state:invalid,revision:current.revision},account))).status,400);
 const reloaded=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.equal(reloaded.state.records[0].end,'2027-01-05');
});
test('private API persists category budgets per cycle and new categories without paid access',async()=>{
 const account='budget-qa';let current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 const a=newRecord('2026-10-01','15','20'),b=newRecord('2026-10-16','15','20');
 current.state.records=[a,b];current.state.customCategories=['Pets & vet'];current.state.cycleBudgets={[a.id]:{'Pets & vet':5000},[b.id]:{'Pets & vet':10000}};
 current.state.expenses=[{id:'vet-visit',date:'2026-10-08',cents:6000,category:'Pets & vet',note:'Synthetic QA'}];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},account))).status,200);
 current=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.deepEqual(current.state.customCategories,['Pets & vet']);assert.equal(current.state.cycleBudgets[a.id]['Pets & vet'],5000);assert.equal(current.state.cycleBudgets[b.id]['Pets & vet'],10000);
 const other=await (await routes.state.GET(req('state','GET',undefined,'budget-other'))).json();assert.deepEqual(other.state.customCategories,[]);assert.deepEqual(other.state.cycleBudgets,{});
 const invalid=structuredClone(current.state);invalid.customCategories.push('pets & VET');assert.equal((await routes.state.PUT(req('state','PUT',{state:invalid,revision:current.revision},account))).status,400);
 sql.prepare('UPDATE easytime_accounts SET trial_end=0 WHERE id=?').run('chatgpt:'+account);
 const more=structuredClone(current.state);more.customCategories.push('Travel');assert.equal((await routes.state.PUT(req('state','PUT',{state:more,revision:current.revision},account))).status,200);current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 const raised=structuredClone(current.state);raised.cycleBudgets[a.id]['Pets & vet']=7500;assert.equal((await routes.state.PUT(req('state','PUT',{state:raised,revision:current.revision},account))).status,200);current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 const unchanged=await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},account));assert.equal(unchanged.status,200);current.revision=(await unchanged.json()).revision;
 const removed=structuredClone(current.state);removed.records=removed.records.filter(r=>r.id!==a.id);delete removed.cycleBudgets[a.id];assert.equal((await routes.state.PUT(req('state','PUT',{state:removed,revision:current.revision},account))).status,200);
 const final=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.equal(final.state.cycleBudgets[b.id]['Pets & vet'],10000);
});
test('category order is persisted privately and can be changed without paid access',async()=>{
 const account='category-order-qa';let current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 current.state.customCategories=['Travel'];current.state.categoryOrder=['Travel','Food','Housing'];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},account))).status,200);
 current=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.deepEqual(current.state.categoryOrder,['Travel','Food','Housing']);
 const other=await (await routes.state.GET(req('state','GET',undefined,'order-other'))).json();assert.deepEqual(other.state.categoryOrder,[]);
 for(const order of [['Travel','Travel'],['Unknown']]){const bad=structuredClone(current.state);bad.categoryOrder=order;assert.equal((await routes.state.PUT(req('state','PUT',{state:bad,revision:current.revision},account))).status,400);}
 sql.prepare('UPDATE easytime_accounts SET trial_end=0 WHERE id=?').run('chatgpt:'+account);const changed=structuredClone(current.state);changed.categoryOrder=['Food','Travel','Housing'];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:changed,revision:current.revision},account))).status,200);
 const reloaded=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.deepEqual(reloaded.state.categoryOrder,changed.categoryOrder);
});
test('deleting the last pay-cycle record persists after reload, keeps finances and allows recovery after an old trial',async()=>{
 const account='record-delete-qa';let current=await (await routes.state.GET(req('state','GET',undefined,account))).json();
 const record=newRecord('2026-10-01','15','20');record.entries[0]={start:'09:00',end:'17:00',breakMinutes:'',paidBreak:false,manualOT:''};
 current.state.records=[record];current.state.cycleBudgets={[record.id]:{Food:20000}};
 current.state.paychecks=[{id:'kept-paycheck',recordId:record.id,payDate:'2026-10-15',grossCents:200000,deductions:[]}];
 current.state.expenses=[{id:'kept-expense',date:'2026-10-08',category:'Food',cents:15000,note:'Synthetic QA'}];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},account))).status,200);
 current=await (await routes.state.GET(req('state','GET',undefined,account))).json();const before=structuredClone(current.state);
 sql.prepare('UPDATE easytime_accounts SET trial_end=0 WHERE id=?').run('chatgpt:'+account);
 const next=structuredClone(current.state);next.records=[];delete next.cycleBudgets[record.id];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:next,revision:current.revision},account))).status,200);
 const reloaded=await (await routes.state.GET(req('state','GET',undefined,account))).json();assert.equal(reloaded.state.records.length,0);assert.deepEqual(reloaded.state.cycleBudgets,{});assert.deepEqual(reloaded.state.paychecks,before.paychecks);assert.deepEqual(reloaded.state.expenses,before.expenses);
 assert.equal((await routes.state.PUT(req('state','PUT',{state:next,revision:current.revision},account))).status,409);
 const backups=await (await routes.export.GET(req('export?mode=backups','GET',undefined,account))).json();
 let recovered=false;for(const backup of backups.backups){const result=await (await routes.export.GET(req('export?backup='+backup.id,'GET',undefined,account))).json();if(result.state.records.some(r=>r.id===record.id))recovered=true;}assert.equal(recovered,true);
 const other=await (await routes.state.GET(req('state','GET',undefined,'delete-other'))).json();assert.deepEqual(other.state.records,[]);assert.deepEqual(other.state.paychecks,[]);
});

test('an expired-trial account with a legacy subscription can save more than three periods and all finance features',async(t)=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Payment service must not be contacted');};t.after(()=>{globalThis.fetch=originalFetch;});
 const owner='no-subscription-qa';let current=await (await routes.state.GET(req('state','GET',undefined,owner))).json();
 assert.equal(sql.prepare('SELECT trial_end FROM easytime_accounts WHERE id=?').get('chatgpt:'+owner).trial_end,0);
 sql.prepare('INSERT INTO easytime_subscriptions(owner,customer,subscription,status,period_end,cancel_at_end,checked_at) VALUES(?,?,?,?,?,?,?)').run('chatgpt:'+owner,'cus_legacy','sub_legacy','past_due',0,0,0);
 for(let i=0;i<5;i++){
  const record=newRecord('2026-11-'+String(1+i*7).padStart(2,'0'),'7','20');record.entries[0]={start:'09:00',end:'17:00',breakMinutes:'',paidBreak:false,manualOT:''};record.savedAt=new Date().toISOString();current.state.records.push(record);
  const response=await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},owner));assert.equal(response.status,200);current.revision=(await response.json()).revision;
 }
 current.state.customCategories=['Travel'];current.state.categoryOrder=['Travel','Food'];current.state.budgets={Food:30000};current.state.cycleBudgets={[current.state.records[0].id]:{Travel:10000}};
 current.state.paychecks=[{id:'free-paycheck',recordId:current.state.records[0].id,payDate:'2026-11-07',grossCents:200000,deductions:[{name:'Tax',cents:20000}]}];
 current.state.expenses=[{id:'free-travel',date:'2026-11-03',cents:5000,category:'Travel',note:'Synthetic test'}];current.state.bills=[{id:'free-bill',name:'Phone',cents:6000,nextDue:'2026-11-04',frequency:'monthly',active:true}];
 assert.equal((await routes.state.PUT(req('state','PUT',{state:current.state,revision:current.revision},owner))).status,200);
 const reopened=await (await routes.state.GET(req('state','GET',undefined,owner))).json();assert.deepEqual(reopened.state,current.state);assert.equal(Object.hasOwn(reopened,'plan'),false);assert.equal(reopened.state.records.length,5);
 const other=await (await routes.state.GET(req('state','GET',undefined,'no-subscription-other'))).json();assert.equal(other.state.records.length,0);assert.equal(other.state.paychecks.length,0);assert.equal(other.state.expenses.length,0);
 assert.equal((await routes.state.DELETE(req('state','DELETE',{confirm:'DELETE'},owner))).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM easytime_subscriptions WHERE owner=?').get('chatgpt:'+owner).n,0);
});
