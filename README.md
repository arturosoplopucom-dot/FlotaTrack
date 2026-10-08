# FlotaTrack ERP

**Sistema de gestión integral para empresas de alquiler de maquinaria pesada.**

Controla toda la operación: desde la cotización hasta el cobro, con reportes en tiempo real, integración SUNAT y facturación electrónica.

---

## Capturas de pantalla

### Dashboard — KPIs y control de flota en tiempo real
![Dashboard](docs/screenshots/01-dashboard.jpg)

### Cobranza (CxC) — Facturas con detracción SUNAT, envío por WhatsApp y email
![Cobranza](docs/screenshots/02-cobranza.jpg)

### Órdenes de Trabajo — Ciclo completo con PDF y seguimiento de estado
![Órdenes de Trabajo](docs/screenshots/03-ordenes-trabajo.jpg)

### Cotizaciones — Generación de propuestas con PDF descargable
![Cotizaciones](docs/screenshots/04-cotizaciones.jpg)

### Equipos — Gestión de flota de maquinaria pesada
![Equipos](docs/screenshots/07-equipos.jpg)

### Antigüedad de Cartera — Aging report con alertas automáticas
![Antigüedad CxC](docs/screenshots/06-antiguedad.jpg)

### Centro de Reportes — 11 reportes exportables a Excel y PDF
![Reportes](docs/screenshots/05-reportes.jpg)

---

## Funcionalidades

### Operaciones
| Módulo | Descripción |
|---|---|
| **Dashboard** | KPIs en tiempo real: flota activa, CxC vigente, ingresos del mes, ocupación |
| **Equipos** | Gestión de grúas, plataformas y montacargas con historial de OTs y rentabilidad |
| **Operarios** | Control de operadores, licencias y asignación a órdenes de trabajo |
| **Clientes** | CRM básico con historial de facturación y saldo |
| **Cotizaciones** | Generación de cotizaciones con PDF descargable y seguimiento de estado |
| **Órdenes de Trabajo** | Ciclo completo desde cotización aprobada hasta factura; PDF con firma |
| **Mantenimiento** | Registro de mantenimientos preventivos y correctivos por equipo |

### Comercial / Financiero
| Módulo | Descripción |
|---|---|
| **Cobranza (CxC)** | Gestión de facturas con detracción SUNAT, pagos parciales y alertas de vencimiento |
| **Antigüedad de cartera** | Aging report con buckets 0-30 / 31-60 / 61-90 / +90 días |
| **Historial de pagos** | Registro completo de cobros con método de pago |
| **SUNAT SIRE** | Importación automática de comprobantes electrónicos desde SUNAT |

### Reportes (13 reportes exportables a Excel / PDF)
- Reporte gerencial consolidado
- Rentabilidad por equipo
- Disponibilidad de flota
- Órdenes de trabajo
- Facturas emitidas
- Cobranza (CxC detallado)
- Antigüedad de cartera
- Cotizaciones
- Clientes
- Operarios
- Mantenimientos
- Pagos
- Reportes personalizados

### Características transversales
- Temas **claro / oscuro** con paleta de colores personalizable
- PDF profesional generado en cliente (jsPDF) y en servidor (Puppeteer)
- Envío directo por **WhatsApp** y **correo electrónico**
- Búsqueda global con acceso rápido por teclado
- Responsive — funciona en tablet y desktop

---

## Stack tecnológico

### Backend — `api/`
| Tecnología | Uso |
|---|---|
| Node.js + Express | API REST |
| TypeScript | Tipado estricto |
| Prisma ORM | Acceso a base de datos |
| PostgreSQL | Base de datos principal |
| JWT | Autenticación |
| Puppeteer | Generación de PDF en servidor |
| Docker | Contenedorización |

### Frontend — `web/`
| Tecnología | Uso |
|---|---|
| React 18 + Vite | UI |
| TypeScript | Tipado estricto |
| TanStack Query | Server state y caché |
| Zustand | Estado global |
| React Router v6 | Navegación |
| jsPDF | PDF en cliente |
| Lucide React | Iconografía |

---

## Estructura del proyecto

```
FlotaTrack/
├── api/                        # Backend Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # Modelo de datos
│   │   └── seed.ts             # Datos de prueba
│   └── src/
│       ├── modules/            # Módulos por dominio
│       │   ├── auth/
│       │   ├── equipment/
│       │   ├── operators/
│       │   ├── clients/
│       │   ├── quotes/
│       │   ├── workorders/
│       │   ├── invoices/
│       │   ├── maintenance/
│       │   ├── reports/
│       │   └── sunat/
│       ├── middlewares/
│       └── config/
├── web/                        # Frontend React + Vite
│   └── src/
│       ├── pages/              # Una página por módulo
│       ├── components/         # Componentes reutilizables
│       ├── hooks/              # Hooks de datos (TanStack Query)
│       ├── store/              # Estado global (Zustand)
│       └── lib/                # API client y utilidades
├── docker-compose.yml          # Producción
├── docker-compose.dev.yml      # Desarrollo
└── SETUP.md                    # Guía de instalación detallada
```

---

## Instalación rápida

### Requisitos
- Node.js 18+
- PostgreSQL 14+
- npm o pnpm

### 1. Clonar el repositorio
```bash
git clone https://github.com/arturosoplopucom-dot/FlotaTrack.git
cd FlotaTrack
```

### 2. Configurar el backend
```bash
cd api
cp .env.example .env
# Editar .env con tu cadena de conexión a PostgreSQL y JWT_SECRET
npm install
npx prisma migrate deploy
npx prisma db seed       # Crea empresa y usuario admin de ejemplo
npm run dev              # Inicia en puerto 3002
```

### 3. Configurar el frontend
```bash
cd ../web
npm install
npm run dev              # Inicia en puerto 5174
```

### 4. Acceder al sistema
```
URL:      http://localhost:5174
Usuario:  admin@tuempresa.com   (configurado en el seed)
Password: admin123
```

---

## Docker (producción)

```bash
cp .env.production.example .env.production
docker compose up -d
```

La API corre en el puerto `3002` y el frontend en el puerto `80` (Nginx).

---

## Variables de entorno

Copia `api/.env.example` a `api/.env` y completa:

```env
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/flotatrack"
JWT_SECRET="tu_secreto_seguro_aqui"
PORT=3002
NODE_ENV=development

# Opcional — notificaciones por correo
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## Licencia

Uso privado. Todos los derechos reservados.

---

*Desarrollado para Grúas Omega S.A.C. — Perú*
