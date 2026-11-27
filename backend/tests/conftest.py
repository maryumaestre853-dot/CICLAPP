"""Fixtures compartidas por todas las pruebas de tests/."""
import pytest
from fastapi.testclient import TestClient

import database
import main
from models import Base

PW_OK = "Clave123!"


@pytest.fixture(autouse=True)
def bd_limpia():
    """Cada prueba arranca con la base de datos vacía (aislamiento)."""
    Base.metadata.drop_all(bind=database.engine)
    Base.metadata.create_all(bind=database.engine)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def _crear_usuario(client, email, nombre="Ana"):
    r = client.post("/auth/registro", json={"nombre": nombre, "email": email, "contrasena": PW_OK})
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "id": data["usuario"]["id"],
        "email": email,
        "token": data["token"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture
def usuario(client):
    return _crear_usuario(client, "ana@test.com")


@pytest.fixture
def otro_usuario(client):
    return _crear_usuario(client, "luis@test.com", "Luis")


@pytest.fixture
def bici(client, usuario):
    r = client.post("/bicicletas", headers=usuario["headers"], json={
        "num_serie": "ABC1234567", "tipo": "Urbana", "color": "Rojo", "usuario_id": usuario["id"],
    })
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def recorrido(client, usuario, monkeypatch):
    """Recorrido GPS planificado. Se simula Google Routes (no se gasta cuota)."""
    async def falso_google(*a, **k):
        return {"distanceMeters": 2000, "durationSeconds": 600, "polyline": "xyz", "modoUsado": "BICYCLE"}
    monkeypatch.setattr(main, "calcular_ruta_bicicleta", falso_google)
    r = client.post("/recorridos-gps", headers=usuario["headers"], json={
        "origin": {"latitude": 4.60, "longitude": -74.08},
        "destination": {"latitude": 4.62, "longitude": -74.07},
        "origen_desc": "A", "destino_desc": "B",
    })
    assert r.status_code == 200, r.text
    return r.json()
