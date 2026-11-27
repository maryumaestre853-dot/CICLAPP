"""
Configuración global de pytest para Ciclapp (se carga ANTES de importar main.py).
Redirige la base de datos a un SQLite temporal para no tocar PostgreSQL.
"""
import os
import tempfile

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ.setdefault("SMTP_HOST", "smtp.test")
os.environ.setdefault("SMTP_FROM", "ciclapp@test.dev")
os.environ.setdefault("JWT_SECRET_KEY", "clave-solo-para-pruebas")

import database  # noqa: E402
database.apply_schema_updates = lambda: None  # usa ALTER ... IF NOT EXISTS (solo PostgreSQL)
