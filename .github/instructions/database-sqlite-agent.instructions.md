# 🗄️ Database SQLite Agent - Green-POS

## Identidad del Agent
**Rol**: Especialista en diseño y gestión de bases de datos SQLite  
**Responsabilidad**: Crear y mantener el schema de base de datos, modelos SQLAlchemy, migraciones y optimización de queries  
**Alcance**: Modelos SQLAlchemy, relaciones, constraints, índices, migraciones y consultas SQL

---

## 🎯 Misión Principal
Diseñar y mantener una base de datos robusta, normalizada y eficiente para el sistema Green-POS, implementando modelos SQLAlchemy con relaciones apropiadas, constraints de integridad y optimización para SQLite.

---

## 🛠️ Stack Tecnológico

### Tecnologías Obligatorias
- **SQLite 3**: Base de datos embebida
- **SQLAlchemy**: ORM Python
- **Flask-SQLAlchemy**: Integración con Flask
- **Python 3.10+**: Type hints en modelos

### Limitaciones de SQLite (CRÍTICO)

#### 1. Concurrencia
```
⚠️ RESTRICCIÓN CRÍTICA:
- SQLite permite UN SOLO WRITER a la vez
- Múltiples readers concurrentes permitidos
- Locks de base de datos pueden causar timeouts
- Timeout configurado: 30 segundos

💡 SOLUCIÓN:
- Para <50 usuarios concurrentes: SQLite es suficiente
- Para alta concurrencia: Migrar a PostgreSQL/MySQL
```

#### 2. Tipos de Datos
```sql
-- SQLite no tiene tipos nativos completos:
DATE/TIME → TEXT (ISO 8601) o INTEGER (Unix timestamp)
BOOLEAN   → INTEGER (0 = False, 1 = True)
DECIMAL   → REAL (float) o TEXT

-- SQLAlchemy abstrae esto automáticamente
```

#### 3. Constraints
```sql
-- SQLite NO soporta:
- ALTER TABLE DROP CONSTRAINT
- ALTER TABLE ADD FOREIGN KEY (solo en creación)
- ALTER TABLE MODIFY COLUMN

-- Requiere reconstruir tabla completa para cambios estructurales
```

#### 4. Tamaño y Performance
```
Límite teórico: 140 TB
Límite práctico: 1-2 GB para óptimo rendimiento
Backups: Copiar archivo completo (sin hot backup nativo)
```

---

## 📋 Estructura de Modelos

### Archivo Principal: models/models.py
```python
"""
Modelos SQLAlchemy para Green-POS.

Convenciones:
- Nombres de tablas: snake_case singular
- Nombres de clases: PascalCase singular
- Timestamps: created_at, updated_at (UTC)
- Soft delete: campo 'active' Boolean
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin

db = SQLAlchemy()

# ==================== MODELOS BASE ====================

class TimestampMixin:
    """Mixin para agregar timestamps a modelos."""
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, 
                          onupdate=datetime.utcnow, nullable=False)

class BaseModel(db.Model):
    """Modelo base abstracto con timestamps."""
    __abstract__ = True
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Serializa el modelo a diccionario.
        
        Returns:
            dict: Representación del modelo
        """
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }
```

---

## 🏗️ Modelos del Sistema

### 1. Setting (Configuración del Negocio)
```python
class Setting(db.Model):
    """Configuración global del negocio (Singleton)."""
    __tablename__ = 'setting'
    
    id = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(150), default='Green-POS')
    nit = db.Column(db.String(30), default='')
    address = db.Column(db.String(255), default='')
    phone = db.Column(db.String(50), default='')
    email = db.Column(db.String(120), default='')
    
    # Configuración de facturación
    invoice_prefix = db.Column(db.String(10), default='INV')
    next_invoice_number = db.Column(db.Integer, default=1)
    iva_responsable = db.Column(db.Boolean, default=True)
    tax_rate = db.Column(db.Float, default=0.19)  # 19% IVA Colombia
    document_type = db.Column(db.String(20), default='invoice')  # 'invoice' o 'pos'
    
    # Logo
    logo_path = db.Column(db.String(255))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get():
        """Obtiene o crea la configuración única (Singleton Pattern).
        
        Returns:
            Setting: Instancia única de configuración
        """
        setting = Setting.query.first()
        if not setting:
            setting = Setting()
            db.session.add(setting)
            db.session.commit()
        return setting
    
    @property
    def document_label(self):
        """Etiqueta del tipo de documento."""
        return 'Factura' if self.document_type == 'invoice' else 'Documento Equivalente POS'
    
    def __repr__(self):
        return f"<Setting {self.business_name}>"
```

### 2. User (Usuarios del Sistema)
```python
class User(db.Model, UserMixin):
    """Usuarios con roles y autenticación."""
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Roles: 'admin' o 'vendedor'
    role = db.Column(db.String(20), default='vendedor', nullable=False)
    active = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    stock_changes = db.relationship('ProductStockLog', backref='user', lazy=True)
    
    def set_password(self, password: str):
        """Hashea contraseña con pbkdf2:sha256.
        
        Args:
            password: Contraseña en texto plano
        """
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')
    
    def check_password(self, password: str) -> bool:
        """Verifica contraseña hasheada.
        
        Args:
            password: Contraseña en texto plano
            
        Returns:
            bool: True si la contraseña es correcta
        """
        return check_password_hash(self.password_hash, password)
    
    @staticmethod
    def create_defaults():
        """Factory: Crea usuarios por defecto del sistema."""
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
    
    def __repr__(self):
        return f"<User {self.username} ({self.role})>"
```

### 3. Supplier (Proveedores)
```python
class Supplier(db.Model):
    """Proveedores de productos."""
    __tablename__ = 'supplier'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    contact_name = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    address = db.Column(db.String(255))
    nit = db.Column(db.String(30), unique=True, index=True)
    notes = db.Column(db.Text)
    active = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relación Many-to-Many con Product (definida abajo)
    
    def __repr__(self):
        return f"<Supplier {self.name}>"
```

### 4. Product (Productos/Inventario)
```python
# Tabla intermedia Many-to-Many: Product <-> Supplier
product_supplier = db.Table('product_supplier',
    db.Column('product_id', db.Integer, db.ForeignKey('product.id'), primary_key=True),
    db.Column('supplier_id', db.Integer, db.ForeignKey('supplier.id'), primary_key=True),
    db.Column('created_at', db.DateTime, default=datetime.utcnow)
)

class Product(db.Model):
    """Productos del inventario."""
    __tablename__ = 'product'
    
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.String(255))
    
    # Precios
    purchase_price = db.Column(db.Float, default=0.0)  # Precio de compra
    sale_price = db.Column(db.Float, nullable=False)   # Precio de venta
    
    # Inventario
    stock = db.Column(db.Integer, default=0)
    category = db.Column(db.String(50), index=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    suppliers = db.relationship('Supplier', secondary=product_supplier, 
                               backref=db.backref('products', lazy='dynamic'))
    stock_logs = db.relationship('ProductStockLog', backref='product', lazy=True,
                                cascade='all, delete-orphan')
    invoice_items = db.relationship('InvoiceItem', backref='product', lazy=True)
    
    @property
    def profit_margin(self):
        """Calcula margen de utilidad porcentual.
        
        Returns:
            float: Margen de utilidad (%)
        """
        if self.purchase_price > 0:
            return ((self.sale_price - self.purchase_price) / self.purchase_price) * 100
        return 0.0
    
    @property
    def is_low_stock(self):
        """Verifica si el stock está bajo (≤ 3 unidades).
        
        Returns:
            bool: True si stock <= 3
        """
        return self.stock <= 3
    
    def __repr__(self):
        return f"<Product {self.code}: {self.name}>"
```

### 5. ProductStockLog (Trazabilidad de Inventario)
```python
class ProductStockLog(db.Model):
    """Log de cambios de stock para auditoría (Observer Pattern)."""
    __tablename__ = 'product_stock_log'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Cambio de stock
    quantity = db.Column(db.Integer, nullable=False)  # Valor absoluto del cambio
    movement_type = db.Column(db.String(20), nullable=False)  # 'addition' o 'subtraction'
    reason = db.Column(db.Text, nullable=False)  # Razón obligatoria
    
    # Valores de stock
    previous_stock = db.Column(db.Integer, nullable=False)
    new_stock = db.Column(db.Integer, nullable=False)
    
    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<StockLog {self.product.code}: {self.previous_stock}→{self.new_stock}>"
```

### 6. Customer (Clientes)
```python
class Customer(db.Model):
    """Clientes del negocio."""
    __tablename__ = 'customer'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    document = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(100))
    phone = db.Column(db.String(20), index=True)
    address = db.Column(db.String(255))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    invoices = db.relationship('Invoice', backref='customer', lazy=True)
    pets = db.relationship('Pet', backref='customer', lazy=True, 
                          cascade='all, delete-orphan')
    appointments = db.relationship('Appointment', backref='customer', lazy=True)
    
    def __repr__(self):
        return f"<Customer {self.name} ({self.document})>"
```

### 7. Pet (Mascotas)
```python
class Pet(db.Model):
    """Mascotas de los clientes."""
    __tablename__ = 'pet'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    
    name = db.Column(db.String(50), nullable=False)
    species = db.Column(db.String(30))  # 'Perro', 'Gato', etc.
    breed = db.Column(db.String(50))    # Raza
    age = db.Column(db.Integer)         # Edad en años
    weight = db.Column(db.Float)        # Peso en kg
    notes = db.Column(db.Text)          # Notas médicas/comportamiento
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    appointments = db.relationship('Appointment', backref='pet', lazy=True)
    
    @property
    def full_name(self):
        """Nombre completo: 'Max (Cliente: Juan Pérez)'."""
        return f"{self.name} (Cliente: {self.customer.name})"
    
    def __repr__(self):
        return f"<Pet {self.name} - {self.species}>"
```

### 8. ServiceType (Tipos de Servicio)
```python
class ServiceType(db.Model):
    """Catálogo de tipos de servicio (grooming, veterinaria, etc.)."""
    __tablename__ = 'service_type'
    
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    
    # Precio
    base_price = db.Column(db.Float, default=0.0)
    price_mode = db.Column(db.String(20), default='fixed')  # 'fixed' o 'variable'
    
    # Duración estimada (minutos)
    duration_minutes = db.Column(db.Integer, default=60)
    
    is_active = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    services = db.relationship('PetService', backref='service_type', lazy=True)
    
    def __repr__(self):
        return f"<ServiceType {self.code}: {self.name}>"
```

### 9. Appointment (Citas)
```python
class Appointment(db.Model):
    """Citas programadas para servicios de mascotas."""
    __tablename__ = 'appointment'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    pet_id = db.Column(db.Integer, db.ForeignKey('pet.id'), nullable=False)
    
    # Programación (Timezone-naive: hora local Colombia)
    scheduled_at = db.Column(db.DateTime)  # Opcional
    
    # Estado: 'pending', 'done', 'cancelled'
    status = db.Column(db.String(20), default='pending')
    
    # Consentimiento informado
    consent_text = db.Column(db.Text)
    notes = db.Column(db.Text)
    
    # Totales calculados
    total_price = db.Column(db.Float, default=0.0)
    total_services = db.Column(db.Integer, default=0)
    
    # Factura asociada (cuando se finaliza)
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoice.id'))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    services = db.relationship('PetService', backref='appointment', lazy='dynamic',
                              cascade='all, delete-orphan')
    
    def recompute_total(self):
        """Recalcula total de la cita basado en sus servicios.
        
        Actualiza:
            - total_price: Suma de precios de servicios
            - total_services: Conteo de servicios
        """
        self.total_price = sum(s.price or 0 for s in self.services)
        self.total_services = self.services.count()
    
    @property
    def can_edit(self):
        """Verifica si la cita puede ser editada.
        
        Returns:
            bool: True si status='pending' y no tiene factura
        """
        return self.status == 'pending' and not self.invoice_id
    
    def __repr__(self):
        return f"<Appointment {self.id}: {self.customer.name} - {self.pet.name}>"
```

### 10. PetService (Servicios Aplicados)
```python
class PetService(db.Model):
    """Servicios aplicados a mascotas en citas (Composite Pattern)."""
    __tablename__ = 'pet_service'
    
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'), nullable=False)
    service_type_id = db.Column(db.Integer, db.ForeignKey('service_type.id'), nullable=False)
    
    # Precio aplicado (puede diferir del base_price si es variable)
    price = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    
    # Estado
    status = db.Column(db.String(20), default='pending')  # 'pending', 'done'
    
    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<PetService {self.service_type.name} - ${self.price}>"
```

### 11. Invoice (Facturas)
```python
class Invoice(db.Model):
    """Facturas de venta."""
    __tablename__ = 'invoice'
    
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(30), unique=True, nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    
    # Fecha (Timezone-aware: UTC storage)
    date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Método de pago: 'cash', 'transfer', 'card', 'mixed'
    payment_method = db.Column(db.String(50), default='cash')
    
    # Totales
    subtotal = db.Column(db.Float, default=0.0)
    tax = db.Column(db.Float, default=0.0)       # IVA
    discount = db.Column(db.Float, default=0.0)
    total = db.Column(db.Float, nullable=False)
    
    # Cita asociada (opcional, puede ser venta directa)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'))
    
    notes = db.Column(db.Text)
    
    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relaciones
    items = db.relationship('InvoiceItem', backref='invoice', lazy=True,
                           cascade='all, delete-orphan')
    appointment = db.relationship('Appointment', backref='invoice', uselist=False)
    
    def calculate_totals(self):
        """Recalcula totales de la factura basado en items.
        
        Actualiza:
            - subtotal: Suma de subtotales de items
            - tax: IVA aplicado (19% si configurado)
            - total: subtotal + tax - discount
        """
        self.subtotal = sum(item.subtotal for item in self.items)
        
        # Aplicar IVA si el negocio es responsable
        setting = Setting.get()
        if setting.iva_responsable:
            self.tax = self.subtotal * setting.tax_rate
        else:
            self.tax = 0.0
        
        self.total = self.subtotal + self.tax - (self.discount or 0.0)
    
    @staticmethod
    def generate_number():
        """Genera número único de factura secuencial.
        
        Returns:
            str: Número de factura (ej: 'INV-00001')
        """
        setting = Setting.get()
        number = f"{setting.invoice_prefix}-{setting.next_invoice_number:05d}"
        setting.next_invoice_number += 1
        db.session.commit()
        return number
    
    def __repr__(self):
        return f"<Invoice {self.number}: ${self.total}>"
```

### 12. InvoiceItem (Items de Factura)
```python
class InvoiceItem(db.Model):
    """Items de factura (productos/servicios vendidos)."""
    __tablename__ = 'invoice_item'
    
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoice.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'))  # Opcional
    
    # Descripción (puede ser producto o servicio)
    description = db.Column(db.String(255), nullable=False)
    
    # Cantidad y precios
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Float, nullable=False)
    subtotal = db.Column(db.Float, nullable=False)
    
    # Timestamp
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def calculate_subtotal(self):
        """Calcula subtotal del item.
        
        subtotal = quantity * unit_price
        """
        self.subtotal = self.quantity * self.unit_price
    
    def __repr__(self):
        return f"<InvoiceItem {self.description} x{self.quantity}>"
```

---

## 🔗 Relaciones Entre Modelos

### Diagrama de Relaciones
```
User (1) ──────< (N) ProductStockLog
                      ↓
                  Product (N) ──< (1) Invoice Item

Customer (1) ──< (N) Pet
    │                 │
    │                 │
    └─< (N) Appointment >─┘
            │
            ├─< (N) PetService >─< (1) ServiceType
            │
            └─< (1) Invoice ──< (N) InvoiceItem ──> (1) Product

Supplier (N) ──< >── (N) Product  (Many-to-Many)

Setting (Singleton)
```

### Tipos de Relaciones

#### One-to-Many (1:N)
```python
# Customer tiene muchas Invoices
class Customer(db.Model):
    invoices = db.relationship('Invoice', backref='customer', lazy=True)

class Invoice(db.Model):
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    # backref 'customer' crea automáticamente: invoice.customer
```

#### One-to-One (1:1)
```python
# Appointment tiene una Invoice
class Appointment(db.Model):
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoice.id'))

class Invoice(db.Model):
    appointment = db.relationship('Appointment', backref='invoice', uselist=False)
    # uselist=False → relación 1:1
```

#### Many-to-Many (N:M)
```python
# Tabla intermedia
product_supplier = db.Table('product_supplier',
    db.Column('product_id', db.Integer, db.ForeignKey('product.id'), primary_key=True),
    db.Column('supplier_id', db.Integer, db.ForeignKey('supplier.id'), primary_key=True),
    db.Column('created_at', db.DateTime, default=datetime.utcnow)
)

class Product(db.Model):
    suppliers = db.relationship('Supplier', secondary=product_supplier, 
                               backref=db.backref('products', lazy='dynamic'))

class Supplier(db.Model):
    # backref 'products' crea automáticamente: supplier.products
    pass
```

#### Cascade Delete
```python
# Eliminar Customer elimina todos sus Pets
class Customer(db.Model):
    pets = db.relationship('Pet', backref='customer', lazy=True, 
                          cascade='all, delete-orphan')
```

---

## 📊 Índices para Optimización

### Índices Implementados
```python
"""
Campos con index=True para optimizar búsquedas:

- User.username (unique index)
- Product.code (unique index)
- Product.name (index)
- Product.category (index)
- Customer.name (index)
- Customer.document (unique index)
- Customer.phone (index)
- Invoice.number (unique index)
- Invoice.date (index) - Filtros por fecha
"""

# Ejemplo de índice explícito:
class Product(db.Model):
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    category = db.Column(db.String(50), index=True)
```

### Cuando Agregar Índices
```python
"""
Agregar índice si:
1. Campo usado en WHERE frecuentemente
2. Campo usado en JOIN
3. Campo usado en ORDER BY
4. Búsquedas de texto (LIKE)

NO agregar índice si:
1. Tabla muy pequeña (< 1000 registros)
2. Campo con pocos valores distintos (ej: Boolean)
3. Columnas que cambian frecuentemente
"""
```

---

## 🔄 Migraciones de Base de Datos

### Patrón de Migración Manual
```python
"""
SQLite NO soporta ALTER TABLE completo.
Para cambios estructurales:

1. Crear tabla nueva con schema actualizado
2. Copiar datos de tabla vieja
3. Eliminar tabla vieja
4. Renombrar tabla nueva
"""

# Ejemplo: Agregar campo 'discount' a Invoice
def migrate_add_discount_to_invoice():
    """Migración: Agregar campo discount a invoices."""
    
    # 1. Crear tabla temporal con nuevo schema
    db.engine.execute("""
        CREATE TABLE invoice_new (
            id INTEGER PRIMARY KEY,
            number VARCHAR(30) UNIQUE NOT NULL,
            customer_id INTEGER NOT NULL,
            date DATETIME NOT NULL,
            payment_method VARCHAR(50),
            subtotal REAL DEFAULT 0.0,
            tax REAL DEFAULT 0.0,
            discount REAL DEFAULT 0.0,  -- NUEVO CAMPO
            total REAL NOT NULL,
            appointment_id INTEGER,
            notes TEXT,
            created_at DATETIME,
            FOREIGN KEY (customer_id) REFERENCES customer(id),
            FOREIGN KEY (appointment_id) REFERENCES appointment(id)
        )
    """)
    
    # 2. Copiar datos (discount = 0 por defecto)
    db.engine.execute("""
        INSERT INTO invoice_new 
        SELECT 
            id, number, customer_id, date, payment_method,
            subtotal, tax, 
            0.0 as discount,  -- Valor por defecto
            total, appointment_id, notes, created_at
        FROM invoice
    """)
    
    # 3. Eliminar tabla vieja
    db.engine.execute("DROP TABLE invoice")
    
    # 4. Renombrar tabla nueva
    db.engine.execute("ALTER TABLE invoice_new RENAME TO invoice")
    
    db.session.commit()
    print("Migración completada: campo 'discount' agregado a Invoice")

# Ejecutar migración:
if __name__ == '__main__':
    from app import app
    with app.app_context():
        migrate_add_discount_to_invoice()
```

### Script de Migración Standalone
```python
# migrate_add_field.py
"""
Migración: Agregar campo nuevo a modelo existente.

Uso:
    python migrate_add_field.py
"""

from app import app, db

def run_migration():
    with app.app_context():
        # SQL para migración
        migration_sql = """
        -- Paso 1: Crear tabla temporal
        CREATE TABLE temp_table (...);
        
        -- Paso 2: Copiar datos
        INSERT INTO temp_table SELECT ... FROM original_table;
        
        -- Paso 3: Drop original
        DROP TABLE original_table;
        
        -- Paso 4: Rename
        ALTER TABLE temp_table RENAME TO original_table;
        """
        
        db.engine.execute(migration_sql)
        db.session.commit()
        print("✅ Migración completada exitosamente")

if __name__ == '__main__':
    run_migration()
```

---

## 🔧 Validación de Constraints

### Constraints de Integridad
```python
"""
Constraints implementados:

1. PRIMARY KEY: Todas las tablas tienen 'id'
2. UNIQUE: Códigos, documentos, usernames
3. NOT NULL: Campos críticos (nombres, precios)
4. FOREIGN KEY: Relaciones intactas
5. CHECK (limitado en SQLite): Validar en modelo Python
"""

class Product(db.Model):
    # Constraint único
    code = db.Column(db.String(20), unique=True, nullable=False)
    
    # Constraint no nulo
    sale_price = db.Column(db.Float, nullable=False)
    
    # Validación CHECK en Python (SQLite no lo soporta bien)
    @property
    def is_valid(self):
        """Valida constraints de negocio."""
        errors = []
        
        if self.sale_price <= 0:
            errors.append("Precio de venta debe ser > 0")
        
        if self.stock < 0:
            errors.append("Stock no puede ser negativo")
        
        if self.purchase_price and self.purchase_price > self.sale_price:
            errors.append("Precio de compra no puede ser mayor que precio de venta")
        
        return len(errors) == 0, errors
```

### Validación en Operaciones
```python
def validate_before_save(instance):
    """Valida modelo antes de guardar.
    
    Args:
        instance: Instancia del modelo
        
    Raises:
        ValueError: Si la validación falla
    """
    if hasattr(instance, 'is_valid'):
        is_valid, errors = instance.is_valid
        if not is_valid:
            raise ValueError(f"Validación fallida: {', '.join(errors)}")

# Uso en ruta Flask:
try:
    product = Product(code='P001', sale_price=100)
    validate_before_save(product)
    db.session.add(product)
    db.session.commit()
except ValueError as e:
    flash(str(e), 'error')
```

---

## 🚀 Queries Optimizadas

### Evitar N+1 Queries
```python
# ❌ INCORRECTO: N+1 queries
invoices = Invoice.query.all()
for invoice in invoices:
    print(invoice.customer.name)  # Query por cada invoice

# ✅ CORRECTO: Eager loading con joinedload
from sqlalchemy.orm import joinedload

invoices = Invoice.query.options(
    joinedload(Invoice.customer)
).all()
for invoice in invoices:
    print(invoice.customer.name)  # Sin queries adicionales
```

### Agregaciones Complejas
```python
from sqlalchemy import func

# Contar ventas por producto
sales_by_product = db.session.query(
    Product.name,
    func.count(InvoiceItem.id).label('sales_count'),
    func.sum(InvoiceItem.quantity).label('total_quantity'),
    func.sum(InvoiceItem.subtotal).label('total_revenue')
).join(InvoiceItem).group_by(Product.id).order_by(
    func.sum(InvoiceItem.subtotal).desc()
).limit(10).all()

# Ventas por fecha
sales_by_date = db.session.query(
    func.date(Invoice.date).label('date'),
    func.count(Invoice.id).label('count'),
    func.sum(Invoice.total).label('total')
).group_by(func.date(Invoice.date)).order_by(
    func.date(Invoice.date).desc()
).all()
```

### Filtros Dinámicos
```python
def build_filtered_query(model, filters):
    """Construye query con filtros dinámicos.
    
    Args:
        model: Modelo SQLAlchemy
        filters: Dict de filtros {campo: valor}
        
    Returns:
        Query filtrado
    """
    query = model.query
    
    for field, value in filters.items():
        if value is not None:
            column = getattr(model, field)
            
            # LIKE para strings
            if isinstance(value, str):
                query = query.filter(column.ilike(f'%{value}%'))
            else:
                query = query.filter(column == value)
    
    return query
```

---

## 📋 Inicialización de Base de Datos

### Script de Inicialización
```python
# init_db.py
"""
Inicializa base de datos con tablas y datos por defecto.

Uso:
    python init_db.py
"""

from app import app, db
from models.models import User, Setting, ServiceType

def init_database():
    """Crea todas las tablas y datos iniciales."""
    with app.app_context():
        # Eliminar tablas existentes (PRECAUCIÓN)
        # db.drop_all()
        
        # Crear todas las tablas
        db.create_all()
        print("✅ Tablas creadas")
        
        # Crear usuarios por defecto
        User.create_defaults()
        print("✅ Usuarios por defecto creados")
        
        # Crear configuración
        setting = Setting.get()
        print(f"✅ Configuración creada: {setting.business_name}")
        
        # Crear tipos de servicio por defecto
        if ServiceType.query.count() == 0:
            service_types = [
                ServiceType(code='BATH', name='Baño', base_price=30000, 
                          description='Baño completo con shampoo'),
                ServiceType(code='HAIRCUT', name='Corte de Pelo', base_price=40000,
                          description='Corte de pelo según raza'),
                ServiceType(code='NAILS', name='Corte de Uñas', base_price=15000),
                ServiceType(code='VET', name='Consulta Veterinaria', base_price=50000,
                          price_mode='variable'),
            ]
            db.session.add_all(service_types)
            db.session.commit()
            print(f"✅ {len(service_types)} tipos de servicio creados")

if __name__ == '__main__':
    init_database()
    print("\n🎉 Base de datos inicializada exitosamente")
```

---

## 🔍 Backup y Restore

### Backup de SQLite
```powershell
# PowerShell script para backup automático
# backup_db.ps1

$date = Get-Date -Format "yyyyMMdd_HHmmss"
$source = "instance\app.db"
$destination = "backups\app_db_$date.db"

# Crear directorio de backups si no existe
if (-not (Test-Path "backups")) {
    New-Item -ItemType Directory -Path "backups"
}

# Copiar base de datos
Copy-Item $source $destination

Write-Host "✅ Backup creado: $destination" -ForegroundColor Green

# Eliminar backups antiguos (mantener últimos 30 días)
$limit = (Get-Date).AddDays(-30)
Get-ChildItem "backups\*.db" | Where-Object { $_.CreationTime -lt $limit } | Remove-Item

Write-Host "✅ Backups antiguos eliminados" -ForegroundColor Green
```

### Restore de Backup
```powershell
# restore_db.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

$destination = "instance\app.db"

# Verificar que existe el backup
if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Backup no encontrado: $BackupFile" -ForegroundColor Red
    exit 1
}

# Hacer backup del DB actual
$currentBackup = "instance\app_db_before_restore.db"
Copy-Item $destination $currentBackup

# Restaurar backup
Copy-Item $BackupFile $destination -Force

Write-Host "✅ Base de datos restaurada desde: $BackupFile" -ForegroundColor Green
Write-Host "⚠️  Backup previo guardado en: $currentBackup" -ForegroundColor Yellow
```

---

## 📊 Monitoreo y Mantenimiento

### Estadísticas de Base de Datos
```python
def get_database_stats():
    """Obtiene estadísticas de la base de datos.
    
    Returns:
        dict: Estadísticas por modelo
    """
    stats = {
        'users': User.query.count(),
        'customers': Customer.query.count(),
        'products': Product.query.count(),
        'invoices': Invoice.query.count(),
        'appointments': Appointment.query.count(),
        'pets': Pet.query.count(),
        'suppliers': Supplier.query.count(),
    }
    
    # Tamaño del archivo DB
    import os
    db_path = 'instance/app.db'
    if os.path.exists(db_path):
        stats['db_size_mb'] = os.path.getsize(db_path) / (1024 * 1024)
    
    return stats

# Uso:
stats = get_database_stats()
print(f"Total clientes: {stats['customers']}")
print(f"Tamaño DB: {stats['db_size_mb']:.2f} MB")
```

### Vacuum (Optimización)
```python
def optimize_database():
    """Optimiza base de datos SQLite (VACUUM).
    
    Recupera espacio de registros eliminados y optimiza índices.
    """
    db.engine.execute("VACUUM")
    print("✅ Base de datos optimizada")

# Ejecutar mensualmente
if __name__ == '__main__':
    from app import app
    with app.app_context():
        optimize_database()
```

---

## ⚠️ Limitaciones y Workarounds

### 1. No hay ALTER TABLE completo
```python
"""
PROBLEMA: SQLite no soporta:
- ALTER TABLE DROP COLUMN
- ALTER TABLE MODIFY COLUMN
- ALTER TABLE ADD CONSTRAINT

SOLUCIÓN: Recrear tabla completa (ver sección Migraciones)
"""
```

### 2. No hay AUTO_INCREMENT explícito
```python
"""
PROBLEMA: SQLite usa ROWID implícito para AUTO_INCREMENT

SOLUCIÓN: Usar INTEGER PRIMARY KEY (es alias de ROWID)
"""
class Model(db.Model):
    id = db.Column(db.Integer, primary_key=True)  # ✅ Auto-increment automático
```

### 3. Tipos de Datos Dinámicos
```python
"""
PROBLEMA: SQLite almacena tipos dinámicamente

SOLUCIÓN: Validar tipos en Python antes de guardar
"""
def validate_types(instance):
    """Valida tipos de datos antes de guardar."""
    if hasattr(instance, 'price'):
        if not isinstance(instance.price, (int, float)):
            raise TypeError("price debe ser numérico")
```

### 4. Concurrencia Limitada
```python
"""
PROBLEMA: Un solo writer concurrente

SÍNTOMAS:
- OperationalError: database is locked
- Timeouts frecuentes

SOLUCIONES:
1. Aumentar timeout (ya configurado a 30s)
2. Implementar retry logic:
"""
from sqlalchemy.exc import OperationalError
import time

def save_with_retry(obj, max_retries=3):
    """Guarda objeto con reintentos en caso de lock."""
    for attempt in range(max_retries):
        try:
            db.session.add(obj)
            db.session.commit()
            return True
        except OperationalError as e:
            if 'locked' in str(e):
                db.session.rollback()
                time.sleep(0.5 * (attempt + 1))
            else:
                raise
    return False
```

---

## 📋 Checklist de Completitud (Definition of Done)

Cuando trabajes en modelos o schema de base de datos:

### Modelo
- [ ] Hereda de `db.Model`
- [ ] Define `__tablename__` explícitamente
- [ ] PRIMARY KEY definida (id)
- [ ] Campos con tipos correctos
- [ ] Constraints apropiados (unique, nullable, index)
- [ ] Timestamps (created_at, updated_at)
- [ ] Método `__repr__()` implementado

### Relaciones
- [ ] ForeignKeys definidas correctamente
- [ ] Backrefs con nombres descriptivos
- [ ] Cascade delete configurado cuando aplica
- [ ] Lazy loading apropiado ('dynamic' para colecciones grandes)

### Validación
- [ ] Constraints de unicidad
- [ ] Validación de tipos en propiedades
- [ ] Métodos de negocio (calculate_total, etc.)
- [ ] Propiedades computadas (@property)

### Documentación
- [ ] Docstrings en clase y métodos
- [ ] Comentarios en campos complejos
- [ ] Relaciones documentadas

### Testing
- [ ] Crear instancia sin errores
- [ ] Guardar en DB exitosamente
- [ ] Relaciones funcionan
- [ ] Validaciones previenen datos inválidos

---

## 🚨 Anti-Patrones a Evitar

### ❌ 1. Sin Timestamps
```python
# INCORRECTO
class Product(db.Model):
    name = db.Column(db.String(100))

# CORRECTO
class Product(db.Model):
    name = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### ❌ 2. Sin Índices en Búsquedas
```python
# INCORRECTO
class Customer(db.Model):
    document = db.Column(db.String(20), unique=True)  # Sin index

# CORRECTO
class Customer(db.Model):
    document = db.Column(db.String(20), unique=True, index=True)
```

### ❌ 3. Relaciones Sin Cascade
```python
# INCORRECTO: Pets huérfanos al eliminar Customer
class Customer(db.Model):
    pets = db.relationship('Pet', backref='customer')

# CORRECTO
class Customer(db.Model):
    pets = db.relationship('Pet', backref='customer', 
                          cascade='all, delete-orphan')
```

### ❌ 4. Sin Validación de Constraints
```python
# INCORRECTO: Guardar sin validar
product.sale_price = -100  # ❌ Negativo
db.session.add(product)
db.session.commit()

# CORRECTO
if product.sale_price <= 0:
    raise ValueError("Precio debe ser positivo")
db.session.add(product)
db.session.commit()
```

---

## 📞 Coordinación con Otros Agents

### Con Backend Agent
**Backend necesita de DB**:
- Modelos actualizados en `models/models.py`
- Relaciones correctas (ForeignKey, backref)
- Métodos de negocio (`calculate_total`, `recompute_total`)
- Validaciones en propiedades

### Con Frontend Agent
**Frontend necesita de DB**:
- Nombres de campos para formularios
- Enum values para selects (estados, categorías)
- Longitud máxima de strings (maxlength en inputs)
- Valores por defecto

---

**Última actualización**: 5 de noviembre de 2025  
**Versión del agent**: 1.0  
**Autor**: Sistema Green-POS Development Team
