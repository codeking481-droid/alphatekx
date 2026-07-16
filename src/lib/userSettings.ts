import { supabase } from './supabase'
export type UserKeys={openai:string;supabase:string;paystack:string}
const empty:UserKeys={openai:'',supabase:'',paystack:''}
const encode=(value:string)=>value?btoa(unescape(encodeURIComponent(value))):''
const decode=(value:string)=>{try{return decodeURIComponent(escape(atob(value)))}catch{return''}}
export async function getUserKeys():Promise<UserKeys>{if(!supabase)return empty;const{data:{user}}=await supabase.auth.getUser();if(!user)return empty;const{data,error}=await supabase.from('user_settings').select('api_keys').eq('user_id',user.id).maybeSingle();if(error||!data)return empty;const keys=data.api_keys??{};return{openai:decode(keys.openai??''),supabase:decode(keys.supabase??''),paystack:decode(keys.paystack??'')}}
export async function saveUserKeys(keys:UserKeys){if(!supabase)throw new Error('Supabase is required');const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in required');const api_keys={openai:encode(keys.openai.trim()),supabase:encode(keys.supabase.trim()),paystack:encode(keys.paystack.trim())};const{error}=await supabase.from('user_settings').upsert({user_id:user.id,api_keys,updated_at:new Date().toISOString()});if(error)throw error}
