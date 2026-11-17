import {BUSINESS_TYPES} from './business-profile.mjs';

export function businessProfileUI(ctx){
 const {db,access,esc,panel,btn,input,select,modal,save}=ctx,profile=db.businessProfile||{},owner=access?.role==='Owner';
 const current=BUSINESS_TYPES.find(type=>type.id===profile.type);
 const typeName=current?(current.id==='other'&&profile.otherType?profile.otherType:current.name):'Not selected';
 function render(){
  const details=`<div style="padding:20px"><dl style="margin:0"><div class="list-item"><dt>Business name</dt><dd style="margin:0"><strong>${esc(profile.name||'Not set')}</strong></dd></div><div class="list-item"><dt>Business type</dt><dd style="margin:0"><strong>${esc(typeName)}</strong></dd></div></dl>${profile.updatedAt&&Number.isFinite(Date.parse(profile.updatedAt))?`<p class="good-note">Updated ${esc(new Date(profile.updatedAt).toLocaleString())}</p>`:''}</div>`;
  const overview=panel('Business profile','Enter your business name and choose its type.',details,owner?btn('wf:businessProfile',current?'Edit business profile':'Choose business type'):'',owner?'Changing the business type does not change your features, prices or saved records.':'Only the business owner can update this profile.');
  if(!owner)return overview;
  const cards=BUSINESS_TYPES.map(type=>`<section style="border:1px solid ${type.id===profile.type?'#8877dd':'#dedbea'};border-radius:12px;padding:18px;background:white;display:flex;flex-direction:column;gap:10px"><div><h3 style="margin:0;font-size:1rem">${esc(type.name)}${type.id===profile.type?' <span class="badge">Selected</span>':''}</h3><p style="margin:8px 0 0;color:var(--muted);font-size:.85rem;line-height:1.5">${esc(type.description)}</p></div><div style="margin-top:auto">${btn('wf:businessProfile',type.id===profile.type?'Edit selection':'Choose this type',type.id,true)}</div></section>`).join('');
  return overview+panel('Choose a business type','Choose the closest match. If it is not listed, choose Other and enter your business type.',`<div style="padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px">${cards}</div>`);
 }
 function action(type,id){
  if(type!=='wf:businessProfile')return false;
  if(!owner)throw Error('Only the business owner can update the business profile.');
  const chosen=BUSINESS_TYPES.some(type=>type.id===id)?id:profile.type||'';
  const options='<option value="">Choose a business type</option>'+BUSINESS_TYPES.map(type=>`<option value="${esc(type.id)}" ${chosen===type.id?'selected':''}>${esc(type.name)}</option>`).join('');
  modal(current?'Edit business profile':'Choose your business type',input('name','Business name','text',profile.name||'','required maxlength="180"')+select('type','Business type',options)+input('otherType','Describe your business','text',profile.otherType||'','maxlength="100"')+'<p class="full">Changing the business type does not change your features, prices or saved records.</p>',values=>save('wf:businessProfile',{name:values.name,type:values.type,otherType:values.type==='other'?values.otherType||'':''}),'Save business profile');
  const form=document.getElementById('editor'),updateOther=()=>{const field=form.elements.otherType,isOther=form.elements.type.value==='other';field.required=isOther;field.disabled=!isOther;field.closest('label').hidden=!isOther;};
  form.elements.type.onchange=updateOther;updateOther();return true;
 }
 return {render,action};
}
