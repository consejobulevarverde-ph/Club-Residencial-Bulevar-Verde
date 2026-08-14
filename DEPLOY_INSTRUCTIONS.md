# 🚀 Instrucciones de Deploy - Club Residencial Bulevar Verde

**Proyecto**: Club Residencial Bulevar Verde  
**Rama de Deploy**: `firebase`  
**Arquitectura**: 
- **Frontend**: Firebase Hosting (Hugo static site)
- **Backend API**: Cloud Run (`bulevar-verde-api`)
- **Base de datos**: Cloud SQL PostgreSQL + Firebase Data Connect

---

## 📋 Requisitos Previos

### Para Frontend (Hugo + Firebase Hosting):
- Node.js 18+ instalado
- Firebase CLI instalado: `npm install -g firebase-tools`
- Autenticación en Firebase: `firebase login`
- Hugo instalado (v0.157.0+) para builds locales

### Para Backend API (Cloud Run):
- Google Cloud CLI instalado: `gcloud`
- Autenticación en GCP: `gcloud auth login`
- Acceso al proyecto: `project-7dd6d100-d8c2-427a-a80`
- Acceso al repositorio: `consejobulevarverde-ph/bulevar-verde-api`

### Verificar instalaciones:
```bash
firebase --version
hugo version
node --version
git --version
gcloud --version
```

---

## 🔄 Flujo de Deploy

### **Paso 1: Preparar la rama**

```bash
# Asegurarse de estar en rama firebase
git checkout firebase

# Actualizar con cambios más recientes (si aplica)
git pull origin firebase

# O, traer cambios de main (si es necesario)
git merge main
```

### **Paso 2: Construir la aplicación web (Hugo)**

```bash
# Limpiar build anterior
rm -rf public

# Construir con Hugo
hugo --gc --minify
```

**Verificar:**
- Carpeta `public/` debe generarse con ~41 archivos
- No debe haber errores en la compilación

### **Paso 3: Deploy a Firebase Hosting**

```bash
firebase deploy --only hosting
```

**Verificar:**
- ✅ Mensaje "Deploy complete!"
- ✅ URL: https://bulevar-verde-app.web.app
- ✅ Probar rutas: `/reservas/`, `/pqrs/`, `/sanciones/`

---

## �️ Deploy de Base de Datos (Firebase Data Connect)

### **Paso 1: Sincronizar schema de base de datos**

Antes de desplegar cambios, asegurar que el schema de PostgreSQL esté actualizado:

```bash
# Ver cambios requeridos
firebase dataconnect:sql:migrate

# Aplicar cambios (con cambios destructivos si aplica)
firebase dataconnect:sql:migrate --force
```

### **Paso 2: Desplegar Data Connect**

```bash
firebase deploy --only dataconnect
```

**Verificar:**
- ✅ Schema compilado exitosamente
- ✅ Conectores (admin) desplegados
- ✅ Cloud SQL actualizado
- ✅ Base de datos sincronizada

---

## 🔧 Deploy del API Backend (Cloud Run)

**Repositorio**: `consejobulevarverde-ph/bulevar-verde-api`  
**Servicio**: `bulevar-verde-api`  
**Región**: `us-east4`  
**URL**: https://bulevar-verde-api-739757275794.us-east4.run.app

### **Despliegue Automático (Recomendado)**

El API se despliega **automáticamente** con cada push a `main`:

```bash
# En el repositorio bulevar-verde-api
git add .
git commit -m "descripción de cambios"
git push origin main

# Cloud Build detecta el push y despliega automáticamente
# Ver progreso en: https://console.cloud.google.com/cloud-build/builds
```

**Proceso automático:**
1. GitHub trigger detecta push a `main`
2. Cloud Build construye la imagen Docker
3. Imagen se sube a Artifact Registry
4. Cloud Run despliega nueva revisión
5. Tráfico se dirige automáticamente a la nueva revisión

### **Despliegue Manual (Si es necesario)**

```bash
# Ver el último build
gcloud builds list --limit=1 --project=project-7dd6d100-d8c2-427a-a80

# Monitorear build en progreso
gcloud builds log <BUILD_ID> --project=project-7dd6d100-d8c2-427a-a80

# Ver revisiones desplegadas
gcloud run revisions list \
  --service=bulevar-verde-api \
  --region=us-east4 \
  --project=project-7dd6d100-d8c2-427a-a80
```

### **Configurar Variables de Entorno**

Si necesitas actualizar variables de entorno:

```bash
gcloud run services update bulevar-verde-api \
  --region=us-east4 \
  --update-env-vars="VARIABLE_NAME=valor" \
  --project=project-7dd6d100-d8c2-427a-a80
```

**Variables requeridas:**
- `RESIDENT_SESSION_SECRET`: Secret para firmar tokens JWT
- `NODE_ENV`: `production`
- `GOOGLE_CLOUD_PROJECT`: `project-7dd6d100-d8c2-427a-a80`
- `FIREBASE_PROJECT_ID`: `project-7dd6d100-d8c2-427a-a80`
- `DATA_CONNECT_LOCATION`: `us-east4`
- `DATA_CONNECT_SERVICE_ID`: `portal-bulevar-verde`
- `DATA_CONNECT_CONNECTOR_NAME`: `admin`
- `CORS_ORIGINS`: `https://bulevar-verde-app.web.app`

### **Paso 3: Deploy completo (UI + Data Connect)**

```bash
firebase deploy
```

---

## 🧪 Validación Post-Deploy

### **Web (Hosting)**
```bash
# URL del sitio
https://bulevar-verde-app.web.app

# Verificar páginas principales:
- https://bulevar-verde-app.web.app/ (inicio)
- https://bulevar-verde-app.web.app/reservas/
- https://bulevar-verde-app.web.app/pqrs/
- https://bulevar-verde-app.web.app/sanciones/
- https://bulevar-verde-app.web.app/datos-personales/
```

### **API Backend (Cloud Run)**
```bash
# Health check
curl https://bulevar-verde-api-739757275794.us-east4.run.app/health

# Probar endpoint autenticado (requiere token)
curl https://bulevar-verde-api-739757275794.us-east4.run.app/api/v1/usuarios/me \
  -H "Authorization: Bearer <TOKEN>"

# Ver logs del API
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=bulevar-verde-api" \
  --limit=20 \
  --project=project-7dd6d100-d8c2-427a-a80
```

### **Data Connect (Schema)**
```bash
# Verificar en Firebase Console
# https://console.firebase.google.com/project/project-7dd6d100-d8c2-427a-a80/dataconnect

# Verificar conectores disponibles:
# - admin connector
# - Schemas compilados correctamente
# - Cloud SQL: bulevar-verde-sql (us-east4)
```

---

## 📊 Configuración Importante

### **firebase.json**
```json
{
  "hosting": {
    "public": "public",
    "site": "bulevar-verde-app",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  },
  "dataconnect": {
    "source": "dataconnect"
  }
}
```

### **hugo.toml** (Base URL)
```toml
baseURL = 'https://bulevar-verde-app.web.app/'
```

### **.firebaserc**
```json
{
  "projects": {
    "default": "project-7dd6d100-d8c2-427a-a80"
  },
  "targets": {
    "project-7dd6d100-d8c2-427a-a80": {
      "hosting": {
        "bulevar-verde": [
          "bulevar-verde-app"
        ]
      }
    }
  }
}
```

---

## 🐛 Solución de Problemas

### **Error: "database schema is incompatible"**
```bash
# Ejecutar migración de schema
firebase dataconnect:sql:migrate --force

# Luego redeploy
firebase deploy --only dataconnect
```

### **URLs rotas en la web (ej: /Club-Residencial-Bulevar-Verde/reservas/)**
```bash
# Verificar que baseURL en hugo.toml sea correcto
# Debe ser: baseURL = 'https://bulevar-verde-app.web.app/'

# Reconstruir y redeploy
rm -rf public
hugo --gc --minify
firebase deploy --only hosting
```

### **API retorna errores 500**
```bash
# Ver logs recientes del API
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=bulevar-verde-api AND severity>=ERROR" \
  --limit=20 \
  --project=project-7dd6d100-d8c2-427a-a80

# Ver variable de entorno faltante
gcloud run services describe bulevar-verde-api \
  --region=us-east4 \
  --project=project-7dd6d100-d8c2-427a-a80 \
  --format="value(spec.template.spec.containers[0].env)"
```

### **Build de API falla en Cloud Build**
```bash
# Ver logs del último build
gcloud builds list --limit=1 --project=project-7dd6d100-d8c2-427a-a80

# Ver logs detallados
gcloud builds log <BUILD_ID> --project=project-7dd6d100-d8c2-427a-a80
```

### **Hosting no actualiza cambios**
```bash
# Limpiar caché de Firebase
rm -rf .firebase

# Redeploy
firebase deploy --only hosting
```

### **Problemas de autenticación Firebase**
```bash
# Re-login Firebase
firebase logout
firebase login

# Re-login GCP
gcloud auth login
gcloud config set project project-7dd6d100-d8c2-427a-a80

# Seleccionar proyecto correcto
firebase use project-7dd6d100-d8c2-427a-a80
```

### **Error: RESIDENT_SESSION_SECRET no configurado**
```bash
# Configurar la variable de entorno
gcloud run services update bulevar-verde-api \
  --region=us-east4 \
  --update-env-vars="RESIDENT_SESSION_SECRET=<secret-generado>" \
  --project=project-7dd6d100-d8c2-427a-a80
```

---

## 📱 URLs y Recursos Importantes

| Servicio | URL / Detalle |
|----------|---------------|
| **Web App** | https://bulevar-verde-app.web.app |
| **API Backend** | https://bulevar-verde-api-739757275794.us-east4.run.app |
| **Firebase Console** | https://console.firebase.google.com/project/project-7dd6d100-d8c2-427a-a80 |
| **Cloud Console** | https://console.cloud.google.com/?project=project-7dd6d100-d8c2-427a-a80 |
| **Cloud Run Service** | https://console.cloud.google.com/run/detail/us-east4/bulevar-verde-api |
| **Cloud Build** | https://console.cloud.google.com/cloud-build/builds |
| **GitHub API Repo** | https://github.com/consejobulevarverde-ph/bulevar-verde-api |
| **Cloud SQL** | bulevar-verde-sql (us-east4) |
| **Database** | bulevar-verde (PostgreSQL) |
| **Project ID** | project-7dd6d100-d8c2-427a-a80 |

---

## ✅ Checklist Pre-Deploy

### Frontend (Hugo + Firebase)
- [ ] Estar en rama `firebase`
- [ ] Rama actualizada con `git pull origin firebase`
- [ ] Cambios committeados localmente
- [ ] Hugo instalado y versión correcta
- [ ] Firebase CLI autenticado y versión reciente
- [ ] `hugo.toml` tiene baseURL correcto
- [ ] No hay cambios sin commitear (`git status` limpio)

### Backend API (Cloud Run)
- [ ] Estar en repositorio `bulevar-verde-api`
- [ ] Rama `main` actualizada
- [ ] Código compila sin errores (`npm run build`)
- [ ] Tests pasan (si aplica)
- [ ] Variables de entorno configuradas en Cloud Run
- [ ] Data Connect actualizado primero (si hay cambios en queries)

---

## 📝 Comandos Rápidos

### Frontend (Firebase)
```bash
# Deploy todo (UI + Data Connect)
firebase deploy

# Deploy solo hosting
firebase deploy --only hosting

# Deploy solo Data Connect
firebase deploy --only dataconnect

# Ver estado del proyecto
firebase projects:list
firebase use

# Abrir Firebase Console
firebase open
```

### Backend API (Cloud Run)
```bash
# Ver último build
gcloud builds list --limit=5 --project=project-7dd6d100-d8c2-427a-a80

# Ver servicio Cloud Run
gcloud run services describe bulevar-verde-api \
  --region=us-east4 \
  --project=project-7dd6d100-d8c2-427a-a80

# Ver logs del API
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=bulevar-verde-api" \
  --limit=50 \
  --project=project-7dd6d100-d8c2-427a-a80

# Actualizar variables de entorno
gcloud run services update bulevar-verde-api \
  --region=us-east4 \
  --update-env-vars="VAR=value" \
  --project=project-7dd6d100-d8c2-427a-a80

# Dirigir tráfico a última revisión
gcloud run services update-traffic bulevar-verde-api \
  --to-latest \
  --region=us-east4 \
  --project=project-7dd6d100-d8c2-427a-a80
```

---

## 📞 Contacto & Soporte

- **Administración**: bulevarverdeadmon@gmail.com
- **Consejo**: consejo.bulevarverde@gmail.com
- **Portería 1**: +573009728851
- **Portería 2**: +573245820968

---

**Última actualización**: 14 de agosto de 2026  
**Cambios recientes**: 
- Agregada sección completa de despliegue del API backend (Cloud Run)
- Actualizado flujo de despliegue automático con Cloud Build
- Corregidas referencias a logs (Cloud Run en lugar de Firebase Functions)
- Agregadas instrucciones para configuración de variables de entorno
- Actualizada tabla de URLs con enlaces a Cloud Console y GitHub

**Generado por**: Claude Code
