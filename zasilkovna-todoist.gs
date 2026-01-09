/**
 * Zásilkovna → Todoist
 * Automatically creates Todoist tasks from Zásilkovna (Czech parcel delivery service) emails
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
  GMAIL_LABEL_PROCESSED: 'Zasilkovna-Todoist',

  // Sender email address (no need to change)
  SENDER_EMAIL: 'noreply@zasilkovna.cz'
};

/**
 * Main function - runs periodically
 */
function processZasilkovnaEmails() {
  // Search for unprocessed emails from Zásilkovna
  const query = `from:zasilkovna.cz subject:připravena -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
  const threads = GmailApp.search(query, 0, 10);

  if (threads.length === 0) {
    Logger.log('No new emails from Zásilkovna.');
    return;
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

      // Process only emails from Zásilkovna with "připravena" in subject
      if (message.getFrom().includes('zasilkovna.cz') &&
          message.getSubject().toLowerCase().includes('připravena')) {
        try {
          const emailData = parseZasilkovnaEmail(message);

          if (emailData) {
            createTodoistTask(emailData);
            Logger.log(`Task created: ${emailData.sender} - ${emailData.address}`);
            newTasksCount++;
          }

          // Mark message as processed
          processedIds.push(messageId);

        } catch (error) {
          Logger.log(`Error processing email: ${error.message}`);
        }
      }
    }

    // Add label to thread
    thread.addLabel(label);
  }

  // Save updated list of processed IDs (keep only last 500)
  const trimmedIds = processedIds.slice(-500);
  props.setProperty('processedMessageIds', JSON.stringify(trimmedIds));

  Logger.log(`Processed ${newTasksCount} new emails.`);
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
  // Task name with pickup deadline in brackets (readable format)
  let taskName = `📦 Zásilkovna k vyzvednutí od ${emailData.sender} v ${emailData.address}`;
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

  // Description with pickup deadline, tracking number and email link
  let description = '';
  if (emailData.dueDate) {
    const dueDateFormatted = formatDateCzech(emailData.dueDate);
    description += `⏰ Vyzvednout do: ${dueDateFormatted}\n`;
  }
  if (emailData.trackingNumber) {
    description += `📦 Číslo zásilky: ${emailData.trackingNumber}\n`;
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
 * Mark all existing Zásilkovna emails as processed (run once for reset)
 * This prevents creating duplicate tasks
 */
function markAllAsProcessed() {
  // Create label if it doesn't exist
  let label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.GMAIL_LABEL_PROCESSED);
  }

  const processedIds = [];
  let start = 0;
  const batchSize = 100;

  // Process all emails in batches of 100
  while (true) {
    const query = 'from:zasilkovna.cz subject:připravena';
    const threads = GmailApp.search(query, start, batchSize);

    if (threads.length === 0) {
      break;
    }

    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const message of messages) {
        if (message.getFrom().includes('zasilkovna.cz')) {
          processedIds.push(message.getId());
        }
      }
      thread.addLabel(label);
    }

    Logger.log(`Processed ${start + threads.length} threads...`);
    start += batchSize;

    // Safety limit
    if (start > 1000) {
      Logger.log('Reached limit of 1000 threads.');
      break;
    }
  }

  // Save IDs to properties
  const props = PropertiesService.getScriptProperties();
  props.setProperty('processedMessageIds', JSON.stringify(processedIds));

  Logger.log(`Done! Marked ${processedIds.length} emails as processed.`);
}

/**
 * Test function - run manually to verify parsing
 */
function testParsing() {
  const testBody = `Dobrý den,

vaše zásilka číslo Z 262 4868 930 od odesilatele WITTCHEN S.A. je pro vás připravena na výdejním místě Praha 4, Nusle, Na Pankráci 1618/30 (Don Pealo).

Heslo pro vydání zásilky je V143C.

Zásilku si můžete vyzvednout nejpozději dne 16. ledna.`;

  const mockMessage = {
    getPlainBody: () => testBody,
    getFrom: () => 'noreply@zasilkovna.cz',
    getId: () => 'test-message-id',
    getDate: () => new Date()
  };

  const result = parseZasilkovnaEmail(mockMessage);
  Logger.log('Parsing result:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Diagnostics - check why emails are not found
 */
function debugSearchQuery() {
  // Test 1: Search all emails from Zásilkovna
  const query1 = 'from:zasilkovna.cz';
  const threads1 = GmailApp.search(query1, 0, 5);
  Logger.log(`Query "${query1}": found ${threads1.length} threads`);

  if (threads1.length > 0) {
    const msg = threads1[0].getMessages()[0];
    Logger.log(`  Example - From: ${msg.getFrom()}`);
    Logger.log(`  Example - Subject: ${msg.getSubject()}`);
  }

  // Test 2: Search with subject
  const query2 = 'from:zasilkovna.cz subject:připravena';
  const threads2 = GmailApp.search(query2, 0, 5);
  Logger.log(`Query "${query2}": found ${threads2.length} threads`);

  // Test 3: Without label
  const query3 = `from:zasilkovna.cz subject:připravena -label:${CONFIG.GMAIL_LABEL_PROCESSED}`;
  const threads3 = GmailApp.search(query3, 0, 5);
  Logger.log(`Query "${query3}": found ${threads3.length} threads`);

  // Test 4: Check if label exists
  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL_PROCESSED);
  Logger.log(`Label "${CONFIG.GMAIL_LABEL_PROCESSED}" exists: ${label !== null}`);
}

/**
 * Setup automatic trigger (run once manually)
 */
function setupTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'processZasilkovnaEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Create new trigger - run every 15 minutes
  ScriptApp.newTrigger('processZasilkovnaEmails')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('Trigger set - script will run every 15 minutes.');
}
