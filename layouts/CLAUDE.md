# Club Residencial Bulevar Verde — Frontend Guide

## Project Overview

**Stack**: Hugo static site generator + Vanilla JavaScript + Bootstrap 5.3.3 + Firebase Auth + Flatpickr

**Frontend URL**: https://bulevar-verde-app.web.app

**Key Routes**:
- `/` — Public landing page (unauthenticated)
- `/datos-personales/` — Resident portal: profile, family members, vehicles, pets, emergency contacts, **reservations**
- `/reservas-admin/` — Staff admin panel (admin/superadmin only): zone catalog management, reservation calendar view
- `/vigilancia-datos/` — Surveillance staff calendar view (vigilancia role)

**Deployment**: Auto-triggered by push to `origin/firebase` → Firebase Hosting (automatic)

## Critical Patterns & Conventions

### 1. DOM Utility Functions

All pages use a global `$()` helper (defined in each layout's script section):
```javascript
function $(id) {
  return document.getElementById(id);
}
```

**Safety rule**: Always null-check before calling methods on returned elements:
```javascript
var el = $('elementId');
if (el) el.classList.add('hidden');  // ✅
el.classList.add('hidden');  // ❌ Crashes if element missing
```

This is critical in `/reservas-admin/` where DOM might be conditionally rendered based on Firebase auth state.

### 2. Firebase Authentication

All admin/staff pages use Firebase Auth (Google Cloud credentials):
```javascript
firebase.auth().currentUser  // Check current user
firebase.auth().signOut()    // Logout
user.getIdToken()            // Get ID token for API calls
```

Auth state checked before rendering protected content. If user not authenticated, page shows login form, else shows admin panel.

### 3. API Calls with ID Token

All calls to `https://bulevar-verde-api-*.run.app` require Firebase ID token:
```javascript
function withIdToken(fn) {
  var user = firebase.auth().currentUser;
  if (!user) return Promise.reject(new Error('Not authenticated'));
  return user.getIdToken().then(fn);
}

// Usage:
withIdToken(function (idToken) {
  return apiFetch('/api/v1/reservas/catalogo', idToken, { method: 'POST', body: {...} });
})
```

All admin endpoints (`/reservas/catalogo`, `/reservas/`, `/reservas/disponibilidad`) enforce `administrador` or `superadmin` role via this pattern.

### 4. Date Handling in Reservas Wizard

**`/datos-personales/` → Paso 1** (Resident reservation flow):
- Flatpickr date picker with `minDate` = first valid business day (calculated based on `zona.anticipacionMinHabiles`)
- `maxDate` = today + `zona.anticipacionMaxDias`
- Recalculated dynamically when resident selects a different zone

**Paso 2** (Availability):
- Fetch `/api/v1/datos-personales/reservas/disponibilidad?zonaComunId=...&desde=...&hasta=...`
- Generates hourly time slots (not 30-minute — backend enforces hour-exact reservations)
- Each slot shows `startTime - endTime` with occupied status

**Paso 3** (Confirmation):
- Time inputs have `step="3600"` (1 hour increments) and `min`/`max` from zone's `horaApertura`/`horaCierre`
- Selecting a slot auto-fills both start **and** end time (end = start + `zona.duracionMinHoras`)
- User can adjust end time manually up to `duracionMaxHoras`

### 5. Reservation Calendar (Staff View)

**`/reservas-admin/` → Agenda view**:
- Table layout: zones as rows, dates as columns
- Cells color-coded by reservation state (⏳ pending, ✅ confirmed, ❌ rejected, ⚫ cancelled)
- Each cell shows compact reservation blocks: emoji + unit code + time
- Quick actions: "7 días" (today + 6 days), "Mes" (full month), Refresh button
- Modal dialogs for approve/reject/cancel/payment actions

**`/vigilancia-datos/` → Surveillance calendar**:
- Same calendar layout as reservas-admin (template-driven via Hugo)
- Used by vigilancia role to monitor zone usage (read-only, no mutation buttons)

### 6. Zone Management (`/reservas-admin/` → Catálogo)

Zone fields and validation:
- `codigo` — unique zone code (e.g., "CANCHA-1")
- `tipo` — "CANCHA" or "SALON"
- `horaApertura`, `horaCierre` — "HH:MM" format (e.g., "06:00", "22:00")
- `duracionMinHoras`, `duracionMaxHoras` — hours (integer)
- `costoReserva`, `depositoGarantia` — numeric (cents OK via `numeric(16,2)`)
- `anticipacionMinHabiles`, `anticipacionMaxDias` — advance booking constraints
- `soportaModalidadRecreativa` — boolean; if true, show RECREATIVO option in resident wizard
- `costoRecreativo`, `depositoRecreativo`, etc. — override fields for RECREATIVO modalidad

All text fields sent from forms are uppercase-normalized by the backend (not frontend responsibility).

### 7. Emoji Indicators (Vigilancia & Reservas-Admin)

**Zone Emojis** (`getEmojiZona`):
- "CANCHA" → ⚽ (soccer ball)
- "SALON" → 🏛️ (classical building)
- Default 🌇 (skyline)

**Reservation State Emojis** (`getEmojiEstado`):
- "PENDIENTE" → ⏳ (hourglass)
- "CONFIRMADA" → ✅ (check mark)
- "RECHAZADA" → ❌ (cross mark)
- "CANCELADA" → ⚫ (black circle)

### 8. Error Handling & User Feedback

Generic error message box (id="alert"):
```javascript
function msg(text, type) {
  var box = $('alert');
  if (!box) { console.error('Alert element not found'); return; }
  box.className = 'alert alert-' + (type || 'danger');
  box.textContent = text;
  box.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
```

**Always null-check** before accessing elements. Errors like "Cannot set properties of null" indicate missing element checks.

### 9. Modal Dialogs

Bootstrap Modal instances created at page load:
```javascript
var modalRechazarEl = $('modalRechazar');
var modalRechazar = modalRechazarEl ? new bootstrap.Modal(modalRechazarEl) : null;

// Later, before using:
if (modalRechazar) modalRechazar.show();
```

Prevent crashes if modal HTML not present (e.g., if rendered conditionally based on role).

## File Structure

```
layouts/
  index.html                 # Public landing page
  datos-personales/
    list.html              # Resident portal (profile, reservations, etc.)
  reservas-admin/
    list.html              # Admin zone management + reservation calendar
  vigilancia-datos/
    list.html              # Surveillance officer calendar view
  header.html              # Navigation bar (included via Hugo partial)
  footer.html              # Footer (included via Hugo partial)
  CLAUDE.md                # This file
```

## Common Tasks

### Add a New Field to Zone Creation Form

1. Edit `/reservas-admin/list.html`, find the zone creation form (id="crearZonaForm")
2. Add a new `<input>` or `<select>` with a unique id
3. In the form submit handler, extract the value: `var newField = $('newFieldId').value;`
4. Include in POST body sent to `/api/v1/reservas/catalogo` (backend schema must also accept it)
5. Reload admin panel and test

### Modify Date Range Restrictions in Resident Wizard

1. Edit `/datos-personales/list.html`, find `function calcularFechasAnticipacion(zona)`
2. Adjust the business day calculation logic (currently counts Mon-Fri only)
3. Redeploy with `firebase deploy --only hosting`
4. Test by selecting a zone and verifying disabled dates in Flatpickr calendar

### Add a New Zone Type or Emoji

1. Edit `/datos-personales/list.html` or `/reservas-admin/list.html`, find `function getEmojiZona(tipo)`
2. Add new case: `case 'NEW_TYPE': return '🆕';`
3. Same for `getEmojiEstado()` if adding new reservation states
4. Backend schema must also define the enum value

### Debug "Cannot set properties of null" Errors

1. Check browser console for the exact line number
2. Locate that code in the HTML file
3. Verify the element id exists in the HTML (use Ctrl+F to search)
4. If element exists, add null-check before the property access
5. If element doesn't exist, either add it to HTML or guard with `if (element) { ... }`
6. Test locally with `hugo server`, then `firebase deploy --only hosting`

## Build, Test, Deploy

### Local Development

```bash
cd Club-Residencial-Bulevar-Verde

# Start local dev server (auto-reloads on file changes)
hugo server

# Open browser to http://localhost:1313
```

### Firebase Deployment

```bash
# Deploy only Hosting (frontend HTML/CSS/JS)
firebase deploy --only hosting

# Deploy only Data Connect (GraphQL connectors)
firebase deploy --only dataconnect

# Deploy everything
firebase deploy
```

**Important**: The branch `origin/firebase` is auto-deployed to Hosting. Push to that branch to trigger live updates:
```bash
git push origin firebase
```

## Security Notes

### Never Embed Credentials

- No API keys in HTML/JavaScript (use server-side or environment-based auth)
- No hardcoded passwords or tokens
- Firebase config is public (embedded in HTML), but only enables sign-in; data access is server-authorized

### CORS & Firebase Auth

- All requests to `bulevar-verde-api-*.run.app` must include Firebase ID token in Authorization header
- Backend validates token and checks user role before responding
- CORS whitelist includes `https://bulevar-verde-app.web.app` (set via `CORS_ORIGINS` env var in Cloud Run)

### DOM Safety

- Always null-check elements before accessing properties
- Use `textContent` instead of `innerHTML` for user-facing text (prevents XSS)
- Escape user data with `function esc(value) { ... }` if rendering to HTML

## Troubleshooting

**"Cannot set properties of null (setting 'innerHTML')"**: Element doesn't exist. Add null-check: `if (el) el.innerHTML = '...';`

**Date picker not showing**: Flatpickr CSS/JS may not be loaded. Check network tab for 404s on CDN resources.

**Modal won't open**: Modal element missing from HTML or `new bootstrap.Modal()` failed (null element). Verify element exists before creating modal instance.

**API calls return 401**: Firebase auth expired or missing. Check `firebase.auth().currentUser` exists and call `getIdToken()` before each API request.

**Zone list shows empty in admin**: Check Network tab for `/api/v1/reservas/catalogo` response. If 500+, check API Cloud Run logs. If 403, check user role (must be admin/superadmin).

**Flatpickr locale not in Spanish**: Verify CDN script loaded: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/es.js`. Check browser console for errors.

---

**Last updated**: 2026-08-25 — reservation wizard UX improvements, null-checks audit, Flatpickr date picker integration
