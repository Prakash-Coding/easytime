export const FEATURE_CATALOG=[
 {id:'core',name:'Business workspace',description:'Employee/store setup, saved records, activity history and business access controls.',required:true,dependsOn:[]},
 {id:'time',name:'Time tracking & payroll preparation',description:'Clock punches, timesheets, approvals, overtime and gross-pay summaries.',dependsOn:[]},
 {id:'scheduling',name:'Scheduling & planning',description:'Shifts, templates, staffing requirements, automatic assignments and schedule comparisons.',dependsOn:[]},
 {id:'coverage',name:'Shift coverage & swaps',description:'Open shifts, cover requests, employee acceptance and manager review.',dependsOn:['scheduling']},
 {id:'leave',name:'Leave & availability',description:'Availability, leave requests, approvals and manually allocated PTO.',dependsOn:[]},
 {id:'budgets',name:'Budgets & spend reports',description:'Category and employee budgets, approved manual expenses, spending alerts and budget report exports.',dependsOn:[]},
 {id:'labor',name:'Labor budgets',description:'Labor budgets, entered sales estimates and staffing-hour forecasts.',dependsOn:[]},
 {id:'communication',name:'Team communication',description:'Store messages and versioned employee schedule sharing through messaging composers.',dependsOn:['scheduling']},
 {id:'hiring',name:'Hiring & onboarding',description:'Candidate tracking and employee onboarding checklists.',dependsOn:[]},
 {id:'ordering',name:'Stock-order reminders',description:'Assigned ordering reminders, recurring due alerts and completion history.',dependsOn:[]},
 {id:'location',name:'GPS clock-in verification',description:'Configure store geofences and validate device location when starting a shift.',dependsOn:[]},
 {id:'reports',name:'Report exports',description:'Excel/PDF payroll reports and approved-hours CSV handoff.',dependsOn:['time']}
];
export const ALL_FEATURES=FEATURE_CATALOG.map(f=>f.id);
export function normalizeFeatures(ids){if(!Array.isArray(ids)||ids.length>FEATURE_CATALOG.length||ids.some(id=>!ALL_FEATURES.includes(id)))throw Error('Choose valid EasyTime features.');const selected=new Set(['core',...ids]);for(const f of FEATURE_CATALOG)if(selected.has(f.id))for(const dep of f.dependsOn)selected.add(dep);return ALL_FEATURES.filter(id=>selected.has(id));}
export function applyFeatureSelection(_db,values,actor,now){const features=normalizeFeatures(values.features);return {selectedFeatures:features,updatedAt:new Date(now).toISOString(),updatedBy:actor};}
export function pricingCatalog(raw,providerReady=false){
 let config;try{config=raw?JSON.parse(raw):null;}catch{throw Error('Business pricing configuration is invalid.');}
 if(config&&(!/^[a-z]{3}$/.test(config.currency)||typeof config.version!=='string'||!config.version.trim()||config.version.length>80))throw Error('Business pricing configuration needs a currency and version.');
 const prices={};for(const f of FEATURE_CATALOG){const p=config?.features?.[f.id];if(p===undefined)continue;if(!p||!Number.isSafeInteger(p.monthlyCents)||p.monthlyCents<0||p.monthlyCents>100000000||(p.stripePriceId!==undefined&&!/^price_[A-Za-z0-9]+$/.test(p.stripePriceId)))throw Error('Business feature pricing is invalid.');prices[f.id]={monthlyCents:p.monthlyCents,stripePriceId:p.stripePriceId||''};}
 return {version:config?.version||'unconfigured',currency:config?.currency||'usd',prices,checkoutEnabled:providerReady&&!!config,model:'monthly_per_business',configured:!!config};
}
export function quoteFeatures(catalog,ids){const features=normalizeFeatures(ids),missingPrices=features.filter(id=>!catalog.prices[id]);const total=missingPrices.length?null:features.reduce((n,id)=>n+catalog.prices[id].monthlyCents,0);if(total!==null&&!Number.isSafeInteger(total))throw Error('Pricing total is too large.');return {features,catalogVersion:catalog.version,currency:catalog.currency,totalMonthlyCents:total,missingPrices,checkoutEnabled:catalog.checkoutEnabled&&total!==null&&total>0,lines:features.map(id=>({id,name:FEATURE_CATALOG.find(f=>f.id===id).name,monthlyCents:catalog.prices[id]?.monthlyCents??null}))};}
export function publicCatalog(catalog){return {...catalog,prices:Object.fromEntries(Object.entries(catalog.prices).map(([id,p])=>[id,{monthlyCents:p.monthlyCents}]))};}
