"""Booking-slot configuration and availability checks.

Business model (demo scope):
  - Days open: Monday through Saturday
  - Hours: 08:00 - 18:00, in fixed 1-hour appointment slots (10 slots/day)
  - A booking occupies the single 1-hour slot it starts in.
Kept as plain data here so slot rules can change without touching the schema.
"""

from datetime import datetime, time, date, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from . import models

# Slots start on the hour between OPEN_HOUR and CLOSE_HOUR (exclusive of close).
OPEN_HOUR = 8
CLOSE_HOUR = 18
SLOT_MINUTES = 60
OPEN_WEEKDAYS = {0, 1, 2, 3, 4, 5}  # Monday(0) .. Saturday(5); Sunday(6) closed

# Shop local timezone (Philippines, UTC+8, no DST). Appointments are local.
LOCAL_TZ = timezone(timedelta(hours=8))
try:
    LOCAL_TZ = ZoneInfo("Asia/Manila")
except Exception:
    pass  # Fall back to fixed UTC+8 if the IANA tz database isn't available.


def slot_starts(date_value: date) -> list[datetime]:
    """All slot start datetimes (aware, local tz) for a given date."""
    starts = []
    for hour in range(OPEN_HOUR, CLOSE_HOUR):
        starts.append(datetime.combine(date_value, time(hour), tzinfo=LOCAL_TZ))
    return starts


def is_open_day(date_value: date) -> bool:
    return date_value.weekday() in OPEN_WEEKDAYS


def taken_slots(db: Session, date_value: date) -> set[datetime]:
    """Return the set of taken slot start datetimes (UTC) for a date.

    A repair order reserves whatever slot its appointment_datetime starts in.
    Orders that are cancelled or rejected no longer block the slot.
    """
    day_start_utc = datetime.combine(date_value, time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)
    day_end_utc = datetime.combine(date_value + timedelta(days=1), time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)

    rows = (
        db.query(models.RepairOrder.appointment_datetime)
        .filter(
            models.RepairOrder.appointment_datetime.isnot(None),
            models.RepairOrder.appointment_datetime >= day_start_utc,
            models.RepairOrder.appointment_datetime < day_end_utc,
            models.RepairOrder.deleted_at.is_(None),
            models.RepairOrder.status.notin_([models.OrderStatus.cancelled, models.OrderStatus.rejected]),
        )
        .all()
    )

    taken = set()
    for (when,) in rows:
        local = when.astimezone(LOCAL_TZ)
        # Normalize to the start of that hour to represent the slot.
        slot = local.replace(minute=0, second=0, microsecond=0)
        taken.add(slot.astimezone(timezone.utc))
    return taken


def validate_slot(db: Session, when: datetime) -> None:
    """Raise ValueError if the given appointment time is not a valid selectable slot."""
    local = when.astimezone(LOCAL_TZ)
    if local.weekday() not in OPEN_WEEKDAYS:
        raise ValueError("The shop is closed on that day.")
    if (local.hour < OPEN_HOUR or local.hour >= CLOSE_HOUR) or (local.minute or local.second or local.microsecond):
        raise ValueError("Please choose an on-the-hour slot within business hours.")
    if local.date() < date.today():
        raise ValueError("Please choose a future date.")
    slot_utc = local.replace(minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    if slot_utc in taken_slots(db, local.date()):
        raise ValueError("That time slot is already booked.")
