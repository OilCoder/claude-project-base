"""Calculadora mínima — banco de pruebas del gate de lint.

Este módulo contiene violaciones deliberadas de ruff (import sin usar,
variable sin usar) para que el Stop hook tenga algo que bloquear.
"""

import os
import sys


def sumar(a: float, b: float) -> float:
    resultado_intermedio = a + b
    return a + b


def multiplicar(a: float, b: float) -> float:
    return a * b
