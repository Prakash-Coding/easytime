import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUSINESS_TYPES,validateBusinessProfile,businessTypeLabel} from '../public/easytime/business-profile.mjs';
import {emptyPayroll} from '../public/easytime/payroll-domain.mjs';
import {upgrade,applyWorkforce} from '../public/easytime/workforce-domain.mjs';
import {authorize,project} from '../public/easytime/workforce-access.mjs';

const now=Date.parse('2026-10-25T20:00:00Z');let sequence=0;
const apply=(db,type,data)=>applyWorkforce(db,{type,data},'Authenticated owner',now,()=>`profile-qa-${++sequence}`);
function workspace(){let db=upgrade(emptyPayroll());db=apply(db,'store',{name:'Fuel and groceries',timezone:'America/Chicago'});db=apply(db,'employee',{name:'Alex QA',code:'QA-1',store:db.stores[0].id,rate:20});db=apply(db,'entry',{employee:db.employees[0].id,store:db.stores[0].id,date:'2026-10-19',startTime:'09:00',endDate:'2026-10-19',endTime:'17:00',break:30});db=apply(db,'wf:selectFeatures',{features:['ordering','reports']});return db;}

 test('every supported business type accepts a trimmed name and has a readable label',()=>{
 assert.deepEqual(BUSINESS_TYPES.map(type=>type.id),['gas_station','convenience_store','gas_and_convenience','grocery','liquor_store','cafe_restaurant','retail','salon_service','other']);
 assert.equal(new Set(BUSINESS_TYPES.map(type=>type.id)).size,BUSINESS_TYPES.length);
 for(const type of BUSINESS_TYPES){
  const profile=validateBusinessProfile({name:'  EasyTime client  ',type:type.id,otherType:'  Equipment repair  '});
  assert.equal(profile.name,'EasyTime client');
  assert.equal(profile.type,type.id);
  assert.equal(profile.otherType,type.id==='other'?'Equipment repair':'');
  assert.equal(businessTypeLabel(profile),type.id==='other'?'Equipment repair':type.name);
 }
 assert.equal(businessTypeLabel(undefined),'Not selected');
 assert.equal(businessTypeLabel({type:'unknown'}),'Not selected');
});

test('business profile rejects unknown types, blank names and oversized custom descriptions',()=>{
 for(const type of ['GAS_STATION','unknown','',null,{},1])assert.throws(()=>validateBusinessProfile({name:'Business',type}),/valid business type/);
 for(const name of ['', '   ',null,42,'x'.repeat(181)])assert.throws(()=>validateBusinessProfile({name,type:'retail'}),/business name/);
 assert.equal(validateBusinessProfile({name:'x'.repeat(180),type:'retail'}).name.length,180);
 for(const otherType of ['', '   ',null,17,'x'.repeat(101)])assert.throws(()=>validateBusinessProfile({name:'Business',type:'other',otherType}),/Describe your business type/);
 assert.equal(validateBusinessProfile({name:'Business',type:'other',otherType:'x'.repeat(100)}).otherType.length,100);
});

test('saving a business profile records authenticated identity and leaves existing work and module selections untouched',()=>{
 const original=workspace(),snapshot=structuredClone(original);
 const next=apply(original,'wf:businessProfile',{name:'  Main Street Stores  ',type:'gas_and_convenience',otherType:'Ignored',updatedBy:'Forged buyer',updatedAt:'1970-01-01',businessPlan:{selectedFeatures:['core']}});
 assert.deepEqual(original,snapshot);
 assert.deepEqual(next.businessProfile,{name:'Main Street Stores',type:'gas_and_convenience',otherType:'',updatedAt:new Date(now).toISOString(),updatedBy:'Authenticated owner'});
 for(const key of ['stores','employees','entries','shifts','settings','workforce','businessPlan'])assert.deepEqual(next[key],original[key],key+' must not change with business type');
 assert.equal(next.audit.length,original.audit.length+1);
 const audit=next.audit.at(-1);
 assert.equal(audit.action,'wf:businessProfile');
 assert.equal(audit.actor,'Authenticated owner');
 assert.equal(audit.at,new Date(now).toISOString());
 assert.equal(audit.before,null);
 assert.deepEqual(audit.after,next.businessProfile);
});

test('switching from Other clears custom text while retaining the earlier profile in audit history',()=>{
 let db=workspace();db=apply(db,'wf:businessProfile',{name:'Service business',type:'other',otherType:'Equipment repair'});
 const earlier=structuredClone(db.businessProfile),next=apply(db,'wf:businessProfile',{name:'Retail business',type:'retail',otherType:'Stale custom label'});
 assert.equal(db.businessProfile.otherType,'Equipment repair');
 assert.equal(next.businessProfile.otherType,'');
 assert.equal(businessTypeLabel(next.businessProfile),'Retail shop');
 assert.deepEqual(next.audit.at(-1).before,earlier);
 assert.deepEqual(next.audit.at(-1).after,next.businessProfile);
});

test('legacy workspaces do not infer or create business type from existing employee/store data',()=>{
 const legacy=workspace();assert.equal(legacy.businessProfile,undefined);
 const upgraded=upgrade(legacy);
 assert.equal(upgraded.businessProfile,undefined);
 assert.deepEqual(upgraded.stores,legacy.stores);
 assert.equal(businessTypeLabel(upgraded.businessProfile),'Not selected');
});

test('only owners can save business profiles; nonowner projections omit update identity',()=>{
 let db=workspace();db=apply(db,'wf:businessProfile',{name:'Private business',type:'convenience_store'});
 const store=db.stores[0].id,employee=db.employees[0].id,command={type:'wf:businessProfile',data:{name:'Changed',type:'retail'}};
 authorize(db,command,{role:'Owner',stores:[store]});
 for(const member of [{role:'Manager',stores:[store]},{role:'Employee',stores:[store],employee}]){
  assert.throws(()=>authorize(db,command,member),/role does not permit/);
  const view=project(db,member);
  assert.deepEqual(view.businessProfile,{name:'Private business',type:'convenience_store',otherType:''});
  assert.equal(view.businessProfile.updatedBy,undefined);
  assert.equal(view.businessProfile.updatedAt,undefined);
 }
 assert.equal(project(db,{role:'Owner'}).businessProfile.updatedBy,'Authenticated owner');
});
