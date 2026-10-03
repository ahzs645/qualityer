import {documentArchive,decodeSourceText} from './source-text-import.mjs';
export function docxMetadata(bytes){
 const entries=documentArchive(bytes),core=entries['docProps/core.xml'];if(!core)return {};
 const text=decodeSourceText(core).text;if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Document metadata contains unsupported XML declarations.');
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Document metadata XML could not be parsed.');
 const metadata={};for(const name of ['title','creator','subject','description','keywords','lastModifiedBy','created','modified','revision','category']){const value=doc.getElementsByTagNameNS('*',name)[0]?.textContent;if(value!=null){if(value.length>16000)throw Error('Document metadata field exceeds the import limit.');metadata[name]=value;}}
 return metadata;
}
