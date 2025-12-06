export async function onRequest(context) {
  const feeds = [
    "https://fed.sambi.se/prod/ds/site/federation.json",
    "https://fed.skolfederation.se/prod/ds/site/federation.json"
  ];

  try {
    // 1. Hämta alla feeds
    const responses = await Promise.all(feeds.map(url => fetch(url)));
    let rawItems = [];

    for (const response of responses) {
      if (response.ok) {
        const data = await response.json();
        rawItems = rawItems.concat(data);
      }
    }

    // 2. Normalisera och städa datan
    const processedItems = rawItems.map(item => {
      
      // -- LOGIK FÖR NAMN --
      // Vi letar efter DisplayNames. Om det inte finns, fallback till title eller entityID.
      let displayName = item.entityID; // Sista utväg
      let keywords = item.Keywords || []; // Kan vara bra för sökning senare

      if (Array.isArray(item.DisplayNames)) {
        // Hitta svenskt namn
        const svName = item.DisplayNames.find(n => n.lang === 'sv' || n.lang === 'sv-se');
        // Hitta engelskt namn
        const enName = item.DisplayNames.find(n => n.lang === 'en' || n.lang === 'en-us');
        
        // Prioritera: Svenska -> Engelska -> Första tillgängliga -> entityID
        if (svName) displayName = svName.value;
        else if (enName) displayName = enName.value;
        else if (item.DisplayNames.length > 0) displayName = item.DisplayNames[0].value;
      }

      // -- LOGIK FÖR LOGOTYP --
      let logoUrl = null;
      if (Array.isArray(item.Logos) && item.Logos.length > 0) {
        // Vi vill helst ha en logga som är bredare än den är hög (passar oftast listor bättre)
        // eller bara ta den första om vi inte vill vara kräsna.
        // Här tar vi den största tillgängliga loggan för bästa kvalitet.
        
        // Sortera loggor efter bredd (descending)
        const sortedLogos = item.Logos.sort((a, b) => {
            const widthA = parseInt(a.width || 0);
            const widthB = parseInt(b.width || 0);
            return widthB - widthA;
        });

        logoUrl = sortedLogos[0].value; // 'value' innehåller URL:en i standardformatet
      }

      // -- RETURNERA STÄDAT OBJEKT --
      return {
        entityID: item.entityID,
        title: displayName,
        logo: logoUrl,
        keywords: keywords.map(k => k.value).join(" ") // Slå ihop sökord till en sträng
      };
    });

    // 3. Ta bort dubbletter (baserat på entityID)
    // Vi använder en Map där entityID är nyckeln. Senare insatta skriver över tidigare.
    const uniqueMap = new Map();
    processedItems.forEach(item => {
        if(item.entityID) uniqueMap.set(item.entityID, item);
    });
    
    // Sortera listan alfabetiskt på titeln
    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => 
        a.title.localeCompare(b.title, 'sv')
    );

    return new Response(JSON.stringify(sortedList), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
