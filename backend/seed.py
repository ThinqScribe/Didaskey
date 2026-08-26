"""
Seed script — creates the admin user and 4 mock tutor profiles.

Usage (from the backend directory with the venv active):
    python seed.py

Safe to re-run — each insert is guarded by an existence check, so
running it twice will not duplicate records.

Admin credentials
-----------------
    email    : admin@didaskey.com
    password : Admin@Didaskey1

Tutor user credentials (for reference / future use)
-----------------------------------------------------
    All four tutor user accounts use the password: Tutor@Didaskey1
"""

import asyncio
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Bootstrap app settings & models ──────────────────────────────────────────
from app.core.config import settings
from app.core.security import hash_password
from app.models.marketplace import (
    DayOfWeek,
    Subject,
    TeachingMode,
    TutorAvailability,
    TutorProfile,
    TutorSubject,
    VerificationStatus,
)
from app.models.user import EducationLevel, User, UserRole

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
session_factory = async_sessionmaker(engine, expire_on_commit=False)

# ── Seed data ─────────────────────────────────────────────────────────────────

ADMIN = {
    "email": "admin@didaskey.com",
    "password": "Admin@Didaskey1",
    "first_name": "Didaskey",
    "last_name": "Admin",
    "role": UserRole.ADMIN,
}

TUTOR_PASSWORD = "Tutor@Didaskey1"

SUBJECTS_DATA = [
    {"name": "Mathematics",    "slug": "mathematics",    "icon_name": "calculator-outline"},
    {"name": "Physics",        "slug": "physics",        "icon_name": "planet-outline"},
    {"name": "Chemistry",      "slug": "chemistry",      "icon_name": "flask-outline"},
    {"name": "Biology",        "slug": "biology",        "icon_name": "leaf-outline"},
    {"name": "English",        "slug": "english",        "icon_name": "book-outline"},
    {"name": "Further Maths",  "slug": "further-maths",  "icon_name": "stats-chart-outline"},
    {"name": "Economics",      "slug": "economics",      "icon_name": "trending-up-outline"},
    {"name": "Literature",     "slug": "literature",     "icon_name": "library-outline"},
]

TUTORS_DATA = [
    {
        "user": {
            "email": "alex.morgan@didaskey.com",
            "first_name": "Alex",
            "last_name": "Morgan",
        },
        "profile": {
            "display_name": "Dr. Alex Morgan",
            "bio": (
                "Passionate physicist with over 8 years of teaching experience. "
                "I help students build conceptual clarity and confidence in Physics "
                "and Mathematics through structured problem-solving and real-world examples."
            ),
            "qualifications": "PhD in Physics, University of Lagos",
            "years_of_experience": 8,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Lagos",
            "location_state": "Lagos State",
            "rate_per_hour": Decimal("35.00"),
            "currency": "NGN",
            "total_hours_taught": 200,
            "average_rating": Decimal("4.90"),
            "review_count": 128,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Physics", "Mathematics"],
        "availability": [
            (DayOfWeek.MONDAY,    "09:00", "12:00"),
            (DayOfWeek.MONDAY,    "14:00", "17:00"),
            (DayOfWeek.WEDNESDAY, "09:00", "13:00"),
            (DayOfWeek.FRIDAY,    "10:00", "15:00"),
            (DayOfWeek.SATURDAY,  "08:00", "12:00"),
        ],
    },
    {
        "user": {
            "email": "linda.chen@didaskey.com",
            "first_name": "Linda",
            "last_name": "Chen",
        },
        "profile": {
            "display_name": "Prof. Linda Chen",
            "bio": (
                "Award-winning Mathematics educator with 12 years of experience "
                "teaching at both secondary and university levels. "
                "I specialise in making abstract concepts accessible and building "
                "strong exam technique for WAEC, JAMB, and A-Level students."
            ),
            "qualifications": "M.Sc. Applied Mathematics, University of Ibadan",
            "years_of_experience": 12,
            "teaching_mode": TeachingMode.ONLINE,
            "location_city": "Abuja",
            "location_state": "FCT",
            "rate_per_hour": Decimal("30.00"),
            "currency": "NGN",
            "total_hours_taught": 350,
            "average_rating": Decimal("4.80"),
            "review_count": 96,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Mathematics", "Further Maths", "Economics"],
        "availability": [
            (DayOfWeek.TUESDAY,   "08:00", "12:00"),
            (DayOfWeek.THURSDAY,  "08:00", "12:00"),
            (DayOfWeek.SATURDAY,  "09:00", "14:00"),
            (DayOfWeek.SUNDAY,    "10:00", "13:00"),
        ],
    },
    {
        "user": {
            "email": "david.smith@didaskey.com",
            "first_name": "David",
            "last_name": "Smith",
        },
        "profile": {
            "display_name": "Engr. David Smith",
            "bio": (
                "Chemical Engineer turned educator with a love for Chemistry and Biology. "
                "I combine industry experience with classroom teaching to show students "
                "how science works in the real world. "
                "Particular strength in practical exam preparation."
            ),
            "qualifications": "B.Eng. Chemical Engineering (First Class), Covenant University",
            "years_of_experience": 5,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Port Harcourt",
            "location_state": "Rivers State",
            "rate_per_hour": Decimal("40.00"),
            "currency": "NGN",
            "total_hours_taught": 120,
            "average_rating": Decimal("4.70"),
            "review_count": 84,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Chemistry", "Biology"],
        "availability": [
            (DayOfWeek.MONDAY,    "16:00", "20:00"),
            (DayOfWeek.WEDNESDAY, "16:00", "20:00"),
            (DayOfWeek.FRIDAY,    "16:00", "20:00"),
            (DayOfWeek.SATURDAY,  "09:00", "17:00"),
        ],
    },
    {
        "user": {
            "email": "fatima.noor@didaskey.com",
            "first_name": "Fatima",
            "last_name": "Noor",
        },
        "profile": {
            "display_name": "Dr. Fatima Noor",
            "bio": (
                "English Language and Literature specialist with a decade of experience "
                "preparing students for WAEC, NECO, and Cambridge IGCSE exams. "
                "I focus on strong essay writing, comprehension, and oral communication skills, "
                "helping students find their voice in the language."
            ),
            "qualifications": "PhD in English Literature, University of Benin",
            "years_of_experience": 10,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Benin City",
            "location_state": "Edo State",
            "rate_per_hour": Decimal("32.00"),
            "currency": "NGN",
            "total_hours_taught": 280,
            "average_rating": Decimal("4.90"),
            "review_count": 110,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["English", "Literature"],
        "availability": [
            (DayOfWeek.MONDAY,    "10:00", "14:00"),
            (DayOfWeek.TUESDAY,   "10:00", "14:00"),
            (DayOfWeek.THURSDAY,  "10:00", "14:00"),
            (DayOfWeek.SATURDAY,  "09:00", "13:00"),
        ],
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

from datetime import time as dt_time


def _parse_time(t: str) -> dt_time:
    """Convert 'HH:MM' string to a ``datetime.time`` object."""
    h, m = t.split(":")
    return dt_time(int(h), int(m))


async def _get_or_create_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role: UserRole,
) -> tuple[User, bool]:
    """Return (user, created). Does not commit."""
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        return existing, False

    user = User(
        email=email,
        hashed_password=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        role=role,
        is_active=True,
        is_verified=True,   # seed users skip email verification
    )
    db.add(user)
    await db.flush()
    return user, True


async def _get_or_create_subject(db: AsyncSession, name: str, slug: str, icon_name: str) -> Subject:
    """Return existing subject or create it. Does not commit."""
    existing = await db.scalar(select(Subject).where(Subject.slug == slug))
    if existing:
        return existing
    subject = Subject(name=name, slug=slug, icon_name=icon_name, is_active=True)
    db.add(subject)
    await db.flush()
    return subject


# ── Main seed function ────────────────────────────────────────────────────────


async def seed() -> None:
    async with session_factory() as db:

        # ── 1. Admin user ─────────────────────────────────────────────────────
        admin_user, created = await _get_or_create_user(
            db,
            email=ADMIN["email"],
            password=ADMIN["password"],
            first_name=ADMIN["first_name"],
            last_name=ADMIN["last_name"],
            role=ADMIN["role"],
        )
        if created:
            print(f"✓  Admin created  →  {admin_user.email}")
        else:
            print(f"–  Admin already exists  →  {admin_user.email}")

        # ── 2. Subject catalogue ──────────────────────────────────────────────
        subject_map: dict[str, Subject] = {}
        for s in SUBJECTS_DATA:
            subj = await _get_or_create_subject(db, s["name"], s["slug"], s["icon_name"])
            subject_map[s["name"]] = subj

        print(f"✓  {len(subject_map)} subjects ready in catalogue")

        # ── 3. Tutor profiles ─────────────────────────────────────────────────
        for td in TUTORS_DATA:
            u_data = td["user"]
            p_data = td["profile"]

            # 3a. Tutor user account
            tutor_user, u_created = await _get_or_create_user(
                db,
                email=u_data["email"],
                password=TUTOR_PASSWORD,
                first_name=u_data["first_name"],
                last_name=u_data["last_name"],
                role=UserRole.TUTOR,
            )

            # 3b. Tutor profile (skip if already exists)
            existing_profile = await db.scalar(
                select(TutorProfile).where(TutorProfile.user_id == tutor_user.id)
            )
            if existing_profile:
                print(f"–  Tutor already exists  →  {p_data['display_name']}")
                continue

            profile = TutorProfile(
                user_id=tutor_user.id,
                display_name=p_data["display_name"],
                bio=p_data["bio"],
                qualifications=p_data["qualifications"],
                years_of_experience=p_data["years_of_experience"],
                teaching_mode=p_data["teaching_mode"],
                location_city=p_data["location_city"],
                location_state=p_data["location_state"],
                rate_per_hour=p_data["rate_per_hour"],
                currency=p_data["currency"],
                total_hours_taught=p_data["total_hours_taught"],
                average_rating=p_data["average_rating"],
                review_count=p_data["review_count"],
                verification_status=p_data["verification_status"],
                is_active=True,
                # profile_image_url left null — admin uploads images separately
            )
            db.add(profile)
            await db.flush()

            # 3c. Subject assignments
            for subject_name in td["subjects"]:
                subject = subject_map.get(subject_name)
                if subject:
                    db.add(TutorSubject(tutor_id=profile.id, subject_id=subject.id))

            # 3d. Availability slots
            for day, start_str, end_str in td["availability"]:
                db.add(
                    TutorAvailability(
                        tutor_id=profile.id,
                        day_of_week=day,
                        start_time=_parse_time(start_str),
                        end_time=_parse_time(end_str),
                    )
                )

            await db.flush()
            print(f"✓  Tutor created  →  {p_data['display_name']}  ({', '.join(td['subjects'])})")

        # ── Commit everything ─────────────────────────────────────────────────
        await db.commit()
        print("\n✅  Seed complete.")
        print("\n── Admin credentials ────────────────────────────────")
        print(f"   email    : {ADMIN['email']}")
        print(f"   password : {ADMIN['password']}")
        print("\n── Tutor user password ──────────────────────────────")
        print(f"   password : {TUTOR_PASSWORD}")
        print("─────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    asyncio.run(seed())
