from __future__ import annotations

from app.models.property import Portfolio
from app.repositories.base import BaseRepo


class PortfolioRepo(BaseRepo[Portfolio]):
    model = Portfolio
