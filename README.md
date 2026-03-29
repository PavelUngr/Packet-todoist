# Zásilkovna & PPL & Balíkovna → Todoist

Google Apps Script that automatically creates Todoist tasks from Zásilkovna, PPL and Balíkovna (Czech parcel delivery services) emails.

*[Česká verze níže](#česká-verze)*

---

## Supported carriers

- **Zásilkovna** (Packeta) - pickup points and Z-BOX parcel lockers
- **PPL** - parcel pickup points (ParcelShop)
- **Balíkovna** (Czech Post) - parcel boxes and pickup points

## What it does

When you receive an email notifying that your parcel is ready for pickup, the script:

1. Extracts from the email:
   - Sender (e-shop name)
   - Pickup location
   - Pickup deadline
   - Tracking number
   - PIN/pickup code (Z-BOX, PPL, Balíkovna)
   - GPS coordinates (from map links)

2. Creates a Todoist task:
   - **Title:** `📦 [Carrier] k vyzvednutí od [sender] v [location] (do [deadline])`
   - **Due date:** Day when email arrived (when to start dealing with pickup)
   - **Deadline:** Last day to pick up the parcel
   - **Description:**
     - Pickup deadline
     - Tracking number
     - PIN (if available)
     - Link to original email
     - Google Maps navigation link

## Installation

### 1. Create Google Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Delete content and paste code from `zasilkovna-todoist.gs`

### 2. Configure

Fill in the `CONFIG` section:

```javascript
const CONFIG = {
  TODOIST_API_TOKEN: 'your-api-token',
  TODOIST_PROJECT_ID: 'your-project-id',
  // ...
};
```

**How to get Todoist API token:**
- Todoist → Settings → Integrations → API token (Developer)

**How to get Project ID:**
```bash
curl -X GET "https://api.todoist.com/api/v1/projects" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### 3. Grant permissions

1. Run `testZasilkovna`, `testPPL` or `testBalikovna` function
2. Google will ask for Gmail access - allow everything
3. On "Google hasn't verified this app" warning, click "Advanced" → "Go to project"

### 4. Mark existing emails

To prevent creating tasks from old emails:

1. Run `markAllAsProcessed` function

### 5. Activate automatic trigger

1. Run `setupTrigger` function

The script will run every 15 minutes.

## Multi-account support

The script works on any Gmail account. You can install it on multiple Google accounts and they will all create tasks in the same Todoist project (as long as they share the same API token and project ID).

Gmail links in task descriptions use `Session.getActiveUser().getEmail()` instead of hardcoded account index, so they work correctly regardless of which account the script runs on.

## Functions

| Function | Description |
|----------|-------------|
| `processAllCarriers` | Main function - processes new emails from all carriers |
| `markAllAsProcessed` | Marks all existing emails as processed |
| `setupTrigger` | Sets up automatic trigger (every 15 min) |
| `clearProcessedIds` | Clears stored processed message IDs (useful after fixing issues) |
| `debugSearch` | Diagnostics - check Gmail search queries for all carriers |
| `testZasilkovna` | Test Zásilkovna email parsing |
| `testPPL` | Test PPL email parsing |
| `testBalikovna` | Test Balíkovna email parsing |

## Adding new carriers

The script is designed to be easily extensible. To add a new carrier:

1. Add configuration to `CARRIERS` object
2. Create parser function for the email format
3. Run `markAllAsProcessed` to prevent duplicate tasks

## Requirements

- Google account with Gmail
- Todoist account (free version works)
- Todoist API v1 (`api.todoist.com/api/v1/`)

## Changelog

### v2.3.0
- **Fix:** Label was added even when Todoist API failed, causing emails to be silently skipped on retry
- **Migration:** Todoist REST API v2 → API v1 (v2 is deprecated)
- **New:** Deadline field - last pickup date set as task deadline (separate from due date)
- **New:** Dynamic Gmail links using `Session.getActiveUser()` for multi-account support
- **New:** `clearProcessedIds()` utility function
- **Improved:** Error handling accepts any 2xx status code, logs message ID

### v2.2.0
- Added Balíkovna (Czech Post) carrier support
- Added GPS navigation links
- Improved multiline parsing

### v2.1.0
- Added Z-BOX support for Zásilkovna
- Added PPL carrier support

## License

MIT

---

# Česká verze

Google Apps Script, který automaticky vytváří úkoly v Todoist z e-mailů od Zásilkovny, PPL a Balíkovny.

## Podporovaní dopravci

- **Zásilkovna** (Packeta) - výdejní místa i Z-BOX boxy
- **PPL** - výdejní místa (ParcelShop)
- **Balíkovna** (Česká pošta) - boxy a výdejní místa

## Co skript dělá

Když ti přijde e-mail s oznámením, že je zásilka připravena k vyzvednutí, skript:

1. Extrahuje z e-mailu:
   - Odesílatele (e-shop)
   - Místo vyzvednutí
   - Termín vyzvednutí
   - Číslo zásilky
   - PIN/kód pro vyzvednutí (Z-BOX, PPL, Balíkovna)
   - GPS souřadnice (z odkazů na mapu)

2. Vytvoří úkol v Todoist:
   - **Název:** `📦 [Dopravce] k vyzvednutí od [odesílatel] v [místo] (do [termín])`
   - **Termín realizace (due date):** Den kdy přišel e-mail (kdy začít řešit vyzvednutí)
   - **Termín dokončení (deadline):** Poslední den k vyzvednutí zásilky
   - **Popis:**
     - Termín vyzvednutí
     - Číslo zásilky
     - PIN (pokud je k dispozici)
     - Odkaz na původní e-mail
     - Odkaz na Google Maps pro navigaci

## Instalace

### 1. Vytvoř Google Apps Script

1. Jdi na [script.google.com](https://script.google.com)
2. Klikni na **Nový projekt**
3. Smaž obsah a vlož kód ze souboru `zasilkovna-todoist.gs`

### 2. Nastav konfiguraci

V sekci `CONFIG` vyplň:

```javascript
const CONFIG = {
  TODOIST_API_TOKEN: 'tvuj-api-token',
  TODOIST_PROJECT_ID: 'id-projektu',
  // ...
};
```

**Jak získat Todoist API token:**
- Todoist → Nastavení → Integrace → API token (Developer)

**Jak získat Project ID:**
```bash
curl -X GET "https://api.todoist.com/api/v1/projects" \
  -H "Authorization: Bearer TVUJ_API_TOKEN"
```

### 3. Povol přístup

1. Spusť funkci `testZasilkovna`, `testPPL` nebo `testBalikovna`
2. Google tě požádá o povolení přístupu k Gmailu - povol vše
3. Při varování "Google tuto aplikaci neověřil" klikni na "Rozšířené možnosti" → "Přejít do projektu"

### 4. Označ existující e-maily

Aby se nevytvářely úkoly ze starých e-mailů:

1. Spusť funkci `markAllAsProcessed`

### 5. Aktivuj automatické spouštění

1. Spusť funkci `setupTrigger`

Skript se bude spouštět každých 15 minut.

## Podpora více účtů

Skript funguje na jakémkoli Gmail účtu. Můžete ho nainstalovat na více Google účtů a všechny budou vytvářet úkoly do stejného Todoist projektu (pokud sdílí stejný API token a project ID).

Odkazy na e-maily v popisu úkolu používají `Session.getActiveUser().getEmail()` místo pevně zadaného indexu účtu, takže fungují správně bez ohledu na to, na kterém účtu skript běží.

## Funkce

| Funkce | Popis |
|--------|-------|
| `processAllCarriers` | Hlavní funkce - zpracuje nové e-maily od všech dopravců |
| `markAllAsProcessed` | Označí všechny existující e-maily jako zpracované |
| `setupTrigger` | Nastaví automatické spouštění každých 15 minut |
| `clearProcessedIds` | Vymaže uložená ID zpracovaných zpráv (užitečné po opravě problémů) |
| `debugSearch` | Diagnostika - kontrola Gmail search queries pro všechny dopravce |
| `testZasilkovna` | Test parsování e-mailu Zásilkovny |
| `testPPL` | Test parsování e-mailu PPL |
| `testBalikovna` | Test parsování e-mailu Balíkovny |

## Přidání dalších dopravců

Skript je navržen pro snadné rozšíření. Pro přidání nového dopravce:

1. Přidej konfiguraci do objektu `CARRIERS`
2. Vytvoř parser funkci pro formát e-mailu
3. Spusť `markAllAsProcessed` pro prevenci duplicitních úkolů

## Požadavky

- Google účet s Gmailem
- Todoist účet (stačí free verze)
- Todoist API v1 (`api.todoist.com/api/v1/`)

## Licence

MIT
