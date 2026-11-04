#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeMapping} from './relay.mjs';

const [action,...args]=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--') || !args[i+1])throw Error('Expected --name value');options[args[i].slice(2)]=args[i+1];}
const home=process.env.PASEO_BOT_ASSISTANT_HOME || process.cwd();
if(!/^[A-Za-z0-9_-]{1,80}$/.test(options.thread || ''))throw Error('A thread ID is required');
if(action==='switch' && options.provider && options.model){
  const file=path.join(home,'.relay-requests',`${options.thread}.json`);
  writeMapping(file,{id:randomUUID(),provider:options.provider,model:options.model,thinking:options.thinking || null});
  process.stdout.write('Model switch requested.\n');
}else if(action==='send-file' && options.file){
  const id=randomUUID(),file=path.join(home,'.relay-outbox',`${id}.json`);
  writeMapping(file,{id,thread:options.thread,file:path.resolve(options.file),caption:options.caption || ''});
  process.stdout.write('File delivery requested.\n');
}else throw Error('Usage: switch --thread ID --provider PROVIDER --model MODEL [--thinking ID] | send-file --thread ID --file PATH [--caption TEXT]');
