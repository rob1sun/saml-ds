export async function onRequest(context) {
  const feeds = [
    "https://fed.sambi.se/prod/ds/site/federation.json",
    "https://fed.skolfederation.se/prod/ds/site/federation.json"
  ];

  try {
    const responses = await Promise.all(feeds.map(url => fetch(url)));
    let validIdps = [];

    for (const response of responses) {
      if (!response.ok) continue;
      
      const data = await response.json();
      let itemsToProcess = [];

      // SÄKERHETSKONTROLL AV DATASTRUKTUR
      if (Array.isArray(data)) {
        // Om det är en vanlig lista
        itemsToProcess = data;
      } else if (typeof data === 'object') {
        // OM DET ÄR SAMBI-FORMATET (Objekt där nyckeln är entityID)
        // Vi konverterar objektet till en array och flyttar in nyckeln till "entityID"
        itemsToProcess = Object.keys(data).map(key => {
            return {
                entityID: key,
                ...data[key] // Kopiera in resten av datan (organization, idps, etc)
            };
        });
      }

      // BEARBETNING
      for (const item of itemsToProcess) {
        // VIKTIGT: Vi vill bara visa IdP:er (Login-servrar).
        // Om arrayen 'idps' saknas eller är tom, är detta en Service Provider -> Hoppa över.
        if (!item.idps || item.idps.length === 0) {
            continue; 
        }

        // HÄMTA NAMN (Ligger djupt i strukturen i din JSON)
        // Struktur: organization -> displayName -> { sv: "...", en: "..." }
        let name = item.entityID; // Fallback
        let keywords = "";
        
        if (item.organization) {
            // Hämta namn-objektet (kan heta displayName eller fullName)
            const nameObj = item.organization.displayName || item.organization.fullName;
            
            if (nameObj) {
                // Prioritera svenska, sen engelska, sen första bästa
                name = nameObj['sv'] || nameObj['sv-SE'] || 
                       nameObj['en'] || nameObj['en-IN'] || nameObj['en-US'] || 
                       Object.values(nameObj)[0];
            }
        }

        validIdps.push({
            entityID: item.entityID,
            title: name,
            // Spara logga om det skulle dyka upp i framtiden, annars null
            logo: null 
        });
      }
    }

    // Ta bort dubbletter (om samma IdP finns i både Sambi och Skolfederation)
    const uniqueMap = new Map();
    validIdps.forEach(item => uniqueMap.set(item.entityID, item));
    
    // Sortera A-Ö
    const sortedList = Array.from(uniqueMap.values()).sort((a, b) => 
        (a.title || "").localeCompare(b.title || "", 'sv')
    );

    return new Response(JSON.stringify(sortedList), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500 });
  }
}
