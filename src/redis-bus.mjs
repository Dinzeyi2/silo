import { createConnection } from "node:net";
import { connect as connectTls } from "node:tls";
import { randomUUID } from "node:crypto";

const command=(...parts)=>`*${parts.length}\r\n${parts.map(part=>`$${Buffer.byteLength(String(part))}\r\n${part}\r\n`).join("")}`;
function parseValue(buffer,start=0){const end=buffer.indexOf("\r\n",start);if(end<0)return null;const prefix=String.fromCharCode(buffer[start]),header=buffer.subarray(start+1,end).toString(),cursor=end+2;if(prefix==="$"){const length=Number(header);if(length<0)return {value:null,next:cursor};if(buffer.length<cursor+length+2)return null;return {value:buffer.subarray(cursor,cursor+length).toString(),next:cursor+length+2};}if(prefix==="*" ){const values=[];let next=cursor;for(let i=0;i<Number(header);i++){const parsed=parseValue(buffer,next);if(!parsed)return null;values.push(parsed.value);next=parsed.next;}return {value:values,next};}if(["+",":","-"].includes(prefix))return {value:header,next:cursor};return null;}
function messages(buffer,onMessage){let cursor=0;while(cursor<buffer.length){const parsed=parseValue(buffer,cursor);if(!parsed)break;cursor=parsed.next;if(Array.isArray(parsed.value)&&parsed.value[0]==="message")onMessage(parsed.value[1],parsed.value[2]);}return buffer.subarray(cursor);}

export function createRedisBus(url=process.env.SILO_REDIS_URL,{channel="silo:events"}={}){
  if(!url)return null;const parsed=new URL(url),tls=parsed.protocol==="rediss:",port=Number(parsed.port||(tls?6380:6379)),host=parsed.hostname,db=parsed.pathname.slice(1)||"0",password=decodeURIComponent(parsed.password||""),id=randomUUID();let subscriber,closed=false,listeners=new Set();
  const open=()=>new Promise((resolve,reject)=>{const socket=tls?connectTls({host,port,rejectUnauthorized:true},resolve):createConnection({host,port},resolve);socket.once("error",reject);});
  async function prepare(socket){if(password)socket.write(command("AUTH",password));if(db!=="0")socket.write(command("SELECT",db));}
  async function subscribe(){subscriber=await open();await prepare(subscriber);subscriber.write(command("SUBSCRIBE",channel));let buffer=Buffer.alloc(0);subscriber.on("data",chunk=>{buffer=messages(Buffer.concat([buffer,chunk]),(_channel,payload)=>{try{const event=JSON.parse(payload);if(event.origin!==id)for(const listener of listeners)listener(event.projectId,event.event);}catch{}});});subscriber.on("close",()=>{if(!closed)setTimeout(subscribe,1000);});subscriber.on("error",()=>{});}
  subscribe().catch(()=>{if(!closed)setTimeout(subscribe,1000);});
  return {id,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},async publish(projectId,event){const socket=await open();await prepare(socket);socket.end(command("PUBLISH",channel,JSON.stringify({origin:id,projectId,event})));},close(){closed=true;subscriber?.destroy();listeners.clear();}};
}
