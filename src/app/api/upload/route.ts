import { NextRequest,NextResponse } from "next/server";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {currentUser} from "@/lib/auth";
export const runtime="nodejs";
const mimeToExt:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4"};
function hasValidSignature(type:string,bytes:Uint8Array){
 if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(type==="image/png")return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
 if(type==="image/webp")return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(type==="video/mp4")return bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==="ftyp";
 return false;
}
export async function POST(req:NextRequest){
 const user=await currentUser();
 if(!user || user.role!=="OWNER" || !user.shop || user.shop.status==="SUSPENDED" || user.mustChangePassword)return NextResponse.json({error:"Acesso não autorizado"},{status:403});
 let form:FormData;
 try{form=await req.formData();}catch{return NextResponse.json({error:"Envio de arquivo inválido"},{status:400});}
 const file=form.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"Arquivo não enviado"},{status:400});
 const ext=mimeToExt[file.type];
 if(!ext)return NextResponse.json({error:"Apenas JPG, PNG, WEBP ou MP4"},{status:400});
 const max=file.type==="video/mp4"?40*1024*1024:12*1024*1024;
 if(file.size===0||file.size>max)return NextResponse.json({error:"Arquivo excede o limite permitido"},{status:413});
 const bytes=Buffer.from(await file.arrayBuffer());
 if(!hasValidSignature(file.type,bytes))return NextResponse.json({error:"O conteúdo do arquivo não corresponde ao formato informado"},{status:415});
 const name=randomUUID()+"."+ext;
 const base=process.env.UPLOAD_DIR||path.join(process.cwd(),"uploads");
 try{
  await mkdir(base,{recursive:true});
  await writeFile(path.join(base,name),bytes,{flag:"wx"});
 }catch{
  return NextResponse.json({error:"Não foi possível armazenar o arquivo. Verifique o armazenamento persistente do servidor."},{status:503});
 }
 return NextResponse.json({url:"/api/media/"+name},{headers:{"Cache-Control":"no-store"}});
}
