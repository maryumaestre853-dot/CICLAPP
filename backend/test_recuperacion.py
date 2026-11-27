"""
Prueba del flujo de recuperación de contraseña sin tocar tu PostgreSQL ni enviar correos reales.
Usa SQLite temporal y captura el correo en memoria.

Ejecutar desde la carpeta backend:
    pip install pytest
    pytest -q test_recuperacion.py
"""
import os
import re
import tempfile
from datetime import datetime, timedelta

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["SMTP_HOST"] = "smtp.test"
os.environ["SMTP_FROM"] = "ciclapp@test.dev"

import database  # noqa: E402
database.apply_schema_updates = lambda: None  # usa ALTER ... IF NOT EXISTS (solo PostgreSQL)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import smtplib  # noqa: E402
import main  # noqa: E402
from models import PasswordResetCode  # noqa: E402

client = TestClient(main.app)
BUZON = []


class FakeSMTP:
    def __init__(self, *a, **k): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def starttls(self): pass
    def login(self, *a): pass
    def send_message(self, msg): BUZON.append(msg)


@pytest.fixture(autouse=True)
def _smtp(monkeypatch):
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    BUZON.clear()


def registrar(email="Ana@Test.com", pw="Clave123!"):
    return client.post("/auth/registro", json={"nombre": "Ana", "email": email, "contrasena": pw})


def ultimo_codigo():
    return re.search(r"es: (\d{6})", BUZON[-1].get_content()).group(1)


def expirar_cooldown():
    db = database.SessionLocal()
    for r in db.query(PasswordResetCode).all():
        r.created_at = datetime.utcnow() - timedelta(minutes=5)
    db.commit(); db.close()


def test_flujo_completo():
    assert registrar().status_code == 200  # correo guardado en minúsculas

    r = client.post("/auth/forgot-password", json={"email": "ANA@test.com"})  # mayúsculas
    assert r.status_code == 200 and len(BUZON) == 1
    codigo = ultimo_codigo()

    assert client.post("/auth/verify-code", json={"email": "ana@test.com", "code": codigo}).status_code == 200

    # contraseña débil -> 400 y el código NO se consume
    r = client.post("/auth/reset-password", json={"email": "ana@test.com", "code": codigo, "new_password": "abc"})
    assert r.status_code == 400

    r = client.post("/auth/reset-password", json={"email": "ana@test.com", "code": codigo, "new_password": "Nueva456#"})
    assert r.status_code == 200

    # un solo uso
    r = client.post("/auth/reset-password", json={"email": "ana@test.com", "code": codigo, "new_password": "Otra789$x"})
    assert r.status_code == 400

    assert client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Clave123!"}).status_code == 401
    assert client.post("/auth/login", json={"email": "ana@test.com", "contrasena": "Nueva456#"}).status_code == 200


def test_correo_inexistente_responde_igual_y_no_envia():
    ok = client.post("/auth/forgot-password", json={"email": "nadie@test.com"})
    existente = client.post("/auth/forgot-password", json={"email": "ana@test.com"})
    assert ok.status_code == existente.status_code == 200
    assert ok.json() == existente.json()
    assert len(BUZON) == 1  # solo salió el de la cuenta real


def test_cooldown_no_reenvia_pero_responde_200():
    expirar_cooldown()
    client.post("/auth/forgot-password", json={"email": "ana@test.com"})
    n = len(BUZON)
    r = client.post("/auth/forgot-password", json={"email": "ana@test.com"})
    assert r.status_code == 200 and len(BUZON) == n


def test_intentos_agotados():
    expirar_cooldown()
    client.post("/auth/forgot-password", json={"email": "ana@test.com"})
    bueno = ultimo_codigo()
    malo = "000000" if bueno != "000000" else "111111"
    for _ in range(4):
        assert client.post("/auth/verify-code", json={"email": "ana@test.com", "code": malo}).status_code == 400
    assert client.post("/auth/verify-code", json={"email": "ana@test.com", "code": malo}).status_code == 429
    # ya bloqueado, ni el código correcto sirve
    assert client.post("/auth/verify-code", json={"email": "ana@test.com", "code": bueno}).status_code == 429


def test_codigo_vencido():
    expirar_cooldown()
    client.post("/auth/forgot-password", json={"email": "ana@test.com"})
    codigo = ultimo_codigo()
    db = database.SessionLocal()
    for r in db.query(PasswordResetCode).all():
        r.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit(); db.close()
    r = client.post("/auth/reset-password", json={"email": "ana@test.com", "code": codigo, "new_password": "Nueva456#"})
    assert r.status_code == 400 and "vencido" in r.json()["detail"]


def test_validaciones_y_mensajes_legibles():
    assert client.post("/auth/forgot-password", json={"email": "no-es-correo"}).status_code == 400
    assert client.post("/auth/verify-code", json={"email": "ana@test.com", "code": "12ab"}).status_code == 400
    r = client.post("/auth/forgot-password", json={})  # falta el campo -> 422 con detail de texto
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_smtp_sin_configurar_da_503_para_cualquier_correo(monkeypatch):
    monkeypatch.delenv("SMTP_HOST")
    for correo in ("ana@test.com", "nadie@test.com"):
        assert client.post("/auth/forgot-password", json={"email": correo}).status_code == 503
