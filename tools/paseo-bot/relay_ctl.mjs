#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeMapping} from './relay.mjs';

const [action,...args]=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--') || !args[i+1])throw Error('Expected --name value');options[args[i].slice(2)]=args[i+1];}
if(action!=='switch' || !/^[A-Za-z0-9_-]{1,80}$/.test(options.thread || '') || !options.provider || !options.model)throw Error('Usage: switch --thread ID --provider PROVIDER --model MODEL [--thinking ID]');
const home=process.env.PASEO_BOT_ASSISTANT_HOME || process.cwd();
const file=path.join(home,'.relay-requests',`${options.thread}.json`);
writeMapping(file,{id:randomUUID(),provider:options.provider,model:options.model,thinking:options.thinking || null});
process.stdout.write('Model switch requested.\n');
