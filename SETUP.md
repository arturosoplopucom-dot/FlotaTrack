# FlotaTrack — Cómo levantar el proyecto

---

## OPCIÓN A — Desarrollo local con Docker (recomendado)

Solo necesitas **Docker Desktop** instalado. No necesitas instalar PostgreSQL.

### 1. Levantar PostgreSQL con Docker

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esto levanta solo la base de datos en `localhost:5432`.

### 2. Configurar variables de entorno del backend

```bash
cd api
copy .env.example .env
```

El `.env` ya apunta a `localhost:5432` con las credenciales del compose dev. Solo edita `JWT_SECRET` si quieres.

### 3. Migraciones y seed de datos de prueba

```bash
cd api
npx prisma migrate dev --name init
npm run db:seed
```

El seed crea:
- Empresa: **Gruas Omega S.A.C.** (RUC: `20601234567`)
- Usuario: `admin@gruasomega.pe` / contraseña: `admin123`
- 3 clientes y 4 facturas de prueba (1 vencida, 2 pendientes, 1 pagada)

### 4. Levantar API y Web

En dos terminales separadas:

```bash
cd api && npm run dev
```

```bash
cd web && npm run dev
```

### 5. Ingresar

- URL: http://localhost:5173
- RUC: `20601234567` · Email: `admin@gruasomega.pe` · Contraseña: `admin123`

---

## OPCIÓN B — Desarrollo local sin Docker

Requiere PostgreSQL instalado en tu máquina.

```sql
CREATE DATABASE flotatrack;
```

Luego sigue los pasos 2-5 de la Opción A, ajustando `DATABASE_URL` en el `.env`.

---

## OPCIÓN C — Producción con Docker Compose (VPS / Hetzner)

Levanta todo el stack: PostgreSQL + API + Web en contenedores.

### 1. Copiar y configurar el .env de producción

```bash
copy .env.production.example .env
```

Editar `.env` con valores reales:
- `POSTGRES_PASSWORD` — contraseña segura (mínimo 20 caracteres)
- `JWT_SECRET` — clave aleatoria larga (mínimo 32 caracteres)
- `CLIENT_URL` — tu dominio real (`https://flotatrack.tudominio.pe`)
- Datos SMTP para alertas por email

### 2. Construir y levantar

```bash
docker compose up -d --build
```

La primera vez descarga imágenes y construye los contenedores (~3-5 min).

### 3. Ejecutar migraciones y seed en producción

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run db:seed
```

### 4. Ver logs

```bash
docker compose logs -f api
docker compose logs -f postgres
```

### 5. Parar / reiniciar

```bash
docker compose down        # para
docker compose restart api # reinicia solo la API
```

---

## OPCIÓN D — Producción en Railway (más simple)

1. Subir el código a GitHub
2. Crear cuenta en [railway.app](https://railway.app)
3. Nuevo proyecto → Deploy from GitHub → seleccionar el repo
4. Agregar servicio PostgreSQL desde el panel de Railway
5. Configurar variables de entorno en Railway (las mismas del `.env.production.example`)
6. Railway genera la `DATABASE_URL` automáticamente — copiarla a las variables de la API
7. Deploy automático al hacer `git push`

---

## Estructura del proyecto

```
FlotaTrack/
├── api/                    ← Backend Node.js + Express + Prisma
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/       ← Login y registro
│   │   │   ├── clients/    ← CRUD clientes
│   │   │   └── invoices/   ← CxC: facturas, pagos, dashboard
│   │   ├── jobs/           ← Cron de alertas diarias
│   │   └── utils/          ← Email service
│   └── prisma/             ← Schema DB + seed
├── web/                    ← Frontend React + Vite + Tailwind
│   └── src/
│       ├── pages/          ← Login + Dashboard CxC
│       ├── hooks/          ← useInvoices, useDashboard
│       └── store/          ← Zustand auth store
├── docker-compose.yml          ← Producción completa
├── docker-compose.dev.yml      ← Solo PostgreSQL para desarrollo
└── .env.production.example     ← Variables de entorno de producción
```
