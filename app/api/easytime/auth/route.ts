import { body, checkOrigin, config, db, ensureAccount, failure, hash, HttpError, json, origin } from '../../../../lib/easytime/server';
import { createProviderSession, firebaseCall, verifiedFirebaseIdentity } from '../../../../lib/easytime/provider-auth';
export const dynamic='force-dynamic';
export async function GET(){return json({emailEnabled:!!(config().FIREBASE_API_KEY&&config().FIREBASE_PROJECT_ID),googleClientId:config().FIREBASE_API_KEY&&config().FIREBASE_PROJECT_ID?config().GOOGLE_CLIENT_ID??null:null,chatgptPath:'/signin-with-chatgpt?return_to=%2Feasytime%2Findex.html'});}
export async function POST(request:Request){try{checkOrigin(request);const p=await body(request,20000);
 if(p.action==='logout'){const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)easytime_session=([A-Za-z0-9_-]{43})/);if(cookie)await db().prepare('DELETE FROM easytime_sessions WHERE hash=?').bind(hash(cookie[1])).run();return json({ok:true},200,{'Set-Cookie':'easytime_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});}
 if(['login','signup','reset'].includes(p.action)){if(typeof p.email!=='string'||p.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw new HttpError(400,'Enter a valid email.');if(p.action==='reset'){try{await firebaseCall('sendOobCode',{requestType:'PASSWORD_RESET',email:p.email});}catch(e){if(e instanceof HttpError&&e.status===503)throw e;}return json({message:'If this account exists, a password recovery email will arrive shortly.'});}if(typeof p.password!=='string'||p.password.length<10||p.password.length>128)throw new HttpError(400,'Use a password with 10–128 characters.');}
 let result:any;
 if(p.action==='signup'){result=await firebaseCall('signUp',{email:p.email,password:p.password,returnSecureToken:true});await firebaseCall('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:result.idToken});return json({message:'Check your inbox to verify your email, then sign in.'});}
 if(p.action==='login')result=await firebaseCall('signInWithPassword',{email:p.email,password:p.password,returnSecureToken:true});
 else if(p.action==='google'){if(typeof p.credential!=='string'||p.credential.length>15000)throw new HttpError(400,'Invalid Google sign-in.');result=await firebaseCall('signInWithIdp',{postBody:new URLSearchParams({id_token:p.credential,providerId:'google.com'}).toString(),requestUri:origin(request)+'/easytime/login.html',returnSecureToken:true,returnIdpCredential:false});}
 else throw new HttpError(400,'Unknown sign-in action.');
 const user=await verifiedFirebaseIdentity(result.idToken);await ensureAccount(user);return json({ok:true},200,{'Set-Cookie':await createProviderSession(user,request)});
 }catch(e){return failure(e);}}
