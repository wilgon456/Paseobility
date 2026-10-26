import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { connectionSchema, requestBridge, sshArgs, SAFE_ERROR } from '../server/transport.ts';
const config = {host:'100.108.51.25', user:'fixture_user', bridge:'C:\\fixture\\gui-bridge.ps1', expectedHost:'VAXPORT', allowSubmit:true};
function runner(response, code=0, inspect=()=>{}) {
  return (file, args, options) => {
    inspect(file, args, options);
    const child = new EventEmitter();
    child.stdin=new PassThrough(); child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.kill=()=>{};
    child.stdin.on('finish',()=>{
      const bytes=Buffer.from(JSON.stringify(response));
      // Force splits inside multibyte UTF-8 Korean strings.
      for(const byte of bytes) child.stdout.write(Buffer.from([byte]));
      child.stderr.write('fixture-secret-never-relay'); child.emit('close',code);
    });
    return child;
  };
}
test('only private tailnet addresses and literal Windows bridge paths',()=>{
  for(const host of ['8.8.8.8','100.1.2.3','100.128.1.1','100.108.999.1','-oProxyCommand=x','evil.example']) assert.equal(connectionSchema.safeParse({...config,host}).success,false);
  assert.equal(connectionSchema.safeParse({...config,host:'vaxport.tail123.ts.net'}).success,true);
  for(const bridge of ['C:\\test"; whoami.ps1','C:\\test&whoami.ps1','C:\\$(whoami).ps1']) assert.equal(connectionSchema.safeParse({...config,bridge}).success,false);
});
test('host key verification and noninteractive SSH are mandatory',()=>{
  const args=sshArgs(config,false);
  assert.ok(args.includes('StrictHostKeyChecking=yes')); assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('--')); assert.ok(args.at(-1).includes(' -AllowSubmit'));
  assert.throws(()=>sshArgs({...config,allowSubmit:false},true));
  assert.ok(!sshArgs({...config,allowSubmit:false},false).at(-1).includes(' -AllowSubmit'));
});
test('task text remains stdin data, never shell arguments',async()=>{
  const request={action:'submit',task:{prompt:'$(whoami); " & 한글'}};
  const out=await requestBridge(request,config,runner({ok:true,result:{id:'test',state:'queued'}},0,(file,args,options)=>{
    assert.equal(file,'ssh'); assert.equal(options.shell,false); assert.ok(!args.join(' ').includes('whoami'));
  }));
  assert.equal(out.state,'queued');
});
test('Korean JSON survives arbitrary byte chunking',async()=>{
  const out=await requestBridge({action:'status'},config,runner({ok:true,result:{host:'VAXPORT',title:'한글 작업 상태'}}));
  assert.equal(out.title,'한글 작업 상태');
});
test('wrong host, remote failure and malformed reply never expose raw errors',async()=>{
  for(const [value,code] of [[{ok:true,result:{host:'OTHER'}},0],[{ok:false,error:'fixture-secret-never-relay'},1]]) {
    await assert.rejects(requestBridge({action:'status'},config,runner(value,code)),e=>e.message===SAFE_ERROR);
  }
});
test('bounded input rejects before launching SSH',async()=>{
  let launched=false;
  await assert.rejects(requestBridge({action:'submit',prompt:'x'.repeat(200001)},config,()=>{launched=true;}));
  assert.equal(launched,false);
});
