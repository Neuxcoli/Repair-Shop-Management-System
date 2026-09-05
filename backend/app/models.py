import enum

from sqlalchemy import (
    Column, Integer, String, Text, Numeric, ForeignKey, DateTime, Enum, UniqueConstraint, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class PriorityLevel(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class OrderStatus(str, enum.Enum):
    requested = "requested"
    diagnosed = "diagnosed"
    approved = "approved"
    in_progress = "in_progress"
    on_hold = "on_hold"
    completed = "completed"
    invoiced = "invoiced"
    closed = "closed"
    cancelled = "cancelled"
    rejected = "rejected"


class TechnicianStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class InvoiceStatus(str, enum.Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"
    void = "void"


class Customer(Base):
    __tablename__ = "repairshop_customers"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(150), nullable=False)
    phone = Column(String(30))
    email = Column(String(150))
    address = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True))

    items = relationship("Item", back_populates="customer", passive_deletes=True)
    orders = relationship("RepairOrder", back_populates="customer")


class Technician(Base):
    __tablename__ = "repairshop_technicians"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    phone = Column(String(30))
    specialty = Column(String(50), default="General")
    status = Column(Enum(TechnicianStatus, name="technician_status"), default=TechnicianStatus.active)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True))

    orders = relationship("RepairOrder", back_populates="technician")
    user = relationship("User", back_populates="technician", uselist=False)

    @property
    def username(self) -> str | None:
        return self.user.username if self.user else None


class Item(Base):
    __tablename__ = "repairshop_items"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("repairshop_customers.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(200), nullable=False)
    identifier = Column(String(100))
    item_type = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True))

    customer = relationship("Customer", back_populates="items")


class Part(Base):
    __tablename__ = "repairshop_parts"

    id = Column(Integer, primary_key=True)
    sku = Column(String(50), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    qty_on_hand = Column(Integer, default=0)
    reorder_threshold = Column(Integer, default=5)
    unit_cost = Column(Numeric(12, 2), default=0)
    unit_price = Column(Numeric(12, 2), default=0)
    available_for_purchase = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True))


class RepairOrder(Base):
    __tablename__ = "repairshop_repair_orders"

    id = Column(Integer, primary_key=True)
    ro_number = Column(String(20), unique=True, nullable=False)
    tracking_token = Column(String(64), unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("repairshop_customers.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("repairshop_items.id"), nullable=False)
    technician_id = Column(Integer, ForeignKey("repairshop_technicians.id"), nullable=True)
    problem_description = Column(Text)
    service_location = Column(String(20), default="in_shop")
    service_address = Column(Text)
    inspection_notes = Column(Text)
    diagnosis = Column(Text)
    diagnosis_notes = Column(Text)
    labor_cost = Column(Numeric(12, 2), default=0)
    warranty_days = Column(Integer, default=0)
    warranty_notes = Column(Text)
    priority = Column(Enum(PriorityLevel, name="priority_level"), default=PriorityLevel.normal)
    status = Column(Enum(OrderStatus, name="order_status"), default=OrderStatus.requested)
    appointment_datetime = Column(DateTime(timezone=True))
    estimated_cost = Column(Numeric(12, 2))
    actual_cost = Column(Numeric(12, 2))
    released_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    customer = relationship("Customer", back_populates="orders")
    item = relationship("Item")
    technician = relationship("Technician", back_populates="orders")
    parts = relationship("RepairOrderPart", back_populates="repair_order", cascade="all, delete-orphan")
    status_history = relationship(
        "RepairOrderStatusHistory",
        back_populates="repair_order",
        order_by="RepairOrderStatusHistory.id",
        cascade="all, delete-orphan",
    )
    additional_cost_requests = relationship(
        "AdditionalCostRequest",
        back_populates="repair_order",
        order_by="AdditionalCostRequest.id",
        cascade="all, delete-orphan",
    )
    photos = relationship(
        "OrderPhoto",
        back_populates="repair_order",
        order_by="OrderPhoto.id",
        cascade="all, delete-orphan",
    )

    @property
    def parts_total(self) -> float:
        return float(sum((p.unit_price or 0) * (p.quantity or 0) for p in self.parts))

    @property
    def quote_total(self) -> float:
        return float(self.labor_cost or 0) + self.parts_total


class RepairOrderPart(Base):
    __tablename__ = "repairshop_repair_order_parts"

    id = Column(Integer, primary_key=True)
    repair_order_id = Column(Integer, ForeignKey("repairshop_repair_orders.id", ondelete="CASCADE"), nullable=False)
    part_id = Column(Integer, ForeignKey("repairshop_parts.id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)

    repair_order = relationship("RepairOrder", back_populates="parts")
    part = relationship("Part")


class RepairOrderStatusHistory(Base):
    __tablename__ = "repairshop_repair_order_status_history"

    id = Column(Integer, primary_key=True)
    repair_order_id = Column(Integer, ForeignKey("repairshop_repair_orders.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(Enum(OrderStatus, name="order_status"))
    to_status = Column(Enum(OrderStatus, name="order_status"), nullable=False)
    changed_by = Column(Integer, ForeignKey("repairshop_users.id", ondelete="SET NULL"))
    note = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    repair_order = relationship("RepairOrder", back_populates="status_history")


class Invoice(Base):
    __tablename__ = "repairshop_invoices"
    __table_args__ = (UniqueConstraint("repair_order_id", name="uniq_invoice_per_order"),)

    id = Column(Integer, primary_key=True)
    invoice_number = Column(String(20), unique=True, nullable=False)
    repair_order_id = Column(Integer, ForeignKey("repairshop_repair_orders.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("repairshop_customers.id"), nullable=False)
    total = Column(Numeric(12, 2), default=0)
    amount_paid = Column(Numeric(12, 2), default=0)
    status = Column(Enum(InvoiceStatus, name="invoice_status"), default=InvoiceStatus.unpaid)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))

    repair_order = relationship("RepairOrder")
    customer = relationship("Customer")


class Payment(Base):
    __tablename__ = "repairshop_payments"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("repairshop_invoices.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    method = Column(String(30), default="cash")
    reference = Column(String(100))
    paid_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True))

    invoice = relationship("Invoice")


class ShopSettings(Base):
    __tablename__ = "repairshop_shop_settings"

    id = Column(Integer, primary_key=True)
    shop_name = Column(String(200), default="Precision Repair")
    address = Column(Text, default="")
    phone = Column(String(30), default="")
    email = Column(String(150), default="")
    hours = Column(Text, default="")
    default_warranty_days = Column(Integer, default=30)
    currency_symbol = Column(String(10), default="₱")
    overdue_urgent_hours = Column(Integer, default=4)
    overdue_high_hours = Column(Integer, default=24)
    overdue_normal_hours = Column(Integer, default=72)
    overdue_low_hours = Column(Integer, default=168)
    low_stock_threshold = Column(Integer, default=5)
    diagnostic_fee = Column(Numeric(12, 2), default=500)
    labor_rate = Column(Numeric(12, 2), default=750)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base):
    __tablename__ = "repairshop_users"

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    customer_id = Column(Integer, ForeignKey("repairshop_customers.id", ondelete="CASCADE"))
    technician_id = Column(Integer, ForeignKey("repairshop_technicians.id", ondelete="CASCADE"))
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer")
    technician = relationship("Technician", back_populates="user")

    @property
    def full_name(self) -> str | None:
        if self.customer:
            return self.customer.full_name
        if self.technician:
            return self.technician.full_name
        return self.username


class ContactMessage(Base):
    __tablename__ = "repairshop_contact_messages"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(200), nullable=False)
    phone = Column(String(50))
    subject = Column(String(200))
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AdditionalCostRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    declined = "declined"


class AdditionalCostRequest(Base):
    __tablename__ = "repairshop_additional_cost_requests"

    id = Column(Integer, primary_key=True)
    repair_order_id = Column(Integer, ForeignKey("repairshop_repair_orders.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Text)
    status = Column(Enum(AdditionalCostRequestStatus, name="additional_cost_status"), default=AdditionalCostRequestStatus.pending)
    created_by = Column(Integer, ForeignKey("repairshop_users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    responded_at = Column(DateTime(timezone=True))

    repair_order = relationship("RepairOrder", back_populates="additional_cost_requests")


class OrderPhoto(Base):
    __tablename__ = "repairshop_order_photos"

    id = Column(Integer, primary_key=True)
    repair_order_id = Column(Integer, ForeignKey("repairshop_repair_orders.id", ondelete="CASCADE"), nullable=False)
    object_key = Column(String(500), nullable=False)
    caption = Column(String(200))
    uploaded_by = Column(Integer, ForeignKey("repairshop_users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    repair_order = relationship("RepairOrder", back_populates="photos")


class PartsOrderStatus(str, enum.Enum):
    pending = "pending"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class PartsOrder(Base):
    __tablename__ = "repairshop_parts_orders"

    id = Column(Integer, primary_key=True)
    order_number = Column(String(20), unique=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("repairshop_customers.id"), nullable=False)
    status = Column(Enum(PartsOrderStatus, name="parts_order_status"), default=PartsOrderStatus.pending)
    total = Column(Numeric(12, 2), default=0)
    notes = Column(Text)
    fulfilled_at = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer")
    items = relationship(
        "PartsOrderItem",
        back_populates="parts_order",
        order_by="PartsOrderItem.id",
        cascade="all, delete-orphan",
    )


class PartsOrderItem(Base):
    __tablename__ = "repairshop_parts_order_items"

    id = Column(Integer, primary_key=True)
    parts_order_id = Column(Integer, ForeignKey("repairshop_parts_orders.id", ondelete="CASCADE"), nullable=False)
    part_id = Column(Integer, ForeignKey("repairshop_parts.id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)

    parts_order = relationship("PartsOrder", back_populates="items")
    part = relationship("Part")
