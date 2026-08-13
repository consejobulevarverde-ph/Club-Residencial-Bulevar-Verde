# Club Residencial Bulevar Verde - Project Documentation

## Technology Stack
- **Static Site Generator**: Hugo (Spanish language site, es-co locale)
- **Hosting**: GitHub Pages (`https://consejobulevarverde-ph.github.io/Club-Residencial-Bulevar-Verde/`)
- **Backend Services**: Google Apps Script (for PQRS, Reservas, Sanciones, Portal Cliente)
- **Languages**: HTML, JavaScript, TOML (Hugo config)

## Project Overview
This is a website for Club Residencial Bulevar Verde, a residential community in Itagüí, Antioquia, Colombia. It provides:
- **Reservas** (Reservations): Community space bookings
- **PQRS** (Peticiones, Quejas, Reclamos, Sugerencias): Complaints and suggestions system
- **Sanciones** (Sanctions): Community conduct violations management
- **Datos Personales** (Personal Data): User account management

## Key Information
- **Project Name**: Club Residencial Bulevar Verde
- **Location**: Calle 70 # 59 265, Itagüí, Antioquia, Colombia
- **Primary Contact**: bulevarverdeadmon@gmail.com | +573222289066
- **Consejo de Administración**: consejo.bulevarverde@gmail.com
- **Comité de Convivencia**: comiteconvivenciabulevarverde@gmail.com
- **Portería**: +573009728851 | +573245820968
- **WhatsApp Comunidad**: https://chat.whatsapp.com/HonY8ALBTlR6ivBNxyx0pv
- **Theme Color**: #2c5f2d (green)

## Directory Structure
```
├── layouts/              # Hugo templates and partial components
│   ├── index.html       # Homepage layout
│   ├── pqrs/           # PQRS system templates
│   ├── sanciones-*/    # Sanctions system templates
│   └── ...
├── static/              # Static assets
│   ├── js/             # JavaScript files (maintenance, gestion, evidence camera)
│   └── ...
├── content/            # Hugo content pages
├── hugo.toml           # Hugo configuration file
└── ...
```

## Google Apps Script Integration
The site integrates with multiple Google Apps Script Web Apps for backend functionality:
- **Portal Cliente**: Web App for client portal access
- **PQRS**: Request/complaint management system
- **Reservas**: Reservation management
- **Sanciones**: Sanctions management

Each Google Apps Script has a version identifier in `hugo.toml` under `params` for tracking updates.

## Important Notes
- Site configuration is in `hugo.toml` using TOML format
- All text and UI labels are in Spanish (Colombian Spanish)
- The project uses custom JavaScript for functionality like evidence cameras, PQRS management, and maintenance workflows
- Google Apps Script URLs should not be committed to version control if they contain sensitive tokens

## Design Constraints - IMPORTANT

### Header and Footer Requirements
**ALL pages (layouts) MUST include both header (navbar) and footer elements using Hugo partials.** This is a non-negotiable requirement. Never duplicate code — always use the centralized partials.

#### Header (Navbar)
- **Partial location:** `layouts/partials/header.html`
- **Usage:** Place at the very top of the page, right after `<body>`
- **Example:**
  ```html
  <body>
    {{ partial "header" . }}
    <!-- rest of page content -->
  </body>
  ```
- **Includes:**
  - Site logo/brand link (Club Bulevar Verde)
  - Navigation menu items from `hugo.toml` configuration
  - Consistent styling using theme colors
  - Responsive navbar with mobile toggle

#### Footer
- **Partial location:** `layouts/partials/footer.html`
- **Usage:** Place right before the closing `</body>` tag
- **Example:**
  ```html
    {{ partial "footer" . }}
  </body>
  ```
- **Includes:**
  - Copyright information
  - Social media links (Facebook, Instagram, WhatsApp community)
  - Consistent styling and branding
  - Links from `hugo.toml` social media parameters

**Critical Rule:** 
- **DO NOT duplicate header or footer code** 
- **ALWAYS use the partials:** `{{ partial "header" . }}` and `{{ partial "footer" . }}`
- To customize: Edit the partials once in `layouts/partials/` and changes apply to all pages automatically

This ensures visual consistency across all pages and provides consistent navigation and branding.

## Development Workflow
When working with this Hugo project:
1. Edit layouts in `layouts/` directory (HTML with Hugo templating)
2. Add or modify JavaScript in `static/js/`
3. Update configuration in `hugo.toml`
4. **For new layouts (CRITICAL - use partials):**
   - Top of page: `{{ partial "header" . }}`
   - Bottom of page (before `</body>`): `{{ partial "footer" . }}`
   - Never duplicate header or footer code
5. **To customize header or footer:**
   - Edit `layouts/partials/header.html` or `layouts/partials/footer.html`
   - Changes apply to ALL pages automatically
   - No need to edit individual layouts
6. Test with Hugo server before deploying to GitHub Pages

## Hugo Links and URLs - CRITICAL ⚠️

**The site is deployed in a subdirectory:** `baseURL = 'https://consejobulevarverde-ph.github.io/Club-Residencial-Bulevar-Verde/'`

### Linking to the Home/Root Page

**CORRECT way:**
- `{{ .Site.Home.RelPermalink }}` ✓ **ALWAYS USE THIS** - correctly handles subdirectory paths
- This generates the correct relative URL regardless of subdirectory depth

**INCORRECT ways (NEVER use these):**
- `{{ "/" | relURL }}` ✗ Does NOT respect subdirectories (BROKEN on GitHub Pages)
- `{{ "/" }}` ✗ Links to domain root, not site root
- Hardcoded `/something` ✗ Same problem - won't work in subdirectory

### Linking to Files and Internal Pages

**For ANY static file or page in the site, use relURL:**
```html
<!-- Images (favicons, logos, etc.) -->
<link rel="icon" href="{{ "images/favicon-32x32.png" | relURL }}">
<img src="{{ "images/logo.png" | relURL }}">

<!-- JavaScript -->
<script src="{{ "js/script.js" | relURL }}"></script>

<!-- CSS -->
<link rel="stylesheet" href="{{ "css/style.css" | relURL }}">

<!-- Links to other pages/sections -->
<a href="{{ "pqrs/" | relURL }}">PQRS</a>
<a href="{{ "documentos/reglamentos/reglamento.pdf" | relURL }}">Download PDF</a>
```

**Never hardcode paths starting with `/`** — they break in subdirectories. Always wrap with `{{ "path" | relURL }}`

### Example - Before and After

❌ **BROKEN (hardcoded paths):**
```html
<a href="/documentos/file.pdf" download>Download</a>
<a href="{{ "/" | relURL }}">Home</a>
```

✅ **CORRECT (using relURL):**
```html
<a href="{{ "documentos/file.pdf" | relURL }}" download>Download</a>
<a href="{{ .Site.Home.RelPermalink }}">Home</a>
```

This is **critical** because the site lives at `/Club-Residencial-Bulevar-Verde/` not at the domain root.
