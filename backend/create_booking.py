#!/usr/bin/env python3
"""
Create a booking for Prof Peter Udo at 1:30 PM today
"""

import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid

async def create_booking():
    # Import after the event loop is set up to avoid issues
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select, update
    from app.core.config import settings
    from app.models.user import User, UserRole, EducationLevel
    from app.models.marketplace import TutorProfile
    from app.models.billing import Booking, Transaction, BookingStatus, TransactionStatus, SessionFormat
    from app.core.security import hash_password
    
    # Create engine and session
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        # 1. Create a verified student if doesn't exist
        student = await db.scalar(select(User).where(User.email == "student@example.com"))
        if not student:
            student = User(
                email="student@example.com",
                phone_number="+2348012345678",
                hashed_password=hash_password("Student123!"),
                role=UserRole.STUDENT,
                education_level=EducationLevel.SENIOR_SECONDARY,
                first_name="Test",
                last_name="Student",
                is_active=True,
                is_verified=True  # Skip email verification for testing
            )
            db.add(student)
            await db.flush()
        else:
            # Make sure they're verified
            student.is_verified = True
            await db.flush()
        
        # 2. Get Prof Peter Udo (tutor_id=12)
        tutor = await db.get(TutorProfile, 12)
        if not tutor:
            print("❌ Prof Peter Udo not found!")
            return
        
        print(f"✓ Found tutor: {tutor.display_name}")
        
        # 3. Calculate booking time: 1:30 PM today
        now = datetime.now(tz=timezone.utc)
        # Set to 1:30 PM today in UTC
        booking_time = now.replace(hour=13, minute=30, second=0, microsecond=0)
        
        # If 1:30 PM today has already passed, schedule for tomorrow
        if booking_time <= now:
            booking_time += timedelta(days=1)
        
        print(f"✓ Booking time: {booking_time}")
        
        # 4. Calculate amount (33 NGN per hour for 60 minutes)
        duration_minutes = 60
        rate_per_hour = tutor.rate_per_hour  # 33.00 NGN
        hours = Decimal(str(duration_minutes)) / Decimal("60")
        amount = (rate_per_hour * hours).quantize(Decimal("0.01"))
        
        print(f"✓ Amount: {amount} {tutor.currency}")
        
        # 5. Create booking
        booking = Booking(
            student_id=student.id,
            tutor_id=tutor.id,
            subject_id=8,  # Literature (Prof Peter Udo's subject)
            scheduled_at=booking_time,
            duration_minutes=duration_minutes,
            session_format=SessionFormat.ONLINE,
            student_note="Testing Agora video integration",
            amount=amount,
            currency=tutor.currency,
            status=BookingStatus.CONFIRMED,  # Skip payment for testing
        )
        db.add(booking)
        await db.flush()
        
        # 6. Create a completed transaction (skip Paystack for testing)
        reference = str(uuid.uuid4())
        transaction = Transaction(
            booking_id=booking.id,
            paystack_reference=reference,
            amount=amount,
            currency=tutor.currency,
            status=TransactionStatus.SUCCESSFUL,  # Mark as paid for testing
            paid_at=now
        )
        db.add(transaction)
        
        # 7. Commit everything
        await db.commit()
        
        print("🎯 SUCCESS!")
        print(f"📅 Booking ID: {booking.id}")
        print(f"👨‍🏫 Tutor: Prof Peter Udo")
        print(f"⏰ Time: {booking_time.strftime('%Y-%m-%d %H:%M')} UTC (1:30 PM)")
        print(f"📚 Subject: Literature")
        print(f"💰 Amount: {amount} {tutor.currency}")
        print(f"✅ Status: {booking.status}")
        print(f"💳 Transaction: {reference}")
        print(f"\n🔗 Join URL: http://localhost:3000/classroom/{booking.id}")

if __name__ == "__main__":
    asyncio.run(create_booking())