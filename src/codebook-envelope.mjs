// QDC/XML import is a codebook operation, not an arbitrary XML tag search.
export function codebookEnvelope(doc){
 if(doc.querySelector('parsererror'))throw Error('Invalid XML codebook.');
 const root=doc.documentElement;
 const books=root?.localName==='CodeBook'?[root]:root?.localName==='Project'?[...root.children].filter(el=>el.localName==='CodeBook'):[];
 if(books.length!==1)throw Error('Codebook XML needs a CodeBook root or one Project/CodeBook element.');
 const groups=[...books[0].children].filter(el=>el.localName==='Codes');
 if(groups.length!==1)throw Error('Codebook XML needs exactly one Codes element.');
 const codes=[...groups[0].getElementsByTagNameNS('*','Code')];
 if(codes.length>5000)throw Error('Import at most 5,000 code definitions.');
 return groups[0];
}
export function parseCodebookEnvelope(text,Parser=globalThis.DOMParser){
 if(typeof text!=='string'||text.length>10000000)throw Error('Choose a codebook under 10 MB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Codebook XML declarations and custom entities are not supported.');
 return codebookEnvelope(new Parser().parseFromString(text,'application/xml'));
}
