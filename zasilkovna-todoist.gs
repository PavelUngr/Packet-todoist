/**
 * Zásilkovna & PPL → Todoist
 * Automatically creates Todoist tasks from Zásilkovna and PPL (Czech parcel delivery services) emails
 *
 * Author: Pavel Ungr
 * Repository: https://github.com/PavelUngr/Packet-todoist
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Todoist API token - get it from Todoist: Settings → Integrations → API token
  TODOIST_API_TOKEN: 'YOUR_TODOIST_API_TOKEN',

  // Todoist project ID - get it via API: curl -X GET "https://api.todoist.com/rest/v2/projects" -H "Authorization: Bearer YOUR_TOKEN"
  TODOIST_PROJECT_ID: 'YOUR_PROJECT_ID',

  // Gmail label for processed emails (created automatically)
  GMAIL_LABEL_PROCESSED: 'Parcel-Todoist'
};

// Carrier configuration
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
  }
};

/**
 * Main function - runs periodically, processes all carriers
 */
function processAllCarriers() {
  let totalNewTasks = 0;

  for (const [carrierId, carrier] of Object.entries(CARRIERS)) {
    const newTasks = processCarrierEmails(carrierId, carrier);
    totalNewTasks += newTasks;
  }

  Logger.log(`Processed ${totalNewTasks} new emails total.`);
}

/**
 * Process emails from a specific carrier
 */
function processCarrierEmails(carrierId, carrier) {
  // Search for unprocessed emails
  const query = `${carrier.fromQuery} subject:${carrier.subjectKeyword} -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
  const threads = GmailApp.search(query, 0, 10);

  if (threads.length === 0) {
    Logger.log(`${carrier.name}: No new emails.`);
    return 0;
  }

  // Create label if it doesn't exist
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.GMAIL_LABEL_PROCESSED);
  }

  // Load list of already processed message IDs
  const props = PropertiesService.getScriptProperties();
  const processedIdsJson = props.getProperty('processedMessageIds') || '[]';
  const processedIds = JSON.parse(processedIdsJson);

  let newTasksCount = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const messageId = message.getId();

      // Skip already processed messages
      if (processedIds.includes(messageId)) {
        continue;
      }

      // Check if email matches carrier criteria
      const subject = message.getSubject().toLowerCase();
      if (subject.includes(carrier.subjectKeyword)) {
        try {
          const emailData = carrier.parser(message);

          if (emailData) {
            emailData.carrier = carrier.name;
            emailData.icon = carrier.icon;
            createTodoistTask(emailData);
            Logger.log(`${carrier.name}: Task created - ${emailData.sender} - ${emailData.address}`);
            newTasksCount++;
          }

          // Mark message as processed
          processedIds.push(messageId);

        } catch (error) {
          Logger.log(`${carrier.name}: Error processing email: ${error.message}`);
        }
      }
    }

    // Add label to thread
    thread.addLabel(label);
  }

  // Save updated list of processed IDs (keep only last 500)
  const trimmedIds = processedIds.slice(-500);
  props.setProperty('processedMessageIds', JSON.stringify(trimmedIds));

  return newTasksCount;
}

/**
 * Parses Zásilkovna email and extracts required data
 */
function parseZasilkovnaEmail(message) {
  const body = message.getPlainBody();

  // Extract sender (e.g. "WITTCHEN S.A.")
  const senderMatch = body.match(/od odesilatele\s+([^\s].*?)\s+je pro vás/i);
  const sender = senderMatch ? senderMatch[1].trim() : 'Unknown sender';

  // Extract pickup location (e.g. "Praha 4, Nusle, Na Pankráci 1618/30 (Don Pealo)")
  const locationMatch = body.match(/na výdejním místě\s+(.+?)(?:\.\s*$|\.\s*\n)/im);
  const location = locationMatch ? locationMatch[1].trim() : 'Unknown location';

  // Extract pickup deadline (e.g. "16. ledna")
  const dateMatch = body.match(/nejpozději dne\s+(\d{1,2}\.\s*\w+)/i);
  const dueDateText = dateMatch ? dateMatch[1].trim() : null;
  const dueDate = parseCzechDate(dueDateText);

  // Extract tracking number
  const trackingMatch = body.match(/zásilka číslo\s+(Z\s*[\d\s]+)/i);
  const trackingNumber = trackingMatch ? trackingMatch[1].replace(/\s/g, ' ').trim() : '';

  // Create Gmail link
  const messageId = message.getId();
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  // Email received date
  const emailDate = message.getDate();
  const emailDateFormatted = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return {
    sender: sender,
    address: location,
    dueDate: dueDate,
    trackingNumber: trackingNumber,
    gmailLink: gmailLink,
    emailDate: emailDateFormatted
  };
}

/**
 * Parses PPL email and extracts required data
 */
function parsePPLEmail(message) {
  const body = message.getPlainBody();

  // PPL emails are in HTML, try HTML version too
  let htmlBody = '';
  try {
    htmlBody = message.getBody();
  } catch (e) {
    htmlBody = body;
  }

  // Extract sender (e.g. "TRIGON MEDIA s.r.o.")
  let sender = 'Unknown sender';
  const senderMatch = htmlBody.match(/Odes[ií]latel:[\s\S]*?<td[^>]*>([^<]+)</i) ||
                      body.match(/Odes[ií]latel:\s*(.+)/i);
  if (senderMatch) {
    sender = senderMatch[1].trim();
  }

  // Extract tracking number (e.g. "71402046317")
  let trackingNumber = '';
  const trackingMatch = htmlBody.match(/[ČC][ií]slo\s*z[áa]silky:[\s\S]*?<td[^>]*>(\d+)</i) ||
                        body.match(/[ČC][ií]slo\s*z[áa]silky:\s*(\d+)/i);
  if (trackingMatch) {
    trackingNumber = trackingMatch[1].trim();
  }

  // Extract pickup location - name
  let locationName = '';
  const nameMatch = htmlBody.match(/N[áa]zev:[\s\S]*?<td[^>]*>([^<]+)</i) ||
                    body.match(/N[áa]zev:\s*(.+)/i);
  if (nameMatch) {
    locationName = nameMatch[1].trim();
  }

  // Extract address
  let locationAddress = '';
  const addressMatch = htmlBody.match(/Adresa:[\s\S]*?<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (addressMatch) {
    locationAddress = `${addressMatch[1].trim()}, ${addressMatch[2].trim()}`;
  } else {
    // Alternative regex for plain text
    const addrMatch = body.match(/Adresa:\s*(.+?)(?:\n|$)/i);
    if (addrMatch) {
      locationAddress = addrMatch[1].trim();
    }
  }

  const address = locationName ? `${locationName}, ${locationAddress}` : locationAddress || 'Unknown location';

  // Extract pickup deadline (e.g. "21.01.2026")
  let dueDate = null;
  const dueDateMatch = htmlBody.match(/nejpozd[ěe]ji\s*v[šs]ak\s*do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i) ||
                       body.match(/nejpozd[ěe]ji\s*v[šs]ak\s*do\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (dueDateMatch) {
    dueDate = parseNumericDate(dueDateMatch[1]);
  }

  // Extract PIN for pickup
  let pin = '';
  const pinMatch = htmlBody.match(/PIN\s*pro\s*p[řr]evzet[ií]\s*z[áa]silky:[\s\S]*?<td[^>]*>(\d+)</i) ||
                   body.match(/PIN\s*pro\s*p[řr]evzet[ií]:\s*(\d+)/i);
  if (pinMatch) {
    pin = pinMatch[1].trim();
  }

  // Create Gmail link
  const messageId = message.getId();
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  // Email received date
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
 * Converts Czech date (e.g. "16. ledna") to ISO format
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

  // Determine year - if month is in the past, use next year
  const now = new Date();
  let year = now.getFullYear();

  const testDate = new Date(year, month - 1, day);
  if (testDate < now) {
    year++;
  }

  // Format YYYY-MM-DD for Todoist
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Converts numeric date (e.g. "21.01.2026") to ISO format
 */
function parseNumericDate(dateText) {
  if (!dateText) return null;

  const match = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;

  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);

  // Format YYYY-MM-DD for Todoist
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Converts ISO date to readable Czech format with day of week
 * E.g. "2025-01-16" → "čt 16. 1."
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
 * Creates a task in Todoist
 */
function createTodoistTask(emailData) {
  const carrierName = emailData.carrier || 'Parcel';
  const icon = emailData.icon || '📦';

  // Task name with pickup deadline in brackets (readable format)
  let taskName = `${icon} ${carrierName} k vyzvednutí od ${emailData.sender} v ${emailData.address}`;
  if (emailData.dueDate) {
    const dueDateFormatted = formatDateCzech(emailData.dueDate);
    taskName += ` (do ${dueDateFormatted})`;
  }

  const payload = {
    content: taskName,
    project_id: CONFIG.TODOIST_PROJECT_ID,
    priority: 3 // Medium priority
  };

  // Due date = day when email arrived
  if (emailData.emailDate) {
    payload.due_date = emailData.emailDate;
  }

  // Description with pickup deadline, tracking number, PIN and email link
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
  if (emailData.gmailLink) {
    description += `\n📧 [Otevřít e-mail](${emailData.gmailLink})`;
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
 * Mark all existing emails from all carriers as processed (run once for reset)
 * This prevents creating duplicate tasks
 */
function markAllAsProcessed() {
  // Create label if it doesn't exist
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.GMAIL_LABEL_PROCESSED);
  }

  const processedIds = [];

  // Process all carriers
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

      Logger.log(`${carrier.name}: Processed ${start + threads.length} threads...`);
      start += batchSize;

      // Safety limit
      if (start > 500) {
        Logger.log(`${carrier.name}: Reached limit of 500 threads.`);
        break;
      }
    }
  }

  // Save IDs to properties
  const props = PropertiesService.getScriptProperties();
  props.setProperty('processedMessageIds', JSON.stringify(processedIds));

  Logger.log(`Done! Marked ${processedIds.length} emails as processed.`);
}

/**
 * Test function for Zásilkovna - run manually to verify parsing
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
  Logger.log('Zásilkovna - Parsing result:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test function for PPL - run manually to verify parsing
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
  Logger.log('PPL - Parsing result:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Diagnostics - check email status for all carriers
 */
function debugSearchQuery() {
  for (const [carrierId, carrier] of Object.entries(CARRIERS)) {
    Logger.log(`\n=== ${carrier.name} ===`);

    const query1 = carrier.fromQuery;
    const threads1 = GmailApp.search(query1, 0, 5);
    Logger.log(`Query "${query1}": found ${threads1.length} threads`);

    if (threads1.length > 0) {
      const msg = threads1[0].getMessages()[0];
      Logger.log(`  Example - From: ${msg.getFrom()}`);
      Logger.log(`  Example - Subject: ${msg.getSubject()}`);
    }

    const query2 = `${carrier.fromQuery} subject:${carrier.subjectKeyword}`;
    const threads2 = GmailApp.search(query2, 0, 5);
    Logger.log(`Query "${query2}": found ${threads2.length} threads`);

    const query3 = `${carrier.fromQuery} subject:${carrier.subjectKeyword} -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
    const threads3 = GmailApp.search(query3, 0, 5);
    Logger.log(`Query with -label: found ${threads3.length} threads`);
  }

  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  Logger.log(`\nLabel "${CONFIG.GMAIL_LABEL_PROCESSED}" exists: ${label !== null}`);
}

/**
 * Setup automatic trigger (run once manually)
 */
function setupTrigger() {
  // Delete existing triggers for old and new function names
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    const handlerName = trigger.getHandlerFunction();
    if (handlerName === 'processZasilkovnaEmails' || handlerName === 'processAllCarriers') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Create new trigger - run every 15 minutes
  ScriptApp.newTrigger('processAllCarriers')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('Trigger set - script will run every 15 minutes.');
}

// Backward compatibility - old function calls new one
function processZasilkovnaEmails() {
  processAllCarriers();
}
