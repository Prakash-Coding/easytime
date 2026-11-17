import { body, checkOrigin, db, failure, HttpError, identity, json } from '../../../../lib/easytime/server';
import { emptyPayroll, upgrade, applyWorkforce } from '../../../../public/easytime/workforce-domain.mjs';
import { membership, authorize, project } from '../../../../public/easytime/workforce-access.mjs';
export const dynamic='force-dynamic';
async function load(owner:string){
 await db().prepare('INSERT INTO easytime_payroll_workspaces(owner,payload,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(owner) DO NOTHING').bind(owner,JSON.stringify(emptyPayroll()),Date.now()).run();
 const row=await db().prepare('SELECT payload,revision,updated_at FROM easytime_payroll_workspaces WHERE owner=?').bind(owner).first<{payload:string,revision:number,updated_at:number}>();
 if(!row)throw new HttpError(503,'Could not open your payroll workspace.');return {state:upgrade(JSON.parse(row.payload)),revision:row.revision,updatedAt:row.updated_at};
}
async function context(request:Request){const user=await identity(request),owner=new URL(request.url).searchParams.get('workspace')||user.id;
 // Do not create a workspace on behalf of another user.
 if(owner!==user.id){const row=await db().prepare('SELECT payload FROM easytime_payroll_workspaces WHERE owner=?').bind(owner).first<{payload:string}>();if(!row)throw new HttpError(403,'Business access is not available.');try{membership(JSON.parse(row.payload),user,owner);}catch{throw new HttpError(403,'Business access is not available.');}}
 const current=await load(owner);let access;try{access=membership(current.state,user,owner);}catch{throw new HttpError(403,'Business access is not available.');}return {user,owner,current,access};}
export async function GET(request:Request){try{const {user,owner,current,access}=await context(request);
 const list=await db().prepare("SELECT DISTINCT w.owner,json_extract(w.payload,'$.businessProfile.name') AS name FROM easytime_payroll_workspaces w, json_each(w.payload, '$.workforce.members') m WHERE json_extract(m.value,'$.email')=? AND json_extract(m.value,'$.active')=1").bind(user.email.toLowerCase()).all<{owner:string,name:string|null}>();
 return json({...current,state:project(current.state,access),access,workspace:owner,workspaces:[{owner:user.id,label:owner===user.id?current.state.businessProfile?.name||'My business':'My business'},...(list.results||[]).map(x=>({owner:x.owner,label:x.name||'Shared business · '+x.owner.slice(-8)}))],user:{name:user.name,email:user.email}});
 }catch(e){return failure(e);}}
export async function POST(request:Request){try{
 checkOrigin(request);const {user,owner,current,access}=await context(request),input=await body(request,40000);
 if(!Number.isInteger(input.revision)||input.revision!==current.revision)throw new HttpError(409,'Another tab or device saved a change. Reload the latest records before retrying.');
 try{authorize(current.state,input.command,access);}catch(e){throw new HttpError(403,e instanceof Error?e.message:'Action not permitted.');}
 let next;try{next=applyWorkforce(current.state,input.command,user.name||user.email);}catch(e){throw new HttpError(400,e instanceof Error?e.message:'Invalid payroll action.');}
 const result=await db().prepare('UPDATE easytime_payroll_workspaces SET payload=?,revision=revision+1,updated_at=? WHERE owner=? AND revision=?').bind(JSON.stringify(next),Date.now(),owner,current.revision).run();
 if(result.meta.changes!==1)throw new HttpError(409,'Another device saved a change. Reload and retry.');return json({state:project(next,access),revision:current.revision+1,updatedAt:Date.now()});
 }catch(e){return failure(e);}}
