"""
backend/auth.py

Autenticación JWT real para Ciclapp.

ANTES: main.py devolvía siempre el token fijo 'ciclapp-demo-token'
y ningún endpoint lo validaba — cualquiera podía leer/editar datos
de cualquier usuario mandando el usuario_id que quisiera.

AHORA: se emite un JWT firmado por usuario en login/registro, y
get_current_user() lo valida en cada endpoint protegido.

La función de hash de contraseñas (pbkdf2_sha256) que ya existía
en main.py se reutiliza tal cual — no se cambia el algoritmo para
no invalidar las contraseñas de los 7 usuarios ya registrados.
"""

import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario

# ─────────────────────────────────────────────────────────────
# Configuración
# ─────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "ciclapp_dev_secret_CAMBIAR_EN_PRODUCCION_2025",
)
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))

bearer_scheme = HTTPBearer()


# ─────────────────────────────────────────────────────────────
# Emitir token
# ─────────────────────────────────────────────────────────────

def crear_token(usuario_id: int, correo: str) -> str:
    """Genera un JWT firmado, válido por TOKEN_EXPIRE_DAYS días."""
    payload = {
        "sub": str(usuario_id),
        "correo": correo,
        "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─────────────────────────────────────────────────────────────
# Validar token — dependencia de FastAPI
# ─────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    Extrae y valida el JWT del header:
        Authorization: Bearer <token>
    Retorna el Usuario correspondiente o lanza 401.
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        usuario_id = payload.get("sub")
        if usuario_id is None:
            raise HTTPException(status_code=401, detail="Token inválido.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado. Inicia sesión de nuevo.")

    usuario = db.query(Usuario).filter(Usuario.id == int(usuario_id)).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado.")
    return usuario


def verificar_propietario(usuario_actual: Usuario, usuario_id_solicitado: int) -> None:
    """
    Lanza 403 si el usuario autenticado intenta acceder/modificar
    datos de OTRO usuario. Se usa en endpoints que reciben un
    usuario_id explícito (bicicletas, contactos, recorridos, etc.)
    """
    if usuario_actual.id != usuario_id_solicitado:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para acceder a los datos de otro usuario.",
        )
