import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALL_FEATURES,normalizeFeatures,pricingCatalog,publicCatalog,quoteFeatures} from '../public/easytime/business-features.mjs';
import {emptyPayroll} from '../public/easytime/payroll-domain.mjs';
import {upgrade,applyWorkforce} from '../public/easytime/workforce-domain.mjs';
import {authorize,project} from '../public/easytime/workforce-access.mjs';

const now=Date.parse('2026-10-25T20:00:00Z');let seq=0;
const apply=(db,type,data)=>applyWorkforce(db,{type,data},'Verified owner',now,()=>`feature-test-${++seq}`);
function workspace(){let db=upgrade(emptyPayroll());db=apply(db,'store',{name:'Feature QA store',timezone:'America/Chicago'});db=apply(db,'employee',{name:'Alex QA',code:'QA-1',store:db.stores[0].id,rate:20});return db;}
function catalog(features,overrides={}){return pricingCatalog(JSON.stringify({currency:'usd',version:'prices-v1',features,...overrides}),true);}

test('feature normalization includes required core, dependencies, canonical ordering and deduplication',()=>{
 assert.deepEqual(normalizeFeatures([]),['core']);
 assert.deepEqual(normalizeFeatures(['reports','coverage','reports']),['core','time','scheduling','coverage','reports']);
 assert.deepEqual(normalizeFeatures(['communication']),['core','scheduling','communication']);
 assert.deepEqual(normalizeFeatures([...ALL_FEATURES].reverse()),ALL_FEATURES);
 for(const input of [undefined,null,'ordering',{},['unknown'],['CORE']])assert.throws(()=>normalizeFeatures(input),/valid EasyTime features/);
});

test('monthly quotes sum integer cents using server catalog and preserve currency/version',()=>{
 const prices=catalog({core:{monthlyCents:0,stripePriceId:'price_Core123'},time:{monthlyCents:101},reports:{monthlyCents:202}});
 const result=quoteFeatures(prices,['reports']);
 assert.deepEqual(result.features,['core','time','reports']);
 assert.equal(result.totalMonthlyCents,303);
 assert.equal(result.currency,'usd');
 assert.equal(result.catalogVersion,'prices-v1');
 assert.equal(result.checkoutEnabled,true);
 assert.deepEqual(result.missingPrices,[]);
 assert.deepEqual(result.lines.map(line=>line.monthlyCents),[0,101,202]);
 assert.throws(()=>quoteFeatures(prices,['forged-feature']),/valid EasyTime features/);
});

test('missing prices remain pending, never become a zero-dollar quote',()=>{
 const unconfigured=pricingCatalog('',false),missing=quoteFeatures(unconfigured,['ordering']);
 assert.equal(unconfigured.configured,false);
 assert.equal(unconfigured.version,'unconfigured');
 assert.equal(missing.totalMonthlyCents,null);
 assert.deepEqual(missing.missingPrices,['core','ordering']);
 assert.equal(missing.checkoutEnabled,false);
 assert.ok(missing.lines.every(line=>line.monthlyCents===null));
 const partial=quoteFeatures(catalog({core:{monthlyCents:0}}),['ordering']);
 assert.equal(partial.totalMonthlyCents,null);
 assert.deepEqual(partial.missingPrices,['ordering']);
 assert.equal(partial.checkoutEnabled,false);
 const zero=quoteFeatures(catalog({core:{monthlyCents:0},ordering:{monthlyCents:0}}),['ordering']);
 assert.equal(zero.totalMonthlyCents,0);
 assert.equal(zero.checkoutEnabled,false);
});

test('catalog validation rejects malformed currency/version and noninteger or invalid amounts',()=>{
 for(const amount of [-1,0.1,'100',null,100000001])assert.throws(()=>catalog({core:{monthlyCents:amount}}),/pricing is invalid/);
 for(const currency of ['USD','us','usdollar',''])assert.throws(()=>catalog({},{currency}),/currency and version/);
 for(const version of ['',42,' '.repeat(5),'v'.repeat(81)])assert.throws(()=>catalog({},{version}),/currency and version/);
 assert.throws(()=>pricingCatalog('not JSON'),/configuration is invalid/);
 assert.throws(()=>catalog({core:{monthlyCents:1,stripePriceId:'javascript:fake'}}),/pricing is invalid/);
 assert.equal(catalog({core:{monthlyCents:100}}, {currency:'eur',version:'euro-2'}).currency,'eur');
});

test('public catalog and quote omit Stripe price identifiers',()=>{
 const privateCatalog=catalog({core:{monthlyCents:0,stripePriceId:'price_Core123'},ordering:{monthlyCents:199,stripePriceId:'price_Order456'}});
 assert.equal(privateCatalog.prices.ordering.stripePriceId,'price_Order456');
 const visible=publicCatalog(privateCatalog),quote=quoteFeatures(privateCatalog,['ordering']);
 assert.deepEqual(visible.prices.ordering,{monthlyCents:199});
 assert.equal(visible.version,'prices-v1');
 assert.equal(visible.currency,'usd');
 assert.doesNotMatch(JSON.stringify(visible),/stripePriceId|price_Core123|price_Order456/);
 assert.doesNotMatch(JSON.stringify(quote),/stripePriceId|price_Core123|price_Order456/);
 assert.equal(privateCatalog.prices.ordering.stripePriceId,'price_Order456');
});

test('owner feature selections persist canonical IDs and an audit record without activating billing or changing saved work',()=>{
 const original=workspace(),savedData=structuredClone({stores:original.stores,employees:original.employees,entries:original.entries,shifts:original.shifts,workforce:original.workforce,settings:original.settings});
 const next=apply(original,'wf:selectFeatures',{features:['reports','coverage'],billing:{status:'active',subscriptionId:'forged'},totalMonthlyCents:1});
 assert.deepEqual(next.businessPlan.selectedFeatures,['core','time','scheduling','coverage','reports']);
 assert.equal(next.businessPlan.updatedBy,'Verified owner');
 assert.equal(next.businessPlan.updatedAt,new Date(now).toISOString());
 assert.equal(next.businessPlan.billing,undefined);
 assert.equal(original.businessPlan,undefined);
 assert.deepEqual({stores:next.stores,employees:next.employees,entries:next.entries,shifts:next.shifts,workforce:next.workforce,settings:next.settings},savedData);
 const last=next.audit.at(-1);
 assert.equal(last.action,'wf:selectFeatures');
 assert.equal(last.actor,'Verified owner');
 assert.equal(last.before,null);
 assert.deepEqual(last.after,{selectedFeatures:next.businessPlan.selectedFeatures});
 assert.match(last.detail,/payment status unchanged/);
 const revised=apply(next,'wf:selectFeatures',{features:['ordering']});
 assert.deepEqual(revised.audit.at(-1).before,next.businessPlan.selectedFeatures);
 assert.deepEqual(revised.businessPlan.selectedFeatures,['core','ordering']);
});

test('changing preferences cannot overwrite existing billing metadata or activate a subscription',()=>{
 const db=workspace();db.businessPlan={selectedFeatures:['core'],billing:{status:'past_due',subscriptionId:'sub_owned',customerId:'cus_owned',activeFeatures:['ordering']}};
 const next=apply(db,'wf:selectFeatures',{features:['reports'],billing:{status:'active',subscriptionId:'sub_forged'}});
 assert.deepEqual(next.businessPlan.billing,db.businessPlan.billing);
 assert.equal(next.businessPlan.billing.status,'past_due');
 assert.deepEqual(next.businessPlan.selectedFeatures,['core','time','reports']);
});

test('feature selection changes are restricted to the owner',()=>{
 const db=workspace(),store=db.stores[0].id,employee=db.employees[0].id,command={type:'wf:selectFeatures',data:{features:['ordering']}};
 authorize(db,command,{role:'Owner',stores:[store]});
 assert.throws(()=>authorize(db,command,{role:'Manager',stores:[store]}),/role does not permit/);
 assert.throws(()=>authorize(db,command,{role:'Employee',stores:[store],employee}),/role does not permit/);
});

test('nonowner projections remove selected features and private billing metadata',()=>{
 const db=workspace(),store=db.stores[0].id,employee=db.employees[0].id;
 db.businessPlan={selectedFeatures:['core','reports'],updatedBy:'Owner email',billing:{status:'active',subscriptionId:'sub_private',customerId:'cus_private',activeFeatures:['time'],lastInvoice:'invoice_private'}};
 for(const member of [{role:'Manager',stores:[store]},{role:'Employee',stores:[store],employee}]){
  const visible=project(db,member);
  assert.deepEqual(visible.businessPlan,{activeFeatures:['time'],status:'active'});
  assert.equal(visible.businessPlan.selectedFeatures,undefined);
  assert.equal(visible.businessPlan.billing,undefined);
  assert.doesNotMatch(JSON.stringify(visible.businessPlan),/sub_private|cus_private|invoice_private|Owner email/);
 }
 assert.equal(project(db,{role:'Owner'}).businessPlan.billing.subscriptionId,'sub_private');
});
