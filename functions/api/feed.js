export async function onRequest(context) {
  const feeds = [
    "https://fed.sambi.se/prod/ds/site/federation.json",
    "https://fed.skolfederation.se/prod/ds/site/federation.json"
  ];

  try {
    const responses = await Promise.all(feeds.map(url => fetch(url)));
    let rawItems = [];

    for (const response of responses) {
      if (response.ok) {
        const data = await response.json();
        // Vissa feeds returnerar en array direkt, andra kanske ett objekt.
        // Vi säkerställer att vi hanterar arrayen.
        if (Array.isArray(data)) {
            rawItems = rawItems.concat(data);
        }
      }
    }

    const processedItems = rawItems.map(item => {
      // 1. Hantera namn (Defensive coding)
      let displayName = item.entityID; // Fallback till ID om inget namn finns
      const displayNames = item.DisplayNames || []; // Om DisplayNames saknas, använd tom array

      if (displayNames.length > 0) {
        const svName = displayNames.find(n => n.lang === 'sv' || n.lang === 'sv-se');
        const enName = displayNames.find(n => n.lang === 'en' || n.lang === 'en-us');
        
        if (svName && svName.value) displayName = svName.value;
        else if (enName && enName.value) displayName = enName.value;
        else if (displayNames[0].value) displayName = displayNames[0].value;
      }

      // 2. Hantera sökord (Defensive coding)
      let keywordString = "";
      const keywords = item.Keywords || [];
      if (Array.isArray(keywords)) {
          keywordString = keywords.map(k => k.value || "").join(" ");
      }

      return {
        entityID: item.entityID,
        title: displayName,
        keywords: keywordString
      };
    });

    // Ta bort dubbletter
    const uniqueMap = new Map();
    processedItems.forEach(item => {
        if(item.entityID) uniqueMap.set(item.entityID, item);
    });
    
    // Sortera
    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => 
        a.title.localeCompare(b.title, 'sv')
    );

    return new Response(JSON.stringify(sortedList), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    // Om något går fel, skicka tillbaka felet så vi kan se det i webbläsaren
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500 });
  }
}
