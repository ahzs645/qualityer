import {inflateSync,strFromU8} from 'fflate';

let table;
const u16=(b,o)=>b[o]|b[o+1]<<8,u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;

/** Standard ZIP CRC-32 (IEEE). `crc` continues an earlier partial result. */
export function crc32(bytes,crc=0){
 if(!table){table=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^c>>>1:c>>>1;table[n]=c;}}
 crc=~crc;for(let i=0;i<bytes.length;i++)crc=table[(crc^bytes[i])&255]^crc>>>8;return ~crc>>>0;
}

export const looksLikeZip=bytes=>bytes.length>=4&&u32(bytes,0)===0x04034b50;

/** A finished ZIP ends with an end-of-central-directory record (plus its optional comment). */
export function hasEndOfCentralDirectory(bytes){
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(bytes,i)===0x06054b50&&i+22+u16(bytes,i+20)===bytes.length)return true;
 return false;
}

/** Walk local file headers of a ZIP that may have stopped early. Complete entries are CRC-checked; the first entry that cannot be finished is reported with the bytes that arrived. Handles stored and deflated entries, with sizes in the header or in data descriptors (as streaming writers such as fflate emit them). */
export function recoverZipEntries(bytes){
 const files={},complete=[],incomplete=[];let offset=0,stop='end-of-data';
 while(offset<bytes.length){
  if(offset+4>bytes.length||offset+30>bytes.length&&u32(bytes,offset)===0x04034b50){incomplete.push({path:null,offset,receivedBytes:0,reason:'An entry header was cut off.'});stop='truncated';break;}
  const sig=u32(bytes,offset);
  if(sig===0x02014b50||sig===0x06054b50){stop='central-directory';break;}
  if(sig!==0x04034b50){stop='unrecognized-data';break;}
  const flags=u16(bytes,offset+6),method=u16(bytes,offset+8),nameLength=u16(bytes,offset+26),start=offset+30+nameLength+u16(bytes,offset+28);
  if(start>bytes.length){incomplete.push({path:null,offset,receivedBytes:0,reason:'An entry header was cut off.'});stop='truncated';break;}
  const path=strFromU8(bytes.subarray(offset+30,offset+30+nameLength),!(flags&0x800));
  let crc=u32(bytes,offset+14),size=u32(bytes,offset+18),length=u32(bytes,offset+22),end=start+size,next=end;
  if(flags&8){
   end=-1;for(let q=bytes.indexOf(0x50,start);q>=0&&q+16<=bytes.length;q=bytes.indexOf(0x50,q+1))if(bytes[q+1]===0x4b&&bytes[q+2]===7&&bytes[q+3]===8&&u32(bytes,q+8)===q-start){end=q;crc=u32(bytes,q+4);size=u32(bytes,q+8);length=u32(bytes,q+12);next=q+16;break;}
   if(end<0){incomplete.push({path,offset,receivedBytes:bytes.length-start,reason:'The download stopped inside this entry.'});stop='truncated';break;}
  }else if(size===0xffffffff||length===0xffffffff){incomplete.push({path,offset,receivedBytes:bytes.length-start,reason:'ZIP64 entries cannot be recovered here.'});stop='unsupported';break;}
  else if(end>bytes.length){incomplete.push({path,offset,receivedBytes:bytes.length-start,expectedBytes:length,reason:'The download stopped inside this entry.'});stop='truncated';break;}
  let data=null;try{data=method===0?bytes.subarray(start,end):method===8?inflateSync(bytes.subarray(start,end),{out:new Uint8Array(length)}):null;}catch{}
  if(!data||data.length!==length||crc32(data)!==crc)incomplete.push({path,offset,receivedBytes:end-start,expectedBytes:length,reason:data?'Checksum failed.':'Unsupported or damaged compression.'});
  else if(!path.endsWith('/')){files[path]=data;complete.push({path,bytes:length});}
  offset=next;
 }
 return {truncated:!hasEndOfCentralDirectory(bytes),totalBytes:bytes.length,scannedBytes:offset,stop,files,complete,incomplete};
}
