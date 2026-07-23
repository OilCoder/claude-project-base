"""Tests del fixture — el gate `test` de la cadena (fase 2 / diagrama 3).

`test_restar` falla a propósito hasta que el agente implemente `restar()`
(la tarea estándar del e2e): el gate de tests fuerza el ciclo TDD.
"""

from calculadora import multiplicar, restar, sumar


def test_sumar():
    assert sumar(2, 3) == 5


def test_multiplicar():
    assert multiplicar(4, 5) == 20


def test_restar():
    assert restar(10, 4) == 6
