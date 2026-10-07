const {chromium}=require('/opt/node22/lib/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage({viewport:{width:1280,height:720}});const er=[];p.on('pageerror',e=>er.push(e.message));
await p.goto('http://localhost:'+(process.env.PORT||3000));await p.waitForTimeout(1500);const a=await p.textContent('#ttText');await p.waitForTimeout(1500);const c=await p.textContent('#ttText');console.log(a,'|',c,er);await p.screenshot({path:'tt.png'});await b.close()})()
