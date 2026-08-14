# 🔄 Club Residencial Bulevar Verde - Redirección

## ⚠️ Aviso Importante: Sitio Web Migrado

Esta rama (`main`) contiene una **página de redirección automática** que redirige todo el tráfico de GitHub Pages hacia el nuevo sitio alojado en Firebase Hosting.

### 🌐 URLs del Proyecto:

| Descripción | URL | Estado |
|-------------|-----|--------|
| **Sitio Web Actual** (Firebase) | https://bulevar-verde-app.web.app/ | ✅ **ACTIVO** |
| **Redirección** (GitHub Pages) | https://consejobulevarverde-ph.github.io/Club-Residencial-Bulevar-Verde/ | 🔄 Redirige a Firebase |
| **API Backend** (Cloud Run) | https://bulevar-verde-api-739757275794.us-east4.run.app | ✅ Producción |

---

## 📁 Estructura de Ramas

### Rama `main` (actual) - Redirección
- **Propósito**: Redirigir usuarios de la URL antigua (GitHub Pages) a la nueva (Firebase Hosting)
- **Contenido**: Solo `redirect.html` y workflow de GitHub Actions
- **Deploy**: Automático con cada push a `main` vía GitHub Actions
- **Archivo clave**: `redirect.html`

### Rama `firebase` - Sitio Web Completo ⭐
- **Propósito**: Sitio web completo de producción
- **Tecnología**: Hugo Static Site Generator
- **Hosting**: Firebase Hosting
- **Backend**: Cloud Run API + Firebase Data Connect + Cloud SQL
- **Esta es la rama de desarrollo activa**

---

## 🚀 Deploy de la Redirección

Cuando haces cambios en la rama `main` y haces push:

```bash
git checkout main
# Editar redirect.html si es necesario
git add redirect.html
git commit -m "Update redirect page design"
git push origin main
```

**GitHub Actions automáticamente**:
1. Detecta el push a `main`
2. Copia `redirect.html` como `public/index.html`
3. Despliega a GitHub Pages
4. Los usuarios que visiten la URL antigua serán redirigidos

### Ver logs del deploy:
https://github.com/consejobulevarverde-ph/Club-Residencial-Bulevar-Verde/actions

---

## 🔧 Trabajar en el Sitio Web Completo

Para hacer cambios en el sitio web completo, **cambiar a la rama `firebase`**:

```bash
# Cambiar a rama firebase
git checkout firebase

# Desarrollo local con Hugo
hugo server -D
# Abre http://localhost:1313

# Deploy a Firebase Hosting
firebase deploy --only hosting
```

Ver [DEPLOY_INSTRUCTIONS.md](DEPLOY_INSTRUCTIONS.md) para documentación completa de despliegue.

---

## 📋 Archivos en esta Rama

| Archivo | Propósito |
|---------|-----------|
| `redirect.html` | Página HTML con redirección automática a Firebase Hosting |
| `.github/workflows/hugo.yml` | Workflow de GitHub Actions para deploy automático |
| `.nojekyll` | Desactiva procesamiento Jekyll en GitHub Pages |
| `README.md` | Este archivo |

---

## 🎨 Diseño de la Página de Redirección

La página de redirección (`redirect.html`) incluye:
- ✅ Diseño profesional con colores del club (#2c5f2d)
- ✅ Animación de carga
- ✅ Redirección automática con `<meta http-equiv="refresh">`
- ✅ Redirección JavaScript como fallback
- ✅ Botón manual por si la redirección automática falla
- ✅ Responsive (desktop, tablet, móvil)
- ✅ Mensaje claro de "Sitio Web Movido"

---

## 🔗 Enlaces Importantes

| Recurso | URL |
|---------|-----|
| **Firebase Console** | https://console.firebase.google.com/project/project-7dd6d100-d8c2-427a-a80 |
| **Cloud Console (GCP)** | https://console.cloud.google.com/?project=project-7dd6d100-d8c2-427a-a80 |
| **Cloud Run Service** | https://console.cloud.google.com/run/detail/us-east4/bulevar-verde-api |
| **GitHub Actions** | https://github.com/consejobulevarverde-ph/Club-Residencial-Bulevar-Verde/actions |
| **Repositorio API** | https://github.com/consejobulevarverde-ph/bulevar-verde-api |

---

## 📞 Información del Proyecto

**Nombre**: Club Residencial Bulevar Verde  
**Ubicación**: Calle 70 # 59 265, Itagüí, Antioquia, Colombia  
**Email Administración**: bulevarverdeadmon@gmail.com  
**Teléfono**: +57 322 228 9066  
**Desarrollador**: handresc1127

---

**Última actualización**: 14 de agosto de 2026  
**Versión**: 2.0 (Migración a Firebase Hosting)

