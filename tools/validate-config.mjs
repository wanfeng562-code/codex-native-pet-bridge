import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseConfiguration} from '../bridge/config.mjs';
const raw=JSON.parse((await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
parseConfiguration(raw,{repositoryRoot:fileURLToPath(new URL('../',import.meta.url))});
console.log('Configuration validated.');
