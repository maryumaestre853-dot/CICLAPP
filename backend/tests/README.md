# Pruebas de Ciclapp (pytest)

| Archivo | Caja | Tipo | Nivel del plan |
|---|---|---|---|
| test_unitarias.py | Blanca (funciones aisladas) | Funcional | 1 Unitarias |
| test_caja_blanca.py | Blanca (ramas, caminos, bucles) | Funcional | 1-2 |
| test_sistema_api.py | Negra | Funcional | 2 Integración, 3 Sistema |
| test_seguridad.py | Negra | No funcional + funcional | 5 Seguridad |
| test_no_funcionales.py | Negra | No funcional (rendimiento, seguridad, fiabilidad, usabilidad, compatibilidad) | 5, 6, 7 |

Ejecutar todo:        pytest -v
Cobertura de ramas:   pytest --cov=. --cov-branch --cov-report=term-missing
Informe HTML:         pytest --html=informe.html --self-contained-html
Por marcador:         pytest -m caja_blanca | no_funcional | rendimiento | seguridad | critico
`xfail` = defecto conocido (falla a propósito hasta que se corrija).
