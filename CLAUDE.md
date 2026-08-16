# Club Residencial Bulevar Verde — Claude Code Guide

## Project Overview

**Stack**: Hugo + Firebase Hosting + Firebase Data Connect (GraphQL over Postgres) + Bootstrap 5.3.3 + vanilla JavaScript

**Key Pages**:
- `/` — home (landing)
- `/datos-personales/` — resident self-service portal (login, profile, residents, vehicles, pets, emergency, sanciones)
- `/sanciones-convivencia/` — community rules violations (legacy page, separate from datos-personales tab)
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

### 6. Sanciones (Two Systems)

1. **Legacy**: `/sanciones-convivencia/` — unauthenticated, manual apartment entry, Google Apps Script backend
2. **New (Tab)**: `/datos-personales/tabSanciones` — authenticated, auto-uses resident's apartment, embedded detail + descargos

Both read from same GAS (`consultarCasosApto`, `consultarCasosDetalle`, `subirEvidenciaConvivencia`, `guardarDescargos`).

**Evidence gallery** (reused in both):
- Google Drive URLs with fallback chain: `drive.google.com/thumbnail` → `lh3.googleusercontent.com` → original
- `window.handleConvivenciaEvidenceError_` / `window.handleSancionEvidenceError_` handle missing images on `<img onerror>`

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
  sanciones-convivencia/list.html  # Legacy sanciones page
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

Pattern from `sanciones-convivencia/list.html`:

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

---

**Last updated**: 2026-08-15 — sanciones tab, full resident edit, uppercase transforms, evidence camera integration
