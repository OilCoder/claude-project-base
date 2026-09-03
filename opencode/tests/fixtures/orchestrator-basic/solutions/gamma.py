from lib.alpha import alpha
from lib.beta import beta


def gamma(value: int) -> int:
    """Compose alpha and beta: beta(alpha(value))."""
    return beta(alpha(value))
