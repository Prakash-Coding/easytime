import { accountState, body, checkOrigin, db, ensureAccount, failure, HttpError, identity, json, saveState } from '../../../../lib/easytime/server';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{const user=await identity(request);await ensureAccount(user);return json({...await accountState(user.id),user});}
 catch(e){return failure(e);}
}
export async function PUT(request:Request){
 try{checkOrigin(request);const user=await identity(request);await ensureAccount(user);const payload=await body(request);return json(await saveState(user.id,payload.state,payload.revision));}
 catch(e){return failure(e);}
}
export async function DELETE(request:Request){
 try{checkOrigin(request);const user=await identity(request),payload=await body(request,1024);if(payload.confirm!=='DELETE')throw new HttpError(400,'Type DELETE to confirm.');await db().batch([db().prepare('DELETE FROM easytime_sessions WHERE owner=?').bind(user.id),db().prepare('DELETE FROM easytime_accounts WHERE id=?').bind(user.id)]);return json({deleted:true},200,{'Set-Cookie':'easytime_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});}
 catch(e){return failure(e);}
}
