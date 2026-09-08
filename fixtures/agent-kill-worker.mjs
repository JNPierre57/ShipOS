import {Spool} from '../dist/apps/agent/src/spool.js';import {source} from '../dist/packages/testkit/src/index.js';
const spool=new Spool(process.argv[2]);spool.append(source({event:'Died'}),()=>process.kill(process.pid,'SIGKILL'));
