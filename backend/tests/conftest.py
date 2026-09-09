"""Tests never use the developer database or external email service."""
import os

os.environ["DEBUG"] = "false"
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "didaskey-test-only-secret-not-for-deployment"
os.environ["RESEND_API_KEY"] = ""
