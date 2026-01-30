/**
 * Zásilkovna & PPL & Balíkovna → Todoist
 * Automaticky vytváří úkoly v Todoist z e-mailů od dopravců
 *
 * Podporovaní dopravci:
 * - Zásilkovna (výdejní místa i Z-BOX)
 * - PPL (ParcelShopy)
 * - Balíkovna (Česká pošta - boxy a výdejní místa)
 *
 * Funkce:
 * - Extrakce odesílatele, adresy, termínu vyzvednutí, čísla zásilky a PIN
 * - GPS souřadnice a odkaz na Google Maps pro navigaci
 * - Odkaz na původní e-mail v Gmailu
 *
 * @version 2.2.0
 * @author Pavel Ungr
 * @see https://github.com/pungr/zasilkovna-todoist
 */

// ============ KONFIGURACE ============
const CONFIG = {
  TODOIST_API_TOKEN: 'your-todoist-api-token',
  TODOIST_PROJECT_ID: 'your-project-id',
  GMAIL_LABEL_PROCESSED: 'Parcel-Todoist', // Label pro zpracované e-maily
};

// Konfigurace dopravců
const CARRIERS = {
  zasilkovna: {
    name: 'Zásilkovna',
    icon: '📦',
    fromQuery: 'from:zasilkovna.cz',
    subjectKeyword: 'připravena',
    parser: parseZasilkovnaEmail
  },
  ppl: {
    name: 'PPL',
    icon: '📦',
    fromQuery: 'from:ppl.cz',
    subjectKeyword: 'čeká',
    parser: parsePPLEmail
  },
  balikovna: {
    name: 'Balíkovna',
    icon: '📦',
    fromQuery: 'from:balikovna.cz',
    subjectKeyword: 'čeká',
    parser: parseBalikovna
  }
};

/**
 * Hlavní funkce - spouští se pravidelně, zpracuje všechny dopravce
 */
function processAllCarriers() {
  let totalNewTasks = 0;

  for (const [carrierId, carrier] of Object.entries(CARRIERS)) {
    const newTasks = processCarrierEmails(carrierId, carrier);
    totalNewTasks += newTasks;
  }

  Logger.log(`Celkem zpracováno ${totalNewTasks} nových e-mailů.`);
}

/**
 * Zpracuje e-maily od konkrétního dopravce
 */
function processCarrierEmails(carrierId, carrier) {
  // Hledej nezpracované e-maily
  const query = `${carrier.fromQuery} subject:${carrier.subjectKeyword} -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
  const threads = GmailApp.search(query, 0, 10);

  if (threads.length === 0) {
    Logger.log(`${carrier.name}: Žádné nové e-maily.`);
    return 0;
  }

  // Vytvoř label pokud neexistuje
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.GMAIL_LABEL_PROCESSED);
  }

  // Načti seznam již zpracovaných ID zpráv
  const props = PropertiesService.getScriptProperties();
  const processedIdsJson = props.getProperty('processedMessageIds') || '[]';
  const processedIds = JSON.parse(processedIdsJson);

  let newTasksCount = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const messageId = message.getId();

      // Přeskoč již zpracované zprávy
      if (processedIds.includes(messageId)) {
        continue;
      }

      // Zkontroluj, zda e-mail odpovídá dopravci
      const subject = message.getSubject().toLowerCase();
      if (subject.includes(carrier.subjectKeyword)) {
        try {
          const emailData = carrier.parser(message);

          if (emailData) {
            emailData.carrier = carrier.name;
            emailData.icon = carrier.icon;
            createTodoistTask(emailData);
            Logger.log(`${carrier.name}: Vytvořen úkol - ${emailData.sender} - ${emailData.address}`);
            newTasksCount++;
          }

          // Označ zprávu jako zpracovanou
          processedIds.push(messageId);

        } catch (error) {
          Logger.log(`${carrier.name}: Chyba při zpracování e-mailu: ${error.message}`);
        }
      }
    }

    // Označ vlákno labelem
    thread.addLabel(label);
  }

  // Ulož aktualizovaný seznam zpracovaných ID (ponechej jen posledních 500)
  const trimmedIds = processedIds.slice(-500);
  props.setProperty('processedMessageIds', JSON.stringify(trimmedIds));

  return newTasksCount;
}

/**
 * Parsuje e-mail od Zásilkovny (výdejní místo i Z-BOX)
 */
function parseZasilkovnaEmail(message) {
  const body = message.getPlainBody();
  let htmlBody = '';
  try {
    htmlBody = message.getBody();
  } catch (e) {
    htmlBody = body;
  }

  // Detekce typu e-mailu (Z-BOX vs výdejní místo)
  const isZBox = body.includes('Z-BOX') || body.includes('dorazila do Z-BOXu');

  // Extrahuj odesílatele
  let sender = 'Neznámý odesílatel';
  if (isZBox) {
    // Z-BOX formát: "od Yanwen Logistics Co., Ltd. Shanghai Branch právě dorazila"
    // V plain textu může být odesílatel na samostatném řádku
    const zboxSenderMatch = body.match(/od\s+([\s\S]+?)\s+práv/i) ||
                            htmlBody.match(/od\s+<[^>]*>([^<]+)<\/span>\s+<[^>]*>práv/i);
    if (zboxSenderMatch) {
      sender = zboxSenderMatch[1].replace(/\s+/g, ' ').trim();
    }
  } else {
    // Klasický formát: "od odesilatele WITTCHEN S.A. je pro vás"
    // Pozor: v e-mailu může být odesílatel na samostatném řádku
    const senderMatch = body.match(/od odesilatele\s+([\s\S]+?)\s+je pro vás/i);
    if (senderMatch) {
      // Odstraň přebytečné whitespace a newliny
      sender = senderMatch[1].replace(/\s+/g, ' ').trim();
    }
  }

  // Extrahuj místo vyzvednutí
  let location = 'Neznámé místo';
  if (isZBox) {
    // Z-BOX: hledej "Z-BOX Praha 4, Krč, Antala Staška 1071/57a"
    const zboxLocationMatch = htmlBody.match(/>Z-BOX\s+([^<]+)</i) ||
                              body.match(/Z-BOX\s+([^\n]+)/i);
    if (zboxLocationMatch) {
      location = 'Z-BOX ' + zboxLocationMatch[1].trim();
    }
  } else {
    // Klasický formát: "na výdejním místě Praha 4, Nusle, Marie Cibulkové 386/40 (Koupelnové a interierové studio)."
    // Hledej text mezi "na výdejním místě" a první tečkou následovanou dvojitým newline nebo "Heslo"
    const locationMatch = body.match(/na výdejním místě\s+([\s\S]+?)(?:\.\s*\n\s*\n|\.\s*Heslo)/i);
    if (locationMatch) {
      // Odstraň přebytečné whitespace a newliny
      location = locationMatch[1].replace(/\s+/g, ' ').trim();
    }
  }

  // Extrahuj datum vyzvednutí
  let dueDate = null;
  // Z-BOX formát: "K vyzvednutí do 22.1.2026" (numerický)
  const numericDateMatch = body.match(/K vyzvednut[ií] do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i) ||
                           htmlBody.match(/K vyzvednut[ií] do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (numericDateMatch) {
    dueDate = parseNumericDate(numericDateMatch[1]);
  } else {
    // Klasický formát: "nejpozději dne 16. ledna" (slovní)
    const dateMatch = body.match(/nejpozději dne\s+(\d{1,2}\.\s*\w+)/i);
    if (dateMatch) {
      dueDate = parseCzechDate(dateMatch[1].trim());
    }
  }

  // Extrahuj číslo zásilky
  const trackingMatch = body.match(/zásilka číslo\s+(Z\s*[\d\s]+)/i) ||
                        body.match(/Číslo zásilky\s+(Z\s*[\d\s]+)/i) ||
                        htmlBody.match(/Číslo zásilky[^Z]+(Z\s*[\d\s]+)/i);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Extrahuj PIN/kód pro Z-BOX (zobrazený jako jednotlivé číslice v tabulce)
  let pin = '';
  if (isZBox) {
    // HTML: hledej číslice v buňkách tabulky s kódem
    const pinDigits = htmlBody.match(/text-align:\s*center;?">\s*(\d)\s*<\/td>/g);
    if (pinDigits && pinDigits.length >= 4) {
      pin = pinDigits.map(d => d.match(/>\s*(\d)\s*</)[1]).join('');
    }
    // Alternativně z plain textu - číslice jsou oddělené whitespace
    if (!pin) {
      const plainPinMatch = body.match(/kódu:\s*\n[\s\S]*?(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/);
      if (plainPinMatch) {
        pin = plainPinMatch.slice(1, 7).join('');
      }
    }
  }

  // Extrahuj GPS souřadnice z odkazu na mapu (mapy.com nebo Google Maps)
  let latitude = null;
  let longitude = null;
  // mapy.com: ?x=14.44462&amp;y=50.04180 (x=longitude, y=latitude)
  // Pozor: v HTML je & zakódováno jako &amp;
  const mapyCzMatch = htmlBody.match(/mapy\.com[^"]*[?&]x=([0-9.]+)[^"]*(?:&amp;|&)y=([0-9.]+)/i);
  if (mapyCzMatch) {
    longitude = mapyCzMatch[1];
    latitude = mapyCzMatch[2];
  } else {
    // Google Maps: ?q=50.04180,14.44462 (lat,lng)
    const googleMapsMatch = htmlBody.match(/google\.com\/maps[^"]*[?&]q=([0-9.]+),([0-9.]+)/i);
    if (googleMapsMatch) {
      latitude = googleMapsMatch[1];
      longitude = googleMapsMatch[2];
    }
  }

  // Vytvoř odkaz na e-mail v Gmailu
  const messageId = message.getId();
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  // Datum přijetí e-mailu
  const emailDate = message.getDate();
  const emailDateFormatted = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return {
    sender: sender,
    address: location,
    dueDate: dueDate,
    trackingNumber: trackingNumber,
    pin: pin,
    gmailLink: gmailLink,
    emailDate: emailDateFormatted,
    latitude: latitude,
    longitude: longitude
  };
}

/**
 * Parsuje e-mail od PPL
 */
function parsePPLEmail(message) {
  const body = message.getPlainBody();

  // PPL e-maily jsou v HTML, zkusíme i HTML verzi
  let htmlBody = '';
  try {
    htmlBody = message.getBody();
  } catch (e) {
    htmlBody = body;
  }

  // Extrahuj odesílatele (např. "TRIGON MEDIA s.r.o.")
  let sender = 'Neznámý odesílatel';
  const senderMatch = htmlBody.match(/Odes[ií]latel:[\s\S]*?<td[^>]*>([^<]+)</i) ||
                      body.match(/Odes[ií]latel:\s*(.+)/i);
  if (senderMatch) {
    sender = senderMatch[1].trim();
  }

  // Extrahuj číslo zásilky (např. "71402046317")
  let trackingNumber = '';
  const trackingMatch = htmlBody.match(/[ČC][ií]slo\s*z[áa]silky:[\s\S]*?<td[^>]*>(\d+)</i) ||
                        body.match(/[ČC][ií]slo\s*z[áa]silky:\s*(\d+)/i);
  if (trackingMatch) {
    trackingNumber = trackingMatch[1].trim();
  }

  // Extrahuj místo vyzvednutí - název
  let locationName = '';
  const nameMatch = htmlBody.match(/N[áa]zev:[\s\S]*?<td[^>]*>([^<]+)</i) ||
                    body.match(/N[áa]zev:\s*(.+)/i);
  if (nameMatch) {
    locationName = nameMatch[1].trim();
  }

  // Extrahuj adresu
  let locationAddress = '';
  const addressMatch = htmlBody.match(/Adresa:[\s\S]*?<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (addressMatch) {
    locationAddress = `${addressMatch[1].trim()}, ${addressMatch[2].trim()}`;
  } else {
    // Alternativní regex pro plain text
    const addrMatch = body.match(/Adresa:\s*(.+?)(?:\n|$)/i);
    if (addrMatch) {
      locationAddress = addrMatch[1].trim();
    }
  }

  const address = locationName ? `${locationName}, ${locationAddress}` : locationAddress || 'Neznámé místo';

  // Extrahuj datum vyzvednutí (např. "21.01.2026")
  let dueDate = null;
  const dueDateMatch = htmlBody.match(/nejpozd[ěe]ji\s*v[šs]ak\s*do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i) ||
                       body.match(/nejpozd[ěe]ji\s*v[šs]ak\s*do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (dueDateMatch) {
    dueDate = parseNumericDate(dueDateMatch[1]);
  }

  // Extrahuj PIN pro převzetí
  let pin = '';
  const pinMatch = htmlBody.match(/PIN\s*pro\s*p[řr]evzet[ií]\s*z[áa]silky:[\s\S]*?<td[^>]*>(\d+)</i) ||
                   body.match(/PIN\s*pro\s*p[řr]evzet[ií]:\s*(\d+)/i);
  if (pinMatch) {
    pin = pinMatch[1].trim();
  }

  // Vytvoř odkaz na e-mail v Gmailu
  const messageId = message.getId();
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  // Datum přijetí e-mailu
  const emailDate = message.getDate();
  const emailDateFormatted = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return {
    sender: sender,
    address: address,
    dueDate: dueDate,
    trackingNumber: trackingNumber,
    pin: pin,
    gmailLink: gmailLink,
    emailDate: emailDateFormatted
  };
}

/**
 * Parsuje e-mail od Balíkovny (Česká pošta)
 */
function parseBalikovna(message) {
  const body = message.getPlainBody();
  let htmlBody = '';
  try {
    htmlBody = message.getBody();
  } catch (e) {
    htmlBody = body;
  }

  // Extrahuj odesílatele
  // HTML: <b>Odesílatel:</b> E.M.P. Merchandising Handelsge<br/>
  let sender = 'Neznámý odesílatel';
  const senderMatch = htmlBody.match(/Odes[ií]latel:<\/b>\s*([^<]+)/i) ||
                      body.match(/Odes[ií]latel:\s*(.+)/i);
  if (senderMatch) {
    sender = senderMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Extrahuj číslo balíku
  // HTML: <b>Číslo balíku:</b> <a href="...">NB4841298967U</a>
  let trackingNumber = '';
  const trackingMatch = htmlBody.match(/[ČC][ií]slo bal[ií]ku:<\/b>\s*<a[^>]*>([^<]+)<\/a>/i) ||
                        htmlBody.match(/[ČC][ií]slo bal[ií]ku:<\/b>\s*([^<]+)/i) ||
                        body.match(/[ČC][ií]slo bal[ií]ku:\s*(\S+)/i);
  if (trackingMatch) {
    trackingNumber = trackingMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Extrahuj kód pro vyzvednutí
  // HTML: <b>Kód pro vyzvednutí: c061d4</b>
  let pin = '';
  const pinMatch = htmlBody.match(/K[óo]d pro vyzvednut[ií]:\s*([a-zA-Z0-9]+)/i) ||
                   body.match(/K[óo]d pro vyzvednut[ií]:\s*([a-zA-Z0-9]+)/i) ||
                   htmlBody.match(/Pickup code:\s*([a-zA-Z0-9]+)/i);
  if (pinMatch) {
    pin = pinMatch[1].trim();
  }

  // Extrahuj datum vyzvednutí
  // HTML: <b>Balík uložen:</b> do <span ...>2.&nbsp;2.&nbsp;2026,&nbsp;07:00&nbsp;hod.</span>
  // Po dekódování &nbsp; → mezera: "2. 2. 2026"
  let dueDate = null;
  // Nejprve zkus HTML s &nbsp; entitami
  const dueDateHtmlMatch = htmlBody.match(/do\s*(?:<[^>]*>)?\s*(\d{1,2})[.\s]*(?:&nbsp;)*\s*(\d{1,2})[.\s]*(?:&nbsp;)*\s*(\d{4})/i);
  if (dueDateHtmlMatch) {
    const day = parseInt(dueDateHtmlMatch[1]);
    const month = parseInt(dueDateHtmlMatch[2]);
    const year = parseInt(dueDateHtmlMatch[3]);
    dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    // Záložní varianta z plain textu
    const dueDateMatch = body.match(/do\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i);
    if (dueDateMatch) {
      dueDate = parseNumericDate(`${dueDateMatch[1]}.${dueDateMatch[2]}.${dueDateMatch[3]}`);
    }
  }

  // Extrahuj adresu pro vyzvednutí
  // HTML: <b>Adresa pro vyzvednutí:</b> <a href="...">box - Praha 4 AlzaBox Krč...</a>
  let address = 'Neznámé místo';
  const addressMatch = htmlBody.match(/Adresa pro vyzvednut[ií]:<\/b>\s*<a[^>]*>([^<]+)<\/a>/i) ||
                       htmlBody.match(/Adresa pro vyzvednut[ií]:<\/b>\s*([^<]+)/i) ||
                       htmlBody.match(/Pickup address:<\/b>\s*<a[^>]*>([^<]+)<\/a>/i) ||
                       body.match(/Adresa pro vyzvednut[ií]:\s*(.+)/i);
  if (addressMatch) {
    address = addressMatch[1].replace(/\s+/g, ' ').trim();
  }

  // GPS souřadnice - Balíkovna nepoužívá mapové odkazy v e-mailu
  let latitude = null;
  let longitude = null;
  const mapyCzMatch = htmlBody.match(/mapy\.com[^"]*[?&]x=([0-9.]+)[^"]*(?:&amp;|&)y=([0-9.]+)/i);
  if (mapyCzMatch) {
    longitude = mapyCzMatch[1];
    latitude = mapyCzMatch[2];
  } else {
    const googleMapsMatch = htmlBody.match(/google\.com\/maps[^"]*[?&]q=([0-9.]+),([0-9.]+)/i);
    if (googleMapsMatch) {
      latitude = googleMapsMatch[1];
      longitude = googleMapsMatch[2];
    }
  }

  // Odkaz na e-mail v Gmailu
  const messageId = message.getId();
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  // Datum přijetí e-mailu
  const emailDate = message.getDate();
  const emailDateFormatted = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return {
    sender: sender,
    address: address,
    dueDate: dueDate,
    trackingNumber: trackingNumber,
    pin: pin,
    gmailLink: gmailLink,
    emailDate: emailDateFormatted,
    latitude: latitude,
    longitude: longitude
  };
}

/**
 * Převede český datum (např. "16. ledna") na ISO formát
 */
function parseCzechDate(dateText) {
  if (!dateText) return null;

  const months = {
    'ledna': 1, 'února': 2, 'března': 3, 'dubna': 4,
    'května': 5, 'června': 6, 'července': 7, 'srpna': 8,
    'září': 9, 'října': 10, 'listopadu': 11, 'prosince': 12
  };

  const match = dateText.match(/(\d{1,2})\.\s*(\w+)/);
  if (!match) return null;

  const day = parseInt(match[1]);
  const monthName = match[2].toLowerCase();
  const month = months[monthName];

  if (!month) return null;

  // Určení roku - pokud je měsíc v minulosti, použij příští rok
  const now = new Date();
  let year = now.getFullYear();

  const testDate = new Date(year, month - 1, day);
  if (testDate < now) {
    year++;
  }

  // Formát YYYY-MM-DD pro Todoist
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Převede numerické datum (např. "21.01.2026") na ISO formát
 */
function parseNumericDate(dateText) {
  if (!dateText) return null;

  const match = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;

  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);

  // Formát YYYY-MM-DD pro Todoist
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Převede ISO datum na čitelný český formát s dnem v týdnu
 * Např. "2025-01-16" → "čt 16. 1."
 */
function formatDateCzech(isoDate) {
  if (!isoDate) return null;

  const days = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const date = new Date(isoDate);
  const dayOfWeek = days[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;

  return `${dayOfWeek} ${day}. ${month}.`;
}

/**
 * Vytvoří úkol v Todoist
 */
function createTodoistTask(emailData) {
  const carrierName = emailData.carrier || 'Zásilka';
  const icon = emailData.icon || '📦';

  // Název úkolu s termínem vyzvednutí v závorce (čitelný formát)
  let taskName = `${icon} ${carrierName} k vyzvednutí od ${emailData.sender} v ${emailData.address}`;
  if (emailData.dueDate) {
    const dueDateFormatted = formatDateCzech(emailData.dueDate);
    taskName += ` (do ${dueDateFormatted})`;
  }

  const payload = {
    content: taskName,
    project_id: CONFIG.TODOIST_PROJECT_ID,
    priority: 3 // Střední priorita
  };

  // Due date = den kdy přišel e-mail
  if (emailData.emailDate) {
    payload.due_date = emailData.emailDate;
  }

  // Popis s termínem vyzvednutí, číslem zásilky a odkazem
  let description = '';
  if (emailData.dueDate) {
    const dueDateFormatted = formatDateCzech(emailData.dueDate);
    description += `⏰ Vyzvednout do: ${dueDateFormatted}\n`;
  }
  if (emailData.trackingNumber) {
    description += `📦 Číslo zásilky: ${emailData.trackingNumber}\n`;
  }
  if (emailData.pin) {
    description += `🔑 PIN: ${emailData.pin}\n`;
  }
  description += '\n';
  if (emailData.gmailLink) {
    description += `📧 [Otevřít e-mail](${emailData.gmailLink})\n`;
  }
  if (emailData.latitude && emailData.longitude) {
    const mapsUrl = `https://www.google.com/maps?q=${emailData.latitude},${emailData.longitude}`;
    description += `🗺️ [Navigovat](${mapsUrl})`;
  }
  if (description) {
    payload.description = description.trim();
  }

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.TODOIST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.todoist.com/rest/v2/tasks', options);

  if (response.getResponseCode() !== 200) {
    throw new Error(`Todoist API error: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

/**
 * Označ všechny existující e-maily od všech dopravců jako zpracované
 */
function markAllAsProcessed() {
  // Vytvoř label pokud neexistuje
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.GMAIL_LABEL_PROCESSED);
  }

  const processedIds = [];

  // Zpracuj všechny dopravce
  for (const [carrierId, carrier] of Object.entries(CARRIERS)) {
    let start = 0;
    const batchSize = 100;

    while (true) {
      const query = `${carrier.fromQuery} subject:${carrier.subjectKeyword}`;
      const threads = GmailApp.search(query, start, batchSize);

      if (threads.length === 0) {
        break;
      }

      for (const thread of threads) {
        const messages = thread.getMessages();
        for (const message of messages) {
          processedIds.push(message.getId());
        }
        thread.addLabel(label);
      }

      Logger.log(`${carrier.name}: Zpracováno ${start + threads.length} vláken...`);
      start += batchSize;

      if (start > 500) {
        Logger.log(`${carrier.name}: Dosažen limit 500 vláken.`);
        break;
      }
    }
  }

  // Ulož ID do properties
  const props = PropertiesService.getScriptProperties();
  props.setProperty('processedMessageIds', JSON.stringify(processedIds));

  Logger.log(`Hotovo! Označeno ${processedIds.length} e-mailů jako zpracované.`);
}

/**
 * Testovací funkce pro Zásilkovnu - klasické výdejní místo
 */
function testZasilkovna() {
  const testBody = `Dobrý den,

vaše zásilka číslo Z 262 4868 930 od odesilatele WITTCHEN S.A. je pro vás připravena na výdejním místě Praha 4, Nusle, Na Pankráci 1618/30 (Don Pealo).

Heslo pro vydání zásilky je V143C.

Zásilku si můžete vyzvednout nejpozději dne 16. ledna.`;

  const mockMessage = {
    getPlainBody: () => testBody,
    getBody: () => testBody,
    getFrom: () => 'noreply@zasilkovna.cz',
    getId: () => 'test-zasilkovna-id',
    getDate: () => new Date()
  };

  const result = parseZasilkovnaEmail(mockMessage);
  Logger.log('Zásilkovna (výdejní místo) - Výsledek parsování:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Testovací funkce pro Zásilkovnu - Z-BOX
 */
function testZasilkovnaZBox() {
  const testBody = `Číslo zásilky Z 285 9816 736

Zdravíme ze Zásilkovny,

vezeme skvělé zprávy! Vaše zásilka od Yanwen Logistics Co., Ltd. Shanghai Branch právě dorazila do Z-BOXu.

Zásilku vyzvednete pomocí mobilní aplikace nebo kódu:

  5   2   7   7   1   8

A teď hurá k Z-BOXu:

Pavel Ungr
Z-BOX Praha 4, Krč, Antala Staška 1071/57a
Antala Staška 1071/57a 140 00 Praha
Po–Ne 00:00–23:59
K vyzvednutí do 22.1.2026 23:59`;

  const testHtml = `
    <span style="color: #202020; font-weight: 500;">Yanwen Logistics Co., Ltd. Shanghai Branch</span>
    <span style="color: #202020; font-weight: 500;">právě dorazila do Z-BOXu</span>
    <td style="text-align: center;"> 5 </td>
    <td style="text-align: center;"> 2 </td>
    <td style="text-align: center;"> 7 </td>
    <td style="text-align: center;"> 7 </td>
    <td style="text-align: center;"> 1 </td>
    <td style="text-align: center;"> 8 </td>
    <span style="font-size: 16px; font-weight: 500;">Z-BOX Praha 4, Krč, Antala Staška 1071/57a</span>
    K vyzvednutí do 22.1.2026
    Číslo zásilky Z 285 9816 736
  `;

  const mockMessage = {
    getPlainBody: () => testBody,
    getBody: () => testHtml,
    getFrom: () => 'noreply@zasilkovna.cz',
    getId: () => 'test-zbox-id',
    getDate: () => new Date()
  };

  const result = parseZasilkovnaEmail(mockMessage);
  Logger.log('Zásilkovna (Z-BOX) - Výsledek parsování:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Testovací funkce pro PPL
 */
function testPPL() {
  const testHtml = `
    <table>
      <tr><td>Odesílatel:</td><td>TRIGON MEDIA s.r.o.</td></tr>
      <tr><td>Číslo zásilky:</td><td>71402046317</td></tr>
      <tr><td>PIN pro převzetí zásilky:</td><td>991068</td></tr>
      <tr><td>Název:</td><td>Mini Stop</td></tr>
      <tr><td>Adresa:</td><td><a>Na Pankráci 1003/53</a><br/><a>14000 Praha 4 - Nusle</a></td></tr>
    </table>
    <p>Zásilku je možné vyzvednout kdykoli v otevíracích hodinách výdejního místa, nejpozději však do 21.01.2026.</p>
  `;

  const mockMessage = {
    getPlainBody: () => 'Odesílatel: TRIGON MEDIA s.r.o.\nČíslo zásilky: 71402046317\nPIN pro převzetí: 991068\nNázev: Mini Stop\nAdresa: Na Pankráci 1003/53\nnejpozději však do 21.01.2026',
    getBody: () => testHtml,
    getFrom: () => 'support@ppl.cz',
    getId: () => 'test-ppl-id',
    getDate: () => new Date()
  };

  const result = parsePPLEmail(mockMessage);
  Logger.log('PPL - Výsledek parsování:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Testovací funkce pro Balíkovnu
 */
function testBalikovna() {
  const testHtml = `
    <p><b>Dobrý den,<br/><br/>už jen do <span style="white-space:nowrap;">2.&nbsp;2.&nbsp;2026</span>,&nbsp;07:00&nbsp;hod. si vyzvedněte svůj balík v&nbsp;boxu.</b></p>
    <p><b>Kód pro vyzvednutí: c061d4</b></p>
    <p><b>Druh balíku:</b> Balíkovna<br/>
    <b>Číslo balíku:</b> <a href="https://www.balikovna.cz/cs/sledovat-balik/balik/NB4841298967U">NB4841298967U</a><br/>
    <b>Odesílatel:</b> E.M.P. Merchandising Handelsge<br/>
    <b>Balík uložen:</b> do <span style="white-space:nowrap;">2.&nbsp;2.&nbsp;2026,&nbsp;07:00&nbsp;hod.</span>, poté ho vrátíme odesílateli<br/>
    <b>Adresa pro vyzvednutí:</b> <a href="https://www.balikovna.cz/cs/vyhledat-balikovnu/psc/14011">box - Praha 4 AlzaBox Krč Antala Staška, Antala Staška 1859/34, Krč, 14000, Praha</a></p>
  `;

  const testBody = `Dobrý den,
už jen do 2. 2. 2026, 07:00 hod. si vyzvedněte svůj balík v boxu.
Kód pro vyzvednutí: c061d4
Druh balíku: Balíkovna
Číslo balíku: NB4841298967U
Odesílatel: E.M.P. Merchandising Handelsge
Balík uložen: do 2. 2. 2026, 07:00 hod., poté ho vrátíme odesílateli
Adresa pro vyzvednutí: box - Praha 4 AlzaBox Krč Antala Staška, Antala Staška 1859/34, Krč, 14000, Praha`;

  const mockMessage = {
    getPlainBody: () => testBody,
    getBody: () => testHtml,
    getFrom: () => 'balikovna@balikovna.cz',
    getId: () => 'test-balikovna-id',
    getDate: () => new Date()
  };

  const result = parseBalikovna(mockMessage);
  Logger.log('Balíkovna - Výsledek parsování:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Diagnostika - zjistí stav e-mailů od všech dopravců
 */
function debugSearchQuery() {
  for (const [carrierId, carrier] of Object.entries(CARRIERS)) {
    Logger.log(`\n=== ${carrier.name} ===`);

    const query1 = carrier.fromQuery;
    const threads1 = GmailApp.search(query1, 0, 5);
    Logger.log(`Query "${query1}": nalezeno ${threads1.length} vláken`);

    if (threads1.length > 0) {
      const msg = threads1[0].getMessages()[0];
      Logger.log(`  Příklad - Od: ${msg.getFrom()}`);
      Logger.log(`  Příklad - Předmět: ${msg.getSubject()}`);
    }

    const query2 = `${carrier.fromQuery} subject:${carrier.subjectKeyword}`;
    const threads2 = GmailApp.search(query2, 0, 5);
    Logger.log(`Query "${query2}": nalezeno ${threads2.length} vláken`);

    const query3 = `${carrier.fromQuery} subject:${carrier.subjectKeyword} -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
    const threads3 = GmailApp.search(query3, 0, 5);
    Logger.log(`Query s -label: nalezeno ${threads3.length} vláken`);
  }

  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  Logger.log(`\nLabel "${CONFIG.GMAIL_LABEL_PROCESSED}" existuje: ${label !== null}`);
}

/**
 * Nastavení automatického spouštění (spusť jednou ručně)
 */
function setupTrigger() {
  // Smaž existující triggery pro starou i novou funkci
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    const handlerName = trigger.getHandlerFunction();
    if (handlerName === 'processZasilkovnaEmails' || handlerName === 'processAllCarriers') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Vytvoř nový trigger - spouštění každých 15 minut
  ScriptApp.newTrigger('processAllCarriers')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('Trigger nastaven - skript se bude spouštět každých 15 minut.');
}

// Zachování zpětné kompatibility - stará funkce volá novou
function processZasilkovnaEmails() {
  processAllCarriers();
}

