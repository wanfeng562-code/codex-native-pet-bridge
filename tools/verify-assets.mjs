import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../examples/deepseek-v2/assets/',import.meta.url);
const hashes=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const names=['normal','basin','transition','helmet-texture','hissing'];
if(Object.keys(hashes).sort().join()!==names.sort().join()) throw Error('Unexpected asset list');
const updated={};
for(const name of names){
 const bytes=await readFile(new URL('deepseek-'+name+'.webp',root));
 updated[name]=createHash('sha256').update(bytes).digest('hex');
 if(!process.argv.includes('--write') && updated[name]!==hashes[name]) throw Error('Asset hash mismatch: '+name);
}
if(process.argv.includes('--write')) await writeFile(new URL('manifest.json',root),JSON.stringify(updated,null,2)+'\n');
console.log('Verified all five Deepseek V2 atlases.');
