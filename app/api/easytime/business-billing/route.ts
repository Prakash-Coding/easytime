import {body,checkOrigin,config,db,failure,HttpError,identity,json} from '../../../../lib/easytime/server';
import {ALL_FEATURES,pricingCatalog,publicCatalog,quoteFeatures} from '../../../../public/easytime/business-features.mjs';
export const dynamic='force-dynamic';
async function ownerContext(request:Request){const user=await identity(request),owner=new URL(request.url).searchParams.get('workspace')||user.id;if(owner!==user.id)throw new HttpError(403,'Only the business owner can manage feature pricing and payment.');const row=await db().prepare('SELECT payload FROM easytime_payroll_workspaces WHERE owner=?').bind(owner).first<{payload:string}>();return {user,state:row?JSON.parse(row.payload):{}};}
function catalog(){try{return pricingCatalog(String(config().EASYTIME_BUSINESS_PRICING||''),false);}catch{throw new HttpError(503,'Business pricing is temporarily unavailable. Your selected features have not been charged.');}}
export async function GET(request:Request){try{const {state}=await ownerContext(request),prices=catalog(),features=state.businessPlan?.selectedFeatures||ALL_FEATURES;return json({catalog:publicCatalog(prices),quote:quoteFeatures(prices,features),billingStatus:'No paid business subscription is active. Saved selections are preferences only.',paymentsEnabled:false});}catch(error){return failure(error);}}
export async function POST(request:Request){try{checkOrigin(request);await ownerContext(request);const input=await body(request,10000),prices=catalog();let quote;try{quote=quoteFeatures(prices,input.features);}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Choose valid features.');}
 if(input.action==='quote')return json({quote});
 if(input.action==='checkout'){
  if(input.catalogVersion!==prices.version)throw new HttpError(409,'Prices changed. Refresh the quote before continuing.');
  if(quote.missingPrices.length)throw new HttpError(503,'Feature prices have not been configured. No payment was taken.');
  // No payment provider has been selected/configured for the new business offering.
  // Never revive the retired personal subscription endpoints or claim payment here.
  throw new HttpError(503,'Business payments are not connected. Your selection can be saved, but no payment will be taken.');
 }
 throw new HttpError(400,'Choose a valid business billing action.');
 }catch(error){return failure(error);}}
