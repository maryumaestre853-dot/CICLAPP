import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Lee DATABASE_URL desde .env. Si no existe, usa el mismo valor
# que tenías antes hardcodeado, para no romper tu setup actual.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:1234@localhost:5432/ciclapp",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def apply_schema_updates() -> None:
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE bicicletas ADD COLUMN IF NOT EXISTS marca VARCHAR"
        ))
        conn.execute(text(
            "ALTER TABLE bicicletas ADD COLUMN IF NOT EXISTS modelo VARCHAR"
        ))
        # Historial de rutas exclusivo por usuario
        conn.execute(text(
            "ALTER TABLE IF EXISTS app_routes "
            "ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_app_routes_usuario_id ON app_routes(usuario_id)"
        ))
        # Puntos y logros
        conn.execute(text(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puntos INTEGER DEFAULT 0"
        ))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
