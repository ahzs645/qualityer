// Browsers and Drive use several MIME labels for the same recording container.
export function mediaFileType(file){
 const supplied=(file.type||'').toLowerCase();
 if(['audio/x-m4a','audio/m4a'].includes(supplied))return 'audio/mp4';
 if(supplied==='audio/x-quicktime')return 'audio/quicktime';
 if(supplied&&supplied!=='application/octet-stream')return supplied;
 const extension=file.name?.split('.').at(-1)?.toLowerCase();
 return {m4a:'audio/mp4',qta:'audio/quicktime',mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',mov:'video/quicktime',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf'}[extension]||supplied;
}
