# ARIAE - instalación Supabase

## 1. Base de datos
Ejecutar en Supabase > SQL Editor:
`supabase/migrations/20261022_ariae_tickets.sql`

ATENCIÓN: el SQL borra la tabla `tickets` actual. No lo ejecutes si necesitás conservar datos sin migrarlos antes.

## 2. Auth docente
En Authentication:
- Email habilitado.
- Desactivar "Allow new users to sign up".
- Crear manualmente los usuarios docentes.

## 3. Supabase CLI
Desde la raíz del repositorio:

```bash
npm install supabase --save-dev
npx supabase login
npx supabase init
npx supabase link --project-ref oolfimhadjkavwegdfiz
```

Agregar a `supabase/config.toml` el contenido de `supabase/CONFIG_SNIPPET.toml`.

Desplegar:

```bash
npx supabase functions deploy create-ticket
npx supabase functions deploy track-ticket
```

## 4. Frontend
Publicar en GitHub Pages:
- `index.html`
- `app.js`
- `config.js`
- `css/`
- `img/`

La publishable key puede estar en el frontend. Nunca pongas una `sb_secret_...` allí.

## 5. Prueba de punta a punta
1. Crear ticket como alumno.
2. Guardar el código `ARIAE-ENG-...`.
3. Rastrearlo.
4. Iniciar sesión en Panel Docente.
5. Cambiar estado y respuesta.
6. Volver a rastrear y verificar la actualización.
