"""Tests del fixture — entran en juego como gate en la fase 2 (v1)."""

from calculadora import multiplicar, sumar


def test_sumar():
    assert sumar(2, 3) == 5


def test_multiplicar():
    assert multiplicar(4, 5) == 20
