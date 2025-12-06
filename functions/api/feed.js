export async function onRequest(context) {
  // 1. Hämta URLer från miljövariabel (kommaseparerad sträng)
  // Fallback till hårdkodat om variabeln saknas (bra för lokal dev)
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

      // SÄKERHETSKONTROLL & NORMALISERING
      if (Array.isArray(data)) {
        itemsToProcess = data;
      } else if (typeof data === 'object') {
        itemsToProcess = Object.keys(data).map(key => ({
            entityID: key,
            ...data[key]
        }));
      }

      for (const item of itemsToProcess) {
        // Filtrera bort SPs (måste ha 'idps')
        if (!item.idps || item.idps.length === 0) continue;

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
