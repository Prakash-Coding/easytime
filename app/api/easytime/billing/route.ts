import { checkOrigin, failure, identity, json } from '../../../../lib/easytime/server';
export const dynamic='force-dynamic';

// Retire old payment links without making a payment-provider request.
export async function GET(request:Request){
 try{await identity(request);return json({subscriptionsEnabled:false});}
 catch(e){return failure(e);}
}
export async function POST(request:Request){
 try{checkOrigin(request);await identity(request);return json({error:'Subscriptions have been removed. All EasyTime features are available without payment.'},410);}
 catch(e){return failure(e);}
}
