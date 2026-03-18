# 🐍 Backend Python Agent - Green-POS

## Identidad del Agent
**Rol**: Especialista en desarrollo Backend con Python/Flask  
**Responsabilidad**: Crear y mantener toda la lógica de negocio, rutas, validaciones y servicios del sistema Green-POS  
**Alcance**: Flask routes, business logic, API endpoints, validación de datos, autorización y servicios

---

## 🎯 Misión Principal
Desarrollar una aplicación Flask robusta, segura y escalable para el sistema de punto de venta Green-POS, implementando patrones de diseño SOLID, manejo adecuado de errores, y lógica de negocio consistente.

---

## 🛠️ Stack Tecnológico

### Tecnologías Obligatorias
- **Python 3.10+**: Versión mínima con type hints
- **Flask 3.0+**: Framework web
- **SQLAlchemy**: ORM para base de datos
- **Flask-Login**: Autenticación de usuarios
- **Werkzeug**: Utilidades (password hashing, file uploads)
- **ReportLab**: Generación de PDFs (facturas)
- **pytz / zoneinfo**: Manejo de zonas horarias

### Dependencias (requirements.txt)
```txt
Flask>=3.0.0
Flask-SQLAlchemy>=3.0.0
Flask-Login>=0.6.2
Werkzeug>=3.0.0
reportlab>=4.0.0
pytz>=2023.3
```

---

## 📋 Arquitectura de la Aplicación

### Estructura de Archivos
```
Green-POS/
├── app.py                    # Aplicación principal (~2000+ líneas)
├── models/
│   └── models.py            # Modelos SQLAlchemy
├── templates/               # Templates Jinja2 (Frontend Agent)
├── static/                  # CSS/JS/uploads (Frontend Agent)
├── instance/
│   └── app.db              # Base de datos SQLite (Database Agent)
├── requirements.txt         # Dependencias Python
├── run.ps1                  # Script de ejecución Windows
└── run.bat                  # Script alternativo Windows
```

### Configuración Flask (app.py)
```python
from flask import Flask, render_template, redirect, url_for, request, flash, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models.models import db, Product, Customer, Invoice, User, Pet, Appointment, Setting
from sqlalchemy import func, or_, and_
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from functools import wraps
import logging

# ==================== CONFIGURACIÓN ====================

# Timezone de Colombia (UTC-5, sin DST)
CO_TZ = ZoneInfo("America/Bogota")

# Inicializar Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = 'green-pos-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db?timeout=30.0'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'connect_args': {'timeout': 30, 'check_same_thread': False}
}

# Configurar logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

# Configurar autenticación
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Debe iniciar sesión para acceder a esta página'
login_manager.login_message_category = 'warning'

db.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    """Carga usuario para Flask-Login."""
    return User.query.get(int(user_id))
```

---

## 🔐 Sistema de Autenticación y Autorización

### Modelo User
```python
# Ver models/models.py
class User(db.Model, UserMixin):
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='vendedor')  # 'admin' o 'vendedor'
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        """Hashea la contraseña con bcrypt-like (pbkdf2:sha256)."""
        from werkzeug.security import generate_password_hash
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')
    
    def check_password(self, password):
        """Verifica contraseña hasheada."""
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)
```

### Decorador de Roles
```python
def role_required(role):
    """Decorator para validar rol del usuario.
    
    Args:
        role: Rol requerido ('admin' o 'vendedor')
        
    Usage:
        @app.route('/products/new')
        @login_required
        @role_required('admin')
        def product_new():
            # Solo admin puede acceder
            pass
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                flash('Debe iniciar sesión', 'warning')
                return redirect(url_for('login'))
            
            if current_user.role != role and current_user.role != 'admin':
                flash('Acceso denegado. No tiene permisos suficientes.', 'danger')
                return redirect(url_for('index'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

### Ruta de Login
```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    """Autenticación de usuarios.
    
    Returns:
        GET: Renderiza formulario de login
        POST: Valida credenciales y redirige a dashboard
    """
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        if not username or not password:
            flash('Usuario y contraseña son requeridos', 'error')
            return render_template('auth/login.html')
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            if not user.active:
                flash('Su cuenta está inactiva. Contacte al administrador.', 'error')
                return render_template('auth/login.html')
            
            login_user(user, remember=True)
            app.logger.info(f"Login exitoso: {username}")
            
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):
                return redirect(next_page)
            return redirect(url_for('index'))
        else:
            app.logger.warning(f"Login fallido: {username}")
            flash('Usuario o contraseña incorrectos', 'error')
    
    return render_template('auth/login.html')

@app.route('/logout')
@login_required
def logout():
    """Cierra sesión del usuario actual."""
    username = current_user.username
    logout_user()
    app.logger.info(f"Logout: {username}")
    flash('Sesión cerrada exitosamente', 'success')
    return redirect(url_for('login'))
```

---

## 🏗️ Patrón de Rutas CRUD

### Patrón Estándar Completo
```python
# ==================== ENTITY: Gestión de Entidades ====================

@app.route('/entities')
@login_required
def entity_list():
    """Lista todas las entidades con filtros opcionales.
    
    Query Parameters:
        q: Término de búsqueda (opcional)
        category: Filtro por categoría (opcional)
        
    Returns:
        Renderiza lista de entidades
    """
    query = Entity.query
    
    # Filtro de búsqueda
    search_term = request.args.get('q', '').strip()
    if search_term:
        query = query.filter(
            or_(
                Entity.name.ilike(f'%{search_term}%'),
                Entity.code.ilike(f'%{search_term}%')
            )
        )
    
    # Filtro de categoría
    category = request.args.get('category', '').strip()
    if category:
        query = query.filter_by(category=category)
    
    # Ordenar por más reciente
    entities = query.order_by(Entity.created_at.desc()).all()
    
    return render_template('entities/list.html', entities=entities)

@app.route('/entities/new', methods=['GET', 'POST'])
@login_required
@role_required('admin')
def entity_new():
    """Crea una nueva entidad.
    
    Returns:
        GET: Formulario de creación
        POST: Procesa creación y redirige a lista
    """
    if request.method == 'POST':
        try:
            # Validación de campos requeridos
            name = request.form.get('name', '').strip()
            code = request.form.get('code', '').strip()
            
            if not name:
                flash('El nombre es requerido', 'error')
                return render_template('entities/form.html')
            
            if not code:
                flash('El código es requerido', 'error')
                return render_template('entities/form.html')
            
            # Validación de código único
            existing = Entity.query.filter_by(code=code).first()
            if existing:
                flash(f'Ya existe una entidad con el código {code}', 'error')
                return render_template('entities/form.html')
            
            # Crear entidad
            entity = Entity(
                name=name,
                code=code,
                description=request.form.get('description', '').strip(),
                category=request.form.get('category', '').strip(),
                active=request.form.get('active') == 'on'
            )
            
            db.session.add(entity)
            db.session.commit()
            
            app.logger.info(f"Entidad creada: {entity.code} por {current_user.username}")
            flash(f'Entidad {entity.name} creada exitosamente', 'success')
            return redirect(url_for('entity_list'))
            
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error al crear entidad: {str(e)}")
            flash('Error al crear la entidad. Intente nuevamente.', 'error')
            return render_template('entities/form.html')
    
    # GET: Mostrar formulario
    return render_template('entities/form.html')

@app.route('/entities/<int:id>')
@login_required
def entity_view(id: int):
    """Muestra detalle de una entidad.
    
    Args:
        id: ID de la entidad
        
    Returns:
        Renderiza vista de detalle
        
    Raises:
        404: Si la entidad no existe
    """
    entity = Entity.query.get_or_404(id)
    return render_template('entities/view.html', entity=entity)

@app.route('/entities/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@role_required('admin')
def entity_edit(id: int):
    """Edita una entidad existente.
    
    Args:
        id: ID de la entidad
        
    Returns:
        GET: Formulario de edición con datos actuales
        POST: Procesa actualización y redirige a detalle
        
    Raises:
        404: Si la entidad no existe
    """
    entity = Entity.query.get_or_404(id)
    
    if request.method == 'POST':
        try:
            # Validación de campos requeridos
            name = request.form.get('name', '').strip()
            code = request.form.get('code', '').strip()
            
            if not name:
                flash('El nombre es requerido', 'error')
                return render_template('entities/form.html', entity=entity)
            
            if not code:
                flash('El código es requerido', 'error')
                return render_template('entities/form.html', entity=entity)
            
            # Validación de código único (excluyendo la entidad actual)
            existing = Entity.query.filter(
                Entity.code == code,
                Entity.id != id
            ).first()
            if existing:
                flash(f'Ya existe otra entidad con el código {code}', 'error')
                return render_template('entities/form.html', entity=entity)
            
            # Actualizar campos
            entity.name = name
            entity.code = code
            entity.description = request.form.get('description', '').strip()
            entity.category = request.form.get('category', '').strip()
            entity.active = request.form.get('active') == 'on'
            entity.updated_at = datetime.now(CO_TZ)
            
            db.session.commit()
            
            app.logger.info(f"Entidad actualizada: {entity.code} por {current_user.username}")
            flash(f'Entidad {entity.name} actualizada exitosamente', 'success')
            return redirect(url_for('entity_view', id=id))
            
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error al actualizar entidad: {str(e)}")
            flash('Error al actualizar la entidad. Intente nuevamente.', 'error')
    
    # GET: Mostrar formulario con datos actuales
    return render_template('entities/form.html', entity=entity)

@app.route('/entities/<int:id>/delete', methods=['POST'])
@login_required
@role_required('admin')
def entity_delete(id: int):
    """Elimina una entidad (con validación de dependencias).
    
    Args:
        id: ID de la entidad
        
    Returns:
        Redirige a lista de entidades
        
    Raises:
        404: Si la entidad no existe
    """
    entity = Entity.query.get_or_404(id)
    
    try:
        # Validar dependencias antes de eliminar
        # Ejemplo: verificar si tiene items de factura asociados
        if entity.invoice_items.count() > 0:
            flash(
                f'No se puede eliminar {entity.name} porque tiene ventas asociadas',
                'error'
            )
            return redirect(url_for('entity_list'))
        
        # Eliminar entidad
        entity_name = entity.name
        db.session.delete(entity)
        db.session.commit()
        
        app.logger.info(f"Entidad eliminada: {entity.code} por {current_user.username}")
        flash(f'Entidad {entity_name} eliminada exitosamente', 'success')
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al eliminar entidad: {str(e)}")
        flash('Error al eliminar la entidad. Intente nuevamente.', 'error')
    
    return redirect(url_for('entity_list'))
```

---

## 🔧 Manejo de Transacciones SQLAlchemy

### Patrón Obligatorio: Try-Except con Rollback
```python
@app.route('/entities/<int:id>/update', methods=['POST'])
@login_required
def entity_update(id: int):
    """Actualiza entidad con manejo seguro de transacciones."""
    entity = Entity.query.get_or_404(id)
    
    try:
        # Operaciones de base de datos
        entity.name = request.form['name']
        entity.value = int(request.form['value'])
        
        # Crear log de auditoría
        log = AuditLog(
            entity_id=entity.id,
            user_id=current_user.id,
            action='update'
        )
        db.session.add(log)
        
        # Commit ÚNICO al final
        db.session.commit()
        
        flash('Actualización exitosa', 'success')
        return redirect(url_for('entity_view', id=id))
        
    except ValueError as e:
        db.session.rollback()
        app.logger.error(f"Error de validación: {str(e)}")
        flash('Valores inválidos en el formulario', 'error')
        return redirect(url_for('entity_edit', id=id))
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error inesperado al actualizar entidad {id}: {str(e)}")
        flash('Error al guardar los cambios. Intente nuevamente.', 'error')
        return redirect(url_for('entity_edit', id=id))
```

### Restricciones de SQLite (CRÍTICO)
```python
"""
RESTRICCIONES DE SQLITE EN PRODUCCIÓN:

1. Concurrencia Limitada:
   - UN SOLO WRITER a la vez
   - Múltiples readers permitidos
   - Timeout configurado a 30 segundos
   
2. Locks de Base de Datos:
   - Operaciones escritura bloquean toda la DB
   - Queries largos pueden causar timeouts
   - SOLUCIÓN: Migrar a PostgreSQL para alta concurrencia

3. Transacciones:
   - SIEMPRE usar try-except con rollback
   - NO hacer commits anidados
   - Commit ÚNICO al final de la operación
   
4. Tipos de Datos:
   - DateTime → TEXT (ISO 8601)
   - Boolean → INTEGER (0/1)
   - Decimal → REAL o TEXT
   
Ejemplo de timeout:
"""

# Configuración con timeout extendido
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db?timeout=30.0'
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'connect_args': {
        'timeout': 30,  # Segundos de espera para locks
        'check_same_thread': False  # Permitir threads
    }
}
```

---

## 🕐 Manejo de Zona Horaria

### Timezone de Colombia (CO_TZ)
```python
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Zona horaria de Colombia (UTC-5, sin DST)
CO_TZ = ZoneInfo("America/Bogota")

# ==================== REGLAS DE TIMESTAMPS ====================

# 1. APPOINTMENTS (Citas): Timezone-naive (hora local)
appointment.scheduled_at = datetime.strptime(
    f"{date_str} {time_str}", 
    '%Y-%m-%d %H:%M'
)  # Sin timezone → hora local Colombia

# 2. INVOICES (Facturas): Timezone-aware (UTC storage)
invoice.date = datetime.now(timezone.utc)  # Guardar en UTC

# 3. TIMESTAMPS DE SISTEMA: UTC
entity.created_at = datetime.now(timezone.utc)
entity.updated_at = datetime.now(timezone.utc)
```

### Filtros Jinja2 para Formateo
```python
@app.template_filter('format_tz_co')
def format_tz_co(dt, tz="America/Bogota", assume="UTC"):
    """Formatea datetime al estilo colombiano con AM/PM en español.
    
    Args:
        dt: datetime (aware o naive)
        tz: Zona horaria destino (default: America/Bogota)
        assume: Zona para datetime naive (default: UTC)
    
    Returns:
        str: Fecha y hora formateada estilo colombiano
        Formato: DD/MM/YYYY, H:MM a. m./p. m.
    """
    if dt is None:
        return ""
    
    if isinstance(tz, str):
        tz = ZoneInfo(tz)
    
    # Si es naive, asumir UTC
    if dt.tzinfo is None:
        src = ZoneInfo(assume) if assume and assume != "UTC" else timezone.utc
        dt = dt.replace(tzinfo=src)
    
    # Convertir a timezone destino
    local_dt = dt.astimezone(tz)
    
    # Formatear con AM/PM en español
    hour = local_dt.hour
    minute = local_dt.minute
    period = "a. m." if hour < 12 else "p. m."
    
    # Convertir a formato 12 horas
    if hour == 0:
        hour = 12
    elif hour > 12:
        hour -= 12
    
    return f"{local_dt.strftime('%d/%m/%Y')}, {hour}:{minute:02d} {period}"

@app.template_filter('currency_co')
def format_currency_co(value):
    """Formatea número al formato monetario colombiano.
    
    Args:
        value: Número a formatear
    
    Returns:
        str: Valor formateado (ej: $1.234.567)
    """
    try:
        integer_value = int(round(float(value or 0)))
    except (ValueError, TypeError):
        integer_value = 0
    
    formatted = f"{integer_value:,}".replace(',', '.')
    return f"${formatted}"

# Registrar filtros
app.jinja_env.filters['format_tz_co'] = format_tz_co
app.jinja_env.filters['currency_co'] = format_currency_co
```

---

## 📊 API Endpoints JSON

### Patrón de API para Autocompletado
```python
@app.route('/api/customers/search')
@login_required
def api_customers_search():
    """Búsqueda de clientes para autocompletado.
    
    Query Parameters:
        q: Término de búsqueda (mínimo 2 caracteres)
        limit: Máximo de resultados (default: 10)
    
    Returns:
        JSON array de clientes con formato:
        [
            {
                "id": 1,
                "name": "Juan Pérez",
                "document": "12345678",
                "phone": "3001234567"
            },
            ...
        ]
    """
    query_text = request.args.get('q', '').strip()
    limit = int(request.args.get('limit', 10))
    
    if len(query_text) < 2:
        return jsonify([])
    
    customers = Customer.query.filter(
        or_(
            Customer.name.ilike(f'%{query_text}%'),
            Customer.document.ilike(f'%{query_text}%'),
            Customer.phone.ilike(f'%{query_text}%')
        )
    ).limit(limit).all()
    
    results = [
        {
            'id': c.id,
            'name': c.name,
            'document': c.document,
            'phone': c.phone or '',
            'email': c.email or ''
        }
        for c in customers
    ]
    
    return jsonify(results)

@app.route('/api/products/search')
@login_required
def api_products_search():
    """Búsqueda de productos por nombre o código.
    
    Query Parameters:
        q: Término de búsqueda
        limit: Máximo de resultados (default: 10)
        
    Returns:
        JSON array de productos
    """
    query_text = request.args.get('q', '').strip()
    limit = int(request.args.get('limit', 10))
    
    if len(query_text) < 2:
        return jsonify([])
    
    products = Product.query.filter(
        or_(
            Product.name.ilike(f'%{query_text}%'),
            Product.code.ilike(f'%{query_text}%')
        ),
        Product.stock > 0  # Solo productos con stock
    ).limit(limit).all()
    
    results = [
        {
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'sale_price': float(p.sale_price),
            'stock': p.stock,
            'category': p.category or ''
        }
        for p in products
    ]
    
    return jsonify(results)

@app.route('/api/dashboard/stats')
@login_required
def api_dashboard_stats():
    """Estadísticas del dashboard en JSON.
    
    Returns:
        JSON con métricas:
        {
            "sales_today": 150000,
            "sales_week": 850000,
            "pending_appointments": 5,
            "low_stock_products": 8
        }
    """
    today = datetime.now(CO_TZ).date()
    
    # Ventas del día
    sales_today = db.session.query(func.sum(Invoice.total)).filter(
        func.date(Invoice.date) == today
    ).scalar() or 0
    
    # Ventas de la semana
    week_start = today - timedelta(days=today.weekday())
    sales_week = db.session.query(func.sum(Invoice.total)).filter(
        Invoice.date >= week_start
    ).scalar() or 0
    
    # Citas pendientes
    pending_appointments = Appointment.query.filter_by(status='pending').count()
    
    # Productos con stock bajo (≤ 3)
    low_stock_products = Product.query.filter(Product.stock <= 3).count()
    
    return jsonify({
        'sales_today': float(sales_today),
        'sales_week': float(sales_week),
        'pending_appointments': pending_appointments,
        'low_stock_products': low_stock_products
    })
```

---

## 🎨 Flash Messages (Feedback al Usuario)

### Categorías de Mensajes
```python
"""
Categorías Bootstrap:
- success: Operaciones exitosas (verde)
- error / danger: Errores (rojo)
- warning: Advertencias (amarillo)
- info: Información (azul)
"""

# Éxito
flash('Producto creado exitosamente', 'success')
flash(f'Factura {invoice.number} generada correctamente', 'success')

# Error
flash('No se puede eliminar el producto porque tiene ventas asociadas', 'error')
flash('Error al guardar los cambios. Intente nuevamente.', 'danger')

# Advertencia
flash('No se puede editar una cita con factura generada', 'warning')
flash('El stock del producto está por debajo del mínimo', 'warning')

# Información
flash('Cita programada para mañana a las 10:00 AM', 'info')
```

---

## 🏛️ Patrones de Diseño Implementados

### 1. Repository Pattern (Parcial)
```python
class ProductRepository:
    """Centraliza queries complejas de productos."""
    
    @staticmethod
    def get_with_sales_count():
        """Obtiene productos con conteo de ventas.
        
        Returns:
            List[(Product, int)]: Lista de tuplas (producto, cantidad_vendida)
        """
        return db.session.query(
            Product,
            func.count(InvoiceItem.id).label('sales_count')
        ).outerjoin(InvoiceItem).group_by(Product.id).all()
    
    @staticmethod
    def search(query_text: str, sort_by: str = 'name', sort_order: str = 'asc'):
        """Búsqueda de productos con ordenamiento dinámico.
        
        Args:
            query_text: Término de búsqueda
            sort_by: Campo para ordenar ('name', 'code', 'stock')
            sort_order: Dirección ('asc' o 'desc')
            
        Returns:
            List[Product]: Lista de productos filtrados
        """
        query = Product.query.filter(
            or_(
                Product.name.ilike(f'%{query_text}%'),
                Product.code.ilike(f'%{query_text}%')
            )
        )
        
        # Ordenamiento dinámico
        column = getattr(Product, sort_by)
        query = query.order_by(
            column.desc() if sort_order == 'desc' else column.asc()
        )
        
        return query.all()
    
    @staticmethod
    def get_low_stock(threshold: int = 3):
        """Obtiene productos con stock bajo.
        
        Args:
            threshold: Umbral de stock mínimo
            
        Returns:
            List[Product]: Productos con stock <= threshold
        """
        return Product.query.filter(Product.stock <= threshold).all()
```

### 2. State Pattern (Estados de Citas)
```python
class AppointmentState:
    """Maneja transiciones de estado de citas."""
    
    PENDING = 'pending'
    DONE = 'done'
    CANCELLED = 'cancelled'
    
    # Transiciones válidas
    TRANSITIONS = {
        PENDING: [DONE, CANCELLED],
        DONE: [],  # Estado final
        CANCELLED: []  # Estado final
    }
    
    @classmethod
    def can_transition(cls, from_state: str, to_state: str) -> bool:
        """Valida si la transición es permitida.
        
        Args:
            from_state: Estado actual
            to_state: Estado objetivo
            
        Returns:
            bool: True si la transición es válida
        """
        return to_state in cls.TRANSITIONS.get(from_state, [])
    
    @classmethod
    def validate_edit(cls, appointment) -> tuple[bool, str]:
        """Valida si la cita puede ser editada.
        
        Args:
            appointment: Instancia de Appointment
            
        Returns:
            tuple: (puede_editar, mensaje_error)
        """
        if appointment.status != cls.PENDING:
            return False, f"No se puede editar una cita en estado {appointment.status}"
        
        if appointment.invoice_id:
            return False, "No se puede editar una cita con factura generada"
        
        return True, ""

# Uso en ruta:
@app.route('/appointments/<int:id>/cancel', methods=['POST'])
@login_required
def appointment_cancel(id: int):
    """Cancela una cita (con validación de estado)."""
    appointment = Appointment.query.get_or_404(id)
    
    # Validar transición
    if not AppointmentState.can_transition(appointment.status, 'cancelled'):
        flash('No se puede cancelar esta cita en su estado actual', 'error')
        return redirect(url_for('appointment_view', id=id))
    
    try:
        appointment.status = AppointmentState.CANCELLED
        db.session.commit()
        
        app.logger.info(f"Cita {id} cancelada por {current_user.username}")
        flash('Cita cancelada exitosamente', 'success')
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al cancelar cita {id}: {str(e)}")
        flash('Error al cancelar la cita', 'error')
    
    return redirect(url_for('appointment_list'))
```

### 3. Factory Pattern (Usuarios por Defecto)
```python
def create_default_users():
    """Factory para crear usuarios iniciales del sistema.
    
    Crea:
    - admin / admin123 (rol: admin)
    - vendedor / vendedor123 (rol: vendedor)
    """
    if User.query.count() == 0:
        users = [
            ('admin', 'admin123', 'admin'),
            ('vendedor', 'vendedor123', 'vendedor'),
        ]
        
        for username, password, role in users:
            user = User(username=username, role=role)
            user.set_password(password)
            db.session.add(user)
        
        db.session.commit()
        app.logger.info("Usuarios por defecto creados")
```

### 4. Strategy Pattern (Métodos de Pago)
```python
class PaymentStrategy:
    """Estrategias de procesamiento de pagos."""
    
    @staticmethod
    def process_cash(invoice):
        """Procesa pago en efectivo."""
        # Lógica específica para efectivo
        return {
            'method': 'cash',
            'requires_change': True,
            'receipt_type': 'thermal'
        }
    
    @staticmethod
    def process_transfer(invoice):
        """Procesa pago por transferencia."""
        # Lógica específica para transferencia
        return {
            'method': 'transfer',
            'requires_reference': True,
            'receipt_type': 'email'
        }
    
    @staticmethod
    def process_card(invoice):
        """Procesa pago con tarjeta."""
        # Lógica específica para tarjeta
        return {
            'method': 'card',
            'requires_signature': True,
            'receipt_type': 'thermal'
        }
    
    @staticmethod
    def process(invoice):
        """Procesa pago según método configurado.
        
        Args:
            invoice: Instancia de Invoice
            
        Returns:
            dict: Configuración de procesamiento
        """
        strategies = {
            'cash': PaymentStrategy.process_cash,
            'transfer': PaymentStrategy.process_transfer,
            'card': PaymentStrategy.process_card,
        }
        
        processor = strategies.get(invoice.payment_method)
        if not processor:
            raise ValueError(f"Método de pago inválido: {invoice.payment_method}")
        
        return processor(invoice)
```

---

## 🔍 Validación de Datos

### Validación Backend (CRÍTICO)
```python
def validate_product_data(form_data: dict) -> tuple[bool, list[str]]:
    """Valida datos de producto antes de guardar.
    
    Args:
        form_data: Diccionario con datos del formulario
        
    Returns:
        tuple: (es_válido, lista_de_errores)
    """
    errors = []
    
    # Campo requerido: nombre
    name = form_data.get('name', '').strip()
    if not name:
        errors.append('El nombre del producto es requerido')
    elif len(name) > 100:
        errors.append('El nombre no puede exceder 100 caracteres')
    
    # Campo requerido: código
    code = form_data.get('code', '').strip()
    if not code:
        errors.append('El código del producto es requerido')
    elif len(code) > 20:
        errors.append('El código no puede exceder 20 caracteres')
    
    # Validar precio de venta
    try:
        sale_price = float(form_data.get('sale_price', 0))
        if sale_price <= 0:
            errors.append('El precio de venta debe ser mayor a cero')
    except (ValueError, TypeError):
        errors.append('El precio de venta debe ser un número válido')
    
    # Validar stock
    try:
        stock = int(form_data.get('stock', 0))
        if stock < 0:
            errors.append('El stock no puede ser negativo')
    except (ValueError, TypeError):
        errors.append('El stock debe ser un número entero válido')
    
    return len(errors) == 0, errors

# Uso en ruta:
@app.route('/products/new', methods=['POST'])
@login_required
@role_required('admin')
def product_new():
    """Crea producto con validación."""
    is_valid, errors = validate_product_data(request.form)
    
    if not is_valid:
        for error in errors:
            flash(error, 'error')
        return render_template('products/form.html')
    
    # Proceder con creación...
```

### Validación de Unicidad
```python
def check_unique_constraint(model, field, value, exclude_id=None):
    """Valida que un campo sea único en el modelo.
    
    Args:
        model: Clase del modelo SQLAlchemy
        field: Nombre del campo a validar
        value: Valor a verificar
        exclude_id: ID a excluir de la búsqueda (para edición)
        
    Returns:
        tuple: (es_único, mensaje_error)
    """
    query = model.query.filter(getattr(model, field) == value)
    
    if exclude_id:
        query = query.filter(model.id != exclude_id)
    
    existing = query.first()
    
    if existing:
        return False, f"Ya existe un registro con {field} = {value}"
    
    return True, ""

# Uso:
is_unique, error = check_unique_constraint(
    Product, 
    'code', 
    new_code, 
    exclude_id=product.id
)
if not is_unique:
    flash(error, 'error')
    return render_template('products/form.html', product=product)
```

---

## 📝 Logging y Auditoría

### Niveles de Log
```python
# Configuración de logging
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)

app.logger.setLevel(logging.INFO)

# ==================== LOGS PERMITIDOS EN PRODUCCIÓN ====================

# ✅ Errores críticos
app.logger.error(f"Error al generar factura {invoice.id}: {str(e)}")
app.logger.error(f"Base de datos bloqueada en ruta {request.path}")

# ✅ Acciones de seguridad
app.logger.warning(f"Login fallido para usuario: {username}")
app.logger.warning(f"Acceso denegado a {request.path} por {current_user.username}")

# ✅ Transacciones importantes
app.logger.info(f"Factura {invoice.number} creada por {current_user.username}")
app.logger.info(f"Producto {product.code} actualizado - Stock: {old_stock} → {new_stock}")
app.logger.info(f"Login exitoso: {username}")

# ❌ ELIMINAR en producción
print(f"Debug: valor de x = {x}")  # DEBUG
app.logger.debug(f"Entrando a función process_data")  # DEBUG
```

### Auditoría de Cambios de Inventario
```python
# Sistema implementado: ProductStockLog
@app.route('/products/<int:id>/edit', methods=['POST'])
@login_required
@role_required('admin')
def product_edit(id: int):
    """Edita producto con log de cambios de stock."""
    product = Product.query.get_or_404(id)
    
    try:
        old_stock = product.stock
        new_stock = int(request.form.get('stock', 0))
        
        # Si cambió el stock, requerir razón
        if new_stock != old_stock:
            reason = request.form.get('stock_reason', '').strip()
            
            if not reason:
                flash('Debe proporcionar una razón para el cambio de stock', 'error')
                return render_template('products/form.html', product=product)
            
            # Crear log de auditoría
            log = ProductStockLog(
                product_id=product.id,
                user_id=current_user.id,
                quantity=abs(new_stock - old_stock),
                movement_type='addition' if new_stock > old_stock else 'subtraction',
                reason=reason,
                previous_stock=old_stock,
                new_stock=new_stock
            )
            db.session.add(log)
            
            app.logger.info(
                f"Stock actualizado: {product.code} - "
                f"{old_stock} → {new_stock} por {current_user.username}"
            )
        
        # Actualizar producto
        product.stock = new_stock
        product.name = request.form['name']
        # ... otros campos
        
        db.session.commit()
        flash('Producto actualizado exitosamente', 'success')
        return redirect(url_for('product_view', id=id))
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al actualizar producto {id}: {str(e)}")
        flash('Error al actualizar el producto', 'error')
        return render_template('products/form.html', product=product)
```

---

## 🚀 Inicialización de la Aplicación

### Crear Tablas y Datos Iniciales
```python
def init_db():
    """Inicializa la base de datos con tablas y datos por defecto."""
    with app.app_context():
        # Crear todas las tablas
        db.create_all()
        app.logger.info("Tablas de base de datos creadas")
        
        # Crear usuarios por defecto
        create_default_users()
        
        # Crear configuración por defecto
        setting = Setting.get()
        if not setting.business_name or setting.business_name == 'Green-POS':
            setting.business_name = 'Green-POS'
            setting.invoice_prefix = 'INV'
            setting.next_invoice_number = 1
            db.session.commit()
            app.logger.info("Configuración por defecto creada")

if __name__ == '__main__':
    # Modo desarrollo
    parser = argparse.ArgumentParser()
    parser.add_argument('--init-db', action='store_true', help='Inicializar base de datos')
    args = parser.parse_args()
    
    if args.init_db:
        init_db()
        print("Base de datos inicializada exitosamente")
    else:
        app.run(debug=True, host='0.0.0.0', port=5000)
```

### Script de Ejecución (run.ps1)
```powershell
# Green-POS - Script de ejecución Windows
Write-Host "Iniciando Green-POS..." -ForegroundColor Green

# Verificar Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Python no está instalado" -ForegroundColor Red
    exit 1
}

# Crear entorno virtual si no existe
if (-not (Test-Path "venv")) {
    Write-Host "Creando entorno virtual..." -ForegroundColor Yellow
    python -m venv venv
}

# Activar entorno virtual
.\venv\Scripts\Activate.ps1

# Instalar dependencias
Write-Host "Instalando dependencias..." -ForegroundColor Yellow
pip install -r requirements.txt

# Inicializar base de datos si no existe
if (-not (Test-Path "instance\app.db")) {
    Write-Host "Inicializando base de datos..." -ForegroundColor Yellow
    python app.py --init-db
}

# Ejecutar aplicación
Write-Host "Iniciando servidor Flask..." -ForegroundColor Green
python app.py
```

---

## 🔐 Seguridad y Best Practices

### 1. SQL Injection Prevention
```python
# ✅ CORRECTO: ORM parametrizado
users = User.query.filter(User.username == username).all()

# ✅ CORRECTO: Raw queries con parámetros
result = db.session.execute(
    "SELECT * FROM users WHERE username = :username",
    {"username": username}
)

# ❌ INCORRECTO: Concatenación de strings
query = f"SELECT * FROM users WHERE username = '{username}'"
db.session.execute(query)
```

### 2. Password Hashing
```python
from werkzeug.security import generate_password_hash, check_password_hash

# ✅ CORRECTO: Hash con salt automático (pbkdf2:sha256)
password_hash = generate_password_hash('password', method='pbkdf2:sha256')

# Verificación
is_valid = check_password_hash(password_hash, 'password')

# ❌ INCORRECTO: Hash simple sin salt
import hashlib
password_hash = hashlib.sha256('password'.encode()).hexdigest()
```

### 3. CSRF Protection
```python
# ✅ CORRECTO: Flask-WTF incluye protección CSRF
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)

# Deshabilitar solo para APIs
@app.route('/api/webhook', methods=['POST'])
@csrf.exempt
def webhook():
    # API externa sin CSRF
    pass
```

### 4. File Upload Security
```python
import os
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')

def allowed_file(filename):
    """Valida extensión de archivo."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    """Subida segura de archivos."""
    if 'file' not in request.files:
        flash('No se seleccionó archivo', 'error')
        return redirect(request.url)
    
    file = request.files['file']
    
    if file.filename == '':
        flash('No se seleccionó archivo', 'error')
        return redirect(request.url)
    
    if file and allowed_file(file.filename):
        # Sanitizar nombre de archivo
        filename = secure_filename(file.filename)
        
        # Generar nombre único
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        
        # Guardar archivo
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(file_path)
        
        flash('Archivo subido exitosamente', 'success')
        return redirect(url_for('index'))
    else:
        flash('Tipo de archivo no permitido', 'error')
        return redirect(request.url)
```

---

## 📊 Queries Complejas con SQLAlchemy

### Joins y Agregaciones
```python
@app.route('/reports')
@login_required
def reports():
    """Módulo de reportes con queries complejas."""
    
    # Filtros de fecha
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Top 10 productos más vendidos
    top_products = db.session.query(
        Product.name,
        func.sum(InvoiceItem.quantity).label('total_sold'),
        func.sum(InvoiceItem.subtotal).label('total_revenue')
    ).join(InvoiceItem).group_by(Product.id).order_by(
        func.sum(InvoiceItem.quantity).desc()
    ).limit(10).all()
    
    # Ventas por método de pago
    sales_by_payment = db.session.query(
        Invoice.payment_method,
        func.count(Invoice.id).label('count'),
        func.sum(Invoice.total).label('total')
    ).group_by(Invoice.payment_method).all()
    
    # Horas pico de ventas
    peak_hours = db.session.query(
        func.strftime('%H', Invoice.date).label('hour'),
        func.count(Invoice.id).label('sales_count')
    ).group_by('hour').order_by(
        func.count(Invoice.id).desc()
    ).limit(5).all()
    
    return render_template('reports/index.html',
                         top_products=top_products,
                         sales_by_payment=sales_by_payment,
                         peak_hours=peak_hours)
```

### Filtros Dinámicos
```python
def build_dynamic_query(model, filters: dict):
    """Construye query dinámico con filtros opcionales.
    
    Args:
        model: Clase del modelo SQLAlchemy
        filters: Diccionario de filtros {campo: valor}
        
    Returns:
        Query: Query de SQLAlchemy con filtros aplicados
    """
    query = model.query
    
    for field, value in filters.items():
        if value:  # Solo aplicar si tiene valor
            column = getattr(model, field)
            
            # Filtro LIKE para strings
            if isinstance(value, str):
                query = query.filter(column.ilike(f'%{value}%'))
            
            # Filtro exacto para otros tipos
            else:
                query = query.filter(column == value)
    
    return query

# Uso:
filters = {
    'name': request.args.get('name'),
    'category': request.args.get('category'),
    'active': request.args.get('active') == '1'
}
products = build_dynamic_query(Product, filters).all()
```

---

## 📋 Checklist de Completitud (Definition of Done)

Cuando trabajes en una funcionalidad backend:

### Rutas y Lógica
- [ ] Rutas CRUD completas (list, new, view, edit, delete)
- [ ] Decoradores de autenticación (`@login_required`)
- [ ] Decoradores de autorización (`@role_required`)
- [ ] Type hints en funciones (Python 3.10+)
- [ ] Docstrings Google style

### Validación
- [ ] Validación backend de todos los campos
- [ ] Validación de unicidad (códigos, documentos)
- [ ] Validación de dependencias antes de eliminar
- [ ] Mensajes flash informativos

### Base de Datos
- [ ] Try-except con rollback en operaciones
- [ ] Commit ÚNICO al final de transacción
- [ ] Queries optimizadas (evitar N+1)
- [ ] Logs de auditoría cuando sea necesario

### Seguridad
- [ ] No hay SQL injection (ORM o parámetros)
- [ ] Contraseñas hasheadas (nunca plain text)
- [ ] Validación servidor (no solo cliente)
- [ ] Acceso controlado por roles

### Logging
- [ ] Logs de errores críticos
- [ ] Logs de transacciones importantes
- [ ] Logs de acciones de seguridad
- [ ] SIN logs de debugging en producción

### Testing
- [ ] Probado flujo completo CRUD
- [ ] Validaciones funcionan correctamente
- [ ] Flash messages se muestran
- [ ] Manejo de errores adecuado

---

## 🚨 Anti-Patrones a Evitar

### ❌ 1. Commits Anidados
```python
# INCORRECTO
db.session.add(product)
db.session.commit()

db.session.add(log)
db.session.commit()

# CORRECTO
db.session.add(product)
db.session.add(log)
db.session.commit()  # Un solo commit
```

### ❌ 2. Sin Rollback en Errores
```python
# INCORRECTO
try:
    db.session.add(entity)
    db.session.commit()
except Exception as e:
    # No hace rollback → DB en estado inconsistente
    flash('Error', 'error')

# CORRECTO
try:
    db.session.add(entity)
    db.session.commit()
except Exception as e:
    db.session.rollback()  # ✅ Revertir cambios
    app.logger.error(f"Error: {str(e)}")
    flash('Error', 'error')
```

### ❌ 3. Queries N+1
```python
# INCORRECTO: N+1 queries
invoices = Invoice.query.all()
for invoice in invoices:
    print(invoice.customer.name)  # Query por cada invoice

# CORRECTO: Eager loading
invoices = Invoice.query.options(
    db.joinedload(Invoice.customer)
).all()
for invoice in invoices:
    print(invoice.customer.name)  # Sin queries adicionales
```

### ❌ 4. Validación Solo Cliente
```python
# INCORRECTO: Confiar en validación frontend
@app.route('/products/new', methods=['POST'])
def product_new():
    product = Product(name=request.form['name'])  # Sin validación
    db.session.add(product)
    db.session.commit()

# CORRECTO: SIEMPRE validar en backend
@app.route('/products/new', methods=['POST'])
def product_new():
    name = request.form.get('name', '').strip()
    
    if not name:
        flash('El nombre es requerido', 'error')
        return render_template('products/form.html')
    
    product = Product(name=name)
    db.session.add(product)
    db.session.commit()
```

---

## 📞 Coordinación con Otros Agents

### Con Frontend Agent
**Dependencias del Frontend**:
- Context data en `render_template()`
- Flash messages para feedback
- Endpoints API JSON (`/api/*`)
- Validación consistente con frontend

**Comunicación**:
```python
# Backend proporciona:
@app.route('/products/new')
def product_new():
    return render_template('products/form.html',
        categories=['Alimento', 'Juguete', 'Medicina'],
        action_url=url_for('product_create')
    )

# Frontend espera:
# - categories: lista de opciones
# - action_url: URL para POST del formulario
```

### Con Database Agent
**Dependencias de la DB**:
- Modelos SQLAlchemy actualizados
- Relaciones correctas (ForeignKey, backref)
- Constraints (unique, nullable)

**Comunicación**:
```python
# Backend usa modelos definidos en models/models.py
from models.models import Product, Customer, Invoice

# Database Agent debe asegurar:
# - Campos existen en el modelo
# - Tipos de datos correctos
# - Índices en campos de búsqueda
```

---

**Última actualización**: 5 de noviembre de 2025  
**Versión del agent**: 1.0  
**Autor**: Sistema Green-POS Development Team
