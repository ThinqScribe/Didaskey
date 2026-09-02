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
    # ── Additional 10 Tutors ──────────────────────────────────────────────────
    {
        "user": {
            "email": "sarah.johnson@didaskey.com",
            "first_name": "Sarah",
            "last_name": "Johnson",
        },
        "profile": {
            "display_name": "Dr. Sarah Johnson",
            "bio": (
                "Experienced biochemist with a passion for making Biology come alive. "
                "I specialize in cell biology, genetics, and ecology, helping students "
                "understand complex biological processes through visual learning and "
                "practical experiments. Perfect for WAEC, NECO, and A-Level preparation."
            ),
            "qualifications": "PhD in Biochemistry, University of Nigeria Nsukka",
            "years_of_experience": 7,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Enugu",
            "location_state": "Enugu State",
            "rate_per_hour": Decimal("38.00"),
            "currency": "NGN",
            "total_hours_taught": 180,
            "average_rating": Decimal("4.85"),
            "review_count": 75,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Biology", "Chemistry"],
        "availability": [
            (DayOfWeek.TUESDAY,   "09:00", "13:00"),
            (DayOfWeek.THURSDAY,  "14:00", "18:00"),
            (DayOfWeek.SATURDAY,  "10:00", "16:00"),
            (DayOfWeek.SUNDAY,    "09:00", "12:00"),
        ],
    },
    {
        "user": {
            "email": "michael.adebayo@didaskey.com",
            "first_name": "Michael",
            "last_name": "Adebayo",
        },
        "profile": {
            "display_name": "Prof. Michael Adebayo",
            "bio": (
                "Mathematics genius with 15+ years of experience in pure and applied mathematics. "
                "I've helped over 500 students excel in JAMB, WAEC, and international exams. "
                "My teaching method focuses on understanding concepts deeply rather than memorization, "
                "making math enjoyable and less intimidating."
            ),
            "qualifications": "M.Sc. Pure Mathematics, University of Lagos, B.Sc. Mathematics (First Class)",
            "years_of_experience": 15,
            "teaching_mode": TeachingMode.ONLINE,
            "location_city": "Lagos",
            "location_state": "Lagos State",
            "rate_per_hour": Decimal("42.00"),
            "currency": "NGN",
            "total_hours_taught": 420,
            "average_rating": Decimal("4.95"),
            "review_count": 156,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Mathematics", "Further Maths", "Physics"],
        "availability": [
            (DayOfWeek.MONDAY,    "08:00", "12:00"),
            (DayOfWeek.WEDNESDAY, "08:00", "12:00"),
            (DayOfWeek.FRIDAY,    "08:00", "12:00"),
            (DayOfWeek.SATURDAY,  "09:00", "15:00"),
        ],
    },
    {
        "user": {
            "email": "grace.okafor@didaskey.com",
            "first_name": "Grace",
            "last_name": "Okafor",
        },
        "profile": {
            "display_name": "Mrs. Grace Okafor",
            "bio": (
                "Economics and Business Studies specialist with practical industry experience. "
                "Former bank executive turned educator, I bring real-world economics into the classroom. "
                "Excellent track record in helping students understand microeconomics, macroeconomics, "
                "and business concepts for WAEC, NECO, and JAMB."
            ),
            "qualifications": "MBA Finance, Lagos Business School; B.Sc. Economics, University of Ibadan",
            "years_of_experience": 9,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Ibadan",
            "location_state": "Oyo State",
            "rate_per_hour": Decimal("36.00"),
            "currency": "NGN",
            "total_hours_taught": 240,
            "average_rating": Decimal("4.80"),
            "review_count": 92,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Economics", "Mathematics"],
        "availability": [
            (DayOfWeek.TUESDAY,   "15:00", "19:00"),
            (DayOfWeek.THURSDAY,  "15:00", "19:00"),
            (DayOfWeek.SATURDAY,  "08:00", "14:00"),
            (DayOfWeek.SUNDAY,    "10:00", "14:00"),
        ],
    },
    {
        "user": {
            "email": "ibrahim.hassan@didaskey.com",
            "first_name": "Ibrahim",
            "last_name": "Hassan",
        },
        "profile": {
            "display_name": "Engr. Ibrahim Hassan",
            "bio": (
                "Electrical Engineering graduate with expertise in Physics and Mathematics. "
                "I specialize in making complex physics concepts simple through practical examples "
                "and problem-solving techniques. Excellent for students preparing for engineering "
                "entrance exams and A-Level physics."
            ),
            "qualifications": "B.Eng. Electrical Engineering, Ahmadu Bello University",
            "years_of_experience": 6,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Kaduna",
            "location_state": "Kaduna State",
            "rate_per_hour": Decimal("34.00"),
            "currency": "NGN",
            "total_hours_taught": 150,
            "average_rating": Decimal("4.75"),
            "review_count": 68,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Physics", "Mathematics", "Further Maths"],
        "availability": [
            (DayOfWeek.MONDAY,    "17:00", "21:00"),
            (DayOfWeek.WEDNESDAY, "17:00", "21:00"),
            (DayOfWeek.FRIDAY,    "17:00", "21:00"),
            (DayOfWeek.SATURDAY,  "09:00", "13:00"),
        ],
    },
    {
        "user": {
            "email": "elizabeth.okon@didaskey.com",
            "first_name": "Elizabeth",
            "last_name": "Okon",
        },
        "profile": {
            "display_name": "Dr. Elizabeth Okon",
            "bio": (
                "Organic Chemistry expert with research background in pharmaceutical chemistry. "
                "I make chemistry enjoyable by relating it to everyday life and career applications. "
                "Strong focus on practical chemistry, chemical equations, and exam techniques. "
                "Perfect for students aiming for medicine, pharmacy, or engineering."
            ),
            "qualifications": "PhD in Organic Chemistry, University of Uyo",
            "years_of_experience": 11,
            "teaching_mode": TeachingMode.ONLINE,
            "location_city": "Uyo",
            "location_state": "Akwa Ibom State",
            "rate_per_hour": Decimal("39.00"),
            "currency": "NGN",
            "total_hours_taught": 290,
            "average_rating": Decimal("4.88"),
            "review_count": 115,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Chemistry", "Biology"],
        "availability": [
            (DayOfWeek.MONDAY,    "10:00", "14:00"),
            (DayOfWeek.WEDNESDAY, "10:00", "14:00"),
            (DayOfWeek.FRIDAY,    "10:00", "14:00"),
            (DayOfWeek.SUNDAY,    "09:00", "13:00"),
        ],
    },
    {
        "user": {
            "email": "james.obiora@didaskey.com",
            "first_name": "James",
            "last_name": "Obiora",
        },
        "profile": {
            "display_name": "Mr. James Obiora",
            "bio": (
                "Passionate English Language teacher with expertise in creative writing and oral communication. "
                "Former journalist with 8 years of classroom experience. I help students develop "
                "strong writing skills, reading comprehension, and confidence in spoken English. "
                "Excellent for WAEC, NECO, and IELTS preparation."
            ),
            "qualifications": "M.A. English Language, University of Port Harcourt; B.A. Mass Communication",
            "years_of_experience": 8,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Port Harcourt",
            "location_state": "Rivers State",
            "rate_per_hour": Decimal("30.00"),
            "currency": "NGN",
            "total_hours_taught": 210,
            "average_rating": Decimal("4.70"),
            "review_count": 87,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["English", "Literature"],
        "availability": [
            (DayOfWeek.TUESDAY,   "14:00", "18:00"),
            (DayOfWeek.THURSDAY,  "14:00", "18:00"),
            (DayOfWeek.SATURDAY,  "10:00", "16:00"),
            (DayOfWeek.SUNDAY,    "11:00", "15:00"),
        ],
    },
    {
        "user": {
            "email": "aisha.musa@didaskey.com",
            "first_name": "Aisha",
            "last_name": "Musa",
        },
        "profile": {
            "display_name": "Dr. Aisha Musa",
            "bio": (
                "Mathematical physicist with expertise in advanced mathematics and theoretical physics. "
                "I specialize in Further Mathematics, preparing students for A-Level and university entrance exams. "
                "My approach combines rigorous mathematical proofs with intuitive understanding, "
                "making complex topics accessible to dedicated students."
            ),
            "qualifications": "PhD in Mathematical Physics, University of Jos; M.Sc. Applied Mathematics",
            "years_of_experience": 13,
            "teaching_mode": TeachingMode.ONLINE,
            "location_city": "Jos",
            "location_state": "Plateau State",
            "rate_per_hour": Decimal("45.00"),
            "currency": "NGN",
            "total_hours_taught": 320,
            "average_rating": Decimal("4.92"),
            "review_count": 134,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Further Maths", "Mathematics", "Physics"],
        "availability": [
            (DayOfWeek.MONDAY,    "09:00", "13:00"),
            (DayOfWeek.TUESDAY,   "09:00", "13:00"),
            (DayOfWeek.THURSDAY,  "09:00", "13:00"),
            (DayOfWeek.SATURDAY,  "08:00", "12:00"),
        ],
    },
    {
        "user": {
            "email": "peter.udo@didaskey.com",
            "first_name": "Peter",
            "last_name": "Udo",
        },
        "profile": {
            "display_name": "Prof. Peter Udo",
            "bio": (
                "Literature enthusiast and creative writing coach with over a decade of experience. "
                "Former newspaper editor turned academic, I help students develop critical thinking "
                "through literature analysis and creative expression. Specializing in African literature, "
                "poetry analysis, and essay writing for all examination levels."
            ),
            "qualifications": "M.Phil. Literature, University of Cape Coast; B.A. English Literature (First Class)",
            "years_of_experience": 14,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Calabar",
            "location_state": "Cross River State",
            "rate_per_hour": Decimal("33.00"),
            "currency": "NGN",
            "total_hours_taught": 310,
            "average_rating": Decimal("4.83"),
            "review_count": 98,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Literature", "English"],
        "availability": [
            (DayOfWeek.MONDAY,    "15:00", "19:00"),
            (DayOfWeek.WEDNESDAY, "15:00", "19:00"),
            (DayOfWeek.FRIDAY,    "15:00", "19:00"),
            (DayOfWeek.SUNDAY,    "09:00", "14:00"),
        ],
    },
    {
        "user": {
            "email": "kemi.adeoye@didaskey.com",
            "first_name": "Kemi",
            "last_name": "Adeoye",
        },
        "profile": {
            "display_name": "Mrs. Kemi Adeoye",
            "bio": (
                "Dedicated biology teacher with focus on human anatomy, genetics, and environmental science. "
                "I use interactive teaching methods including virtual lab simulations and real-life case studies. "
                "Strong track record in helping pre-med students excel in biology for JAMB and international exams. "
                "Patient and encouraging teaching style."
            ),
            "qualifications": "M.Sc. Microbiology, University of Ibadan; B.Sc. Biology Education",
            "years_of_experience": 9,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Abeokuta",
            "location_state": "Ogun State",
            "rate_per_hour": Decimal("35.00"),
            "currency": "NGN",
            "total_hours_taught": 195,
            "average_rating": Decimal("4.78"),
            "review_count": 81,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Biology", "Chemistry"],
        "availability": [
            (DayOfWeek.TUESDAY,   "10:00", "14:00"),
            (DayOfWeek.THURSDAY,  "10:00", "14:00"),
            (DayOfWeek.SATURDAY,  "09:00", "15:00"),
            (DayOfWeek.SUNDAY,    "10:00", "13:00"),
        ],
    },
    {
        "user": {
            "email": "daniel.ogunyemi@didaskey.com",
            "first_name": "Daniel",
            "last_name": "Ogunyemi",
        },
        "profile": {
            "display_name": "Engr. Daniel Ogunyemi",
            "bio": (
                "Mechanical Engineer with passion for physics and mathematics education. "
                "I bring engineering applications to physics concepts, making abstract ideas concrete "
                "and relevant. Excellent in mechanics, thermodynamics, and electromagnetism. "
                "Perfect for students interested in engineering careers and A-Level physics."
            ),
            "qualifications": "B.Eng. Mechanical Engineering (Second Class Upper), Obafemi Awolowo University",
            "years_of_experience": 5,
            "teaching_mode": TeachingMode.BOTH,
            "location_city": "Ile-Ife",
            "location_state": "Osun State",
            "rate_per_hour": Decimal("32.00"),
            "currency": "NGN",
            "total_hours_taught": 130,
            "average_rating": Decimal("4.73"),
            "review_count": 59,
            "verification_status": VerificationStatus.VERIFIED,
        },
        "subjects": ["Physics", "Mathematics"],
        "availability": [
            (DayOfWeek.MONDAY,    "16:00", "20:00"),
            (DayOfWeek.WEDNESDAY, "16:00", "20:00"),
            (DayOfWeek.SATURDAY,  "08:00", "14:00"),
            (DayOfWeek.SUNDAY,    "09:00", "12:00"),
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
