export async function onRequest(context) {
  const envFeeds = context.env.FEDERATION_FEEDS;
  const defaultFeeds = [
    "https://fed.sambi.se/prod/ds/site/federation.json",
    "https://fed.skolfederation.se/prod/ds/site/federation.json"
  ];

  const feedUrls = envFeeds 
    ? envFeeds.split(',').map(url => url.trim()) 
    : defaultFeeds;

  try {
    const responses = await Promise.all(feedUrls.map(url => fetch(url)));
    let validIdps = [];

    for (const response of responses) {
      if (!response.ok) continue;
      
      const data = await response.json();
      let itemsToProcess = [];

      // Normalisera data (Array vs Object)
      if (Array.isArray(data)) {
        itemsToProcess = data;
      } else if (typeof data === 'object') {
        itemsToProcess = Object.keys(data).map(key => ({
            entityID: key,
            ...data[key]
        }));
      }

      for (const item of itemsToProcess) {
        // 1. Filtrera bort SPs (måste ha 'idps')
        if (!item.idps || item.idps.length === 0) continue;

        // --- NYTT: REFEDS HIDE FROM DISCOVERY ---
        // Vi kollar om attributet finns och om det innehåller "true"
        const hideAttr = "http://refeds.org/metadata/hide-from-discovery";
        
        // Ibland ligger attributen direkt i roten, ibland i ett underobjekt beroende på feed-format
        const attrs = item.entityAttributes || {};
        
        // Attributet är ofta en array av strängar: ["true"]
        if (attrs[hideAttr] && attrs[hideAttr].some(val => val === 'true')) {
            // Om flaggan är satt, hoppa över denna IdP
            continue; 
        }
        // ----------------------------------------

        // Namnhantering
        let name = item.entityID;
        if (item.organization) {
            const nameObj = item.organization.displayName || item.organization.fullName;
            if (nameObj) {
                name = nameObj['sv'] || nameObj['sv-SE'] || 
                       nameObj['en'] || nameObj['en-IN'] || nameObj['en-US'] || 
                       Object.values(nameObj)[0];
            }
        }

        validIdps.push({
            entityID: item.entityID,
            title: name
        });
      }
    }

    // Ta bort dubbletter och sortera
    const uniqueMap = new Map();
    validIdps.forEach(item => uniqueMap.set(item.entityID, item));
    
    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => 
        (a.title || "").localeCompare(b.title || "", 'sv')
    );

    return new Response(JSON.stringify(sortedList), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600" 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
