import { env } from 'cloudflare:workers';
import { createHash, randomBytes } from 'node:crypto';
import { emptyState, validateState } from '../../public/easytime/domain.mjs';

export type Identity={id:string,email:string,name:string,provider:string};
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export const config=()=>env as unknown as Record<string,string|D1Database|undefined>;
export function db():D1Database {const binding=config().DB;if(!binding||typeof binding==='string')throw new HttpError(503,'Cloud saving is temporarily unavailable. Keep this page open and retry.');return binding;}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export function origin(request:Request){return String(config().APP_ORIGIN??new URL(request.url).origin);}
export function checkOrigin(request:Request){if(request.headers.get('origin')!==origin(request))throw new HttpError(403,'This request must come from EasyTime.');}
export async function body(request:Request,limit=2100000):Promise<any>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'Send JSON data.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Missing request.');const parts:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new HttpError(413,'This upload is too large.');}parts.push(value);}
 const bytes=new Uint8Array(size);let cursor=0;for(const p of parts){bytes.set(p,cursor);cursor+=p.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'The file is not valid JSON.');}
}
export async function identity(request:Request):Promise<Identity>{
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)easytime_session=([A-Za-z0-9_-]{43})/);
 if(cookie){const session=await db().prepare('SELECT owner,email,name FROM easytime_sessions WHERE hash=? AND expires>?').bind(hash(cookie[1]),Date.now()).first<{owner:string,email:string,name:string}>();if(session)return {id:session.owner,email:session.email,name:session.name,provider:'Email / Google'};}
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 if(!id||!email)throw new HttpError(401,'Sign in to open your private account.');
 let name=email;const raw=request.headers.get('oai-authenticated-user-full-name');if(raw&&request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(raw);}catch{}}
 return {id:'chatgpt:'+id,email,name,provider:'ChatGPT'};
}
export async function ensureAccount(user:Identity){
 // Keep the legacy trial_end column for database compatibility; access has no trial or paid tier.
 const now=Date.now();await db().batch([
  db().prepare('INSERT INTO easytime_accounts(id,email,name,created_at,trial_end) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').bind(user.id,user.email,user.name,now,0),
  db().prepare('INSERT INTO easytime_states(owner,payload,revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(owner) DO NOTHING').bind(user.id,JSON.stringify(emptyState()),now),
 ]);return db().prepare('SELECT * FROM easytime_accounts WHERE id=?').bind(user.id).first<any>();
}
export async function accountState(id:string){const row=await db().prepare('SELECT payload,revision,updated_at FROM easytime_states WHERE owner=?').bind(id).first<any>();if(!row)throw new HttpError(404,'Your account could not be found.');return {state:JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at};}
export async function saveState(id:string,state:any,revision:number){
 try{validateState(state);}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid account data.');}
 if(!Number.isInteger(revision)||revision<0)throw new HttpError(400,'Missing account revision.');const now=Date.now();
 const results=await db().batch([
  db().prepare('INSERT INTO easytime_backups(id,owner,revision,payload,created_at) SELECT ?,owner,revision,payload,? FROM easytime_states WHERE owner=? AND revision=?').bind(crypto.randomUUID(),now,id,revision),
  db().prepare('UPDATE easytime_states SET payload=?,revision=revision+1,updated_at=? WHERE owner=? AND revision=?').bind(JSON.stringify(state),now,id,revision),
  db().prepare('DELETE FROM easytime_backups WHERE owner=? AND id NOT IN (SELECT id FROM easytime_backups WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 10)').bind(id,id),
 ]);if(results[1].meta.changes!==1)throw new HttpError(409,'Another device changed your account. Download your unsaved backup, then reload the cloud version.');return {revision:revision+1,updatedAt:now};
}
export function json(data:unknown,status=200,extra:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
export function failure(error:unknown){if(error instanceof HttpError)return json({error:error.message},error.status);console.error('EasyTime request failed',error instanceof Error?error.message:'Unexpected error');return json({error:'EasyTime is temporarily unavailable. Your current entries remain on this page.'},503);}
