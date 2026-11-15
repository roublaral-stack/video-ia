import {writeFile} from 'node:fs/promises';
import {runProduction} from '../production.mjs';
process.umask(0o077);
const [configFile,resultFile]=process.argv.slice(2);
try{const result=await runProduction(configFile);await writeFile(resultFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
catch(e){console.error(e.message);process.exitCode=1;}
