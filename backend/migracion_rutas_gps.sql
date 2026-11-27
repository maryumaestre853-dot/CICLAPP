-- ════════════════════════════════════════════════════════════════
-- CICLAPP — Migración: sistema de rutas GPS
-- Pégalo en pgAdmin (Query Tool) conectado a tu BD "ciclapp"
--
-- ⚠️ NO borra ni modifica ninguna tabla existente.
-- Solo AGREGA 2 tablas nuevas. Tus 7 usuarios, bicicletas,
-- contactos y app_routes actuales quedan intactos.
--
-- NOTA: Si arrancas el backend con
--   Base.metadata.create_all(bind=engine)
-- (que ya se ejecuta automáticamente en main.py), estas tablas
-- se crean solas. Este script es por si prefieres crearlas
-- manualmente o inspeccionar la estructura antes.
-- ════════════════════════════════════════════════════════════════

-- Enum para el estado del recorrido
DO $$ BEGIN
    CREATE TYPE estado_recorrido_gps_enum AS ENUM ('planificada', 'activa', 'finalizada');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── TABLA: recorridos_gps ──────────────────────────────────────
-- Ruta planificada por Google Routes API + su ejecución real.

CREATE TABLE IF NOT EXISTS recorridos_gps (
    id                      SERIAL PRIMARY KEY,
    usuario_id              INTEGER NOT NULL REFERENCES usuarios(id),

    origen_desc             VARCHAR,
    origen_lat              FLOAT NOT NULL,
    origen_lon              FLOAT NOT NULL,

    destino_desc            VARCHAR,
    destino_lat             FLOAT NOT NULL,
    destino_lon             FLOAT NOT NULL,

    distancia_km            FLOAT,          -- planificada (Google)
    duracion_segundos       INTEGER,        -- estimada (Google)
    polyline                VARCHAR,        -- encoded polyline de Google Routes API
    travel_mode             VARCHAR DEFAULT 'BICYCLE',

    estado                  estado_recorrido_gps_enum NOT NULL DEFAULT 'planificada',

    distancia_real_km       FLOAT,          -- calculada desde puntos GPS reales
    duracion_real_segundos  INTEGER,        -- tiempo real transcurrido

    created_at              TIMESTAMP DEFAULT NOW(),
    started_at              TIMESTAMP,
    finished_at             TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_recorridos_gps_id         ON recorridos_gps(id);
CREATE INDEX IF NOT EXISTS ix_recorridos_gps_usuario     ON recorridos_gps(usuario_id);
CREATE INDEX IF NOT EXISTS ix_recorridos_gps_estado      ON recorridos_gps(estado);

-- ── TABLA: puntos_gps ──────────────────────────────────────────
-- Cada punto individual capturado por el GPS durante el recorrido real.

CREATE TABLE IF NOT EXISTS puntos_gps (
    id              SERIAL PRIMARY KEY,
    recorrido_id    INTEGER NOT NULL REFERENCES recorridos_gps(id) ON DELETE CASCADE,

    latitude        FLOAT NOT NULL,
    longitude       FLOAT NOT NULL,
    speed           FLOAT,      -- m/s, si expo-location lo reporta
    altitude        FLOAT,
    heading         FLOAT,      -- grados 0-360, si está disponible
    recorded_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_puntos_gps_id         ON puntos_gps(id);
CREATE INDEX IF NOT EXISTS ix_puntos_gps_recorrido  ON puntos_gps(recorrido_id);

-- ── VERIFICACIÓN ────────────────────────────────────────────────
-- Deberías ver tus 8 tablas anteriores + estas 2 nuevas = 10 total

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- ════════════════════════════════════════════════════════════════
-- Historial de rutas EXCLUSIVO por usuario
-- (main.py también lo aplica solo al arrancar; esto es por si lo prefieres manual)
-- Las filas antiguas de app_routes quedan con usuario_id NULL y no se muestran a nadie.
-- ════════════════════════════════════════════════════════════════
ALTER TABLE app_routes ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS ix_app_routes_usuario_id ON app_routes(usuario_id);
