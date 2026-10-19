self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('push',e=>{e.waitUntil((async()=>{let list=[];
try{const r=await fetch('/api/push/pending',{credentials:'same-origin'});if(r.ok)list=await r.json()}catch(x){}
if(!Array.isArray(list)||!list.length)list=[{id:'g',title:'InstaPilot',body:'عندك تحديث جديد بالحجوزات',url:'/#/bookings'}];
for(const n of list)await self.registration.showNotification(n.title,{body:n.body,tag:'n'+n.id,lang:'ar',dir:'rtl',data:{url:n.url||'/#/bookings'}})})())});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const u=(e.notification.data&&e.notification.data.url)||'/#/bookings';
const cs=await clients.matchAll({type:'window',includeUncontrolled:true});for(const c of cs){if('focus' in c){await c.focus();if(c.navigate)try{await c.navigate(u)}catch(x){}return}}
await clients.openWindow(u)})())});
