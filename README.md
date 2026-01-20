# Zásilkovna & PPL → Todoist

Google Apps Script that automatically creates Todoist tasks from Zásilkovna and PPL (Czech parcel delivery services) emails.

*[Česká verze níže](#česká-verze)*

---

## Supported carriers

- **Zásilkovna** (Packeta) - pickup points and Z-BOX parcel lockers
- **PPL** - parcel pickup points (ParcelShop)

## What it does

When you receive an email notifying that your parcel is ready for pickup, the script:

1. Extracts from the email:
   - Sender (e-shop name)
   - Pickup location
   - Pickup deadline
   - Tracking number
   - PIN code (Z-BOX and PPL)
   - GPS coordinates (from map links)

2. Creates a Todoist task:
   - **Title:** `📦 [Carrier] k vyzvednutí od [sender] v [location] (do [deadline])`
   - **Due date:** Day when email arrived
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
curl -X GET "https://api.todoist.com/rest/v2/projects" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### 3. Grant permissions

1. Run `testZasilkovna` or `testPPL` function
2. Google will ask for Gmail access - allow everything
3. On "Google hasn't verified this app" warning, click "Advanced" → "Go to project"

### 4. Mark existing emails

To prevent creating tasks from old emails:

1. Run `markAllAsProcessed` function

### 5. Activate automatic trigger

1. Run `setupTrigger` function

The script will run every 15 minutes.

## Functions

| Function | Description |
|----------|-------------|
| `processAllCarriers` | Main function - processes new emails from all carriers |
| `markAllAsProcessed` | Marks all existing emails as processed |
| `setupTrigger` | Sets up automatic trigger (every 15 min) |
| `testZasilkovna` | Test Zásilkovna email parsing |
| `testPPL` | Test PPL email parsing |
| `debugSearchQuery` | Diagnostics - check Gmail query for all carriers |

## Adding new carriers

The script is designed to be easily extensible. To add a new carrier:

1. Add configuration to `CARRIERS` object
2. Create parser function for the email format
3. Run `markAllAsProcessed` to prevent duplicate tasks

## Requirements

- Google account with Gmail
- Todoist account (free version works)

## License

MIT

---

# Česká verze

Google Apps Script, který automaticky vytváří úkoly v Todoist z e-mailů od Zásilkovny a PPL.

## Podporovaní dopravci

- **Zásilkovna** (Packeta) - výdejní místa i Z-BOX boxy
- **PPL** - výdejní místa (ParcelShop)

## Co skript dělá

Když ti přijde e-mail s oznámením, že je zásilka připravena k vyzvednutí, skript:

1. Extrahuje z e-mailu:
   - Odesílatele (e-shop)
   - Místo vyzvednutí
   - Termín vyzvednutí
   - Číslo zásilky
   - PIN kód (Z-BOX a PPL)
   - GPS souřadnice (z odkazů na mapu)

2. Vytvoří úkol v Todoist:
   - **Název:** `📦 [Dopravce] k vyzvednutí od [odesílatel] v [místo] (do [termín])`
   - **Termín:** Den kdy přišel e-mail
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
curl -X GET "https://api.todoist.com/rest/v2/projects" \
  -H "Authorization: Bearer TVUJ_API_TOKEN"
```

### 3. Povol přístup

1. Spusť funkci `testZasilkovna` nebo `testPPL`
2. Google tě požádá o povolení přístupu k Gmailu - povol vše
3. Při varování "Google tuto aplikaci neověřil" klikni na "Rozšířené možnosti" → "Přejít do projektu"

### 4. Označ existující e-maily

Aby se nevytvářely úkoly ze starých e-mailů:

1. Spusť funkci `markAllAsProcessed`

### 5. Aktivuj automatické spouštění

1. Spusť funkci `setupTrigger`

Skript se bude spouštět každých 15 minut.

## Funkce

| Funkce | Popis |
|--------|-------|
| `processAllCarriers` | Hlavní funkce - zpracuje nové e-maily od všech dopravců |
| `markAllAsProcessed` | Označí všechny existující e-maily jako zpracované |
| `setupTrigger` | Nastaví automatické spouštění každých 15 minut |
| `testZasilkovna` | Test parsování e-mailu Zásilkovny |
| `testPPL` | Test parsování e-mailu PPL |
| `debugSearchQuery` | Diagnostika - kontrola Gmail query pro všechny dopravce |

## Přidání dalších dopravců

Skript je navržen pro snadné rozšíření. Pro přidání nového dopravce:

1. Přidej konfiguraci do objektu `CARRIERS`
2. Vytvoř parser funkci pro formát e-mailu
3. Spusť `markAllAsProcessed` pro prevenci duplicitních úkolů

## Požadavky

- Google účet s Gmailem
- Todoist účet (stačí free verze)

## Licence

MIT
