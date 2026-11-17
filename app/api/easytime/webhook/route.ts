import { json } from '../../../../lib/easytime/server';
export const dynamic='force-dynamic';

// Legacy subscription events cannot change access or account records.
export async function POST(){return json({error:'Subscription events are no longer accepted.'},410);}
