# Club Residencial Bulevar Verde — Claude Code Guide

## Project Overview

**Stack**: Hugo + Firebase Hosting + Firebase Data Connect (GraphQL over Postgres) + Bootstrap 5.3.3 + vanilla JavaScript

**Key Pages**:
- `/` — home (landing)
- `/datos-personales/` — resident self-service portal (login, profile, residents, vehicles, pets, emergency, sanciones)
- Other static pages and news

**Deployment**: `hugo --gc --minify` → `firebase deploy --only hosting`

**Key URLs**:
- API: `https://bulevar-verde-api-739757275794.us-east4.run.app`
- Hosting: `https://project-7dd6d100-d8c2-427a-a80.web.app`
- GAS (Sanciones): `https://script.google.com/macros/s/AKfycbxk69LDxXyh8TgMb2CUjmKuzQ_hWI8hjEwzNjmXHSwxoXsSwrBv-Tiffv8h3BGUwDVx/exec`

## Critical Patterns & Conventions

### 1. Session Tokens (Resident Portal Login)

Stored in `localStorage` under key `bvDatosPersonalesToken`. Format: HMAC-SHA256 signed, base64url-encoded plaintext (NOT encrypted). Only tamper-proof.

Token obtained from backend (`/api/v1/datos-personales/validar`), then used for all authenticated requests to API. TTL: 2 hours.

**Important**: Never store sensitive PII in plaintext payload. Use only `{ personaId, unidadId }`.

### 2. Hugo Template & Configuration

All pages use Go templates (`.html` files). Configuration injected via `.Site.Params` from `hugo.toml`:

```toml
[params]
apiBaseUrl = "https://bulevar-verde-api-739757275794.us-east4.run.app"
sancionesWebAppUrl = "https://script.google.com/macros/s/AKfycbxk69LDxXyh8TgMb2CUjmKuzQ_hWI8hjEwzNjmXHSwxoXsSwrBv-Tiffv8h3BGUwDVx/exec"
```

Access in templates: `{{ .Site.Params.apiBaseUrl | default "" | jsonify | safeJS }}`

### 3. JavaScript Pattern (Single IIFE per Page)

Each page with JS (e.g., `datos-personales/list.html`) wraps logic in a single IIFE:

```javascript
<script>
  (function () {
    'use strict';
    
    var API_BASE = {{ .Site.Params.apiBaseUrl | ... }};
    var profile = null;
    
    function esc(value) { /* HTML escape */ }
    function apiFetch(path, options) { /* Fetch wrapper */ }
    
    // Event handlers
    loadProfile();
  }());
</script>
```

**Reuse these helpers** (don't reimplement):
- `esc(value)` — HTML-escape to prevent XSS
- `apiFetch(path, options)` — prefixes `API_BASE + '/api/v1/datos-personales'`, includes token, handles 401 logout
- `alertMessage(message, type)` — temporary alert (success/error/info)
- `clearAlert()` — clear alert
- `showTab(id)` — switch tab visibility (toggle `.hidden`, update `.nav-link.active`)
- `loading(button, state, text)` — disable/enable button with spinner

### 4. Tab Navigation Pattern

Resident portal uses `.nav-link` / `.tab-pane-content` convention:

```javascript
$('profileTabs').addEventListener('click', function (event) {
  var button = event.target.closest('button[data-target]');
  if (button && !button.closest('.hidden')) {
    showTab(button.dataset.target);
    // Lazy-load: if (button.dataset.target === 'tabNewTab') cargarNewTab();
  }
});
```

Each tab pane:
```html
<div id="tabName" class="tab-pane-content hidden"><!-- content --></div>
```

### 5. Text Uppercase Enforcement

Frontend mirrors backend transforms visually with `text-uppercase` class:

```html
<input class="form-control text-uppercase" value="juan" />
<!-- Renders and stores as "JUAN" -->
```

Applied to: tipo documento, número documento, nombre, especie, raza, parentesco. NOT to correo, teléfono, descargos (free text).

### 6. Sanciones de Convivencia — full Ley 675/2001 sanction process (bulevar-verde-api, not Google Apps Script)

Google Apps Script (`google/sanciones-convivencia.js`) was retired. Cases now live in Postgres via
Data Connect (`CasoConvivencia`/`EvidenciaConvivencia`/`EventoCasoConvivencia`/`Sancion` types), served
by `bulevar-verde-api`'s `convivencia` module and `datos-personales` sanciones sub-resource. It's a real
state machine now, not just create+resolve — see `bulevar-verde-api/doc/CONVIVENCIA_NOTIFICATIONS.md`
for the full diagram; short version: `PENDIENTE_DESCARGOS` → `CON_DESCARGOS` → (formal cases only)
`PENDIENTE_APROBACION_CONSEJO` → `SANCION_APROBADA` → optional `EN_APELACION` →
`SANCION_RATIFICADA`/`SANCION_REVOCADA`, with `CERRADO_SIN_SANCION`/`ARCHIVADO` side branches. A case's
severity decides at creation time whether it even needs the formal process (`requiereProcesoFormal` —
"Llamado de Atención" doesn't; everything else does).

1. **Case creation** — `vigilancia-datos/list.html` / `administracion-datos/list.html`, shared
   `partials/convivencia-form.html` + `static/js/convivencia-form.js` wizard. Firebase-authenticated,
   calls `POST /api/v1/convivencia/casos` and `POST /api/v1/convivencia/evidencias`. Keeps its
   offline-first IndexedDB queue (`clientRequestId` dedup) — only the transport changed. Severity
   badges visually flag which ones are a mere "llamado de atención" vs. formal-process-eligible.
2. **Resident consultation, descargos & apelación** — `/datos-personales/tabSanciones`, authenticated
   via the resident session token (same `apiFetch()` used by every other tab). Calls `GET /sanciones`,
   `GET /sanciones/:caseCode`, `POST /sanciones/evidencias`, `POST /sanciones/:caseCode/descargos`, and
   `POST /sanciones/:caseCode/apelacion` (only once a sanction is `SANCION_APROBADA`). The unit is
   always derived server-side from the session — never sent by the client. The resident sees the
   proposed sanction amount as soon as administración stages it, not only after Consejo approval.
3. **Admin case management** — `administracion-datos/list.html`, "Casos Convivencia" panel. The old
   single "resolver" form is now a state-dependent dispatcher: from `PENDIENTE_DESCARGOS`/`CON_DESCARGOS`
   it shows close/archive plus (formal cases only) "registrar acta de comité" and "proponer sanción
   económica"; from `PENDIENTE_APROBACION_CONSEJO` it shows aprobar/rechazar/devolver; from
   `EN_APELACION` it shows ratificar/revocar. Always shows the case's event timeline
   (`EventoCasoConvivencia`) and the linked `Sancion` record when one exists. Vigilancia never gets
   this panel — case creation is its only role in the process.

Evidence still lands in the same Google Drive folder as before (`soporte-sanciones-convivencia`),
now uploaded by the API itself (`src/services/drive.ts` in bulevar-verde-api) via an OAuth2 refresh
token for the same Gmail account used for SMTP — not a Drive API-incompatible app password. Accepts
images (≤20MB), video (≤50MB), and PDF (≤50MB, with a quick pdf-lib optimization pass) — used for the
Comité's acta and its anexos, and for appeal evidence, in addition to case/descargo evidence.

**Evidence gallery**:
- Google Drive URLs with fallback chain: `drive.google.com/thumbnail` → `lh3.googleusercontent.com` → original
- `window.handleSancionEvidenceError_` handles missing images on `<img onerror>` (resident tab)

**Evidence capture**:
- `window.BVEvidenceCamera` — self-contained module (`static/js/evidence-camera.js`), safe to include on multiple pages
- Call: `BVEvidenceCamera.capture({ contextLabel, detailLines, filePrefix, maxDimension, quality })` → `{ name, size, dataUrl, blob, file, captureMetadata }`
- Compress client-side before upload (max 1600px, quality 0.82-0.84)

### 7. Permission-Based Visibility

Check `profile.permisos` array against `[data-permission]` attributes:

```html
<div data-permission="RESIDENTES">
  <!-- Only visible if resident has RESIDENTES perm -->
</div>
```

Owner-only content with `[data-owner-only]`:

```html
<div data-owner-only>
  <!-- Only visible to propietarios (puedeVerResumen === true) -->
</div>
```

### 8. Bootstrap & Icons

- Bootstrap 5.3.3 — grid, forms, modals, nav pills, badges
- bootstrap-icons — `<i class="bi bi-icon-name"></i>`
- CSS variables: `--bv-primary`, `--bv-border` (defined in page `<style>`)
- Font: Montserrat (CDN-loaded)

## Build & Deploy

### Local Development

```bash
cd Club-Residencial-Bulevar-Verde

# Serve locally (watches changes)
hugo server

# Build production
hugo --gc --minify -d public
```

**Runs on `http://localhost:1313` by default.**

### Firebase Hosting Deployment

```bash
hugo --gc --minify
firebase deploy --only hosting

# Or one command:
hugo --gc --minify && firebase deploy --only hosting
```

### Data Connect (Separate)

```bash
firebase deploy --only dataconnect
```

Currently `schemaValidation: COMPATIBLE` in `dataconnect/dataconnect.yaml`.

## File Structure

```
layouts/
  datos-personales/list.html    # Resident portal (login, tabs, JS IIFE)
  [other-pages]/

static/
  js/
    evidence-camera.js    # Camera module, reusable on multiple pages
  css/
  images/

dataconnect/
  dataconnect.yaml
  schema/schema.gql
  admin/datos_personales.gql, cartera.gql, [others]

hugo.toml
```

## Common Tasks

### Add a Resident Tab

1. Add nav item:
   ```html
   <li class="nav-item"><button class="nav-link" data-target="tabName">Tab</button></li>
   ```

2. Add pane before `</section>`:
   ```html
   <div id="tabName" class="tab-pane-content hidden"><!-- content --></div>
   ```

3. (Optional) Lazy-load:
   ```javascript
   if (button.dataset.target === 'tabName' && !nameCargados) cargarName();
   ```

### Display Evidence Gallery

Pattern from `datos-personales/list.html` (`tabSanciones`):

```javascript
function buildEvidenceHtml(url, label) {
  var displayUrls = buildMediaDisplayUrls(url);
  var initialUrl = displayUrls.shift() || url;
  return '<a href="' + esc(url) + '" target="_blank" class="evidence-link">' +
    '<img src="' + esc(initialUrl) + '" alt="' + esc(label) + '" ' +
    'onerror="window.handleSancionEvidenceError_(this)" data-fallback-urls="' +
    esc(JSON.stringify(displayUrls)) + '" />' +
    '<span>' + esc(label) + '</span></a>';
}
```

### Capture Evidence with Camera

```javascript
window.BVEvidenceCamera.capture({
  contextLabel: 'Evidencia',
  detailLines: ['Caso: ' + caseId],
  filePrefix: 'prefix',
  maxDimension: 1600,
  quality: 0.84
}).then(function (evidence) {
  evidenciasAportadas.push(evidence);
  actualizarLista();
}).catch(function (error) {
  alertMessage('Error: ' + error.message);
});
```

### Validate Input

Always enforce on both frontend AND backend:

```javascript
var numDoc = $('inputId').value.trim();
if (numDoc.length < 4) { alertMessage('Too short'); return; }
// Proceed with apiFetch — backend will uppercase + validate
```

## Security Notes

### Tokens Not Encrypted

Like the API, tokens are signed but plaintext-readable. Only tamper-proof. Browser console can decode — acceptable because they only contain identity (personaId, unidadId), not sensitive data.

### XSS Prevention

Always use `esc(value)` for user-controlled strings:

```javascript
// WRONG:
$('name').innerHTML = persona.nombre;  // XSS risk

// RIGHT:
$('name').textContent = persona.nombre;  // Safe
// OR:
$('name').innerHTML = esc(persona.nombre);  // Safe
```

### CORS

Frontend (firebase.web.app) calls backend (Cloud Run) — CORS whitelist on backend includes Firebase URLs. GAS endpoint has no CORS restrictions (public).

## Troubleshooting

**Hugo build fails**: Run `hugo server` for detailed errors. Check syntax, partials, range loops.

**Frontend won't authenticate**: Check `localStorage.bvDatosPersonalesToken` in DevTools. Verify backend is reachable. Check CORS origin whitelist.

**Evidence gallery shows broken images**: Browser console should show fallback retries. Verify Google Drive sharing. Try image URL directly.

**Text not uppercase**: Check input has `text-uppercase` class. Verify backend applies `.transform(upper)`. Clear browser cache.

## Vigilancia Module (`vigilancia-datos/list.html`)

**Role**: Security staff access to unit lookup and primary resident registration. Uses Firebase Auth + custom vigilancia API endpoints.

### Registration Form Features

**Real-time validation**:
- **Apartamento**: Numbers only (1–4 digits). Shows inline error if invalid format detected.
- **Número de documento**: Automatically removes spaces, dashes, special chars; converts to uppercase (alphanumeric only).
- **Nombre completo**: Auto-uppercases (class `text-uppercase`).

**Form grouping** (visual hierarchy):
```
Unidad [apart. field]
─────────────────────
Identidad
  Nombre completo
  Tipo de documento | Número de documento
  Tipo de residente principal
─────────────────────
Contacto [opcional badge]
  Correo | Celular
─────────────────────
[Checkbox: Retirar anteriores]
[Checkbox: Confirmar información]
```

### Search Results Display

**Contact de emergencia** (if present):
- Telephone icon + structured layout (name, relation, phone number)
- Uses `small-note` and `text-monospace` for visual weight hierarchy
- Border-top separator from unit info above

**Sample data in placeholders**:
- Apartment: "1029"
- Name: "Pepito Pérez López"
- Document: "1234567890"
- Email: "pepito.perez@ejemplo.com"
- Phone: "+57 300 123 4567"

## UI Design & Sample Data Practices

### Using Generic Sample Data

The productive UI must never bake in personal data from real users. This ensures:
- Code review doesn't expose resident information accidentally
- Screenshots/demos stay confidential
- Placeholders are memorable and guide user intent

**Replace personal data with generic equivalents**:
- Names: "Pepito Pérez", "Juan García", "María López", "Pedro Páramo"
- Apartment numbers: "301", "502", "1204" (realistic without being real)
- Phone numbers: Placeholder format `+57 300 123 4567` or `(+57) 1 2345 6789`
- Emails: `pepito.perez@example.com`, `usuario@ejemplo.com`
- Car plates: `ABC123` (valid Colombian format but obviously fake)
- Document numbers: `1234567890`, `9876543210` (never match real resident docs)

For fields with specific formatting rules (like `vehPlaca`), use format-compliant examples that are clearly fabricated. Do not use actual resident vehicle plates or documents in placeholder text.

### Business Rules Should Not Appear in UI Labels

Expose *constraints*, not rules. Examples:

**❌ Wrong** (exposes business rule):
```html
<span class="small text-muted">Máximo 3 mascotas por unidad</span>
```
Why: This is a rule. If the user needs to know, the backend will reject with an error message.

**✅ Right** (constraint only):
```html
<input placeholder="Nombre de la mascota" ... />
```
Why: Neutral label. When/if they exceed capacity, the API returns `"Ya hay 3 mascotas vinculadas a esta unidad"`.

### Following ISO/IEC 13407 & Nielsen's Usability Heuristics

While not strict compliance, the UI should embrace:

1. **Visibility of System Status** — Show real-time feedback:
   - Plate field: Validation indicator (✓ green / ✗ red) appears as user types
   - Loading states: spinner + disabled button during API calls
   - Form submission: visual confirmation (toast/alert) of success

2. **Match Between System & Real World**:
   - Use terminology residents recognize: "Placa" not "License plate", "Residente" not "Individual"
   - Format examples should match local conventions (e.g., Colombian phone format, plate format)

3. **User Control & Freedom**:
   - Modal close buttons (×) always present
   - Confirmation dialogs for destructive actions ("¿Retirar este vehículo?")
   - Clear error messages pinpoint the issue (not "Error submitting")

4. **Error Prevention & Recovery**:
   - Real-time validation (like plate format) prevents invalid submissions
   - Optional fields are clearly marked; required fields enforce on blur/submit
   - Trim whitespace; normalize case—don't burden the user with formatting

5. **Aesthetic & Minimalist Design**:
   - Avoid exposing internal IDs, technical jargon, or debug info to end-user labels
   - Use semantic HTML (form labels, buttons, modals) for accessibility
   - Batch related fields (e.g., contact info grouped under "Contacto (opcional)")

---

**Last updated**: 2026-09-02 — extended sanciones de convivencia into a full Ley 675/2001 sanction-process state machine (comité de convivencia sessions, Consejo de Administración approval/rejection/return-for-revision, resident appeals with ratify/revoke, an economic sanction record, and a per-case event timeline in both the admin panel and resident portal); added PDF evidence support and raised upload size limits
