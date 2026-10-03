// SQL.js's normal text reader strips a leading U+FEFF and truncates embedded NUL.
// Project allowlisted text fields through BLOB bytes, with type markers that distinguish original BLOBs.
const TYPE_PREFIX='__rw_sqlite_type_';
const identifier=name=>{if(typeof name!=='string'||!name||name.includes('\0')||name.startsWith(TYPE_PREFIX))throw Error('Unsupported SQLite column identifier.');return '"'+name.replaceAll('"','""')+'"';};
export function sqliteTextEncoding(db){const value=db.exec('PRAGMA encoding')[0]?.values?.[0]?.[0];const labels={'UTF-8':'utf-8','UTF-16le':'utf-16le','UTF-16be':'utf-16be'};if(!labels[value])throw Error('Unsupported SQLite text encoding.');return labels[value];}
export function sqliteTextSelection(columns,textFields=null){return columns.flatMap(name=>{const column=identifier(name);if(textFields&&!textFields.has(name))return [column];const marker='"'+(TYPE_PREFIX+name).replaceAll('"','""')+'"';return ['CASE WHEN typeof('+column+")='text' THEN CAST("+column+' AS BLOB) ELSE '+column+' END AS '+column,'typeof('+column+') AS '+marker];}).join(',');}
export function decodeSQLiteTextRows(rows,textFields=null,encoding='utf-8'){const decoder=new TextDecoder(encoding,{fatal:true,ignoreBOM:true});return rows.map(row=>Object.fromEntries(Object.entries(row).filter(([name])=>!name.startsWith(TYPE_PREFIX)).map(([name,value])=>{if(textFields&&!textFields.has(name)||row[TYPE_PREFIX+name]!=='text')return [name,value];if(!(value instanceof Uint8Array))throw Error('SQLite text was not read through its byte-preserving column projection.');try{return [name,decoder.decode(value)];}catch{throw Error('SQLite contains invalid text bytes in '+name+'. Export corrected Unicode text from the original application.');}})));}
export function readSQLiteTable(db,table,columns,{where='',params=[],limit=200000}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>200000)throw Error('Unsupported SQLite record limit.');
 const result=db.exec('SELECT '+sqliteTextSelection(columns)+' FROM '+identifier(table)+where+' LIMIT '+(limit+1),params)[0];
 const rows=result?result.values.map(values=>Object.fromEntries(result.columns.map((name,i)=>[name,values[i]]))):[];
 if(rows.length>limit)throw Error('SQLite project table exceeds the browser import record limit.');
 return decodeSQLiteTextRows(rows,null,sqliteTextEncoding(db));
}
