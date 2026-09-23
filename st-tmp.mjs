const ids=["STEngineering","SingaporeTechnologiesEngineering","STEngineeringLtd","STEngineering1","ST-Engineering"];
for(const id of ids){
  try{
    const r=await fetch(`https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=100`);
    if(!r.ok){console.log(id,"-> HTTP",r.status);continue;}
    const d=await r.json();
    console.log(`${id.padEnd(34)} totalFound=${d.totalFound ?? 0}  returned=${(d.content||[]).length}`);
  }catch(e){console.log(id,"-> ERR",e.message);}
}
