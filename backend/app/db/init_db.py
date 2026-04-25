from __future__ import annotations

import logging

from sqlmodel import Session, select

from app.core.security import get_password_hash
from app.db.session import get_engine
from app.models.user import Role, User

logger = logging.getLogger(__name__)


def init_db() -> None:
    """Create all tables and seed default admin user."""
    engine = get_engine()

    # Import all models so SQLModel metadata is populated before create_all
    import app.models  # noqa: F401

    from sqlmodel import SQLModel

    SQLModel.metadata.create_all(engine)

    # Seed default admin
    with Session(engine) as session:
        statement = select(User).where(User.username == "admin")
        admin_user = session.exec(statement).first()

        if admin_user is None:
            from app.config import settings

            admin_user = User(
                username=settings.ADMIN_USERNAME,
                email="admin@folio.local",
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                display_name="Administrator",
                role=Role.ADMIN,
                is_active=True,
            )
            session.add(admin_user)
            session.commit()
            logger.info("Default admin user created (username=%s)", settings.ADMIN_USERNAME)
        else:
            logger.info("Admin user already exists, skipping creation")
