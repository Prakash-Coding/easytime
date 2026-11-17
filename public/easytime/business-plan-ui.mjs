import {FEATURE_CATALOG,normalizeFeatures} from './business-features.mjs';

// Prices and checkout eligibility come from the server. Saving preferences is
// separate from paying for a subscription; this form never grants paid access.
export function businessPlanUI(ctx){
 const {db,access,esc,panel}=ctx,pricing=ctx.catalog||{};
 const all=FEATURE_CATALOG.map(f=>f.id);
 const featureCopy={
  core:['Business basics','Add employees and stores, save records and choose who can use the business.'],
  time:['Time & pay','Record work hours, check timesheets and calculate pay before tax.'],
  scheduling:['Shift planning','Create schedules, save shift times and fill staff gaps.'],
  coverage:['Shift swaps','Let staff ask for cover or trade shifts, with manager approval.'],
  leave:['Time off','Manage time-off requests and the hours employees can work.'],
  budgets:['Budgets & spending','Set spending limits, review expenses and download spending reports.'],
  labor:['Staffing costs','Compare staff pay with your budget and expected sales.'],
  communication:['Team messages','Share schedules and send messages inside EasyTime.'],
  hiring:['Hiring & training','Track job applicants and new-staff tasks.'],
  ordering:['Order reminders','Remind assigned staff when to order stock.'],
  location:['Clock-in location','Check an employee’s device location when they clock in.'],
  reports:['Payroll reports','Download pay and work-hour reports as Excel, PDF or CSV files.']
 };
 const featureName=f=>featureCopy[f.id]?.[0]||f.name,featureDescription=f=>featureCopy[f.id]?.[1]||f.description;

 let selected;
 try{selected=normalizeFeatures(db.businessPlan?.selectedFeatures||all);}catch{selected=normalizeFeatures(all);}
 let currentQuote=ctx.quote||null,quoting=false,busy=false,quoteVersion=0;
 const owner=access?.role==='Owner';
 const root=()=>document.getElementById('feature-plan-form');
 const status=(message,error=false)=>{const el=document.getElementById('feature-plan-status');if(el){el.textContent=message;el.style.color=error?'#a13b51':'';}};
 const currency=()=>currentQuote?.currency||pricing.currency;
 function price(id){const value=pricing.prices?.[id]?.monthlyCents;return Number.isInteger(value)&&value>=0?value:null;}
 function money(cents){try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency()}).format(cents/100);}catch{return 'Currency not set';}}
 function hasPrices(){return !!currency()&&selected.every(id=>price(id)!==null);}
 function quoteMatchesSelection(){return currentQuote?.catalogVersion===pricing.version&&Array.isArray(currentQuote?.features)&&JSON.stringify(currentQuote.features)===JSON.stringify(selected);}
 function quoteTotal(){const value=currentQuote?.totalMonthlyCents;return quoteMatchesSelection()&&Number.isSafeInteger(value)&&value>=0?value:null;}
 function canCheckout(){return owner&&!busy&&!quoting&&pricing.checkoutEnabled===true&&currentQuote?.checkoutEnabled===true&&hasPrices()&&quoteTotal()>0;}
 function summary(){
  const total=quoteTotal(),complete=hasPrices();
  return `<div class="panel" style="padding:20px;margin-top:18px"><h2>Selected features</h2><p>${selected.length} feature${selected.length===1?'':'s'} selected · For this business, each month</p><dl style="margin:16px 0">${selected.map(id=>{const f=FEATURE_CATALOG.find(f=>f.id===id),amount=price(id);return `<div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #ecebf3"><dt>${esc(f?featureName(f):id)}</dt><dd style="margin:0;white-space:nowrap">${amount===null?'Price not set':esc(money(amount))}</dd></div>`;}).join('')}</dl><div style="display:flex;justify-content:space-between;gap:14px;font-weight:700;font-size:1.1rem"><span>Monthly total</span><span>${quoting?'Updating…':!complete?'Price not set':total===null?'Total unavailable':esc(money(total))}</span></div><p style="margin-top:12px;font-size:.82rem;color:var(--muted)">${!complete?'Some prices are not set yet. You can save your choices without being charged.':'Monthly feature prices before tax. Payment details are confirmed separately.'}</p></div>`;
 }
 function cards(){return FEATURE_CATALOG.map(f=>{const amount=price(f.id),dependencies=(f.dependsOn||[]).map(id=>(FEATURE_CATALOG.find(item=>item.id===id)?featureName(FEATURE_CATALOG.find(item=>item.id===id)):id));return `<label style="display:flex;align-items:flex-start;gap:12px;border:1px solid #dedbea;border-radius:12px;padding:16px;background:white;margin:0"><input data-plan-feature="${esc(f.id)}" type="checkbox" ${selected.includes(f.id)?'checked':''} ${f.required?'disabled':''} style="width:auto;min-height:0;margin-top:4px;flex:0 0 auto"><span style="display:block;flex:1"><strong>${esc(featureName(f))}</strong>${f.required?' <small>Required</small>':''}<span style="display:block;font-weight:400;margin-top:5px;color:var(--muted);font-size:.85rem">${esc(featureDescription(f))}</span>${dependencies.length?`<small style="display:block;margin-top:7px">Also needs ${dependencies.map(esc).join(', ')}</small>`:''}<span style="display:block;margin-top:10px;font-weight:650">${amount===null?'Price not set':esc(money(amount))+' / month'}</span></span></label>`;}).join('');}
 function render(){
  if(!owner)return panel('Features & billing','Only the business owner can choose features.','<p>Ask the business owner to review the features for this business.</p>');
  const billing=ctx.billingStatus==='No paid business subscription is active. Saved selections are preferences only.'?'No paid plan is active. Saving choices does not take a payment.':typeof ctx.billingStatus==='string'&&ctx.billingStatus?ctx.billingStatus:'No paid plan is active.';
  return panel('Choose your features','Tick the features you want, check the monthly price and save your choices.',`<div style="padding:20px"><p><strong>Payment status:</strong> ${esc(billing)}</p><p class="good-note">Saving your choices does not start a paid plan or charge you. Your saved records stay available.</p><form id="feature-plan-form"><div id="feature-plan-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:12px">${cards()}</div><div id="feature-plan-summary" aria-live="polite">${summary()}</div><p id="feature-plan-status" role="status" style="min-height:24px;margin:14px 0"></p><div class="button-row"><button type="submit" class="button" data-plan-save>Save my features</button><button type="button" class="button" data-plan-checkout ${canCheckout()?'':'disabled'}>Continue to payment</button></div><p class="good-note" id="feature-plan-checkout-note">${canCheckout()?'Check your choices before going to payment.':'Payment is not ready yet. You can still save your choices.'}</p></form></div>`);
 }
 function update(){const form=root();if(!form)return;for(const input of form.querySelectorAll('[data-plan-feature]'))input.checked=selected.includes(input.dataset.planFeature);document.getElementById('feature-plan-summary').innerHTML=summary();form.querySelector('[data-plan-save]').disabled=busy;form.querySelector('[data-plan-checkout]').disabled=!canCheckout();for(const input of form.querySelectorAll('[data-plan-feature]'))input.disabled=busy||!!FEATURE_CATALOG.find(f=>f.id===input.dataset.planFeature)?.required;document.getElementById('feature-plan-checkout-note').textContent=canCheckout()?'Check your choices before going to payment.':'Payment is not ready yet. You can still save your choices.';}
 async function refresh(){const version=++quoteVersion;quoting=true;currentQuote=null;update();try{const quote=await ctx.refreshQuote([...selected]);if(version!==quoteVersion)return;currentQuote=quote;}catch(error){if(version===quoteVersion)status(error.message||'Could not update the price. Please try again.',true);}finally{if(version===quoteVersion){quoting=false;update();}}}
 function removeWithDependents(ids,removed){const gone=new Set([removed]);let changed=true;while(changed){changed=false;for(const f of FEATURE_CATALOG)if(!gone.has(f.id)&&(f.dependsOn||[]).some(id=>gone.has(id))){gone.add(f.id);changed=true;}}return ids.filter(id=>!gone.has(id));}
 function bind(){const form=root();if(!owner||!form)return;form.addEventListener('change',event=>{const input=event.target.closest('[data-plan-feature]');if(!input)return;const id=input.dataset.planFeature;selected=normalizeFeatures(input.checked?[...selected,id]:removeWithDependents(selected,id));status('Your choices have changed. Save them when you are ready.');update();refresh();});form.addEventListener('submit',event=>{event.preventDefault();action('plan:save').catch(error=>status(error.message||'Could not save your choices.',true));});form.querySelector('[data-plan-checkout]').addEventListener('click',()=>action('plan:checkout').catch(error=>status(error.message||'Could not open the payment page.',true)));if(!quoteMatchesSelection())refresh();else update();}
 async function action(type){if(!['plan:save','plan:checkout'].includes(type))return false;if(!owner)throw Error('Only the business owner can choose features.');if(busy)throw Error('Please wait for the current request to finish.');
  if(type==='plan:checkout'&&!canCheckout())throw Error('Prices and payment setup are not ready yet.');busy=true;update();
  try{if(type==='plan:save'){await ctx.saveSelection([...selected]);status('Your feature choices are saved. You have not been charged.');}else{const result=await ctx.checkout([...selected]);const raw=typeof result==='string'?result:result?.url;if(!raw)throw Error('A payment link is not available. You have not been charged.');const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw Error('The payment link is invalid.');window.location.assign(url.href);}}finally{busy=false;update();}return true;
 }
 return {render,bind,action};
}
