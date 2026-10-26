import {discoverPets,PetSession} from '../bridge/cdp.mjs';

const port=Number(process.argv[2] ?? 46873);
const targets=await discoverPets(port);
if(targets.length!==1) throw Error('Show one native pet first. Expected one overlay, found '+targets.length);
const session=new PetSession(targets[0].webSocketDebuggerUrl,port);
try {
  await session.open();
  // Read only native pet identity/state, never chat or account contents.
  const pet=await session.evaluate(`(()=>{const p=document.querySelector('[data-codex-pet-id][data-codex-pet-state]');return p?{petId:p.dataset.codexPetId,action:p.dataset.codexPetState}:null;})()`);
  if(!pet?.petId) throw Error('No visible native pet; select and show a pet in the client.');
  console.log(JSON.stringify(pet,null,2));
} finally {session.close();}
