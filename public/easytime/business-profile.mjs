export const BUSINESS_TYPES=[
 {id:'gas_station',name:'Gas station',description:'A fuel station with an hourly team.'},
 {id:'convenience_store',name:'Convenience store',description:'A neighborhood convenience store.'},
 {id:'gas_and_convenience',name:'Gas station & convenience store',description:'A combined fuel and convenience-store business.'},
 {id:'grocery',name:'Grocery / supermarket',description:'A grocery store, food market or supermarket.'},
 {id:'liquor_store',name:'Liquor store',description:'A liquor, wine or beverage retail store.'},
 {id:'cafe_restaurant',name:'Café / restaurant',description:'A café, restaurant or food-service business.'},
 {id:'retail',name:'Retail shop',description:'A general retail or specialty shop.'},
 {id:'salon_service',name:'Salon / service business',description:'A salon, barbershop or service-based team.'},
 {id:'other',name:'Other business',description:'Describe a business type that is not listed.'}
];
export function validateBusinessProfile(values){const {name,type}=values||{};if(typeof name!=='string'||!name.trim()||name.trim().length>180)throw Error('Enter a business name (180 characters maximum).');if(!BUSINESS_TYPES.some(t=>t.id===type))throw Error('Choose a valid business type.');let otherType='';if(type==='other'){if(typeof values.otherType!=='string'||!values.otherType.trim()||values.otherType.trim().length>100)throw Error('Describe your business type (100 characters maximum).');otherType=values.otherType.trim();}return {name:name.trim(),type,otherType};}
export function businessTypeLabel(profile){if(!profile?.type)return 'Not selected';return profile.type==='other'?profile.otherType||'Other business':BUSINESS_TYPES.find(t=>t.id===profile.type)?.name||'Not selected';}
